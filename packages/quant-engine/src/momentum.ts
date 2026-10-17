/**
 * Dual Momentum scanner — Top Gainers and Top Crashers.
 *
 * The product asks for a country-scoped scanner that lists the stocks which moved at least 10% up or
 * down inside a 1-to-7 day window, plus the context that explains the move (a volume spike).
 *
 * This module is the pure engine: given each instrument's candles it returns the qualifying movers.
 * It is deterministic and has no network — the caller supplies the bars, already scoped to one market,
 * which is what keeps the country filter honest (the engine never mixes markets).
 *
 * The 10% threshold and the 1..7 day windows are the product's defaults, not hard-coded truths: they
 * are options, so a caller can scan for 5% or 20% without a code change.
 */
import type { Candle } from "./core-types";

export type MomentumDirection = "gainer" | "crasher";

export type MomentumMover = {
  symbol: string;
  market: string;
  direction: MomentumDirection;
  /** The window, in bars, that produced the qualifying move. */
  windowDays: number;
  /** Signed percent change over that window. */
  changePct: number;
  lastClose: number;
  /** Epoch ms of the latest bar. */
  lastTime: number;
  volume: number;
  /**
   * Latest volume divided by the mean of the prior 20 bars (the current bar excluded), or null when
   * there is too little history. This is the "volume spike" figure that explains a move.
   */
  volumeMultiple: number | null;
  /** Bars available for this instrument. */
  bars: number;
};

export type MomentumInput = { symbol: string; market: string; candles: Candle[] };

export type MomentumScanOptions = {
  /** Minimum absolute move, in percent. Default 10, per the product spec. */
  thresholdPct?: number;
  /** Windows (in bars) to test. Default [1,2,3,4,5,6,7]. */
  windows?: number[];
  /** Bars required before an instrument is scanned at all. Default 2. */
  minBars?: number;
};

export type MomentumScanResult = {
  gainers: MomentumMover[];
  crashers: MomentumMover[];
  /** Instruments actually evaluated. */
  scanned: number;
  /** Instruments skipped, with the reason — never silently dropped. */
  skipped: { symbol: string; reason: string }[];
};

const DEFAULT_THRESHOLD_PCT = 10;
const DEFAULT_WINDOWS = [1, 2, 3, 4, 5, 6, 7];
const VOLUME_BASELINE_BARS = 20;

/**
 * The mean volume the latest bar is compared against.
 * The current bar is excluded, so a genuine volume spike is not averaged away by the very bar that
 * constitutes it.
 */
function meanVolume(candles: Candle[]): number | null {
  const history = candles.slice(0, -1);
  if (history.length === 0) return null;
  const window = history.slice(Math.max(0, history.length - VOLUME_BASELINE_BARS));
  const total = window.reduce((sum, c) => sum + c.volume, 0);
  return window.length > 0 ? total / window.length : null;
}

/**
 * Scan instruments for dual-momentum movers.
 *
 * An instrument qualifies as a gainer when any tested window has a change of at least
 * `+thresholdPct`, and as a crasher when any window is at most `-thresholdPct`. When several windows
 * qualify, the one with the largest absolute move is reported, because that is the move the user is
 * being asked to explain.
 */
export function scanMomentum(
  inputs: MomentumInput[],
  options: MomentumScanOptions = {},
): MomentumScanResult {
  const threshold = Math.abs(options.thresholdPct ?? DEFAULT_THRESHOLD_PCT);
  const windows = (options.windows ?? DEFAULT_WINDOWS).filter((w) => Number.isInteger(w) && w >= 1);
  const minBars = options.minBars ?? 2;

  const gainers: MomentumMover[] = [];
  const crashers: MomentumMover[] = [];
  const skipped: { symbol: string; reason: string }[] = [];
  let scanned = 0;

  for (const input of inputs) {
    const candles = input.candles;
    if (!candles || candles.length < minBars) {
      skipped.push({ symbol: input.symbol, reason: `only ${candles?.length ?? 0} bar(s); need ${minBars}` });
      continue;
    }
    const last = candles[candles.length - 1];
    if (!(last.close > 0)) {
      skipped.push({ symbol: input.symbol, reason: "last close is not a positive price" });
      continue;
    }
    scanned += 1;

    let best: { windowDays: number; changePct: number } | null = null;
    for (const w of windows) {
      if (candles.length <= w) continue;
      const from = candles[candles.length - 1 - w].close;
      if (!(from > 0)) continue;
      const changePct = ((last.close - from) / from) * 100;
      if (best === null || Math.abs(changePct) > Math.abs(best.changePct)) {
        best = { windowDays: w, changePct };
      }
    }
    if (best === null) {
      skipped.push({ symbol: input.symbol, reason: "no window had a usable prior close" });
      continue;
    }
    if (Math.abs(best.changePct) < threshold) continue;

    const base = meanVolume(candles);
    const mover: MomentumMover = {
      symbol: input.symbol,
      market: input.market,
      direction: best.changePct >= 0 ? "gainer" : "crasher",
      windowDays: best.windowDays,
      changePct: Math.round(best.changePct * 100) / 100,
      lastClose: last.close,
      lastTime: last.time,
      volume: last.volume,
      volumeMultiple: base && base > 0 ? Math.round((last.volume / base) * 100) / 100 : null,
      bars: candles.length,
    };
    if (mover.direction === "gainer") gainers.push(mover);
    else crashers.push(mover);
  }

  gainers.sort((a, b) => b.changePct - a.changePct);
  crashers.sort((a, b) => a.changePct - b.changePct);
  return { gainers, crashers, scanned, skipped };
}

/** A one-line, plain-English reason for the move, using only what the engine actually measured. */
export function describeMover(mover: MomentumMover): string {
  const dir = mover.direction === "gainer" ? "up" : "down";
  const move = `${Math.abs(mover.changePct).toFixed(2)}% ${dir} in ${mover.windowDays} day${mover.windowDays === 1 ? "" : "s"}`;
  if (mover.volumeMultiple === null) {
    return `${mover.symbol} ${move}. Volume baseline unavailable (too little history).`;
  }
  const vol =
    mover.volumeMultiple >= 2
      ? `volume is ${mover.volumeMultiple.toFixed(1)}x its 20-day average`
      : `volume is near its 20-day average (${mover.volumeMultiple.toFixed(1)}x)`;
  return `${mover.symbol} ${move}; ${vol}.`;
}
