/**
 * Quant R&D core — shared types.
 *
 * Everything in `lib/quant` is pure and dependency-free so the mathematics is unit-testable and
 * provable. There are no stubs, no random numbers and no look-ahead: a strategy sees only the
 * candles up to and including the one it is deciding on, and execution happens on the next candle.
 */

/** One OHLCV bar. `time` is epoch milliseconds, ascending. */
export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type TradeSide = "long" | "short";

/** A completed round trip. */
export type Trade = {
  /** Index of the candle on which the position was opened. */
  entryIndex: number;
  /** Index of the candle on which the position was closed. */
  exitIndex: number;
  side: TradeSide;
  /** Fill prices including slippage. */
  entryPrice: number;
  exitPrice: number;
  /** Quantity of the instrument held. */
  quantity: number;
  /** Reason the position closed. */
  exitReason: "signal" | "stop-loss" | "take-profit" | "end-of-data";
  /** Realised gross profit before costs (quote currency). */
  grossPnl: number;
  /** Total costs charged (commission on both legs). */
  costs: number;
  /** Realised net profit after costs. */
  netPnl: number;
  /** Net return on the capital committed to this trade. */
  returnPct: number;
  /** Bars held. */
  bars: number;
};

/** A point on the equity curve, one per candle processed. */
export type EquityPoint = { time: number; index: number; equity: number };

export type BacktestMetrics = {
  startingCapital: number;
  endingCapital: number;
  /** Net profit as a fraction of starting capital. */
  totalReturnPct: number;
  tradeCount: number;
  wins: number;
  losses: number;
  /** Wins / decided trades (0 when there are none). */
  winRatePct: number;
  grossProfit: number;
  grossLoss: number;
  /** Gross profit / gross loss; null when there are no losses. */
  profitFactor: number | null;
  averageWin: number;
  averageLoss: number;
  /** Average net PnL per trade. */
  expectancy: number;
  /** Largest peak-to-trough decline of the equity curve, as a fraction. */
  maxDrawdownPct: number;
  /** Bars spent below a prior equity peak, as a fraction of all bars. */
  timeInDrawdownPct: number;
  /** Annualised return from the equity curve; null when it cannot be computed. */
  cagrPct: number | null;
  /** Annualised volatility of per-bar returns, as a fraction; null when too few bars. */
  volatilityPct: number | null;
  /** Annualised Sharpe of per-bar returns (risk-free assumed 0); null when it cannot be computed. */
  sharpe: number | null;
  /** Fraction of bars holding a position. */
  exposurePct: number;
  totalCosts: number;
  /** Distinct instruments traded (always 1 for a single-series run). */
  instruments: number;
};
