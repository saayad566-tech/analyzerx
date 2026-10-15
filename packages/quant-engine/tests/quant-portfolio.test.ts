import { describe, expect, it } from "vitest";

import {
  buildFamaFrenchFactors, covarianceMatrix, eigen2x2, invertMatrix, johansenTrace, markowitzWeights,
  multiplyMatrices, purgedKFold, regressOnFactors, type FactorAsset,
} from "../src/portfolio";
import { detectHighTightFlag, detectVolatilityContraction, fractalSwingHighs, fractalSwingLows } from "../src/patterns";
import { capitalCycle, commodityCostCurve, deleveragingRegime, discountedCashFlow } from "../src/valuation";
import type { Candle } from "../src/core-types";

function rng(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build candles from a price path. The high/low derive from the close only, so a swing is decided by
 * the path alone — deriving them from the open creates ties that mask genuine swing points.
 */
function fromPath(path: number[], volumes?: number[]): Candle[] {
  return path.map((close, i) => ({
    time: i,
    open: i === 0 ? close : path[i - 1],
    high: close + 0.5,
    low: close - 0.5,
    close,
    volume: volumes?.[i] ?? 1_000,
  }));
}

describe("linear algebra primitives", () => {
  it("inverts a matrix and rejects a singular one", () => {
    const inverse = invertMatrix([[4, 7], [2, 6]])!;
    expect(inverse[0][0]).toBeCloseTo(0.6, 10);
    expect(inverse[0][1]).toBeCloseTo(-0.7, 10);
    expect(inverse[1][0]).toBeCloseTo(-0.2, 10);
    expect(inverse[1][1]).toBeCloseTo(0.4, 10);
    expect(invertMatrix([[1, 2], [2, 4]])).toBeNull(); // singular
  });

  it("computes 2x2 eigenvalues in descending order", () => {
    expect(eigen2x2([[2, 1], [1, 2]])).toEqual([3, 1]);
    expect(eigen2x2([[0, -1], [1, 0]])).toBeNull(); // complex eigenvalues
  });

  it("multiplies matrices", () => {
    expect(multiplyMatrices([[1, 2]], [[3], [4]])).toEqual([[11]]);
  });

  it("builds a covariance matrix", () => {
    const covariance = covarianceMatrix([[1, 2, 3], [2, 4, 6]])!;
    expect(covariance[0][0]).toBeCloseTo(1, 10);
    expect(covariance[1][1]).toBeCloseTo(4, 10);
    expect(covariance[0][1]).toBeCloseTo(2, 10);
  });
});

describe("Markowitz mean-variance", () => {
  const a = [0.01, -0.01, 0.02, -0.02, 0.01, 0.0];
  const b = [0.005, 0.005, -0.005, -0.005, 0.0, 0.002];

  it("produces weights that sum to one", () => {
    const result = markowitzWeights([a, b])!;
    expect(result.weights.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 8);
    expect(result.volatility).toBeGreaterThan(0);
    expect(typeof result.hasShortPositions).toBe("boolean");
  });

  it("refuses a singular covariance matrix rather than inventing weights", () => {
    expect(markowitzWeights([a, a])).toBeNull();
  });

  it("refuses a single asset", () => {
    expect(markowitzWeights([a])).toBeNull();
  });
});

describe("Fama-French factor construction", () => {
  const constant = (value: number) => [value, value, value];
  const assets: FactorAsset[] = [
    { symbol: "A", returns: constant(0.03), marketCap: 100, bookToMarket: 0.9, profitability: 0.9, investment: 0.05 },
    { symbol: "B", returns: constant(0.03), marketCap: 200, bookToMarket: 0.8, profitability: 0.8, investment: 0.05 },
    { symbol: "C", returns: constant(0.02), marketCap: 300, bookToMarket: 0.5, profitability: 0.5, investment: 0.05 },
    { symbol: "D", returns: constant(0.02), marketCap: 400, bookToMarket: 0.4, profitability: 0.4, investment: 0.05 },
    { symbol: "E", returns: constant(0.01), marketCap: 500, bookToMarket: 0.2, profitability: 0.2, investment: 0.5 },
    { symbol: "F", returns: constant(0.01), marketCap: 600, bookToMarket: 0.1, profitability: 0.1, investment: 0.5 },
  ];

  it("builds all five factors as long-minus-short spreads", () => {
    const result = buildFamaFrenchFactors(assets)!;
    expect(result.observations).toBe(3);
    // Small (A,B) minus big (E,F): 0.03 − 0.01
    expect(result.factors.SMB[0]).toBeCloseTo(0.02, 10);
    expect(result.factors.HML[0]).toBeCloseTo(0.02, 10);
    expect(result.factors.RMW[0]).toBeCloseTo(0.02, 10);
    expect(result.factors.CMA[0]).toBeCloseTo(0.02, 10);
    // Equal-weighted universe mean: (0.03+0.03+0.02+0.02+0.01+0.01)/6
    expect(result.factors.MKT[0]).toBeCloseTo(0.02, 10);
    expect(result.legSizes.SMB).toBe(2);
  });

  it("refuses a universe too small to form legs", () => {
    expect(buildFamaFrenchFactors(assets.slice(0, 3))).toBeNull();
  });

  it("recovers known factor loadings by regression", () => {
    // The factor series must be linearly independent, or the normal equations are singular. A
    // periodic construction here makes them exactly collinear and the solver (correctly) refuses.
    const random = rng(20241015);
    const draw = () => Array.from({ length: 12 }, () => Number(((random() - 0.5) * 0.06).toFixed(6)));
    const factors = { MKT: draw(), SMB: draw(), HML: draw(), RMW: draw(), CMA: draw() };
    expect(invertMatrix(covarianceMatrix([factors.MKT, factors.SMB, factors.HML, factors.RMW, factors.CMA])!)).not.toBeNull();
    const truth = [1.0, 0.5, -0.3, 0.2, 0.1];
    const alpha = 0.001;
    const excess = factors.MKT.map((_, t) =>
      alpha + truth[0] * factors.MKT[t] + truth[1] * factors.SMB[t] + truth[2] * factors.HML[t] + truth[3] * factors.RMW[t] + truth[4] * factors.CMA[t],
    );
    const regression = regressOnFactors(excess, factors)!;
    expect(regression).not.toBeNull();
    expect(regression.alpha).toBeCloseTo(alpha, 8);
    regression.loadings.forEach((loading, i) => expect(loading).toBeCloseTo(truth[i], 6));
  });
});

describe("Johansen cointegration (bivariate)", () => {
  it("detects a cointegrated pair", () => {
    const random = rng(4242);
    let level = 100;
    const x: number[] = [];
    for (let i = 0; i < 220; i += 1) { level += (random() - 0.5) * 2; x.push(level); }
    const y = x.map((value) => 2 * value + (random() - 0.5) * 2);
    const result = johansenTrace(y, x)!;
    expect(result).not.toBeNull();
    expect(result.traceStatistic).toBeGreaterThan(result.criticalValue);
    expect(result.cointegrated).toBe(true);
    expect(result.eigenvalues[0]).toBeGreaterThanOrEqual(result.eigenvalues[1]);
  });

  it("does not call two independent walks cointegrated", () => {
    const random = rng(777);
    let a = 100; let b = 50;
    const x: number[] = []; const y: number[] = [];
    for (let i = 0; i < 220; i += 1) { a += (random() - 0.5) * 2; b += (random() - 0.5) * 4; x.push(a); y.push(b); }
    const result = johansenTrace(y, x)!;
    expect(result.cointegrated).toBe(false);
  });

  it("refuses a sample that is too short", () => {
    expect(johansenTrace([1, 2, 3], [1, 2, 3])).toBeNull();
  });
});

describe("purged and embargoed cross-validation", () => {
  it("never leaks a test index into training, and honours the purge and embargo", () => {
    const folds = purgedKFold(100, 5, 2, 0.02)!;
    expect(folds).toHaveLength(5);
    for (const fold of folds) {
      const testStart = fold.test[0];
      const testEnd = fold.test[fold.test.length - 1] + 1;
      for (const index of fold.train) {
        expect(fold.test).not.toContain(index);
        // Purge: a training point whose label horizon reaches into the test window is removed.
        expect(index + 2 >= testStart && index <= testEnd - 1).toBe(false);
        // Embargo: a span immediately after the test window is removed.
        expect(index >= testEnd && index < testEnd + 2).toBe(false);
      }
    }
  });

  it("refuses impossible parameters", () => {
    expect(purgedKFold(3, 2)).toBeNull();
    expect(purgedKFold(100, 1)).toBeNull();
    expect(purgedKFold(100, 200)).toBeNull();
  });
});

describe("pattern detection", () => {
  it("finds fractal swing highs and lows", () => {
    const candles = fromPath([1, 2, 3, 5, 3, 2, 1]);
    expect(fractalSwingHighs(candles, 2)).toEqual([3]);
    const trough = fromPath([5, 4, 3, 1, 3, 4, 5]);
    expect(fractalSwingLows(trough, 2)).toEqual([3]);
  });

  it("detects a volatility contraction pattern", () => {
    // Two pullbacks, the second shallower, volume drying up, in an uptrend.
    const path = [100, 102, 105, 108, 112, 116, 120, 118, 115, 112, 110, 108, 112, 114, 116, 118, 117, 115, 114, 113, 114, 115, 116, 118];
    const volumes = path.map((_, i) => (i < 16 ? 2_000 : 800));
    const result = detectVolatilityContraction(fromPath(path, volumes), { lookback: 24 })!;
    expect(result).not.toBeNull();
    expect(result.contractions.length).toBeGreaterThanOrEqual(2);
    expect(result.contracting).toBe(true);
    expect(result.trendUp).toBe(true);
    expect(result.volumeDryingUp).toBe(true);
    expect(result.finalDepthPct).toBeLessThanOrEqual(12);
    expect(result.detected).toBe(true);
  });

  it("reports a near-miss as not detected rather than rounding it into a signal", () => {
    // Same shape but the final contraction is deeper than the one before it.
    const path = [100, 102, 105, 108, 112, 116, 120, 118, 115, 112, 110, 108, 112, 114, 116, 118, 112, 106, 100, 96, 98, 99, 100, 101];
    const result = detectVolatilityContraction(fromPath(path), { lookback: 24 })!;
    expect(result.detected).toBe(false);
  });

  it("refuses a series too short to contain a pattern", () => {
    expect(detectVolatilityContraction(fromPath([1, 2, 3]), { lookback: 24 })).toBeNull();
  });

  it("detects a high tight flag", () => {
    const rise = Array.from({ length: 25 }, (_, i) => 100 + i * (100 / 24));
    const consolidate = Array.from({ length: 25 }, (_, i) => 200 - i * (15 / 24));
    const path = [...rise, ...consolidate];
    const volumes = path.map((_, i) => (i < 25 ? 2_000 : 800));
    const result = detectHighTightFlag(fromPath(path, volumes))!;
    expect(result.advancePct).toBeGreaterThanOrEqual(100);
    expect(result.pullbackPct).toBeLessThanOrEqual(25);
    expect(result.detected).toBe(true);
  });

  it("rejects a flag whose consolidation is too deep", () => {
    const rise = Array.from({ length: 25 }, (_, i) => 100 + i * (100 / 24));
    const collapse = Array.from({ length: 25 }, (_, i) => 200 - i * 3); // a 37% retracement
    const result = detectHighTightFlag(fromPath([...rise, ...collapse]))!;
    expect(result.detected).toBe(false);
  });
});

describe("valuation and macro models", () => {
  it("discounts cash flows and reports how much value sits in the terminal value", () => {
    const result = discountedCashFlow({ freeCashFlows: [100, 110, 121], discountRate: 0.1, terminalGrowth: 0.03, netDebt: 200, sharesOutstanding: 100 })!;
    expect(result.explicitValue).toBeCloseTo(272.7273, 3);
    expect(result.terminalValue).toBeCloseTo(1_780.4286, 3);
    expect(result.enterpriseValue).toBeCloseTo(result.explicitValue + result.terminalValuePv, 6);
    expect(result.equityValue).toBeCloseTo(result.enterpriseValue - 200, 6);
    expect(result.perShare).toBeCloseTo(result.equityValue / 100, 8);
    expect(result.terminalValueSharePct).toBeGreaterThan(50); // and the caller can see that
  });

  it("refuses a DCF whose growth rate meets or exceeds the discount rate", () => {
    expect(discountedCashFlow({ freeCashFlows: [100], discountRate: 0.05, terminalGrowth: 0.05 })).toBeNull();
    expect(discountedCashFlow({ freeCashFlows: [100], discountRate: 0.04, terminalGrowth: 0.06 })).toBeNull();
    expect(discountedCashFlow({ freeCashFlows: [], discountRate: 0.1, terminalGrowth: 0.03 })).toBeNull();
  });

  it("classifies the four deleveraging regimes", () => {
    expect(deleveragingRegime([100, 95], [0.05], [0.02])!.regime).toBe("beautiful-deleveraging");
    expect(deleveragingRegime([100, 95], [0.01], [0.03])!.regime).toBe("ugly-deleveraging");
    expect(deleveragingRegime([100, 105], [0.05], [0.02])!.regime).toBe("leveraging-growth");
    expect(deleveragingRegime([100, 105], [0.01], [0.03])!.regime).toBe("leveraging-stagnation");
  });

  it("classifies the capital cycle", () => {
    expect(capitalCycle({ capexGrowth: -0.1, depreciationGrowth: 0.02, demandGrowth: 0.05 })!.phase).toBe("underinvestment");
    expect(capitalCycle({ capexGrowth: -0.1, depreciationGrowth: 0.02, demandGrowth: 0.05 })!.signal).toBe("favourable");
    expect(capitalCycle({ capexGrowth: 0.2, depreciationGrowth: 0.02, demandGrowth: -0.05 })!.phase).toBe("overcapacity");
    expect(capitalCycle({ capexGrowth: 0.2, depreciationGrowth: 0.02, demandGrowth: -0.05 })!.signal).toBe("unfavourable");
    expect(capitalCycle({ capexGrowth: 0.2, depreciationGrowth: 0.02, demandGrowth: 0.05 })!.phase).toBe("expansion");
    expect(capitalCycle({ capexGrowth: -0.1, depreciationGrowth: 0.02, demandGrowth: -0.05 })!.phase).toBe("balanced");
  });

  it("ranks a commodity cost curve to the marginal producer", () => {
    const result = commodityCostCurve([
      { name: "Cheap", allInSustainingCost: 10, production: 400 },
      { name: "Mid", allInSustainingCost: 20, production: 100 },
      { name: "High", allInSustainingCost: 30, production: 50 },
      { name: "Marginal", allInSustainingCost: 40, production: 50 },
    ])!;
    expect(result.ranked[0].name).toBe("Cheap");
    expect(result.totalProduction).toBe(600);
    // Cumulative percentiles: 66.7, 83.3, 91.7, 100 → the 90th percentile lands on "High".
    expect(result.marginalCost90).toBe(30);
    expect(result.lowCostProducers).toEqual(["Cheap", "Mid", "High"]);
    expect(result.weightedAverageCost).toBeCloseTo((10 * 400 + 20 * 100 + 30 * 50 + 40 * 50) / 600, 6);
  });

  it("refuses an empty cost curve", () => {
    expect(commodityCostCurve([])).toBeNull();
  });
});
