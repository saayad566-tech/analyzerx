import { describe, expect, it } from "vitest";

import { DEFAULT_BACKTEST_CONFIG, impliedSide, runBacktest, runBacktestAsync, type BacktestConfig, type BacktestProgress } from "../lib/quant/backtest";
import { computeMetrics, equityReturns, maxDrawdown, periodsPerYear } from "../lib/quant/metrics";
import { generateStrategyFromPrompt, describeStrategy, evaluateAll, prepareSeries, DEFAULT_STRATEGY, type StrategySpec } from "../lib/quant/strategy";
import type { Candle, EquityPoint, Trade } from "../lib/quant/types";

const candle = (time: number, open: number, high: number, low: number, close: number, volume = 1): Candle => ({ time, open, high, low, close, volume });
const FREE: BacktestConfig = { startingCapital: 1_000, commissionBps: 0, slippageBps: 0 };

/**
 * A series engineered so the breakout signal and the fill bar are unambiguous:
 *   i1 closes at 11.5, above i0's high of 11  → entry signal on i1
 *   i2 opens at 12                            → the fill must be here, not on i1
 *   i3 closes at 10.5, below i2's low of 11   → exit signal on i3
 *   i4 opens at 10                            → the exit fill must be here
 */
const breakoutSeries: Candle[] = [
  candle(1, 10, 11, 9, 10.5),
  candle(2, 10.5, 12, 10, 11.5),
  candle(3, 12, 13, 11, 12.5),
  candle(4, 12.5, 13, 10, 10.5),
  candle(5, 10, 11, 9, 10),
];

const breakoutSpec: StrategySpec = {
  name: "1-bar breakout",
  side: "long",
  entry: [{ kind: "breakoutHigh", lookback: 1 }],
  exit: [{ kind: "breakdownLow", lookback: 1 }],
  stopLossPct: null,
  takeProfitPct: null,
  maxHoldBars: null,
  riskPerTradePct: 1,
};

describe("no look-ahead", () => {
  it("fills on the bar AFTER the signal, at that bar's open", () => {
    const result = runBacktest(breakoutSeries, breakoutSpec, FREE);
    expect(result.trades).toHaveLength(1);
    const trade = result.trades[0];
    // Signal was produced on bar 1 (close 11.5); the fill must be bar 2's open of 12.
    expect(trade.entryIndex).toBe(2);
    expect(trade.entryPrice).toBeCloseTo(12, 10);
    expect(trade.entryPrice).toBeCloseTo(breakoutSeries[2].open, 10);
    expect(trade.entryPrice).not.toBeCloseTo(breakoutSeries[1].close, 10);
  });

  it("exits on the bar after the exit signal", () => {
    const result = runBacktest(breakoutSeries, breakoutSpec, FREE);
    const trade = result.trades[0];
    expect(trade.exitIndex).toBe(4);
    expect(trade.exitPrice).toBeCloseTo(breakoutSeries[4].open, 10);
    expect(trade.exitReason).toBe("signal");
  });

  it("cannot see a value that is still undefined during warm-up", () => {
    // EMA(5) is undefined for the first four bars, so a rule on it must be false there.
    const spec: StrategySpec = { ...DEFAULT_STRATEGY, entry: [{ kind: "priceAboveEma", period: 5 }], exit: [] };
    const series = prepareSeries(breakoutSeries, spec);
    expect(evaluateAll(spec.entry, series, 0)).toBe(false);
    expect(evaluateAll(spec.entry, series, 3)).toBe(false);
  });
});

describe("trade arithmetic", () => {
  it("computes the exact PnL, quantity and return", () => {
    const result = runBacktest(breakoutSeries, breakoutSpec, FREE);
    const trade = result.trades[0];
    const quantity = 1_000 / 12;
    expect(trade.quantity).toBeCloseTo(quantity, 8);
    expect(trade.grossPnl).toBeCloseTo((10 - 12) * quantity, 8); // -166.666…
    expect(trade.costs).toBe(0);
    expect(trade.netPnl).toBeCloseTo(trade.grossPnl, 8);
    expect(trade.returnPct).toBeCloseTo(-16.6667, 3);
    expect(trade.bars).toBe(2);
  });

  it("charges commission on both legs and slippage against the trade", () => {
    const result = runBacktest(breakoutSeries, breakoutSpec, { startingCapital: 1_000, commissionBps: 10, slippageBps: 10 });
    const trade = result.trades[0];
    expect(trade.costs).toBeGreaterThan(0);
    expect(trade.netPnl).toBeLessThan(trade.grossPnl);
    expect(trade.netPnl).toBeCloseTo(trade.grossPnl - trade.costs, 8);
    // Long entry slippage must make the fill worse than the open.
    expect(trade.entryPrice).toBeGreaterThan(breakoutSeries[2].open);
    expect(trade.exitPrice).toBeLessThan(breakoutSeries[4].open);
  });

  it("scales position size with riskPerTradePct", () => {
    const half = runBacktest(breakoutSeries, { ...breakoutSpec, riskPerTradePct: 0.5 }, FREE);
    expect(half.trades[0].quantity).toBeCloseTo((1_000 / 12) * 0.5, 8);
  });
});

describe("protective exits", () => {
  const withStopAndTarget: StrategySpec = { ...breakoutSpec, exit: [], stopLossPct: 0.05, takeProfitPct: 0.05 };
  // i2's low (5) breaches the stop and its high (20) breaches the target in the same bar.
  const bothTouched: Candle[] = [
    candle(1, 10, 11, 9, 10.5),
    candle(2, 10.5, 12, 10, 11.5),
    candle(3, 12, 20, 5, 15),
  ];

  it("assumes the stop fills first when one bar touches both levels", () => {
    const result = runBacktest(bothTouched, withStopAndTarget, FREE);
    const trade = result.trades[0];
    expect(trade.exitReason).toBe("stop-loss");
    expect(trade.exitPrice).toBeCloseTo(12 * 0.95, 8);
  });

  it("fills the target when only the target is touched", () => {
    const onlyTarget: Candle[] = [candle(1, 10, 11, 9, 10.5), candle(2, 10.5, 12, 10, 11.5), candle(3, 12, 13, 11.9, 12.9)];
    const result = runBacktest(onlyTarget, withStopAndTarget, FREE);
    expect(result.trades[0].exitReason).toBe("take-profit");
    expect(result.trades[0].exitPrice).toBeCloseTo(12 * 1.05, 8);
  });
});

describe("position lifecycle", () => {
  it("closes an open position at the final bar and labels it end-of-data", () => {
    const neverExit: StrategySpec = { ...breakoutSpec, exit: [] };
    const result = runBacktest(breakoutSeries, neverExit, FREE);
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].exitReason).toBe("end-of-data");
    expect(result.trades[0].exitPrice).toBeCloseTo(breakoutSeries[breakoutSeries.length - 1].close, 10);
  });

  it("honours maxHoldBars", () => {
    const spec: StrategySpec = { ...breakoutSpec, exit: [], maxHoldBars: 1 };
    const result = runBacktest(breakoutSeries, spec, FREE);
    expect(result.trades[0].exitReason).toBe("signal");
    expect(result.trades[0].bars).toBe(1);
  });

  it("produces one equity point per processed bar and a full execution log", () => {
    const result = runBacktest(breakoutSeries, breakoutSpec, FREE);
    expect(result.equity).toHaveLength(breakoutSeries.length);
    expect(result.barsProcessed).toBe(breakoutSeries.length);
    expect(result.log.map((entry) => entry.event)).toEqual(["enter", "exit"]);
    expect(result.log[0].detail).toContain("long");
  });

  it("respects maxBars so an accidental unbounded run is capped", () => {
    const result = runBacktest(breakoutSeries, breakoutSpec, { ...FREE, maxBars: 3 });
    expect(result.barsProcessed).toBe(3);
  });

  it("does nothing on an empty series", () => {
    const result = runBacktest([], breakoutSpec, FREE);
    expect(result.trades).toHaveLength(0);
    expect(result.metrics.endingCapital).toBe(1_000);
  });
});

describe("side selection", () => {
  it("follows an explicit side", () => {
    expect(impliedSide({ ...DEFAULT_STRATEGY, side: "short" })).toBe("short");
    expect(impliedSide({ ...DEFAULT_STRATEGY, side: "long" })).toBe("long");
  });

  it("infers direction from the entry rule when the side is 'both'", () => {
    expect(impliedSide({ ...DEFAULT_STRATEGY, side: "both", entry: [{ kind: "breakdownLow", lookback: 20 }] })).toBe("short");
    expect(impliedSide({ ...DEFAULT_STRATEGY, side: "both", entry: [{ kind: "breakoutHigh", lookback: 20 }] })).toBe("long");
  });
});

describe("metrics", () => {
  const trade = (netPnl: number): Trade => ({ entryIndex: 0, exitIndex: 1, side: "long", entryPrice: 10, exitPrice: 10, quantity: 1, exitReason: "signal", grossPnl: netPnl, costs: 0, netPnl, returnPct: 0, bars: 1 });
  const equity = (values: number[]): EquityPoint[] => values.map((value, index) => ({ time: index * 1_000, index, equity: value }));

  it("computes win rate, profit factor, expectancy and averages", () => {
    const metrics = computeMetrics({
      trades: [trade(100), trade(-50), trade(200), trade(-25)],
      equity: equity([1_000, 1_100, 1_050, 1_250, 1_225]),
      candles: [candle(0, 1, 1, 1, 1), candle(1_000, 1, 1, 1, 1), candle(2_000, 1, 1, 1, 1), candle(3_000, 1, 1, 1, 1), candle(4_000, 1, 1, 1, 1)],
      startingCapital: 1_000,
      barsInPosition: 2,
    });
    expect(metrics.tradeCount).toBe(4);
    expect(metrics.wins).toBe(2);
    expect(metrics.losses).toBe(2);
    expect(metrics.winRatePct).toBeCloseTo(50, 8);
    expect(metrics.grossProfit).toBe(300);
    expect(metrics.grossLoss).toBe(75);
    expect(metrics.profitFactor).toBeCloseTo(4, 8);
    expect(metrics.expectancy).toBeCloseTo(56.25, 8);
    expect(metrics.averageWin).toBeCloseTo(150, 8);
    expect(metrics.averageLoss).toBeCloseTo(-37.5, 8);
    expect(metrics.exposurePct).toBeCloseTo(40, 8);
  });

  it("returns null profit factor rather than infinity when nothing lost", () => {
    const metrics = computeMetrics({ trades: [trade(10)], equity: equity([1_000, 1_010]), candles: [candle(0, 1, 1, 1, 1), candle(1_000, 1, 1, 1, 1)], startingCapital: 1_000, barsInPosition: 1 });
    expect(metrics.profitFactor).toBeNull();
  });

  it("measures peak-to-trough drawdown and time underwater", () => {
    const { maxDrawdownPct, timeInDrawdownPct } = maxDrawdown(equity([100, 120, 90, 130]));
    expect(maxDrawdownPct).toBeCloseTo(25, 8); // (120 − 90) / 120
    expect(timeInDrawdownPct).toBeCloseTo(25, 8); // 1 of 4 bars underwater
  });

  it("derives equity returns and skips bars whose prior equity is non-positive", () => {
    // 110/100 − 1 = +10%; 0/110 − 1 = −100% (a real wipe-out, recorded); the 0 → 50 step is skipped
    // because the prior equity is zero and a return from zero is undefined.
    const returns = equityReturns(equity([100, 110, 0, 50]));
    expect(returns).toHaveLength(2);
    expect(returns[0]).toBeCloseTo(0.1, 10);
    expect(returns[1]).toBeCloseTo(-1, 10);
  });

  it("derives bars per year from the median candle spacing", () => {
    const daily = [candle(0, 1, 1, 1, 1), candle(86_400_000, 1, 1, 1, 1), candle(172_800_000, 1, 1, 1, 1)];
    expect(periodsPerYear(daily)).toBeCloseTo(365.25, 1);
    expect(periodsPerYear([candle(0, 1, 1, 1, 1)])).toBeNull();
  });
});

describe("strategy generation is deterministic and rule-based", () => {
  it("maps recognised wording to a concrete spec", () => {
    const trend = generateStrategyFromPrompt("ema 10/30 crossover trend follow");
    expect(trend.entry[0]).toEqual({ kind: "emaCrossAbove", fast: 10, slow: 30 });

    const rsiStrategy = generateStrategyFromPrompt("rsi 14 mean reversion");
    expect(rsiStrategy.entry[0]).toEqual({ kind: "rsiBelow", period: 14, level: 30 });

    const breakout = generateStrategyFromPrompt("20 bar breakout");
    expect(breakout.entry[0]).toEqual({ kind: "breakoutHigh", lookback: 20 });
  });

  it("reads a stop and target when they are stated", () => {
    const spec = generateStrategyFromPrompt("breakout with 3% stop and 9% target");
    expect(spec.stopLossPct).toBeCloseTo(0.03, 8);
    expect(spec.takeProfitPct).toBeCloseTo(0.09, 8);
  });

  it("detects short intent", () => {
    expect(generateStrategyFromPrompt("short breakdown strategy").side).toBe("short");
  });

  it("returns the documented default for an unrecognised prompt", () => {
    expect(generateStrategyFromPrompt("")).toEqual(DEFAULT_STRATEGY);
    expect(generateStrategyFromPrompt("do something clever").name).toBe(DEFAULT_STRATEGY.name);
  });

  it("is stable: the same prompt always yields the same spec", () => {
    expect(JSON.stringify(generateStrategyFromPrompt("ema 5/20"))).toBe(JSON.stringify(generateStrategyFromPrompt("ema 5/20")));
  });

  it("describes a spec in readable English", () => {
    const description = describeStrategy(generateStrategyFromPrompt("ema 10/30"));
    expect(description).toContain("EMA 10 crosses above EMA 30");
    expect(description).toContain("Stop:");
  });
});

describe("async runner reports genuine progress", () => {
  it("produces the same result as the synchronous run", async () => {
    const sync = runBacktest(breakoutSeries, breakoutSpec, FREE);
    const async = await runBacktestAsync(breakoutSeries, breakoutSpec, FREE, { yieldEvery: 1 });
    expect(async.metrics.endingCapital).toBeCloseTo(sync.metrics.endingCapital, 10);
    expect(async.trades).toHaveLength(sync.trades.length);
  });

  it("reports monotonically increasing progress that ends at completion", async () => {
    const seen: BacktestProgress[] = [];
    await runBacktestAsync(breakoutSeries, breakoutSpec, FREE, { onProgress: (progress) => seen.push(progress), yieldEvery: 1 });
    expect(seen).toHaveLength(breakoutSeries.length);
    expect(seen[seen.length - 1].fraction).toBeCloseTo(1, 10);
    for (let i = 1; i < seen.length; i += 1) expect(seen[i].barsProcessed).toBeGreaterThan(seen[i - 1].barsProcessed);
    // The final progress entry reflects the real equity at that point, not a placeholder.
    expect(seen[seen.length - 1].equity).toBeCloseTo(runBacktest(breakoutSeries, breakoutSpec, FREE).equity.at(-1)!.equity, 10);
  });
});

describe("defaults", () => {
  it("exposes a documented default config", () => {
    expect(DEFAULT_BACKTEST_CONFIG.startingCapital).toBeGreaterThan(0);
    expect(DEFAULT_BACKTEST_CONFIG.commissionBps).toBeGreaterThanOrEqual(0);
  });
});
