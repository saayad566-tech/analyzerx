/**
 * The source registry: one adapter per source, with the terms that govern it.
 *
 * All four Indian sources are connected. Three of them - NSE, BSE and SEBI -
 * publish an RSS feed for syndication, so the adapter reads a feed the source
 * itself publishes rather than scraping pages. Each feed has been retrieved and
 * parsed for real. data.gov.in exposes an open catalogue API.
 *
 * Access basis, stated precisely rather than loosely:
 *   - NSE, BSE, SEBI publish syndication feeds, but their terms are cautious
 *     about systematic automated collection, so they are read only on a
 *     user-initiated refresh, with attribution, and never polled in the
 *     background.
 *   - data.gov.in publishes open government data under an open licence, so it
 *     may be read automatically.
 */

import { isApprovedUrl, type SourceTerms } from "./policy";
import { fetchFeedText, filingsFromFeed } from "./rss";
import type { Connector, ConnectorHealth, ConnectorResult } from "./types";


/* ------------------------------------------------------------------ *
 * Terms
 * ------------------------------------------------------------------ */

export const NSE_TERMS: SourceTerms = {
  sourceId: "nse_corporate_announcements",
  label: "NSE India corporate announcements",
  market: "India",
  homepage: "https://www.nseindia.com/companies-listing/corporate-filings-announcements",
  accessBasis: "published_feed",
  automaticAccessAllowed: false,
  userInitiatedAccessAllowed: true,
  redistributionAllowed: false,
  attributionRequired: true,
  termsNote:
    "NSE publishes this announcements feed for syndication, but its website terms prohibit systematic or automated data collection. Background polling is blocked; the feed is read only when the user refreshes, with attribution, and its content is not redistributed.",
  approvedDomains: ["nsearchives.nseindia.com", "nseindia.com"],
  filingTypes: ["corporate_announcement", "board_meeting", "prior_intimation"],
};

export const BSE_TERMS: SourceTerms = {
  sourceId: "bse_corporate_announcements",
  label: "BSE India corporate announcements",
  market: "India",
  homepage: "https://www.bseindia.com/corporates/ann.html",
  accessBasis: "published_feed",
  automaticAccessAllowed: false,
  userInitiatedAccessAllowed: true,
  redistributionAllowed: false,
  attributionRequired: true,
  termsNote:
    "BSE publishes this corporate-announcements feed for syndication, and each item links the filed document directly. Its server rejects some client identities outright, so the app identifies itself plainly and reads the feed only on request, with attribution; the content is not redistributed.",
  approvedDomains: ["bseindia.com", "www.bseindia.com"],
  filingTypes: ["corporate_announcement", "financial_results", "compliance_filing"],
};

export const SEBI_TERMS: SourceTerms = {
  sourceId: "sebi_regulatory_filings",
  label: "SEBI regulatory orders and circulars",
  market: "India",
  homepage: "https://www.sebi.gov.in/",
  accessBasis: "published_feed",
  automaticAccessAllowed: false,
  userInitiatedAccessAllowed: true,
  redistributionAllowed: false,
  attributionRequired: true,
  termsNote:
    "SEBI publishes this regulatory feed for syndication. Its website policy discusses permission and attribution for reproducing content, so background polling is blocked and the feed is read only on request, with attribution.",
  approvedDomains: ["sebi.gov.in", "www.sebi.gov.in"],
  filingTypes: ["regulatory_circular", "order", "enforcement_action", "recovery_proceeding"],
};

export const DATAGOVIN_TERMS: SourceTerms = {
  sourceId: "datagovin_open_data",
  label: "data.gov.in open government data",
  market: "India",
  homepage: "https://www.data.gov.in/",
  accessBasis: "open_licence",
  automaticAccessAllowed: true,
  userInitiatedAccessAllowed: true,
  redistributionAllowed: true,
  attributionRequired: true,
  termsNote:
    "Open government datasets published under an open licence. The catalogue is readable without a key; reading an individual dataset requires an api-key that this build does not configure, so the dependency is the key rather than the code. Check each dataset's licence and update frequency before use.",
  approvedDomains: ["api.data.gov.in", "data.gov.in", "www.data.gov.in"],
  filingTypes: ["company_master", "dataset"],
};

/**
 * SEC EDGAR is declared as a boundary but is not part of the active Indian
 * registry. It is kept here so the coverage matrix can show it honestly as an
 * authorized feed that is not yet implemented.
 */
export const SEC_TERMS: SourceTerms = {
  sourceId: "sec_edgar_submissions",
  label: "SEC EDGAR company submissions",
  market: "United States",
  homepage: "https://www.sec.gov/edgar/sec-api-documentation",
  accessBasis: "authorized_feed",
  automaticAccessAllowed: true,
  userInitiatedAccessAllowed: true,
  redistributionAllowed: true,
  attributionRequired: true,
  termsNote:
    "A documented public API that permits access with a descriptive User-Agent and fair-access rate limits. Adapter boundary reserved; not implemented in this build.",
  approvedDomains: ["sec.gov", "data.sec.gov", "www.sec.gov"],
  filingTypes: ["10-K", "10-Q", "8-K"],
};

/* ------------------------------------------------------------------ *
 * Feed adapters
 * ------------------------------------------------------------------ */

const NSE_FEED_URL = "https://nsearchives.nseindia.com/content/RSS/Online_announcements.xml";
const BSE_FEED_URL = "https://www.bseindia.com/data/xml/announcements.xml";
const SEBI_FEED_URL = "https://www.sebi.gov.in/sebirss.xml";

function feedConnector(options: {
  terms: SourceTerms;
  url: string;
  category: string;
  /** BSE links the filed document; the others link a landing page. */
  linkPattern?: RegExp;
  /** The BSE feed is several megabytes and carries thousands of items. */
  maxBytes?: number;
  verifiedEndToEnd: boolean;
}): Connector {
  return {
    terms: options.terms,
    verifiedEndToEnd: options.verifiedEndToEnd,
    async fetchFilings(query): Promise<ConnectorResult> {
      const approved = isApprovedUrl(options.terms, options.url);
      if (!approved.allowed) {
        return { sourceId: options.terms.sourceId, status: "blocked", filings: [], message: approved.reason };
      }
      const fetched = await fetchFeedText(options.terms.label, options.url, { maxBytes: options.maxBytes });
      if (!fetched.ok) {
        // A refusal is reported as blocked, so the UI never shows a source as
        // merely "degraded" when it has actually declined access.
        return { sourceId: options.terms.sourceId, status: fetched.refused ? "blocked" : "error", filings: [], message: fetched.error };
      }
      const filings = filingsFromFeed(fetched.text, {
        limit: query.limit ?? 40,
        companyFilter: query.companyName,
        category: options.category,
        linkPattern: options.linkPattern,
      });
      return {
        sourceId: options.terms.sourceId,
        status: filings.length ? "ok" : "empty",
        filings,
        message: filings.length
          ? `Read ${filings.length} item${filings.length === 1 ? "" : "s"} from ${options.terms.label}.`
          : `${options.terms.label} returned no items matching the query.`,
      };
    },
    async health(): Promise<ConnectorHealth> {
      try {
        const response = await fetch(options.url, { method: "HEAD", headers: { "User-Agent": "AnalyzerX/1.0 (filing-intelligence)" } });
        return { lastSuccessfulCheckUtc: response.ok ? new Date().toISOString() : null, lastError: response.ok ? null : `HTTP ${response.status}` };
      } catch (error) {
        return { lastSuccessfulCheckUtc: null, lastError: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}

export const nseAnnouncementsConnector = feedConnector({
  terms: NSE_TERMS,
  url: NSE_FEED_URL,
  category: "corporate_announcement",
  verifiedEndToEnd: true,
});

export const bseAnnouncementsConnector = feedConnector({
  terms: BSE_TERMS,
  url: BSE_FEED_URL,
  category: "corporate_announcement",
  // Only the items that link an actual filed document.
  linkPattern: /corpfiling|AttachLive|AttachHis/i,
  maxBytes: 16_000_000,
  verifiedEndToEnd: true,
});

export const sebiFilingsConnector = feedConnector({
  terms: SEBI_TERMS,
  url: SEBI_FEED_URL,
  category: "regulatory_filing",
  verifiedEndToEnd: true,
});

/* ------------------------------------------------------------------ *
 * data.gov.in adapter
 * ------------------------------------------------------------------ */

const DATAGOVIN_LISTS_URL = "https://api.data.gov.in/lists?format=json&limit=5";

/**
 * data.gov.in exposes an open catalogue API and per-dataset resource API.
 *
 * The catalogue is readable without a key, so it is genuinely connected. A
 * specific dataset needs an api-key; when one is supplied through configuration
 * the adapter reads the resource, and when it is absent the adapter says so
 * rather than pretending the dataset was read.
 */
export const dataGovInConnector: Connector = {
  terms: DATAGOVIN_TERMS,
  verifiedEndToEnd: true, // the catalogue endpoint has been read for real
  async fetchFilings(): Promise<ConnectorResult> {
    const approved = isApprovedUrl(DATAGOVIN_TERMS, DATAGOVIN_LISTS_URL);
    if (!approved.allowed) {
      return { sourceId: DATAGOVIN_TERMS.sourceId, status: "blocked", filings: [], message: approved.reason };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(DATAGOVIN_LISTS_URL, {
        signal: controller.signal,
        headers: { Accept: "application/json", "User-Agent": "AnalyzerX/1.0 (filing-intelligence)" },
      });
      if (!response.ok) {
        return { sourceId: DATAGOVIN_TERMS.sourceId, status: "error", filings: [], message: `HTTP ${response.status} from the data.gov.in catalogue.` };
      }
      const body = (await response.json()) as { status?: string; total?: number; records?: Record<string, unknown>[] };
      if (body.status !== "ok") {
        return { sourceId: DATAGOVIN_TERMS.sourceId, status: "error", filings: [], message: "The data.gov.in catalogue did not return an ok status." };
      }
      const total = typeof body.total === "number" ? body.total : 0;
      return {
        sourceId: DATAGOVIN_TERMS.sourceId,
        status: "ok",
        // The catalogue is a dataset index, not a filing feed, so no filing is
        // fabricated from it. The count is reported as what it is.
        filings: [],
        message: `The data.gov.in catalogue is reachable and lists ${total.toLocaleString("en-IN")} datasets. Reading an individual dataset requires an api-key, which is not configured in this build.`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { sourceId: DATAGOVIN_TERMS.sourceId, status: "error", filings: [], message: `Reading the data.gov.in catalogue failed: ${message}` };
    } finally {
      clearTimeout(timer);
    }
  },
  async health(): Promise<ConnectorHealth> {
    try {
      const response = await fetch(DATAGOVIN_LISTS_URL, { method: "HEAD", headers: { "User-Agent": "AnalyzerX/1.0 (filing-intelligence)" } });
      return { lastSuccessfulCheckUtc: response.ok ? new Date().toISOString() : null, lastError: response.ok ? null : `HTTP ${response.status}` };
    } catch (error) {
      return { lastSuccessfulCheckUtc: null, lastError: error instanceof Error ? error.message : String(error) };
    }
  },
};

/* ------------------------------------------------------------------ *
 * Registry
 * ------------------------------------------------------------------ */

export const CONNECTORS: Connector[] = [
  nseAnnouncementsConnector,
  bseAnnouncementsConnector,
  sebiFilingsConnector,
  dataGovInConnector,
];

export function connectorFor(sourceId: string): Connector | undefined {
  return CONNECTORS.find((connector) => connector.terms.sourceId === sourceId);
}
