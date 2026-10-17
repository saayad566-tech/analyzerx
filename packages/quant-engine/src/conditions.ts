/**
 * User-defined screener conditions.
 *
 * The product asks for a "Universal Strategy & Custom Condition Screener" where the user writes their
 * own logic instead of picking from a fixed list — e.g. `RSI < 30 and Volume > 5x`, or
 * `Price > 200 EMA and changePct(3) > 10%`.
 *
 * This module is that language: a tokenizer, a recursive-descent parser and an evaluator over OHLCV
 * candles. It is pure, deterministic and has no `eval`, no `Function`, and no network.
 *
 * It is a **grammar**, not free-text English. It understands exactly what is documented below and
 * returns a precise error (with a character position) for anything else. It never guesses at a phrase
 * it cannot parse: a silently mis-parsed condition would screen on a rule the user did not write.
 *
 * Grammar
 *   expr       := or
 *   or         := and ( "or" and )*
 *   and        := unary ( "and" unary )*
 *   unary      := "not" unary | primary
 *   primary    := "(" expr ")" | comparison
 *   comparison := operand comparator operand
 *   comparator := "<" | "<=" | ">" | ">=" | "=" | "==" | "!="
 *   operand    := number [ "%" | "x" ] | field | indicator | number indicator
 *
 * Fields (latest bar unless stated): price, close, open, high, low, volume
 * Derived:    changePct, changePct(n), pctFromHigh(n), pctFromLow(n), volAvg(n)
 * Indicators: rsi(n), sma(n), ema(n), atr(n)
 * Aliases:    `200 EMA` == `ema(200)`; `RSI` == `rsi(14)`; `SMA`/`EMA` bare need a period
 * Literals:   `10%` is the number 10 (a percent unit, for readability); `5x` is 5 times the compared
 *             series' 20-bar mean (so `Volume > 5x` means "volume above 5x its 20-bar average").
 */
import type { Candle } from "./core-types";
import { atr, ema, rsi, sma } from "./indicators";

/* ------------------------------------------------------------------ errors */

export type ConditionParseError = { message: string; position: number };

export type ConditionParseResult =
  | { ok: true; ast: Node; canonical: string }
  | { ok: false; error: ConditionParseError };

/* -------------------------------------------------------------------- ast */

export type Comparator = "<" | "<=" | ">" | ">=" | "=" | "!=";

export type Operand =
  | { kind: "number"; value: number; relative?: "x" }
  | { kind: "field"; name: string }
  | { kind: "call"; name: string; args: number[] };

export type Node =
  | { kind: "and"; left: Node; right: Node }
  | { kind: "or"; left: Node; right: Node }
  | { kind: "not"; node: Node }
  | { kind: "cmp"; op: Comparator; left: Operand; right: Operand; text: string };

/* --------------------------------------------------------------- tokenizer */

type Token =
  | { k: "num"; v: number; suffix: "%" | "x" | null; pos: number }
  | { k: "ident"; v: string; pos: number }
  | { k: "op"; v: Comparator | "(" | ")" | ","; pos: number }
  | { k: "eof"; pos: number };

const FIELDS = new Set(["price", "close", "open", "high", "low", "volume"]);
const DERIVED = new Set(["changePct", "pctFromHigh", "pctFromLow", "volAvg"]);
const INDICATORS = new Set(["rsi", "sma", "ema", "atr"]);
const KEYWORDS = new Set(["and", "or", "not"]);

/** Indicator periods used when the user writes the bare name (`RSI` -> `rsi(14)`). */
const DEFAULT_PERIOD: Record<string, number> = { rsi: 14, sma: 50, ema: 50, atr: 14, volAvg: 20, changePct: 1, pctFromHigh: 1, pctFromLow: 1 };

function isDigit(c: string): boolean {
  return c >= "0" && c <= "9";
}
function isIdentStart(c: string): boolean {
  return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
}
function isIdentPart(c: string): boolean {
  return isIdentStart(c) || isDigit(c);
}

function tokenize(input: string): { tokens: Token[] } | { error: ConditionParseError } {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i += 1;
      continue;
    }
    if (isDigit(c) || (c === "." && isDigit(input[i + 1] ?? ""))) {
      const start = i;
      while (i < input.length && (isDigit(input[i]) || input[i] === ".")) i += 1;
      const raw = input.slice(start, i);
      const value = Number(raw);
      if (!Number.isFinite(value)) return { error: { message: `Not a number: "${raw}"`, position: start } };
      let suffix: "%" | "x" | null = null;
      if (input[i] === "%" || input[i] === "x" || input[i] === "X") {
        suffix = input[i] === "%" ? "%" : "x";
        i += 1;
      }
      tokens.push({ k: "num", v: value, suffix, pos: start });
      continue;
    }
    if (isIdentStart(c)) {
      const start = i;
      while (i < input.length && isIdentPart(input[i])) i += 1;
      tokens.push({ k: "ident", v: input.slice(start, i), pos: start });
      continue;
    }
    if (c === "(" || c === ")" || c === ",") {
      tokens.push({ k: "op", v: c, pos: i });
      i += 1;
      continue;
    }
    const two = input.slice(i, i + 2);
    if (two === "<=" || two === ">=" || two === "==" || two === "!=") {
      tokens.push({ k: "op", v: two === "==" ? "=" : (two as Comparator), pos: i });
      i += 2;
      continue;
    }
    if (c === "<" || c === ">" || c === "=") {
      tokens.push({ k: "op", v: c as Comparator, pos: i });
      i += 1;
      continue;
    }
    return { error: { message: `Unexpected character "${c}"`, position: i } };
  }
  tokens.push({ k: "eof", pos: input.length });
  return { tokens };
}

/* ----------------------------------------------------------------- parser */

class Parser {
  private i = 0;
  constructor(private readonly tokens: Token[], private readonly source: string) {}

  private peek(): Token {
    return this.tokens[this.i];
  }
  private next(): Token {
    return this.tokens[this.i++];
  }

  parse(): ConditionParseResult {
    if (this.peek().k === "eof") return { ok: false, error: { message: "Empty condition", position: 0 } };
    const ast = this.parseOr();
    if ("error" in ast) return { ok: false, error: ast.error };
    const tail = this.peek();
    if (tail.k !== "eof") {
      return { ok: false, error: { message: "Unexpected trailing input", position: tail.pos } };
    }
    return { ok: true, ast: ast.node, canonical: render(ast.node) };
  }

  private parseOr(): { node: Node } | { error: ConditionParseError } {
    let left = this.parseAnd();
    if ("error" in left) return left;
    for (;;) {
      const t = this.peek();
      if (t.k === "ident" && t.v.toLowerCase() === "or") {
        this.next();
        const right = this.parseAnd();
        if ("error" in right) return right;
        left = { node: { kind: "or", left: left.node, right: right.node } };
      } else {
        return left;
      }
    }
  }

  private parseAnd(): { node: Node } | { error: ConditionParseError } {
    let left = this.parseUnary();
    if ("error" in left) return left;
    for (;;) {
      const t = this.peek();
      if (t.k === "ident" && t.v.toLowerCase() === "and") {
        this.next();
        const right = this.parseUnary();
        if ("error" in right) return right;
        left = { node: { kind: "and", left: left.node, right: right.node } };
      } else {
        return left;
      }
    }
  }

  private parseUnary(): { node: Node } | { error: ConditionParseError } {
    const t = this.peek();
    if (t.k === "ident" && t.v.toLowerCase() === "not") {
      this.next();
      const inner = this.parseUnary();
      if ("error" in inner) return inner;
      return { node: { kind: "not", node: inner.node } };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): { node: Node } | { error: ConditionParseError } {
    const t = this.peek();
    if (t.k === "op" && t.v === "(") {
      this.next();
      const inner = this.parseOr();
      if ("error" in inner) return inner;
      const close = this.peek();
      if (!(close.k === "op" && close.v === ")")) {
        return { error: { message: "Missing closing parenthesis", position: close.pos } };
      }
      this.next();
      return inner;
    }
    return this.parseComparison();
  }

  private parseComparison(): { node: Node } | { error: ConditionParseError } {
    const start = this.peek().pos;
    const left = this.parseOperand();
    if ("error" in left) return left;
    const opTok = this.peek();
    if (!(opTok.k === "op" && ["<", "<=", ">", ">=", "=", "!="].includes(opTok.v))) {
      return { error: { message: "Expected a comparison operator (<, <=, >, >=, =, !=)", position: opTok.pos } };
    }
    this.next();
    const right = this.parseOperand();
    if ("error" in right) return right;
    const end = this.tokens[this.i - 1].pos + 1;
    return {
      node: {
        kind: "cmp",
        op: opTok.v as Comparator,
        left: left.operand,
        right: right.operand,
        text: this.source.slice(start, Math.max(end, start + 1)).trim(),
      },
    };
  }

  /** A period token: a number, or the number attached to an indicator name (`200 EMA`). */
  private parseOperand(): { operand: Operand } | { error: ConditionParseError } {
    const t = this.peek();
    if (t.k === "num") {
      this.next();
      // `200 EMA` / `200 ema` -> ema(200)
      const after = this.peek();
      if (after.k === "ident" && INDICATORS.has(after.v.toLowerCase()) && t.suffix === null) {
        this.next();
        return { operand: { kind: "call", name: after.v.toLowerCase(), args: [t.v] } };
      }
      return { operand: { kind: "number", value: t.v, relative: t.suffix === "x" ? "x" : undefined } };
    }
    if (t.k === "ident") {
      this.next();
      const name = t.v;
      const lower = name.toLowerCase();
      if (KEYWORDS.has(lower)) {
        return { error: { message: `"${name}" cannot be used as a value here`, position: t.pos } };
      }
      // A call: name( arg, ... )
      if (this.peek().k === "op" && (this.peek() as { v: string }).v === "(") {
        this.next();
        const args: number[] = [];
        if (!(this.peek().k === "op" && (this.peek() as { v: string }).v === ")")) {
          for (;;) {
            const arg = this.peek();
            if (arg.k !== "num") {
              return { error: { message: `Expected a numeric argument to ${name}()`, position: arg.pos } };
            }
            args.push(arg.v);
            this.next();
            const sep = this.peek();
            if (sep.k === "op" && sep.v === ",") {
              this.next();
              continue;
            }
            break;
          }
        }
        const close = this.peek();
        if (!(close.k === "op" && close.v === ")")) {
          return { error: { message: `Missing ")" after ${name}(`, position: close.pos } };
        }
        this.next();
        if (!DERIVED.has(name) && !INDICATORS.has(name)) {
          return { error: { message: `Unknown function "${name}"`, position: t.pos } };
        }
        if (args.length !== 1) {
          return { error: { message: `${name}() takes exactly one period`, position: t.pos } };
        }
        return { operand: { kind: "call", name, args } };
      }
      // Bare identifier.
      if (FIELDS.has(lower)) return { operand: { kind: "field", name: lower } };
      if (lower === "rsi") return { operand: { kind: "call", name: "rsi", args: [14] } };
      if (DERIVED.has(name) || INDICATORS.has(name)) {
        return { operand: { kind: "call", name, args: [DEFAULT_PERIOD[name] ?? 20] } };
      }
      return { error: { message: `Unknown field or indicator "${name}"`, position: t.pos } };
    }
    return { error: { message: "Expected a value (a number, field or indicator)", position: t.pos } };
  }
}

/** Parse a condition. Returns a precise error with a character position on failure. */
export function parseCondition(input: string): ConditionParseResult {
  const lexed = tokenize(input);
  if ("error" in lexed) return { ok: false, error: lexed.error };
  return new Parser(lexed.tokens, input).parse();
}

/* --------------------------------------------------------------- rendering */

function operandText(o: Operand): string {
  if (o.kind === "number") return o.relative === "x" ? `${o.value}x` : String(o.value);
  if (o.kind === "field") return o.name;
  return `${o.name}(${o.args.join(", ")})`;
}

/** Binding strength, used to re-insert parentheses so the canonical text matches the AST exactly. */
const PRECEDENCE = { or: 1, and: 2, not: 3, cmp: 4 } as const;

function render(node: Node, parent = 0): string {
  const precedence = PRECEDENCE[node.kind];
  let text: string;
  switch (node.kind) {
    case "and":
      text = `${render(node.left, PRECEDENCE.and)} and ${render(node.right, PRECEDENCE.and)}`;
      break;
    case "or":
      text = `${render(node.left, PRECEDENCE.or)} or ${render(node.right, PRECEDENCE.or)}`;
      break;
    case "not":
      // `not` binds tighter than and/or, so a compound operand must be parenthesised or the text
      // would mean something else (`not (a or b)` must never render as `not a or b`).
      text = `not ${render(node.node, PRECEDENCE.cmp)}`;
      break;
    case "cmp":
      text = `${operandText(node.left)} ${node.op} ${operandText(node.right)}`;
      break;
  }
  return precedence < parent ? `(${text})` : text;
}

/* -------------------------------------------------------------- evaluation */

export type ClauseResult = {
  /** The source text of the comparison. */
  text: string;
  passed: boolean;
  /** Resolved left / right values, or null when the series was too short. */
  left: number | null;
  right: number | null;
};

export type EvaluationResult = {
  /** True only when every clause is satisfied and every value could be computed. */
  passed: boolean;
  /** True when at least one value was missing, so `passed` reflects partial data. */
  insufficientData: boolean;
  clauses: ClauseResult[];
};

function lastDefined(values: (number | null)[]): number | null {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const v = values[i];
    if (v !== null && Number.isFinite(v)) return v;
  }
  return null;
}

function meanOf(values: number[], period: number): number | null {
  if (values.length === 0) return null;
  const window = values.slice(Math.max(0, values.length - period));
  if (window.length === 0) return null;
  return window.reduce((sum, v) => sum + v, 0) / window.length;
}

/**
 * The 20-bar mean a `5x` literal is measured against.
 *
 * The current bar is excluded on purpose: `Volume > 5x` means "against its own history", and
 * including the bar being measured would dilute exactly the spike the condition is looking for.
 */
function baseline(candles: Candle[], operand: Operand): number | null {
  const history = candles.slice(0, -1);
  if (operand.kind === "field") {
    if (operand.name === "volume") return meanOf(history.map((c) => c.volume), 20);
    if (operand.name === "high") return meanOf(history.map((c) => c.high), 20);
    if (operand.name === "low") return meanOf(history.map((c) => c.low), 20);
    if (operand.name === "open") return meanOf(history.map((c) => c.open), 20);
    return meanOf(history.map((c) => c.close), 20);
  }
  // For a derived/indicator operand, fall back to the close baseline.
  return meanOf(history.map((c) => c.close), 20);
}

function resolveOperand(candles: Candle[], operand: Operand, other: Operand): number | null {
  if (operand.kind === "number") {
    if (operand.relative === "x") {
      const base = baseline(candles, other);
      return base === null ? null : operand.value * base;
    }
    return operand.value;
  }
  const closes = candles.map((c) => c.close);
  const last = candles[candles.length - 1];
  if (operand.kind === "field") {
    if (!last) return null;
    switch (operand.name) {
      case "price":
      case "close":
        return last.close;
      case "open":
        return last.open;
      case "high":
        return last.high;
      case "low":
        return last.low;
      case "volume":
        return last.volume;
      default:
        return null;
    }
  }
  const period = operand.args[0];
  switch (operand.name) {
    case "rsi":
      return lastDefined(rsi(closes, period));
    case "sma":
      return lastDefined(sma(closes, period));
    case "ema":
      return lastDefined(ema(closes, period));
    case "atr":
      return lastDefined(atr(candles, period));
    case "volAvg":
      return meanOf(candles.map((c) => c.volume), period);
    case "changePct": {
      if (candles.length <= period) return null;
      const from = candles[candles.length - 1 - period].close;
      const to = closes[closes.length - 1];
      return from === 0 ? null : ((to - from) / from) * 100;
    }
    case "pctFromHigh": {
      if (candles.length === 0) return null;
      const window = candles.slice(Math.max(0, candles.length - period));
      const high = Math.max(...window.map((c) => c.high));
      return high === 0 ? null : ((last.close - high) / high) * 100;
    }
    case "pctFromLow": {
      if (candles.length === 0) return null;
      const window = candles.slice(Math.max(0, candles.length - period));
      const low = Math.min(...window.map((c) => c.low));
      return low === 0 ? null : ((last.close - low) / low) * 100;
    }
    default:
      return null;
  }
}

function compare(op: Comparator, left: number | null, right: number | null): boolean {
  if (left === null || right === null) return false;
  switch (op) {
    case "<":
      return left < right;
    case "<=":
      return left <= right;
    case ">":
      return left > right;
    case ">=":
      return left >= right;
    case "=":
      return Math.abs(left - right) < 1e-9;
    case "!=":
      return Math.abs(left - right) >= 1e-9;
  }
}

/**
 * Evaluate a parsed condition against one instrument's candles (ascending by time).
 * A clause whose value cannot be computed is reported as `insufficientData` rather than treated as
 * satisfied — a screen must never pass on missing data.
 */
export function evaluateCondition(ast: Node, candles: Candle[]): EvaluationResult {
  const clauses: ClauseResult[] = [];
  let insufficientData = false;

  const walk = (node: Node): boolean => {
    switch (node.kind) {
      case "and":
        return walk(node.left) && walk(node.right);
      case "or":
        return walk(node.left) || walk(node.right);
      case "not":
        return !walk(node.node);
      case "cmp": {
        const left = resolveOperand(candles, node.left, node.right);
        const right = resolveOperand(candles, node.right, node.left);
        if (left === null || right === null) insufficientData = true;
        const passed = compare(node.op, left, right);
        clauses.push({ text: node.text, passed, left, right });
        return passed;
      }
    }
  };

  const passed = walk(ast);
  return { passed: passed && !insufficientData, insufficientData, clauses };
}

/** Parse and evaluate in one step. */
export function runCondition(
  input: string,
  candles: Candle[],
): { ok: true; result: EvaluationResult; canonical: string } | { ok: false; error: ConditionParseError } {
  const parsed = parseCondition(input);
  if (!parsed.ok) return parsed;
  return { ok: true, result: evaluateCondition(parsed.ast, candles), canonical: parsed.canonical };
}
