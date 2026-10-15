import { describe, expect, it } from "vitest";

import {
  LEDGER_CAP, aggregate, aggregateByStrategy, entriesFromRun, entryFromPosition, filterByMarket,
  ledgerKey, ledgerSummary, mergeLedger, type LedgerEntry,
} from "../src/ledger";
import { DEFAULT_TRACKER_CONFIG, trackStrategy } from "../src/tracker";
import type { StrategySpec } from "../src/strategy";
import type { Candle } from "../src/core-types";

const candle = (time: number, open: number, high: number, low: number, close: number, volume = 1): Candle => ({ time, open, high, low, close, volume });

const spec: StrategySpec = {
  name: "ledger breakout", side: "long", entry: [{ kind: "breakoutHigh", lookback: 1 }], exit: [],
  stopLossPct: null, takeProfitPct: null, maxHoldBars: null, riskPerTradePct: 1,
};
const FREE = { startingCapital: 1_000, commissionBps: 0, slippageBps: 0 };

const entry = (over: Partial<LedgerEntry> & { id: string }): LedgerEntry => ({
  strategyId: "s1", strategyName: "Strategy One", marketId: "IN", symbol: "AAA",
  entryTime: 1, exitTime: 5, entryPrice: 100, exitPrice: 110, peakPrice: 112, peakGainPct: 12,
  finalStopPrice: 90, stopRule: "break-even", exitReason: "trailing-stop", returnPct: 10,
  bars: 4, maePct: -1, mfePct: 12, recordedAt: 1_000, ...over,
});

describe("ledger identity and merging", () => {
  it("builds a stable key from strategy, market, symbol and entry time", () => {
    expect(ledgerKey({ strategyId: "s1", marketId: "IN", symbol: "AAA", entryTime: 7 })).toBe("s1|IN|AAA|7");
  });

  it("de-duplicates by key rather than double-counting a re-recorded position", () => {
    const first = entry({ id: "s1|IN|AAA|1", returnPct: 10 });
    const updated = entry({ id: "s1|IN|AAA|1", returnPct: 12 });
    const merged = mergeLedger([first], [updated]);
    expect(merged).toHaveLength(1);
    expect(merged[0].returnPct).toBe(12);
  });

  it("orders newest first and honours the cap", () => {
    const many = Array.from({ length: 10 }, (_, i) => entry({ id: `k${i}`, recordedAt: 1_000 + i }));
    const merged = mergeLedger([], many, 4);
    expect(merged).toHaveLength(4);
    expect(merged[0].recordedAt).toBe(1_009);
  });

  it("scopes to a market", () => {
    const inEntries = [entry({ id: "a" }), entry({ id: "b", marketId: "US" })];
    expect(filterByMarket(inEntries, "IN").map((e) => e.id)).toEqual(["a"]);
    expect(filterByMarket(inEntries, "US").map((e) => e.id)).toEqual(["b"]);
  });
});

describe("recording a real tracker run", () => {
  it("flattens every tracked position into the ledger", () => {
    const series = [
      candle(1_000, 10, 11, 9, 10.5),
      candle(2_000, 10.5, 12, 10, 11.5), // entry signal
      candle(3_000, 10, 16.2, 15.5, 16),
      candle(4_000, 16, 16.3, 15.0, 15.2), // tightened stop takes it out
    ];
    const run = trackStrategy(series, spec, DEFAULT_TRACKER_CONFIG, FREE, "ledger-breakout", "ACME");
    const entries = entriesFromRun(run, {
      strategyId: "ledger-breakout", strategyName: "Ledger breakout", marketId: "IN",
      symbol: "ACME", times: series.map((c) => c.time), recordedAt: 5_000,
    });
    expect(entries).toHaveLength(run.positions.length);
    const first = entries[0];
    expect(first.marketId).toBe("IN");
    expect(first.symbol).toBe("ACME");
    expect(first.entryTime).toBe(3_000);
    expect(first.exitTime).toBe(4_000);
    expect(first.exitReason).toBe("trailing-stop");
    expect(first.returnPct).toBeGreaterThan(50);
    expect(first.id).toBe(ledgerKey({ strategyId: "ledger-breakout", marketId: "IN", symbol: "ACME", entryTime: 3_000 }));
  });

  it("flattens a single position", () => {
    const series = [candle(1, 10, 11, 9, 10.5), candle(2, 10.5, 12, 10, 11.5), candle(3, 10, 12, 11.5, 11.8)];
    const run = trackStrategy(series, spec, DEFAULT_TRACKER_CONFIG, FREE);
    const single = entryFromPosition(run.positions[0], {
      strategyId: "s", strategyName: "S", marketId: "IN", symbol: "X", entryTime: 10, exitTime: 20,
    });
    expect(single.id).toBe("s|IN|X|10");
    expect(single.exitReason).toBe("end-of-data");
  });
});

describe("cross-strategy aggregation", () => {
  const ledger: LedgerEntry[] = [
    entry({ id: "1", strategyId: "s1", strategyName: "One", returnPct: 20, bars: 4, mfePct: 22, maePct: -2, exitReason: "trailing-stop" }),
    entry({ id: "2", strategyId: "s1", strategyName: "One", returnPct: -10, bars: 2, mfePct: 1, maePct: -10, exitReason: "initial-risk-floor" }),
    entry({ id: "3", strategyId: "s2", strategyName: "Two", returnPct: 6, bars: 6, mfePct: 8, maePct: -3, exitReason: "signal" }),
    entry({ id: "4", strategyId: "s2", strategyName: "Two", returnPct: -2, bars: 2, mfePct: 2, maePct: -4, exitReason: "break-even" }),
  ];

  it("computes win rate, average, median, profit factor and the exit mix", () => {
    const result = aggregate(ledger);
    expect(result.trades).toBe(4);
    expect(result.wins).toBe(2);
    expect(result.losses).toBe(2);
    expect(result.winRatePct).toBeCloseTo(50, 10);
    expect(result.averageReturnPct).toBeCloseTo((20 - 10 + 6 - 2) / 4, 10);
    expect(result.medianReturnPct).toBeCloseTo((-2 + 6) / 2, 10);
    expect(result.bestReturnPct).toBe(20);
    expect(result.worstReturnPct).toBe(-10);
    expect(result.profitFactor).toBeCloseTo(26 / 12, 10);
    expect(result.averageBarsHeld).toBeCloseTo(3.5, 10);
    expect(result.byExitReason["trailing-stop"]).toBe(1);
    expect(result.byExitReason["initial-risk-floor"]).toBe(1);
    expect(result.byExitReason.signal).toBe(1);
    expect(result.byExitReason["break-even"]).toBe(1);
  });

  it("breaks the ledger down per strategy, best average return first", () => {
    const byStrategy = aggregateByStrategy(ledger);
    expect(byStrategy).toHaveLength(2);
    // s1 average = 5, s2 average = 2
    expect(byStrategy[0].strategyId).toBe("s1");
    expect(byStrategy[0].averageReturnPct).toBeCloseTo(5, 10);
    expect(byStrategy[1].strategyId).toBe("s2");
    expect(byStrategy[1].averageReturnPct).toBeCloseTo(2, 10);
    expect(byStrategy[0].strategyName).toBe("One");
  });

  it("summarises the whole ledger and scopes it by market", () => {
    const summary = ledgerSummary(ledger, "IN");
    expect(summary.marketId).toBe("IN");
    expect(summary.overall.trades).toBe(4);
    expect(summary.strategyCount).toBe(2);
    expect(summary.symbolCount).toBe(1);
    expect(summary.firstRecordedAt).toBe(1_000);
    expect(summary.lastRecordedAt).toBe(1_000);
  });

  it("returns a zeroed summary for an empty ledger", () => {
    const summary = ledgerSummary([]);
    expect(summary.overall.trades).toBe(0);
    expect(summary.overall.winRatePct).toBe(0);
    expect(summary.overall.profitFactor).toBeNull();
    expect(summary.strategyCount).toBe(0);
    expect(summary.firstRecordedAt).toBeNull();
  });

  it("excludes another market's entries from a scoped summary", () => {
    const mixed = [...ledger, entry({ id: "9", marketId: "US", returnPct: 100 })];
    expect(ledgerSummary(mixed, "IN").overall.trades).toBe(4);
    expect(ledgerSummary(mixed, "US").overall.trades).toBe(1);
    expect(ledgerSummary(mixed).overall.trades).toBe(5);
  });

  it("exposes a ledger cap so the store cannot grow without limit", () => {
    expect(LEDGER_CAP).toBeGreaterThan(0);
    expect(mergeLedger([], Array.from({ length: LEDGER_CAP + 50 }, (_, i) => entry({ id: `x${i}`, recordedAt: i })))).toHaveLength(LEDGER_CAP);
  });
});
