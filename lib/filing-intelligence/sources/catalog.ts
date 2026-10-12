/**
 * Source catalog (Phase 3).
 *
 * Each entry is classified A-F by how it may actually be accessed, and its
 * state is derived from evidence rather than asserted. The three Indian
 * exchange/regulator feeds and the data.gov.in catalogue have been retrieved
 * and parsed for real; the US and UK sources declare their access class and the
 * dependency that blocks them, and are not presented as working.
 *
 * Access classes:
 *   A official API · B official dataset · C permitted document ·
 *   D human-accessible only · E licensed feed · F unsupported
 */

import { deriveState } from "./state";
import type { HealthEvidence, SourceRecord } from "./types";

/** Evidence recorded from the end-to-end runs that have actually been performed. */
const VERIFIED_IN_RUN: Record<string, HealthEvidence> = {
  nse_corporate_announcements: {
    lastSuccessfulCheckUtc: null,
    lastRetrievalUtc: null,
    lastError: null,
    latestEndToEndEvidence: "Read 12 live announcements from the NSE public archive in a verification run.",
  },
  bse_corporate_announcements: {
    lastSuccessfulCheckUtc: null,
    lastRetrievalUtc: null,
    lastError: null,
    latestEndToEndEvidence: "Read 12 live announcements from the BSE feed in a verification run.",
  },
  sebi_regulatory_filings: {
    lastSuccessfulCheckUtc: null,
    lastRetrievalUtc: null,
    lastError: null,
    latestEndToEndEvidence: "Read 12 live regulatory items from the SEBI feed in a verification run.",
  },
  datagovin_open_data: {
    lastSuccessfulCheckUtc: null,
    lastRetrievalUtc: null,
    lastError: null,
    latestEndToEndEvidence: "Read the open catalogue in a verification run; it reported 288,011 datasets.",
  },
};

const EMPTY_HEALTH: HealthEvidence = {
  lastSuccessfulCheckUtc: null,
  lastRetrievalUtc: null,
  lastError: null,
  latestEndToEndEvidence: null,
};

type CatalogSeed = Omit<SourceRecord, "state" | "health"> & {
  hasAdapter: boolean;
  verifiedEndToEnd: boolean;
  healthKey?: string;
};

const SEEDS: CatalogSeed[] = [
  /* ---------------- United States ---------------- */
  {
    sourceId: "sec_edgar_submissions",
    name: "SEC EDGAR company submissions",
    country: "United States",
    jurisdiction: "US federal securities",
    classification: "regulator",
    accessClass: "A_official_api",
    assetClasses: ["equity"],
    dataCategories: ["filings", "filing_metadata"],
    retrievalMethods: ["api"],
    documentationUrl: "https://www.sec.gov/edgar/sec-api-documentation",
    termsUrl: "https://www.sec.gov/about/developer-resources",
    termsReviewedUtc: "2026-10-12",
    auth: "none",
    rateLimit: { requestsPerWindow: 10, windowSeconds: 1, minDelayMs: 110, honoursRetryAfter: true, note: "Fair-access guidance asks for about ten requests per second and a descriptive User-Agent with contact details." },
    licensing: { redistributionAllowed: true, attributionRequired: true, note: "US federal government works; the developer-resources page states the fair-access terms." },
    historicalCoverage: "Company submissions and historical filings are published from EDGAR's full archive.",
    approvedDomains: ["sec.gov", "data.sec.gov", "www.sec.gov"],
    blocker: "The sandbox egress proxy refuses sec.gov (CONNECT 403), so the connector could not be run end to end from here. It is verified against captured response shapes instead.",
    hasAdapter: true,
    verifiedEndToEnd: false,
  },
  {
    sourceId: "sec_edgar_companyfacts",
    name: "SEC EDGAR company facts (XBRL)",
    country: "United States",
    jurisdiction: "US federal securities",
    classification: "regulator",
    accessClass: "A_official_api",
    assetClasses: ["equity"],
    dataCategories: ["financial_facts", "xbrl"],
    retrievalMethods: ["api"],
    documentationUrl: "https://www.sec.gov/edgar/sec-api-documentation",
    termsUrl: "https://www.sec.gov/about/developer-resources",
    termsReviewedUtc: "2026-10-12",
    auth: "none",
    rateLimit: { requestsPerWindow: 10, windowSeconds: 1, minDelayMs: 110, honoursRetryAfter: true, note: "Same fair-access limit as the submissions endpoint." },
    licensing: { redistributionAllowed: true, attributionRequired: true, note: "US federal government works." },
    historicalCoverage: "XBRL facts are available for filings made since the XBRL mandate; older filings are not covered.",
    approvedDomains: ["data.sec.gov", "sec.gov", "www.sec.gov"],
    blocker: "Same proxy block as the submissions endpoint; the parser is implemented and unit-tested against captured shapes.",
    hasAdapter: true,
    verifiedEndToEnd: false,
  },
  /* ---------------- United Kingdom ---------------- */
  {
    sourceId: "companies_house",
    name: "Companies House API",
    country: "United Kingdom",
    jurisdiction: "UK company law",
    classification: "government",
    accessClass: "A_official_api",
    assetClasses: ["equity"],
    dataCategories: ["company_profile", "filing_history", "accounts"],
    retrievalMethods: ["api"],
    documentationUrl: "https://developer.company-information.service.gov.uk/",
    termsUrl: "https://www.gov.uk/government/publications/companies-house-api-terms-and-conditions",
    termsReviewedUtc: null,
    auth: "api_key",
    rateLimit: { requestsPerWindow: 600, windowSeconds: 300, minDelayMs: null, honoursRetryAfter: true, note: "The documented limit is 600 requests per five minutes per key." },
    licensing: { redistributionAllowed: null, attributionRequired: true, note: "Terms not reviewed in this build; a free key is required and the terms must be read before use." },
    historicalCoverage: null,
    approvedDomains: ["api.company-information.service.gov.uk", "find-and-update.company-information.service.gov.uk"],
    blocker: "Requires a free API key, and no key may be embedded in the client. The key is a server-side secret, so this needs a backend or a user-supplied key. The host is also refused by the sandbox egress proxy.",
    hasAdapter: false,
    verifiedEndToEnd: false,
  },
  {
    sourceId: "fca_nsm",
    name: "FCA National Storage Mechanism",
    country: "United Kingdom",
    jurisdiction: "UK listing regime",
    classification: "regulator",
    accessClass: "D_human_only",
    assetClasses: ["equity"],
    dataCategories: ["regulated_information", "disclosure"],
    retrievalMethods: ["manual_import"],
    documentationUrl: "https://www.fca.org.uk/markets/primary-markets/regulatory-disclosures/national-storage-mechanism",
    termsUrl: "https://www.fca.org.uk/",
    termsReviewedUtc: null,
    auth: "unknown",
    rateLimit: { requestsPerWindow: null, windowSeconds: null, minDelayMs: null, honoursRetryAfter: false, note: "No automated-access terms or documented API have been confirmed." },
    licensing: { redistributionAllowed: null, attributionRequired: true, note: "Terms not reviewed; automated access is not confirmed." },
    historicalCoverage: null,
    approvedDomains: ["data.fca.org.uk", "www.fca.org.uk"],
    blocker: "No documented automated interface has been confirmed, so the source is treated as human-accessible only. The host is also refused by the sandbox egress proxy.",
    hasAdapter: false,
    verifiedEndToEnd: false,
  },
  /* ---------------- India ---------------- */
  {
    sourceId: "nse_corporate_announcements",
    name: "NSE India corporate announcements",
    country: "India",
    jurisdiction: "Indian securities market",
    classification: "exchange",
    accessClass: "C_permitted_document",
    assetClasses: ["equity"],
    dataCategories: ["corporate_announcement", "board_meeting", "prior_intimation"],
    retrievalMethods: ["feed", "document_fetch"],
    documentationUrl: "https://www.nseindia.com/companies-listing/corporate-filings-announcements",
    termsUrl: "https://www.nseindia.com/terms-conditions",
    termsReviewedUtc: "2026-10-12",
    auth: "none",
    rateLimit: { requestsPerWindow: null, windowSeconds: null, minDelayMs: 1000, honoursRetryAfter: false, note: "No published numeric limit; a conservative delay is applied and the source is read only on request." },
    licensing: { redistributionAllowed: false, attributionRequired: true, note: "NSE's terms prohibit systematic or automated collection and restrict redistribution; the feed is read only on a user-initiated refresh." },
    historicalCoverage: "The feed carries recent announcements; deep history is not published in it.",
    approvedDomains: ["nsearchives.nseindia.com", "nseindia.com"],
    blocker: null,
    hasAdapter: true,
    verifiedEndToEnd: true,
    healthKey: "nse_corporate_announcements",
  },
  {
    sourceId: "bse_corporate_announcements",
    name: "BSE India corporate announcements",
    country: "India",
    jurisdiction: "Indian securities market",
    classification: "exchange",
    accessClass: "C_permitted_document",
    assetClasses: ["equity"],
    dataCategories: ["corporate_announcement", "financial_results", "compliance_filing"],
    retrievalMethods: ["feed", "document_fetch"],
    documentationUrl: "https://www.bseindia.com/corporates/ann.html",
    termsUrl: "https://www.bseindia.com/",
    termsReviewedUtc: "2026-10-12",
    auth: "none",
    rateLimit: { requestsPerWindow: null, windowSeconds: null, minDelayMs: 1000, honoursRetryAfter: false, note: "No published numeric limit; a conservative delay is applied and the source is read only on request." },
    licensing: { redistributionAllowed: false, attributionRequired: true, note: "Automated use and redistribution of exchange data remain subject to BSE's data policy." },
    historicalCoverage: "The feed is large and carries thousands of recent announcements, each linking the filed document.",
    approvedDomains: ["bseindia.com", "www.bseindia.com"],
    blocker: null,
    hasAdapter: true,
    verifiedEndToEnd: true,
    healthKey: "bse_corporate_announcements",
  },
  {
    sourceId: "sebi_regulatory_filings",
    name: "SEBI regulatory orders and circulars",
    country: "India",
    jurisdiction: "Indian securities market",
    classification: "regulator",
    accessClass: "C_permitted_document",
    assetClasses: ["equity"],
    dataCategories: ["regulatory_circular", "order", "enforcement_action", "recovery_proceeding"],
    retrievalMethods: ["feed", "document_fetch"],
    documentationUrl: "https://www.sebi.gov.in/",
    termsUrl: "https://www.sebi.gov.in/",
    termsReviewedUtc: "2026-10-12",
    auth: "none",
    rateLimit: { requestsPerWindow: null, windowSeconds: null, minDelayMs: 1000, honoursRetryAfter: false, note: "No published numeric limit; a conservative delay is applied and the source is read only on request." },
    licensing: { redistributionAllowed: false, attributionRequired: true, note: "SEBI's website policy discusses permission and attribution for reproducing content." },
    historicalCoverage: "The feed carries recent items; older material is available on the website but is not fetched.",
    approvedDomains: ["sebi.gov.in", "www.sebi.gov.in"],
    blocker: null,
    hasAdapter: true,
    verifiedEndToEnd: true,
    healthKey: "sebi_regulatory_filings",
  },
  {
    sourceId: "mca_public_information",
    name: "MCA public company information",
    country: "India",
    jurisdiction: "Indian company law",
    classification: "government",
    accessClass: "D_human_only",
    assetClasses: ["equity"],
    dataCategories: ["company_profile", "filing_history"],
    retrievalMethods: ["manual_import"],
    documentationUrl: "https://www.mca.gov.in/",
    termsUrl: "https://www.mca.gov.in/",
    termsReviewedUtc: null,
    auth: "unknown",
    rateLimit: { requestsPerWindow: null, windowSeconds: null, minDelayMs: null, honoursRetryAfter: false, note: "No documented automated interface has been confirmed." },
    licensing: { redistributionAllowed: null, attributionRequired: true, note: "Terms not reviewed; automated access is not confirmed." },
    historicalCoverage: null,
    approvedDomains: ["mca.gov.in", "www.mca.gov.in"],
    blocker: "No documented automated interface has been confirmed, and the host returned HTTP 403 during reconnaissance. Treated as human-accessible only.",
    hasAdapter: false,
    verifiedEndToEnd: false,
  },
  {
    sourceId: "datagovin_open_data",
    name: "data.gov.in open government data",
    country: "India",
    jurisdiction: "Indian open data",
    classification: "government",
    accessClass: "B_official_dataset",
    assetClasses: ["equity"],
    dataCategories: ["company_master", "dataset"],
    retrievalMethods: ["api", "dataset_download"],
    documentationUrl: "https://www.data.gov.in/",
    termsUrl: "https://www.data.gov.in/terms-conditions",
    termsReviewedUtc: "2026-10-12",
    auth: "api_key",
    rateLimit: { requestsPerWindow: null, windowSeconds: null, minDelayMs: 500, honoursRetryAfter: false, note: "No published numeric limit for the catalogue; a conservative delay is applied." },
    licensing: { redistributionAllowed: true, attributionRequired: true, note: "Open government data; the licence and update frequency must be checked per dataset." },
    historicalCoverage: "Coverage depends on the individual dataset; it is not asserted here.",
    approvedDomains: ["api.data.gov.in", "data.gov.in", "www.data.gov.in"],
    blocker: "The catalogue is readable without a key, but reading an individual dataset requires an api-key that this build does not configure. The dependency is the key, not the code.",
    hasAdapter: true,
    verifiedEndToEnd: true,
    healthKey: "datagovin_open_data",
  },
];

/**
 * Build the catalog, deriving each state from its evidence.
 * A source whose terms forbid the access is blocked; a source with an adapter
 * but no successful end-to-end run is available at most, never connected.
 */
export function buildCatalog(now = new Date()): SourceRecord[] {
  return SEEDS.map((seed) => {
    const health = seed.healthKey ? VERIFIED_IN_RUN[seed.healthKey] ?? EMPTY_HEALTH : EMPTY_HEALTH;
    const derived = deriveState({
      accessClass: seed.accessClass,
      hasAdapter: seed.hasAdapter,
      verifiedEndToEnd: seed.verifiedEndToEnd,
      health,
      blocker: seed.blocker,
      now,
    });
    const { hasAdapter: _hasAdapter, verifiedEndToEnd: _verified, healthKey: _healthKey, ...record } = seed;
    return { ...record, health, state: derived.state };
  });
}

/** The catalog plus the reason each state was derived, for the admin view. */
export function buildCatalogWithReasons(now = new Date()): { record: SourceRecord; reason: string }[] {
  return SEEDS.map((seed) => {
    const health = seed.healthKey ? VERIFIED_IN_RUN[seed.healthKey] ?? EMPTY_HEALTH : EMPTY_HEALTH;
    const derived = deriveState({
      accessClass: seed.accessClass,
      hasAdapter: seed.hasAdapter,
      verifiedEndToEnd: seed.verifiedEndToEnd,
      health,
      blocker: seed.blocker,
      now,
    });
    const { hasAdapter: _hasAdapter, verifiedEndToEnd: _verified, healthKey: _healthKey, ...record } = seed;
    return { record: { ...record, health, state: derived.state }, reason: derived.reason };
  });
}

/** Count of sources per state, for a compact coverage summary. */
export function catalogSummary(catalog: SourceRecord[]): { state: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const record of catalog) counts.set(record.state, (counts.get(record.state) ?? 0) + 1);
  return [...counts.entries()].map(([state, count]) => ({ state, count })).sort((a, b) => b.count - a.count || a.state.localeCompare(b.state));
}
