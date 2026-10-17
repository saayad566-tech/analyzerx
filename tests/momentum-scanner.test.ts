import { describe, expect, it } from "vitest";
import { describeMover, scanMomentum } from "../packages/quant-engine/src/momentum";
import type { Candle } from "../packages/quant-engine/src/core-types";

function bars(closes: number[], volumes?: number[]): Candle[] {
  return closes.map((close, i) => ({
    time: 1_700_000_000_000 + i * 86_400_000,
    open: close,
    high: close,
    low: close,
    close,
    volume: volumes?.[i] ?? 100,
  }));
}

describe("dual momentum scanner", () => {
  const gainer = { symbol: "UPCO", market: "IN", candles: bars([100, 101, 102, 103, 112]) };
  const crasher = { symbol: "DOWNCO", market: "IN", candles: bars([100, 100, 100, 100, 85]) };
  const flat = { symbol: "FLATCO", market: "IN", candles: bars([100, 101, 100, 102, 101]) };

  it("splits movers into gainers and crashers at the 10% default", () => {
    const r = scanMomentum([gainer, crasher, flat]);
    expect(r.gainers.map((m) => m.symbol)).toEqual(["UPCO"]);
    expect(r.crashers.map((m) => m.symbol)).toEqual(["DOWNCO"]);
    expect(r.scanned).toBe(3);
    expect(r.skipped).toHaveLength(0);
  });

  it("reports the window that produced the largest move, not an arbitrary one", () => {
    const r = scanMomentum([gainer]);
    const m = r.gainers[0];
    expect(m.windowDays).toBe(4); // (112/100 - 1) * 100 = 12, the largest of the windows
    expect(m.changePct).toBeCloseTo(12, 2);
    expect(m.direction).toBe("gainer");
    expect(m.lastClose).toBe(112);
  });

  it("signs a crasher negatively and sorts worst-first", () => {
    const worse = { symbol: "WORSE", market: "IN", candles: bars([100, 100, 100, 100, 70]) };
    const r = scanMomentum([crasher, worse]);
    expect(r.crashers[0].symbol).toBe("WORSE");
    expect(r.crashers[0].changePct).toBeCloseTo(-30, 2);
    expect(r.crashers[1].changePct).toBeCloseTo(-15, 2);
  });

  it("computes the volume multiple that explains the move", () => {
    const vols = [100, 100, 100, 100, 500];
    const r = scanMomentum([{ symbol: "VOLCO", market: "IN", candles: bars([100, 101, 102, 103, 112], vols) }]);
    // last 500 against the prior bars' mean of 100 -> 5.0x (the current bar is excluded)
    expect(r.gainers[0].volumeMultiple).toBeCloseTo(5, 2);
    expect(describeMover(r.gainers[0])).toContain("5.0x");
  });

  it("honours a caller-supplied threshold", () => {
    const small = { symbol: "SMALL", market: "IN", candles: bars([100, 100, 100, 100, 106]) };
    expect(scanMomentum([small]).gainers).toHaveLength(0);
    expect(scanMomentum([small], { thresholdPct: 5 }).gainers.map((m) => m.symbol)).toEqual(["SMALL"]);
  });

  it("skips unusable instruments and says why — it never silently drops one", () => {
    const r = scanMomentum([
      { symbol: "ONEBAR", market: "IN", candles: bars([100]) },
      { symbol: "NOPRICE", market: "IN", candles: bars([100, 0]) },
    ]);
    expect(r.gainers).toHaveLength(0);
    expect(r.crashers).toHaveLength(0);
    expect(r.scanned).toBe(0);
    expect(r.skipped.map((s) => s.symbol).sort()).toEqual(["NOPRICE", "ONEBAR"]);
  });

  it("keeps markets separate — the engine only sees the bars it is given", () => {
    const us = { symbol: "UPCO", market: "US", candles: bars([100, 101, 102, 103, 115]) };
    const inOnly = scanMomentum([gainer]);
    const usOnly = scanMomentum([us]);
    expect(inOnly.gainers[0].market).toBe("IN");
    expect(usOnly.gainers[0].market).toBe("US");
    expect(inOnly.gainers[0].changePct).not.toBe(usOnly.gainers[0].changePct);
  });
});
