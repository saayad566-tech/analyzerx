import { describe, expect, it } from "vitest";

import { altmanZScore, beneishMScore, grossMargin, piotroskiFScore } from "../src/scores";
import {
  adfStatistic, capePercentile, correlationMatrix, cumulativeReturn, engleGranger, factorSpread,
  fitGarch11, fractionalKelly, hrpWeights, kellyFraction, kellyFromReturns, momentum12_1, ols,
  shillerCape, solveLeastSquares, yieldCurve,
} from "../src/risk";
import type { Fundamentals } from "../src/fundamentals";
import { correlatedPair, noisyReturns, realisticCandles } from "./fixtures/market";

/** Deterministic PRNG so every generated series is reproducible. */
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

const strong = (over: Partial<Fundamentals> = {}): Fundamentals => ({
  symbol: "STRONG",
  netIncome: 100, totalAssets: 1_000, operatingCashFlow: 150,
  longTermDebt: 100, currentAssets: 500, currentLiabilities: 200, sharesOutstanding: 100,
  revenue: 1_000, grossProfit: 400,
  ...over,
});

const strongPrior = (over: Partial<Fundamentals> = {}): Fundamentals => ({
  symbol: "STRONG",
  netIncome: 80, totalAssets: 1_000, operatingCashFlow: 90,
  longTermDebt: 200, currentAssets: 400, currentLiabilities: 250, sharesOutstanding: 100,
  revenue: 900, grossProfit: 300,
  ...over,
});

describe("Piotroski F-Score", () => {
  it("awards all nine points to a company improving on every measure", () => {
    const result = piotroskiFScore(strong(), strongPrior());
    expect(result.score).toBe(9);
    expect(result.evaluable).toBe(9);
    expect(result.strong).toBe(true);
  });

  it("withholds points where the evidence is absent", () => {
    const result = piotroskiFScore(strong(), { symbol: "BLANK" });
    expect(result.score).toBeLessThan(9);
    expect(result.strong).toBe(false);
    // The three period-over-period signals cannot be judged without a prior period.
    const uncomputable = result.components.filter((component) => component.value === null).map((component) => component.key);
    expect(uncomputable).toContain("roa-improving");
    expect(uncomputable).toContain("margin-up");
  });

  it("does not award a point for deteriorating profitability", () => {
    const result = piotroskiFScore(strong({ netIncome: -50 }), strongPrior());
    const roa = result.components.find((component) => component.key === "roa-positive");
    expect(roa?.met).toBe(false);
  });

  it("flags a company that diluted shareholders", () => {
    const result = piotroskiFScore(strong({ sharesOutstanding: 150 }), strongPrior());
    expect(result.components.find((component) => component.key === "no-dilution")?.met).toBe(false);
  });
});

describe("Altman Z-Score", () => {
  it("scores a strong balance sheet as safe", () => {
    const result = altmanZScore({
      symbol: "SAFE", currentAssets: 800, currentLiabilities: 300, totalAssets: 1_000,
      retainedEarnings: 300, ebit: 200, marketCap: 2_000, totalLiabilities: 500, revenue: 1_500,
    });
    expect(result.z).toBeCloseTo(5.58, 4);
    expect(result.zone).toBe("safe");
  });

  it("scores a distressed balance sheet as distress", () => {
    const result = altmanZScore({
      symbol: "RISK", currentAssets: 200, currentLiabilities: 400, totalAssets: 1_000,
      retainedEarnings: -100, ebit: 20, marketCap: 100, totalLiabilities: 900, revenue: 300,
    });
    expect(result.z).toBeCloseTo(0.0527, 3);
    expect(result.zone).toBe("distress");
  });

  it("reports unknown rather than a number when inputs are missing", () => {
    const result = altmanZScore({ symbol: "EMPTY" });
    expect(result.z).toBeNull();
    expect(result.zone).toBe("unknown");
    expect(result.components.every((component) => component.value === null)).toBe(true);
  });

  it("still computes the private-firm variant without sales", () => {
    const result = altmanZScore({ symbol: "PRIV", currentAssets: 800, currentLiabilities: 300, totalAssets: 1_000, retainedEarnings: 300, ebit: 200, equity: 600, totalLiabilities: 500 });
    expect(result.z).toBeNull(); // X5 needs revenue
    expect(result.zDoublePrime).not.toBeNull();
  });
});

describe("Beneish M-Score", () => {
  const current: Fundamentals = {
    symbol: "CLEAN", revenue: 1_000, receivables: 200, costOfRevenue: 600, currentAssets: 500,
    propertyPlantEquipment: 300, totalAssets: 1_000, depreciation: 50, sellingGeneralAdmin: 100,
    longTermDebt: 100, currentLiabilities: 200, netIncome: 100, operatingCashFlow: 120,
  };
  const prior: Fundamentals = {
    symbol: "CLEAN", revenue: 900, receivables: 150, costOfRevenue: 560, currentAssets: 450,
    propertyPlantEquipment: 280, totalAssets: 950, depreciation: 45, sellingGeneralAdmin: 90,
    longTermDebt: 120, currentLiabilities: 190, netIncome: 80, operatingCashFlow: 90,
  };

  it("computes the published eight-variable formula", () => {
    const result = beneishMScore(current, prior);
    expect(result.m).toBeCloseTo(-2.3521, 3);
    expect(result.flagged).toBe(false);
    expect(result.components).toHaveLength(8);
    // Spot-check two variables against their definitions.
    expect(result.components.find((c) => c.key === "dsri")?.value).toBeCloseTo(1.2, 6);
    expect(result.components.find((c) => c.key === "sgi")?.value).toBeCloseTo(1.111111, 5);
  });

  it("applies the published coefficients", () => {
    const result = beneishMScore(current, prior);
    const weights = Object.fromEntries(result.components.map((c) => [c.key, c.weight]));
    expect(weights.tata).toBeCloseTo(4.679, 10);
    expect(weights.sgai).toBeCloseTo(-0.172, 10);
    expect(weights.lvgi).toBeCloseTo(-0.327, 10);
  });

  it("returns no score when a variable cannot be computed", () => {
    const result = beneishMScore({ symbol: "PARTIAL", revenue: 1_000 }, prior);
    expect(result.m).toBeNull();
    expect(result.flagged).toBe(false);
  });

  it("flags a company with ballooning receivables and accruals", () => {
    const manipulator = { ...current, receivables: 600, netIncome: 300, operatingCashFlow: 10 };
    const result = beneishMScore(manipulator, prior);
    expect(result.m).not.toBeNull();
    expect(result.flagged).toBe(true);
  });

  it("uses reported gross profit, falling back to revenue minus cost of revenue", () => {
    expect(grossMargin({ symbol: "X", revenue: 1_000, grossProfit: 400 })).toBeCloseTo(0.4, 10);
    expect(grossMargin({ symbol: "X", revenue: 1_000, costOfRevenue: 600 })).toBeCloseTo(0.4, 10);
    expect(grossMargin({ symbol: "X", revenue: 0 })).toBeNull();
  });
});

describe("least squares and cointegration", () => {
  it("recovers an exact linear relationship", () => {
    const x = [1, 2, 3, 4, 5];
    const y = x.map((value) => 3 + 2 * value);
    const fit = ols(y, x)!;
    expect(fit.intercept).toBeCloseTo(3, 8);
    expect(fit.slope).toBeCloseTo(2, 8);
    expect(fit.residuals.every((r) => Math.abs(r) < 1e-8)).toBe(true);
  });

  it("returns null for a singular system instead of fabricating coefficients", () => {
    expect(solveLeastSquares([[1, 1], [2, 2]], [1, 2])).toBeNull();
  });

  it("finds a cointegrated pair", () => {
    const random = rng(1234);
    let level = 100;
    const x: number[] = [];
    for (let i = 0; i < 300; i += 1) { level += (random() - 0.5) * 2; x.push(level); }
    const y = x.map((value) => 2 * value + (random() - 0.5) * 2); // 2x plus stationary noise
    const result = engleGranger(y, x)!;
    expect(result.slope).toBeCloseTo(2, 1);
    expect(result.cointegrated).toBe(true);
    expect(result.adf.statistic).toBeLessThan(result.criticalValue);
  });

  it("does not declare independence to be cointegration", () => {
    const random = rng(99);
    let a = 100; let b = 50;
    const x: number[] = []; const y: number[] = [];
    for (let i = 0; i < 300; i += 1) { a += (random() - 0.5) * 2; b += (random() - 0.5) * 4; x.push(a); y.push(b); }
    const result = engleGranger(y, x)!;
    expect(result.cointegrated).toBe(false);
  });

  it("rejects a unit root in white noise but not in a random walk", () => {
    const random = rng(7);
    const noise = Array.from({ length: 300 }, () => (random() - 0.5) * 2);
    let walk = 0;
    const randomWalk = Array.from({ length: 300 }, () => { walk += (random() - 0.5) * 2; return walk; });
    expect(adfStatistic(noise)!.statistic).toBeLessThan(-3.34);
    expect(adfStatistic(randomWalk)!.statistic).toBeGreaterThan(-3.34);
  });

  it("returns null when there is too little data", () => {
    expect(adfStatistic([1, 2, 3])).toBeNull();
    expect(ols([1, 2], [1, 2])).toBeNull();
  });
});

describe("Kelly position sizing", () => {
  it("computes the classic fraction", () => {
    expect(kellyFraction(0.5, 2)).toBeCloseTo(0.25, 10);
    expect(kellyFraction(0.5, 1)).toBeCloseTo(0, 10);
  });

  it("never returns a negative or oversized bet", () => {
    expect(kellyFraction(0.4, 1)).toBe(0); // a losing edge is no bet, not a short
    expect(kellyFraction(0.9, 10)).toBeLessThanOrEqual(1);
    expect(kellyFraction(0.5, 0)).toBe(0);
  });

  it("scales the fraction for fractional Kelly", () => {
    expect(fractionalKelly(0.25, 0.5)).toBeCloseTo(0.125, 10);
    expect(fractionalKelly(0.25, 2)).toBeCloseTo(0.25, 10); // capped at the full fraction
  });

  it("estimates from a realised return series", () => {
    const estimate = kellyFromReturns([0.05, 0.05, -0.02, -0.02, 0.05, -0.02])!;
    expect(estimate.winRate).toBeCloseTo(0.5, 6);
    expect(estimate.payoffRatio).toBeCloseTo(2.5, 6);
    expect(estimate.fraction).toBeCloseTo(0.3, 6);
  });

  it("refuses to estimate without both wins and losses", () => {
    expect(kellyFromReturns([0.01, 0.02, 0.03, 0.04])).toBeNull();
    expect(kellyFromReturns([0.01])).toBeNull();
  });
});

describe("GARCH(1,1)", () => {
  it("fits a volatility-clustered series and stays stationary", () => {
    const random = rng(2024);
    const returns: number[] = [];
    let sigma = 0.01;
    for (let i = 0; i < 400; i += 1) {
      const shock = (random() - 0.5) * 2;
      sigma = Math.sqrt(0.00002 + 0.1 * (sigma * shock) ** 2 + 0.85 * sigma ** 2);
      returns.push(sigma * shock);
    }
    const fit = fitGarch11(returns)!;
    expect(fit).not.toBeNull();
    expect(fit.alpha).toBeGreaterThanOrEqual(0);
    expect(fit.beta).toBeGreaterThanOrEqual(0);
    expect(fit.persistence).toBeLessThan(1);
    expect(fit.conditionalVolatility).toHaveLength(returns.length);
    expect(fit.nextVolatility).toBeGreaterThan(0);
    expect(Number.isFinite(fit.logLikelihood)).toBe(true);
  });

  it("is deterministic for the same input", () => {
    const random = rng(5);
    const returns = Array.from({ length: 200 }, () => (random() - 0.5) * 0.02);
    const a = fitGarch11(returns)!;
    const b = fitGarch11(returns)!;
    expect(a.alpha).toBe(b.alpha);
    expect(a.beta).toBe(b.beta);
    expect(a.logLikelihood).toBe(b.logLikelihood);
  });

  it("refuses a sample that is too short", () => {
    expect(fitGarch11([0.01, -0.01, 0.02])).toBeNull();
  });
});

describe("Hierarchical Risk Parity", () => {
  it("produces weights that sum to one", () => {
    const random = rng(31);
    const assets = [0, 1, 2].map((k) => Array.from({ length: 120 }, () => (random() - 0.5) * 0.02 + k * 0.0002));
    const weights = hrpWeights(assets)!;
    expect(weights).toHaveLength(3);
    expect(weights.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 8);
    expect(weights.every((value) => value > 0)).toBe(true);
  });

  it("builds a valid correlation matrix on noisy series", () => {
    // A perfectly linear pair gives a correlation of exactly 1 and proves nothing about the estimator.
    const { first, second } = correlatedPair(1_234, 250, 0.7);
    const third = noisyReturns(4_321, 250);
    const correlation = correlationMatrix([first, second, third])!;
    for (let i = 0; i < 3; i += 1) expect(correlation[i][i]).toBeCloseTo(1, 10);
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        expect(correlation[i][j]).toBeCloseTo(correlation[j][i], 12);
        expect(Math.abs(correlation[i][j])).toBeLessThanOrEqual(1);
      }
    }
    // The pair shares a factor: high, but not artificially perfect.
    expect(correlation[0][1]).toBeGreaterThan(0.5);
    expect(correlation[0][1]).toBeLessThan(0.95);
    // An independent series must not look correlated with either.
    expect(Math.abs(correlation[0][2])).toBeLessThan(0.35);
    expect(Math.abs(correlation[1][2])).toBeLessThan(0.35);
  });

  it("gives more weight to the less volatile asset", () => {
    const random = rng(77);
    const calm = Array.from({ length: 150 }, () => (random() - 0.5) * 0.002);
    const wild = Array.from({ length: 150 }, () => (random() - 0.5) * 0.05);
    const weights = hrpWeights([calm, wild])!;
    expect(weights[0]).toBeGreaterThan(weights[1]);
  });

  it("refuses fewer than two assets", () => {
    expect(hrpWeights([[0.01, 0.02, 0.03]])).toBeNull();
  });
});

describe("momentum, valuation and macro", () => {
  it("computes 12-1 momentum on a noisy uptrend and really skips the last period", () => {
    const candles = realisticCandles({ seed: 7, bars: 320, startPrice: 100, drift: 0.002, baseVol: 0.012 });
    const closes = candles.map((candle) => candle.close);
    const momentum = momentum12_1(closes)!;
    expect(momentum).toBeGreaterThan(0); // the drift dominates, but the path is noisy

    // It must equal the definition exactly: from 252 bars back to 21 bars back, skipping the recent month.
    expect(momentum).toBeCloseTo(closes[closes.length - 1 - 21] / closes[closes.length - 1 - 252] - 1, 10);

    // And the skip must actually change the answer versus the raw 12-month return.
    const rawTwelveMonth = closes[closes.length - 1] / closes[closes.length - 1 - 252] - 1;
    expect(Math.abs(momentum - rawTwelveMonth)).toBeGreaterThan(1e-6);
  });

  it("refuses a series that is too short, and accepts the exact boundary", () => {
    expect(momentum12_1([1, 2, 3])).toBeNull();
    // 252 bars is one short of the minimum; 253 is exactly enough.
    expect(momentum12_1(Array.from({ length: 252 }, (_, i) => 100 + i))).toBeNull();
    expect(momentum12_1(Array.from({ length: 253 }, (_, i) => 100 + i))).not.toBeNull();
  });

  it("computes Shiller CAPE from ten-year average real earnings", () => {
    expect(shillerCape(2_000, new Array(10).fill(100))).toBeCloseTo(20, 8);
    expect(shillerCape(2_000, [0, 0])).toBeNull();
    expect(shillerCape(0, [100])).toBeNull();
  });

  it("ranks the current CAPE within its history", () => {
    expect(capePercentile([10, 20, 30, 40], 25)).toBeCloseTo(50, 6);
    expect(capePercentile([10, 20, 30, 40], 5)).toBeCloseTo(0, 6);
  });

  it("classifies the yield curve", () => {
    expect(yieldCurve(2, 5)!.regime).toBe("steep");
    expect(yieldCurve(2, 3)!.regime).toBe("normal");
    expect(yieldCurve(4, 4.3)!.regime).toBe("flat");
    const inverted = yieldCurve(5, 4)!;
    expect(inverted.regime).toBe("inverted");
    expect(inverted.inverted).toBe(true);
    expect(inverted.spreadBps).toBeCloseTo(-100, 6);
  });

  it("computes factor spreads and cumulative returns", () => {
    const spread = factorSpread([0.02, 0.03], [0.01, 0.01])!;
    expect(spread[0]).toBeCloseTo(0.01, 10);
    expect(spread[1]).toBeCloseTo(0.02, 10);
    expect(cumulativeReturn([0.1, 0.1])).toBeCloseTo(0.21, 8);
  });
});
