import { describe, expect, it } from "vitest";

import { DEFAULT_TRACKER_CONFIG, initialStopPrice, ladderStop, nextStop, summarizeTracker, trackStrategy } from "../src/tracker";
import type { StrategySpec } from "../src/strategy";
import type { Candle } from "../src/core-types";

const candle = (time: number, open: number, high: number, low: number, close: number, volume = 1): Candle => ({ time, open, high, low, close, volume });

/** A spec whose entry fires on i1 so the fill lands on i2's open — the same timing as the engine. */
const breakoutSpec: StrategySpec = {
  name: "tracker test breakout",
  side: "long",
  entry: [{ kind: "breakoutHigh", lookback: 1 }],
  exit: [],
  stopLossPct: null,
  takeProfitPct: null,
  maxHoldBars: null,
  riskPerTradePct: 1,
};
const FREE = { startingCapital: 1_000, commissionBps: 0, slippageBps: 0 };

describe("the stop ladder matches the specified formula exactly", () => {
  const entry = 100;
  const cases: [number, number, string][] = [
    [100, 90, "initial-risk-floor"], // entry, no gain yet → −10% floor
    [109, 90, "initial-risk-floor"], // +9% → floor still applies
    [110, 100, "break-even"], // +10% → break-even
    [114, 100, "break-even"], // +14% → still break-even
    [115, 105, "step-up-5"], // +15% → +5%
    [119, 105, "step-up-5"],
    [120, 110, "step-up-10"], // +20% → +10%
    [130, 117, "trail-10"], // +30% → 10% trailing gap from the peak
    [150, 135, "trail-10"], // exactly +50% still uses the 10% gap
    [155, 147.25, "trail-5"], // above +50% → gap tightens to 5%
    [200, 190, "trail-5"], // +100% → 5% gap
  ];

  for (const [peak, expectedStop, expectedRule] of cases) {
    it(`peak ${peak} → stop ${expectedStop} (${expectedRule})`, () => {
      const result = ladderStop(entry, peak);
      expect(result.stopPrice).toBeCloseTo(expectedStop, 6);
      expect(result.rule).toBe(expectedRule);
    });
  }

  it("exposes the documented default configuration", () => {
    expect(DEFAULT_TRACKER_CONFIG.initialStopPct).toBe(0.1);
    expect(DEFAULT_TRACKER_CONFIG.breakEvenAtPct).toBe(0.1);
    expect(DEFAULT_TRACKER_CONFIG.stepUpAtPct).toBe(0.15);
    expect(DEFAULT_TRACKER_CONFIG.stepUp1StopPct).toBe(0.05);
    expect(DEFAULT_TRACKER_CONFIG.stepUp2AtPct).toBe(0.2);
    expect(DEFAULT_TRACKER_CONFIG.stepUp2StopPct).toBe(0.1);
    expect(DEFAULT_TRACKER_CONFIG.tightenAbovePct).toBe(0.5);
    expect(DEFAULT_TRACKER_CONFIG.wideGapPct).toBe(0.1);
    expect(DEFAULT_TRACKER_CONFIG.tightGapPct).toBe(0.05);
  });

  it("places the initial stop 10% below entry", () => {
    expect(initialStopPrice(100)).toBeCloseTo(90, 10);
  });

  it("reports the gap in force only when trailing", () => {
    expect(ladderStop(100, 110).gapPct).toBeNull(); // break-even is a step, not a trail
    expect(ladderStop(100, 130).gapPct).toBeCloseTo(0.1, 10);
    expect(ladderStop(100, 160).gapPct).toBeCloseTo(0.05, 10);
  });
});

describe("the stop only ever ratchets upward", () => {
  it("never lowers an existing stop", () => {
    // At a +20% peak the ladder says 110, but the stop is already at 115 — it must stay.
    const result = nextStop(100, 120, 115);
    expect(result.stopPrice).toBeCloseTo(115, 10);
  });

  it("raises the stop when the ladder moves above it", () => {
    expect(nextStop(100, 130, 110).stopPrice).toBeCloseTo(117, 10);
  });

  it("a falling peak cannot pull the stop down", () => {
    const high = nextStop(100, 160, 100).stopPrice; // 152
    const afterPullback = nextStop(100, 140, high).stopPrice;
    expect(afterPullback).toBeCloseTo(high, 10);
  });
});

describe("tracking a strategy over time", () => {
  it("exits on the initial −10% floor", () => {
    const series = [
      candle(1, 10, 11, 9, 10.5),
      candle(2, 10.5, 12, 10, 11.5), // entry signal
      candle(3, 10, 10.5, 8.9, 9.2), // fills at 10, then breaks the −10% floor
    ];
    const run = trackStrategy(series, breakoutSpec, DEFAULT_TRACKER_CONFIG, FREE);
    expect(run.positions).toHaveLength(1);
    const position = run.positions[0];
    expect(position.trackerExitReason).toBe("initial-risk-floor");
    expect(position.exitPrice).toBeCloseTo(9, 10);
    expect(position.returnPct).toBeCloseTo(-10, 6);
    expect(position.stopRule).toBe("initial-risk-floor");
  });

  it("moves to break-even at +10% and exits there", () => {
    const series = [
      candle(1, 10, 11, 9, 10.5),
      candle(2, 10.5, 12, 10, 11.5), // entry signal
      candle(3, 10, 11.2, 10.5, 11.0), // fills at 10, peaks at 11.2 → stop to break-even
      candle(4, 11, 11.1, 9.8, 10.0), // falls back through entry → break-even exit
    ];
    const run = trackStrategy(series, breakoutSpec, DEFAULT_TRACKER_CONFIG, FREE);
    const position = run.positions[0];
    expect(position.trackerExitReason).toBe("break-even");
    expect(position.exitPrice).toBeCloseTo(10, 10);
    expect(position.returnPct).toBeCloseTo(0, 6);
  });

  it("tightens to a 5% gap above +50% and locks in the gain", () => {
    const series = [
      candle(1, 10, 11, 9, 10.5),
      candle(2, 10.5, 12, 10, 11.5), // entry signal
      candle(3, 10, 16.2, 15.5, 16), // fills at 10, peaks at 16.2 → 5% gap (low stays above the stop)
      candle(4, 16, 16.3, 15.0, 15.2), // pulls back through the tightened stop
    ];
    const run = trackStrategy(series, breakoutSpec, DEFAULT_TRACKER_CONFIG, FREE);
    const position = run.positions[0];
    expect(position.trackerExitReason).toBe("trailing-stop");
    expect(position.stopRule).toBe("trail-5");
    expect(position.exitPrice).toBeCloseTo(16.3 * 0.95, 6);
    expect(position.returnPct).toBeGreaterThan(50); // the gain was protected, not given back
  });

  it("records the peak, the excursions and the final stop", () => {
    const series = [
      candle(1, 10, 11, 9, 10.5),
      candle(2, 10.5, 12, 10, 11.5),
      candle(3, 10, 16.2, 15.5, 16),
      candle(4, 16, 16.3, 15.0, 15.2),
    ];
    const run = trackStrategy(series, breakoutSpec, DEFAULT_TRACKER_CONFIG, FREE);
    const position = run.positions[0];
    expect(position.peakPrice).toBeCloseTo(16.3, 6);
    expect(position.peakGainPct).toBeCloseTo(63, 4);
    expect(position.mfePct).toBeCloseTo(63, 4);
    expect(position.maePct).toBeCloseTo(0, 6);
    expect(position.finalStopPrice).toBeCloseTo(16.3 * 0.95, 6);
  });

  it("closes an open position at the final bar", () => {
    // The final bar's low must stay above the stop, or the stop would close it first.
    const series = [candle(1, 10, 11, 9, 10.5), candle(2, 10.5, 12, 10, 11.5), candle(3, 10, 12, 11.5, 11.8)];
    const run = trackStrategy(series, breakoutSpec, DEFAULT_TRACKER_CONFIG, FREE);
    expect(run.positions[0].trackerExitReason).toBe("end-of-data");
  });

  it("produces one equity point per bar", () => {
    const series = [candle(1, 10, 11, 9, 10.5), candle(2, 10.5, 12, 10, 11.5), candle(3, 10, 12, 10, 11.5)];
    const run = trackStrategy(series, breakoutSpec, DEFAULT_TRACKER_CONFIG, FREE);
    expect(run.equity).toHaveLength(series.length);
  });
});

describe("the performance dashboard", () => {
  it("aggregates win rate, average and median return, best/worst and exit mix", () => {
    const winner = trackStrategy(
      [candle(1, 10, 11, 9, 10.5), candle(2, 10.5, 12, 10, 11.5), candle(3, 10, 16.2, 15.5, 16), candle(4, 16, 16.3, 15.0, 15.2)],
      breakoutSpec,
      DEFAULT_TRACKER_CONFIG,
      FREE,
    );
    const loser = trackStrategy(
      [candle(1, 10, 11, 9, 10.5), candle(2, 10.5, 12, 10, 11.5), candle(3, 10, 10.5, 8.9, 9.2)],
      breakoutSpec,
      DEFAULT_TRACKER_CONFIG,
      FREE,
    );
    const positions = [...winner.positions, ...loser.positions];
    const metrics = summarizeTracker(positions, winner.equity, [candle(1, 1, 1, 1, 1)], 1_000, 2);

    expect(metrics.tradeCount).toBe(2);
    expect(metrics.wins).toBe(1);
    expect(metrics.losses).toBe(1);
    expect(metrics.winRatePct).toBeCloseTo(50, 6);
    expect(metrics.bestReturnPct).toBeGreaterThan(50);
    expect(metrics.worstReturnPct).toBeCloseTo(-10, 6);
    expect(metrics.medianReturnPct).toBeCloseTo((metrics.bestReturnPct + metrics.worstReturnPct) / 2, 6);
    expect(metrics.averageBarsHeld).toBeGreaterThan(0);
    expect(metrics.byExitReason["trailing-stop"]).toBe(1);
    expect(metrics.byExitReason["initial-risk-floor"]).toBe(1);
    expect(metrics.maxDrawdownPct).toBeGreaterThanOrEqual(0);
  });

  it("returns zeroed aggregates when nothing was tracked", () => {
    const metrics = summarizeTracker([], [], [], 1_000, 0);
    expect(metrics.tradeCount).toBe(0);
    expect(metrics.winRatePct).toBe(0);
    expect(metrics.medianReturnPct).toBe(0);
    expect(metrics.profitFactor).toBeNull();
  });
});
