import type { MarketId } from "../packages/core-types/src/market";

// Re-exported so existing `@/lib/market-regions` consumers are unaffected.
export type { MarketId };

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
  coverage: "deep" | "broad" | "planned";
  notes: string;
  adapterState: "validated" | "catalog-validated" | "schema-pending" | "access-gated";
  primarySources: string[];
};

export const DEFAULT_MARKET_ID: MarketId = "IN";

export const MARKET_PROFILES: MarketProfile[] = [
  { id: "IN", country: "India", region: "South Asia", currency: "INR", timezone: "Asia/Kolkata", exchanges: ["NSE", "BSE"], tickerExamples: ["RELIANCE", "TCS", "HDFCBANK"], supportedAssetClasses: ["equities", "fundamentals", "news", "filings", "institutional flows", "options"], sourceTier: "primary", coverage: "deep", notes: "Primary AnalyzerX market with NSE, BSE, SEBI, NSDL, AMFI, company-IR, news, and validated fallback coverage.", adapterState: "validated", primarySources: ["NSE", "BSE", "SEBI", "NSDL", "AMFI", "RBI", "company IR", "Google News RSS", "licensed quote providers"] },
  { id: "US", country: "United States", region: "North America", currency: "USD", timezone: "America/New_York", exchanges: ["NYSE", "NASDAQ", "CBOE"], tickerExamples: ["AAPL", "MSFT", "NVDA"], supportedAssetClasses: ["equities", "fundamentals", "news", "SEC filings", "options", "macro"], sourceTier: "primary", coverage: "broad", notes: "SEC EDGAR official APIs and filings are catalog-validated; quote, options, and news adapters remain separately gated by source and licensing.", adapterState: "catalog-validated", primarySources: ["SEC EDGAR APIs", "SEC submissions/XBRL", "SEC RSS/latest filings", "FRED", "Treasury.gov", "company IR", "licensed NYSE/Nasdaq/Cboe feeds"] },
  { id: "GB", country: "United Kingdom", region: "Europe", currency: "GBP", timezone: "Europe/London", exchanges: ["LSE"], tickerExamples: ["SHEL.L", "HSBA.L", "AZN.L"], supportedAssetClasses: ["equities", "news", "filings", "macro"], sourceTier: "expanding", coverage: "planned", notes: "FCA National Storage Mechanism is catalog-validated for regulated disclosures; market-data and issuer-resolution schemas remain pending.", adapterState: "catalog-validated", primarySources: ["FCA National Storage Mechanism", "FCA Official List", "LSE disclosures", "Companies House", "Bank of England", "company IR", "licensed LSE feeds"] },
  { id: "CA", country: "Canada", region: "North America", currency: "CAD", timezone: "America/Toronto", exchanges: ["TSX", "TSXV"], tickerExamples: ["RY.TO", "SHOP.TO", "CNQ.TO"], supportedAssetClasses: ["equities", "news", "filings", "macro"], sourceTier: "expanding", coverage: "planned", notes: "SEDAR+ is catalog-validated as the national filing system; public parser, issuer-resolution, and market-data cadence validation remain pending.", adapterState: "catalog-validated", primarySources: ["SEDAR+", "CSA/OSC", "Bank of Canada", "TSX/TSXV disclosures", "company IR", "licensed TMX feeds"] },
  { id: "AU", country: "Australia", region: "Oceania", currency: "AUD", timezone: "Australia/Sydney", exchanges: ["ASX"], tickerExamples: ["BHP.AX", "CBA.AX", "CSL.AX"], supportedAssetClasses: ["equities", "news", "filings", "macro"], sourceTier: "expanding", coverage: "planned", notes: "ASX announcements and price-data products are catalog-validated; public real-time access, ASIC filings, and parser cadence remain gated.", adapterState: "catalog-validated", primarySources: ["ASX announcements", "ASX information services", "ASIC", "RBA", "company IR", "licensed ASX feeds"] },
  { id: "JP", country: "Japan", region: "East Asia", currency: "JPY", timezone: "Asia/Tokyo", exchanges: ["TSE"], tickerExamples: ["7203.T", "6758.T", "9984.T"], supportedAssetClasses: ["equities", "news", "filings", "macro"], sourceTier: "expanding", coverage: "planned", notes: "JPX/TDnet disclosures are catalog-validated; EDINET, Japanese-language parsing, fiscal-period normalization, and quotes remain pending.", adapterState: "catalog-validated", primarySources: ["JPX/TDnet", "EDINET", "FSA Japan", "Bank of Japan", "company IR", "licensed JPX feeds"] },
  { id: "SG", country: "Singapore", region: "Southeast Asia", currency: "SGD", timezone: "Asia/Singapore", exchanges: ["SGX"], tickerExamples: ["D05.SI", "O39.SI", "C6L.SI"], supportedAssetClasses: ["equities", "news", "filings", "macro"], sourceTier: "expanding", coverage: "planned", notes: "SGX annual-report and announcement surfaces are catalog-validated; ACRA, issuer resolution, and quote licensing remain pending.", adapterState: "catalog-validated", primarySources: ["SGX announcements", "SGX annual reports", "MAS", "SGX data-connectivity", "company IR", "licensed SGX feeds"] },
  { id: "HK", country: "Hong Kong", region: "East Asia", currency: "HKD", timezone: "Asia/Hong_Kong", exchanges: ["HKEX"], tickerExamples: ["0700.HK", "9988.HK", "0005.HK"], supportedAssetClasses: ["equities", "news", "filings", "macro"], sourceTier: "expanding", coverage: "planned", notes: "HKEXnews corporate announcements are catalog-validated; bilingual parsing, issuer resolution, and market-data licensing remain pending.", adapterState: "catalog-validated", primarySources: ["HKEXnews", "HKEX issuer disclosures", "SFC Hong Kong", "HKMA", "company IR", "licensed HKEX feeds"] },
  { id: "DE", country: "Germany", region: "Europe", currency: "EUR", timezone: "Europe/Berlin", exchanges: ["XETRA", "FRA"], tickerExamples: ["SAP.DE", "SIE.DE", "ALV.DE"], supportedAssetClasses: ["equities", "news", "filings", "macro"], sourceTier: "expanding", coverage: "planned", notes: "EU ESEF reporting is catalog-validated for electronic issuer reports; BaFin, exchange, German-language parsing, and quotes remain pending.", adapterState: "catalog-validated", primarySources: ["ESMA ESEF", "ESMA/ESAP", "BaFin", "Deutsche Bundesbank", "Xetra/company IR", "licensed Xetra feeds"] },
  { id: "FR", country: "France", region: "Europe", currency: "EUR", timezone: "Europe/Paris", exchanges: ["Euronext Paris"], tickerExamples: ["MC.PA", "OR.PA", "AIR.PA"], supportedAssetClasses: ["equities", "news", "filings", "macro"], sourceTier: "expanding", coverage: "planned", notes: "EU ESEF and AMF/Euronext surfaces are catalog-validated; French-language parsing, issuer resolution, and quotes remain pending.", adapterState: "catalog-validated", primarySources: ["ESMA ESEF", "ESMA/ESAP", "AMF", "Banque de France", "Euronext/company IR", "licensed Euronext feeds"] },
];

export function getMarketProfile(id: string | null | undefined): MarketProfile {
  return MARKET_PROFILES.find((market) => market.id === id) ?? MARKET_PROFILES[0];
}
