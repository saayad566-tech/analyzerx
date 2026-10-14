/**
 * Technical indicator engine.
 *
 * These assert the MATHS, not the shapes. Each expected value is either hand-computed
 * here from the published definition or a property the definition guarantees (a bounded
 * indicator staying in range, a warm-up period producing nulls, an average of a constant
 * series equalling the constant). A test that only checked "returns an array of the right
 * length" would pass on a wrong implementation.
 */
import { describe, it, expect } from "vitest";
import {
  sma, ema, wma, hma, vwma, stdev,
  bollingerBands, keltnerChannels, donchianChannels, atr,
  rsi, macd, stochastic, stochasticRsi, williamsR, cci, roc, momentum,
  adx, obv, accumulationDistribution, mfi, vwap,
  ichimoku, classicPivots, fibonacciPivots, supertrend,
  INDICATORS, indicatorMeta, latest, snapshot, isNum,
} from "../lib/indicators";

const close = (values: number[]) => values;
const nulls = (series: Array<number | null>) => series.filter((value) => value === null).length;

describe("simple moving average", () => {
  it("averages the window and leaves the warm-up null", () => {
    const result = sma(close([1, 2, 3, 4, 5]), 3);
    expect(result.slice(0, 2)).toEqual([null, null]);
    expect(result.slice(2)).toEqual([2, 3, 4]);
  });

  it("returns the constant for a flat series", () => {
    expect(sma(close([7, 7, 7, 7]), 2).slice(2)).toEqual([7, 7]);
  });

  it("is all null when the period exceeds the data", () => {
    expect(sma(close([1, 2]), 5).every((value) => value === null)).toBe(true);
  });

  it("rejects a non-positive or fractional period rather than guessing", () => {
    expect(sma(close([1, 2, 3]), 0).every((v) => v === null)).toBe(true);
    expect(sma(close([1, 2, 3]), 2.5).every((v) => v === null)).toBe(true);
  });
});

describe("exponential moving average", () => {
  it("seeds from the SMA of the first window", () => {
    // k = 2/(3+1) = 0.5. Seed = mean(1,2,3) = 2 at index 2.
    const result = ema(close([1, 2, 3, 4, 5]), 3);
    expect(result[2]).toBe(2);
    // index 3: 4*0.5 + 2*0.5 = 3 ; index 4: 5*0.5 + 3*0.5 = 4
    expect(result[3]).toBeCloseTo(3, 10);
    expect(result[4]).toBeCloseTo(4, 10);
  });

  it("returns the constant for a flat series", () => {
    expect(ema(close([5, 5, 5, 5]), 2).slice(1)).toEqual([5, 5, 5]);
  });
});

describe("weighted and hull moving averages", () => {
  it("weights the most recent value most heavily", () => {
    // period 3 on [1,2,3]: (1*1 + 2*2 + 3*3) / 6 = 14/6
    expect(wma(close([1, 2, 3]), 3)[2]).toBeCloseTo(14 / 6, 10);
  });

  it("returns the constant for a flat series (HMA included)", () => {
    const flat = new Array(40).fill(9);
    expect(hma(flat, 9).slice(-1)[0]).toBeCloseTo(9, 8);
  });

  it("produces nulls for the whole warm-up", () => {
    expect(nulls(hma(close([1, 2, 3, 4]), 9))).toBe(4);
  });
});

describe("volume-weighted moving average", () => {
  it("weights by volume", () => {
    // prices 10,20 with volumes 1,3 -> (10*1 + 20*3)/4 = 17.5
    const result = vwma(close([10, 20]), close([1, 3]), 2);
    expect(result[1]).toBeCloseTo(17.5, 10);
  });

  it("is null when volume is missing or zero", () => {
    expect(vwma(close([10, 20]), close([0, 0]), 2)[1]).toBeNull();
    expect(vwma(close([10, 20]), [null, 5], 2)[1]).toBeNull();
  });
});

describe("standard deviation and Bollinger Bands", () => {
  it("uses the population standard deviation", () => {
    // [2,4,4,4,5,5,7,9] population stdev = 2
    const result = stdev(close([2, 4, 4, 4, 5, 5, 7, 9]), 8);
    expect(result[7]).toBeCloseTo(2, 10);
  });

  it("places the bands two deviations from the mean", () => {
    const bands = bollingerBands(close([2, 4, 4, 4, 5, 5, 7, 9]), 8, 2);
    const last = bands[7];
    expect(last.middle).toBeCloseTo(5, 10);
    expect(last.upper).toBeCloseTo(9, 10);
    expect(last.lower).toBeCloseTo(1, 10);
  });

  it("reports %B as the close's position between the bands", () => {
    // [2,4,4,4,5,5,7,9]: mean 5, population stdev 2 -> upper 9, lower 1.
    // Only the last bar is defined for period 8, so both readings come from index 7.
    const upperSeries = bollingerBands(close([2, 4, 4, 4, 5, 5, 7, 9]), 8, 2);
    expect(upperSeries[7].percentB).toBeCloseTo(1, 8);   // close 9 sits on the upper band
    const lowerSeries = bollingerBands(close([9, 7, 5, 5, 4, 4, 4, 2]), 8, 2);
    // mean 5, population stdev 2 -> upper 9, lower 1 -> (2 - 1) / (9 - 1) = 0.125
    expect(lowerSeries[7].percentB).toBeCloseTo(0.125, 8);
    // Everything before the warm-up completes stays undefined.
    expect(upperSeries[6].percentB).toBeNull();
  });

  it("is undefined during the warm-up rather than partially computed", () => {
    const bands = bollingerBands(close([1, 2, 3]), 20, 2);
    expect(bands.every((band) => band.upper === null && band.middle === null && band.lower === null)).toBe(true);
  });
});

describe("channels", () => {
  it("brackets the window on Donchian", () => {
    const channels = donchianChannels(close([1, 5, 3, 2]), close([0, 4, 2, 1]), 3);
    expect(channels[3]).toEqual({ upper: 5, middle: 3, lower: 1 });
  });

  it("scales Keltner bands by ATR around an EMA", () => {
    const highs = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
    const lows = highs.map((h) => h - 2);
    const closes = highs.map((h) => h - 1);
    const channels = keltnerChannels(highs, lows, closes, 5, 2);
    const last = channels[channels.length - 1];
    expect(last.middle).not.toBeNull();
    expect(last.upper).toBeGreaterThan(last.middle as number);
    expect(last.lower).toBeLessThan(last.middle as number);
  });
});

describe("average true range", () => {
  it("includes the gap, not just the bar range", () => {
    // Two bars. Bar 1: high 10, low 9, previous close 5.
    // True range = max(10-9, |10-5|, |9-5|) = max(1, 5, 4) = 5.
    const result = atr(close([9, 10]), close([8, 9]), close([5, 10]), 1);
    expect(result[1]).toBeCloseTo(5, 10);
  });

  it("returns the constant bar range for a flat market", () => {
    const highs = new Array(20).fill(11);
    const lows = new Array(20).fill(10);
    const closes = new Array(20).fill(10.5);
    const result = atr(highs, lows, closes, 5);
    expect(result[19]).toBeCloseTo(1, 8);
  });
});

describe("relative strength index", () => {
  it("is 100 for an unbroken run of gains", () => {
    const rising = Array.from({ length: 30 }, (_, i) => 100 + i);
    expect(rsi(rising, 14)[29]).toBeCloseTo(100, 8);
  });

  it("is 0 for an unbroken run of losses", () => {
    const falling = Array.from({ length: 30 }, (_, i) => 100 - i);
    expect(rsi(falling, 14)[29]).toBeCloseTo(0, 8);
  });

  it("is 50 for a flat series, not a division by zero", () => {
    expect(rsi(new Array(30).fill(50), 14)[29]).toBe(50);
  });

  it("matches Wilder's first value for a known series", () => {
    // 15 closes -> first RSI at index 14. Alternating +2 / -1 over 14 changes:
    // gains: 7 * 2 = 14 -> avgGain 1 ; losses: 7 * 1 = 7 -> avgLoss 0.5
    // RS = 2 -> RSI = 100 - 100/3 = 66.667
    const series = [100];
    for (let i = 0; i < 14; i += 1) series.push(series[series.length - 1] + (i % 2 === 0 ? 2 : -1));
    expect(rsi(series, 14)[14]).toBeCloseTo(100 - 100 / 3, 6);
  });

  it("stays within 0 and 100 everywhere it is defined", () => {
    const noisy = Array.from({ length: 120 }, (_, i) => 100 + Math.sin(i / 3) * 12 + (i % 5));
    for (const value of rsi(noisy, 14)) {
      if (isNum(value)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe("MACD", () => {
  it("is the difference of the two EMAs", () => {
    const series = Array.from({ length: 60 }, (_, i) => 100 + i);
    const result = macd(series, 12, 26, 9);
    const last = result.macd[59];
    expect(last).not.toBeNull();
    // In a steady uptrend the fast EMA leads, so MACD is positive.
    expect(last as number).toBeGreaterThan(0);
  });

  it("has a histogram equal to the line minus the signal", () => {
    const series = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 5) * 5);
    const result = macd(series, 12, 26, 9);
    const i = 59;
    if (isNum(result.macd[i]) && isNum(result.signal[i])) {
      expect(result.histogram[i]).toBeCloseTo((result.macd[i] as number) - (result.signal[i] as number), 10);
    }
  });
});

describe("stochastic, Williams %R and CCI", () => {
  it("is 100 at the top of the range and 0 at the bottom", () => {
    const highs = new Array(20).fill(10);
    const lows = new Array(20).fill(0);
    const top = new Array(20).fill(10);
    const bottom = new Array(20).fill(0);
    expect(stochastic(highs, lows, top, 5, 1, 1).k[19]).toBeCloseTo(100, 8);
    expect(stochastic(highs, lows, bottom, 5, 1, 1).k[19]).toBeCloseTo(0, 8);
  });

  it("puts Williams %R at 0 at the top of the range and -100 at the bottom", () => {
    const highs = new Array(20).fill(10);
    const lows = new Array(20).fill(0);
    // 0 is the overbought end; -100 is the oversold end.
    expect(williamsR(highs, lows, new Array(20).fill(10), 5)[19]).toBeCloseTo(0, 8);
    expect(williamsR(highs, lows, new Array(20).fill(0), 5)[19]).toBeCloseTo(-100, 8);
  });

  it("keeps stochastic RSI bounded", () => {
    const series = Array.from({ length: 80 }, (_, i) => 100 + Math.sin(i / 4) * 10);
    for (const value of stochasticRsi(series, 14).k) {
      if (isNum(value)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });

  it("is 0 for a perfectly flat typical price", () => {
    const flat = new Array(30).fill(50);
    expect(cci(flat, flat, flat, 20)[29]).toBe(0);
  });
});

describe("rate of change and momentum", () => {
  it("measures percentage and absolute change", () => {
    expect(roc(close([100, 110]), 1)[1]).toBeCloseTo(10, 10);
    expect(momentum(close([100, 110]), 1)[1]).toBeCloseTo(10, 10);
  });

  it("is null when the base is zero rather than returning infinity", () => {
    expect(roc(close([0, 10]), 1)[1]).toBeNull();
  });
});

describe("ADX", () => {
  it("reports a strong trend in a steady directional move", () => {
    const closes = Array.from({ length: 80 }, (_, i) => 100 + i);
    const highs = closes.map((c) => c + 1);
    const lows = closes.map((c) => c - 1);
    const result = adx(highs, lows, closes, 14);
    expect(result.adx[79] as number).toBeGreaterThan(25);
    expect(result.plusDi[79] as number).toBeGreaterThan(result.minusDi[79] as number);
  });

  it("stays bounded", () => {
    const closes = Array.from({ length: 80 }, (_, i) => 100 + Math.sin(i / 3) * 8);
    const highs = closes.map((c) => c + 1);
    const lows = closes.map((c) => c - 1);
    const result = adx(highs, lows, closes, 14);
    for (const value of [...result.adx, ...result.plusDi, ...result.minusDi]) {
      if (isNum(value)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe("volume indicators", () => {
  it("adds volume on up bars and subtracts on down bars", () => {
    const result = obv(close([10, 11, 10]), close([100, 200, 300]));
    expect(result[1]).toBeCloseTo(200, 10);
    expect(result[2]).toBeCloseTo(-100, 10);
  });

  it("puts accumulation at the high of the bar", () => {
    // Close at the high -> multiplier 1 -> AD += volume
    const result = accumulationDistribution(close([10]), close([0]), close([10]), close([500]));
    expect(result[0]).toBeCloseTo(500, 10);
  });

  it("gives MFI 100 when every bar rises", () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
    const highs = closes.map((c) => c + 1);
    const lows = closes.map((c) => c - 1);
    const volumes = new Array(20).fill(1000);
    expect(mfi(highs, lows, closes, volumes, 14)[19]).toBeCloseTo(100, 8);
  });

  it("gives VWAP the typical price of a single bar", () => {
    expect(vwap(close([10]), close([8]), close([9]), close([100]))[0]).toBeCloseTo(9, 10);
  });
});

describe("Ichimoku", () => {
  it("displaces the cloud forward and the lagging line backward", () => {
    const closes = Array.from({ length: 80 }, (_, i) => 100 + i);
    const highs = closes.map((c) => c + 1);
    const lows = closes.map((c) => c - 1);
    const cloud = ichimoku(highs, lows, closes, 9, 26, 52);
    // The cloud at bar 79 comes from bar 53.
    expect(cloud.senkouA[79]).not.toBeNull();
    expect(cloud.senkouA[25]).toBeNull();
    // The lagging line at bar 0 is the close 26 bars later.
    expect(cloud.chikou[0]).toBeCloseTo(closes[26], 10);
  });
});

describe("pivots and Supertrend", () => {
  it("places the classic pivot at the mean of high, low and close", () => {
    const pivots = classicPivots(110, 90, 100);
    expect(pivots?.pivot).toBeCloseTo(100, 10);
    expect(pivots?.r1).toBeCloseTo(110, 10);
    expect(pivots?.s1).toBeCloseTo(90, 10);
  });

  it("returns null rather than NaN for a non-finite pivot input", () => {
    expect(classicPivots(Number.NaN, 90, 100)).toBeNull();
    expect(fibonacciPivots(110, 90, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("follows the trend from the first defined bar, even when close sits at the mid price", () => {
    // This is the regression: with high = c+1 and low = c-1 the mid price IS the close,
    // so a mid-price tie-break always chose "up" and a downtrend never flipped.
    const up = Array.from({ length: 60 }, (_, i) => 100 + i);
    const upResult = supertrend(up.map((c) => c + 1), up.map((c) => c - 1), up, 10, 3);
    expect(upResult.direction[59]).toBe(1);
    const down = Array.from({ length: 60 }, (_, i) => 200 - i);
    const downResult = supertrend(down.map((c) => c + 1), down.map((c) => c - 1), down, 10, 3);
    expect(downResult.direction[59]).toBe(-1);
    // And it is right from the first bar that has an ATR, not only at the end.
    const firstDown = downResult.direction.findIndex((value) => value !== null);
    expect(downResult.direction[firstDown]).toBe(-1);
  });
});

describe("catalogue and snapshots", () => {
  const input = {
    highs: Array.from({ length: 80 }, (_, i) => 101 + Math.sin(i / 4) * 4 + i * 0.1),
    lows: Array.from({ length: 80 }, (_, i) => 99 + Math.sin(i / 4) * 4 + i * 0.1),
    closes: Array.from({ length: 80 }, (_, i) => 100 + Math.sin(i / 4) * 4 + i * 0.1),
    volumes: Array.from({ length: 80 }, (_, i) => 1000 + (i % 7) * 50),
  };

  it("covers the indicators the mandate names, and more", () => {
    const ids = INDICATORS.map((entry) => entry.id);
    for (const required of ["rsi", "macd", "bollinger", "sma", "ema", "atr", "stochastic", "adx", "obv", "vwap", "ichimoku", "supertrend", "cci", "mfi", "williamsR"]) {
      expect(ids, `${required} is missing from the catalogue`).toContain(required);
    }
    expect(INDICATORS.length).toBeGreaterThanOrEqual(24);
  });

  it("gives every indicator a label, defaults and a placement", () => {
    for (const entry of INDICATORS) {
      expect(entry.label.length).toBeGreaterThan(2);
      expect(["overlay", "panel"]).toContain(entry.placement);
      expect(["price", "bounded", "unbounded"]).toContain(entry.range);
    }
  });

  it("produces a snapshot for every catalogued indicator without throwing", () => {
    for (const entry of INDICATORS) {
      const result = snapshot(entry.id, input);
      expect(result.id).toBe(entry.id);
      expect(result.reading.length).toBeGreaterThan(3);
    }
  });

  it("reports the latest defined value, skipping trailing nulls", () => {
    expect(latest([1, 2, null])).toBe(2);
    expect(latest([null, null])).toBeNull();
    expect(latest([])).toBeNull();
  });

  it("returns a useful reading for RSI rather than a bare number", () => {
    const rising = { highs: [], lows: [], closes: Array.from({ length: 60 }, (_, i) => 100 + i), volumes: [] };
    const result = snapshot("rsi", { ...rising, highs: [], lows: [], volumes: [] });
    expect(result.reading).toMatch(/overbought|oversold|neutral/i);
  });

  it("has metadata for every id and none for an unknown one", () => {
    expect(indicatorMeta("rsi")?.label).toBe("Relative Strength Index");
    expect(indicatorMeta("nope" as never)).toBeUndefined();
  });
});
