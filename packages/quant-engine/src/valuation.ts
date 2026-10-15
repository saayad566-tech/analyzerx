/**
 * Valuation, macro-regime and cost-curve models.
 *
 * Every one of these takes its inputs explicitly. A DCF with an invented growth rate or a WACC
 * plucked from nowhere produces a precise-looking number that means nothing, so nothing here
 * supplies a default the caller did not give.
 */

// --- discounted cash flow ----------------------------------------------------------------------

export type DcfInput = {
  /** Projected free cash flows, one per period, in order. */
  freeCashFlows: number[];
  /** Discount rate (WACC) as a fraction. Must exceed the terminal growth rate. */
  discountRate: number;
  /** Perpetuity growth rate after the explicit period, as a fraction. */
  terminalGrowth: number;
  /** Net debt (total debt minus cash). */
  netDebt?: number;
  sharesOutstanding?: number;
};

export type DcfResult = {
  enterpriseValue: number;
  equityValue: number;
  /** Present value of the explicit-period flows only. */
  explicitValue: number;
  terminalValue: number;
  terminalValuePv: number;
  /** Share of total value that sits in the terminal value — the honesty metric of any DCF. */
  terminalValueSharePct: number;
  perShare: number | null;
};

/**
 * Two-stage discounted cash flow: explicit-period flows plus a Gordon-growth terminal value.
 * Returns null when the discount rate does not exceed terminal growth, since the terminal value is
 * undefined there rather than merely large.
 */
export function discountedCashFlow(input: DcfInput): DcfResult | null {
  const { freeCashFlows, discountRate, terminalGrowth } = input;
  if (freeCashFlows.length === 0) return null;
  if (!Number.isFinite(discountRate) || !Number.isFinite(terminalGrowth)) return null;
  if (discountRate <= terminalGrowth) return null;

  let explicitValue = 0;
  for (let i = 0; i < freeCashFlows.length; i += 1) explicitValue += freeCashFlows[i] / (1 + discountRate) ** (i + 1);

  const finalFlow = freeCashFlows[freeCashFlows.length - 1];
  const terminalValue = (finalFlow * (1 + terminalGrowth)) / (discountRate - terminalGrowth);
  const terminalValuePv = terminalValue / (1 + discountRate) ** freeCashFlows.length;

  const enterpriseValue = explicitValue + terminalValuePv;
  const equityValue = enterpriseValue - (input.netDebt ?? 0);
  return {
    enterpriseValue,
    equityValue,
    explicitValue,
    terminalValue,
    terminalValuePv,
    terminalValueSharePct: enterpriseValue > 0 ? (terminalValuePv / enterpriseValue) * 100 : 0,
    perShare: input.sharesOutstanding && input.sharesOutstanding > 0 ? equityValue / input.sharesOutstanding : null,
  };
}

// --- deleveraging regime -----------------------------------------------------------------------

export type DeleveragingRegime = "beautiful-deleveraging" | "ugly-deleveraging" | "leveraging-growth" | "leveraging-stagnation";

export type DeleveragingResult = {
  regime: DeleveragingRegime;
  /** Change in the debt/GDP ratio over the window, in ratio points. */
  debtRatioChange: number;
  averageNominalGrowth: number;
  averageInterestRate: number;
  /** Growth above the interest rate is what makes a deleveraging orderly rather than deflationary. */
  growthExceedsRate: boolean;
};

/**
 * Dalio's deleveraging classification: falling debt/GDP with nominal growth above the interest rate
 * is an orderly ("beautiful") deleveraging; falling debt/GDP with growth below the rate is
 * deflationary ("ugly").
 */
export function deleveragingRegime(debtToGdp: number[], nominalGrowth: number[], interestRate: number[]): DeleveragingResult | null {
  if (debtToGdp.length < 2 || nominalGrowth.length === 0 || interestRate.length === 0) return null;
  const averageNominalGrowth = nominalGrowth.reduce((sum, value) => sum + value, 0) / nominalGrowth.length;
  const averageInterestRate = interestRate.reduce((sum, value) => sum + value, 0) / interestRate.length;
  if (!Number.isFinite(averageNominalGrowth) || !Number.isFinite(averageInterestRate)) return null;

  const debtRatioChange = debtToGdp[debtToGdp.length - 1] - debtToGdp[0];
  const falling = debtRatioChange < 0;
  const growthExceedsRate = averageNominalGrowth > averageInterestRate;
  const regime: DeleveragingRegime = falling
    ? growthExceedsRate
      ? "beautiful-deleveraging"
      : "ugly-deleveraging"
    : growthExceedsRate
      ? "leveraging-growth"
      : "leveraging-stagnation";
  return { regime, debtRatioChange, averageNominalGrowth, averageInterestRate, growthExceedsRate };
}

// --- capital cycle -----------------------------------------------------------------------------

export type CapitalCyclePhase = "underinvestment" | "balanced" | "expansion" | "overcapacity";
export type CapitalCycleSignal = "favourable" | "neutral" | "unfavourable";

export type CapitalCycleResult = {
  phase: CapitalCyclePhase;
  signal: CapitalCycleSignal;
  /** Capex relative to depreciation. Below 1 means the asset base is shrinking. */
  capexToDepreciation: number | null;
  rationale: string;
};

/**
 * Capital-cycle positioning: when an industry invests less than it consumes (capex below
 * depreciation) while demand grows, future supply is constrained — the favourable setup. Heavy capex
 * with weak demand is the opposite.
 */
export function capitalCycle(input: { capexGrowth: number; depreciationGrowth: number; demandGrowth: number }): CapitalCycleResult | null {
  const { capexGrowth, depreciationGrowth, demandGrowth } = input;
  if (![capexGrowth, depreciationGrowth, demandGrowth].every(Number.isFinite)) return null;

  const capexToDepreciation = depreciationGrowth !== 0 ? 1 + capexGrowth / (1 + depreciationGrowth) - 1 : null;
  const investing = capexGrowth > depreciationGrowth;
  const demandStrong = demandGrowth > 0;

  if (!investing && demandStrong) {
    return { phase: "underinvestment", signal: "favourable", capexToDepreciation, rationale: "Capital is leaving the industry while demand grows, so future supply is constrained." };
  }
  if (investing && !demandStrong) {
    return { phase: "overcapacity", signal: "unfavourable", capexToDepreciation, rationale: "Capital is entering the industry while demand is weak, which compresses future returns." };
  }
  if (investing && demandStrong) {
    return { phase: "expansion", signal: "neutral", capexToDepreciation, rationale: "Capacity is expanding into growing demand; returns depend on how much of the capex is disciplined." };
  }
  return { phase: "balanced", signal: "neutral", capexToDepreciation, rationale: "Investment and demand are moving together, with no clear supply imbalance." };
}

// --- commodity cost curve ----------------------------------------------------------------------

export type CostCurveProducer = { name: string; allInSustainingCost: number; production: number };

export type CostCurveResult = {
  ranked: { name: string; allInSustainingCost: number; production: number; cumulativeProduction: number; percentile: number }[];
  totalProduction: number;
  /** Weighted average cost across all producers. */
  weightedAverageCost: number;
  /** Cost at which 90% of production is supplied — the marginal producer's cost. */
  marginalCost90: number;
  /** Producers below the 90th-percentile cost are the low-cost survivors. */
  lowCostProducers: string[];
};

/**
 * Rank producers along a cost curve. The marginal (90th-percentile) cost is the price the market
 * needs to clear supply; producers below it are the ones that survive a downturn.
 */
export function commodityCostCurve(producers: CostCurveProducer[]): CostCurveResult | null {
  const usable = producers.filter((producer) => Number.isFinite(producer.allInSustainingCost) && Number.isFinite(producer.production) && producer.production > 0);
  if (usable.length === 0) return null;

  const sorted = [...usable].sort((a, b) => a.allInSustainingCost - b.allInSustainingCost);
  const totalProduction = sorted.reduce((sum, producer) => sum + producer.production, 0);
  if (!(totalProduction > 0)) return null;

  let cumulative = 0;
  const ranked = sorted.map((producer) => {
    cumulative += producer.production;
    return { ...producer, cumulativeProduction: cumulative, percentile: (cumulative / totalProduction) * 100 };
  });

  const weightedAverageCost = sorted.reduce((sum, producer) => sum + producer.allInSustainingCost * producer.production, 0) / totalProduction;
  const crossing = ranked.find((producer) => producer.percentile >= 90);
  const marginalCost90 = crossing ? crossing.allInSustainingCost : ranked[ranked.length - 1].allInSustainingCost;

  return {
    ranked,
    totalProduction,
    weightedAverageCost,
    marginalCost90,
    lowCostProducers: ranked.filter((producer) => producer.allInSustainingCost <= marginalCost90).map((producer) => producer.name),
  };
}
