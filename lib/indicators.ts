/**
 * Technical indicator engine.
 *
 * Every function here is pure: it takes a series and returns a series of the same
 * length, with `null` where the indicator is not yet defined (the warm-up period). That
 * contract matters — a chart must be able to align an indicator to its price bar by
 * index without guessing, and a screener must be able to ask "what is RSI at the latest
 * bar" and get `null` rather than a wrong number when there is not enough history.
 *
 * Nothing is extrapolated and nothing is filled in: an undefined value is `null`, never
 * zero, never the previous value carried forward.
 *
 * Implementations follow the standard published definitions (Wilder's smoothing for RSI,
 * ATR and ADX; the original Appel MACD; Bollinger's population standard deviation). Where
 * a convention varies between platforms, the choice is stated in the doc comment.
 */

export type Series = ReadonlyArray<number | null>;

/* ------------------------------------------------------------------ *
 * Guards
 * ------------------------------------------------------------------ */

/** A value is usable when it is a finite number. `null`, NaN and Infinity are not. */
export function isNum(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Close prices that are usable, as a dense array with their original indices. */
function usable(values: Series): Array<{ index: number; value: number }> {
  const out: Array<{ index: number; value: number }> = [];
  values.forEach((value, index) => {
    if (isNum(value)) out.push({ index, value });
  });
  return out;
}

function fill(length: number): Array<number | null> {
  return new Array<number | null>(length).fill(null);
}

/* ------------------------------------------------------------------ *
 * Moving averages
 * ------------------------------------------------------------------ */

/**
 * Simple moving average.
 *
 * The first `period - 1` entries are null; the value at index i is the mean of
 * `[i - period + 1, i]`.
 */
export function sma(values: Series, period: number): Array<number | null> {
  const out = fill(values.length);
  if (!Number.isInteger(period) || period < 1) return out;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (!isNum(value)) {
      // A gap resets the window: averaging across a hole would invent data.
      sum = 0;
      count = 0;
      continue;
    }
    sum += value;
    count += 1;
    if (count > period) {
      const dropped = values[i - period];
      if (isNum(dropped)) sum -= dropped;
      else count = period; // window is no longer contiguous; restart it
    }
    if (count >= period) out[i] = sum / period;
  }
  return out;
}

/**
 * Exponential moving average, seeded with the SMA of the first `period` values.
 *
 * `k = 2 / (period + 1)`. The seed matters: seeding from the first value instead of the
 * SMA produces a visibly different early curve.
 */
export function ema(values: Series, period: number): Array<number | null> {
  const out = fill(values.length);
  if (!Number.isInteger(period) || period < 1) return out;
  const k = 2 / (period + 1);
  let previous: number | null = null;
  let window: number[] = [];
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (!isNum(value)) {
      previous = null;
      window = [];
      continue;
    }
    if (previous === null) {
      window.push(value);
      if (window.length === period) {
        previous = window.reduce((sum, item) => sum + item, 0) / period;
        out[i] = previous;
      }
      continue;
    }
    previous = value * k + previous * (1 - k);
    out[i] = previous;
  }
  return out;
}

/** Weighted moving average: the most recent value carries weight `period`. */
export function wma(values: Series, period: number): Array<number | null> {
  const out = fill(values.length);
  if (!Number.isInteger(period) || period < 1) return out;
  const denominator = (period * (period + 1)) / 2;
  for (let i = period - 1; i < values.length; i += 1) {
    let weighted = 0;
    let ok = true;
    for (let j = 0; j < period; j += 1) {
      const value = values[i - period + 1 + j];
      if (!isNum(value)) { ok = false; break; }
      weighted += value * (j + 1);
    }
    if (ok) out[i] = weighted / denominator;
  }
  return out;
}

/** Hull moving average: WMA(2*WMA(n/2) - WMA(n), sqrt(n)). */
export function hma(values: Series, period: number): Array<number | null> {
  const out = fill(values.length);
  if (!Number.isInteger(period) || period < 2) return out;
  const half = wma(values, Math.max(1, Math.floor(period / 2)));
  const full = wma(values, period);
  const raw = values.map((_, i) => (isNum(half[i]) && isNum(full[i]) ? 2 * (half[i] as number) - (full[i] as number) : null));
  const smoothed = wma(raw, Math.max(1, Math.round(Math.sqrt(period))));
  for (let i = 0; i < values.length; i += 1) out[i] = smoothed[i] ?? null;
  return out;
}

/** Volume-weighted moving average. Falls back to null where volume is missing. */
export function vwma(values: Series, volumes: Series, period: number): Array<number | null> {
  const out = fill(values.length);
  if (!Number.isInteger(period) || period < 1) return out;
  for (let i = period - 1; i < values.length; i += 1) {
    let pv = 0;
    let v = 0;
    let ok = true;
    for (let j = 0; j < period; j += 1) {
      const price = values[i - period + 1 + j];
      const volume = volumes[i - period + 1 + j];
      if (!isNum(price) || !isNum(volume)) { ok = false; break; }
      pv += price * volume;
      v += volume;
    }
    if (ok && v > 0) out[i] = pv / v;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Volatility
 * ------------------------------------------------------------------ */

/** Population standard deviation over a rolling window. */
export function stdev(values: Series, period: number): Array<number | null> {
  const out = fill(values.length);
  if (!Number.isInteger(period) || period < 2) return out;
  for (let i = period - 1; i < values.length; i += 1) {
    const window: number[] = [];
    let ok = true;
    for (let j = 0; j < period; j += 1) {
      const value = values[i - period + 1 + j];
      if (!isNum(value)) { ok = false; break; }
      window.push(value);
    }
    if (!ok) continue;
    const mean = window.reduce((sum, item) => sum + item, 0) / period;
    const variance = window.reduce((sum, item) => sum + (item - mean) ** 2, 0) / period;
    out[i] = Math.sqrt(variance);
  }
  return out;
}

export type BollingerBand = { upper: number | null; middle: number | null; lower: number | null; bandwidth: number | null; percentB: number | null };

/**
 * Bollinger Bands. `multiplier` defaults to 2, the original setting.
 *
 * `bandwidth` is (upper - lower) / middle, the standard squeeze measure.
 * `%B` is (price - lower) / (upper - lower): 1 at the upper band, 0 at the lower.
 */
export function bollingerBands(values: Series, period = 20, multiplier = 2): BollingerBand[] {
  const middle = sma(values, period);
  const deviation = stdev(values, period);
  return values.map((value, i) => {
    const m = middle[i];
    const d = deviation[i];
    if (!isNum(m) || !isNum(d)) return { upper: null, middle: null, lower: null, bandwidth: null, percentB: null };
    const upper = m + multiplier * d;
    const lower = m - multiplier * d;
    const width = upper - lower;
    return {
      upper,
      middle: m,
      lower,
      bandwidth: m === 0 ? null : width / m,
      percentB: !isNum(value) || width === 0 ? null : (value - lower) / width,
    };
  });
}

export type KeltnerChannel = { upper: number | null; middle: number | null; lower: number | null };

/** Keltner Channels: EMA middle with ATR-scaled bands. */
export function keltnerChannels(highs: Series, lows: Series, closes: Series, period = 20, multiplier = 2): KeltnerChannel[] {
  const middle = ema(closes, period);
  const range = atr(highs, lows, closes, period);
  return closes.map((_, i) => {
    const m = middle[i];
    const a = range[i];
    if (!isNum(m) || !isNum(a)) return { upper: null, middle: null, lower: null };
    return { upper: m + multiplier * a, middle: m, lower: m - multiplier * a };
  });
}

export type DonchianChannel = { upper: number | null; middle: number | null; lower: number | null };

/** Donchian Channels: the highest high and lowest low over the window. */
export function donchianChannels(highs: Series, lows: Series, period = 20): DonchianChannel[] {
  const out: DonchianChannel[] = new Array(highs.length).fill(null).map(() => ({ upper: null, middle: null, lower: null }));
  if (!Number.isInteger(period) || period < 1) return out;
  for (let i = period - 1; i < highs.length; i += 1) {
    let hi = -Infinity;
    let lo = Infinity;
    let ok = true;
    for (let j = 0; j < period; j += 1) {
      const h = highs[i - period + 1 + j];
      const l = lows[i - period + 1 + j];
      if (!isNum(h) || !isNum(l)) { ok = false; break; }
      if (h > hi) hi = h;
      if (l < lo) lo = l;
    }
    if (ok) out[i] = { upper: hi, middle: (hi + lo) / 2, lower: lo };
  }
  return out;
}

/**
 * Average True Range with Wilder's smoothing.
 *
 * True range is max(high - low, |high - prevClose|, |low - prevClose|), so a gap is
 * included rather than being hidden inside a bar's own range.
 */
export function atr(highs: Series, lows: Series, closes: Series, period = 14): Array<number | null> {
  const out = fill(closes.length);
  if (!Number.isInteger(period) || period < 1) return out;
  const trueRange = fill(closes.length);
  for (let i = 1; i < closes.length; i += 1) {
    const h = highs[i];
    const l = lows[i];
    const prev = closes[i - 1];
    if (!isNum(h) || !isNum(l)) continue;
    const spread = h - l;
    if (!isNum(prev)) { trueRange[i] = spread; continue; }
    trueRange[i] = Math.max(spread, Math.abs(h - prev), Math.abs(l - prev));
  }
  let previous: number | null = null;
  let window: number[] = [];
  for (let i = 1; i < trueRange.length; i += 1) {
    const value = trueRange[i];
    if (!isNum(value)) { previous = null; window = []; continue; }
    if (previous === null) {
      window.push(value);
      if (window.length === period) {
        previous = window.reduce((sum, item) => sum + item, 0) / period;
        out[i] = previous;
      }
      continue;
    }
    previous = (previous * (period - 1) + value) / period;
    out[i] = previous;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Momentum
 * ------------------------------------------------------------------ */

/**
 * Relative Strength Index with Wilder's smoothing (the original definition).
 *
 * When the average loss is zero the RSI is 100, not undefined: an unbroken run of gains
 * is genuinely maximal strength. When both averages are zero (a flat series) it is 50,
 * which is the neutral reading rather than a division by zero.
 */
export function rsi(closes: Series, period = 14): Array<number | null> {
  const out = fill(closes.length);
  if (!Number.isInteger(period) || period < 1) return out;
  let avgGain: number | null = null;
  let avgLoss: number | null = null;
  let gains: number[] = [];
  let losses: number[] = [];
  for (let i = 1; i < closes.length; i += 1) {
    const current = closes[i];
    const previous = closes[i - 1];
    if (!isNum(current) || !isNum(previous)) { avgGain = null; avgLoss = null; gains = []; losses = []; continue; }
    const change = current - previous;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    if (avgGain === null || avgLoss === null) {
      gains.push(gain);
      losses.push(loss);
      if (gains.length === period) {
        avgGain = gains.reduce((sum, item) => sum + item, 0) / period;
        avgLoss = losses.reduce((sum, item) => sum + item, 0) / period;
        out[i] = avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss);
      }
      continue;
    }
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export type MacdResult = { macd: Array<number | null>; signal: Array<number | null>; histogram: Array<number | null> };

/**
 * MACD (Appel): EMA(fast) - EMA(slow), with an EMA(signal) of that line.
 *
 * The signal EMA is computed over the MACD line itself, skipping the warm-up nulls, so
 * the signal is not distorted by the leading gap.
 */
export function macd(closes: Series, fast = 12, slow = 26, signalPeriod = 9): MacdResult {
  const fastEma = ema(closes, fast);
  const slowEma = ema(closes, slow);
  const macdLine = closes.map((_, i) => (isNum(fastEma[i]) && isNum(slowEma[i]) ? (fastEma[i] as number) - (slowEma[i] as number) : null));
  const signal = ema(macdLine, signalPeriod);
  const histogram = macdLine.map((value, i) => (isNum(value) && isNum(signal[i]) ? value - (signal[i] as number) : null));
  return { macd: macdLine, signal, histogram };
}

export type StochasticResult = { k: Array<number | null>; d: Array<number | null> };

/** Stochastic oscillator. `%K` is smoothed by `smoothK`, `%D` is an SMA of `%K`. */
export function stochastic(highs: Series, lows: Series, closes: Series, period = 14, smoothK = 3, smoothD = 3): StochasticResult {
  const rawK = fill(closes.length);
  for (let i = period - 1; i < closes.length; i += 1) {
    let hi = -Infinity;
    let lo = Infinity;
    let ok = true;
    for (let j = 0; j < period; j += 1) {
      const h = highs[i - period + 1 + j];
      const l = lows[i - period + 1 + j];
      if (!isNum(h) || !isNum(l)) { ok = false; break; }
      if (h > hi) hi = h;
      if (l < lo) lo = l;
    }
    const close = closes[i];
    if (!ok || !isNum(close)) continue;
    rawK[i] = hi === lo ? 50 : ((close - lo) / (hi - lo)) * 100;
  }
  const k = sma(rawK, smoothK);
  const d = sma(k, smoothD);
  return { k, d };
}

/** Stochastic RSI: the Stochastic oscillator applied to the RSI series itself. */
export function stochasticRsi(closes: Series, period = 14, smoothK = 3, smoothD = 3): StochasticResult {
  const rsiSeries = rsi(closes, period);
  return stochastic(rsiSeries, rsiSeries, rsiSeries, period, smoothK, smoothD);
}

/** Williams %R: -100 at the lowest low of the window, 0 at the highest high. */
export function williamsR(highs: Series, lows: Series, closes: Series, period = 14): Array<number | null> {
  const out = fill(closes.length);
  for (let i = period - 1; i < closes.length; i += 1) {
    let hi = -Infinity;
    let lo = Infinity;
    let ok = true;
    for (let j = 0; j < period; j += 1) {
      const h = highs[i - period + 1 + j];
      const l = lows[i - period + 1 + j];
      if (!isNum(h) || !isNum(l)) { ok = false; break; }
      if (h > hi) hi = h;
      if (l < lo) lo = l;
    }
    const close = closes[i];
    if (!ok || !isNum(close)) continue;
    out[i] = hi === lo ? -50 : ((hi - close) / (hi - lo)) * -100;
  }
  return out;
}

/** Commodity Channel Index. */
export function cci(highs: Series, lows: Series, closes: Series, period = 20): Array<number | null> {
  const typical = closes.map((close, i) => (isNum(close) && isNum(highs[i]) && isNum(lows[i]) ? ((highs[i] as number) + (lows[i] as number) + close) / 3 : null));
  const average = sma(typical, period);
  const out = fill(closes.length);
  for (let i = period - 1; i < closes.length; i += 1) {
    const mean = average[i];
    if (!isNum(mean)) continue;
    let deviation = 0;
    let ok = true;
    for (let j = 0; j < period; j += 1) {
      const value = typical[i - period + 1 + j];
      if (!isNum(value)) { ok = false; break; }
      deviation += Math.abs(value - mean);
    }
    if (!ok) continue;
    const meanDeviation = deviation / period;
    out[i] = meanDeviation === 0 ? 0 : ((typical[i] as number) - mean) / (0.015 * meanDeviation);
  }
  return out;
}

/** Rate of change over `period` bars, as a percentage. */
export function roc(values: Series, period = 12): Array<number | null> {
  const out = fill(values.length);
  for (let i = period; i < values.length; i += 1) {
    const current = values[i];
    const past = values[i - period];
    if (!isNum(current) || !isNum(past) || past === 0) continue;
    out[i] = ((current - past) / past) * 100;
  }
  return out;
}

/** Raw momentum: the difference over `period` bars. */
export function momentum(values: Series, period = 10): Array<number | null> {
  const out = fill(values.length);
  for (let i = period; i < values.length; i += 1) {
    const current = values[i];
    const past = values[i - period];
    if (!isNum(current) || !isNum(past)) continue;
    out[i] = current - past;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Trend strength
 * ------------------------------------------------------------------ */

export type AdxResult = { adx: Array<number | null>; plusDi: Array<number | null>; minusDi: Array<number | null> };

/**
 * Average Directional Index with Wilder's smoothing.
 *
 * Returns +DI and -DI alongside ADX, because ADX alone says how strong a trend is but
 * not which way it points.
 */
export function adx(highs: Series, lows: Series, closes: Series, period = 14): AdxResult {
  const length = closes.length;
  const plusDm = fill(length);
  const minusDm = fill(length);
  const trueRange = fill(length);
  for (let i = 1; i < length; i += 1) {
    const h = highs[i];
    const l = lows[i];
    const prevH = highs[i - 1];
    const prevL = lows[i - 1];
    const prevC = closes[i - 1];
    if (!isNum(h) || !isNum(l)) continue;
    if (isNum(prevH) && isNum(prevL)) {
      const up = h - prevH;
      const down = prevL - l;
      plusDm[i] = up > down && up > 0 ? up : 0;
      minusDm[i] = down > up && down > 0 ? down : 0;
    }
    if (isNum(prevC)) trueRange[i] = Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
    else trueRange[i] = h - l;
  }
  const smooth = (series: Array<number | null>) => {
    const out = fill(length);
    let previous: number | null = null;
    let window: number[] = [];
    for (let i = 1; i < length; i += 1) {
      const value = series[i];
      if (!isNum(value)) { previous = null; window = []; continue; }
      if (previous === null) {
        window.push(value);
        if (window.length === period) {
          previous = window.reduce((sum, item) => sum + item, 0);
          out[i] = previous;
        }
        continue;
      }
      previous = previous - previous / period + value;
      out[i] = previous;
    }
    return out;
  };
  const trSmooth = smooth(trueRange);
  const plusSmooth = smooth(plusDm);
  const minusSmooth = smooth(minusDm);
  const plusDi = fill(length);
  const minusDi = fill(length);
  const dx = fill(length);
  for (let i = 0; i < length; i += 1) {
    const tr = trSmooth[i];
    if (!isNum(tr) || tr === 0) continue;
    const plus = plusSmooth[i];
    const minus = minusSmooth[i];
    if (!isNum(plus) || !isNum(minus)) continue;
    const pdi = (plus / tr) * 100;
    const mdi = (minus / tr) * 100;
    plusDi[i] = pdi;
    minusDi[i] = mdi;
    const sum = pdi + mdi;
    dx[i] = sum === 0 ? 0 : (Math.abs(pdi - mdi) / sum) * 100;
  }
  const out = fill(length);
  let previous: number | null = null;
  let window: number[] = [];
  for (let i = 0; i < length; i += 1) {
    const value = dx[i];
    if (!isNum(value)) { previous = null; window = []; continue; }
    if (previous === null) {
      window.push(value);
      if (window.length === period) {
        previous = window.reduce((sum, item) => sum + item, 0) / period;
        out[i] = previous;
      }
      continue;
    }
    previous = (previous * (period - 1) + value) / period;
    out[i] = previous;
  }
  return { adx: out, plusDi, minusDi };
}

/* ------------------------------------------------------------------ *
 * Volume
 * ------------------------------------------------------------------ */

/** On-balance volume: a running total that adds volume on up bars and subtracts on down bars. */
export function obv(closes: Series, volumes: Series): Array<number | null> {
  const out = fill(closes.length);
  let total: number | null = null;
  for (let i = 1; i < closes.length; i += 1) {
    const current = closes[i];
    const previous = closes[i - 1];
    const volume = volumes[i];
    if (!isNum(current) || !isNum(previous) || !isNum(volume)) continue;
    if (total === null) total = 0;
    if (current > previous) total += volume;
    else if (current < previous) total -= volume;
    out[i] = total;
  }
  return out;
}

/** Accumulation/Distribution line. */
export function accumulationDistribution(highs: Series, lows: Series, closes: Series, volumes: Series): Array<number | null> {
  const out = fill(closes.length);
  let total: number | null = null;
  for (let i = 0; i < closes.length; i += 1) {
    const h = highs[i];
    const l = lows[i];
    const c = closes[i];
    const v = volumes[i];
    if (!isNum(h) || !isNum(l) || !isNum(c) || !isNum(v)) continue;
    if (total === null) total = 0;
    const range = h - l;
    const multiplier = range === 0 ? 0 : ((c - l) - (h - c)) / range;
    total += multiplier * v;
    out[i] = total;
  }
  return out;
}

/** Money Flow Index: a volume-weighted RSI over typical price. */
export function mfi(highs: Series, lows: Series, closes: Series, volumes: Series, period = 14): Array<number | null> {
  const out = fill(closes.length);
  const typical = closes.map((c, i) => (isNum(c) && isNum(highs[i]) && isNum(lows[i]) ? ((highs[i] as number) + (lows[i] as number) + c) / 3 : null));
  for (let i = period; i < closes.length; i += 1) {
    let positive = 0;
    let negative = 0;
    let ok = true;
    for (let j = 0; j < period; j += 1) {
      const index = i - j;
      const price = typical[index];
      const previous = typical[index - 1];
      const volume = volumes[index];
      if (!isNum(price) || !isNum(previous) || !isNum(volume)) { ok = false; break; }
      const flow = price * volume;
      if (price > previous) positive += flow;
      else if (price < previous) negative += flow;
    }
    if (!ok) continue;
    out[i] = negative === 0 ? 100 : 100 - 100 / (1 + positive / negative);
  }
  return out;
}

/** Volume-weighted average price, cumulative from the start of the series. */
export function vwap(highs: Series, lows: Series, closes: Series, volumes: Series): Array<number | null> {
  const out = fill(closes.length);
  let pv = 0;
  let v = 0;
  for (let i = 0; i < closes.length; i += 1) {
    const h = highs[i];
    const l = lows[i];
    const c = closes[i];
    const vol = volumes[i];
    if (!isNum(h) || !isNum(l) || !isNum(c) || !isNum(vol)) continue;
    const typical = (h + l + c) / 3;
    pv += typical * vol;
    v += vol;
    out[i] = v === 0 ? null : pv / v;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Ichimoku
 * ------------------------------------------------------------------ */

export type IchimokuResult = {
  tenkan: Array<number | null>;
  kijun: Array<number | null>;
  senkouA: Array<number | null>;
  senkouB: Array<number | null>;
  chikou: Array<number | null>;
};

/**
 * Ichimoku Kinko Hyo.
 *
 * `senkouA`/`senkouB` are displaced FORWARD by `senkouBPeriod` bars, and `chikou` is
 * displaced BACKWARD by `kijunPeriod`. The arrays stay index-aligned to the price series:
 * the value at index i is the cloud value that applies at bar i, which is what a chart
 * needs to draw the cloud over the candles.
 */
export function ichimoku(highs: Series, lows: Series, closes: Series, tenkanPeriod = 9, kijunPeriod = 26, senkouBPeriod = 52): IchimokuResult {
  const length = closes.length;
  const midpoint = (period: number) => {
    const out = fill(length);
    for (let i = period - 1; i < length; i += 1) {
      let hi = -Infinity;
      let lo = Infinity;
      let ok = true;
      for (let j = 0; j < period; j += 1) {
        const h = highs[i - period + 1 + j];
        const l = lows[i - period + 1 + j];
        if (!isNum(h) || !isNum(l)) { ok = false; break; }
        if (h > hi) hi = h;
        if (l < lo) lo = l;
      }
      if (ok) out[i] = (hi + lo) / 2;
    }
    return out;
  };
  const tenkan = midpoint(tenkanPeriod);
  const kijun = midpoint(kijunPeriod);
  const rawA = fill(length);
  for (let i = 0; i < length; i += 1) {
    if (isNum(tenkan[i]) && isNum(kijun[i])) rawA[i] = ((tenkan[i] as number) + (kijun[i] as number)) / 2;
  }
  const rawB = midpoint(senkouBPeriod);
  const senkouA = fill(length);
  const senkouB = fill(length);
  for (let i = 0; i < length; i += 1) {
    const target = i - kijunPeriod;
    if (target >= 0) {
      senkouA[i] = rawA[target];
      senkouB[i] = rawB[target];
    }
  }
  const chikou = fill(length);
  for (let i = 0; i < length; i += 1) {
    const source = i + kijunPeriod;
    if (source < length) chikou[i] = closes[source];
  }
  return { tenkan, kijun, senkouA, senkouB, chikou };
}

/* ------------------------------------------------------------------ *
 * Pivots and stop-and-reverse
 * ------------------------------------------------------------------ */

export type PivotLevels = { pivot: number; r1: number; r2: number; r3: number; s1: number; s2: number; s3: number };

/**
 * Classic floor-trader pivots from a completed period's high, low and close.
 *
 * Takes scalars, not series: a pivot is a property of the previous session, not of the
 * current bar.
 */
export function classicPivots(high: number, low: number, close: number): PivotLevels | null {
  if (![high, low, close].every((value) => Number.isFinite(value))) return null;
  const pivot = (high + low + close) / 3;
  const range = high - low;
  return {
    pivot,
    r1: 2 * pivot - low,
    s1: 2 * pivot - high,
    r2: pivot + range,
    s2: pivot - range,
    r3: high + 2 * (pivot - low),
    s3: low - 2 * (high - pivot),
  };
}

/** Fibonacci pivots from a completed period's high, low and close. */
export function fibonacciPivots(high: number, low: number, close: number): PivotLevels | null {
  if (![high, low, close].every((value) => Number.isFinite(value))) return null;
  const pivot = (high + low + close) / 3;
  const range = high - low;
  return {
    pivot,
    r1: pivot + 0.382 * range,
    r2: pivot + 0.618 * range,
    r3: pivot + range,
    s1: pivot - 0.382 * range,
    s2: pivot - 0.618 * range,
    s3: pivot - range,
  };
}

/**
 * Supertrend.
 *
 * Returns the trend line and the direction (`1` up, `-1` down). The band is only allowed
 * to move in the direction of the trend, which is what stops the line from whipsawing
 * inside a range.
 */
export function supertrend(highs: Series, lows: Series, closes: Series, period = 10, multiplier = 3): { line: Array<number | null>; direction: Array<number | null> } {
  const length = closes.length;
  const range = atr(highs, lows, closes, period);
  const line = fill(length);
  const direction = fill(length);
  let previousUpper: number | null = null;
  let previousLower: number | null = null;
  let previousDirection: number | null = null;
  for (let i = 0; i < length; i += 1) {
    const a = range[i];
    const h = highs[i];
    const l = lows[i];
    const c = closes[i];
    if (!isNum(a) || !isNum(h) || !isNum(l) || !isNum(c)) continue;
    const mid = (h + l) / 2;
    let upper = mid + multiplier * a;
    let lower = mid - multiplier * a;
    if (previousUpper !== null && !(upper < previousUpper || c > previousUpper)) upper = previousUpper;
    if (previousLower !== null && !(lower > previousLower || c < previousLower)) lower = previousLower;
    let dir: number;
    if (previousDirection === null) {
      // The initial direction used to be `c >= mid ? 1 : -1`. For a bar whose close sits
      // exactly at (high + low) / 2 that is a tie, so it always chose "up" — and in a
      // monotonic downtrend the uptrend rule never fires (the lower band trails below
      // price), so the wrong direction stuck for the whole series. The price change is
      // the reliable signal; the mid-price comparison is only the fallback when there is
      // no previous close to compare against.
      const previousClose = closes[i - 1];
      dir = isNum(previousClose) && c !== previousClose ? (c > previousClose ? 1 : -1) : c >= mid ? 1 : -1;
    }
    else if (previousDirection === 1) dir = c < lower ? -1 : 1;
    else dir = c > upper ? 1 : -1;
    line[i] = dir === 1 ? lower : upper;
    direction[i] = dir;
    previousUpper = upper;
    previousLower = lower;
    previousDirection = dir;
  }
  return { line, direction };
}

/* ------------------------------------------------------------------ *
 * Registry and summary
 * ------------------------------------------------------------------ */

export type IndicatorId =
  | "sma" | "ema" | "wma" | "hma" | "vwma"
  | "bollinger" | "keltner" | "donchian" | "atr" | "stdev"
  | "rsi" | "macd" | "stochastic" | "stochrsi" | "williamsR" | "cci" | "roc" | "momentum"
  | "adx" | "obv" | "ad" | "mfi" | "vwap"
  | "ichimoku" | "supertrend" | "pivots";

export type IndicatorMeta = {
  id: IndicatorId;
  label: string;
  /** `overlay` draws on the price pane; `panel` gets its own pane below it. */
  placement: "overlay" | "panel";
  /** Bounded indicators have a natural 0-100 (or -100-0) range, so the panel can be scaled. */
  range: "price" | "bounded" | "unbounded";
  /** Default parameters, used when the caller does not override them. */
  defaults: Record<string, number>;
  summary: string;
};

/**
 * The indicator catalogue. The chart screen and the screener both read this, so a new
 * indicator is added in one place.
 */
export const INDICATORS: readonly IndicatorMeta[] = [
  { id: "sma", label: "Simple moving average", placement: "overlay", range: "price", defaults: { period: 20 }, summary: "Mean close over the period." },
  { id: "ema", label: "Exponential moving average", placement: "overlay", range: "price", defaults: { period: 20 }, summary: "Recency-weighted mean close." },
  { id: "wma", label: "Weighted moving average", placement: "overlay", range: "price", defaults: { period: 20 }, summary: "Linearly weighted mean close." },
  { id: "hma", label: "Hull moving average", placement: "overlay", range: "price", defaults: { period: 20 }, summary: "Low-lag smoothed mean close." },
  { id: "vwma", label: "Volume-weighted moving average", placement: "overlay", range: "price", defaults: { period: 20 }, summary: "Mean close weighted by volume." },
  { id: "bollinger", label: "Bollinger Bands", placement: "overlay", range: "price", defaults: { period: 20, multiplier: 2 }, summary: "Mean close with standard-deviation bands." },
  { id: "keltner", label: "Keltner Channels", placement: "overlay", range: "price", defaults: { period: 20, multiplier: 2 }, summary: "EMA with ATR-scaled bands." },
  { id: "donchian", label: "Donchian Channels", placement: "overlay", range: "price", defaults: { period: 20 }, summary: "Highest high and lowest low of the window." },
  { id: "ichimoku", label: "Ichimoku Cloud", placement: "overlay", range: "price", defaults: { tenkan: 9, kijun: 26, senkouB: 52 }, summary: "Displaced midpoints forming a support/resistance cloud." },
  { id: "supertrend", label: "Supertrend", placement: "overlay", range: "price", defaults: { period: 10, multiplier: 3 }, summary: "ATR band that flips with the trend." },
  { id: "vwap", label: "VWAP", placement: "overlay", range: "price", defaults: {}, summary: "Cumulative volume-weighted average price." },
  { id: "rsi", label: "Relative Strength Index", placement: "panel", range: "bounded", defaults: { period: 14 }, summary: "0-100 momentum oscillator; 70/30 are the usual overbought/oversold lines." },
  { id: "macd", label: "MACD", placement: "panel", range: "unbounded", defaults: { fast: 12, slow: 26, signal: 9 }, summary: "Difference of two EMAs with a signal line and histogram." },
  { id: "stochastic", label: "Stochastic oscillator", placement: "panel", range: "bounded", defaults: { period: 14, smoothK: 3, smoothD: 3 }, summary: "Close position within the recent range." },
  { id: "stochrsi", label: "Stochastic RSI", placement: "panel", range: "bounded", defaults: { period: 14, smoothK: 3, smoothD: 3 }, summary: "Stochastic applied to RSI." },
  { id: "williamsR", label: "Williams %R", placement: "panel", range: "bounded", defaults: { period: 14 }, summary: "Inverted position within the recent range." },
  { id: "cci", label: "Commodity Channel Index", placement: "panel", range: "unbounded", defaults: { period: 20 }, summary: "Deviation of typical price from its mean." },
  { id: "roc", label: "Rate of change", placement: "panel", range: "unbounded", defaults: { period: 12 }, summary: "Percentage change over the period." },
  { id: "momentum", label: "Momentum", placement: "panel", range: "unbounded", defaults: { period: 10 }, summary: "Absolute change over the period." },
  { id: "adx", label: "ADX / DMI", placement: "panel", range: "bounded", defaults: { period: 14 }, summary: "Trend strength with directional movement." },
  { id: "atr", label: "Average True Range", placement: "panel", range: "unbounded", defaults: { period: 14 }, summary: "Average bar range including gaps." },
  { id: "obv", label: "On-balance volume", placement: "panel", range: "unbounded", defaults: {}, summary: "Running volume total that follows direction." },
  { id: "ad", label: "Accumulation/Distribution", placement: "panel", range: "unbounded", defaults: {}, summary: "Volume weighted by close position in the bar." },
  { id: "mfi", label: "Money Flow Index", placement: "panel", range: "bounded", defaults: { period: 14 }, summary: "Volume-weighted RSI over typical price." },
];

export function indicatorMeta(id: IndicatorId): IndicatorMeta | undefined {
  return INDICATORS.find((entry) => entry.id === id);
}

/** The latest defined value of a series, or null when the series has none yet. */
export function latest(series: Series): number | null {
  for (let i = series.length - 1; i >= 0; i -= 1) {
    const value = series[i];
    if (isNum(value)) return value;
  }
  return null;
}

export type IndicatorSnapshot = {
  id: IndicatorId;
  label: string;
  placement: IndicatorMeta["placement"];
  range: IndicatorMeta["range"];
  /** Named values at the latest bar, e.g. `{ rsi: 61.2 }` or `{ macd, signal, histogram }`. */
  values: Record<string, number | null>;
  /** A plain-language reading, never a recommendation. */
  reading: string;
};

/**
 * Compute a compact snapshot of one indicator at the latest bar.
 *
 * This is what the screener evaluates conditions against, and what the chart shows in
 * its indicator legend. Readings are descriptive ("above the upper band"), never
 * prescriptive — the app does not issue buy or sell instructions.
 */
export function snapshot(
  id: IndicatorId,
  input: { highs: Series; lows: Series; closes: Series; volumes: Series },
  params: Record<string, number> = {},
): IndicatorSnapshot {
  const meta = indicatorMeta(id);
  const merged = { ...(meta?.defaults ?? {}), ...params };
  const { highs, lows, closes, volumes } = input;
  const base = { id, label: meta?.label ?? id, placement: meta?.placement ?? "panel", range: meta?.range ?? "unbounded" };
  const number = (key: string, fallback: number) => (Number.isFinite(merged[key]) ? merged[key] : fallback);

  switch (id) {
    case "sma": case "ema": case "wma": case "hma": {
      const period = number("period", 20);
      const series = id === "sma" ? sma(closes, period) : id === "ema" ? ema(closes, period) : id === "wma" ? wma(closes, period) : hma(closes, period);
      const value = latest(series);
      const close = latest(closes);
      return { ...base, values: { value }, reading: describeVsPrice("close", close, "the average", value) };
    }
    case "vwma": {
      const value = latest(vwma(closes, volumes, number("period", 20)));
      return { ...base, values: { value }, reading: describeVsPrice("close", latest(closes), "the volume-weighted average", value) };
    }
    case "bollinger": {
      const bands = bollingerBands(closes, number("period", 20), number("multiplier", 2));
      const last = bands[bands.length - 1] ?? { upper: null, middle: null, lower: null, bandwidth: null, percentB: null };
      const close = latest(closes);
      let reading = "Bands are not yet defined for this window.";
      if (isNum(close) && isNum(last.upper) && isNum(last.lower)) {
        reading = close > last.upper ? "Close is above the upper band." : close < last.lower ? "Close is below the lower band." : "Close is inside the bands.";
      }
      return { ...base, values: { upper: last.upper, middle: last.middle, lower: last.lower, bandwidth: last.bandwidth, percentB: last.percentB }, reading };
    }
    case "keltner": {
      const channels = keltnerChannels(highs, lows, closes, number("period", 20), number("multiplier", 2));
      const last = channels[channels.length - 1] ?? { upper: null, middle: null, lower: null };
      const close = latest(closes);
      const reading = isNum(close) && isNum(last.upper) && isNum(last.lower)
        ? close > last.upper ? "Close is above the upper channel." : close < last.lower ? "Close is below the lower channel." : "Close is inside the channel."
        : "Channel is not yet defined for this window.";
      return { ...base, values: { upper: last.upper, middle: last.middle, lower: last.lower }, reading };
    }
    case "donchian": {
      const channels = donchianChannels(highs, lows, number("period", 20));
      const last = channels[channels.length - 1] ?? { upper: null, middle: null, lower: null };
      const close = latest(closes);
      const reading = isNum(close) && isNum(last.upper) && isNum(last.lower)
        ? close >= last.upper ? "Close is at the top of the window." : close <= last.lower ? "Close is at the bottom of the window." : "Close is inside the window."
        : "Window is not yet defined.";
      return { ...base, values: { upper: last.upper, middle: last.middle, lower: last.lower }, reading };
    }
    case "ichimoku": {
      const cloud = ichimoku(highs, lows, closes, number("tenkan", 9), number("kijun", 26), number("senkouB", 52));
      const i = closes.length - 1;
      const a = cloud.senkouA[i] ?? null;
      const b = cloud.senkouB[i] ?? null;
      const close = latest(closes);
      const top = isNum(a) && isNum(b) ? Math.max(a, b) : null;
      const bottom = isNum(a) && isNum(b) ? Math.min(a, b) : null;
      const reading = isNum(close) && isNum(top) && isNum(bottom)
        ? close > top ? "Price is above the cloud." : close < bottom ? "Price is below the cloud." : "Price is inside the cloud."
        : "The cloud is not yet defined.";
      return { ...base, values: { tenkan: latest(cloud.tenkan), kijun: latest(cloud.kijun), senkouA: a, senkouB: b }, reading };
    }
    case "supertrend": {
      const result = supertrend(highs, lows, closes, number("period", 10), number("multiplier", 3));
      const dir = latest(result.direction);
      return { ...base, values: { line: latest(result.line), direction: dir }, reading: dir === 1 ? "Trend is up." : dir === -1 ? "Trend is down." : "Trend is not yet defined." };
    }
    case "vwap": {
      const value = latest(vwap(highs, lows, closes, volumes));
      return { ...base, values: { value }, reading: describeVsPrice("close", latest(closes), "VWAP", value) };
    }
    case "rsi": {
      const value = latest(rsi(closes, number("period", 14)));
      const reading = value === null ? "Not enough history." : value >= 70 ? "RSI is in the overbought zone." : value <= 30 ? "RSI is in the oversold zone." : "RSI is in the neutral zone.";
      return { ...base, values: { rsi: value }, reading };
    }
    case "macd": {
      const result = macd(closes, number("fast", 12), number("slow", 26), number("signal", 9));
      const line = latest(result.macd);
      const signal = latest(result.signal);
      const histogram = latest(result.histogram);
      const reading = histogram === null ? "Not enough history." : histogram > 0 ? "MACD is above its signal line." : histogram < 0 ? "MACD is below its signal line." : "MACD is at its signal line.";
      return { ...base, values: { macd: line, signal, histogram }, reading };
    }
    case "stochastic": case "stochrsi": {
      const result = id === "stochastic"
        ? stochastic(highs, lows, closes, number("period", 14), number("smoothK", 3), number("smoothD", 3))
        : stochasticRsi(closes, number("period", 14), number("smoothK", 3), number("smoothD", 3));
      const k = latest(result.k);
      const d = latest(result.d);
      const reading = k === null ? "Not enough history." : k >= 80 ? "Fast line is in the overbought zone." : k <= 20 ? "Fast line is in the oversold zone." : "Fast line is in the neutral zone.";
      return { ...base, values: { k, d }, reading };
    }
    case "williamsR": {
      const value = latest(williamsR(highs, lows, closes, number("period", 14)));
      const reading = value === null ? "Not enough history." : value >= -20 ? "In the overbought zone." : value <= -80 ? "In the oversold zone." : "In the neutral zone.";
      return { ...base, values: { value }, reading };
    }
    case "cci": {
      const value = latest(cci(highs, lows, closes, number("period", 20)));
      const reading = value === null ? "Not enough history." : value >= 100 ? "Above the +100 threshold." : value <= -100 ? "Below the -100 threshold." : "Within the +/-100 range.";
      return { ...base, values: { value }, reading };
    }
    case "roc": case "momentum": {
      const value = latest(id === "roc" ? roc(closes, number("period", 12)) : momentum(closes, number("period", 10)));
      const reading = value === null ? "Not enough history." : value > 0 ? "Positive over the period." : value < 0 ? "Negative over the period." : "Flat over the period.";
      return { ...base, values: { value }, reading };
    }
    case "adx": {
      const result = adx(highs, lows, closes, number("period", 14));
      const value = latest(result.adx);
      const plus = latest(result.plusDi);
      const minus = latest(result.minusDi);
      const reading = value === null ? "Not enough history." : value >= 25 ? `Trend is strong${isNum(plus) && isNum(minus) ? plus > minus ? ", and directional movement favours the upside." : ", and directional movement favours the downside." : "."}` : "Trend is weak or ranging.";
      return { ...base, values: { adx: value, plusDi: plus, minusDi: minus }, reading };
    }
    case "atr": {
      const value = latest(atr(highs, lows, closes, number("period", 14)));
      return { ...base, values: { value }, reading: value === null ? "Not enough history." : `Average bar range is ${value.toFixed(2)}.` };
    }
    case "obv": {
      const value = latest(obv(closes, volumes));
      return { ...base, values: { value }, reading: value === null ? "Not enough history." : "On-balance volume is available for this window." };
    }
    case "ad": {
      const value = latest(accumulationDistribution(highs, lows, closes, volumes));
      return { ...base, values: { value }, reading: value === null ? "Not enough history." : "Accumulation/distribution is available for this window." };
    }
    case "mfi": {
      const value = latest(mfi(highs, lows, closes, volumes, number("period", 14)));
      const reading = value === null ? "Not enough history." : value >= 80 ? "Money flow is in the overbought zone." : value <= 20 ? "Money flow is in the oversold zone." : "Money flow is in the neutral zone.";
      return { ...base, values: { value }, reading };
    }
    case "pivots": {
      return { ...base, values: { pivot: null, r1: null, s1: null }, reading: "Pivots are computed from a completed session, not a bar." };
    }
    default:
      return { ...base, values: {}, reading: "Unknown indicator." };
  }
}

function describeVsPrice(_what: string, price: number | null, subject: string, value: number | null): string {
  if (!isNum(price) || !isNum(value)) return "Not enough history.";
  if (price > value) return `Close is above ${subject}.`;
  if (price < value) return `Close is below ${subject}.`;
  return `Close is at ${subject}.`;
}
