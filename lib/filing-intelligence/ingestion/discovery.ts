/**
 * Filing discovery (Prompt 2, section 1).
 *
 * Company identifier lookup, filing-type / date / period filters, incremental
 * retrieval, pagination, duplicate detection and amendment discovery, all as
 * pure functions over already-fetched filings so the behaviour is testable
 * without the network.
 *
 * A ticker is never used as the key, because tickers are reused and are not
 * globally unique. The stable key is the source plus the source's own
 * identifier, falling back to the official URL when the source gives no id.
 */

import type { DiscoveredFiling, FilingCategory } from "./types";

export type DiscoveryQuery = {
  /** An SEC CIK, an ISIN, a BSE scrip code, or any official company id. */
  companyId?: string;
  companyName?: string;
  filingTypes?: string[];
  categories?: FilingCategory[];
  /** Inclusive ISO dates bounding the publication time. */
  publishedFrom?: string;
  publishedTo?: string;
  /** Reporting period, matched case-insensitively as a substring. */
  period?: string;
  /** Only filings the source marks as amendments, or only non-amendments. */
  amendmentsOnly?: boolean;
  /** Include amended filings that would otherwise be filtered out. */
  includeAmendments?: boolean;
};

/** Build the stable key for a filing. Source + source-scoped id wins. */
export function stableKeyFor(sourceId: string, sourceScopedId: string | null, officialUrl: string): string {
  const scoped = sourceScopedId?.trim();
  if (scoped) return `${sourceId}::${scoped}`;
  return `${sourceId}::url::${officialUrl.trim()}`;
}

function matchesCompany(filing: DiscoveredFiling, query: DiscoveryQuery): boolean {
  if (query.companyId) {
    const wanted = query.companyId.trim().toLowerCase();
    const id = filing.identifiers;
    const candidates = [id.companyId, id.sourceId, id.isin, id.exchangeCode, id.ticker]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase());
    if (!candidates.includes(wanted)) return false;
  }
  if (query.companyName) {
    const wanted = query.companyName.trim().toLowerCase();
    if (!(filing.companyName ?? "").toLowerCase().includes(wanted)) return false;
  }
  return true;
}

function matchesType(filing: DiscoveredFiling, query: DiscoveryQuery): boolean {
  if (query.filingTypes?.length) {
    const wanted = query.filingTypes.map((value) => value.trim().toLowerCase());
    if (!wanted.includes((filing.filingType ?? "").toLowerCase())) return false;
  }
  if (query.categories?.length) {
    if (!query.categories.includes(filing.category)) return false;
  }
  return true;
}

function publicationIso(filing: DiscoveredFiling): string | null {
  return filing.timestamps.publication.known ? filing.timestamps.publication.value : null;
}

function matchesDates(filing: DiscoveredFiling, query: DiscoveryQuery): boolean {
  const published = publicationIso(filing);
  if (query.publishedFrom) {
    // A filing with no stated publication date cannot be proven to fall inside
    // a date range, so it is excluded rather than assumed to match.
    if (!published || published < query.publishedFrom) return false;
  }
  if (query.publishedTo) {
    if (!published || published > query.publishedTo) return false;
  }
  return true;
}

function matchesPeriod(filing: DiscoveredFiling, query: DiscoveryQuery): boolean {
  if (!query.period) return true;
  const wanted = query.period.trim().toLowerCase();
  return (filing.period ?? "").toLowerCase().includes(wanted);
}

/**
 * Apply every filter. Amendments are included by default only when the caller
 * has not asked to exclude them, because an amendment is a real filing.
 */
export function applyDiscoveryFilters(filings: DiscoveredFiling[], query: DiscoveryQuery): DiscoveredFiling[] {
  return filings.filter((filing) => {
    if (!matchesCompany(filing, query)) return false;
    if (!matchesType(filing, query)) return false;
    if (!matchesDates(filing, query)) return false;
    if (!matchesPeriod(filing, query)) return false;
    if (query.amendmentsOnly && !filing.isAmendment) return false;
    if (query.includeAmendments === false && filing.isAmendment) return false;
    return true;
  });
}

export type Page<T> = {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasMore: boolean;
};

/** Paginate a result set. Page numbers are zero-based. */
export function paginate<T>(items: T[], page = 0, pageSize = 25): Page<T> {
  const size = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const start = safePage * size;
  return {
    items: items.slice(start, start + size),
    page: safePage,
    pageSize: size,
    totalItems: items.length,
    totalPages,
    hasMore: safePage < totalPages - 1,
  };
}

export type DedupeOutcome = {
  unique: DiscoveredFiling[];
  /** Filings dropped as repeats, with the key they collided on. */
  duplicates: { stableKey: string; title: string }[];
};

/**
 * Remove duplicates by stable key. Two filings sharing a title but not a key
 * are kept, because a title is not an identifier.
 */
export function dedupeFilings(filings: DiscoveredFiling[]): DedupeOutcome {
  const seen = new Map<string, DiscoveredFiling>();
  const duplicates: { stableKey: string; title: string }[] = [];
  for (const filing of filings) {
    if (seen.has(filing.stableKey)) {
      duplicates.push({ stableKey: filing.stableKey, title: filing.title });
      continue;
    }
    seen.set(filing.stableKey, filing);
  }
  return { unique: [...seen.values()], duplicates };
}

export type IncrementalOutcome = {
  /** Filings whose stable key has not been seen before. */
  fresh: DiscoveredFiling[];
  /** Filings already known, returned so the caller can refresh last-seen. */
  alreadyKnown: DiscoveredFiling[];
};

/**
 * Incremental retrieval: split a fetched batch against the keys already held.
 */
export function discoverIncremental(filings: DiscoveredFiling[], seenKeys: Iterable<string>): IncrementalOutcome {
  const seen = new Set(seenKeys);
  const fresh: DiscoveredFiling[] = [];
  const alreadyKnown: DiscoveredFiling[] = [];
  for (const filing of filings) {
    if (seen.has(filing.stableKey)) alreadyKnown.push(filing);
    else fresh.push(filing);
  }
  return { fresh, alreadyKnown };
}

/**
 * Identify amendments and link each to the filing it amends.
 *
 * A filing is treated as an amendment when the source says so, or when its own
 * text marks it as one. The link is set only when a plausible original exists
 * in the same batch; otherwise the relationship is left null rather than
 * guessed at.
 */
export function detectAmendments(filings: DiscoveredFiling[]): DiscoveredFiling[] {
  const byType = new Map<string, DiscoveredFiling[]>();
  for (const filing of filings) {
    if (!filing.filingType) continue;
    const key = `${filing.identifiers.companyId ?? filing.companyName ?? ""}::${filing.filingType.toUpperCase()}`;
    const list = byType.get(key) ?? [];
    list.push(filing);
    byType.set(key, list);
  }

  return filings.map((filing) => {
    if (!filing.isAmendment) return filing;
    if (filing.amends) return filing;
    const baseType = filing.filingType?.replace(/\/A$/i, "").toUpperCase() ?? "";
    const key = `${filing.identifiers.companyId ?? filing.companyName ?? ""}::${baseType}`;
    const candidates = (byType.get(key) ?? []).filter((candidate) => candidate.stableKey !== filing.stableKey);
    if (!candidates.length) return filing;
    // The most recent non-amendment before this one, when dates are known.
    const ordered = candidates
      .filter((candidate) => !candidate.isAmendment)
      .sort((left, right) => {
        const a = publicationIso(left) ?? "";
        const b = publicationIso(right) ?? "";
        return b.localeCompare(a);
      });
    return { ...filing, amends: ordered[0]?.stableKey ?? null };
  });
}

/** Sort newest-first by publication time, with undated filings last. */
export function sortByPublication(filings: DiscoveredFiling[]): DiscoveredFiling[] {
  return [...filings].sort((left, right) => {
    const a = publicationIso(left);
    const b = publicationIso(right);
    if (a && b) return b.localeCompare(a);
    if (a) return -1;
    if (b) return 1;
    return 0;
  });
}

/** One call that does the whole discovery pass over a fetched batch. */
export function discover(
  filings: DiscoveredFiling[],
  query: DiscoveryQuery,
  options: { page?: number; pageSize?: number; seenKeys?: Iterable<string> } = {},
): { page: Page<DiscoveredFiling>; duplicates: DedupeOutcome["duplicates"]; freshCount: number } {
  const deduped = dedupeFilings(filings);
  const linked = detectAmendments(deduped.unique);
  const filtered = applyDiscoveryFilters(linked, query);
  const sorted = sortByPublication(filtered);
  const fresh = options.seenKeys ? discoverIncremental(sorted, options.seenKeys).fresh.length : sorted.length;
  return {
    page: paginate(sorted, options.page ?? 0, options.pageSize ?? 25),
    duplicates: deduped.duplicates,
    freshCount: fresh,
  };
}
