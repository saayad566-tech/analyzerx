/**
 * The performance ledger.
 *
 * The tracker answers "how did this run go". The ledger answers the question the directive actually
 * asks — *"trace every book-strategy output over time... individual asset performance logs alongside
 * overall average return metrics and win-rates across strategies"*. It turns individual tracked
 * positions into a durable record, then aggregates across strategies and across time.
 *
 * The ledger is bounded and de-duplicated by a stable key, so re-recording the same closed position
 * does not double-count it, and the store cannot grow without limit.
 */
import type { MarketId } from "./core-types";
import type { TrackerExitReason, TrackedPosition, TrackerRun } from "./tracker";

/** A single closed (or still-open) tracked position, flattened for storage. */
export type LedgerEntry = {
  /** Stable identity: strategy + market + symbol + entry time. Re-recording updates in place. */
  id: string;
  strategyId: string;
  strategyName: string;
  marketId: MarketId;
  symbol: string;
  entryTime: number;
  exitTime: number | null;
  entryPrice: number;
  exitPrice: number | null;
  peakPrice: number;
  peakGainPct: number;
  finalStopPrice: number;
  stopRule: string;
  exitReason: TrackerExitReason;
  returnPct: number;
  bars: number;
  maePct: number;
  mfePct: number;
  /** When the entry was written to the ledger. */
  recordedAt: number;
};

export const LEDGER_CAP = 2_000;

export function ledgerKey(input: { strategyId: string; marketId: MarketId; symbol: string; entryTime: number }): string {
  return `${input.strategyId}|${input.marketId}|${input.symbol}|${input.entryTime}`;
}

/** Flatten one tracked position into a ledger entry. */
export function entryFromPosition(
  position: TrackedPosition,
  meta: { strategyId: string; strategyName: string; marketId: MarketId; symbol: string; entryTime: number; exitTime: number | null; recordedAt?: number },
): LedgerEntry {
  return {
    id: ledgerKey({ strategyId: meta.strategyId, marketId: meta.marketId, symbol: meta.symbol, entryTime: meta.entryTime }),
    strategyId: meta.strategyId,
    strategyName: meta.strategyName,
    marketId: meta.marketId,
    symbol: meta.symbol,
    entryTime: meta.entryTime,
    exitTime: meta.exitTime,
    entryPrice: position.entryPrice,
    exitPrice: position.exitPrice,
    peakPrice: position.peakPrice,
    peakGainPct: position.peakGainPct,
    finalStopPrice: position.finalStopPrice,
    stopRule: position.stopRule,
    exitReason: position.trackerExitReason,
    returnPct: position.returnPct,
    bars: position.bars,
    maePct: position.maePct,
    mfePct: position.mfePct,
    recordedAt: meta.recordedAt ?? Date.now(),
  };
}

/** Flatten every position of a tracker run. */
export function entriesFromRun(
  run: TrackerRun,
  meta: { strategyId: string; strategyName: string; marketId: MarketId; symbol: string; times?: number[]; recordedAt?: number },
): LedgerEntry[] {
  return run.positions.map((position) =>
    entryFromPosition(position, {
      strategyId: meta.strategyId,
      strategyName: meta.strategyName,
      marketId: meta.marketId,
      symbol: meta.symbol,
      entryTime: meta.times?.[position.entryIndex] ?? position.entryIndex,
      exitTime: meta.times?.[position.exitIndex] ?? position.exitIndex,
      recordedAt: meta.recordedAt,
    }),
  );
}

/**
 * Merge new entries into the ledger: newest first, de-duplicated by id (an existing id is replaced,
 * not duplicated), and truncated to the cap.
 */
export function mergeLedger(existing: LedgerEntry[], incoming: LedgerEntry[], cap = LEDGER_CAP): LedgerEntry[] {
  const byId = new Map<string, LedgerEntry>();
  for (const entry of existing) byId.set(entry.id, entry);
  for (const entry of incoming) byId.set(entry.id, entry);
  return [...byId.values()].sort((a, b) => b.recordedAt - a.recordedAt || b.entryTime - a.entryTime).slice(0, Math.max(1, cap));
}

/** The ledger is market-scoped exactly like every other engine surface. */
export function filterByMarket(entries: LedgerEntry[], marketId: MarketId): LedgerEntry[] {
  return entries.filter((entry) => entry.marketId === marketId);
}

export type Aggregate = {
  trades: number;
  wins: number;
  losses: number;
  scratches: number;
  winRatePct: number;
  averageReturnPct: number;
  medianReturnPct: number;
  bestReturnPct: number;
  worstReturnPct: number;
  profitFactor: number | null;
  averageBarsHeld: number;
  averageMfePct: number;
  averageMaePct: number;
  byExitReason: Record<TrackerExitReason, number>;
};

const EMPTY_REASONS: Record<TrackerExitReason, number> = {
  signal: 0, "initial-risk-floor": 0, "break-even": 0, "trailing-stop": 0, "take-profit": 0, "end-of-data": 0,
};

/** Aggregate a set of entries. Open positions are included; their exit fields are simply absent. */
export function aggregate(entries: LedgerEntry[]): Aggregate {
  const byExitReason = { ...EMPTY_REASONS };
  for (const entry of entries) byExitReason[entry.exitReason] = (byExitReason[entry.exitReason] ?? 0) + 1;

  const returns = entries.map((entry) => entry.returnPct).sort((a, b) => a - b);
  const wins = entries.filter((entry) => entry.returnPct > 0);
  const losses = entries.filter((entry) => entry.returnPct < 0);
  const grossProfit = wins.reduce((sum, entry) => sum + entry.returnPct, 0);
  const grossLoss = Math.abs(losses.reduce((sum, entry) => sum + entry.returnPct, 0));

  const median = returns.length === 0
    ? 0
    : returns.length % 2 === 1
      ? returns[(returns.length - 1) / 2]
      : (returns[returns.length / 2 - 1] + returns[returns.length / 2]) / 2;

  return {
    trades: entries.length,
    wins: wins.length,
    losses: losses.length,
    scratches: entries.length - wins.length - losses.length,
    winRatePct: entries.length > 0 ? (wins.length / entries.length) * 100 : 0,
    averageReturnPct: entries.length > 0 ? entries.reduce((sum, entry) => sum + entry.returnPct, 0) / entries.length : 0,
    medianReturnPct: median,
    bestReturnPct: returns.length > 0 ? returns[returns.length - 1] : 0,
    worstReturnPct: returns.length > 0 ? returns[0] : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    averageBarsHeld: entries.length > 0 ? entries.reduce((sum, entry) => sum + entry.bars, 0) / entries.length : 0,
    averageMfePct: entries.length > 0 ? entries.reduce((sum, entry) => sum + entry.mfePct, 0) / entries.length : 0,
    averageMaePct: entries.length > 0 ? entries.reduce((sum, entry) => sum + entry.maePct, 0) / entries.length : 0,
    byExitReason,
  };
}

export type StrategyAggregate = Aggregate & { strategyId: string; strategyName: string };

/** Per-strategy aggregates, best average return first. */
export function aggregateByStrategy(entries: LedgerEntry[]): StrategyAggregate[] {
  const groups = new Map<string, LedgerEntry[]>();
  for (const entry of entries) {
    const bucket = groups.get(entry.strategyId);
    if (bucket) bucket.push(entry);
    else groups.set(entry.strategyId, [entry]);
  }
  return [...groups.entries()]
    .map(([strategyId, bucket]) => ({ strategyId, strategyName: bucket[0].strategyName, ...aggregate(bucket) }))
    .sort((a, b) => b.averageReturnPct - a.averageReturnPct || a.strategyId.localeCompare(b.strategyId));
}

export type LedgerSummary = {
  overall: Aggregate;
  byStrategy: StrategyAggregate[];
  strategyCount: number;
  marketId: MarketId | null;
  /** Distinct symbols recorded. */
  symbolCount: number;
  firstRecordedAt: number | null;
  lastRecordedAt: number | null;
};

/** The cross-strategy dashboard: overall metrics plus a per-strategy breakdown. */
export function ledgerSummary(entries: LedgerEntry[], marketId: MarketId | null = null): LedgerSummary {
  const scoped = marketId ? filterByMarket(entries, marketId) : entries;
  const byStrategy = aggregateByStrategy(scoped);
  const timestamps = scoped.map((entry) => entry.recordedAt);
  return {
    overall: aggregate(scoped),
    byStrategy,
    strategyCount: byStrategy.length,
    marketId,
    symbolCount: new Set(scoped.map((entry) => entry.symbol)).size,
    firstRecordedAt: timestamps.length > 0 ? Math.min(...timestamps) : null,
    lastRecordedAt: timestamps.length > 0 ? Math.max(...timestamps) : null,
  };
}
