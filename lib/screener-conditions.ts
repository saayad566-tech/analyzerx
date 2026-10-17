/**
 * User-defined screener conditions — the app layer over the condition engine.
 *
 * This file holds the named conditions a user saves, validates an expression before it is ever run,
 * and applies it across a universe of instruments. The language and the maths live in
 * `@analyzerx/quant-engine` (`conditions.ts`); this layer is only validation, orchestration and
 * persistence, so the language stays unit-testable without a device.
 *
 * Honesty rules it enforces:
 *  - An expression that does not parse is reported with its character position; it is never run.
 *  - An instrument whose series is too short is reported as skipped, not as a non-match.
 *  - A clause whose value cannot be computed marks the result `insufficientData`, so a screen can
 *    never pass on missing data.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  evaluateCondition,
  parseCondition,
  type ConditionParseError,
  type EvaluationResult,
} from "@/lib/quant/conditions";
import type { Candle } from "@/lib/quant/types";

const STORAGE_KEY = "market-event-intelligence.screener.conditions";
const MAX_SAVED = 25;

export type NamedCondition = {
  id: string;
  name: string;
  /** What the user typed. */
  expression: string;
  /** The canonical form the parser produced — what will actually be evaluated. */
  canonical: string;
  createdAt: string;
};

export type ConditionValidation =
  | { ok: true; canonical: string }
  | { ok: false; error: ConditionParseError };

export type ConditionInstrument = { symbol: string; market: string; candles: Candle[] };

export type ConditionHit = {
  symbol: string;
  market: string;
  passed: boolean;
  insufficientData: boolean;
  clauses: EvaluationResult["clauses"];
};

export type ScreenOutcome = {
  validation: ConditionValidation;
  /** Instruments whose series was long enough to evaluate. */
  evaluated: number;
  /** Instruments skipped, with the reason — never silently dropped. */
  skipped: { symbol: string; reason: string }[];
  /** Matches, or every evaluated instrument when `includeMisses` is set. */
  hits: ConditionHit[];
};

export type ScreenOptions = {
  /** Bars required before an instrument is evaluated. Default 2. */
  minBars?: number;
  /** Return non-matching instruments too, for a "show me why" view. */
  includeMisses?: boolean;
};

/** Validate an expression without running it. */
export function validateCondition(expression: string): ConditionValidation {
  const trimmed = expression.trim();
  if (!trimmed) return { ok: false, error: { message: "Enter a condition", position: 0 } };
  const parsed = parseCondition(trimmed);
  return parsed.ok ? { ok: true, canonical: parsed.canonical } : { ok: false, error: parsed.error };
}

/**
 * Run a condition across a universe. The caller supplies the instruments already scoped to one
 * market, which is what keeps a country filter honest — this function never mixes markets.
 */
export function screenUniverse(
  expression: string,
  instruments: ConditionInstrument[],
  options: ScreenOptions = {},
): ScreenOutcome {
  const validation = validateCondition(expression);
  if (!validation.ok) return { validation, evaluated: 0, skipped: [], hits: [] };

  const parsed = parseCondition(expression.trim());
  if (!parsed.ok) return { validation, evaluated: 0, skipped: [], hits: [] };

  const minBars = options.minBars ?? 2;
  const skipped: { symbol: string; reason: string }[] = [];
  const hits: ConditionHit[] = [];
  let evaluated = 0;

  for (const instrument of instruments) {
    const bars = instrument.candles?.length ?? 0;
    if (bars < minBars) {
      skipped.push({ symbol: instrument.symbol, reason: `only ${bars} bar(s); need ${minBars}` });
      continue;
    }
    evaluated += 1;
    const result = evaluateCondition(parsed.ast, instrument.candles);
    if (result.passed || options.includeMisses) {
      hits.push({
        symbol: instrument.symbol,
        market: instrument.market,
        passed: result.passed,
        insufficientData: result.insufficientData,
        clauses: result.clauses,
      });
    }
  }

  return { validation, evaluated, skipped, hits };
}

/**
 * Split pasted OHLCV into per-symbol blocks, so a multi-symbol universe can be screened offline.
 *
 * Convention: a line beginning with `#` names the block that follows, e.g.
 *
 *     # RELIANCE
 *     date,open,high,low,close,volume
 *     2026-01-02,2900,2950,2880,2940,1200000
 *
 * Text before the first `#` is kept as one unnamed series. Empty blocks are dropped.
 */
export function parseSymbolBlocks(text: string): { symbol: string; body: string }[] {
  const blocks: { symbol: string; body: string }[] = [];
  let symbol = "";
  let lines: string[] = [];
  const flush = () => {
    const body = lines.join("\n").trim();
    if (body) blocks.push({ symbol: symbol || `SERIES ${blocks.length + 1}`, body });
    lines = [];
  };
  for (const line of text.split(/\r?\n/)) {
    if (line.trimStart().startsWith("#")) {
      flush();
      symbol = line.trim().replace(/^#\s*/, "").trim();
      continue;
    }
    lines.push(line);
  }
  flush();
  return blocks;
}

/* ------------------------------------------------------------- persistence */

/** Parse a stored list defensively: a corrupt or older payload is dropped, never trusted. */
export function parseConditionList(raw: string | null): NamedCondition[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is NamedCondition =>
          Boolean(item) &&
          typeof item === "object" &&
          typeof (item as NamedCondition).id === "string" &&
          typeof (item as NamedCondition).name === "string" &&
          typeof (item as NamedCondition).expression === "string",
      )
      .slice(0, MAX_SAVED);
  } catch {
    return [];
  }
}

/** Add or replace a saved condition (matched by name), newest first, bounded. */
export function addNamedCondition(
  current: NamedCondition[],
  condition: NamedCondition,
): NamedCondition[] {
  return [condition, ...current.filter((item) => item.name !== condition.name)].slice(0, MAX_SAVED);
}

export async function loadNamedConditions(): Promise<NamedCondition[]> {
  try {
    return parseConditionList(await AsyncStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

export async function saveNamedConditions(list: NamedCondition[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_SAVED)));
  } catch {
    /* best effort — a failed save must not break the screen */
  }
}
