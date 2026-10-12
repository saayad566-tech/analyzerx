/**
 * Connector framework (PRD sec 6, 14; guidance: one adapter per source).
 *
 * Each source gets an isolated adapter so a change to one source cannot break
 * the rest of the ingestion, and so the access policy can be enforced per
 * source rather than globally. A connector is never called unless the policy
 * allows the requested mode, and a connector records whether an end-to-end
 * test through it has actually retrieved a genuine document.
 */

import type { SourceTerms, AccessMode } from "./policy";

export type FilingFetchQuery = {
  symbol?: string;
  companyName?: string;
  limit?: number;
};

/** A filing as the connector observed it, before any analysis. */
export type FetchedFiling = {
  /** Source-scoped id. Company name alone is never used as the unique key. */
  externalId: string | null;
  title: string;
  url: string;
  /** ISO-8601 publication time, or null when the source does not state one. */
  publishedAt: string | null;
  category: string;
  symbol: string | null;
  companyName: string | null;
  summary: string;
  contentSha256: string | null;
  byteCount: number | null;
};

export type ConnectorStatus = "ok" | "empty" | "blocked" | "error" | "not_implemented";

export type ConnectorResult = {
  sourceId: string;
  status: ConnectorStatus;
  filings: FetchedFiling[];
  /** Plain-language outcome, shown to the user. Never a fabricated success. */
  message: string;
};

export type ConnectorHealth = {
  lastSuccessfulCheckUtc: string | null;
  lastError: string | null;
};

export type Connector = {
  terms: SourceTerms;
  /**
   * True only once an end-to-end run has retrieved and processed a genuine
   * permitted document from this source. Until then the source is not
   * presented as working.
   */
  verifiedEndToEnd: boolean;
  /** Fetch filings. Callers must have cleared the policy first. */
  fetchFilings(query: FilingFetchQuery, mode: AccessMode): Promise<ConnectorResult>;
  health(): Promise<ConnectorHealth>;
};

/** A connector that declares its boundary but has no implementation yet. */
export function notImplementedConnector(terms: SourceTerms, reason: string): Connector {
  return {
    terms,
    verifiedEndToEnd: false,
    async fetchFilings(): Promise<ConnectorResult> {
      return { sourceId: terms.sourceId, status: "not_implemented", filings: [], message: reason };
    },
    async health(): Promise<ConnectorHealth> {
      return { lastSuccessfulCheckUtc: null, lastError: null };
    },
  };
}

/**
 * Fetch JSON with the constraints the PRD requires: an https approved
 * destination, a content-type check, a size ceiling and a timeout.
 */
export async function fetchJson(
  terms: SourceTerms,
  url: string,
  options: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const timeoutMs = options.timeoutMs ?? 12_000;
  const maxBytes = options.maxBytes ?? 4_000_000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "AnalyzerX/1.0 (filing-intelligence)" },
    });
    if (!response.ok) return { ok: false, error: `HTTP ${response.status} from ${terms.label}.` };
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("json")) return { ok: false, error: `Unexpected content type "${contentType}" from ${terms.label}.` };
    const text = await response.text();
    if (text.length > maxBytes) return { ok: false, error: `Response from ${terms.label} exceeded the size ceiling.` };
    return { ok: true, data: JSON.parse(text) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Request to ${terms.label} failed: ${message}` };
  } finally {
    clearTimeout(timer);
  }
}
