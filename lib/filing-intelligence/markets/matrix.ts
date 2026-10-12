/**
 * Coverage matrix (Prompt 4, section 6).
 *
 * The matrix is per market, and it is deliberately granular: market, source,
 * data category, access method, last successful check, whether the latest
 * filing was confirmed, current status, last error, licensing restrictions and
 * the manual fallback.
 *
 * One rule is structural rather than cosmetic: there is no function here that
 * returns a single boolean for "this market is covered". The closest thing is
 * a summary that counts the categories actually covered, so a screen cannot
 * render one green badge over a market that is only partly reachable.
 */

import { DATA_CATEGORIES, categoryLabel, costLabel, statusLabel, type DataCategory, type MarketSource, type MarketSourceStatus } from "./types";
import { sourcesForMarket } from "./registry";
import { getMarketProfile, MARKET_PROFILES } from "../../market-regions";

export type CategoryCoverage = {
  category: DataCategory;
  label: string;
  covered: boolean;
  /** The sources in this market that provide it. */
  sources: Array<{ sourceId: string; name: string; status: MarketSourceStatus; accessClass: string; cost: string }>;
  /** What to do when nothing covers it. */
  nextStep: string | null;
};

export type MarketCoverage = {
  marketId: string;
  country: string;
  currency: string;
  /** The market's own sources, and nothing from any other market. */
  sources: MarketSource[];
  categories: CategoryCoverage[];
  summary: {
    sources: number;
    byStatus: Array<{ status: MarketSourceStatus; label: string; count: number }>;
    categoriesTotal: number;
    categoriesCovered: number;
    /** Share of the market's data categories that have a working source. */
    coveragePercent: number;
    /** True only when every category has a working source. */
    fullyCovered: boolean;
    /** Plain-language statement, never a bare "covered". */
    statement: string;
  };
};

const NEXT_STEPS: Partial<Record<DataCategory, string>> = {
  annual_reports: "Open the company's investor-relations page or the exchange filing page and import the report by hand.",
  quarterly_results: "Import the results filing from the exchange page by hand until an automated source is confirmed.",
  shareholding_patterns: "Download the shareholding pattern from the exchange page and import it by hand.",
  corporate_actions: "Check the exchange's corporate-actions page and import the notice by hand.",
  audited_statements: "Import the audited statement from the filing or the company's own site by hand.",
  historical_prices: "Use a source whose free-use terms permit the intended use, or import a downloaded CSV.",
  live_prices: "A live or delayed price feed requires a licensed provider; there is no zero-cost permitted feed.",
  index_data: "Index constituent files are available from the exchange; index levels need a licensed feed.",
  fundamental_ratios: "Compute ratios from imported audited statements; no zero-cost structured source is confirmed.",
  company_metadata: "Import the company master dataset from the open-data portal.",
};

/**
 * Build the coverage for one market, using only that market's sources.
 */
export function buildMarketCoverage(marketId: string): MarketCoverage {
  const profile = getMarketProfile(marketId);
  const sources = sourcesForMarket(marketId);

  const categories: CategoryCoverage[] = DATA_CATEGORIES.map((category) => {
    const providers = sources.filter((entry) => entry.categories.includes(category));
    const working = providers.filter((entry) => entry.status === "connected" || entry.status === "available");
    return {
      category,
      label: categoryLabel(category),
      // "Covered" means a source in THIS market can actually provide it.
      covered: working.length > 0,
      sources: providers.map((entry) => ({ sourceId: entry.sourceId, name: entry.name, status: entry.status, accessClass: entry.accessClass, cost: costLabel(entry.cost) })),
      nextStep: working.length > 0 ? null : NEXT_STEPS[category] ?? "No source for this category has been confirmed for this market.",
    };
  });

  const statusCounts = new Map<MarketSourceStatus, number>();
  for (const entry of sources) statusCounts.set(entry.status, (statusCounts.get(entry.status) ?? 0) + 1);

  const covered = categories.filter((entry) => entry.covered).length;
  const coveragePercent = Math.round((covered / DATA_CATEGORIES.length) * 1000) / 10;

  return {
    marketId,
    country: profile.country,
    currency: profile.currency,
    sources,
    categories,
    summary: {
      sources: sources.length,
      byStatus: [...statusCounts.entries()]
        .map(([status, count]) => ({ status, label: statusLabel(status), count }))
        .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status)),
      categoriesTotal: DATA_CATEGORIES.length,
      categoriesCovered: covered,
      coveragePercent,
      fullyCovered: covered === DATA_CATEGORIES.length,
      statement:
        covered === DATA_CATEGORIES.length
          ? `${profile.country}: all ${DATA_CATEGORIES.length} data categories have a working source.`
          : `${profile.country}: ${covered} of ${DATA_CATEGORIES.length} data categories have a working source (${coveragePercent}%). The rest are listed with the exact next step.`,
    },
  };
}

/** Coverage for every market the app offers, in the app's own market order. */
export function buildAllMarketCoverage(): MarketCoverage[] {
  return MARKET_PROFILES.map((profile) => buildMarketCoverage(profile.id));
}

/**
 * A guard that a set of sources belongs entirely to one market.
 *
 * This is the market-isolation check, and it is used before a refresh runs so a
 * cross-market source can never be fetched by accident.
 */
export function assertMarketIsolation(sources: MarketSource[], marketId: string): { isolated: boolean; offenders: string[] } {
  const offenders = sources.filter((entry) => entry.marketId !== marketId).map((entry) => entry.sourceId);
  return { isolated: offenders.length === 0, offenders };
}

/** One row per source in a market, for the matrix table. */
export function sourceRows(marketId: string): Array<{
  sourceId: string;
  name: string;
  accessClass: string;
  categories: string;
  accessMethod: string;
  status: string;
  lastSuccessfulCheck: string;
  latestFiling: string;
  lastError: string;
  licensing: string;
  manualFallback: string;
  cost: string;
}> {
  return sourcesForMarket(marketId).map((entry) => ({
    sourceId: entry.sourceId,
    name: entry.name,
    accessClass: entry.accessClass,
    categories: entry.categories.map(categoryLabel).join(", "),
    accessMethod: entry.accessMethod,
    status: statusLabel(entry.status),
    lastSuccessfulCheck: entry.lastSuccessfulCheckUtc ?? "none recorded",
    latestFiling: entry.latestFilingConfirmed ? "confirmed" : "not confirmed",
    lastError: entry.lastError ?? "none",
    licensing: entry.licensing,
    manualFallback: entry.manualFallback,
    cost: costLabel(entry.cost),
  }));
}
