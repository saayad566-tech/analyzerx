/**
 * Performance metrics — computed from the real equity curve and trade log.
 *
 * No metric is estimated or defaulted to a flattering value: when a metric cannot be computed
 * (no losses, too few bars, a zero-length window) it is returned as `null` rather than as 0 or ∞.
 */
import type { BacktestMetrics, Candle, EquityPoint, Trade } from "./core-types";

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1_000;

export type MetricsInput = {
  trades: Trade[];
  equity: EquityPoint[];
  candles: Candle[];
  startingCapital: number;
  barsInPosition: number;
};

/** Peak-to-trough decline of an equity curve, as a fraction of the peak. */
export function maxDrawdown(equity: EquityPoint[]): { maxDrawdownPct: number; timeInDrawdownPct: number } {
  if (equity.length === 0) return { maxDrawdownPct: 0, timeInDrawdownPct: 0 };
  let peak = equity[0].equity;
  let worst = 0;
  let underwater = 0;
  for (const point of equity) {
    if (point.equity > peak) peak = point.equity;
    if (peak > 0) {
      const drawdown = (peak - point.equity) / peak;
      if (drawdown > worst) worst = drawdown;
      if (drawdown > 0) underwater += 1;
    }
  }
  return { maxDrawdownPct: worst * 100, timeInDrawdownPct: (underwater / equity.length) * 100 };
}

/** Per-bar simple returns of the equity curve, skipping bars with a non-positive prior equity. */
export function equityReturns(equity: EquityPoint[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < equity.length; i += 1) {
    const previous = equity[i - 1].equity;
    if (previous > 0) returns.push(equity[i].equity / previous - 1);
  }
  return returns;
}

/** Bars per year implied by the candle spacing (median gap), or null when it cannot be derived. */
export function periodsPerYear(candles: Candle[]): number | null {
  if (candles.length < 3) return null;
  const gaps: number[] = [];
  for (let i = 1; i < candles.length; i += 1) {
    const gap = candles[i].time - candles[i - 1].time;
    if (gap > 0) gaps.push(gap);
  }
  if (gaps.length === 0) return null;
  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  if (median <= 0) return null;
  return MS_PER_YEAR / median;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Population standard deviation. */
function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - m) ** 2, 0) / values.length);
}

export function computeMetrics(input: MetricsInput): BacktestMetrics {
  const { trades, equity, candles, startingCapital } = input;
  const endingCapital = equity.length > 0 ? equity[equity.length - 1].equity : startingCapital;

  const wins = trades.filter((trade) => trade.netPnl > 0);
  const losses = trades.filter((trade) => trade.netPnl < 0);
  const grossProfit = wins.reduce((sum, trade) => sum + trade.netPnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.netPnl, 0));
  const decided = wins.length + losses.length;

  const { maxDrawdownPct, timeInDrawdownPct } = maxDrawdown(equity);

  const firstTime = candles.length > 0 ? candles[0].time : 0;
  const lastTime = candles.length > 0 ? candles[candles.length - 1].time : 0;
  const years = (lastTime - firstTime) / MS_PER_YEAR;
  const cagrPct = years > 0 && startingCapital > 0 && endingCapital > 0 ? ((endingCapital / startingCapital) ** (1 / years) - 1) * 100 : null;

  const returns = equityReturns(equity);
  const perYear = periodsPerYear(candles);
  const returnStdDev = stdDev(returns);
  const volatilityPct = perYear !== null && returns.length >= 2 ? returnStdDev * Math.sqrt(perYear) * 100 : null;
  const sharpe = perYear !== null && returns.length >= 2 && returnStdDev > 0 ? (mean(returns) / returnStdDev) * Math.sqrt(perYear) : null;

  return {
    startingCapital,
    endingCapital,
    totalReturnPct: startingCapital > 0 ? ((endingCapital - startingCapital) / startingCapital) * 100 : 0,
    tradeCount: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRatePct: decided > 0 ? (wins.length / decided) * 100 : 0,
    grossProfit,
    grossLoss,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    averageWin: wins.length > 0 ? grossProfit / wins.length : 0,
    averageLoss: losses.length > 0 ? -grossLoss / losses.length : 0,
    expectancy: trades.length > 0 ? trades.reduce((sum, trade) => sum + trade.netPnl, 0) / trades.length : 0,
    maxDrawdownPct,
    timeInDrawdownPct,
    cagrPct,
    volatilityPct,
    sharpe,
    exposurePct: candles.length > 0 ? (input.barsInPosition / candles.length) * 100 : 0,
    totalCosts: trades.reduce((sum, trade) => sum + trade.costs, 0),
    instruments: 1,
  };
}
