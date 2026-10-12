/**
 * SEC EDGAR connector (Phase 6).
 *
 * SEC EDGAR is the first source to implement because its structured-data APIs
 * are documented and publicly accessible without an API key. The fair-access
 * guidance asks callers to identify themselves with a descriptive User-Agent
 * that includes contact details and to stay within roughly ten requests per
 * second, so this connector does both and routes every request through the
 * Phase 5 safety layer.
 *
 * The endpoints used are the documented ones:
 *   - https://www.sec.gov/files/company_tickers.json          (ticker -> CIK)
 *   - https://data.sec.gov/submissions/CIK##########.json     (filings list)
 *   - https://data.sec.gov/api/xbrl/companyfacts/CIK####.json (XBRL facts)
 *   - https://www.sec.gov/Archives/edgar/data/...             (filing documents)
 *
 * Every parser here is pure, so it can be tested against captured response
 * shapes without touching the network.
 */

import { safeFetch, type CircuitBreaker, type FetchPolicy, type RateLimiter, type SafeFetchOutcome } from "../net/http";
import type { FetchedFiling } from "./types";

export const SEC_APPROVED_DOMAINS = ["sec.gov", "data.sec.gov", "www.sec.gov"];

/** SEC's documented fair-access limit is 10 requests per second. */
export const SEC_POLICY: FetchPolicy = {
  approvedDomains: SEC_APPROVED_DOMAINS,
  rateLimit: { requestsPerWindow: 10, windowSeconds: 1, minDelayMs: 110, honoursRetryAfter: true },
  acceptedContentTypes: ["application/json", "text/json", "text/plain"],
  timeoutMs: 20_000,
  maxBytes: 12_000_000,
  maxRetries: 2,
  maxRedirects: 3,
};

/**
 * SEC requires a descriptive User-Agent with contact details. This is the one
 * source where such a header is explicitly requested rather than discouraged.
 */
export const SEC_USER_AGENT = "AnalyzerX/1.0 (filing-intelligence; contact: support@analyzerx.app)";

/* ------------------------------------------------------------------ *
 * Pure parsers
 * ------------------------------------------------------------------ */

/** Pad a CIK to the ten digits the submissions endpoint requires. */
export function normalizeCik(value: string | number): string | null {
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return null;
  return digits.padStart(10, "0");
}

export type SecTickerEntry = { cik: string; ticker: string; title: string };

/** Parse company_tickers.json into a ticker -> CIK index. */
export function parseCompanyTickers(json: unknown): SecTickerEntry[] {
  if (typeof json !== "object" || json === null) return [];
  const entries: SecTickerEntry[] = [];
  for (const value of Object.values(json as Record<string, unknown>)) {
    if (typeof value !== "object" || value === null) continue;
    const record = value as Record<string, unknown>;
    const cik = normalizeCik(String(record.cik_str ?? ""));
    const ticker = typeof record.ticker === "string" ? record.ticker : null;
    const title = typeof record.title === "string" ? record.title : null;
    if (!cik || !ticker || !title) continue;
    entries.push({ cik, ticker: ticker.toUpperCase(), title });
  }
  return entries;
}

/** Find a company by ticker, case-insensitively. */
export function findTickerEntry(entries: SecTickerEntry[], ticker: string): SecTickerEntry | null {
  const wanted = ticker.trim().toUpperCase();
  return entries.find((entry) => entry.ticker === wanted) ?? null;
}

export type SecFilingRef = {
  accessionNumber: string;
  form: string;
  filingDate: string | null;
  reportDate: string | null;
  primaryDocument: string | null;
  primaryDocDescription: string | null;
};

/**
 * Parse a submissions document's recent filings.
 *
 * The endpoint stores filings column-wise (parallel arrays) rather than as a
 * list of objects, so they are transposed here. A filing without an accession
 * number is skipped, because it cannot be identified or linked.
 */
export function parseSubmissions(json: unknown, limit = 40): SecFilingRef[] {
  if (typeof json !== "object" || json === null) return [];
  const root = json as Record<string, unknown>;
  const recent = root.filings as Record<string, unknown> | undefined;
  const block = recent?.recent as Record<string, unknown> | undefined;
  if (!block) return [];

  const accession = block.accessionNumber as string[] | undefined;
  const form = block.form as string[] | undefined;
  const filingDate = block.filingDate as string[] | undefined;
  const reportDate = block.reportDate as string[] | undefined;
  const primaryDocument = block.primaryDocument as string[] | undefined;
  const primaryDocDescription = block.primaryDocDescription as string[] | undefined;
  if (!Array.isArray(accession) || !Array.isArray(form)) return [];

  const refs: SecFilingRef[] = [];
  for (let i = 0; i < accession.length && refs.length < limit; i += 1) {
    const accessionNumber = accession[i];
    const formType = form[i];
    if (!accessionNumber || !formType) continue;
    refs.push({
      accessionNumber,
      form: formType,
      filingDate: filingDate?.[i] ?? null,
      reportDate: reportDate?.[i] ?? null,
      primaryDocument: primaryDocument?.[i] ?? null,
      primaryDocDescription: primaryDocDescription?.[i] ?? null,
    });
  }
  return refs;
}

/** Build the official document URL for a filing. */
export function filingDocumentUrl(cik: string, ref: SecFilingRef): string {
  const cikDigits = String(Number(cik)); // the Archives path uses the unpadded CIK
  const accessionNoDashes = ref.accessionNumber.replace(/-/g, "");
  const base = `https://www.sec.gov/Archives/edgar/data/${cikDigits}/${accessionNoDashes}`;
  return ref.primaryDocument ? `${base}/${ref.primaryDocument}` : `${base}/`;
}

export type SecFact = { taxonomy: string; tag: string; unit: string; value: number; end: string | null; form: string | null };

/** Parse companyfacts into a flat list of the most recent value per tag/unit. */
export function parseCompanyFacts(json: unknown, limit = 60): SecFact[] {
  if (typeof json !== "object" || json === null) return [];
  const facts = (json as Record<string, unknown>).facts as Record<string, unknown> | undefined;
  if (!facts) return [];
  const out: SecFact[] = [];
  for (const [taxonomy, tags] of Object.entries(facts)) {
    if (typeof tags !== "object" || tags === null) continue;
    for (const [tag, body] of Object.entries(tags as Record<string, unknown>)) {
      const units = (body as Record<string, unknown>)?.units as Record<string, unknown> | undefined;
      if (!units) continue;
      for (const [unit, points] of Object.entries(units)) {
        if (!Array.isArray(points) || points.length === 0) continue;
        const last = points[points.length - 1] as Record<string, unknown>;
        const value = last?.val;
        if (typeof value !== "number") continue;
        out.push({ taxonomy, tag, unit, value, end: typeof last.end === "string" ? last.end : null, form: typeof last.form === "string" ? last.form : null });
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Connector
 * ------------------------------------------------------------------ */

export type SecFetchDeps = {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  limiter?: RateLimiter;
  breaker?: CircuitBreaker;
  jitter?: () => number;
};

export type SecCompanyFilings = {
  cik: string;
  companyName: string | null;
  ticker: string | null;
  filings: FetchedFiling[];
  /** The typed outcome of the underlying request, for honest reporting. */
  outcome: SafeFetchOutcome;
};

/**
 * Resolve a US ticker to its CIK using the documented ticker file.
 * Returns null rather than guessing when the ticker is not present.
 */
export async function resolveSecCik(ticker: string, deps: SecFetchDeps = {}): Promise<{ cik: string; companyName: string } | null> {
  const outcome = await safeFetch("https://www.sec.gov/files/company_tickers.json", SEC_POLICY, { ...deps, userAgent: SEC_USER_AGENT });
  if (!outcome.ok) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(outcome.text);
  } catch {
    return null;
  }
  const entry = findTickerEntry(parseCompanyTickers(parsed), ticker);
  return entry ? { cik: entry.cik, companyName: entry.title } : null;
}

/**
 * Fetch a US company's recent filings. The ticker is resolved to a CIK, then
 * the submissions endpoint is read and the recent filings are normalised.
 */
export async function fetchSecFilings(ticker: string, options: { limit?: number } & SecFetchDeps = {}): Promise<SecCompanyFilings | { error: string }> {
  const resolved = await resolveSecCik(ticker, options);
  if (!resolved) {
    return { error: `Could not resolve "${ticker}" to a CIK. Either the ticker is not in SEC's company file or the source was unreachable.` };
  }

  const submissionsUrl = `https://data.sec.gov/submissions/CIK${resolved.cik}.json`;
  const outcome = await safeFetch(submissionsUrl, SEC_POLICY, { ...options, userAgent: SEC_USER_AGENT });
  if (!outcome.ok) {
    return { error: outcome.error };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(outcome.text);
  } catch {
    return { error: "SEC returned a submissions document that was not valid JSON." };
  }

  const refs = parseSubmissions(parsed, options.limit ?? 40);
  const filings: FetchedFiling[] = refs.map((ref) => ({
    externalId: ref.accessionNumber,
    title: `${resolved.companyName} — ${ref.form}${ref.primaryDocDescription ? `: ${ref.primaryDocDescription}` : ""}`,
    url: filingDocumentUrl(resolved.cik, ref),
    publishedAt: ref.filingDate ? `${ref.filingDate}T00:00:00.000Z` : null,
    category: ref.form,
    symbol: ticker.toUpperCase(),
    companyName: resolved.companyName,
    summary: `Form ${ref.form} filed ${ref.filingDate ?? "date not stated"}${ref.reportDate ? ` for period ${ref.reportDate}` : ""}.`,
    contentSha256: null,
    byteCount: null,
  }));

  return { cik: resolved.cik, companyName: resolved.companyName, ticker: ticker.toUpperCase(), filings, outcome };
}
