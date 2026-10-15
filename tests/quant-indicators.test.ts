import { describe, expect, it } from "vitest";

import { atr, classifyTrend, closes, ema, percentChange, rollingMax, rollingMin, rsi, sma, swingHighs, swingLows, trueRange } from "../lib/quant/indicators";
import type { Candle } from "../lib/quant/types";

const candle = (time: number, open: number, high: number, low: number, close: number, volume = 1): Candle => ({ time, open, high, low, close, volume });

describe("sma", () => {
  it("returns null through the warm-up and the exact mean afterwards", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  it("handles a period of one and a period longer than the series", () => {
    expect(sma([4, 7], 1)).toEqual([4, 7]);
    expect(sma([1, 2], 5)).toEqual([null, null]);
  });
});

describe("ema", () => {
  it("seeds with the SMA and applies the 2/(n+1) multiplier", () => {
    // seed at index 2 = mean(1,2,3) = 2; k = 0.5 → index3 = 4*0.5 + 2*0.5 = 3; index4 = 5*0.5 + 3*0.5 = 4
    expect(ema([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  it("is null before the seed rather than guessing", () => {
    const values = ema([10, 11, 12, 13], 3);
    expect(values[0]).toBeNull();
    expect(values[1]).toBeNull();
    expect(values[2]).toBeCloseTo(11, 10);
  });

  it("returns all nulls when the series is shorter than the period", () => {
    expect(ema([1, 2], 5)).toEqual([null, null]);
  });
});

describe("rsi (Wilder)", () => {
  it("is 100 for a strictly rising series and 0 for a strictly falling one", () => {
    expect(rsi([1, 2, 3, 4, 5, 6], 3)[5]).toBe(100);
    expect(rsi([6, 5, 4, 3, 2, 1], 3)[5]).toBe(0);
  });

  it("matches a hand-computed two-period example", () => {
    // changes: +1, -0.5, +1, -0.5, +1  (period 2)
    const values = rsi([10, 11, 10.5, 11.5, 11, 12], 2);
    expect(values[2]).toBeCloseTo(100 - 100 / (1 + 0.5 / 0.25), 8); // 66.666…
    expect(values[3]).toBeCloseTo(100 - 100 / (1 + 0.75 / 0.125), 8); // 85.714…
    expect(values[4]).toBeCloseTo(100 - 100 / (1 + 0.375 / 0.3125), 8); // 54.545…
    expect(values[5]).toBeCloseTo(100 - 100 / (1 + 0.6875 / 0.15625), 8); // 81.481…
  });

  it("leaves the warm-up undefined", () => {
    expect(rsi([1, 2, 3], 5)).toEqual([null, null, null]);
  });
});

describe("true range and atr (Wilder)", () => {
  it("uses high − low on the first bar and the true range afterwards", () => {
    const candles = [candle(1, 9, 10, 8, 9), candle(2, 9, 12, 10, 11), candle(3, 11, 11, 9, 10)];
    expect(trueRange(candles)).toEqual([2, 3, 2]);
  });

  it("seeds with the mean true range then smooths with Wilder", () => {
    const candles = [candle(1, 9, 10, 8, 9), candle(2, 9, 12, 10, 11), candle(3, 11, 11, 9, 10)];
    const values = atr(candles, 2);
    expect(values[1]).toBeCloseTo(2.5, 10); // (2 + 3) / 2
    expect(values[2]).toBeCloseTo((2.5 * 1 + 2) / 2, 10); // 2.25
  });
});

describe("rolling extremes", () => {
  it("takes the max/min over the trailing window including the current value", () => {
    expect(rollingMax([1, 3, 2, 5, 4], 2)).toEqual([null, 3, 3, 5, 5]);
    expect(rollingMin([1, 3, 2, 5, 4], 2)).toEqual([null, 1, 2, 2, 4]);
  });
});

describe("market structure", () => {
  const zigzag = [
    candle(1, 4, 5, 4, 4.5),
    candle(2, 6, 8, 6, 7),
    candle(3, 6, 6, 5, 5.5),
    candle(4, 8, 10, 8, 9),
    candle(5, 7, 7, 6, 6.5),
    candle(6, 10, 12, 10, 11),
    candle(7, 9, 9, 8, 8.5),
  ];

  it("finds fractal swings only when a full window exists on both sides", () => {
    expect(swingHighs(zigzag, 1)).toEqual([false, true, false, true, false, true, false]);
    expect(swingLows(zigzag, 1)).toEqual([false, false, true, false, true, false, false]);
  });

  it("classifies an uptrend once two higher highs and two higher lows are confirmed", () => {
    const trend = classifyTrend(zigzag, 1, 4);
    expect(trend[5]).toBe("up");
    expect(trend[6]).toBe("up");
    // Nothing is confirmed yet at the start.
    expect(trend[0]).toBe("sideways");
    expect(trend[1]).toBe("sideways");
  });

  it("stays sideways on a flat series", () => {
    const flat = Array.from({ length: 6 }, (_, i) => candle(i + 1, 5, 5, 5, 5));
    expect(classifyTrend(flat, 1, 4).every((value) => value === "sideways")).toBe(true);
  });
});

describe("helpers", () => {
  it("extracts closes and computes percent changes", () => {
    const candles = [candle(1, 1, 1, 1, 10), candle(2, 1, 1, 1, 11), candle(3, 1, 1, 1, 22)];
    expect(closes(candles)).toEqual([10, 11, 22]);
    const changes = percentChange([10, 11, 22]);
    expect(changes[0]).toBeNull();
    expect(changes[1]).toBeCloseTo(0.1, 10);
    expect(changes[2]).toBeCloseTo(1, 10);
  });

  it("returns null rather than infinity when the prior value is zero", () => {
    expect(percentChange([0, 5])[1]).toBeNull();
  });
});
