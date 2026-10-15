/**
 * Chart geometry.
 *
 * Kept separate from the component so the layout can be tested without a renderer: the
 * mapping from a value to a pixel, the candle bodies, the overlay polylines and the pane
 * scaling are all plain functions of numbers.
 *
 * A value that is `null` breaks the polyline rather than being skipped, so an indicator
 * with a gap is drawn as two segments instead of one line that invents the missing span.
 */
import {
  adx, atr, bollingerBands, cci, donchianChannels, ema, hma, ichimoku, keltnerChannels, macd,
  mfi, momentum, obv, accumulationDistribution, roc, rsi, sma, stochastic, stochasticRsi,
  stdev, supertrend, vwap, vwma, williamsR, wma, isNum,
  type IndicatorId, type Series,
} from "./indicators";

export type ChartBar = { t: string; o: number | null; h: number | null; l: number | null; c: number | null; v: number | null };

export type PriceScale = { min: number; max: number; toY: (value: number) => number; height: number; top: number; bottom: number };

/** The visible high/low across the bars, padded by 4% so a candle never touches the edge. */
export function priceExtent(bars: ReadonlyArray<ChartBar>): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const bar of bars) {
    const high = isNum(bar.h) ? bar.h : bar.c;
    const low = isNum(bar.l) ? bar.l : bar.c;
    if (isNum(high) && high > max) max = high;
    if (isNum(low) && low < min) min = low;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 };
  if (min === max) return { min: min - 1, max: max + 1 };
  const padding = (max - min) * 0.04;
  return { min: min - padding, max: max + padding };
}

export function makeScale(bars: ReadonlyArray<ChartBar>, height: number, top: number, bottom: number): PriceScale {
  const { min, max } = priceExtent(bars);
  const usable = Math.max(1, height - top - bottom);
  const span = max - min || 1;
  return { min, max, height, top, bottom, toY: (value: number) => top + ((max - value) / span) * usable };
}

export type Candle = {
  cx: number;
  bodyX: number;
  bodyY: number;
  bodyWidth: number;
  bodyHeight: number;
  wickTop: number;
  wickBottom: number;
  closeY: number;
  up: boolean;
};

export type CandleGeometry = {
  candles: Array<Candle | null>;
  scale: PriceScale;
  gridLines: Array<{ value: number; y: number; label: string }>;
  slot: number;
};

/**
 * Lay out candlesticks.
 *
 * A bar with no open/high/low is drawn as a single close tick, not a body built from the
 * close alone — a fabricated body would misrepresent the bar's range.
 */
export function buildCandles(bars: ReadonlyArray<ChartBar>, width: number, height: number, top: number, bottom: number): CandleGeometry {
  const scale = makeScale(bars, height, top, bottom);
  const slot = bars.length ? width / bars.length : width;
  const bodyWidth = Math.max(1, Math.min(14, slot * 0.62));
  const candles = bars.map((bar, index) => {
    const close = bar.c;
    if (!isNum(close)) return null;
    const cx = slot * (index + 0.5);
    const closeY = scale.toY(close);
    const open = isNum(bar.o) ? bar.o : null;
    if (open === null) {
      // Close-only tick.
      return { cx, bodyX: cx - bodyWidth / 2, bodyY: closeY, bodyWidth, bodyHeight: 0, wickTop: closeY, wickBottom: closeY, closeY, up: true };
    }
    const openY = scale.toY(open);
    const high = isNum(bar.h) ? bar.h : Math.max(open, close);
    const low = isNum(bar.l) ? bar.l : Math.min(open, close);
    const bodyTop = Math.min(openY, closeY);
    const bodyBottom = Math.max(openY, closeY);
    return {
      cx,
      bodyX: cx - bodyWidth / 2,
      bodyY: bodyTop,
      bodyWidth,
      bodyHeight: Math.max(0.8, bodyBottom - bodyTop),
      wickTop: scale.toY(high),
      wickBottom: scale.toY(low),
      closeY,
      up: close >= open,
    };
  });
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((fraction) => {
    const value = scale.max - (scale.max - scale.min) * fraction;
    return { value, y: scale.toY(value), label: value.toLocaleString(undefined, { maximumFractionDigits: 2 }) };
  });
  return { candles, scale, gridLines, slot };
}

/** Turn a series into one or more SVG polyline strings, breaking at every null. */
export function toPolylines(series: Series, slot: number, toY: (value: number) => number): string[] {
  const lines: string[] = [];
  let current: string[] = [];
  series.forEach((value, index) => {
    if (isNum(value)) {
      current.push(`${(slot * (index + 0.5)).toFixed(1)},${toY(value).toFixed(1)}`);
    } else if (current.length) {
      lines.push(current.join(" "));
      current = [];
    }
  });
  if (current.length) lines.push(current.join(" "));
  // A single point cannot form a line; drop it rather than drawing a dot the caller
  // did not ask for.
  return lines.filter((line) => line.includes(" ") || line.split(",").length > 2);
}

/**
 * Build the polyline(s) for one indicator on the price pane.
 *
 * `bands[0]` is always the primary line; extra bands are drawn dashed by the component
 * (Bollinger upper/lower, Keltner, Donchian, Ichimoku).
 */
export function buildOverlay(
  id: IndicatorId,
  input: { highs: Series; lows: Series; closes: Series; volumes: Series },
  params: Record<string, number>,
  scale: PriceScale,
  /** Plot width in pixels. Passed explicitly: the scale maps values, not x positions. */
  width: number,
): { polylines: string[] } {
  const { highs, lows, closes, volumes } = input;
  const n = (key: string, fallback: number) => (Number.isFinite(params[key]) ? params[key] : fallback);
  const groups: Series[] = [];
  switch (id) {
    case "sma": groups.push(sma(closes, n("period", 20))); break;
    case "ema": groups.push(ema(closes, n("period", 20))); break;
    case "wma": groups.push(wma(closes, n("period", 20))); break;
    case "hma": groups.push(hma(closes, n("period", 20))); break;
    case "vwma": groups.push(vwma(closes, volumes, n("period", 20))); break;
    case "vwap": groups.push(vwap(highs, lows, closes, volumes)); break;
    case "bollinger": {
      const bands = bollingerBands(closes, n("period", 20), n("multiplier", 2));
      groups.push(bands.map((b) => b.middle), bands.map((b) => b.upper), bands.map((b) => b.lower));
      break;
    }
    case "keltner": {
      const channels = keltnerChannels(highs, lows, closes, n("period", 20), n("multiplier", 2));
      groups.push(channels.map((c) => c.middle), channels.map((c) => c.upper), channels.map((c) => c.lower));
      break;
    }
    case "donchian": {
      const channels = donchianChannels(highs, lows, n("period", 20));
      groups.push(channels.map((c) => c.middle), channels.map((c) => c.upper), channels.map((c) => c.lower));
      break;
    }
    case "ichimoku": {
      const cloud = ichimoku(highs, lows, closes, n("tenkan", 9), n("kijun", 26), n("senkouB", 52));
      groups.push(cloud.tenkan, cloud.kijun, cloud.senkouA, cloud.senkouB);
      break;
    }
    case "supertrend": groups.push(supertrend(highs, lows, closes, n("period", 10), n("multiplier", 3)).line); break;
    default: return { polylines: [] };
  }
  const perBar = closes.length ? width / closes.length : width;
  return { polylines: groups.flatMap((group) => toPolylines(group, perBar, scale.toY)) };
}

export type PaneBar = { x: number; y: number; width: number; height: number; positive: boolean };
export type PaneDot = { x: number; y: number };

export type PaneGeometry = {
  lines: string[][];
  bars: PaneBar[];
  dots: PaneDot[];
  gridLines: Array<{ value: number; y: number; label: string; dashed: boolean }>;
  readout: string;
};

/**
 * Build one indicator pane.
 *
 * Bounded indicators (RSI, Stochastic, %R, MFI, ADX) get a fixed 0-100 (or -100-0) axis
 * with the usual guide levels; unbounded ones (MACD, ATR, OBV, CCI) are scaled to their
 * own range. MACD draws its histogram as bars around zero.
 */
export function buildPane(
  id: IndicatorId,
  input: { highs: Series; lows: Series; closes: Series; volumes: Series },
  params: Record<string, number>,
  width: number,
  height: number,
  top: number,
  bottom: number,
): PaneGeometry {
  const { highs, lows, closes, volumes } = input;
  const n = (key: string, fallback: number) => (Number.isFinite(params[key]) ? params[key] : fallback);
  const count = closes.length;
  const perBar = count ? width / count : width;
  const usable = Math.max(1, height - top - bottom);

  let series: Series[] = [];
  let histogram: Series | null = null;
  let fixedRange: { min: number; max: number } | null = null;
  let guides: number[] = [];

  switch (id) {
    case "rsi": {
      series = [rsi(closes, n("period", 14))];
      fixedRange = { min: 0, max: 100 };
      guides = [30, 50, 70];
      break;
    }
    case "stochastic": {
      const result = stochastic(highs, lows, closes, n("period", 14), n("smoothK", 3), n("smoothD", 3));
      series = [result.k, result.d];
      fixedRange = { min: 0, max: 100 };
      guides = [20, 50, 80];
      break;
    }
    case "stochrsi": {
      const result = stochasticRsi(closes, n("period", 14), n("smoothK", 3), n("smoothD", 3));
      series = [result.k, result.d];
      fixedRange = { min: 0, max: 100 };
      guides = [20, 50, 80];
      break;
    }
    case "williamsR": {
      series = [williamsR(highs, lows, closes, n("period", 14))];
      fixedRange = { min: -100, max: 0 };
      guides = [-80, -50, -20];
      break;
    }
    case "mfi": {
      series = [mfi(highs, lows, closes, volumes, n("period", 14))];
      fixedRange = { min: 0, max: 100 };
      guides = [20, 50, 80];
      break;
    }
    case "adx": {
      const result = adx(highs, lows, closes, n("period", 14));
      series = [result.adx, result.plusDi, result.minusDi];
      fixedRange = { min: 0, max: 100 };
      guides = [25, 50, 75];
      break;
    }
    case "macd": {
      const result = macd(closes, n("fast", 12), n("slow", 26), n("signal", 9));
      series = [result.macd, result.signal];
      histogram = result.histogram;
      break;
    }
    case "cci": series = [cci(highs, lows, closes, n("period", 20))]; guides = [-100, 0, 100]; break;
    case "roc": series = [roc(closes, n("period", 12))]; break;
    case "momentum": series = [momentum(closes, n("period", 10))]; break;
    case "atr": series = [atr(highs, lows, closes, n("period", 14))]; break;
    case "obv": series = [obv(closes, volumes)]; break;
    case "ad": series = [accumulationDistribution(highs, lows, closes, volumes)]; break;
    case "stdev": series = [stdev(closes, n("period", 20))]; break;
    default: return { lines: [], bars: [], dots: [], gridLines: [], readout: "This indicator is drawn on the price pane." };
  }

  const defined: number[] = [];
  for (const group of series) for (const value of group) if (isNum(value)) defined.push(value);
  if (histogram) for (const value of histogram) if (isNum(value)) defined.push(value);
  if (!defined.length) return { lines: [], bars: [], dots: [], gridLines: [], readout: "Not enough bars to compute this indicator yet." };

  const min = fixedRange ? fixedRange.min : Math.min(...defined);
  const max = fixedRange ? fixedRange.max : Math.max(...defined);
  const span = max - min || 1;
  const toY = (value: number) => top + ((max - value) / span) * usable;

  const lines = series.map((group) => toPolylines(group, perBar, toY));
  const bars: PaneBar[] = [];
  if (histogram) {
    const zeroY = toY(0);
    histogram.forEach((value, index) => {
      if (!isNum(value)) return;
      const y = toY(value);
      const barWidth = Math.max(1, Math.min(8, perBar * 0.55));
      bars.push({ x: perBar * (index + 0.5) - barWidth / 2, y: Math.min(y, zeroY), width: barWidth, height: Math.max(1, Math.abs(y - zeroY)), positive: value >= 0 });
    });
  }
  const dots: PaneDot[] = [];
  const gridLines = guides.map((value) => ({ value, y: toY(value), label: value.toLocaleString(undefined, { maximumFractionDigits: 0 }), dashed: true }));

  // The readout is the latest defined value of the primary line, described honestly.
  const primary = series[0];
  let latestValue: number | null = null;
  for (let i = primary.length - 1; i >= 0; i -= 1) {
    if (isNum(primary[i])) { latestValue = primary[i]; break; }
  }
  const readout = latestValue === null ? "No defined value yet." : `Latest ${latestValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  return { lines, bars, dots, gridLines, readout };
}
