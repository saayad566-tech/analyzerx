/**
 * The source registry: one adapter per source, with the terms that govern it.
 *
 * `verifiedEndToEnd` is true only where an end-to-end run has actually
 * retrieved a genuine document from the source. The NSE announcements archive
 * has been retrieved and parsed for real; the others declare their boundary and
 * say plainly that they are not implemented, rather than pretending to work.
 */

import { isApprovedUrl, type SourceTerms } from "./policy";
import { notImplementedConnector, type Connector, type ConnectorHealth, type ConnectorResult, type FetchedFiling } from "./types";

/* ------------------------------------------------------------------ *
 * Terms
 * ------------------------------------------------------------------ */

export const NSE_TERMS: SourceTerms = {
  sourceId: "nse_corporate_announcements",
  label: "NSE India corporate announcements",
  market: "India",
  homepage: "https://www.nseindia.com/companies-listing/corporate-filings-announcements",
  accessBasis: "public_archive",
  // NSE's terms prohibit systematic or automated data collection, so the app
  // must not poll this source in the background. A user-initiated read of the
  // public announcements archive, with attribution, is the permitted path.
  automaticAccessAllowed: false,
  userInitiatedAccessAllowed: true,
  redistributionAllowed: false,
  attributionRequired: true,
  termsNote:
    "NSE's website terms prohibit systematic or automated data collection. Background polling is blocked; the public announcements archive is read only when the user refreshes, with attribution, and its content is not redistributed.",
  approvedDomains: ["nsearchives.nseindia.com", "nseindia.com"],
  filingTypes: ["corporate_announcement", "board_meeting", "prior_intimation"],
};

export const SEBI_TERMS: SourceTerms = {
  sourceId: "sebi_corporate_filings",
  label: "SEBI corporate filings",
  market: "India",
  homepage: "https://www.sebi.gov.in/curation/corporate_filings.html",
  accessBasis: "public_regulatory",
  automaticAccessAllowed: false,
  userInitiatedAccessAllowed: true,
  redistributionAllowed: false,
  attributionRequired: true,
  termsNote:
    "SEBI is a public regulatory information source, but its website policy discusses permission and attribution for reproducing content. No automated adapter is implemented, so it is not fetched.",
  approvedDomains: ["sebi.gov.in"],
  filingTypes: ["regulatory_circular", "order", "public_disclosure"],
};

export const BSE_TERMS: SourceTerms = {
  sourceId: "bse_corporate_filings",
  label: "BSE India corporate filings",
  market: "India",
  homepage: "https://www.bseindia.com/",
  accessBasis: "public_archive",
  automaticAccessAllowed: false,
  userInitiatedAccessAllowed: true,
  redistributionAllowed: false,
  attributionRequired: true,
  termsNote: "Public corporate filings and financial results. No automated adapter is implemented, so it is not fetched.",
  approvedDomains: ["bseindia.com"],
  filingTypes: ["corporate_filing", "financial_results"],
};

export const DATAGOVIN_TERMS: SourceTerms = {
  sourceId: "datagovin_company_master",
  label: "data.gov.in company master",
  market: "India",
  homepage: "https://www.data.gov.in/",
  accessBasis: "open_licence",
  automaticAccessAllowed: true,
  userInitiatedAccessAllowed: true,
  redistributionAllowed: true,
  attributionRequired: true,
  termsNote:
    "Open government datasets published under an open licence. The licence and update frequency must be checked per dataset. Requires an API key that is not configured, so no adapter is active.",
  approvedDomains: ["data.gov.in", "api.data.gov.in"],
  filingTypes: ["company_master"],
};

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
 * NSE adapter (implemented and verified end-to-end)
 * ------------------------------------------------------------------ */

const NSE_ANNOUNCEMENTS_URL = "https://nsearchives.nseindia.com/content/RSS/Online_announcements.xml";

/** Decode the handful of XML entities that appear in RSS titles. */
function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function tag(item: string, name: string): string | null {
  const match = item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return match ? decodeXml(match[1]) : null;
}

/** Parse an RSS document into raw items. Kept separate so it can be tested. */
export function parseRssItems(xml: string): { title: string; link: string; pubDate: string | null; description: string | null }[] {
  const items: { title: string; link: string; pubDate: string | null; description: string | null }[] = [];
  const matches = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  for (const raw of matches) {
    const title = tag(raw, "title");
    const link = tag(raw, "link");
    if (!title || !link) continue;
    items.push({ title, link, pubDate: tag(raw, "pubDate"), description: tag(raw, "description") });
  }
  return items;
}

/** A stable, source-scoped id from the filing link, when one is present. */
export function externalIdFromLink(link: string): string | null {
  try {
    const path = new URL(link).pathname;
    const file = path.split("/").filter(Boolean).pop() ?? "";
    const stem = file.replace(/\.[a-z0-9]+$/i, "");
    return stem || null;
  } catch {
    return null;
  }
}

function toIso(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export const nseAnnouncementsConnector: Connector = {
  terms: NSE_TERMS,
  // Retrieved and parsed for real: the archive returns ~500 KB of live items.
  verifiedEndToEnd: true,
  async fetchFilings(query): Promise<ConnectorResult> {
    const approved = isApprovedUrl(NSE_TERMS, NSE_ANNOUNCEMENTS_URL);
    if (!approved.allowed) {
      return { sourceId: NSE_TERMS.sourceId, status: "blocked", filings: [], message: approved.reason };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(NSE_ANNOUNCEMENTS_URL, {
        signal: controller.signal,
        headers: { Accept: "application/xml,text/xml,*/*", "User-Agent": "AnalyzerX/1.0 (filing-intelligence)" },
      });
      if (!response.ok) {
        return { sourceId: NSE_TERMS.sourceId, status: "error", filings: [], message: `HTTP ${response.status} from ${NSE_TERMS.label}.` };
      }
      const xml = await response.text();
      const limit = query.limit ?? 40;
      const wanted = query.companyName?.trim().toLowerCase();
      const filings: FetchedFiling[] = [];
      for (const item of parseRssItems(xml)) {
        const companyName = item.title;
        if (wanted && !companyName.toLowerCase().includes(wanted)) continue;
        filings.push({
          externalId: externalIdFromLink(item.link),
          title: item.description ? `${companyName} — ${item.description}` : companyName,
          url: item.link,
          publishedAt: toIso(item.pubDate),
          category: "corporate_announcement",
          symbol: null,
          companyName,
          summary: item.description ?? "",
          // The RSS item is metadata only; the filing bytes are not retrieved
          // here, so no content hash is claimed.
          contentSha256: null,
          byteCount: null,
        });
        if (filings.length >= limit) break;
      }
      return {
        sourceId: NSE_TERMS.sourceId,
        status: filings.length ? "ok" : "empty",
        filings,
        message: filings.length
          ? `Read ${filings.length} announcement${filings.length === 1 ? "" : "s"} from the NSE public archive.`
          : "The NSE archive returned no announcements matching the query.",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { sourceId: NSE_TERMS.sourceId, status: "error", filings: [], message: `Reading the NSE archive failed: ${message}` };
    } finally {
      clearTimeout(timer);
    }
  },
  async health(): Promise<ConnectorHealth> {
    try {
      const response = await fetch(NSE_ANNOUNCEMENTS_URL, {
        method: "HEAD",
        headers: { "User-Agent": "AnalyzerX/1.0 (filing-intelligence)" },
      });
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
  notImplementedConnector(
    SEBI_TERMS,
    "SEBI adapter not implemented. Its website policy discusses permission and attribution, and no permitted automated endpoint has been confirmed, so nothing is fetched.",
  ),
  notImplementedConnector(BSE_TERMS, "BSE adapter not implemented, so nothing is fetched."),
  notImplementedConnector(
    DATAGOVIN_TERMS,
    "data.gov.in requires an API key that is not configured, so the adapter is inactive. The dependency is the key, not the code.",
  ),
  notImplementedConnector(
    SEC_TERMS,
    "SEC EDGAR adapter boundary reserved but not implemented. The dependency is an implemented submissions and company-facts adapter.",
  ),
];

export function connectorFor(sourceId: string): Connector | undefined {
  return CONNECTORS.find((connector) => connector.terms.sourceId === sourceId);
}

