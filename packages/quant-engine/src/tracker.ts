/**
 * Automated performance tracker with a dynamic trailing stop-loss.
 *
 * Every strategy output is followed bar by bar and exited by a step-up ladder that protects the
 * gain rather than only capping the loss:
 *
 *   Initial risk floor   — exit if price falls 10% below entry (the absolute maximum stop).
 *   At +10% gain         — the stop moves to break-even (entry cost).
 *   At +15% gain         — the stop moves to +5%.
 *   At +20% gain         — the stop moves to +10%, then trails the peak at a 10% gap up to +50%.
 *   Above +50% gain      — the trailing gap tightens to 5% to lock in a parabolic move.
 *
 * Two invariants hold throughout:
 *   1. The stop only ever **ratchets upward**. A trailing stop that could fall back is not a stop.
 *   2. The peak is taken from the bar's high, and the stop is tested against the bar's low, so an
 *      intrabar stop-out is detected rather than missed.
 */
import { computeMetrics } from "./metrics";
import { evaluateAll, evaluateAny, prepareSeries, type StrategySpec } from "./strategy";
import type { BacktestConfig } from "./backtest";
import { DEFAULT_BACKTEST_CONFIG } from "./backtest";
import type { BacktestMetrics, Candle, EquityPoint, Trade, TradeSide } from "./core-types";

export type TrackerConfig = {
  /** Maximum stop below entry, as a fraction. */
  initialStopPct: number;
  /** Gain at which the stop moves to break-even. */
  breakEvenAtPct: number;
  /** Gain at which the stop steps up to `stepUp1StopPct`. */
  stepUpAtPct: number;
  stepUp1StopPct: number;
  /** Gain at which the stop steps up to `stepUp2StopPct`. */
  stepUp2AtPct: number;
  stepUp2StopPct: number;
  /** Gain above which the trailing gap tightens. */
  tightenAbovePct: number;
  /** Trailing gap below the tighten threshold. */
  wideGapPct: number;
  /** Trailing gap above the tighten threshold. */
  tightGapPct: number;
};

/** The formula exactly as specified: −10% floor, break-even at +10%, +5% at +15%, +10% at +20%,
 *  10% trail to +50%, then a 5% trail. */
export const DEFAULT_TRACKER_CONFIG: TrackerConfig = {
  initialStopPct: 0.1,
  breakEvenAtPct: 0.1,
  stepUpAtPct: 0.15,
  stepUp1StopPct: 0.05,
  stepUp2AtPct: 0.2,
  stepUp2StopPct: 0.1,
  tightenAbovePct: 0.5,
  wideGapPct: 0.1,
  tightGapPct: 0.05,
};

export type StopRule = "initial-risk-floor" | "break-even" | "step-up-5" | "step-up-10" | "trail-10" | "trail-5";

export type LadderResult = {
  stopPrice: number;
  rule: StopRule;
  /** The trailing gap in force, when the stop is trailing rather than on a step. */
  gapPct: number | null;
  /** The peak gain used to place the stop. */
  peakGainPct: number;
};

/**
 * Threshold tolerance.
 *
 * A gain computed as `peak / entry - 1` is not exactly representable: at entry 100 and peak 115 the
 * result is 0.14999999999999991, not 0.15. Comparing exactly would silently skip the +15% step, so
 * a threshold counts as reached within this tolerance.
 */
const GAIN_EPSILON = 1e-9;

/** True when `gain` has reached `threshold`, allowing for binary floating-point error. */
function reached(gain: number, threshold: number): boolean {
  return gain >= threshold - GAIN_EPSILON;
}

/** The stop the ladder dictates for a given entry and peak, before ratcheting. */
export function ladderStop(entryPrice: number, peakPrice: number, config: TrackerConfig = DEFAULT_TRACKER_CONFIG): LadderResult {
  const peakGainPct = entryPrice > 0 ? peakPrice / entryPrice - 1 : 0;
  if (!reached(peakGainPct, config.breakEvenAtPct)) {
    return { stopPrice: entryPrice * (1 - config.initialStopPct), rule: "initial-risk-floor", gapPct: null, peakGainPct };
  }
  if (!reached(peakGainPct, config.stepUpAtPct)) {
    return { stopPrice: entryPrice, rule: "break-even", gapPct: null, peakGainPct };
  }
  if (!reached(peakGainPct, config.stepUp2AtPct)) {
    return { stopPrice: entryPrice * (1 + config.stepUp1StopPct), rule: "step-up-5", gapPct: null, peakGainPct };
  }
  const ladderFloor = entryPrice * (1 + config.stepUp2StopPct);
  const gapPct = peakGainPct > config.tightenAbovePct + GAIN_EPSILON ? config.tightGapPct : config.wideGapPct;
  const trailed = peakPrice * (1 - gapPct);
  if (trailed >= ladderFloor) {
    return { stopPrice: trailed, rule: gapPct === config.tightGapPct ? "trail-5" : "trail-10", gapPct, peakGainPct };
  }
  return { stopPrice: ladderFloor, rule: "step-up-10", gapPct: null, peakGainPct };
}

/** The ladder stop, ratcheted so it can never move down. */
export function nextStop(entryPrice: number, peakPrice: number, previousStop: number, config: TrackerConfig = DEFAULT_TRACKER_CONFIG): LadderResult {
  const ladder = ladderStop(entryPrice, peakPrice, config);
  if (previousStop > ladder.stopPrice) return { ...ladder, stopPrice: previousStop };
  return ladder;
}

export function initialStopPrice(entryPrice: number, config: TrackerConfig = DEFAULT_TRACKER_CONFIG): number {
  return entryPrice * (1 - config.initialStopPct);
}

/** Exit reasons the tracker can produce, mapped onto the engine's trade reasons for metrics. */
export type TrackerExitReason = "signal" | "initial-risk-floor" | "break-even" | "trailing-stop" | "take-profit" | "end-of-data";

export type TrackedPosition = Trade & {
  symbol: string;
  strategyId: string;
  /** Highest price seen while the position was open. */
  peakPrice: number;
  peakGainPct: number;
  finalStopPrice: number;
  stopRule: StopRule;
  trackerExitReason: TrackerExitReason;
  /** Maximum adverse excursion, as a fraction of entry (negative). */
  maePct: number;
  /** Maximum favourable excursion, as a fraction of entry (positive). */
  mfePct: number;
};

export type TrackerMetrics = BacktestMetrics & {
  averageBarsHeld: number;
  medianReturnPct: number;
  bestReturnPct: number;
  worstReturnPct: number;
  byExitReason: Record<TrackerExitReason, number>;
};

export type TrackerRun = {
  positions: TrackedPosition[];
  equity: EquityPoint[];
  metrics: TrackerMetrics;
  trackerConfig: TrackerConfig;
  barsProcessed: number;
};

function mapExitReason(reason: TrackerExitReason): Trade["exitReason"] {
  if (reason === "signal") return "signal";
  if (reason === "take-profit") return "take-profit";
  if (reason === "end-of-data") return "end-of-data";
  return "stop-loss"; // the initial floor, break-even and trailing stops are all protective exits
}

/** Summarise tracked positions into a dashboard. */
export function summarizeTracker(positions: TrackedPosition[], equity: EquityPoint[], candles: Candle[], startingCapital: number, barsInPosition: number): TrackerMetrics {
  // Reuse the engine's metric maths by presenting the positions as trades.
  const asTrades: Trade[] = positions.map((position) => ({ ...position, exitReason: mapExitReason(position.trackerExitReason) }));
  const base = computeMetrics({ trades: asTrades, equity, candles, startingCapital, barsInPosition });

  const byExitReason: Record<TrackerExitReason, number> = { signal: 0, "initial-risk-floor": 0, "break-even": 0, "trailing-stop": 0, "take-profit": 0, "end-of-data": 0 };
  for (const position of positions) byExitReason[position.trackerExitReason] += 1;

  const returns = positions.map((position) => position.returnPct).sort((a, b) => a - b);
  const medianReturnPct = returns.length === 0 ? 0 : returns.length % 2 === 1 ? returns[(returns.length - 1) / 2] : (returns[returns.length / 2 - 1] + returns[returns.length / 2]) / 2;

  return {
    ...base,
    averageBarsHeld: positions.length > 0 ? positions.reduce((sum, position) => sum + position.bars, 0) / positions.length : 0,
    medianReturnPct,
    bestReturnPct: returns.length > 0 ? returns[returns.length - 1] : 0,
    worstReturnPct: returns.length > 0 ? returns[0] : 0,
    byExitReason,
  };
}

/**
 * Track a strategy's output over time under the dynamic trailing stop.
 * Entry timing matches the backtest engine exactly: signal on a close, fill on the next open.
 */
export function trackStrategy(
  candles: Candle[],
  spec: StrategySpec,
  trackerConfig: TrackerConfig = DEFAULT_TRACKER_CONFIG,
  backtestConfig: BacktestConfig = DEFAULT_BACKTEST_CONFIG,
  strategyId = spec.name,
  symbol = "SERIES",
): TrackerRun {
  const bars = backtestConfig.maxBars && backtestConfig.maxBars > 0 ? Math.min(candles.length, Math.floor(backtestConfig.maxBars)) : candles.length;
  const series = prepareSeries(candles, spec);
  const commissionRate = backtestConfig.commissionBps / 10_000;
  const slippageRate = backtestConfig.slippageBps / 10_000;

  const positions: TrackedPosition[] = [];
  const equity: EquityPoint[] = [];
  let realizedEquity = backtestConfig.startingCapital;
  let barsInPosition = 0;
  let pendingEntry = false;
  let pendingExit = false;

  type Open = {
    side: TradeSide;
    entryIndex: number;
    entryPrice: number;
    quantity: number;
    entryCommission: number;
    peakPrice: number;
    stopPrice: number;
    stopRule: StopRule;
    mae: number;
    mfe: number;
  };
  let open: Open | null = null;

  const close = (index: number, rawPrice: number, reason: TrackerExitReason) => {
    if (!open) return;
    const exitPrice = open.side === "long" ? rawPrice * (1 - slippageRate) : rawPrice * (1 + slippageRate);
    const grossPnl = open.side === "long" ? (exitPrice - open.entryPrice) * open.quantity : (open.entryPrice - exitPrice) * open.quantity;
    const exitCommission = exitPrice * open.quantity * commissionRate;
    const costs = open.entryCommission + exitCommission;
    const netPnl = grossPnl - costs;
    const committed = open.entryPrice * open.quantity;
    realizedEquity += netPnl;
    positions.push({
      entryIndex: open.entryIndex,
      exitIndex: index,
      side: open.side,
      entryPrice: open.entryPrice,
      exitPrice,
      quantity: open.quantity,
      exitReason: mapExitReason(reason),
      grossPnl,
      costs,
      netPnl,
      returnPct: committed > 0 ? (netPnl / committed) * 100 : 0,
      bars: index - open.entryIndex,
      symbol,
      strategyId,
      peakPrice: open.peakPrice,
      peakGainPct: open.entryPrice > 0 ? (open.peakPrice / open.entryPrice - 1) * 100 : 0,
      finalStopPrice: open.stopPrice,
      stopRule: open.stopRule,
      trackerExitReason: reason,
      maePct: open.mae * 100,
      mfePct: open.mfe * 100,
    });
    open = null;
  };

  for (let i = 0; i < bars; i += 1) {
    const candle = candles[i];

    if (pendingExit && open) close(i, candle.open, "signal");
    pendingExit = false;

    if (pendingEntry && !open) {
      const side: TradeSide = spec.side === "short" ? "short" : "long";
      const entryPrice = side === "long" ? candle.open * (1 + slippageRate) : candle.open * (1 - slippageRate);
      const notional = realizedEquity * Math.max(0, Math.min(1, spec.riskPerTradePct));
      const quantity = entryPrice > 0 ? notional / entryPrice : 0;
      if (quantity > 0) {
        open = {
          side,
          entryIndex: i,
          entryPrice,
          quantity,
          entryCommission: entryPrice * quantity * commissionRate,
          peakPrice: entryPrice,
          stopPrice: initialStopPrice(entryPrice, trackerConfig),
          stopRule: "initial-risk-floor",
          mae: 0,
          mfe: 0,
        };
      }
    }
    pendingEntry = false;

    if (open) {
      barsInPosition += 1;
      // Track the excursions from this bar, then ratchet the stop, then test it.
      const adverse = open.side === "long" ? candle.low / open.entryPrice - 1 : open.entryPrice / candle.high - 1;
      const favourable = open.side === "long" ? candle.high / open.entryPrice - 1 : open.entryPrice / candle.low - 1;
      open.mae = Math.min(open.mae, adverse);
      open.mfe = Math.max(open.mfe, favourable);
      const peakCandidate = open.side === "long" ? candle.high : candle.low;
      const peakIsHigher = open.side === "long" ? peakCandidate > open.peakPrice : peakCandidate < open.peakPrice;
      if (peakIsHigher) open.peakPrice = peakCandidate;
      const ratcheted = nextStop(open.entryPrice, open.peakPrice, open.stopPrice, trackerConfig);
      open.stopPrice = ratcheted.stopPrice;
      open.stopRule = ratcheted.rule;

      const breached = open.side === "long" ? candle.low <= open.stopPrice : candle.high >= open.stopPrice;
      if (breached) {
        const reason: TrackerExitReason = open.stopRule === "initial-risk-floor" ? "initial-risk-floor" : open.stopRule === "break-even" ? "break-even" : "trailing-stop";
        close(i, open.stopPrice, reason);
      }
    }

    if (open) {
      const holdLimit = spec.maxHoldBars === null ? null : Math.max(1, Math.floor(spec.maxHoldBars));
      const heldTooLong = holdLimit !== null && i - open.entryIndex >= holdLimit - 1;
      if (heldTooLong || evaluateAny(spec.exit, series, i)) pendingExit = true;
    } else if (evaluateAll(spec.entry, series, i)) {
      pendingEntry = true;
    }

    const unrealized = open ? (open.side === "long" ? (candle.close - open.entryPrice) * open.quantity : (open.entryPrice - candle.close) * open.quantity) : 0;
    equity.push({ time: candle.time, index: i, equity: realizedEquity + unrealized });
  }

  if (open && bars > 0) close(bars - 1, candles[bars - 1].close, "end-of-data");

  const metrics = summarizeTracker(positions, equity, candles.slice(0, bars), backtestConfig.startingCapital, barsInPosition);
  return { positions, equity, metrics, trackerConfig, barsProcessed: bars };
}
