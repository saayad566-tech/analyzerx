/**
 * Company search for Indian listed companies (guidance: "a company search for
 * Indian listed companies" as the first piece of the implementation).
 *
 * The search runs entirely against the pinned NSE Nifty-500 constituent
 * snapshot that already ships with the app, so it works offline and does not
 * touch any source at search time. The snapshot is a verbatim capture of the
 * official NSE index constituent list; nothing in it is invented, and each hit
 * carries the ISIN so a match can be checked against an official identifier
 * rather than a name that may collide.
 */

import { FALLBACK_UNIVERSE, UNIVERSE_SNAPSHOT_DATE, UNIVERSE_SNAPSHOT_SOURCE } from "../open-data/universe-fallback";

export type CompanySearchHit = {
  symbol: string;
  name: string;
  industry: string;
  isin: string;
  /** Why this hit ranked where it did, so the ordering is explainable. */
  matchKind: "exact_symbol" | "symbol_prefix" | "name_prefix" | "name_contains" | "industry";
};

export const COMPANY_UNIVERSE_SIZE = FALLBACK_UNIVERSE.length;
export const COMPANY_UNIVERSE_SNAPSHOT = { date: UNIVERSE_SNAPSHOT_DATE, source: UNIVERSE_SNAPSHOT_SOURCE };

function classify(symbol: string, name: string, industry: string, needle: string): CompanySearchHit["matchKind"] | null {
  const sym = symbol.toLowerCase();
  const nm = name.toLowerCase();
  if (sym === needle) return "exact_symbol";
  if (sym.startsWith(needle)) return "symbol_prefix";
  // Word-boundary prefix on the company name, so "tata" finds "Tata Motors"
  // before it finds "Tatva Chintan".
  if (nm.split(/[\s.&,-]+/).some((word) => word.startsWith(needle))) return "name_prefix";
  if (nm.includes(needle)) return "name_contains";
  if (industry.toLowerCase().includes(needle)) return "industry";
  return null;
}

const RANK: Record<CompanySearchHit["matchKind"], number> = {
  exact_symbol: 0,
  symbol_prefix: 1,
  name_prefix: 2,
  name_contains: 3,
  industry: 4,
};

/**
 * Search the Indian listed-company universe by symbol, name or industry.
 * Returns an empty array rather than a fabricated match when nothing fits.
 */
export function searchIndianCompanies(query: string, limit = 12): CompanySearchHit[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const hits: CompanySearchHit[] = [];
  for (const security of FALLBACK_UNIVERSE) {
    const kind = classify(security.symbol, security.name, security.industry, needle);
    if (!kind) continue;
    hits.push({ symbol: security.symbol, name: security.name, industry: security.industry, isin: security.isin, matchKind: kind });
  }
  return hits
    .sort((left, right) => {
      const byKind = RANK[left.matchKind] - RANK[right.matchKind];
      if (byKind !== 0) return byKind;
      return left.name.length - right.name.length || left.name.localeCompare(right.name);
    })
    .slice(0, limit);
}

/** The single best match for a query, or null when nothing is close enough. */
export function resolveIndianCompany(query: string): CompanySearchHit | null {
  return searchIndianCompanies(query, 1)[0] ?? null;
}

/** Industry distribution of the snapshot, for a quick browse row. */
export function industriesInUniverse(limit = 20): { industry: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const security of FALLBACK_UNIVERSE) {
    const industry = security.industry?.trim() || "Unclassified";
    counts.set(industry, (counts.get(industry) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([industry, count]) => ({ industry, count }))
    .sort((left, right) => right.count - left.count || left.industry.localeCompare(right.industry))
    .slice(0, limit);
}
