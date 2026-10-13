/**
 * AnalyzerX Institutional Scoring Engine — financial metric formulas.
 *
 * Every function is pure and null-safe: an unavailable input yields `null`
 * rather than `NaN`, so the scoring layer can redistribute weight instead of
 * rendering a broken number (PRD FR-5, NFR "NaN / Invalid Date = 0 in
 * production"). Arithmetic uses the exact fixed-point layer where rounding
 * matters.
 *
 * Formulas follow PRD Section 18 (Appendix: Reference Formulas) and the cited
 * research (Altman 1968, Sloan 1996, Piotroski 2000, Beneish 1999).
 */

import { difference, percentOf, product, quotient, ratio, round, sumValid } from "@/lib/precision";

export type PiotroskiInputs = {
  roa: number | null;
  cfo: number | null;
  netIncome: number | null;
  priorRoa: number | null;
  debtToEquity: number | null;
  priorDebtToEquity: number | null;
  currentRatio: number | null;
  priorCurrentRatio: number | null;
  sharesOutstanding: number | null;
  priorSharesOutstanding: number | null;
  grossMargin: number | null;
  priorGrossMargin: number | null;
  assetTurnover: number | null;
  priorAssetTurnover: number | null;
};

export type PiotroskiResult = { score: number; max: number; tests: Record<string, boolean>; available: number };

/** Compound annual growth rate, in percent. `years` must be positive. */
export function cagr(start: unknown, end: unknown, years: number): number | null {
  if (!Number.isFinite(years) || years <= 0) return null;
  const growthRatio = ratio(end, start);
  if (growthRatio === null || growthRatio <= 0) return null;
  return round((growthRatio ** (1 / years) - 1) * 100, 4);
}

/** Gross profitability = gross profit / total assets (Novy-Marx 2013). */
export function grossProfitability(grossProfit: unknown, totalAssets: unknown): number | null {
  return quotient(grossProfit, totalAssets);
}

/** Excess return over the cost of capital, in percentage points. */
export function roicMinusWacc(roic: unknown, wacc: unknown): number | null {
  return difference(roic, wacc);
}

export function margin(value: unknown, revenue: unknown): number | null {
  return percentOf(value, revenue);
}

/**
 * Margin stability, higher = steadier. Inverts the coefficient of variation so
 * it is monotonic with the "higher-better" direction in the config.
 */
export function marginStability(margins: readonly unknown[]): number | null {
  const values = margins.map((value) => (typeof value === "number" && Number.isFinite(value) ? value : null)).filter((value): value is number => value !== null);
  if (values.length < 2) return null;
  const mean = values.reduce((acc, value) => acc + value, 0) / values.length;
  if (mean === 0) return null;
  const variance = values.reduce((acc, value) => acc + (value - mean) ** 2, 0) / values.length;
  const coefficientOfVariation = Math.sqrt(variance) / Math.abs(mean);
  return round(100 * (1 / (1 + coefficientOfVariation)), 4);
}

/** Altman Z-Score (manufacturing form), PRD Section 18. */
export function altmanZ(input: {
  workingCapital: unknown; totalAssets: unknown; retainedEarnings: unknown;
  ebit: unknown; marketValueEquity: unknown; totalLiabilities: unknown; sales: unknown;
}): number | null {
  if (typeof input.totalAssets !== "number" || !Number.isFinite(input.totalAssets) || input.totalAssets === 0) return null;
  const wc = product(1.2, ratio(input.workingCapital, input.totalAssets));
  const re = product(1.4, ratio(input.retainedEarnings, input.totalAssets));
  const ebit = product(3.3, ratio(input.ebit, input.totalAssets));
  const mve = product(0.6, ratio(input.marketValueEquity, input.totalLiabilities));
  const sales = product(1.0, ratio(input.sales, input.totalAssets));
  return round(sumValid([wc, re, ebit, mve, sales]), 4);
}

/** Sloan accruals = (NetIncome − CFO) / AverageTotalAssets (Sloan 1996). */
export function sloanAccruals(netIncome: unknown, cfo: unknown, averageTotalAssets: unknown): number | null {
  const accrual = difference(netIncome, cfo);
  if (accrual === null) return null;
  return quotient(accrual, averageTotalAssets);
}

/**
 * Beneish M-Score, 5-variable form:
 * M = −6.065 + 0.823·DSRI + 0.906·GMI + 0.593·AQI + 0.717·SGI + 0.107·DEPI.
 * Values above −1.78 are the classic manipulation flag.
 */
export function beneishM(input: {
  dsri: unknown; gmi: unknown; aqi: unknown; sgi: unknown; depi: unknown;
}): number | null {
  const terms = [
    product(0.823, input.dsri),
    product(0.906, input.gmi),
    product(0.593, input.aqi),
    product(0.717, input.sgi),
    product(0.107, input.depi),
  ];
  if (terms.some((term) => term === null)) return null;
  return round(sumValid([-6.065, ...terms]), 4);
}

/** Piotroski F-Score (2000): nine binary tests across profitability, leverage/liquidity, efficiency. */
export function piotroskiF(input: PiotroskiInputs): PiotroskiResult {
  const gt = (a: number | null, b: number | null): boolean => a !== null && b !== null && a > b;
  const lt = (a: number | null, b: number | null): boolean => a !== null && b !== null && a < b;
  const positive = (a: number | null): boolean => a !== null && a > 0;

  const tests: Record<string, boolean> = {
    "ROA > 0": positive(input.roa),
    "CFO > 0": positive(input.cfo),
    "ΔROA > 0": gt(input.roa, input.priorRoa),
    "CFO > Net income (accruals)": input.cfo !== null && input.netIncome !== null && input.cfo > input.netIncome,
    "ΔLeverage < 0": lt(input.debtToEquity, input.priorDebtToEquity),
    "ΔCurrent ratio > 0": gt(input.currentRatio, input.priorCurrentRatio),
    "No new shares issued": input.sharesOutstanding !== null && input.priorSharesOutstanding !== null && input.sharesOutstanding <= input.priorSharesOutstanding,
    "ΔGross margin > 0": gt(input.grossMargin, input.priorGrossMargin),
    "ΔAsset turnover > 0": gt(input.assetTurnover, input.priorAssetTurnover),
  };

  const values = Object.values(tests);
  const score = values.filter(Boolean).length;
  return { score, max: 9, tests, available: values.length };
}

export function debtToEquity(totalDebt: unknown, totalEquity: unknown): number | null {
  return quotient(totalDebt, totalEquity);
}

export function netDebtToEbitda(netDebt: unknown, ebitda: unknown): number | null {
  return quotient(netDebt, ebitda);
}

export function interestCoverage(ebit: unknown, interestExpense: unknown): number | null {
  const coverage = quotient(ebit, interestExpense);
  return coverage !== null && coverage > 0 ? coverage : null;
}

export function currentRatio(currentAssets: unknown, currentLiabilities: unknown): number | null {
  return quotient(currentAssets, currentLiabilities);
}

export function quickRatio(quickAssets: unknown, currentLiabilities: unknown): number | null {
  return quotient(quickAssets, currentLiabilities);
}

export function cfoToPat(cfo: unknown, pat: unknown): number | null {
  return quotient(cfo, pat);
}

export function fcfConversion(fcf: unknown, cfo: unknown): number | null {
  return quotient(fcf, cfo);
}

export function capexIntensity(capex: unknown, revenue: unknown): number | null {
  const absoluteCapex = typeof capex === "number" && Number.isFinite(capex) ? Math.abs(capex) : null;
  return percentOf(absoluteCapex, revenue);
}

export function fcfYield(fcf: unknown, marketCap: unknown): number | null {
  return percentOf(fcf, marketCap);
}

export function peRatio(price: unknown, eps: unknown): number | null {
  const value = quotient(price, eps);
  return value !== null && value > 0 ? value : null;
}

export function pegRatio(pe: unknown, growthPercent: unknown): number | null {
  const growth = typeof growthPercent === "number" && growthPercent > 0 ? growthPercent : null;
  return quotient(pe, growth);
}

export function evEbitda(enterpriseValue: unknown, ebitda: unknown): number | null {
  const value = quotient(enterpriseValue, ebitda);
  return value !== null && value > 0 ? value : null;
}

export function evSales(enterpriseValue: unknown, sales: unknown): number | null {
  return quotient(enterpriseValue, sales);
}

export function marginOfSafety(intrinsicMid: unknown, price: unknown): number | null {
  const gap = difference(intrinsicMid, price);
  if (gap === null) return null;
  return percentOf(gap, intrinsicMid);
}

export type DcfInput = {
  fcf: number;
  growthRate: number;      // fraction, e.g. 0.12
  discountRate: number;    // fraction, e.g. 0.11
  terminalGrowth: number;  // fraction, e.g. 0.04
  years?: number;          // default 5
};

/** Two-stage DCF enterprise value. Returns null on a non-positive discount/growth spread. */
export function dcfValue(input: DcfInput): number | null {
  const years = input.years ?? 5;
  if (!Number.isFinite(input.fcf) || input.fcf <= 0) return null;
  if (input.discountRate <= input.terminalGrowth) return null;
  let presentValue = 0;
  let cashFlow = input.fcf;
  for (let year = 1; year <= years; year += 1) {
    cashFlow = cashFlow * (1 + input.growthRate);
    presentValue += cashFlow / (1 + input.discountRate) ** year;
  }
  const terminalValue = (cashFlow * (1 + input.terminalGrowth)) / (input.discountRate - input.terminalGrowth);
  presentValue += terminalValue / (1 + input.discountRate) ** years;
  return round(presentValue, 2);
}

/**
 * Reverse DCF (Mauboussin / expectations investing): solve for the growth rate
 * the current enterprise value implies, by bisection. Returns the implied
 * growth as a fraction, or null when no bracket exists.
 */
export function reverseDcfImpliedGrowth(input: Omit<DcfInput, "growthRate"> & { enterpriseValue: number }): number | null {
  if (!Number.isFinite(input.enterpriseValue) || input.enterpriseValue <= 0) return null;
  let low = -0.5;
  let high = 1.0;
  const valueAt = (growth: number) => dcfValue({ ...input, growthRate: growth }) ?? Number.NEGATIVE_INFINITY;
  if (valueAt(low) > input.enterpriseValue) return null;
  if (valueAt(high) < input.enterpriseValue) return null;
  for (let iteration = 0; iteration < 80; iteration += 1) {
    const mid = (low + high) / 2;
    if (valueAt(mid) < input.enterpriseValue) low = mid; else high = mid;
  }
  return round((low + high) / 2, 4);
}
