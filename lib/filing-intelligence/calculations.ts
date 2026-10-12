/**
 * Deterministic calculation engine (PRD sec 9).
 *
 * PRD 9 requires arithmetic, percentage changes, margins, ratios and period
 * comparisons to be computed by deterministic code whenever inputs are
 * available - never by the model. It also requires a zero or negative
 * denominator to be handled explicitly so no misleading or infinite
 * percentage is produced, reported precision to be preserved, and units to be
 * normalized only while retaining the original.
 *
 * Every function returns a Calculation carrying its formula, inputs, unit,
 * status and a plain-language note, so a claim built on it can be audited and
 * re-run.
 */

import type { Calculation } from "./types";

/** Round to a fixed number of decimals without implying false precision. */
export function roundTo(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Percentage change from prior to current.
 *
 * PRD 9: a zero or negative denominator must be handled explicitly rather than
 * yielding Infinity, NaN or a sign-flipped number that misleads. We use the
 * absolute prior value in the denominator (so the direction of the change is
 * read from the numerator) and refuse to report a figure when the prior value
 * is zero, because no percentage change is defined against zero.
 */
export function percentageChange(
  current: number | null,
  prior: number | null,
  options: { decimals?: number } = {},
): Calculation {
  const decimals = options.decimals ?? 2;
  const base: Omit<Calculation, "result" | "status" | "note"> = {
    method: "percentage_change",
    inputs: ["current", "prior"],
    formula: "((current - prior) / abs(prior)) * 100",
    unit: "%",
  };

  if (current === null || prior === null) {
    return { ...base, result: null, status: "not_applicable", note: "One or both values are unavailable." };
  }
  if (prior === 0) {
    return {
      ...base,
      result: null,
      status: "not_applicable",
      note: "Prior value is zero, so a percentage change is undefined. Report the absolute change instead.",
    };
  }
  if (prior < 0) {
    const result = roundTo(((current - prior) / Math.abs(prior)) * 100, decimals);
    return {
      ...base,
      result,
      status: "passed",
      note: "Prior value is negative; the sign of the change is read from the numerator, not the denominator.",
    };
  }
  return {
    ...base,
    result: roundTo(((current - prior) / Math.abs(prior)) * 100, decimals),
    status: "passed",
    note: null,
  };
}

/** Absolute change, always defined when both values exist. */
export function absoluteChange(current: number | null, prior: number | null, unit = ""): Calculation {
  const base = {
    method: "absolute_change",
    inputs: ["current", "prior"],
    formula: "current - prior",
    unit,
  };
  if (current === null || prior === null) {
    return { ...base, result: null, status: "not_applicable", note: "One or both values are unavailable." };
  }
  return { ...base, result: roundTo(current - prior, 2), status: "passed", note: null };
}

/**
 * A margin or ratio expressed as a percentage of a base.
 * Guards a zero or non-positive base the same way percentage change does.
 */
export function ratio(numerator: number | null, denominator: number | null, options: { decimals?: number } = {}): Calculation {
  const decimals = options.decimals ?? 2;
  const base = {
    method: "ratio",
    inputs: ["numerator", "denominator"],
    formula: "(numerator / denominator) * 100",
    unit: "%",
  };
  if (numerator === null || denominator === null) {
    return { ...base, result: null, status: "not_applicable", note: "One or both values are unavailable." };
  }
  if (denominator <= 0) {
    return {
      ...base,
      result: null,
      status: "not_applicable",
      note: "Base is zero or negative, so the ratio is not meaningful.",
    };
  }
  return { ...base, result: roundTo((numerator / denominator) * 100, decimals), status: "passed", note: null };
}

/** A plain multiple, e.g. current ratio = current assets / current liabilities. */
export function multiple(numerator: number | null, denominator: number | null, options: { decimals?: number } = {}): Calculation {
  const decimals = options.decimals ?? 2;
  const base = {
    method: "multiple",
    inputs: ["numerator", "denominator"],
    formula: "numerator / denominator",
    unit: "x",
  };
  if (numerator === null || denominator === null) {
    return { ...base, result: null, status: "not_applicable", note: "One or both values are unavailable." };
  }
  if (denominator === 0) {
    return { ...base, result: null, status: "not_applicable", note: "Denominator is zero, so the multiple is undefined." };
  }
  return { ...base, result: roundTo(numerator / denominator, decimals), status: "passed", note: null };
}

/**
 * Period comparison. PRD 9 forbids comparing incompatible accounting periods
 * or bases without a clear caveat, so the caveat is returned as the note.
 */
export function comparePeriods(
  current: number | null,
  prior: number | null,
  options: { currentPeriod: string; priorPeriod: string; currentBasis: string; priorBasis: string; unit?: string },
): Calculation {
  const percent = percentageChange(current, prior);
  const notes: string[] = [];
  if (percent.note) notes.push(percent.note);
  if (options.currentPeriod !== options.priorPeriod) {
    notes.push(`Comparing ${options.currentPeriod} with ${options.priorPeriod}; confirm the periods are comparable.`);
  }
  if (options.currentBasis !== options.priorBasis) {
    notes.push(`Bases differ (${options.currentBasis} vs ${options.priorBasis}); do not read this as like-for-like.`);
  }
  return { ...percent, unit: options.unit ?? percent.unit, note: notes.length ? notes.join(" ") : null };
}

/**
 * Unit normalization. PRD 9: normalize only while retaining the original unit
 * and the conversion rule, so both travel with the fact.
 */
const SCALE_FACTORS: Record<string, number> = {
  crore: 1e7,
  cr: 1e7,
  lakh: 1e5,
  lac: 1e5,
  million: 1e6,
  mn: 1e6,
  billion: 1e9,
  bn: 1e9,
  thousand: 1e3,
};

export function normalizeScale(value: number | null, scale: string | null): { value: number | null; note: string } {
  if (value === null) return { value: null, note: "Value unavailable; nothing to normalize." };
  if (!scale) return { value, note: "No scale stated in the source; the reported value is used unchanged." };
  const factor = SCALE_FACTORS[scale.trim().toLowerCase()];
  if (!factor) return { value, note: `Unrecognized scale "${scale}"; the reported value is used unchanged.` };
  return { value: roundTo(value * factor, 2), note: `Converted from ${scale} using factor ${factor} (base unit retained).` };
}

/**
 * Currency conversion is deliberately not implemented as a silent operation.
 * PRD 9 forbids comparing different currencies without an explicit exchange
 * rate source, conversion timestamp and method, so this returns the caveat
 * rather than guessing a rate.
 */
export function convertCurrency(): Calculation {
  return {
    method: "currency_conversion",
    inputs: [],
    formula: "n/a",
    result: null,
    unit: "",
    status: "not_applicable",
    note: "Cross-currency comparison requires an explicit rate source, timestamp and method. None is configured, so no conversion is performed.",
  };
}
