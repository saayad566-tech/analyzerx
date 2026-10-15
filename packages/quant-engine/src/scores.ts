/**
 * Financial-integrity and distress score models.
 *
 * These are the named models the directive's Categories I and IV call for. Each is implemented from
 * its published formula, and each returns the per-component breakdown so a result can be checked
 * rather than trusted.
 *
 * A component that cannot be computed is reported as `null` and counts as **not** met. A score built
 * on missing data must never look like a pass.
 */
import { safeDivide, type Fundamentals } from "./fundamentals";

const finite = (value: number | null | undefined): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

/** Gross margin, preferring reported gross profit and falling back to revenue − cost of revenue. */
export function grossMargin(f: Fundamentals): number | null {
  const revenue = finite(f.revenue);
  if (revenue === null || revenue === 0) return null;
  const gross = finite(f.grossProfit) ?? (finite(f.costOfRevenue) !== null ? revenue - (finite(f.costOfRevenue) as number) : null);
  if (gross === null) return null;
  return gross / revenue;
}

/** Return on assets = net income / total assets. */
export function returnOnAssets(f: Fundamentals): number | null {
  return safeDivide(finite(f.netIncome), finite(f.totalAssets));
}

/** Asset turnover = revenue / total assets. */
export function assetTurnover(f: Fundamentals): number | null {
  return safeDivide(finite(f.revenue), finite(f.totalAssets));
}

export type ScoreComponent = {
  key: string;
  label: string;
  value: number | null;
  /** Whether this component contributed to the score. */
  met: boolean;
  /** For the M-Score, the model coefficient applied. */
  weight?: number;
};

// --- Piotroski F-Score -------------------------------------------------------------------------

export type PiotroskiResult = {
  score: number;
  /** How many of the nine components could actually be evaluated. */
  evaluable: number;
  components: ScoreComponent[];
  /** F ≥ 7 is the conventional "strong" threshold. */
  strong: boolean;
};

/**
 * Piotroski F-Score: nine binary accounting signals across profitability, leverage/liquidity and
 * operating efficiency. Needs the current and prior reporting period.
 */
export function piotroskiFScore(current: Fundamentals, prior: Fundamentals): PiotroskiResult {
  const components: ScoreComponent[] = [];
  const add = (key: string, label: string, met: boolean | null, value: number | null) => {
    components.push({ key, label, value, met: met === true });
  };

  const roaNow = returnOnAssets(current);
  const roaPrev = returnOnAssets(prior);
  const cfo = finite(current.operatingCashFlow);
  const netIncome = finite(current.netIncome);

  // Profitability
  add("roa-positive", "Return on assets is positive", roaNow === null ? null : roaNow > 0, roaNow);
  add("cfo-positive", "Operating cash flow is positive", cfo === null ? null : cfo > 0, cfo);
  add("roa-improving", "Return on assets improved", roaNow === null || roaPrev === null ? null : roaNow > roaPrev, roaNow === null || roaPrev === null ? null : roaNow - roaPrev);
  add("accruals", "Cash flow exceeds net income", cfo === null || netIncome === null ? null : cfo > netIncome, cfo === null || netIncome === null ? null : cfo - netIncome);

  // Leverage, liquidity and financing
  const leverageNow = safeDivide(finite(current.longTermDebt), finite(current.totalAssets));
  const leveragePrev = safeDivide(finite(prior.longTermDebt), finite(prior.totalAssets));
  const ratioNow = safeDivide(finite(current.currentAssets), finite(current.currentLiabilities));
  const ratioPrev = safeDivide(finite(prior.currentAssets), finite(prior.currentLiabilities));
  const sharesNow = finite(current.sharesOutstanding);
  const sharesPrev = finite(prior.sharesOutstanding);

  add("leverage-down", "Long-term leverage fell", leverageNow === null || leveragePrev === null ? null : leverageNow < leveragePrev, leverageNow === null || leveragePrev === null ? null : leverageNow - leveragePrev);
  add("liquidity-up", "Current ratio improved", ratioNow === null || ratioPrev === null ? null : ratioNow > ratioPrev, ratioNow === null || ratioPrev === null ? null : ratioNow - ratioPrev);
  add("no-dilution", "No new shares were issued", sharesNow === null || sharesPrev === null ? null : sharesNow <= sharesPrev, sharesNow === null || sharesPrev === null ? null : sharesNow - sharesPrev);

  // Operating efficiency
  const marginNow = grossMargin(current);
  const marginPrev = grossMargin(prior);
  const turnoverNow = assetTurnover(current);
  const turnoverPrev = assetTurnover(prior);

  add("margin-up", "Gross margin improved", marginNow === null || marginPrev === null ? null : marginNow > marginPrev, marginNow === null || marginPrev === null ? null : marginNow - marginPrev);
  add("turnover-up", "Asset turnover improved", turnoverNow === null || turnoverPrev === null ? null : turnoverNow > turnoverPrev, turnoverNow === null || turnoverPrev === null ? null : turnoverNow - turnoverPrev);

  const score = components.filter((component) => component.met).length;
  return { score, evaluable: components.filter((component) => component.value !== null).length, components, strong: score >= 7 };
}

// --- Altman Z-Score ----------------------------------------------------------------------------

export type AltmanResult = {
  /** The Z (public manufacturer) score. */
  z: number | null;
  /** The Z'' variant, for private firms and non-manufacturers. */
  zDoublePrime: number | null;
  zone: "safe" | "grey" | "distress" | "unknown";
  components: ScoreComponent[];
};

/** Altman Z-Score. Returns null components when the inputs are absent rather than guessing. */
export function altmanZScore(f: Fundamentals): AltmanResult {
  const totalAssets = finite(f.totalAssets);
  const workingCapital = finite(f.currentAssets) !== null && finite(f.currentLiabilities) !== null ? (finite(f.currentAssets) as number) - (finite(f.currentLiabilities) as number) : null;

  const x1 = safeDivide(workingCapital, totalAssets);
  const x2 = safeDivide(finite(f.retainedEarnings), totalAssets);
  const x3 = safeDivide(finite(f.ebit), totalAssets);
  const x4 = safeDivide(finite(f.marketCap) ?? finite(f.equity), finite(f.totalLiabilities));
  const x5 = safeDivide(finite(f.revenue), totalAssets);

  const components: ScoreComponent[] = [
    { key: "x1", label: "Working capital / total assets", value: x1, met: x1 !== null },
    { key: "x2", label: "Retained earnings / total assets", value: x2, met: x2 !== null },
    { key: "x3", label: "EBIT / total assets", value: x3, met: x3 !== null },
    { key: "x4", label: "Market value of equity / total liabilities", value: x4, met: x4 !== null },
    { key: "x5", label: "Sales / total assets", value: x5, met: x5 !== null },
  ];

  const z = x1 !== null && x2 !== null && x3 !== null && x4 !== null && x5 !== null ? 1.2 * x1 + 1.4 * x2 + 3.3 * x3 + 0.6 * x4 + 1.0 * x5 : null;
  const zDoublePrime = x1 !== null && x2 !== null && x3 !== null && x4 !== null ? 6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4 : null;

  const zone: AltmanResult["zone"] = z === null ? "unknown" : z > 2.99 ? "safe" : z >= 1.81 ? "grey" : "distress";
  return { z, zDoublePrime, zone, components };
}

// --- Beneish M-Score ---------------------------------------------------------------------------

export type BeneishResult = {
  m: number | null;
  /** M above −1.78 is the conventional manipulation flag. */
  flagged: boolean;
  components: ScoreComponent[];
};

/**
 * Beneish M-Score: an eight-variable earnings-manipulation detector.
 * M = −4.84 + 0.920·DSRI + 0.528·GMI + 0.404·AQI + 0.892·SGI + 0.115·DEPI − 0.172·SGAI + 4.679·TATA − 0.327·LVGI
 */
export function beneishMScore(current: Fundamentals, prior: Fundamentals): BeneishResult {
  const salesNow = finite(current.revenue);
  const salesPrev = finite(prior.revenue);

  // DSRI — days sales in receivables index
  const dsri = safeDivide(safeDivide(finite(current.receivables), salesNow), safeDivide(finite(prior.receivables), salesPrev));
  // GMI — gross margin index (prior margin over current margin; above 1 means margins deteriorated)
  const gmi = safeDivide(grossMargin(prior), grossMargin(current));
  // AQI — asset quality index: the share of assets that are neither current nor PP&E
  const assetQuality = (f: Fundamentals): number | null => {
    const assets = finite(f.totalAssets);
    const soft = safeDivide(finite(f.currentAssets) !== null && finite(f.propertyPlantEquipment) !== null ? (finite(f.currentAssets) as number) + (finite(f.propertyPlantEquipment) as number) : null, assets);
    return soft === null ? null : 1 - soft;
  };
  const aqi = safeDivide(assetQuality(current), assetQuality(prior));
  // SGI — sales growth index
  const sgi = safeDivide(salesNow, salesPrev);
  // DEPI — depreciation rate index
  const depRate = (f: Fundamentals): number | null => safeDivide(finite(f.depreciation), finite(f.depreciation) !== null && finite(f.propertyPlantEquipment) !== null ? (finite(f.depreciation) as number) + (finite(f.propertyPlantEquipment) as number) : null);
  const depi = safeDivide(depRate(prior), depRate(current));
  // SGAI — SG&A index
  const sgai = safeDivide(safeDivide(finite(current.sellingGeneralAdmin), salesNow), safeDivide(finite(prior.sellingGeneralAdmin), salesPrev));
  // LVGI — leverage index
  const leverage = (f: Fundamentals): number | null => safeDivide(finite(f.longTermDebt) !== null && finite(f.currentLiabilities) !== null ? (finite(f.longTermDebt) as number) + (finite(f.currentLiabilities) as number) : null, finite(f.totalAssets));
  const lvgi = safeDivide(leverage(current), leverage(prior));
  // TATA — total accruals to total assets
  const tata = safeDivide(finite(current.netIncome) !== null && finite(current.operatingCashFlow) !== null ? (finite(current.netIncome) as number) - (finite(current.operatingCashFlow) as number) : null, finite(current.totalAssets));

  const weighted: [string, string, number | null, number][] = [
    ["dsri", "Days sales in receivables index", dsri, 0.92],
    ["gmi", "Gross margin index", gmi, 0.528],
    ["aqi", "Asset quality index", aqi, 0.404],
    ["sgi", "Sales growth index", sgi, 0.892],
    ["depi", "Depreciation index", depi, 0.115],
    ["sgai", "SG&A index", sgai, -0.172],
    ["tata", "Total accruals to total assets", tata, 4.679],
    ["lvgi", "Leverage index", lvgi, -0.327],
  ];
  const components: ScoreComponent[] = weighted.map(([key, label, value, weight]) => ({ key, label, value, met: value !== null, weight }));

  // The intercept alone is not a score: every variable must be present for M to mean anything.
  const m = components.every((component) => component.value !== null)
    ? -4.84 + components.reduce((sum, component) => sum + (component.weight as number) * (component.value as number), 0)
    : null;

  return { m, flagged: m !== null && m > -1.78, components };
}
