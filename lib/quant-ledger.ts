/**
 * Durable storage for the Strategy Lab performance ledger.
 *
 * The engine's ledger is pure; this is the persistence edge. It follows the same AsyncStorage pattern
 * as the rest of the app's local preferences, validates every record it reads back (a corrupted or
 * older payload must not silently become a metric), and keeps the store bounded.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

import type { MarketId } from "@/lib/market-regions";
import { LEDGER_CAP, ledgerSummary, mergeLedger, type LedgerEntry, type LedgerSummary } from "@/lib/quant/ledger";
import type { TrackerExitReason } from "@/lib/quant/tracker";

const LEDGER_KEY = "market-event-intelligence.strategy-lab.ledger";

const EXIT_REASONS: TrackerExitReason[] = ["signal", "initial-risk-floor", "break-even", "trailing-stop", "take-profit", "end-of-data"];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Validate one stored record. Anything malformed is dropped rather than trusted. */
function parseEntry(raw: unknown): LedgerEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id) return null;
  if (typeof record.strategyId !== "string" || typeof record.strategyName !== "string") return null;
  if (typeof record.marketId !== "string" || typeof record.symbol !== "string") return null;
  if (!EXIT_REASONS.includes(record.exitReason as TrackerExitReason)) return null;
  if (!isFiniteNumber(record.entryTime) || !isFiniteNumber(record.recordedAt)) return null;
  if (!isFiniteNumber(record.entryPrice) || !isFiniteNumber(record.returnPct) || !isFiniteNumber(record.bars)) return null;
  return {
    id: record.id,
    strategyId: record.strategyId,
    strategyName: record.strategyName,
    marketId: record.marketId as MarketId,
    symbol: record.symbol,
    entryTime: record.entryTime,
    exitTime: isFiniteNumber(record.exitTime) ? record.exitTime : null,
    entryPrice: record.entryPrice,
    exitPrice: isFiniteNumber(record.exitPrice) ? record.exitPrice : null,
    peakPrice: isFiniteNumber(record.peakPrice) ? record.peakPrice : record.entryPrice,
    peakGainPct: isFiniteNumber(record.peakGainPct) ? record.peakGainPct : 0,
    finalStopPrice: isFiniteNumber(record.finalStopPrice) ? record.finalStopPrice : record.entryPrice,
    stopRule: typeof record.stopRule === "string" ? record.stopRule : "unknown",
    exitReason: record.exitReason as TrackerExitReason,
    returnPct: record.returnPct,
    bars: record.bars,
    maePct: isFiniteNumber(record.maePct) ? record.maePct : 0,
    mfePct: isFiniteNumber(record.mfePct) ? record.mfePct : 0,
    recordedAt: record.recordedAt,
  };
}

export function parseLedger(raw: string | null): LedgerEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(parseEntry).filter((entry): entry is LedgerEntry => entry !== null).slice(0, LEDGER_CAP);
  } catch {
    return [];
  }
}

export async function loadLedger(): Promise<LedgerEntry[]> {
  try {
    return parseLedger(await AsyncStorage.getItem(LEDGER_KEY));
  } catch {
    return [];
  }
}

/** Merge entries into the stored ledger and return the merged result. */
export async function recordEntries(entries: LedgerEntry[]): Promise<LedgerEntry[]> {
  if (entries.length === 0) return loadLedger();
  const merged = mergeLedger(await loadLedger(), entries);
  try {
    await AsyncStorage.setItem(LEDGER_KEY, JSON.stringify(merged));
  } catch {
    // A failed write must not lose the in-memory result; the caller still gets the merged ledger.
  }
  return merged;
}

/** The cross-strategy dashboard for one market. */
export function summarize(entries: LedgerEntry[], marketId: MarketId): LedgerSummary {
  return ledgerSummary(entries, marketId);
}

export async function clearLedger(): Promise<void> {
  try {
    await AsyncStorage.removeItem(LEDGER_KEY);
  } catch {
    // Nothing to recover: the ledger is already absent or the store is unavailable.
  }
}
