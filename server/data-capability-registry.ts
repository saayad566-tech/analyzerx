import { getSourceCatalog } from "./source-catalog";

export type CapabilityStatus = "ready" | "partial" | "page-snapshot" | "blocked" | "unavailable";
export type CapabilityCadence = "intraday" | "daily" | "event-driven" | "fortnightly" | "monthly" | "quarterly" | "annual" | "unknown";
export type EvidenceKind = "reported" | "derived" | "estimated" | "inferred";

export type DataLineage = {
  sourceId: string | null;
  sourceName: string;
  sourceUrl: string | null;
  originalDocument: string | null;
  publishedAt: string | null;
  detectedAt: string | null;
  ingestedAt: string | null;
  dataTimestamp: string | null;
  retrievedAt: string | null;
  freshnessStatus: "fresh" | "stale" | "unavailable" | "error";
  confidence: number | null;
  parserVersion: string | null;
  dataHash: string | null;
  evidenceKind: EvidenceKind;
  evidenceStatus: "verified" | "partial" | "unavailable";
};

export type DataCapability = {
  datasetKey: string;
  sourceKey: string;
  sourceName: string;
  organization: string;
  entityScope: "company" | "security" | "sector" | "market" | "macro" | "user";
  category: "identity" | "market" | "fundamental" | "filing" | "flow" | "news" | "event" | "macro" | "operations";
  cadence: CapabilityCadence;
  accessMode: "public" | "configured" | "licensed" | "authenticated" | "internal";
  status: CapabilityStatus;
  parserVersion: string | null;
  freshnessSla: string;
  confidencePolicy: string;
  primaryRank: number;
  storedRecordType: string;
  intelligenceConsumers: string[];
  uiScreens: string[];
  routeQuery: string | null;
  limitations: string;
};

const capabilities: DataCapability[] = [
  {
    datasetKey: "entity-master",
    sourceKey: "nse-equity-universe",
    sourceName: "Canonical entity master",
    organization: "AnalyzerX",
    entityScope: "security",
    category: "identity",
    cadence: "daily",
    accessMode: "internal",
    status: "partial",
    parserVersion: "entity-v1",
    freshnessSla: "daily when the universe collector succeeds",
    confidencePolicy: "Exact exchange/ticker matches are high confidence; aliases require source-backed resolution.",
    primaryRank: 1,
    storedRecordType: "entity-master",
    intelligenceConsumers: ["entity-resolution", "relationship-graph", "search", "stock-profile"],
    uiScreens: ["Stock Profile", "Search", "Graph", "Screener"],
    routeQuery: "market.search",
    limitations: "ISIN/FIGI and corporate-action history remain partial until validated sources resolve them.",
  },
  {
    datasetKey: "nse-announcements",
    sourceKey: "nse-announcements-rss",
    sourceName: "NSE Online Announcements RSS",
    organization: "NSE",
    entityScope: "company",
    category: "filing",
    cadence: "event-driven",
    accessMode: "public",
    status: "ready",
    parserVersion: "nse-rss-v1",
    freshnessSla: "event-driven; checked by the collector cadence",
    confidencePolicy: "Official RSS item with original URL and GUID is verified; symbol resolution may be partial.",
    primaryRank: 1,
    storedRecordType: "corporate-announcement",
    intelligenceConsumers: ["event-intelligence", "smart-alerts", "news-ranking", "history"],
    uiScreens: ["News", "Stock Profile", "Filings", "Alerts", "History", "Search"],
    routeQuery: "sources.latest",
    limitations: "RSS access can be intermittently protected; unresolved symbols are not promoted to eligible alerts.",
  },
  {
    datasetKey: "nse-fii-dii",
    sourceKey: "nse-fii-dii",
    sourceName: "NSE FII/FPI + DII report",
    organization: "NSE",
    entityScope: "market",
    category: "flow",
    cadence: "daily",
    accessMode: "public",
    status: "partial",
    parserVersion: "nse-flow-v1",
    freshnessSla: "daily report period",
    confidencePolicy: "Aggregate official report values are verified for the stated report date.",
    primaryRank: 1,
    storedRecordType: "institutional-flow-report",
    intelligenceConsumers: ["flow-comparison", "sector-context", "research-context"],
    uiScreens: ["Market Flows", "Sectors", "Research", "History"],
    routeQuery: "market.institutionalFlows",
    limitations: "Aggregate FII/DII data is not stock-level sector buying and is unavailable when the official report cannot be fetched.",
  },
  {
    datasetKey: "nsdl-fpi-sector",
    sourceKey: "nsdl-fpi-sector",
    sourceName: "NSDL fortnightly sector-wise FPI",
    organization: "NSDL",
    entityScope: "sector",
    category: "flow",
    cadence: "fortnightly",
    accessMode: "public",
    status: "partial",
    parserVersion: "nsdl-fpi-v1",
    freshnessSla: "fortnightly disclosure period",
    confidencePolicy: "Only parsed disclosure-period values with source hash and report date are verified.",
    primaryRank: 1,
    storedRecordType: "sector-fpi-disclosure",
    intelligenceConsumers: ["sector-context", "flow-comparison", "research-context"],
    uiScreens: ["Market Flows", "Sectors", "Stock Profile", "Reports"],
    routeQuery: "sources.latest",
    limitations: "Does not provide DII sector flows or intraday trading activity.",
  },
  {
    datasetKey: "amfi-portfolio-disclosure",
    sourceKey: "amfi-portfolio-disclosure",
    sourceName: "AMFI mutual-fund portfolio disclosure",
    organization: "AMFI",
    entityScope: "security",
    category: "flow",
    cadence: "quarterly",
    accessMode: "public",
    status: "partial",
    parserVersion: "amfi-portfolio-v1",
    freshnessSla: "disclosure-period based",
    confidencePolicy: "Holdings are verified only for the published portfolio period; changes require two dated disclosures.",
    primaryRank: 1,
    storedRecordType: "mutual-fund-portfolio-disclosure",
    intelligenceConsumers: ["ownership-context", "flow-comparison", "research-context"],
    uiScreens: ["Market Flows", "Stock Profile", "Screener", "Reports"],
    routeQuery: "sources.latest",
    limitations: "Not a real-time mutual-fund buy/sell feed.",
  },
  {
    datasetKey: "official-filings-pages",
    sourceKey: "nse-filings",
    sourceName: "Official NSE/BSE/SEBI/company filing pages",
    organization: "NSE/BSE/SEBI/Company IR",
    entityScope: "company",
    category: "filing",
    cadence: "event-driven",
    accessMode: "public",
    status: "page-snapshot",
    parserVersion: "official-page-v1",
    freshnessSla: "collector retrieval time",
    confidencePolicy: "Page metadata/table is partial; a document-level fact requires an original document link and validated parser.",
    primaryRank: 1,
    storedRecordType: "official-source-page",
    intelligenceConsumers: ["event-intelligence", "research-evidence", "risk-events"],
    uiScreens: ["Filings", "Stock Profile", "News", "Reports", "Search"],
    routeQuery: "sources.latest",
    limitations: "Dynamic/protected pages remain snapshots and are not treated as structured records.",
  },
  {
    datasetKey: "news-aggregates",
    sourceKey: "finnhub",
    sourceName: "Configured news providers and public RSS",
    organization: "Finnhub/News/RSS/GDELT",
    entityScope: "company",
    category: "news",
    cadence: "event-driven",
    accessMode: "configured",
    status: "partial",
    parserVersion: "news-normalized-v1",
    freshnessSla: "provider-specific; tracker polling cadence",
    confidencePolicy: "Original article URL and publication time are required; secondary news is lower priority than official filings.",
    primaryRank: 3,
    storedRecordType: "news-event",
    intelligenceConsumers: ["sentiment", "event-intelligence", "smart-alerts", "recommendations", "history"],
    uiScreens: ["News", "Live Events", "Stock Profile", "Alerts", "Search", "History"],
    routeQuery: "news.latest/news.stock",
    limitations: "Provider rate limits, delays, licensing, and coverage vary; no source is assumed universal.",
  },
  {
    datasetKey: "market-observations",
    sourceKey: "licensed-market-data",
    sourceName: "Price, OHLC, volume, and market-cap providers",
    organization: "Licensed provider/Finnhub/Yahoo fallback",
    entityScope: "security",
    category: "market",
    cadence: "intraday",
    accessMode: "licensed",
    status: "partial",
    parserVersion: "market-observation-v1",
    freshnessSla: "provider-specific; quote timestamp is displayed",
    confidencePolicy: "Reported quote/OHLC values retain provider and timestamp; derived values are labeled.",
    primaryRank: 1,
    storedRecordType: "market-observation",
    intelligenceConsumers: ["technical-analysis", "valuation", "event-impact", "screening"],
    uiScreens: ["Stock Profile", "Analysis", "Screener", "Flows", "Reports"],
    routeQuery: "market.snapshot",
    limitations: "No exchange-grade or live options claim without a provider contract and successful response.",
  },
  {
    datasetKey: "fundamental-observations",
    sourceKey: "fundamental-analysis",
    sourceName: "Statements, filings, company IR, SEC, and fallback fundamentals",
    organization: "NSE/Company IR/SEC/Finnhub/Public fallback",
    entityScope: "company",
    category: "fundamental",
    cadence: "quarterly",
    accessMode: "configured",
    status: "partial",
    parserVersion: "fundamental-evidence-v1",
    freshnessSla: "statement/report period dependent",
    confidencePolicy: "Reported values outrank derived values; estimated/sector-baseline values are explicitly labeled.",
    primaryRank: 1,
    storedRecordType: "fundamental-observation",
    intelligenceConsumers: ["five-pillar-score", "multibagger-thesis", "valuation", "research-ai", "screening"],
    uiScreens: ["Stock Profile", "Analysis", "Screener", "Multibagger", "Reports", "Search"],
    routeQuery: "market.fundamentals/market.report",
    limitations: "Historical completeness varies by issuer and source; missing values are not fabricated.",
  },
];

export function getDataCapabilities(): DataCapability[] {
  const catalog = new Map(getSourceCatalog().map((source) => [source.key, source]));
  return capabilities.map((capability) => ({
    ...capability,
    status: capability.status === "ready" && !catalog.get(capability.sourceKey)?.url ? "unavailable" : capability.status,
  }));
}

export function getDataCapabilityMatrix() {
  return getDataCapabilities().map((capability) => ({
    dataset: capability.datasetKey,
    source: capability.sourceName,
    imported: capability.status === "ready" || capability.status === "partial" || capability.status === "page-snapshot",
    stored: Boolean(capability.storedRecordType),
    intelligenceUsed: capability.intelligenceConsumers.length > 0,
    uiDisplayed: capability.uiScreens.length > 0,
    feature: capability.category,
    freshness: capability.freshnessSla,
    confidence: capability.confidencePolicy,
    limitation: capability.limitations,
    status: capability.status,
    routeQuery: capability.routeQuery,
  }));
}

export function lineageFromSourceRecord(record: {
  id: string;
  sourceKey: string;
  sourceUrl: string;
  publishedAt?: Date | string | null;
  retrievedAt?: Date | string | null;
  reportDate?: Date | string | null;
  freshnessStatus: "fresh" | "stale" | "unavailable" | "error";
  dataHash?: string | null;
  parserVersion?: string | null;
  normalizedPayload?: string | null;
  title?: string | null;
}): DataLineage {
  const source = getSourceCatalog().find((item) => item.key === record.sourceKey);
  const asIso = (value?: Date | string | null) => value instanceof Date ? value.toISOString() : value ?? null;
  return {
    sourceId: record.id,
    sourceName: source?.name ?? record.sourceKey,
    sourceUrl: record.sourceUrl,
    originalDocument: record.sourceUrl,
    publishedAt: asIso(record.publishedAt),
    detectedAt: asIso(record.retrievedAt),
    ingestedAt: asIso(record.retrievedAt),
    dataTimestamp: asIso(record.reportDate ?? record.publishedAt ?? record.retrievedAt),
    retrievedAt: asIso(record.retrievedAt),
    freshnessStatus: record.freshnessStatus,
    confidence: record.freshnessStatus === "fresh" ? 0.85 : record.freshnessStatus === "stale" ? 0.55 : null,
    parserVersion: record.parserVersion ?? null,
    dataHash: record.dataHash ?? null,
    evidenceKind: record.normalizedPayload ? "reported" : "inferred",
    evidenceStatus: record.freshnessStatus === "fresh" ? "verified" : record.freshnessStatus === "stale" ? "partial" : "unavailable",
  };
}
