/**
 * Honest per-market, per-category coverage.
 *
 * The problem this fixes: every market except India was labelled "PLANNED" with a
 * blanket note that everything "remains pending". That was both inaccurate and
 * unhelpful — quotes, news and macro genuinely work today for every listed market
 * through free, key-less public sources, while some categories are genuinely
 * gated. A single word per market cannot express that.
 *
 * So coverage is declared PER CATEGORY, from the source that actually serves it:
 *
 *   available    a free, key-less source serves this today
 *   partial      a free source exists but coverage is uneven or needs a free key
 *   portal       an official portal exists but has no machine-readable endpoint
 *   licensed     only commercial market-data vendors supply it
 *
 * Grounding (verified before writing this module):
 *   - Yahoo v8 chart endpoint: free, no key, global equities/ETFs/indices; the
 *     only requirement is a browser-like User-Agent, not authentication.
 *   - SEC EDGAR data.sec.gov: free, NO API key, JSON; requires a declared
 *     User-Agent. It sends no CORS headers, which blocks browsers but NOT React
 *     Native, so it is usable on-device.
 *   - World Bank Indicators API v2: free, no key, JSON via format=json, covers
 *     every country by ISO2 code.
 *   - Google News RSS: free per-country feeds via gl/ceid parameters.
 *
 * A category is never marked `available` because a source merely exists. It is
 * marked available when a free source can be called without a key from the device.
 */

import { SUPPORTED_MARKET_IDS, type SupportedMarketId } from "./market-registry";

export type CoverageStatus = "available" | "partial" | "portal" | "licensed";

export type CoverageCategory =
  | "quotes"
  | "news"
  | "macro"
  | "fundamentals"
  | "filings"
  | "flows"
  | "options";

export type CategoryCoverage = {
  category: CoverageCategory;
  status: CoverageStatus;
  /** The concrete source(s) that back this status. */
  sources: string[];
  /** One honest sentence a user can read. */
  note: string;
};

export type MarketCoverage = {
  marketId: SupportedMarketId;
  categories: CategoryCoverage[];
  /** Count of categories that are genuinely available today. */
  availableCount: number;
  /** Derived headline label. */
  coverage: "deep" | "broad" | "standard";
};

const CATEGORY_LABELS: Record<CoverageCategory, string> = {
  quotes: "quotes",
  news: "news",
  macro: "macro",
  fundamentals: "fundamentals",
  filings: "filings",
  flows: "institutional flows",
  options: "options",
};

/** Categories served for every listed market by free, key-less sources. */
function universalCategories(): CategoryCoverage[] {
  return [
    {
      category: "quotes",
      status: "available",
      sources: ["Yahoo Finance chart API"],
      note: "Delayed quotes and OHLC history for this market's listed symbols, free and key-less. Not an exchange real-time feed.",
    },
    {
      category: "news",
      status: "available",
      sources: ["Google News RSS", "publisher RSS"],
      note: "Country-scoped news feeds, refreshed on a bounded interval.",
    },
    {
      category: "macro",
      status: "available",
      sources: ["World Bank Indicators API v2"],
      note: "National accounts, inflation, rates and market-capitalisation indicators for this country.",
    },
  ];
}

/** Per-market additions and overrides. */
const MARKET_SPECIFIC: Record<SupportedMarketId, Partial<Record<CoverageCategory, CategoryCoverage>>> = {
  IN: {
    quotes: {
      category: "quotes",
      status: "available",
      sources: ["NSE archives", "Yahoo Finance chart API"],
      note: "Index constituents, equity master and quotes from NSE plus a key-less fallback.",
    },
    fundamentals: {
      category: "fundamentals",
      status: "available",
      sources: ["Yahoo Finance timeseries", "NSE archives"],
      note: "Statement history and ratios for the listed universe.",
    },
    filings: {
      category: "filings",
      status: "available",
      sources: ["NSE/BSE announcements", "SEBI"],
      note: "Exchange announcements and regulatory disclosures.",
    },
    flows: {
      category: "flows",
      status: "available",
      sources: ["NSE FII/DII archives"],
      note: "Daily foreign and domestic institutional net flows.",
    },
    options: {
      category: "options",
      status: "available",
      sources: ["NSE option chain"],
      note: "Index and equity option chains.",
    },
  },
  US: {
    fundamentals: {
      category: "fundamentals",
      status: "partial",
      sources: ["SEC XBRL company facts", "Yahoo Finance timeseries"],
      note: "Filings-derived financial facts plus a key-less fallback; not every issuer tags every concept.",
    },
    filings: {
      category: "filings",
      status: "available",
      sources: ["SEC EDGAR submissions API", "SEC XBRL frames"],
      note: "Full filing history and structured financial facts. Free and key-less; the API asks only for a declared User-Agent.",
    },
    flows: {
      category: "flows",
      status: "available",
      sources: ["SEC EDGAR 13F filings"],
      note: "Quarterly institutional holdings from 13F filings. Quarterly cadence, not daily.",
    },
    options: {
      category: "options",
      status: "partial",
      sources: ["Yahoo Finance options chain"],
      note: "Option chains are available but delayed and limited to listed expiries.",
    },
  },
  GB: {
    filings: {
      category: "filings",
      status: "portal",
      sources: ["FCA National Storage Mechanism"],
      note: "Regulated disclosures are published on the FCA NSM portal. There is no public machine-readable endpoint, so the app links to it rather than claiming a feed.",
    },
  },
  CA: {
    filings: {
      category: "filings",
      status: "portal",
      sources: ["SEDAR+"],
      note: "The national filing system is a portal with no free public API; documents are linked, not parsed.",
    },
  },
  AU: {
    filings: {
      category: "filings",
      status: "portal",
      sources: ["ASX announcements"],
      note: "Announcements are published on the ASX platform. The free surface is a portal, not a documented API.",
    },
  },
  JP: {
    filings: {
      category: "filings",
      status: "partial",
      sources: ["EDINET API v2"],
      note: "EDINET is free and machine-readable but requires a free registered subscription key, so it is inert until a key is configured.",
    },
  },
  SG: {
    filings: {
      category: "filings",
      status: "portal",
      sources: ["SGX announcements"],
      note: "Announcements and annual reports are on the SGX portal with no free public API.",
    },
  },
  HK: {
    filings: {
      category: "filings",
      status: "portal",
      sources: ["HKEXnews"],
      note: "Corporate announcements are on HKEXnews. The portal is bilingual and has no documented free API.",
    },
  },
  DE: {
    filings: {
      category: "filings",
      status: "partial",
      sources: ["ESEF filings (filings.xbrl.org)"],
      note: "EU electronic issuer reports are published in XBRL and are machine-readable, with coverage limited to issuers that have filed under ESEF.",
    },
  },
  FR: {
    filings: {
      category: "filings",
      status: "partial",
      sources: ["ESEF filings (filings.xbrl.org)", "AMF"],
      note: "EU electronic issuer reports are machine-readable; AMF notices are portal-only.",
    },
  },
};

/** Categories that are licensed-only everywhere they are not otherwise provided. */
const LICENSED_FALLBACKS: Partial<Record<CoverageCategory, CategoryCoverage>> = {
  fundamentals: {
    category: "fundamentals",
    status: "partial",
    sources: ["Yahoo Finance timeseries"],
    note: "Key-less statement data with uneven per-issuer coverage.",
  },
  filings: {
    category: "filings",
    status: "portal",
    sources: ["national regulator portal"],
    note: "Disclosures exist on the national portal but have no free machine-readable endpoint wired here.",
  },
  flows: {
    category: "flows",
    status: "licensed",
    sources: ["licensed market-data vendor"],
    note: "Institutional flow data for this market is not published free; no value is shown rather than a proxy from another market.",
  },
  options: {
    category: "options",
    status: "licensed",
    sources: ["licensed derivatives feed"],
    note: "Option chains for this market require a licensed derivatives feed.",
  },
};

const ALL_CATEGORIES: CoverageCategory[] = ["quotes", "news", "macro", "fundamentals", "filings", "flows", "options"];

/** Build the honest category list for one market. */
export function coverageForMarket(marketId: string): MarketCoverage {
  const id = marketId.trim().toUpperCase() as SupportedMarketId;
  const known = (SUPPORTED_MARKET_IDS as readonly string[]).includes(id);
  const universal = universalCategories();
  const specific = known ? MARKET_SPECIFIC[id] : {};

  const categories: CategoryCoverage[] = ALL_CATEGORIES.map((category) => {
    const override = specific[category];
    if (override) return override;
    const base = universal.find((entry) => entry.category === category);
    if (base) return base;
    return LICENSED_FALLBACKS[category] ?? {
      category,
      status: "licensed" as CoverageStatus,
      sources: [],
      note: "No free source is wired for this category.",
    };
  });

  const availableCount = categories.filter((entry) => entry.status === "available").length;
  const coverage: MarketCoverage["coverage"] = id === "IN" ? "deep" : id === "US" ? "broad" : "standard";
  return { marketId: id, categories, availableCount, coverage };
}

/** The categories that genuinely work today for a market. */
export function availableCategories(marketId: string): CoverageCategory[] {
  return coverageForMarket(marketId)
    .categories.filter((entry) => entry.status === "available")
    .map((entry) => entry.category);
}

/** One-line honest summary, e.g. "5 of 7 categories live". */
export function coverageSummary(marketId: string): string {
  const market = coverageForMarket(marketId);
  const total = market.categories.length;
  const live = market.availableCount;
  const gated = market.categories.filter((entry) => entry.status !== "available").length;
  return `${live} of ${total} categories live · ${gated} gated`;
}

/** Human label for a coverage category. */
export function categoryLabel(category: CoverageCategory): string {
  return CATEGORY_LABELS[category];
}

/** Colour-agnostic tone for a status, so UI layers stay consistent. */
export function coverageTone(status: CoverageStatus): "good" | "warn" | "muted" {
  if (status === "available") return "good";
  if (status === "partial") return "warn";
  return "muted";
}
