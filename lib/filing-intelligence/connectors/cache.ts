/**
 * Local filing cache with idempotent deduplication (PRD sec 6; guidance: a
 * local cache to avoid duplicate downloads).
 *
 * PRD 6 requires ingestion to be idempotent so a retry does not create
 * duplicate filings, and requires a source-scoped external id where available
 * rather than using a company name as the unique key. It also warns that two
 * different files can share a title and must be treated as distinct until
 * their identifiers are compared.
 *
 * So the dedup key is built in this order of preference:
 *   1. source id + external id, when the source gives one;
 *   2. source id + content hash, when the bytes were retrieved;
 *   3. source id + the filing URL, as the last stable identifier.
 *
 * A title is never part of the key, because titles collide.
 */

import type { FetchedFiling } from "./types";

export type CachedFiling = {
  /** Stable dedup key. */
  key: string;
  sourceId: string;
  externalId: string | null;
  title: string;
  url: string;
  publishedAt: string | null;
  category: string;
  companyName: string | null;
  contentSha256: string | null;
  /** When this device first observed the filing. */
  firstSeenUtc: string;
  /** When it was last seen in a fetch. */
  lastSeenUtc: string;
};

/**
 * Build the dedup key. The external id wins because it is the source's own
 * stable identifier; the content hash is used only when the source gave no id;
 * the URL is the fallback. A title alone is never sufficient.
 */
export function dedupKey(filing: Pick<FetchedFiling, "externalId" | "contentSha256" | "url">, sourceId: string): string {
  if (filing.externalId && filing.externalId.trim()) return `${sourceId}::id::${filing.externalId.trim()}`;
  if (filing.contentSha256 && filing.contentSha256.trim()) return `${sourceId}::sha::${filing.contentSha256.trim()}`;
  return `${sourceId}::url::${filing.url.trim()}`;
}

export type MergeOutcome = {
  /** Filings not previously in the cache. */
  added: CachedFiling[];
  /** Filings already present, refreshed rather than re-added. */
  existing: CachedFiling[];
  /** The cache after the merge, newest first. */
  cache: CachedFiling[];
  /** True when nothing new arrived, so no report needs regenerating. */
  unchanged: boolean;
};

/**
 * Merge freshly fetched filings into the cache idempotently.
 *
 * A repeat fetch of the same filing updates lastSeenUtc and leaves firstSeenUtc
 * untouched, so the "first seen" time remains the honest first observation.
 */
export function mergeFetched(cache: CachedFiling[], sourceId: string, filings: FetchedFiling[], now: Date): MergeOutcome {
  const byKey = new Map(cache.map((entry) => [entry.key, entry]));
  const added: CachedFiling[] = [];
  const existing: CachedFiling[] = [];
  const stamp = now.toISOString();

  for (const filing of filings) {
    const key = dedupKey(filing, sourceId);
    const prior = byKey.get(key);
    if (prior) {
      const refreshed: CachedFiling = { ...prior, lastSeenUtc: stamp };
      byKey.set(key, refreshed);
      existing.push(refreshed);
      continue;
    }
    const entry: CachedFiling = {
      key,
      sourceId,
      externalId: filing.externalId,
      title: filing.title,
      url: filing.url,
      publishedAt: filing.publishedAt,
      category: filing.category,
      companyName: filing.companyName,
      contentSha256: filing.contentSha256,
      firstSeenUtc: stamp,
      lastSeenUtc: stamp,
    };
    byKey.set(key, entry);
    added.push(entry);
  }

  const merged = [...byKey.values()].sort((left, right) => {
    const a = left.publishedAt ?? left.firstSeenUtc;
    const b = right.publishedAt ?? right.firstSeenUtc;
    return b.localeCompare(a);
  });

  return { added, existing, cache: merged, unchanged: added.length === 0 };
}

/** Filings in the cache for one company name or symbol, newest first. */
export function cachedForCompany(cache: CachedFiling[], query: string): CachedFiling[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return cache;
  return cache.filter((entry) => (entry.companyName ?? "").toLowerCase().includes(needle));
}

/** A compact summary of what the cache holds, for the UI. */
export function cacheSummary(cache: CachedFiling[]): { total: number; sources: number; newest: string | null } {
  const sources = new Set(cache.map((entry) => entry.sourceId));
  return {
    total: cache.length,
    sources: sources.size,
    newest: cache.length ? (cache[0].publishedAt ?? cache[0].firstSeenUtc) : null,
  };
}
