/**
 * Per-market source registry (Prompt 4, sections 1, 3, 5).
 *
 * Every source belongs to exactly one market, and every market's coverage is
 * described only by its own sources. This is the structure that stops markets
 * from mixing: a refresh for one market reads that market's sources and nothing
 * else.
 *
 * The classifications are honest. Sources with a working adapter say so;
 * sources that are declared but not implemented say that too, with the exact
 * dependency. A market is never presented as covered because a neighbouring
 * market is.
 */

import type { MarketSource, DataCategory } from "./types";

type Seed = Omit<MarketSource, "lastSuccessfulCheckUtc" | "lastError">;

const VERIFIED_UTC = null; // no check time is recorded, so health is never asserted

function source(seed: Seed): MarketSource {
  return { ...seed, lastSuccessfulCheckUtc: VERIFIED_UTC, lastError: null };
}

/* ------------------------------------------------------------------ *
 * India - the primary market
 * ------------------------------------------------------------------ */

const INDIA: MarketSource[] = [
  source({
    sourceId: "nse_corporate_announcements",
    name: "NSE India corporate announcements",
    marketId: "IN",
    accessClass: "C_permitted_document",
    categories: ["corporate_announcements", "quarterly_results", "company_identity"],
    documentationUrl: "https://www.nseindia.com/companies-listing/corporate-filings-announcements",
    termsUrl: "https://www.nseindia.com/terms-conditions",
    accessMethod: "Published RSS feed, read on a user-initiated refresh",
    authentication: "none",
    cost: "zero",
    licensing: "NSE's terms prohibit systematic or automated collection and restrict redistribution. The feed is read only when the user refreshes, with attribution, and its content is not redistributed.",
    redistributionAllowed: false,
    updateFrequency: "Continuous through the trading day",
    historicalDepth: "Recent announcements only; deep history is not published in the feed.",
    rateLimit: "No numeric limit published; a conservative delay is applied and the source is read only on request.",
    failureModes: ["The archive can transiently serve a stub response", "Some client identities are refused", "The feed carries recent items only"],
    manualFallback: "Open the official announcements page and import a filing by hand.",
    status: "connected",
    blocker: null,
    latestCheckEvidence: "Read live announcements from the public archive in a verification run.",
    latestFilingConfirmed: false,
    hasAdapter: true,
  }),
  source({
    sourceId: "bse_corporate_announcements",
    name: "BSE India corporate announcements",
    marketId: "IN",
    accessClass: "C_permitted_document",
    categories: ["corporate_announcements", "quarterly_results", "corporate_actions", "company_identity"],
    documentationUrl: "https://www.bseindia.com/corporates/ann.html",
    termsUrl: "https://www.bseindia.com/",
    accessMethod: "Published RSS feed, read on a user-initiated refresh",
    authentication: "none",
    cost: "zero",
    licensing: "Automated use and redistribution of exchange data remain subject to BSE's data policy.",
    redistributionAllowed: false,
    updateFrequency: "Continuous through the trading day",
    historicalDepth: "The feed carries thousands of recent announcements, each linking the filed document.",
    rateLimit: "No numeric limit published; a conservative delay is applied and the source is read only on request.",
    failureModes: ["The feed is several megabytes and is truncated at a byte ceiling", "Some client identities are refused"],
    manualFallback: "Download the filing from the BSE page and import it by hand.",
    status: "connected",
    blocker: null,
    latestCheckEvidence: "Read live announcements, each linking its filed document, in a verification run.",
    latestFilingConfirmed: false,
    hasAdapter: true,
  }),
  source({
    sourceId: "sebi_regulatory_filings",
    name: "SEBI regulatory orders and circulars",
    marketId: "IN",
    accessClass: "C_permitted_document",
    categories: ["regulatory_orders"],
    documentationUrl: "https://www.sebi.gov.in/",
    termsUrl: "https://www.sebi.gov.in/",
    accessMethod: "Published RSS feed, read on a user-initiated refresh",
    authentication: "none",
    cost: "zero",
    licensing: "SEBI's website policy discusses permission and attribution for reproducing content.",
    redistributionAllowed: false,
    updateFrequency: "Through the working day",
    historicalDepth: "Recent items only; older material is on the website but is not fetched.",
    rateLimit: "No numeric limit published; a conservative delay is applied and the source is read only on request.",
    failureModes: ["Some items carry a doubled link, which the adapter un-doubles"],
    manualFallback: "Open the SEBI page and import the order by hand.",
    status: "connected",
    blocker: null,
    latestCheckEvidence: "Read live regulatory items from the feed in a verification run.",
    latestFilingConfirmed: false,
    hasAdapter: true,
  }),
  source({
    sourceId: "datagovin_open_data",
    name: "data.gov.in open government data",
    marketId: "IN",
    accessClass: "B_official_dataset",
    categories: ["company_metadata", "company_identity", "fundamental_ratios"],
    documentationUrl: "https://www.data.gov.in/",
    termsUrl: "https://www.data.gov.in/terms-conditions",
    accessMethod: "Open catalogue API, readable without a key",
    authentication: "api_key",
    cost: "zero",
    licensing: "Open government data. The licence and update frequency must be checked per dataset.",
    redistributionAllowed: true,
    updateFrequency: "Depends on the dataset",
    historicalDepth: "Depends on the dataset; not asserted here.",
    rateLimit: "No numeric limit published for the catalogue.",
    failureModes: ["Reading an individual dataset needs an api-key that this build does not configure"],
    manualFallback: "Download the dataset from the portal and import the CSV.",
    status: "connected",
    blocker: "The catalogue is readable without a key; reading an individual dataset requires an api-key. The dependency is the key, not the code.",
    latestCheckEvidence: "Read the live catalogue, which reported 288,011 datasets.",
    latestFilingConfirmed: false,
    hasAdapter: true,
  }),
  source({
    sourceId: "mca_public_information",
    name: "MCA public company information",
    marketId: "IN",
    accessClass: "D_human_only",
    categories: ["company_identity", "company_metadata", "audited_statements"],
    documentationUrl: "https://www.mca.gov.in/",
    termsUrl: "https://www.mca.gov.in/",
    accessMethod: "Manual browsing and document download",
    authentication: "unknown",
    cost: "zero",
    licensing: "Terms not reviewed. Automated access is not confirmed.",
    redistributionAllowed: null,
    updateFrequency: null,
    historicalDepth: null,
    rateLimit: "No documented automated interface.",
    failureModes: ["The host returned HTTP 403 during reconnaissance", "No documented automated interface has been confirmed"],
    manualFallback: "Look the company up on MCA, download the filing, and import it by hand.",
    status: "blocked",
    blocker: "No documented automated interface, and the host refused an automated request during reconnaissance. Treated as human-accessible only.",
    latestCheckEvidence: null,
    latestFilingConfirmed: false,
    hasAdapter: false,
  }),
  source({
    sourceId: "in_company_ir",
    name: "Official company investor-relations pages",
    marketId: "IN",
    accessClass: "D_human_only",
    categories: ["annual_reports", "audited_statements", "quarterly_results"],
    documentationUrl: "https://www.nseindia.com/companies-listing/corporate-filings-announcements",
    termsUrl: null,
    accessMethod: "Manual download from each company's own site",
    authentication: "unknown",
    cost: "zero",
    licensing: "Each company's site has its own terms. Automated retrieval is not assumed.",
    redistributionAllowed: null,
    updateFrequency: null,
    historicalDepth: "Varies by company",
    rateLimit: "None documented; not automated.",
    failureModes: ["Terms differ per company", "Some sites block automated retrieval"],
    manualFallback: "Download the report from the company's site and import it.",
    status: "planned",
    blocker: "Per-company terms must be reviewed before any automated retrieval, so this is manual import only for now.",
    latestCheckEvidence: null,
    latestFilingConfirmed: false,
    hasAdapter: false,
  }),
];

/* ------------------------------------------------------------------ *
 * United States
 * ------------------------------------------------------------------ */

const UNITED_STATES: MarketSource[] = [
  source({
    sourceId: "sec_edgar_submissions",
    name: "SEC EDGAR company submissions",
    marketId: "US",
    accessClass: "A_official_api",
    categories: ["annual_reports", "quarterly_results", "corporate_announcements", "company_identity"],
    documentationUrl: "https://www.sec.gov/edgar/sec-api-documentation",
    termsUrl: "https://www.sec.gov/about/developer-resources",
    accessMethod: "Documented JSON API, no key required",
    authentication: "none",
    cost: "zero",
    licensing: "US federal government works. The fair-access guidance asks for a descriptive User-Agent with contact details and about ten requests per second.",
    redistributionAllowed: true,
    updateFrequency: "Continuous as filings are accepted",
    historicalDepth: "Full EDGAR archive",
    rateLimit: "About ten requests per second, per the fair-access guidance.",
    failureModes: ["Fair-access throttling if the rate is exceeded", "Some networks refuse the host"],
    manualFallback: "Open the filing on EDGAR and import the document by hand.",
    status: "available",
    blocker: "The build sandbox's egress proxy refuses sec.gov, so the adapter could not be run end to end from here. It is verified against captured response shapes.",
    latestCheckEvidence: null,
    latestFilingConfirmed: false,
    hasAdapter: true,
  }),
  source({
    sourceId: "sec_edgar_companyfacts",
    name: "SEC EDGAR company facts (XBRL)",
    marketId: "US",
    accessClass: "A_official_api",
    categories: ["fundamental_ratios", "audited_statements", "company_metadata"],
    documentationUrl: "https://www.sec.gov/edgar/sec-api-documentation",
    termsUrl: "https://www.sec.gov/about/developer-resources",
    accessMethod: "Documented JSON API, no key required",
    authentication: "none",
    cost: "zero",
    licensing: "US federal government works.",
    redistributionAllowed: true,
    updateFrequency: "As filings are accepted",
    historicalDepth: "XBRL facts from the XBRL mandate onwards; older filings are not covered.",
    rateLimit: "About ten requests per second.",
    failureModes: ["Coverage begins at the XBRL mandate, not before", "Some networks refuse the host"],
    manualFallback: "Read the figures from the filing itself and enter them by hand.",
    status: "available",
    blocker: "Same proxy block as the submissions endpoint; the parser is implemented and unit-tested against captured shapes.",
    latestCheckEvidence: null,
    latestFilingConfirmed: false,
    hasAdapter: true,
  }),
  source({
    sourceId: "us_fred_macro",
    name: "FRED economic data",
    marketId: "US",
    accessClass: "A_official_api",
    categories: ["index_data", "company_metadata"],
    documentationUrl: "https://fred.stlouisfed.org/docs/api/fred/",
    termsUrl: "https://fred.stlouisfed.org/legal/",
    accessMethod: "Documented JSON API",
    authentication: "api_key",
    cost: "zero",
    licensing: "Federal Reserve Bank of St Louis terms apply; attribution is expected.",
    redistributionAllowed: null,
    updateFrequency: "Varies by series",
    historicalDepth: "Varies by series",
    rateLimit: "Documented per-key limits.",
    failureModes: ["Requires a free key that may not live in the client"],
    manualFallback: "Download the series from the FRED site and import it.",
    status: "planned",
    blocker: "Requires an API key. No key may be embedded in the client, so this needs a user-supplied key or a backend.",
    latestCheckEvidence: null,
    latestFilingConfirmed: false,
    hasAdapter: false,
  }),
];

/* ------------------------------------------------------------------ *
 * United Kingdom
 * ------------------------------------------------------------------ */

const UNITED_KINGDOM: MarketSource[] = [
  source({
    sourceId: "companies_house",
    name: "Companies House API",
    marketId: "GB",
    accessClass: "A_official_api",
    categories: ["company_identity", "company_metadata", "audited_statements"],
    documentationUrl: "https://developer.company-information.service.gov.uk/",
    termsUrl: "https://www.gov.uk/government/publications/companies-house-api-terms-and-conditions",
    accessMethod: "Documented JSON API",
    authentication: "api_key",
    cost: "zero",
    licensing: "Free with a registered key. The terms must be read before use.",
    redistributionAllowed: null,
    updateFrequency: "As filings are accepted",
    historicalDepth: "Full filing history",
    rateLimit: "600 requests per five minutes per key, as documented.",
    failureModes: ["Requires a key that may not live in the client", "Some networks refuse the host"],
    manualFallback: "Look the company up on the Companies House website and import the filing by hand.",
    status: "blocked",
    blocker: "Requires a free API key that may not be embedded in the client, so it needs a user-supplied key or a backend.",
    latestCheckEvidence: null,
    latestFilingConfirmed: false,
    hasAdapter: false,
  }),
  source({
    sourceId: "fca_nsm",
    name: "FCA National Storage Mechanism",
    marketId: "GB",
    accessClass: "D_human_only",
    categories: ["regulatory_orders", "annual_reports", "corporate_announcements"],
    documentationUrl: "https://www.fca.org.uk/markets/primary-markets/regulatory-disclosures/national-storage-mechanism",
    termsUrl: "https://www.fca.org.uk/",
    accessMethod: "Manual browsing and document download",
    authentication: "unknown",
    cost: "zero",
    licensing: "Terms not reviewed; automated access is not confirmed.",
    redistributionAllowed: null,
    updateFrequency: null,
    historicalDepth: null,
    rateLimit: "No documented automated interface.",
    failureModes: ["No documented automated interface has been confirmed"],
    manualFallback: "Search the NSM, download the disclosure, and import it by hand.",
    status: "blocked",
    blocker: "No documented automated interface has been confirmed, so it is treated as human-accessible only.",
    latestCheckEvidence: null,
    latestFilingConfirmed: false,
    hasAdapter: false,
  }),
];

/* ------------------------------------------------------------------ *
 * Canada, Australia, Japan, Singapore, Hong Kong, Germany, France
 * ------------------------------------------------------------------ */

function plannedSource(seed: Omit<Seed, "status" | "hasAdapter" | "latestCheckEvidence" | "latestFilingConfirmed">): MarketSource {
  return source({ ...seed, status: "planned", hasAdapter: false, latestCheckEvidence: null, latestFilingConfirmed: false });
}

const CANADA: MarketSource[] = [
  plannedSource({
    sourceId: "ca_sedar_plus",
    name: "SEDAR+ national filing system",
    marketId: "CA",
    accessClass: "D_human_only",
    categories: ["annual_reports", "quarterly_results", "audited_statements", "company_identity"],
    documentationUrl: "https://www.sedarplus.ca/",
    termsUrl: null,
    accessMethod: "Manual browsing and document download",
    authentication: "unknown",
    cost: "zero",
    licensing: "Terms not reviewed. Automated retrieval is not assumed.",
    redistributionAllowed: null,
    updateFrequency: null,
    historicalDepth: null,
    rateLimit: "No documented automated interface.",
    failureModes: ["No documented automated interface has been confirmed", "Downloads are per-document"],
    manualFallback: "Search SEDAR+, download the filing, and import it by hand.",
    blocker: "No documented automated interface has been confirmed. A public parser and issuer-resolution schema are both pending.",
  }),
];

const AUSTRALIA: MarketSource[] = [
  plannedSource({
    sourceId: "au_asx_announcements",
    name: "ASX announcements",
    marketId: "AU",
    accessClass: "E_licensed_feed",
    categories: ["corporate_announcements", "annual_reports", "corporate_actions"],
    documentationUrl: "https://www.asx.com.au/",
    termsUrl: "https://www.asx.com.au/",
    accessMethod: "Authorised feed or manual download",
    authentication: "unknown",
    cost: "paid_or_authorised",
    licensing: "ASX market data is licensed; redistribution requires authorisation.",
    redistributionAllowed: false,
    updateFrequency: "Continuous",
    historicalDepth: null,
    rateLimit: "Governed by the licence.",
    failureModes: ["Requires a paid or separately authorised feed", "The public site is not an unrestricted automated target"],
    manualFallback: "Open the ASX announcement page and import the document by hand.",
    blocker: "ASX market data is licensed. The public site is not an unrestricted automated target, so an authorised feed or manual import is required.",
  }),
];

const JAPAN: MarketSource[] = [
  plannedSource({
    sourceId: "jp_edinet",
    name: "EDINET disclosure system",
    marketId: "JP",
    accessClass: "B_official_dataset",
    categories: ["annual_reports", "quarterly_results", "audited_statements", "company_identity"],
    documentationUrl: "https://disclosure2.edinet-fsa.go.jp/",
    termsUrl: null,
    accessMethod: "Official bulk download of filed documents",
    authentication: "none",
    cost: "zero",
    licensing: "Official disclosure documents published for public access. Terms must be read before use.",
    redistributionAllowed: null,
    updateFrequency: "As documents are filed",
    historicalDepth: "The system holds filed documents by date.",
    rateLimit: "No documented automated interface for the bulk download beyond the published files.",
    failureModes: ["Documents are in Japanese, so parsing needs a Japanese-language pipeline", "Issuer resolution is pending"],
    manualFallback: "Download the document from EDINET and import it by hand.",
    blocker: "A Japanese-language parsing pipeline and issuer resolution are both pending before this can be automated.",
  }),
];

const SINGAPORE: MarketSource[] = [
  plannedSource({
    sourceId: "sg_sgx_announcements",
    name: "SGX company announcements",
    marketId: "SG",
    accessClass: "D_human_only",
    categories: ["corporate_announcements", "annual_reports", "company_identity"],
    documentationUrl: "https://www.sgx.com/securities/company-announcements",
    termsUrl: "https://www.sgx.com/",
    accessMethod: "Manual browsing and document download",
    authentication: "unknown",
    cost: "zero",
    licensing: "Terms not reviewed. Automated retrieval is not assumed.",
    redistributionAllowed: null,
    updateFrequency: null,
    historicalDepth: null,
    rateLimit: "No documented automated interface.",
    failureModes: ["No documented automated interface has been confirmed", "ACRA registry access is separate and pending"],
    manualFallback: "Open the announcement on SGX and import the document by hand.",
    blocker: "No documented automated interface has been confirmed, and ACRA issuer resolution is pending.",
  }),
];

const HONG_KONG: MarketSource[] = [
  plannedSource({
    sourceId: "hk_hkexnews",
    name: "HKEXnews corporate announcements",
    marketId: "HK",
    accessClass: "D_human_only",
    categories: ["corporate_announcements", "annual_reports", "corporate_actions"],
    documentationUrl: "https://www1.hkexnews.hk/",
    termsUrl: "https://www.hkex.com.hk/",
    accessMethod: "Manual browsing and document download",
    authentication: "unknown",
    cost: "zero",
    licensing: "Terms not reviewed. Automated retrieval is not assumed.",
    redistributionAllowed: null,
    updateFrequency: null,
    historicalDepth: null,
    rateLimit: "No documented automated interface.",
    failureModes: ["Documents are bilingual, so parsing needs both scripts", "Issuer resolution is pending"],
    manualFallback: "Open the announcement on HKEXnews and import the document by hand.",
    blocker: "Bilingual parsing and issuer resolution are both pending, and no documented automated interface has been confirmed.",
  }),
];

const GERMANY: MarketSource[] = [
  plannedSource({
    sourceId: "de_esma_esef",
    name: "ESMA ESEF electronic reports",
    marketId: "DE",
    accessClass: "B_official_dataset",
    categories: ["annual_reports", "audited_statements", "company_identity"],
    documentationUrl: "https://www.esma.europa.eu/esap",
    termsUrl: "https://www.esma.europa.eu/",
    accessMethod: "Official electronic reporting dataset",
    authentication: "unknown",
    cost: "zero",
    licensing: "European public reporting. Terms must be read before use.",
    redistributionAllowed: null,
    updateFrequency: "As annual reports are filed",
    historicalDepth: "ESEF reporting applies from the mandate onwards.",
    rateLimit: "No documented automated interface confirmed.",
    failureModes: ["No documented automated interface has been confirmed", "German-language parsing is pending"],
    manualFallback: "Download the electronic report and import it by hand.",
    blocker: "No documented automated interface has been confirmed, and German-language parsing is pending.",
  }),
];

const FRANCE: MarketSource[] = [
  plannedSource({
    sourceId: "fr_amf_euronext",
    name: "AMF and Euronext regulated disclosures",
    marketId: "FR",
    accessClass: "D_human_only",
    categories: ["regulatory_orders", "annual_reports", "corporate_announcements"],
    documentationUrl: "https://www.amf-france.org/",
    termsUrl: "https://www.amf-france.org/",
    accessMethod: "Manual browsing and document download",
    authentication: "unknown",
    cost: "zero",
    licensing: "Terms not reviewed. Automated retrieval is not assumed.",
    redistributionAllowed: null,
    updateFrequency: null,
    historicalDepth: null,
    rateLimit: "No documented automated interface.",
    failureModes: ["No documented automated interface has been confirmed", "French-language parsing is pending"],
    manualFallback: "Open the disclosure on the AMF site and import the document by hand.",
    blocker: "No documented automated interface has been confirmed, and French-language parsing is pending.",
  }),
];

/** Every source, grouped by market. Each source appears in exactly one market. */
export const MARKET_SOURCES: MarketSource[] = [
  ...INDIA,
  ...UNITED_STATES,
  ...UNITED_KINGDOM,
  ...CANADA,
  ...AUSTRALIA,
  ...JAPAN,
  ...SINGAPORE,
  ...HONG_KONG,
  ...GERMANY,
  ...FRANCE,
];

/** Sources for one market only. This is the market-isolation primitive. */
export function sourcesForMarket(marketId: string): MarketSource[] {
  return MARKET_SOURCES.filter((entry) => entry.marketId === marketId);
}

/** The source ids for one market, for scoping a connector run. */
export function sourceIdsForMarket(marketId: string): string[] {
  return sourcesForMarket(marketId).map((entry) => entry.sourceId);
}

export function sourceById(sourceId: string): MarketSource | undefined {
  return MARKET_SOURCES.find((entry) => entry.sourceId === sourceId);
}

/** Every market that has at least one registered source. */
export function marketsWithSources(): string[] {
  return [...new Set(MARKET_SOURCES.map((entry) => entry.marketId))];
}
