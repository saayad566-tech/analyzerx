import { describe, expect, it } from "vitest";

import {
  DEFAULT_SCORING_CONFIG,
  SCORING_CONFIG_VERSION,
  altmanZ,
  beneishM,
  cagr,
  computeDeepScore,
  computeNewsImpact,
  contributionSum,
  dcfValue,
  evaluateOverlay,
  fuseSignals,
  marginOfSafety,
  metricForSector,
  piotroskiF,
  reverseDcfImpliedGrowth,
  sectorPercentile,
  sloanAccruals,
  topDrivers,
  winsorise,
  type DeepScoreInput,
  type SectorModel,
} from "../lib/scoring";

const sector: SectorModel = "generic";

/** A well-populated subject with a healthy peer set per metric. */
function baseInput(overrides: Partial<DeepScoreInput> = {}): DeepScoreInput {
  const metrics: Record<string, number> = {
    roce: 22, roe: 20, roicMinusWacc: 8, grossProfitability: 0.45, operatingMargin: 24, marginStability: 82, piotroskiF: 8,
    revenueCagr3y: 18, revenueCagr5y: 16, epsCagr3y: 20, ebitdaCagr3y: 17, fcfCagr3y: 12, growthConsistency: 75,
    pe: 22, pb: 3.2, evEbitda: 12, evSales: 2.4, peg: 1.1, fcfYield: 4.2, marginOfSafety: 12,
    debtToEquity: 0.3, netDebtToEbitda: 0.8, interestCoverage: 9, currentRatio: 2.1, quickRatio: 1.6, altmanZ: 4.2,
    cfoToPat: 1.1, fcfConversion: 0.85, sloanAccruals: -0.02, beneishM: -2.6, capexIntensity: 6,
    promoterHolding: 62, promoterHoldingTrend: 1.5, promoterPledge: 0, fiiDiiTrend: 2,
    emaHierarchy: 90, momentum12m1m: 14, rsiRegime: 65, relativeStrength: 1.1, drawdown: -8,
    marketShareTrend: 5, cycleMarginStability: 80, customerConcentration: 18,
  };
  // Peers are constructed to be strictly WORSE than the subject in the metric's
  // own direction, so the subject is genuinely a top-of-sector name (a median
  // peer set would score ~50 and could never be "strong").
  const lowerBetter = new Set(DEFAULT_SCORING_CONFIG.metrics.filter((metric) => metric.direction === "lower-better").map((metric) => metric.key));
  const peers: Record<string, number[]> = {};
  for (const [key, value] of Object.entries(metrics)) {
    peers[key] = lowerBetter.has(key)
      ? [value * 1.2, value * 1.4, value * 1.6, value * 1.8, value * 2.0]
      : [value * 0.2, value * 0.3, value * 0.4, value * 0.5, value * 0.6];
  }
  return { symbol: "TESTCO", sector, metrics, peers, ...overrides };
}

describe("scoring config", () => {
  it("exposes a version and pillar weights that sum to 1", () => {
    expect(SCORING_CONFIG_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    const total = DEFAULT_SCORING_CONFIG.pillars.reduce((acc, pillar) => acc + pillar.weight, 0);
    expect(Math.round(total * 100)).toBe(100);
  });

  it("removes D/E and current ratio for banks", () => {
    const debtToEquity = DEFAULT_SCORING_CONFIG.metrics.find((metric) => metric.key === "debtToEquity")!;
    expect(metricForSector(debtToEquity, "banks").weight).toBe(0);
    expect(metricForSector(debtToEquity, "generic").weight).toBeGreaterThan(0);
  });
});

describe("financial formulas", () => {
  it("computes CAGR and rejects non-positive endpoints", () => {
    expect(cagr(100, 121, 2)).toBe(10);
    expect(cagr(0, 100, 3)).toBeNull();
    expect(cagr(100, -5, 3)).toBeNull();
  });

  it("computes Altman Z and its distress zone", () => {
    const healthy = altmanZ({ workingCapital: 200, totalAssets: 1000, retainedEarnings: 300, ebit: 150, marketValueEquity: 900, totalLiabilities: 400, sales: 1200 });
    expect(healthy).not.toBeNull();
    expect(healthy!).toBeGreaterThan(1.81);
    const distressed = altmanZ({ workingCapital: -100, totalAssets: 1000, retainedEarnings: -200, ebit: -50, marketValueEquity: 50, totalLiabilities: 900, sales: 300 });
    expect(distressed!).toBeLessThan(1.81);
    expect(altmanZ({ workingCapital: 1, totalAssets: 0, retainedEarnings: 1, ebit: 1, marketValueEquity: 1, totalLiabilities: 1, sales: 1 })).toBeNull();
  });

  it("computes Sloan accruals with a sign that flags aggressive accounting", () => {
    expect(sloanAccruals(120, 100, 1000)).toBeCloseTo(0.02, 6);
    expect(sloanAccruals(100, 130, 1000)).toBeLessThan(0);
  });

  it("scores Piotroski F across nine tests", () => {
    const strong = piotroskiF({ roa: 12, cfo: 200, netIncome: 150, priorRoa: 10, debtToEquity: 0.3, priorDebtToEquity: 0.4, currentRatio: 2.1, priorCurrentRatio: 1.8, sharesOutstanding: 100, priorSharesOutstanding: 100, grossMargin: 40, priorGrossMargin: 38, assetTurnover: 1.2, priorAssetTurnover: 1.1 });
    expect(strong.score).toBe(9);
    const weak = piotroskiF({ roa: -2, cfo: -50, netIncome: -30, priorRoa: 1, debtToEquity: 2, priorDebtToEquity: 1, currentRatio: 0.8, priorCurrentRatio: 1.2, sharesOutstanding: 120, priorSharesOutstanding: 100, grossMargin: 20, priorGrossMargin: 25, assetTurnover: 0.6, priorAssetTurnover: 0.9 });
    expect(weak.score).toBe(0);
  });

  it("computes Beneish M and flags above -1.78", () => {
    const clean = beneishM({ dsri: 1.0, gmi: 1.0, aqi: 1.0, sgi: 1.0, depi: 1.0 });
    expect(clean!).toBeLessThan(-1.78);
    const suspect = beneishM({ dsri: 2.2, gmi: 1.6, aqi: 1.5, sgi: 1.8, depi: 0.7 });
    expect(suspect!).toBeGreaterThan(-1.78);
    expect(beneishM({ dsri: 1, gmi: 1, aqi: 1, sgi: 1, depi: null })).toBeNull();
  });

  it("prices a two-stage DCF and solves the reverse DCF", () => {
    const value = dcfValue({ fcf: 100, growthRate: 0.1, discountRate: 0.12, terminalGrowth: 0.04, years: 5 });
    expect(value).not.toBeNull();
    expect(value!).toBeGreaterThan(1000);
    const implied = reverseDcfImpliedGrowth({ fcf: 100, discountRate: 0.12, terminalGrowth: 0.04, years: 5, enterpriseValue: value! });
    expect(implied).not.toBeNull();
    expect(implied!).toBeCloseTo(0.1, 2);
    expect(dcfValue({ fcf: 100, growthRate: 0.1, discountRate: 0.03, terminalGrowth: 0.04 })).toBeNull();
  });

  it("computes margin of safety", () => {
    expect(marginOfSafety(200, 150)).toBe(25);
    expect(marginOfSafety(200, 0)).toBe(100);
  });
});

describe("percentile engine", () => {
  it("winsorises the tails", () => {
    const values = Array.from({ length: 100 }, (_, index) => index + 1);
    const cleaned = winsorise(values);
    expect(Math.min(...cleaned)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...cleaned)).toBeLessThanOrEqual(100);
  });

  it("ranks higher-better and inverts lower-better", () => {
    const peers = [10, 20, 30, 40, 50];
    expect(sectorPercentile(50, peers, "higher-better")).toBeGreaterThan(sectorPercentile(10, peers, "higher-better")!);
    expect(sectorPercentile(10, peers, "lower-better")).toBeGreaterThan(sectorPercentile(50, peers, "lower-better")!);
    expect(sectorPercentile(Number.NaN, peers)).toBeNull();
    expect(sectorPercentile(30, [])).toBe(50);
  });
});

describe("Deep Score engine", () => {
  it("produces a bounded score with confidence and a grade", () => {
    const result = computeDeepScore(baseInput());
    expect(result.score).not.toBeNull();
    expect(result.score!).toBeGreaterThanOrEqual(0);
    expect(result.score!).toBeLessThanOrEqual(100);
    expect(result.confidence).toBeGreaterThan(0.6);
    expect(result.grade).not.toBe("Provisional");
    expect(result.configVersion).toBe(SCORING_CONFIG_VERSION);
    expect(result.pillars).toHaveLength(8);
  });

  it("is deterministic — identical inputs yield an identical score", () => {
    expect(computeDeepScore(baseInput())).toEqual(computeDeepScore(baseInput()));
  });

  it("never yields NaN when metrics are missing, and drops confidence", () => {
    const sparse = computeDeepScore(baseInput({ metrics: { roce: 20, roe: 18 } }));
    expect(JSON.stringify(sparse)).not.toContain("NaN");
    expect(sparse.confidence).toBeLessThan(0.5);
    expect(sparse.grade).toBe("Provisional");
    expect(sparse.unavailable.length).toBeGreaterThan(0);
    if (sparse.score !== null) expect(Number.isFinite(sparse.score)).toBe(true);
  });

  it("applies the risk overlay and caps it", () => {
    const input = baseInput({
      metrics: { ...baseInput().metrics, promoterPledge: 60, altmanZ: 1.2, beneishM: -1.5, interestCoverage: 1.1 },
      flags: { negativeCfoThreeYears: true, auditorQualifiedOrResigned: true, majorRegulatoryAction: true },
    });
    const overlay = evaluateOverlay(input, DEFAULT_SCORING_CONFIG);
    expect(overlay.total).toBe(-DEFAULT_SCORING_CONFIG.overlay.cap);
    const result = computeDeepScore(input);
    expect(result.overlayTotal).toBe(-DEFAULT_SCORING_CONFIG.overlay.cap);
    expect(result.score!).toBeLessThan(result.preOverlayScore!);
    expect(result.overlayPenalties.length).toBeGreaterThan(0);
  });

  it("explains the score: contributions sum to the pre-overlay composite", () => {
    const result = computeDeepScore(baseInput());
    const total = contributionSum(result);
    expect(total).not.toBeNull();
    expect(Math.abs((total as number) - (result.preOverlayScore as number))).toBeLessThan(0.5);
    const drivers = topDrivers(result);
    expect(drivers.positive.length + drivers.negative.length).toBeGreaterThan(0);
  });

  it("treats a negative P/E as unavailable, not cheap", () => {
    const result = computeDeepScore(baseInput({ metrics: { ...baseInput().metrics, pe: -8 } }));
    const pe = result.contributions.find((item) => item.key === "pe")!;
    expect(pe.available).toBe(false);
    expect(result.unavailable.some((item) => item.key === "pe")).toBe(true);
  });

  it("falls back to labelled absolute anchors when no peer sample exists", () => {
    const result = computeDeepScore(baseInput({ peers: {} }));
    expect(result.peerSource).toBe("baseline");
    expect(result.score).not.toBeNull();
    const roe = result.contributions.find((item) => item.key === "roe")!;
    expect(roe.percentileSource).toBe("baseline");
    // A strong ROE must still score above the midpoint under the anchors.
    expect(roe.percentile!).toBeGreaterThan(50);
  });

  it("drops D/E from a bank's scoring", () => {
    const result = computeDeepScore(baseInput({ sector: "banks" }));
    expect(result.contributions.some((item) => item.key === "debtToEquity")).toBe(false);
  });

  it("decays confidence with stale data", () => {
    const fresh = computeDeepScore(baseInput());
    const stale = computeDeepScore(baseInput({ freshness: 0.5 }));
    expect(stale.confidence).toBeLessThan(fresh.confidence);
  });
});

describe("News Impact engine", () => {
  it("is signed, bounded, and decays with time", () => {
    const fresh = computeNewsImpact({ sentiment: 0.6, eventType: "results_beat", materialityRatio: 0.05, sourceTier: "tier1", centrality: 0.9, ageHours: 0 });
    expect(fresh.impact).toBeGreaterThan(0);
    expect(fresh.direction).toBe("positive");
    const stale = computeNewsImpact({ sentiment: 0.6, eventType: "results_beat", materialityRatio: 0.05, sourceTier: "tier1", centrality: 0.9, ageHours: 72 });
    expect(Math.abs(stale.impact)).toBeLessThan(Math.abs(fresh.impact));
    expect(Math.abs(fresh.impact)).toBeLessThanOrEqual(100);
  });

  it("down-weights low-tier and rumour sources", () => {
    const tier1 = computeNewsImpact({ sentiment: 0, eventType: "order_win", materialityRatio: 0.2, sourceTier: "tier1", centrality: 1, ageHours: 0 });
    const tier3 = computeNewsImpact({ sentiment: 0, eventType: "order_win", materialityRatio: 0.2, sourceTier: "tier3", centrality: 1, ageHours: 0 });
    const rumour = computeNewsImpact({ sentiment: 0, eventType: "order_win", materialityRatio: 0.2, sourceTier: "tier3", rumour: true, centrality: 1, ageHours: 0 });
    expect(tier3.magnitude).toBeLessThan(tier1.magnitude);
    expect(rumour.magnitude).toBeLessThan(tier3.magnitude);
  });

  it("returns zero, not NaN, when there is no catalyst or sentiment", () => {
    const flat = computeNewsImpact({ sentiment: 0, eventType: "none", materialityRatio: 0, sourceTier: "tier3", centrality: 0, ageHours: 5 });
    expect(flat.impact).toBe(0);
    expect(flat.direction).toBe("neutral");
    expect(JSON.stringify(flat)).not.toContain("NaN");
  });

  it("keeps long-lived events alive longer than rumours", () => {
    const mna = computeNewsImpact({ sentiment: 0, eventType: "mna", materialityRatio: 0.3, sourceTier: "tier1", centrality: 1, ageHours: 48 });
    const rumour = computeNewsImpact({ sentiment: 0, eventType: "none", materialityRatio: 0.3, sourceTier: "tier1", centrality: 1, ageHours: 48 });
    expect(mna.decayFactor).toBeGreaterThan(rumour.decayFactor);
  });
});

describe("fusion layer", () => {
  it("raises a re-check flag on a severe negative event", () => {
    const deep = computeDeepScore(baseInput());
    const news = computeNewsImpact({ sentiment: -0.9, eventType: "fraud", materialityRatio: 0.4, sourceTier: "tier1", centrality: 1, ageHours: 0 });
    const fusion = fuseSignals(deep, news);
    expect(fusion.recheckFlag).toBe(true);
    expect(fusion.recheckReason).toContain("re-check");
  });

  it("only flags a watchlist opportunity on a strong Deep Score", () => {
    const news = computeNewsImpact({ sentiment: 0.9, eventType: "order_win", materialityRatio: 0.5, sourceTier: "tier1", centrality: 1, ageHours: 0 });
    const strong = fuseSignals(computeDeepScore(baseInput()), news);
    expect(strong.watchlistOpportunity).toBe(true);
    const weak = fuseSignals(computeDeepScore(baseInput({ metrics: { roce: 1, roe: 1, operatingMargin: 1, pe: 90 } })), news);
    expect(weak.watchlistOpportunity).toBe(false);
  });

  it("reports a 2x2 quadrant", () => {
    const deep = computeDeepScore(baseInput());
    const positive = computeNewsImpact({ sentiment: 0.8, eventType: "results_beat", materialityRatio: 0.2, sourceTier: "tier1", centrality: 1, ageHours: 0 });
    expect(fuseSignals(deep, positive).quadrant).toBe("strong-positive");
    expect(fuseSignals(null, null).quadrant).toBe("unavailable");
  });
});
