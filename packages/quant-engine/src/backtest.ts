/**
 * Event-driven backtest engine.
 *
 * The loop is honest about time:
 *   - A signal is evaluated on a bar's **close**, using only bars up to and including it.
 *   - The resulting order fills on the **next** bar's open. A strategy therefore can never trade on
 *     information it would not have had.
 *   - Protective stops and targets are checked intrabar against the bar's high/low.
 *
 * Costs are charged, not ignored: commission on both legs, and slippage applied adversely on every
 * fill. When a stop and a target would both be touched inside the same bar, the **stop is assumed
 * to fill first** — the pessimistic assumption, so results are not flattered.
 *
 * The loop is a generator so a UI can drive it bar by bar and show genuine progress, rather than
 * animating a fake bar over a synchronous blocking call.
 */
import { computeMetrics } from "./metrics";
import { evaluateAll, evaluateAny, prepareSeries, type StrategySpec } from "./strategy";
import type { BacktestMetrics, Candle, EquityPoint, Trade, TradeSide } from "./core-types";

export type BacktestConfig = {
  startingCapital: number;
  /** Commission per side, in basis points of notional. */
  commissionBps: number;
  /** Adverse slippage per side, in basis points. */
  slippageBps: number;
  /** Cap on bars processed; protects the UI from an accidental unbounded run. */
  maxBars?: number;
};

export const DEFAULT_BACKTEST_CONFIG: BacktestConfig = { startingCapital: 100_000, commissionBps: 5, slippageBps: 2, maxBars: 200_000 };

export type BacktestLogEvent = "enter" | "exit" | "stop" | "target" | "end-of-data";
export type BacktestLogEntry = {
  index: number;
  time: number;
  event: BacktestLogEvent;
  detail: string;
  price: number;
  quantity: number;
  equity: number;
};

export type BacktestResult = {
  trades: Trade[];
  equity: EquityPoint[];
  metrics: BacktestMetrics;
  log: BacktestLogEntry[];
  spec: StrategySpec;
  config: BacktestConfig;
  /** Bars actually processed. */
  barsProcessed: number;
};

/** Emitted once per processed bar so a caller can render real progress. */
export type BacktestProgress = {
  barsProcessed: number;
  totalBars: number;
  fraction: number;
  equity: number;
  trades: number;
  openPosition: boolean;
};

/** Which direction an entry signal implies. */
export function impliedSide(spec: StrategySpec): TradeSide {
  if (spec.side === "short") return "short";
  if (spec.side === "long") return "long";
  const bearish = spec.entry.some((rule) => rule.kind === "rsiAbove" || rule.kind === "emaCrossBelow" || rule.kind === "breakdownLow" || rule.kind === "trendDown" || rule.kind === "priceBelowEma");
  return bearish ? "short" : "long";
}

function applySlippage(price: number, side: TradeSide, slippageBps: number, entering: boolean): number {
  const rate = slippageBps / 10_000;
  const adverseUp = (side === "long") === entering; // buying is adverse-up; selling is adverse-down
  return adverseUp ? price * (1 + rate) : price * (1 - rate);
}

/**
 * Run the backtest one bar at a time, yielding a {@link BacktestProgress} after each bar and
 * returning the full result when the series is exhausted.
 */
export function* backtestSteps(candles: Candle[], spec: StrategySpec, config: BacktestConfig = DEFAULT_BACKTEST_CONFIG): Generator<BacktestProgress, BacktestResult, void> {
  const bars = config.maxBars && config.maxBars > 0 ? Math.min(candles.length, Math.floor(config.maxBars)) : candles.length;
  const series = prepareSeries(candles, spec);
  const commissionRate = config.commissionBps / 10_000;

  const trades: Trade[] = [];
  const equity: EquityPoint[] = [];
  const log: BacktestLogEntry[] = [];

  let realizedEquity = config.startingCapital;
  let position: { side: TradeSide; entryIndex: number; entryPrice: number; quantity: number; entryCommission: number; stopLevel: number | null; targetLevel: number | null } | null = null;
  let pendingEntry = false;
  let pendingExit = false;
  let barsInPosition = 0;

  const closePosition = (index: number, rawPrice: number, reason: Trade["exitReason"]) => {
    if (!position) return;
    const side = position.side;
    const exitPrice = applySlippage(rawPrice, side, config.slippageBps, false);
    const grossPnl = side === "long" ? (exitPrice - position.entryPrice) * position.quantity : (position.entryPrice - exitPrice) * position.quantity;
    const exitCommission = exitPrice * position.quantity * commissionRate;
    const costs = position.entryCommission + exitCommission;
    const netPnl = grossPnl - costs;
    const committed = position.entryPrice * position.quantity;
    trades.push({
      entryIndex: position.entryIndex,
      exitIndex: index,
      side,
      entryPrice: position.entryPrice,
      exitPrice,
      quantity: position.quantity,
      exitReason: reason,
      grossPnl,
      costs,
      netPnl,
      returnPct: committed > 0 ? (netPnl / committed) * 100 : 0,
      bars: index - position.entryIndex,
    });
    realizedEquity += netPnl;
    log.push({ index, time: candles[index].time, event: reason === "stop-loss" ? "stop" : reason === "take-profit" ? "target" : reason === "end-of-data" ? "end-of-data" : "exit", detail: `${reason} at ${exitPrice.toFixed(4)} (net ${netPnl >= 0 ? "+" : ""}${netPnl.toFixed(2)})`, price: exitPrice, quantity: position.quantity, equity: realizedEquity });
    position = null;
  };

  for (let i = 0; i < bars; i += 1) {
    const candle = candles[i];

    // 1. Fill anything queued by the previous bar's close, at this bar's open.
    if (pendingExit && position) closePosition(i, candle.open, "signal");
    pendingExit = false;

    if (pendingEntry && !position) {
      const side = impliedSide(spec);
      const entryPrice = applySlippage(candle.open, side, config.slippageBps, true);
      const notional = realizedEquity * Math.max(0, Math.min(1, spec.riskPerTradePct));
      const quantity = entryPrice > 0 ? notional / entryPrice : 0;
      if (quantity > 0) {
        const entryCommission = entryPrice * quantity * commissionRate;
        position = {
          side,
          entryIndex: i,
          entryPrice,
          quantity,
          entryCommission,
          stopLevel: spec.stopLossPct !== null ? (side === "long" ? entryPrice * (1 - spec.stopLossPct) : entryPrice * (1 + spec.stopLossPct)) : null,
          targetLevel: spec.takeProfitPct !== null ? (side === "long" ? entryPrice * (1 + spec.takeProfitPct) : entryPrice * (1 - spec.takeProfitPct)) : null,
        };
        log.push({ index: i, time: candle.time, event: "enter", detail: `${side} ${quantity.toFixed(4)} @ ${entryPrice.toFixed(4)}`, price: entryPrice, quantity, equity: realizedEquity });
      }
    }
    pendingEntry = false;

    // 2. Intrabar protective exits. The stop is checked first, so a bar that touches both is
    //    treated as a stop-out rather than a win.
    if (position) {
      barsInPosition += 1;
      const side = position.side;
      if (position.stopLevel !== null && ((side === "long" && candle.low <= position.stopLevel) || (side === "short" && candle.high >= position.stopLevel))) {
        closePosition(i, position.stopLevel, "stop-loss");
      } else if (position.targetLevel !== null && ((side === "long" && candle.high >= position.targetLevel) || (side === "short" && candle.low <= position.targetLevel))) {
        closePosition(i, position.targetLevel, "take-profit");
      }
    }

    // 3. Signals on this bar's close. Execution happens on the next bar.
    if (position) {
      // `maxHoldBars` is the number of bars the position may be HELD. A position entered on bar i
      // is held through that bar, so the exit is raised on bar i + maxHoldBars - 1 and fills on the
      // next open — holding it for exactly maxHoldBars bars, not maxHoldBars + 1.
      const holdLimit = spec.maxHoldBars === null ? null : Math.max(1, Math.floor(spec.maxHoldBars));
      const heldTooLong = holdLimit !== null && i - position.entryIndex >= holdLimit - 1;
      if (heldTooLong || evaluateAny(spec.exit, series, i)) pendingExit = true;
    } else if (evaluateAll(spec.entry, series, i)) {
      pendingEntry = true;
    }

    // 4. Mark to market at this bar's close.
    const unrealized = position ? (position.side === "long" ? (candle.close - position.entryPrice) * position.quantity : (position.entryPrice - candle.close) * position.quantity) : 0;
    const markedEquity = realizedEquity + unrealized;
    equity.push({ time: candle.time, index: i, equity: markedEquity });
    yield { barsProcessed: i + 1, totalBars: bars, fraction: bars > 0 ? (i + 1) / bars : 1, equity: markedEquity, trades: trades.length, openPosition: position !== null };
  }

  // Close anything still open at the final close, so metrics reflect the whole series.
  if (position && bars > 0) closePosition(bars - 1, candles[bars - 1].close, "end-of-data");

  const metrics = computeMetrics({ trades, equity, candles: candles.slice(0, bars), startingCapital: config.startingCapital, barsInPosition });

  return { trades, equity, metrics, log, spec, config, barsProcessed: bars };
}

/** Run a strategy over a candle series, synchronously. Pure: same inputs always produce the same result. */
export function runBacktest(candles: Candle[], spec: StrategySpec, config: BacktestConfig = DEFAULT_BACKTEST_CONFIG): BacktestResult {
  const steps = backtestSteps(candles, spec, config);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

/**
 * Run the backtest while keeping the event loop responsive, reporting real progress.
 * The work is identical to {@link runBacktest}; only the scheduling differs.
 */
export async function runBacktestAsync(
  candles: Candle[],
  spec: StrategySpec,
  config: BacktestConfig = DEFAULT_BACKTEST_CONFIG,
  options: { onProgress?: (progress: BacktestProgress) => void; yieldEvery?: number } = {},
): Promise<BacktestResult> {
  const every = Math.max(1, Math.floor(options.yieldEvery ?? 2_000));
  const steps = backtestSteps(candles, spec, config);
  let step = steps.next();
  let sinceYield = 0;
  while (!step.done) {
    options.onProgress?.(step.value);
    sinceYield += 1;
    if (sinceYield >= every) {
      sinceYield = 0;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    step = steps.next();
  }
  return step.value;
}
