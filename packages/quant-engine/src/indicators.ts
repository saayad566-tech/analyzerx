/**
 * Technical indicators — real mathematics, no approximation and no stubs.
 *
 * Every function returns an array aligned to its input, with `null` during the warm-up period
 * rather than a fabricated value. That matters: a strategy must be able to tell "not yet defined"
 * apart from "zero", or it trades on numbers that do not exist.
 *
 * Smoothing follows the published definitions:
 *   - EMA uses the standard 2/(n+1) multiplier, seeded with the SMA of the first n values.
 *   - RSI and ATR use Wilder's smoothing (the original, not the SMA shortcut).
 */
import type { Candle } from "./core-types";

/** Simple moving average. */
export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/**
 * Exponential moving average, seeded with the SMA of the first `period` values.
 * Before the seed index the value is null (there is no meaningful EMA yet).
 */
export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i += 1) seed += values[i];
  let previous = seed / period;
  out[period - 1] = previous;
  for (let i = period; i < values.length; i += 1) {
    previous = values[i] * k + previous * (1 - k);
    out[i] = previous;
  }
  return out;
}

/** Wilder's Relative Strength Index. */
export function rsi(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0 || values.length <= period) return out;
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i += 1) {
    const change = values[i] - values[i - 1];
    if (change >= 0) gainSum += change;
    else lossSum -= change;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i += 1) {
    const change = values[i] - values[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/** True range per candle; the first candle has no previous close, so it uses high − low. */
export function trueRange(candles: Candle[]): number[] {
  return candles.map((candle, index) => {
    if (index === 0) return candle.high - candle.low;
    const previousClose = candles[index - 1].close;
    return Math.max(candle.high - candle.low, Math.abs(candle.high - previousClose), Math.abs(candle.low - previousClose));
  });
}

/** Wilder's Average True Range. */
export function atr(candles: Candle[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  if (period <= 0 || candles.length < period) return out;
  const ranges = trueRange(candles);
  let seed = 0;
  for (let i = 0; i < period; i += 1) seed += ranges[i];
  let previous = seed / period;
  out[period - 1] = previous;
  for (let i = period; i < candles.length; i += 1) {
    previous = (previous * (period - 1) + ranges[i]) / period;
    out[i] = previous;
  }
  return out;
}

/** Rolling maximum over a trailing window of `period` values (inclusive of the current index). */
export function rollingMax(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0) return out;
  for (let i = period - 1; i < values.length; i += 1) {
    let max = -Infinity;
    for (let j = i - period + 1; j <= i; j += 1) max = Math.max(max, values[j]);
    out[i] = max;
  }
  return out;
}

/** Rolling minimum over a trailing window of `period` values (inclusive of the current index). */
export function rollingMin(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0) return out;
  for (let i = period - 1; i < values.length; i += 1) {
    let min = Infinity;
    for (let j = i - period + 1; j <= i; j += 1) min = Math.min(min, values[j]);
    out[i] = min;
  }
  return out;
}

/**
 * Fractal swing highs: a bar whose high is strictly greater than the `wing` bars on each side.
 * Only bars with a full window on both sides can qualify, so this is inherently lagging — which is
 * exactly why it is safe to use as a signal without look-ahead.
 */
export function swingHighs(candles: Candle[], wing = 2): boolean[] {
  return candles.map((_, index) => {
    if (index < wing || index >= candles.length - wing) return false;
    const value = candles[index].high;
    for (let j = index - wing; j <= index + wing; j += 1) {
      if (j === index) continue;
      if (candles[j].high >= value) return false;
    }
    return true;
  });
}

/** Fractal swing lows; the mirror of {@link swingHighs}. */
export function swingLows(candles: Candle[], wing = 2): boolean[] {
  return candles.map((_, index) => {
    if (index < wing || index >= candles.length - wing) return false;
    const value = candles[index].low;
    for (let j = index - wing; j <= index + wing; j += 1) {
      if (j === index) continue;
      if (candles[j].low <= value) return false;
    }
    return true;
  });
}

export type TrendDirection = "up" | "down" | "sideways";

/**
 * Classify market structure from the most recent confirmed swings.
 * Uses only swings that closed before the current bar, so it never reads the future.
 */
export function classifyTrend(candles: Candle[], wing = 2, lookback = 4): TrendDirection[] {
  const highs = swingHighs(candles, wing);
  const lows = swingLows(candles, wing);
  const out: TrendDirection[] = new Array(candles.length).fill("sideways");
  const recentHighs: number[] = [];
  const recentLows: number[] = [];
  for (let i = 0; i < candles.length; i += 1) {
    // A swing at index i is only confirmed wing bars later, so it enters the state at i + wing.
    const confirmed = i - wing;
    if (confirmed >= 0) {
      if (highs[confirmed]) {
        recentHighs.push(candles[confirmed].high);
        if (recentHighs.length > lookback) recentHighs.shift();
      }
      if (lows[confirmed]) {
        recentLows.push(candles[confirmed].low);
        if (recentLows.length > lookback) recentLows.shift();
      }
    }
    if (recentHighs.length >= 2 && recentLows.length >= 2) {
      const higherHigh = recentHighs[recentHighs.length - 1] > recentHighs[recentHighs.length - 2];
      const higherLow = recentLows[recentLows.length - 1] > recentLows[recentLows.length - 2];
      const lowerHigh = recentHighs[recentHighs.length - 1] < recentHighs[recentHighs.length - 2];
      const lowerLow = recentLows[recentLows.length - 1] < recentLows[recentLows.length - 2];
      if (higherHigh && higherLow) out[i] = "up";
      else if (lowerHigh && lowerLow) out[i] = "down";
    }
  }
  return out;
}

/** Closes extracted from candles. */
export function closes(candles: Candle[]): number[] {
  return candles.map((candle) => candle.close);
}

/** Percentage change between consecutive values; index 0 is null. */
export function percentChange(values: number[]): (number | null)[] {
  return values.map((value, index) => (index === 0 ? null : values[index - 1] === 0 ? null : (value - values[index - 1]) / values[index - 1]));
}
