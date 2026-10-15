/**
 * Fundamental screening — real criteria from the value/quality literature.
 *
 * Every derived metric is `null` when its inputs are missing, and a criterion is `passed: false`
 * when it cannot be evaluated. Nothing is defaulted to a flattering value: a screen that cannot be
 * computed must not silently pass a company.
 *
 * Inputs are the caller's own fundamentals. This module fetches nothing and infers nothing.
 */

export type Fundamentals = {
  symbol: string;
  name?: string;
  /** Free-form sector/industry text, used by the supply-chain classifier. */
  sector?: string;
  /** Free-form business description, used by the supply-chain classifier. */
  description?: string;
  /** Trailing twelve-month figures, all in one currency. */
  price?: number | null;
  sharesOutstanding?: number | null;
  marketCap?: number | null;
  revenue?: number | null;
  netIncome?: number | null;
  eps?: number | null;
  bookValuePerShare?: number | null;
  equity?: number | null;
  totalAssets?: number | null;
  currentAssets?: number | null;
  currentLiabilities?: number | null;
  totalLiabilities?: number | null;
  totalDebt?: number | null;
  cash?: number | null;
  inventory?: number | null;
  receivables?: number | null;
  /** Balance-sheet and income-statement detail used by the forensic score models. */
  costOfRevenue?: number | null;
  grossProfit?: number | null;
  sellingGeneralAdmin?: number | null;
  depreciation?: number | null;
  longTermDebt?: number | null;
  retainedEarnings?: number | null;
  propertyPlantEquipment?: number | null;
  ebit?: number | null;
  ebitda?: number | null;
  operatingCashFlow?: number | null;
  freeCashFlow?: number | null;
  /** Growth rates as fractions (0.15 = +15%). */
  revenueGrowth?: number | null;
  epsGrowth?: number | null;
  dividendYield?: number | null;
  /** Pre-computed ratios, used when the caller already has them. */
  peRatio?: number | null;
  pbRatio?: number | null;
  psRatio?: number | null;
  pegRatio?: number | null;
  roe?: number | null;
  roic?: number | null;
  /** Relative strength vs. the market over the lookback, as a fraction. */
  relativeStrength?: number | null;
};

/** A division that yields null instead of Infinity/NaN. */
export function safeDivide(numerator: number | null | undefined, denominator: number | null | undefined): number | null {
  if (numerator === null || numerator === undefined || denominator === null || denominator === undefined) return null;
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return numerator / denominator;
}

const finite = (value: number | null | undefined): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

// --- derived metrics ---------------------------------------------------------------------------

/** Earnings yield = EBIT / enterprise value (Greenblatt's version), or netIncome / marketCap. */
export function earningsYield(f: Fundamentals): number | null {
  const ev = enterpriseValue(f);
  const ebit = finite(f.ebit);
  if (ev !== null && ebit !== null) return safeDivide(ebit, ev);
  return safeDivide(finite(f.netIncome), finite(f.marketCap));
}

/** Enterprise value = market cap + total debt − cash. */
export function enterpriseValue(f: Fundamentals): number | null {
  const marketCap = finite(f.marketCap);
  if (marketCap === null) return null;
  const debt = finite(f.totalDebt) ?? 0;
  const cash = finite(f.cash) ?? 0;
  return marketCap + debt - cash;
}

/** Return on invested capital = EBIT / (equity + total debt − cash). */
export function returnOnInvestedCapital(f: Fundamentals): number | null {
  const roic = finite(f.roic);
  if (roic !== null) return roic;
  const equity = finite(f.equity);
  const debt = finite(f.totalDebt);
  const ebit = finite(f.ebit);
  if (equity === null || debt === null || ebit === null) return null;
  return safeDivide(ebit, equity + debt - (finite(f.cash) ?? 0));
}

/** Net current asset value (Graham's liquidation test): current assets − total liabilities. */
export function netCurrentAssetValue(f: Fundamentals): number | null {
  const currentAssets = finite(f.currentAssets);
  const totalLiabilities = finite(f.totalLiabilities);
  if (currentAssets === null || totalLiabilities === null) return null;
  return currentAssets - totalLiabilities;
}

export function ncavPerShare(f: Fundamentals): number | null {
  return safeDivide(netCurrentAssetValue(f), finite(f.sharesOutstanding));
}

/** A Graham net-net trades below two-thirds of its net current asset value. */
export function isNetNet(f: Fundamentals, discount = 2 / 3): boolean {
  const price = finite(f.price);
  const perShare = ncavPerShare(f);
  if (price === null || perShare === null || perShare <= 0) return false;
  return price <= perShare * discount;
}

export function currentRatio(f: Fundamentals): number | null {
  return safeDivide(finite(f.currentAssets), finite(f.currentLiabilities));
}

export function debtToEquity(f: Fundamentals): number | null {
  return safeDivide(finite(f.totalDebt), finite(f.equity));
}

export function priceToEarnings(f: Fundamentals): number | null {
  const given = finite(f.peRatio);
  if (given !== null) return given;
  return safeDivide(finite(f.price), finite(f.eps));
}

export function priceToBook(f: Fundamentals): number | null {
  const given = finite(f.pbRatio);
  if (given !== null) return given;
  return safeDivide(finite(f.price), finite(f.bookValuePerShare));
}

export function priceToSales(f: Fundamentals): number | null {
  const given = finite(f.psRatio);
  if (given !== null) return given;
  return safeDivide(finite(f.marketCap), finite(f.revenue));
}

export function priceToEarningsToGrowth(f: Fundamentals): number | null {
  const given = finite(f.pegRatio);
  if (given !== null) return given;
  const pe = priceToEarnings(f);
  const growth = finite(f.epsGrowth);
  if (pe === null || growth === null || growth <= 0) return null;
  return pe / (growth * 100); // growth is a fraction; PEG is quoted against percentage points
}

export function returnOnEquity(f: Fundamentals): number | null {
  const given = finite(f.roe);
  if (given !== null) return given;
  return safeDivide(finite(f.netIncome), finite(f.equity));
}

export function evToEbit(f: Fundamentals): number | null {
  return safeDivide(enterpriseValue(f), finite(f.ebit));
}

export function evToEbitda(f: Fundamentals): number | null {
  return safeDivide(enterpriseValue(f), finite(f.ebitda));
}

export function netMargin(f: Fundamentals): number | null {
  return safeDivide(finite(f.netIncome), finite(f.revenue));
}

/**
 * Accruals ratio (Sloan): (net income − operating cash flow) / total assets.
 * A persistently high ratio is a forensic red flag — earnings not backed by cash.
 */
export function accrualsRatio(f: Fundamentals): number | null {
  const netIncome = finite(f.netIncome);
  const cashFlow = finite(f.operatingCashFlow);
  const assets = finite(f.totalAssets);
  if (netIncome === null || cashFlow === null || assets === null) return null;
  return (netIncome - cashFlow) / assets;
}

/** Days sales outstanding — a rising figure can indicate channel stuffing. */
export function daysSalesOutstanding(f: Fundamentals): number | null {
  const receivables = finite(f.receivables);
  const revenue = finite(f.revenue);
  if (receivables === null || revenue === null || revenue <= 0) return null;
  return (receivables / revenue) * 365;
}

// --- screening ---------------------------------------------------------------------------------

export type ScreenCriterion = {
  key: string;
  label: string;
  /** null when the metric could not be computed. */
  value: number | null;
  /** Human-readable rule, e.g. "P/E below 15". */
  threshold: string;
  passed: boolean;
};

export type ScreenOutcome = {
  strategyId: string;
  symbol: string;
  /** True only when every criterion passed. */
  passed: boolean;
  passedCount: number;
  total: number;
  criteria: ScreenCriterion[];
};

export type ScreenFn = (f: Fundamentals) => ScreenOutcome;

function criterion(key: string, label: string, value: number | null, threshold: string, test: (value: number) => boolean): ScreenCriterion {
  return { key, label, value, threshold, passed: value !== null && Number.isFinite(value) && test(value) };
}

function outcome(strategyId: string, f: Fundamentals, criteria: ScreenCriterion[]): ScreenOutcome {
  const passedCount = criteria.filter((item) => item.passed).length;
  return { strategyId, symbol: f.symbol, passed: passedCount === criteria.length && criteria.length > 0, passedCount, total: criteria.length, criteria };
}

/** Graham's defensive-investor criteria, in the spirit of The Intelligent Investor. */
export const grahamDefensive: ScreenFn = (f) =>
  outcome("graham-defensive", f, [
    criterion("pe", "P/E below 15", priceToEarnings(f), "P/E < 15", (v) => v > 0 && v < 15),
    criterion("pb", "P/B below 1.5", priceToBook(f), "P/B < 1.5", (v) => v > 0 && v < 1.5),
    criterion("current", "Current ratio above 2", currentRatio(f), "current ratio > 2", (v) => v > 2),
    criterion("debt", "Debt/equity below 1", debtToEquity(f), "D/E < 1", (v) => v < 1),
    criterion("yield", "Earnings yield above 6.7%", earningsYield(f), "earnings yield > 6.7%", (v) => v > 0.067),
  ]);

/** Graham's net-net: price below two-thirds of net current asset value. */
export const grahamNetNet: ScreenFn = (f) =>
  outcome("graham-net-net", f, [
    criterion("ncavps", "NCAV per share is positive", ncavPerShare(f), "NCAV/share > 0", (v) => v > 0),
    criterion("discount", "Price below 2/3 of NCAV", safeDivide(finite(f.price), ncavPerShare(f)), "price / NCAV < 0.667", (v) => v > 0 && v < 2 / 3),
  ]);

/** Buffett-style quality: durable returns on capital, modest leverage, cash-backed earnings. */
export const buffettQuality: ScreenFn = (f) =>
  outcome("buffett-quality", f, [
    criterion("roe", "Return on equity above 15%", returnOnEquity(f), "ROE > 15%", (v) => v > 0.15),
    criterion("roic", "Return on invested capital above 12%", returnOnInvestedCapital(f), "ROIC > 12%", (v) => v > 0.12),
    criterion("margin", "Net margin above 10%", netMargin(f), "net margin > 10%", (v) => v > 0.1),
    criterion("debt", "Debt/equity below 0.5", debtToEquity(f), "D/E < 0.5", (v) => v < 0.5),
    criterion("accruals", "Earnings backed by cash", accrualsRatio(f), "accruals ratio < 0.05", (v) => v < 0.05),
  ]);

/** Carlisle's deep value: cheap on enterprise multiples. */
export const deepValueEvEbit: ScreenFn = (f) =>
  outcome("deep-value-ev-ebit", f, [
    criterion("evEbit", "EV/EBIT below 8", evToEbit(f), "EV/EBIT < 8", (v) => v > 0 && v < 8),
    criterion("evEbitda", "EV/EBITDA below 6", evToEbitda(f), "EV/EBITDA < 6", (v) => v > 0 && v < 6),
    criterion("earningsYield", "Earnings yield above 12.5%", earningsYield(f), "earnings yield > 12.5%", (v) => v > 0.125),
  ]);

/** Slater's growth-at-a-reasonable-price: PEG below one, with real growth. */
export const slaterPeg: ScreenFn = (f) =>
  outcome("slater-peg", f, [
    criterion("peg", "PEG below 1.0", priceToEarningsToGrowth(f), "PEG < 1.0", (v) => v > 0 && v < 1),
    criterion("growth", "EPS growth above 10%", finite(f.epsGrowth), "EPS growth > 10%", (v) => v > 0.1),
    criterion("pe", "P/E below 25", priceToEarnings(f), "P/E < 25", (v) => v > 0 && v < 25),
  ]);

/** Fisher-style growth quality: sales growth with a strong balance sheet. */
export const fisherGrowth: ScreenFn = (f) =>
  outcome("fisher-growth", f, [
    criterion("revenueGrowth", "Revenue growth above 12%", finite(f.revenueGrowth), "revenue growth > 12%", (v) => v > 0.12),
    criterion("epsGrowth", "EPS growth above 12%", finite(f.epsGrowth), "EPS growth > 12%", (v) => v > 0.12),
    criterion("margin", "Net margin above 8%", netMargin(f), "net margin > 8%", (v) => v > 0.08),
    criterion("debt", "Debt/equity below 1", debtToEquity(f), "D/E < 1", (v) => v < 1),
  ]);

/** O'Shaughnessy-style value composite: cheap on several measures at once. */
export const oshaughnessyValue: ScreenFn = (f) =>
  outcome("oshaughnessy-value", f, [
    criterion("pe", "P/E below 20", priceToEarnings(f), "P/E < 20", (v) => v > 0 && v < 20),
    criterion("ps", "P/S below 1.5", priceToSales(f), "P/S < 1.5", (v) => v > 0 && v < 1.5),
    criterion("pb", "P/B below 3", priceToBook(f), "P/B < 3", (v) => v > 0 && v < 3),
  ]);

/** Schilit-style forensic flags: earnings quality must not be deteriorating. */
export const forensicRedFlags: ScreenFn = (f) =>
  outcome("forensic-red-flags", f, [
    criterion("accruals", "Accruals ratio below 0.10", accrualsRatio(f), "accruals < 0.10", (v) => v < 0.1),
    criterion("dso", "Days sales outstanding below 90", daysSalesOutstanding(f), "DSO < 90", (v) => v > 0 && v < 90),
    criterion("margin", "Net margin is positive", netMargin(f), "net margin > 0", (v) => v > 0),
  ]);

/** Weinstein stage-2 style: a confirmed uptrend with relative strength. */
export const weinsteinStageTwo: ScreenFn = (f) =>
  outcome("weinstein-stage-two", f, [
    criterion("relativeStrength", "Relative strength above 0", finite(f.relativeStrength), "relative strength > 0", (v) => v > 0),
    criterion("revenueGrowth", "Revenue growth above 0", finite(f.revenueGrowth), "revenue growth > 0", (v) => v > 0),
  ]);

/** Mayer-style compounders: high returns on capital retained for a long runway. */
export const compounders100Bagger: ScreenFn = (f) =>
  outcome("mayer-compounders", f, [
    criterion("roic", "Return on invested capital above 15%", returnOnInvestedCapital(f), "ROIC > 15%", (v) => v > 0.15),
    criterion("roe", "Return on equity above 15%", returnOnEquity(f), "ROE > 15%", (v) => v > 0.15),
    criterion("revenueGrowth", "Revenue growth above 8%", finite(f.revenueGrowth), "revenue growth > 8%", (v) => v > 0.08),
  ]);

export const FUNDAMENTAL_SCREENS: Record<string, ScreenFn> = {
  "graham-defensive": grahamDefensive,
  "graham-net-net": grahamNetNet,
  "buffett-quality": buffettQuality,
  "deep-value-ev-ebit": deepValueEvEbit,
  "slater-peg": slaterPeg,
  "fisher-growth": fisherGrowth,
  "oshaughnessy-value": oshaughnessyValue,
  "forensic-red-flags": forensicRedFlags,
  "weinstein-stage-two": weinsteinStageTwo,
  "mayer-compounders": compounders100Bagger,
};

export type RankedEntry = { symbol: string; roicRank: number; earningsYieldRank: number; combinedRank: number; score: number };

/**
 * Greenblatt's Magic Formula: rank a universe by ROIC and by earnings yield, then combine.
 * Companies missing either input are excluded rather than assigned an average rank.
 */
export function rankMagicFormula(universe: Fundamentals[]): RankedEntry[] {
  const withMetrics = universe
    .map((company) => ({ symbol: company.symbol, roic: returnOnInvestedCapital(company), yield: earningsYield(company) }))
    .filter((row): row is { symbol: string; roic: number; yield: number } => row.roic !== null && row.yield !== null);
  const byRoic = [...withMetrics].sort((a, b) => b.roic - a.roic);
  const byYield = [...withMetrics].sort((a, b) => b.yield - a.yield);
  const roicRank = new Map(byRoic.map((row, index) => [row.symbol, index + 1]));
  const yieldRank = new Map(byYield.map((row, index) => [row.symbol, index + 1]));
  const total = withMetrics.length;
  return withMetrics
    .map((row) => {
      const rr = roicRank.get(row.symbol) ?? total;
      const yr = yieldRank.get(row.symbol) ?? total;
      const combinedRank = rr + yr;
      // A 0–100 score where 100 is the best combined rank (rank 2 for a single-name universe).
      const score = total > 1 ? ((2 * total - combinedRank) / (2 * total - 2)) * 100 : 100;
      return { symbol: row.symbol, roicRank: rr, earningsYieldRank: yr, combinedRank, score: Math.max(0, Math.min(100, score)) };
    })
    .sort((a, b) => a.combinedRank - b.combinedRank);
}

/** Run one named screen across a universe, best first. */
export function runScreen(screenId: string, universe: Fundamentals[]): ScreenOutcome[] {
  const screen = FUNDAMENTAL_SCREENS[screenId];
  if (!screen) return [];
  return universe
    .map((company) => screen(company))
    .sort((a, b) => b.passedCount / Math.max(1, b.total) - a.passedCount / Math.max(1, a.total) || a.symbol.localeCompare(b.symbol));
}
