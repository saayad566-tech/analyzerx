/**
 * Price-pattern detection: Volatility Contraction and the high-tight flag.
 *
 * Both are defined by explicit, checkable geometry rather than a description. A pattern that cannot
 * be located in the bars returns `detected: false` with the measured values, so a near-miss is
 * visible instead of being rounded into a signal.
 */
import type { Candle } from "./core-types";

export type Contraction = {
  fromIndex: number;
  toIndex: number;
  high: number;
  low: number;
  /** Peak-to-trough fall of this contraction, as a percentage. */
  depthPct: number;
};

export type VcpResult = {
  detected: boolean;
  contractions: Contraction[];
  /** Depth of the tightest (final) contraction, or null when none was found. */
  finalDepthPct: number | null;
  /** Whether each successive contraction was shallower than the one before. */
  contracting: boolean;
  volumeDryingUp: boolean;
  trendUp: boolean;
};

/** Indices of fractal swing highs: higher than `strength` bars on both sides. */
export function fractalSwingHighs(candles: Candle[], strength = 2): number[] {
  const out: number[] = [];
  for (let i = strength; i < candles.length - strength; i += 1) {
    let isHigh = true;
    for (let k = 1; k <= strength; k += 1) {
      if (candles[i].high <= candles[i - k].high || candles[i].high <= candles[i + k].high) {
        isHigh = false;
        break;
      }
    }
    if (isHigh) out.push(i);
  }
  return out;
}

/** Indices of fractal swing lows: lower than `strength` bars on both sides. */
export function fractalSwingLows(candles: Candle[], strength = 2): number[] {
  const out: number[] = [];
  for (let i = strength; i < candles.length - strength; i += 1) {
    let isLow = true;
    for (let k = 1; k <= strength; k += 1) {
      if (candles[i].low >= candles[i - k].low || candles[i].low >= candles[i + k].low) {
        isLow = false;
        break;
      }
    }
    if (isLow) out.push(i);
  }
  return out;
}

function averageVolume(candles: Candle[], from: number, to: number): number {
  const slice = candles.slice(Math.max(0, from), Math.max(from + 1, to));
  if (slice.length === 0) return 0;
  return slice.reduce((sum, candle) => sum + candle.volume, 0) / slice.length;
}

/**
 * Minervini's Volatility Contraction Pattern: a series of pullbacks, each shallower than the last,
 * with volume drying up into the final contraction, inside an uptrend.
 */
export function detectVolatilityContraction(
  candles: Candle[],
  options: { lookback?: number; swingStrength?: number; maxFinalDepthPct?: number; minContractions?: number } = {},
): VcpResult | null {
  const lookback = Math.max(20, Math.floor(options.lookback ?? 120));
  const strength = Math.max(1, Math.floor(options.swingStrength ?? 2));
  const maxFinalDepth = options.maxFinalDepthPct ?? 12;
  const minContractions = Math.max(2, Math.floor(options.minContractions ?? 2));
  if (candles.length < lookback) return null;

  const window = candles.slice(candles.length - lookback);
  const highs = fractalSwingHighs(window, strength);
  const lows = fractalSwingLows(window, strength);

  const contractions: Contraction[] = [];
  for (const highIndex of highs) {
    const nextLow = lows.find((index) => index > highIndex);
    if (nextLow === undefined) continue;
    const high = window[highIndex].high;
    const low = window[nextLow].low;
    if (!(high > 0) || low >= high) continue;
    contractions.push({ fromIndex: highIndex, toIndex: nextLow, high, low, depthPct: ((high - low) / high) * 100 });
  }

  const finalDepthPct = contractions.length > 0 ? contractions[contractions.length - 1].depthPct : null;
  const contracting = contractions.length >= minContractions && contractions.every((c, i) => i === 0 || c.depthPct <= contractions[i - 1].depthPct);

  // Volume drying up: the final third trades lighter than the first third.
  const third = Math.floor(lookback / 3);
  const earlyVolume = averageVolume(window, 0, third);
  const lateVolume = averageVolume(window, lookback - third, lookback);
  const volumeDryingUp = earlyVolume > 0 && lateVolume < earlyVolume;

  // Uptrend: the window's last close is above its first, and above the 50-bar mean.
  const closes = window.map((candle) => candle.close);
  const mean = closes.reduce((sum, value) => sum + value, 0) / closes.length;
  const trendUp = closes[closes.length - 1] > closes[0] && closes[closes.length - 1] > mean;

  const detected = contracting && finalDepthPct !== null && finalDepthPct <= maxFinalDepth && trendUp && volumeDryingUp;
  return { detected, contractions, finalDepthPct, contracting, volumeDryingUp, trendUp };
}

export type HighTightFlagResult = {
  detected: boolean;
  /** Largest advance found over the allowed window, as a percentage. */
  advancePct: number;
  advanceBars: number;
  /** Retracement from the peak to the lowest low afterwards, as a percentage. */
  pullbackPct: number;
  volumeDryingUp: boolean;
};

/**
 * O'Neil's high-tight flag: a very large advance in a short span, then a shallow, low-volume
 * consolidation. The advance window is searched rather than assumed.
 */
export function detectHighTightFlag(
  candles: Candle[],
  options: { minAdvancePct?: number; maxAdvanceBars?: number; maxPullbackPct?: number } = {},
): HighTightFlagResult | null {
  const minAdvance = options.minAdvancePct ?? 100;
  const maxAdvanceBars = Math.max(2, Math.floor(options.maxAdvanceBars ?? 40));
  const maxPullback = options.maxPullbackPct ?? 25;
  if (candles.length < maxAdvanceBars + 5) return null;

  // Search every advance window of at most maxAdvanceBars that leaves room for a consolidation.
  let best = { advancePct: 0, advanceBars: 0, peakIndex: 0 };
  for (let start = 0; start < candles.length - 5; start += 1) {
    for (let bars = 2; bars <= maxAdvanceBars && start + bars < candles.length - 1; bars += 1) {
      const from = candles[start].low;
      const to = candles[start + bars].high;
      if (!(from > 0)) continue;
      const advancePct = ((to - from) / from) * 100;
      if (advancePct > best.advancePct) best = { advancePct, advanceBars: bars, peakIndex: start + bars };
    }
  }
  if (best.advancePct < minAdvance) {
    return { detected: false, advancePct: best.advancePct, advanceBars: best.advanceBars, pullbackPct: 0, volumeDryingUp: false };
  }

  const afterPeak = candles.slice(best.peakIndex);
  if (afterPeak.length < 2) return { detected: false, advancePct: best.advancePct, advanceBars: best.advanceBars, pullbackPct: 0, volumeDryingUp: false };
  const peakHigh = candles[best.peakIndex].high;
  const lowestAfter = Math.min(...afterPeak.map((candle) => candle.low));
  const pullbackPct = peakHigh > 0 ? ((peakHigh - lowestAfter) / peakHigh) * 100 : 0;

  const beforeVolume = averageVolume(candles, Math.max(0, best.peakIndex - best.advanceBars), best.peakIndex);
  const afterVolume = averageVolume(candles, best.peakIndex, candles.length);
  const volumeDryingUp = beforeVolume > 0 && afterVolume < beforeVolume;

  return {
    detected: pullbackPct <= maxPullback && volumeDryingUp,
    advancePct: best.advancePct,
    advanceBars: best.advanceBars,
    pullbackPct,
    volumeDryingUp,
  };
}
