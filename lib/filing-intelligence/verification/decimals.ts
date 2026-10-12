/**
 * Decimal-safe arithmetic and rounding rules (Prompt 3, section 3).
 *
 * Binary floating point cannot represent 0.1 exactly, so a naive chain of
 * percentages and margins drifts: 1.1 + 2.2 is 3.3000000000000003. Financial
 * figures must not do that, and a report must not imply precision the source
 * does not support.
 *
 * The approach here is fixed-point: every value is held as an integer scaled by
 * a power of ten, arithmetic runs on the integers, and the result is converted
 * back with an explicit, declared rounding rule. The rule is named on every
 * result so a reader can reproduce the number.
 */

/** The rounding rule applied when a result cannot be represented exactly. */
export type RoundingRule =
  | "half_up" // conventional accounting rounding
  | "half_even" // banker's rounding, used where a bias would accumulate
  | "truncate" // toward zero
  | "exact"; // no rounding was necessary

export type DecimalValue = {
  /** The value scaled by 10^scale, held as an integer. */
  scaled: bigint;
  scale: number;
};

export const DEFAULT_SCALE = 6;

export function decimal(value: number | bigint | string, scale = DEFAULT_SCALE): DecimalValue {
  if (typeof value === "bigint") return { scaled: value * 10n ** BigInt(scale), scale };
  const text = String(value).trim();
  const match = text.match(/^(-?)(\d*)(?:\.(\d*))?$/);
  if (!match) throw new Error(`"${text}" is not a decimal number.`);
  const sign = match[1] === "-" ? -1n : 1n;
  const whole = match[2] || "0";
  const fraction = (match[3] ?? "").slice(0, scale).padEnd(scale, "0");
  return { scaled: sign * BigInt(`${whole}${fraction}`), scale };
}

/** Convert back to a JavaScript number at the requested precision. */
export function toNumber(value: DecimalValue, decimals = 2, rule: RoundingRule = "half_up"): { value: number; rule: RoundingRule } {
  const target = 10n ** BigInt(decimals);
  // When the stored scale is finer than the requested precision there is
  // nothing to round; when it is coarser, the value must be scaled up rather
  // than divided by a negative power, which would be a range error.
  if (value.scale <= decimals) {
    const scaledUp = value.scaled * 10n ** BigInt(decimals - value.scale);
    return { value: Number(scaledUp) / Number(target), rule: "exact" };
  }
  const divisor = 10n ** BigInt(value.scale - decimals);
  const quotient = value.scaled / divisor;
  const remainder = value.scaled % divisor;

  if (remainder === 0n) return { value: Number(quotient) / Number(target), rule: "exact" };

  const negative = value.scaled < 0n;
  const magnitude = remainder < 0n ? -remainder : remainder;
  const half = divisor / 2n;

  let rounded: bigint;
  switch (rule) {
    case "truncate":
      rounded = quotient;
      break;
    case "half_even": {
      const absQ = quotient < 0n ? -quotient : quotient;
      if (magnitude > half || (magnitude === half && absQ % 2n === 1n)) {
        rounded = quotient + (negative ? -1n : 1n);
      } else {
        rounded = quotient;
      }
      break;
    }
    case "half_up":
    default:
      rounded = magnitude >= half ? quotient + (negative ? -1n : 1n) : quotient;
      break;
  }
  return { value: Number(rounded) / Number(target), rule };
}

/* ------------------------------------------------------------------ *
 * Arithmetic
 * ------------------------------------------------------------------ */

function align(left: DecimalValue, right: DecimalValue): { a: bigint; b: bigint; scale: number } {
  const scale = Math.max(left.scale, right.scale);
  const a = left.scaled * 10n ** BigInt(scale - left.scale);
  const b = right.scaled * 10n ** BigInt(scale - right.scale);
  return { a, b, scale };
}

export function addDecimals(left: DecimalValue, right: DecimalValue): DecimalValue {
  const { a, b, scale } = align(left, right);
  return { scaled: a + b, scale };
}

export function subtractDecimals(left: DecimalValue, right: DecimalValue): DecimalValue {
  const { a, b, scale } = align(left, right);
  return { scaled: a - b, scale };
}

export function multiplyDecimals(left: DecimalValue, right: DecimalValue): DecimalValue {
  const scale = left.scale + right.scale;
  return { scaled: left.scaled * right.scaled, scale };
}

export function divideDecimals(left: DecimalValue, right: DecimalValue, resultScale = DEFAULT_SCALE): DecimalValue | null {
  if (right.scaled === 0n) return null;
  // Scale the numerator up so the integer division keeps precision.
  const scaled = (left.scaled * 10n ** BigInt(resultScale + right.scale)) / right.scaled;
  return { scaled, scale: resultScale + left.scale };
}

/* ------------------------------------------------------------------ *
 * Convenience wrappers
 * ------------------------------------------------------------------ */

/**
 * A percentage with a declared rounding rule. Returns null when the change is
 * undefined, so the caller must handle the undefined case explicitly rather
 * than receiving a plausible-looking number.
 */
export function safePercent(
  numerator: DecimalValue,
  denominator: DecimalValue,
  options: { decimals?: number; rule?: RoundingRule } = {},
): { percent: number | null; rule: RoundingRule; undefinedReason: string | null } {
  const decimals = options.decimals ?? 2;
  const rule = options.rule ?? "half_up";
  if (denominator.scaled === 0n) {
    return { percent: null, rule, undefinedReason: "The denominator is zero, so the percentage is undefined." };
  }
  const quotient = divideDecimals(numerator, denominator);
  if (!quotient) return { percent: null, rule, undefinedReason: "The division could not be performed." };
  const hundred = decimal(100, quotient.scale);
  const converted = toNumber(multiplyDecimals(quotient, hundred), decimals, rule);
  return { percent: converted.value, rule: converted.rule, undefinedReason: null };
}

/** Round a plain number with a declared rule, for callers not using decimals. */
export function roundWithRule(value: number, decimals = 2, rule: RoundingRule = "half_up"): { value: number; rule: RoundingRule } {
  return toNumber(decimal(value), decimals, rule);
}
