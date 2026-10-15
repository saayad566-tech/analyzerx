/**
 * Durable, append-only storage for the published signal history.
 *
 * Integrity rules this layer must not break:
 *   - The chain is **global**, not per-market. Filtering before verifying would break the sequence
 *     and link checks, so verification always runs over the whole chain and the UI filters for display.
 *   - Records are never trimmed. If the cap is reached the append is **refused** and reported, rather
 *     than silently discarding history — a history that quietly loses its oldest entries is worse
 *     than one that says it is full.
 *   - Nothing read back is trusted until it re-verifies.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import type { MarketId } from "@/lib/market-regions";
import {
  appendSignal, parseHistory, serializeHistory, verifyChain,
  type ChainVerification, type SignalDraft, type SignalRecord,
} from "@/lib/quant/signal-history";

const HISTORY_KEY = "market-event-intelligence.strategy-lab.signal-history";

/** Records are small; this is years of daily suggestions. Beyond it, publish and archive. */
export const HISTORY_CAP = 2_000;

export async function loadChain(): Promise<SignalRecord[]> {
  try {
    const chain = parseHistory((await AsyncStorage.getItem(HISTORY_KEY)) ?? "[]");
    return chain ?? [];
  } catch {
    return [];
  }
}

export type AppendResult =
  | { ok: true; record: SignalRecord; chain: SignalRecord[]; verification: ChainVerification }
  | { ok: false; reason: string; chain: SignalRecord[] };

/**
 * Append one suggestion to the chain and persist it.
 * The existing chain is re-verified first: appending to a chain that is already broken would extend
 * a corrupted history rather than fix it.
 */
export async function appendAndStore(draft: SignalDraft): Promise<AppendResult> {
  const chain = await loadChain();
  const before = verifyChain(chain);
  if (!before.valid) {
    return { ok: false, reason: `The stored history is already broken at record ${before.brokenAt} (${before.reason}). Publish and reset it before appending more.`, chain };
  }
  if (chain.length >= HISTORY_CAP) {
    return { ok: false, reason: `The history is full at ${HISTORY_CAP} records. Publish it and archive before appending more.`, chain };
  }
  const record = appendSignal(chain, draft);
  const next = [...chain, record];
  try {
    await AsyncStorage.setItem(HISTORY_KEY, serializeHistory(next, record.recordedAt));
  } catch {
    return { ok: false, reason: "The record could not be written to storage.", chain };
  }
  return { ok: true, record, chain: next, verification: verifyChain(next) };
}

export function verify(chain: SignalRecord[]): ChainVerification {
  return verifyChain(chain);
}

/** Records for one market, for display. Verification still runs over the whole chain. */
export function chainForMarket(chain: SignalRecord[], marketId: MarketId): SignalRecord[] {
  return chain.filter((record) => record.marketId === marketId);
}

export type PublishResult = {
  ok: boolean;
  headHash: string;
  records: number;
  uri?: string;
  shared?: boolean;
  reason?: string;
};

/**
 * Write the published artefact to a file and hand it to the share sheet.
 * Refuses to publish a chain that does not verify — publishing a broken history would defeat the
 * entire purpose of the chain.
 */
export async function publishHistory(chain: SignalRecord[], publishedAt = Date.now()): Promise<PublishResult> {
  const verification = verifyChain(chain);
  const headHash = chain.length > 0 ? chain[chain.length - 1].hash : "";
  if (!verification.valid) {
    return { ok: false, headHash, records: chain.length, reason: `The history does not verify (record ${verification.brokenAt}: ${verification.reason}). Publishing it would be meaningless.` };
  }
  const root = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
  if (!root) return { ok: false, headHash, records: chain.length, reason: "This platform has no writable file system, so the artefact cannot be exported." };

  const uri = `${root}analyzerx-signal-history.json`;
  try {
    await FileSystem.writeAsStringAsync(uri, serializeHistory(chain, publishedAt), { encoding: FileSystem.EncodingType.UTF8 });
  } catch {
    return { ok: false, headHash, records: chain.length, reason: "The artefact could not be written." };
  }

  const canShare = await Sharing.isAvailableAsync().catch(() => false);
  if (!canShare) return { ok: true, headHash, records: chain.length, uri, shared: false };
  try {
    await Sharing.shareAsync(uri, { mimeType: "application/json", dialogTitle: "Publish signal history" });
    return { ok: true, headHash, records: chain.length, uri, shared: true };
  } catch {
    // The file is still written, so the artefact exists even if the share sheet was dismissed.
    return { ok: true, headHash, records: chain.length, uri, shared: false };
  }
}

export async function clearHistory(): Promise<void> {
  try {
    await AsyncStorage.removeItem(HISTORY_KEY);
  } catch {
    // Nothing to recover.
  }
}
