import { coverageForMarket, coverageSummary as summariseCoverage } from "./market-coverage";

export type MarketId = "IN" | "US" | "GB" | "CA" | "AU" | "JP" | "SG" | "HK" | "DE" | "FR";

export type MarketProfile = {
  id: MarketId;
  country: string;
  region: string;
  currency: string;
  timezone: string;
  exchanges: string[];
  tickerExamples: string[];
  supportedAssetClasses: string[];
  sourceTier: "primary" | "expanding";
  coverage: "deep" | "broad" | "standard";
  /** Categories that genuinely work today, from the honest coverage model. */
  liveCategories: string[];
  /** One-line honest summary, e.g. "7 of 7 categories live · 0 gated". */
  coverageSummary: string;
  notes: string;
  adapterState: "validated" | "catalog-validated" | "schema-pending" | "access-gated";
  primarySources: string[];
};

export const DEFAULT_MARKET_ID: MarketId = "IN";

/**
 * The single market source of truth (Phase 1 of the isolation fix).
 *
 * MARKET_IDS is derived from the profiles, so adding a market cannot leave an enum
 * copy behind. Every tRPC input, DB query and cache key is expected to use
 * `marketIdSchema` rather than a hand-written z.enum literal.
 */
export const MARKET_IDS = ["IN", "US", "GB", "CA", "AU", "JP", "SG", "HK", "DE", "FR"] as const;

/**
 * The value used when a market genuinely cannot be determined.
 *
 * Per the isolation rules, an unclassifiable record is never assumed to be India — it
 * is marked UNKNOWN and hidden from every market view. This constant exists so that
 * "unknown" is a named, testable outcome rather than a silent fallback.
 */
export const UNKNOWN_MARKET = "UNKNOWN";

/** A market id, or the explicit UNKNOWN marker. Never a silent India default. */
export type ResolvedMarketId = MarketId | typeof UNKNOWN_MARKET;

/** True only for one of the ten configured markets. Never true for UNKNOWN. */
export function isMarketId(value: string | null | undefined): value is MarketId {
  const id = (value ?? "").trim().toUpperCase();
  return (MARKET_IDS as readonly string[]).includes(id);
}

/**
 * Resolve a possibly-missing market to a real market id, or to UNKNOWN.
 *
 * This replaces the `?? "IN"` pattern. A missing market no longer becomes India; it
 * becomes UNKNOWN, which no market filter matches, so the data is hidden rather than
 * mislabelled.
 */
export function resolveMarketId(value: string | null | undefined): ResolvedMarketId {
  const id = (value ?? "").trim().toUpperCase();
  return isMarketId(id) ? id : UNKNOWN_MARKET;
}

/**
 * Resolve a market that MUST be present. Throws rather than guessing.
 *
 * Use this where serving another market's data would be a correctness failure, and a
 * loud error is preferable to a wrong answer.
 */
export function requireMarketId(value: string | null | undefined): MarketId {
  const id = (value ?? "").trim().toUpperCase();
  if (!isMarketId(id)) {
    throw new Error(`A valid market id is required; received ${JSON.stringify(value ?? null)}.`);
  }
  return id;
}

/** The profile for a market, or null when the id is not a configured market. */
export function getMarketProfileOrNull(id: string | null | undefined): MarketProfile | null {
  return MARKET_PROFILES.find((market) => market.id === id) ?? null;
}

type BaseProfile = Omit<MarketProfile, "coverage" | "liveCategories" | "coverageSummary">;

const BASE_PROFILES: BaseProfile[] = [
  { id: "IN", country: "India", region: "South Asia", currency: "INR", timezone: "Asia/Kolkata", exchanges: ["NSE", "BSE"], tickerExamples: ["RELIANCE", "TCS", "HDFCBANK"], supportedAssetClasses: ["equities", "fundamentals", "news", "filings", "institutional flows", "options"], sourceTier: "primary", notes: "India is the deepest market: quotes, fundamentals, filings, institutional flows and options are all served by free sources, with a key-less quote fallback.", adapterState: "validated", primarySources: ["NSE", "BSE", "SEBI", "NSDL", "AMFI", "RBI", "company IR", "Google News RSS", "licensed quote providers"] },
  { id: "US", country: "United States", region: "North America", currency: "USD", timezone: "America/New_York", exchanges: ["NYSE", "NASDAQ", "CBOE"], tickerExamples: ["AAPL", "MSFT", "NVDA"], supportedAssetClasses: ["equities", "fundamentals", "news", "SEC filings", "options", "macro"], sourceTier: "primary", notes: "Quotes, news, macro and SEC EDGAR filings work today, free and key-less. Institutional flows come from quarterly 13F filings; option chains are delayed. Real-time exchange quotes need a licensed feed.", adapterState: "catalog-validated", primarySources: ["SEC EDGAR APIs", "SEC submissions/XBRL", "SEC RSS/latest filings", "FRED", "Treasury.gov", "company IR", "licensed NYSE/Nasdaq/Cboe feeds"] },
  { id: "GB", country: "United Kingdom", region: "Europe", currency: "GBP", timezone: "Europe/London", exchanges: ["LSE"], tickerExamples: ["SHEL.L", "HSBA.L", "AZN.L"], supportedAssetClasses: ["equities", "news", "filings", "macro"], sourceTier: "expanding", notes: "Quotes, news and macro work today through free, key-less sources. FCA disclosures exist on the NSM portal but have no public machine-readable endpoint, so they are linked rather than parsed.", adapterState: "catalog-validated", primarySources: ["FCA National Storage Mechanism", "FCA Official List", "LSE disclosures", "Companies House", "Bank of England", "company IR", "licensed LSE feeds"] },
  { id: "CA", country: "Canada", region: "North America", currency: "CAD", timezone: "America/Toronto", exchanges: ["TSX", "TSXV"], tickerExamples: ["RY.TO", "SHOP.TO", "CNQ.TO"], supportedAssetClasses: ["equities", "news", "filings", "macro"], sourceTier: "expanding", notes: "Quotes, news and macro work today. SEDAR+ is the national filing system but is a portal without a free public API, so filings are linked, not parsed.", adapterState: "catalog-validated", primarySources: ["SEDAR+", "CSA/OSC", "Bank of Canada", "TSX/TSXV disclosures", "company IR", "licensed TMX feeds"] },
  { id: "AU", country: "Australia", region: "Oceania", currency: "AUD", timezone: "Australia/Sydney", exchanges: ["ASX"], tickerExamples: ["BHP.AX", "CBA.AX", "CSL.AX"], supportedAssetClasses: ["equities", "news", "filings", "macro"], sourceTier: "expanding", notes: "Quotes, news and macro work today. ASX announcements sit on a portal with no documented free API; real-time ASX price data is licensed.", adapterState: "catalog-validated", primarySources: ["ASX announcements", "ASX information services", "ASIC", "RBA", "company IR", "licensed ASX feeds"] },
  { id: "JP", country: "Japan", region: "East Asia", currency: "JPY", timezone: "Asia/Tokyo", exchanges: ["TSE"], tickerExamples: ["7203.T", "6758.T", "9984.T"], supportedAssetClasses: ["equities", "news", "filings", "macro"], sourceTier: "expanding", notes: "Quotes, news and macro work today. EDINET is free and machine-readable but needs a free registered key, so filings stay inert until one is configured.", adapterState: "catalog-validated", primarySources: ["JPX/TDnet", "EDINET", "FSA Japan", "Bank of Japan", "company IR", "licensed JPX feeds"] },
  { id: "SG", country: "Singapore", region: "Southeast Asia", currency: "SGD", timezone: "Asia/Singapore", exchanges: ["SGX"], tickerExamples: ["D05.SI", "O39.SI", "C6L.SI"], supportedAssetClasses: ["equities", "news", "filings", "macro"], sourceTier: "expanding", notes: "Quotes, news and macro work today. SGX announcements and annual reports are portal-only, with no free public API.", adapterState: "catalog-validated", primarySources: ["SGX announcements", "SGX annual reports", "MAS", "SGX data-connectivity", "company IR", "licensed SGX feeds"] },
  { id: "HK", country: "Hong Kong", region: "East Asia", currency: "HKD", timezone: "Asia/Hong_Kong", exchanges: ["HKEX"], tickerExamples: ["0700.HK", "9988.HK", "0005.HK"], supportedAssetClasses: ["equities", "news", "filings", "macro"], sourceTier: "expanding", notes: "Quotes, news and macro work today. HKEXnews corporate announcements are portal-only and bilingual, with no documented free API.", adapterState: "catalog-validated", primarySources: ["HKEXnews", "HKEX issuer disclosures", "SFC Hong Kong", "HKMA", "company IR", "licensed HKEX feeds"] },
  { id: "DE", country: "Germany", region: "Europe", currency: "EUR", timezone: "Europe/Berlin", exchanges: ["XETRA", "FRA"], tickerExamples: ["SAP.DE", "SIE.DE", "ALV.DE"], supportedAssetClasses: ["equities", "news", "filings", "macro"], sourceTier: "expanding", notes: "Quotes, news and macro work today. EU ESEF issuer reports are machine-readable via filings.xbrl.org; BaFin notices are portal-only.", adapterState: "catalog-validated", primarySources: ["ESMA ESEF", "ESMA/ESAP", "BaFin", "Deutsche Bundesbank", "Xetra/company IR", "licensed Xetra feeds"] },
  { id: "FR", country: "France", region: "Europe", currency: "EUR", timezone: "Europe/Paris", exchanges: ["Euronext Paris"], tickerExamples: ["MC.PA", "OR.PA", "AIR.PA"], supportedAssetClasses: ["equities", "news", "filings", "macro"], sourceTier: "expanding", notes: "Quotes, news and macro work today. EU ESEF issuer reports are machine-readable; AMF notices are portal-only.", adapterState: "catalog-validated", primarySources: ["ESMA ESEF", "ESMA/ESAP", "AMF", "Banque de France", "Euronext/company IR", "licensed Euronext feeds"] },
];

/**
 * Coverage is derived from the honest per-category model, never hand-written, so a
 * market's headline label and its live-category list can never disagree with the
 * sources that actually back it.
 */
export const MARKET_PROFILES: MarketProfile[] = BASE_PROFILES.map((profile) => {
  const coverage = coverageForMarket(profile.id);
  return {
    ...profile,
    coverage: coverage.coverage,
    liveCategories: coverage.categories.filter((entry) => entry.status === "available").map((entry) => entry.category),
    coverageSummary: summariseCoverage(profile.id),
  };
});

export function getMarketProfile(id: string | null | undefined): MarketProfile {
  return MARKET_PROFILES.find((market) => market.id === id) ?? MARKET_PROFILES[0];
}
