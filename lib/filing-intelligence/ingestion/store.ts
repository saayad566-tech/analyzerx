/**
 * Local persistence and caching (Prompt 2, section 7).
 *
 * The store is an in-memory model with explicit, testable rules for the things
 * that actually go wrong: a download that was interrupted, a parser that was
 * upgraded after a document was already extracted, a cache that grows without
 * bound, and a document the user wants deleted.
 *
 * It holds no paid dependency. The caller decides where the bytes live; this
 * module tracks the state, the hashes and the retention decisions.
 */

import type { DocumentFormat } from "./types";

export type CacheStatus =
  | "pending"
  | "retrieving"
  | "retrieved"
  | "extracting"
  | "extracted"
  | "failed";

export type CacheEntry = {
  filingKey: string;
  status: CacheStatus;
  sha256: string | null;
  byteLength: number | null;
  format: DocumentFormat;
  /** The parser version that produced the current extraction. */
  parserVersion: string | null;
  storedUtc: string;
  lastAccessUtc: string;
  /** True when the document bytes are retained on the device. */
  retained: boolean;
  error: string | null;
  attempts: number;
};

export type IngestionStore = {
  entries: CacheEntry[];
  /** Bounded storage: the ceiling on retained documents. */
  maxEntries: number;
  maxBytes: number;
  /** The parser version currently shipping; drives reprocessing. */
  currentParserVersion: string;
};

export function createStore(options: { maxEntries?: number; maxBytes?: number; parserVersion: string }): IngestionStore {
  return {
    entries: [],
    maxEntries: options.maxEntries ?? 200,
    maxBytes: options.maxBytes ?? 64_000_000,
    currentParserVersion: options.parserVersion,
  };
}

export type UpsertOutcome = {
  store: IngestionStore;
  /** Entries dropped to stay within the bounds, newest-retained first. */
  evicted: string[];
};

/**
 * Insert or update an entry, then enforce the bounds.
 *
 * Eviction removes the least recently accessed entries first. An entry still in
 * flight is never evicted, because dropping it would lose a partial download
 * the resumption logic depends on.
 */
export function upsertEntry(store: IngestionStore, entry: CacheEntry): UpsertOutcome {
  const entries = [...store.entries];
  const index = entries.findIndex((existing) => existing.filingKey === entry.filingKey);
  if (index >= 0) entries[index] = { ...entry, attempts: entry.attempts };
  else entries.push(entry);

  const evicted: string[] = [];
  const byAge = (a: CacheEntry, b: CacheEntry) => a.lastAccessUtc.localeCompare(b.lastAccessUtc);
  const evictable = () => entries.filter((candidate) => candidate.status !== "retrieving" && candidate.status !== "extracting").sort(byAge);

  while (entries.length > store.maxEntries) {
    const candidate = evictable()[0];
    if (!candidate) break;
    entries.splice(entries.indexOf(candidate), 1);
    evicted.push(candidate.filingKey);
  }

  const totalBytes = () => entries.reduce((sum, candidate) => sum + (candidate.retained ? candidate.byteLength ?? 0 : 0), 0);
  while (totalBytes() > store.maxBytes) {
    const candidate = evictable().find((entry) => entry.retained);
    if (!candidate) break;
    // Drop the bytes but keep the metadata, so the filing is not lost from view.
    const at = entries.indexOf(candidate);
    entries[at] = { ...candidate, retained: false };
    evicted.push(`${candidate.filingKey} (bytes released)`);
  }

  return { store: { ...store, entries }, evicted };
}

/** Whether a filing must be re-extracted because the parser changed. */
export function needsReprocessing(store: IngestionStore, filingKey: string, parserVersion = store.currentParserVersion): boolean {
  const entry = store.entries.find((candidate) => candidate.filingKey === filingKey);
  if (!entry) return true;
  if (entry.status !== "extracted") return true;
  return entry.parserVersion !== parserVersion;
}

/** Every filing that needs re-extraction under the current parser version. */
export function reprocessingQueue(store: IngestionStore, parserVersion = store.currentParserVersion): string[] {
  return store.entries.filter((entry) => entry.status === "extracted" && entry.parserVersion !== parserVersion).map((entry) => entry.filingKey);
}

/**
 * Mark entries that were interrupted mid-flight.
 *
 * An entry left in retrieving or extracting means the process stopped, so it is
 * reset to pending and its attempt count is incremented, which lets the
 * resumption logic retry it rather than leaving it stuck forever.
 */
export function recoverInterrupted(store: IngestionStore, staleAfterMs = 15 * 60_000, now = new Date()): { store: IngestionStore; recovered: string[] } {
  const recovered: string[] = [];
  const entries = store.entries.map((entry) => {
    if (entry.status !== "retrieving" && entry.status !== "extracting") return entry;
    const age = now.getTime() - new Date(entry.lastAccessUtc).getTime();
    if (age < staleAfterMs) return entry;
    recovered.push(entry.filingKey);
    return { ...entry, status: "pending" as CacheStatus, error: "The previous attempt was interrupted.", attempts: entry.attempts + 1, lastAccessUtc: now.toISOString() };
  });
  return { store: { ...store, entries }, recovered };
}

/** Delete a cached document, releasing its bytes and its entry. */
export function deleteEntry(store: IngestionStore, filingKey: string): { store: IngestionStore; deleted: boolean } {
  const entries = store.entries.filter((entry) => entry.filingKey !== filingKey);
  return { store: { ...store, entries }, deleted: entries.length !== store.entries.length };
}

/** Invalidate every extraction produced by a given parser version. */
export function invalidateByParserVersion(store: IngestionStore, parserVersion: string): { store: IngestionStore; invalidated: string[] } {
  const invalidated: string[] = [];
  const entries = store.entries.map((entry) => {
    if (entry.parserVersion !== parserVersion) return entry;
    invalidated.push(entry.filingKey);
    return { ...entry, status: "retrieved" as CacheStatus, parserVersion: null };
  });
  return { store: { ...store, entries }, invalidated };
}

/** Record an access, so eviction sees the true recency. */
export function touchEntry(store: IngestionStore, filingKey: string, now = new Date()): IngestionStore {
  return {
    ...store,
    entries: store.entries.map((entry) => (entry.filingKey === filingKey ? { ...entry, lastAccessUtc: now.toISOString() } : entry)),
  };
}

export type StoreSummary = {
  total: number;
  byStatus: Record<CacheStatus, number>;
  retainedBytes: number;
  /** Entries that would need re-extraction under the current parser version. */
  staleExtractions: number;
};

export function storeSummary(store: IngestionStore): StoreSummary {
  const byStatus: Record<CacheStatus, number> = { pending: 0, retrieving: 0, retrieved: 0, extracting: 0, extracted: 0, failed: 0 };
  let retainedBytes = 0;
  for (const entry of store.entries) {
    byStatus[entry.status] += 1;
    if (entry.retained) retainedBytes += entry.byteLength ?? 0;
  }
  return {
    total: store.entries.length,
    byStatus,
    retainedBytes,
    staleExtractions: store.entries.filter((entry) => entry.status === "extracted" && entry.parserVersion !== store.currentParserVersion).length,
  };
}
