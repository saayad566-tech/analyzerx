/**
 * AnalyzerX precision-math layer.
 *
 * Financial figures — institutional flows (FII/DII), valuations, ratios and
 * percentage changes — must never be computed with IEEE-754 binary floats.
 * `0.1 + 0.2 !== 0.3`, and repeated `Number(x).toFixed(2)` rounds twice (once
 * in binary, once in decimal), so identical inputs can drift and negative
 * halves round the wrong way.
 *
 * This module performs exact fixed-point arithmetic on scaled `bigint` values:
 * every stored number is an integer multiple of 10^-12, so addition,
 * subtraction and multiplication are exact and division is rounded once,
 * half-away-from-zero, deterministically. Identical input datasets therefore
 * always yield identical results.
 *
 * Every edge case is handled explicitly instead of leaking `NaN`/`Infinity`
 * into the UI: `null`, `undefined`, `NaN`, `+/-Infinity`, empty strings,
 * non-numeric text, malformed decimals and divide-by-zero all resolve to
 * `null` (an explicit "no value" the callers already understand) rather than a
 * poisoned number.
 *
 * The module is intentionally dependency-free so it runs fully offline on
 * device with zero hidden infrastructure.
 */

/** Number of fractional decimal digits retained internally (10^-12 grid). */
export const PRECISION_DECIMALS = 12;

const SCALE = 10n ** BigInt(PRECISION_DECIMALS);
const SCALE_AS_NUMBER = 10 ** PRECISION_DECIMALS;

/**
 * A value scaled by 10^PRECISION_DECIMALS. e.g. `1.5` is stored as
 * `1500000000000n`. Kept as a branded primitive so callers can pass exact
 * values between operations without re-parsing.
 */
export type Scaled = bigint;

const NUMERIC_PATTERN = /^([+-]?)(\d*)(?:\.(\d*))?$/;
const EXPONENTIAL_PATTERN = /^([+-]?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/;

/**
 * Expand a JS exponential notation string (e.g. "1e-7", "1.5e+21") into a plain
 * decimal string so it can be parsed on the fixed-point grid. Returns `null` for
 * anything that is not a well-formed exponential.
 */
function expandExponential(text: string): string | null {
  const match = EXPONENTIAL_PATTERN.exec(text);
  if (!match) return null;
  const sign = match[1] === "-" ? "-" : "";
  const integerPart = match[2];
  const fractionPart = match[3] ?? "";
  const exponent = Number.parseInt(match[4], 10);
  const digits = integerPart + fractionPart;
  const pointPosition = integerPart.length + exponent;
  if (pointPosition <= 0) return `${sign}0.${"0".repeat(-pointPosition)}${digits}`;
  if (pointPosition >= digits.length) return `${sign}${digits}${"0".repeat(pointPosition - digits.length)}`;
  return `${sign}${digits.slice(0, pointPosition)}.${digits.slice(pointPosition)}`;
}

/** True only for a finite JS number (rejects NaN and +/-Infinity). */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Parse an unknown input into an exact scaled value.
 * Returns `null` for anything that is not a finite, well-formed number.
 */
export function parse(value: unknown): Scaled | null {
  if (typeof value === "bigint") return value * SCALE;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    // Parse the shortest round-trip decimal (`toString`) rather than
    // `toFixed(12)`: the latter would re-encode the double's own binary error
    // (e.g. 9999.05 -> 9999.049999999999) into the fixed-point grid.
    const text = value.toString();
    if (text.includes("e") || text.includes("E")) {
      const expanded = expandExponential(text);
      return expanded === null ? null : parse(expanded);
    }
    return parse(text);
  }
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/[,\s]/g, "").replace(/[₹$€£¥]/g, "");
  if (!cleaned) return null;
  const match = NUMERIC_PATTERN.exec(cleaned);
  if (!match) return null;
  const [, signToken, integerRaw, fractionRaw] = match;
  if (!integerRaw && !fractionRaw) return null; // "." or "+" with no digits
  const sign = signToken === "-" ? -1n : 1n;
  const integerPart = integerRaw && integerRaw.length ? integerRaw : "0";
  const fraction = ((fractionRaw ?? "") + "0".repeat(PRECISION_DECIMALS)).slice(0, PRECISION_DECIMALS);
  return sign * (BigInt(integerPart) * SCALE + BigInt(fraction || "0"));
}

/**
 * Integer division rounded half-away-from-zero. Throws only on a literal
 * divide-by-zero, which every public helper guards before calling.
 */
function divideRounded(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError("divideRounded: division by zero");
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder === 0n) return quotient;
  const negative = numerator < 0n !== denominator < 0n;
  const twiceAbsRemainder = (remainder < 0n ? -remainder : remainder) * 2n;
  const absDenominator = denominator < 0n ? -denominator : denominator;
  if (twiceAbsRemainder >= absDenominator) return quotient + (negative ? -1n : 1n);
  return quotient;
}

/** Convert an exact scaled value back to a JS number (for serialization/UI). */
export function toNumber(scaled: Scaled | null): number | null {
  if (scaled === null) return null;
  return Number(scaled) / SCALE_AS_NUMBER;
}

/** Render an exact scaled value as a fixed-precision decimal string. */
export function scaledToFixed(scaled: Scaled | null, decimals = 2): string | null {
  if (scaled === null) return null;
  const places = Math.max(0, Math.min(PRECISION_DECIMALS, Math.trunc(decimals)));
  const negative = scaled < 0n;
  const magnitude = negative ? -scaled : scaled;
  const integerPart = magnitude / SCALE;
  const fractionFull = (magnitude % SCALE).toString().padStart(PRECISION_DECIMALS, "0");
  const fraction = fractionFull.slice(0, places);
  const sign = negative && (integerPart !== 0n || /[1-9]/.test(fraction)) ? "-" : "";
  return places === 0 ? `${sign}${integerPart}` : `${sign}${integerPart}.${fraction}`;
}

// --- Scaled primitives (exact, null-propagating) -------------------------

export function addScaled(a: Scaled | null, b: Scaled | null): Scaled | null {
  if (a === null || b === null) return null;
  return a + b;
}

export function subtractScaled(a: Scaled | null, b: Scaled | null): Scaled | null {
  if (a === null || b === null) return null;
  return a - b;
}

export function multiplyScaled(a: Scaled | null, b: Scaled | null): Scaled | null {
  if (a === null || b === null) return null;
  return divideRounded(a * b, SCALE);
}

export function divideScaled(a: Scaled | null, b: Scaled | null): Scaled | null {
  if (a === null || b === null) return null;
  if (b === 0n) return null; // divide-by-zero resolves to "no value"
  return divideRounded(a * SCALE, b);
}

// --- Value-level helpers (accept unknown, return number | null) -----------

/** Safe numeric coercion. Returns `null` for anything not finite. */
export function num(value: unknown): number | null {
  return toNumber(parse(value));
}

/** Exact sum. Returns `null` if any input is invalid (fail-closed). */
export function sum(values: readonly unknown[]): number | null {
  let total: Scaled | null = 0n;
  for (const value of values) {
    total = addScaled(total, parse(value));
    if (total === null) return null;
  }
  return toNumber(total);
}

/** Exact sum, ignoring invalid entries. Returns `null` only if none are valid. */
export function sumValid(values: readonly unknown[]): number | null {
  let total: Scaled = 0n;
  let seen = false;
  for (const value of values) {
    const parsed = parse(value);
    if (parsed === null) continue;
    total += parsed;
    seen = true;
  }
  return seen ? toNumber(total) : null;
}

export function mean(values: readonly unknown[]): number | null {
  const valid = values.map(parse).filter((value): value is Scaled => value !== null);
  if (!valid.length) return null;
  const total = valid.reduce((acc, value) => acc + value, 0n);
  return toNumber(divideRounded(total, BigInt(valid.length)));
}

export function difference(a: unknown, b: unknown): number | null {
  return toNumber(subtractScaled(parse(a), parse(b)));
}

export function product(a: unknown, b: unknown): number | null {
  return toNumber(multiplyScaled(parse(a), parse(b)));
}

/** Division that yields `null` on a zero (or invalid) divisor. */
export function quotient(numerator: unknown, denominator: unknown): number | null {
  return toNumber(divideScaled(parse(numerator), parse(denominator)));
}

/** Alias of {@link quotient} for ratio semantics. */
export const ratio = quotient;

/**
 * Percentage change from `previous` to `next`: `(next - previous) / previous * 100`.
 * Returns `null` when `previous` is zero or either value is invalid.
 */
export function percentChange(previous: unknown, next: unknown): number | null {
  const from = parse(previous);
  const to = parse(next);
  if (from === null || to === null) return null;
  if (from === 0n) return null; // divide-by-zero guard
  return toNumber(divideRounded((to - from) * SCALE, from) * 100n);
}

/** Ratio expressed as a percentage: `part / whole * 100`. `null` on zero whole. */
export function percentOf(part: unknown, whole: unknown): number | null {
  const p = parse(part);
  const w = parse(whole);
  if (p === null || w === null || w === 0n) return null;
  return toNumber(divideRounded(p * SCALE, w) * 100n);
}

/** Round to `decimals` places (half-away-from-zero). `null` on invalid input. */
export function round(value: unknown, decimals = 2): number | null {
  const scaled = parse(value);
  if (scaled === null) return null;
  const places = Math.max(0, Math.min(PRECISION_DECIMALS, Math.trunc(decimals)));
  const step = 10n ** BigInt(PRECISION_DECIMALS - places);
  return toNumber(divideRounded(scaled, step) * step);
}

/** Format to a fixed-precision decimal string. `null` on invalid input. */
export function toFixedString(value: unknown, decimals = 2): string | null {
  const scaled = parse(value);
  if (scaled === null) return null;
  const places = Math.max(0, Math.min(PRECISION_DECIMALS, Math.trunc(decimals)));
  const step = 10n ** BigInt(PRECISION_DECIMALS - places);
  return scaledToFixed(divideRounded(scaled, step) * step, places);
}

/** -1 | 0 | 1 comparison; `null` if either side is invalid. */
export function compare(a: unknown, b: unknown): -1 | 0 | 1 | null {
  const left = parse(a);
  const right = parse(b);
  if (left === null || right === null) return null;
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/** Clamp into [min, max]; returns `null` on invalid input. */
export function clampNumber(value: unknown, min: number, max: number): number | null {
  const parsed = num(value);
  if (parsed === null) return null;
  if (min > max) return null;
  return Math.min(max, Math.max(min, parsed));
}

export function isZero(value: unknown): boolean {
  const scaled = parse(value);
  return scaled === 0n;
}

export function isPositive(value: unknown): boolean {
  const scaled = parse(value);
  return scaled !== null && scaled > 0n;
}

export function isNegative(value: unknown): boolean {
  const scaled = parse(value);
  return scaled !== null && scaled < 0n;
}

/** Sum a derived numeric field across records, skipping invalid entries. */
export function sumBy<T>(items: readonly T[], select: (item: T) => unknown): number | null {
  return sumValid(items.map(select));
}

/** Arithmetic mean of a derived numeric field, skipping invalid entries. */
export function meanBy<T>(items: readonly T[], select: (item: T) => unknown): number | null {
  return mean(items.map(select));
}
