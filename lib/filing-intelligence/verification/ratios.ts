/**
 * Deterministic financial metrics (Prompt 3, section 3).
 *
 * Every metric is computed from named inputs, carries its formula, and returns
 * an explicit status rather than a plausible number when the inputs are missing
 * or the arithmetic is undefined. Three conventions are stated in code so a
 * reader can reproduce a figure:
 *
 *   - a percentage change against a zero denominator is undefined, not infinite
 *     and not zero;
 *   - a negative denominator uses the absolute value, and the convention is
 *     named in the note, because a sign flip would otherwise mislead;
 *   - a cross-currency comparison is refused unless a rate, a timestamp, a
 *     source and a method are all supplied.
 *
 * The values are computed with fixed-point arithmetic so a chain of margins and
 * percentages does not accumulate binary floating-point drift.
 */

import { decimal, divideDecimals, multiplyDecimals, safePercent, subtractDecimals, toNumber, type RoundingRule } from "./decimals";
import type { AccountingBasis } from "../types";

export type MetricStatus = "ok" | "undefined" | "insufficient_inputs" | "blocked";

export type Metric = {
  key: string;
  label: string;
  /** The computed value, or null when it is undefined or unavailable. */
  value: number | null;
  unit: string;
  formula: string;
  /** The named inputs, so the result can be reproduced. */
  inputs: Record<string, number | string | null>;
  status: MetricStatus;
  /** Plain-language reason for a non-ok status, or a convention worth naming. */
  note: string | null;
  rounding: RoundingRule;
  /** Caveats that must travel with the figure. */
  caveats: string[];
};

export type MetricInput = { value: number | null; label?: string };

function missing(inputs: Record<string, MetricInput>): string[] {
  return Object.entries(inputs).filter(([, entry]) => entry.value === null).map(([key]) => key);
}

function base(key: string, label: string, formula: string, unit: string, inputs: Record<string, MetricInput>): Omit<Metric, "value" | "status" | "note" | "rounding" | "caveats"> {
  const flattened: Record<string, number | string | null> = {};
  for (const [name, entry] of Object.entries(inputs)) flattened[name] = entry.value;
  return { key, label, formula, unit, inputs: flattened };
}

/* ------------------------------------------------------------------ *
 * Growth
 * ------------------------------------------------------------------ */

/**
 * Period-over-period growth.
 *
 * A zero prior value makes the percentage undefined. A negative prior value
 * uses the absolute value, and the convention is recorded on the metric.
 */
export function growth(
  key: string,
  label: string,
  current: MetricInput,
  prior: MetricInput,
  options: { decimals?: number; rule?: RoundingRule } = {},
): Metric {
  const inputs = { current, prior };
  const meta = base(key, label, "((current - prior) / abs(prior)) * 100", "%", inputs);
  const absent = missing(inputs);
  if (absent.length) {
    return { ...meta, value: null, status: "insufficient_inputs", note: `Missing input(s): ${absent.join(", ")}. No value is fabricated.`, rounding: "exact", caveats: [] };
  }
  if (prior.value === 0) {
    return { ...meta, value: null, status: "undefined", note: "The prior value is zero, so a percentage change is undefined. Report the absolute change instead.", rounding: "exact", caveats: [] };
  }
  const difference = subtractDecimals(decimal(current.value!), decimal(prior.value!));
  const result = safePercent(difference, decimal(Math.abs(prior.value!)), { decimals: options.decimals ?? 2, rule: options.rule });
  const caveats: string[] = [];
  if (prior.value! < 0) caveats.push("The prior value is negative; the sign of the change is read from the numerator, and the denominator uses the absolute value.");
  return { ...meta, value: result.percent, status: result.percent === null ? "undefined" : "ok", note: result.undefinedReason, rounding: result.rule, caveats };
}

export function revenueGrowth(current: MetricInput, prior: MetricInput): Metric {
  return growth("revenue_growth", "Revenue growth", current, prior);
}

export function profitGrowth(current: MetricInput, prior: MetricInput): Metric {
  return growth("profit_growth", "Profit growth", current, prior);
}

/* ------------------------------------------------------------------ *
 * Margins
 * ------------------------------------------------------------------ */

function margin(key: string, label: string, numerator: MetricInput, revenue: MetricInput): Metric {
  const inputs = { numerator, revenue };
  const meta = base(key, label, "(numerator / revenue) * 100", "%", inputs);
  const absent = missing(inputs);
  if (absent.length) return { ...meta, value: null, status: "insufficient_inputs", note: `Missing input(s): ${absent.join(", ")}.`, rounding: "exact", caveats: [] };
  if (revenue.value === 0) return { ...meta, value: null, status: "undefined", note: "Revenue is zero, so the margin is undefined.", rounding: "exact", caveats: [] };
  if (revenue.value! < 0) {
    const result = safePercent(decimal(numerator.value!), decimal(revenue.value!));
    return { ...meta, value: result.percent, status: result.percent === null ? "undefined" : "ok", note: result.undefinedReason, rounding: result.rule, caveats: ["Revenue is negative, which is unusual; confirm the source before relying on this margin."] };
  }
  const result = safePercent(decimal(numerator.value!), decimal(revenue.value!));
  return { ...meta, value: result.percent, status: result.percent === null ? "undefined" : "ok", note: result.undefinedReason, rounding: result.rule, caveats: [] };
}

export function grossMargin(grossProfit: MetricInput, revenue: MetricInput): Metric {
  return margin("gross_margin", "Gross margin", grossProfit, revenue);
}

export function operatingMargin(operatingProfit: MetricInput, revenue: MetricInput): Metric {
  return margin("operating_margin", "Operating margin", operatingProfit, revenue);
}

export function netMargin(netProfit: MetricInput, revenue: MetricInput): Metric {
  return margin("net_margin", "Net margin", netProfit, revenue);
}

export function ebitdaMargin(ebitda: MetricInput, revenue: MetricInput): Metric {
  return margin("ebitda_margin", "EBITDA margin", ebitda, revenue);
}

/* ------------------------------------------------------------------ *
 * Liquidity and leverage
 * ------------------------------------------------------------------ */

function ratioMetric(key: string, label: string, numerator: MetricInput, denominator: MetricInput, formula: string, unit = "x"): Metric {
  const inputs = { numerator, denominator };
  const meta = base(key, label, formula, unit, inputs);
  const absent = missing(inputs);
  if (absent.length) return { ...meta, value: null, status: "insufficient_inputs", note: `Missing input(s): ${absent.join(", ")}.`, rounding: "exact", caveats: [] };
  if (denominator.value === 0) return { ...meta, value: null, status: "undefined", note: "The denominator is zero, so the ratio is undefined.", rounding: "exact", caveats: [] };
  const quotient = divideDecimals(decimal(numerator.value!), decimal(denominator.value!));
  if (!quotient) return { ...meta, value: null, status: "undefined", note: "The division could not be performed.", rounding: "exact", caveats: [] };
  const rounded = toNumber(quotient, 2, "half_up");
  const caveats: string[] = [];
  if (denominator.value! < 0) caveats.push("The denominator is negative, so the ratio's sign is not meaningful in the usual sense.");
  return { ...meta, value: rounded.value, status: "ok", note: null, rounding: rounded.rule, caveats };
}

export function currentRatio(currentAssets: MetricInput, currentLiabilities: MetricInput): Metric {
  return ratioMetric("current_ratio", "Current ratio", currentAssets, currentLiabilities, "current assets / current liabilities");
}

export function quickRatio(currentAssets: MetricInput, inventory: MetricInput, currentLiabilities: MetricInput): Metric {
  const inputs = { currentAssets, inventory, currentLiabilities };
  const meta = base("quick_ratio", "Quick ratio", "(current assets - inventory) / current liabilities", "x", inputs);
  const absent = missing(inputs);
  if (absent.length) return { ...meta, value: null, status: "insufficient_inputs", note: `Missing input(s): ${absent.join(", ")}.`, rounding: "exact", caveats: [] };
  if (currentLiabilities.value === 0) return { ...meta, value: null, status: "undefined", note: "Current liabilities are zero, so the ratio is undefined.", rounding: "exact", caveats: [] };
  const liquid = subtractDecimals(decimal(currentAssets.value!), decimal(inventory.value!));
  const quotient = divideDecimals(liquid, decimal(currentLiabilities.value!));
  if (!quotient) return { ...meta, value: null, status: "undefined", note: "The division could not be performed.", rounding: "exact", caveats: [] };
  const rounded = toNumber(quotient, 2);
  return { ...meta, value: rounded.value, status: "ok", note: null, rounding: rounded.rule, caveats: [] };
}

export function debtToEquity(totalDebt: MetricInput, equity: MetricInput): Metric {
  const metric = ratioMetric("debt_to_equity", "Debt to equity", totalDebt, equity, "total debt / total equity");
  if (metric.status === "ok" && (equity.value ?? 0) < 0) {
    return { ...metric, caveats: [...metric.caveats, "Equity is negative, which indicates accumulated losses; the ratio's interpretation changes."] };
  }
  return metric;
}

export function interestCoverage(ebit: MetricInput, interestExpense: MetricInput): Metric {
  const inputs = { ebit, interestExpense };
  const meta = base("interest_coverage", "Interest coverage", "EBIT / interest expense", "x", inputs);
  const absent = missing(inputs);
  if (absent.length) return { ...meta, value: null, status: "insufficient_inputs", note: `Missing input(s): ${absent.join(", ")}.`, rounding: "exact", caveats: [] };
  if (interestExpense.value === 0) {
    return { ...meta, value: null, status: "undefined", note: "There is no interest expense, so coverage is not defined.", rounding: "exact", caveats: [] };
  }
  if (interestExpense.value! < 0) {
    return { ...meta, value: null, status: "blocked", note: "Interest expense is negative, which suggests a net interest income rather than an expense; the coverage ratio would be misleading.", rounding: "exact", caveats: [] };
  }
  const quotient = divideDecimals(decimal(ebit.value!), decimal(interestExpense.value!));
  if (!quotient) return { ...meta, value: null, status: "undefined", note: "The division could not be performed.", rounding: "exact", caveats: [] };
  const rounded = toNumber(quotient, 2);
  return { ...meta, value: rounded.value, status: "ok", note: null, rounding: rounded.rule, caveats: [] };
}

/* ------------------------------------------------------------------ *
 * Per-share
 * ------------------------------------------------------------------ */

function perShare(key: string, label: string, total: MetricInput, shares: MetricInput, unit: string): Metric {
  const inputs = { total, shares };
  const meta = base(key, label, "total / weighted average shares", unit, inputs);
  const absent = missing(inputs);
  if (absent.length) return { ...meta, value: null, status: "insufficient_inputs", note: `Missing input(s): ${absent.join(", ")}.`, rounding: "exact", caveats: [] };
  if (shares.value === 0) return { ...meta, value: null, status: "undefined", note: "The share count is zero, so a per-share figure is undefined.", rounding: "exact", caveats: [] };
  if (shares.value! < 0) return { ...meta, value: null, status: "blocked", note: "The share count is negative, which is not a valid input.", rounding: "exact", caveats: [] };
  const quotient = divideDecimals(decimal(total.value!), decimal(shares.value!));
  if (!quotient) return { ...meta, value: null, status: "undefined", note: "The division could not be performed.", rounding: "exact", caveats: [] };
  const rounded = toNumber(quotient, 2);
  const caveats: string[] = [];
  if (total.value === null) caveats.push("The total is unavailable.");
  return { ...meta, value: rounded.value, status: "ok", note: null, rounding: rounded.rule, caveats };
}

export function earningsPerShare(netProfit: MetricInput, weightedShares: MetricInput): Metric {
  return perShare("eps", "Earnings per share", netProfit, weightedShares, "per share");
}

export function bookValuePerShare(equity: MetricInput, shares: MetricInput): Metric {
  return perShare("book_value_per_share", "Book value per share", equity, shares, "per share");
}

/* ------------------------------------------------------------------ *
 * Period and basis comparisons
 * ------------------------------------------------------------------ */

export type PeriodKind = "annual" | "quarterly" | "half_yearly" | "trailing_twelve_months" | "unknown";

/**
 * Compare two periods, refusing the comparisons that are not like-for-like.
 *
 * A quarterly figure against a trailing-twelve-month figure is not a growth
 * rate, and a consolidated figure against a standalone figure is not either.
 * Both are blocked with the reason rather than computed and caveated.
 */
export function comparePeriodsChecked(
  current: MetricInput,
  prior: MetricInput,
  context: { currentPeriod: PeriodKind; priorPeriod: PeriodKind; currentBasis: AccountingBasis; priorBasis: AccountingBasis },
): Metric {
  const meta = base("period_comparison", "Period-over-period change", "((current - prior) / abs(prior)) * 100", "%", { current, prior });
  const blockers: string[] = [];
  if (context.currentBasis !== context.priorBasis && context.currentBasis !== "unknown" && context.priorBasis !== "unknown") {
    blockers.push(`Bases differ (${context.currentBasis} against ${context.priorBasis}); a consolidated figure cannot be compared with a standalone one.`);
  }
  if (context.currentPeriod !== context.priorPeriod && context.currentPeriod !== "unknown" && context.priorPeriod !== "unknown") {
    blockers.push(`Period types differ (${context.currentPeriod} against ${context.priorPeriod}); a quarterly figure is not comparable with an annual or trailing one.`);
  }
  if (blockers.length) {
    return { ...meta, value: null, status: "blocked", note: blockers.join(" "), rounding: "exact", caveats: blockers };
  }
  const computed = growth("period_comparison", "Period-over-period change", current, prior);
  return { ...computed, caveats: [...computed.caveats, ...blockers] };
}

/**
 * Guard a restatement. When a prior figure has been restated, the originally
 * reported value and the restated value are different facts and must not be
 * mixed silently.
 */
export function restatementCheck(original: MetricInput, restated: MetricInput, label: string): { consistent: boolean; note: string; difference: number | null } {
  if (original.value === null || restated.value === null) {
    return { consistent: true, note: `${label}: one of the two values is unavailable, so no restatement can be assessed.`, difference: null };
  }
  const difference = toNumber(subtractDecimals(decimal(restated.value), decimal(original.value)), 2);
  if (difference.value === 0) return { consistent: true, note: `${label}: the restated value equals the originally reported value.`, difference: 0 };
  return {
    consistent: false,
    note: `${label}: the value was restated from ${original.value} to ${restated.value}. Both must be labelled distinctly; they are not interchangeable.`,
    difference: difference.value,
  };
}

/* ------------------------------------------------------------------ *
 * Currency
 * ------------------------------------------------------------------ */

export type CurrencyConversion = {
  rate: number;
  rateTimestampUtc: string;
  rateSource: string;
  method: string;
};

/**
 * Convert a value between currencies, but only when every part of the
 * conversion is supplied. Prompt 3 requires a valid rate, timestamp, source and
 * methodology; with any of them missing the conversion is blocked rather than
 * performed at a guessed rate.
 */
export function convertCurrencyChecked(value: MetricInput, from: string, to: string, conversion: CurrencyConversion | null): Metric {
  const meta = base("currency_conversion", "Currency conversion", "value * rate", to, { value });
  if (from === to) return { ...meta, value: value.value, status: value.value === null ? "insufficient_inputs" : "ok", note: "The currencies are the same, so no conversion was applied.", rounding: "exact", caveats: [] };
  if (!conversion || !conversion.rate || !conversion.rateTimestampUtc || !conversion.rateSource || !conversion.method) {
    return {
      ...meta,
      value: null,
      status: "blocked",
      note: `A comparison between ${from} and ${to} is blocked because no complete conversion is available. A rate, its timestamp, its source and its method are all required.`,
      rounding: "exact",
      caveats: [`Values in ${from} and ${to} must not be compared until a documented conversion exists.`],
    };
  }
  if (value.value === null) return { ...meta, value: null, status: "insufficient_inputs", note: "The value to convert is unavailable.", rounding: "exact", caveats: [] };
  const product = multiplyDecimals(decimal(value.value), decimal(conversion.rate));
  const rounded = toNumber(product, 2);
  return {
    ...meta,
    value: rounded.value,
    status: "ok",
    note: null,
    rounding: rounded.rule,
    caveats: [`Converted from ${from} to ${to} at ${conversion.rate} per ${conversion.rateSource} as at ${conversion.rateTimestampUtc} using ${conversion.method}.`],
  };
}

/** Summarise a metric set, so a report can state how many were computable. */
export function summariseMetrics(metrics: Metric[]): { total: number; ok: number; undefined: number; insufficient: number; blocked: number } {
  return {
    total: metrics.length,
    ok: metrics.filter((metric) => metric.status === "ok").length,
    undefined: metrics.filter((metric) => metric.status === "undefined").length,
    insufficient: metrics.filter((metric) => metric.status === "insufficient_inputs").length,
    blocked: metrics.filter((metric) => metric.status === "blocked").length,
  };
}
