import { fetchWithRetry, markCollectorFailure, markCollectorParsingError, markCollectorStarted, markCollectorSuccess } from "./collector-runtime";

const COLLECTOR_KEY = "uk-fca-nsm";
const PARSER_VERSION = "uk-fca-nsm-v1";

export type FcaIssuer = { symbol: string; name: string; lei?: string; isin?: string };
export type FcaDisclosure = { id: string; issuerName: string; issuerLei?: string; headline: string; category?: string; filedAt: string; documentUrl: string; relatedIssuers?: string[]; isCorrection?: boolean };

function configuredEndpoint() { const value = process.env.UK_FCA_NSM_API_URL?.trim(); return value && /^https?:\/\//i.test(value) ? value : null; }
function issuerMap(): FcaIssuer[] { try { const value = JSON.parse(process.env.UK_FCA_ISSUER_MAP_JSON ?? "[]") as unknown; return Array.isArray(value) ? value.filter((item): item is FcaIssuer => Boolean(item && typeof item === "object" && typeof (item as FcaIssuer).symbol === "string" && typeof (item as FcaIssuer).name === "string")) : []; } catch { return []; } }

export function resolveFcaIssuer(issuers: FcaIssuer[], query: string) {
  const normalized = query.trim().toUpperCase();
  return issuers.find((issuer) => issuer.symbol.toUpperCase() === normalized || issuer.name.toUpperCase() === normalized || issuer.lei?.toUpperCase() === normalized || issuer.isin?.toUpperCase() === normalized) ?? null;
}

export function parseFcaDisclosures(payload: unknown): FcaDisclosure[] {
  if (!payload || typeof payload !== "object") throw new Error("FCA NSM payload is not an object");
  const rows = (payload as { disclosures?: unknown }).disclosures;
  if (!Array.isArray(rows)) throw new Error("FCA NSM schema mismatch: disclosures array missing");
  return rows.map((row, index) => {
    if (!row || typeof row !== "object") throw new Error(`FCA NSM schema mismatch at row ${index}`);
    const value = row as Record<string, unknown>;
    const id = typeof value.id === "string" ? value.id : "";
    const issuerName = typeof value.issuerName === "string" ? value.issuerName : "";
    const headline = typeof value.headline === "string" ? value.headline : "";
    const filedAt = typeof value.filedAt === "string" ? value.filedAt : "";
    const documentUrl = typeof value.documentUrl === "string" ? value.documentUrl : "";
    if (!id || !issuerName || !headline || !filedAt || !/^https?:\/\//i.test(documentUrl)) throw new Error(`FCA NSM schema mismatch at row ${index}`);
    if (Number.isNaN(new Date(filedAt).getTime())) throw new Error(`FCA NSM invalid filedAt at row ${index}`);
    return { id, issuerName, issuerLei: typeof value.issuerLei === "string" ? value.issuerLei : undefined, headline, category: typeof value.category === "string" ? value.category : undefined, filedAt: new Date(filedAt).toISOString(), documentUrl, relatedIssuers: Array.isArray(value.relatedIssuers) ? value.relatedIssuers.filter((item): item is string => typeof item === "string") : undefined, isCorrection: typeof value.isCorrection === "boolean" ? value.isCorrection : undefined };
  });
}

export async function collectFcaIssuer(query: string) {
  const key = COLLECTOR_KEY;
  markCollectorStarted(key);
  const endpoint = configuredEndpoint();
  const issuer = resolveFcaIssuer(issuerMap(), query);
  if (!issuer) { const result = { status: "unresolved" as const, query, disclosures: [], retrievedAt: new Date().toISOString(), notes: "No exact UK issuer symbol/name/LEI/ISIN mapping configured." }; markCollectorFailure(key, result.notes, result.notes); return result; }
  if (!endpoint) { const result = { status: "access-gated" as const, query, issuer, disclosures: [], retrievedAt: new Date().toISOString(), notes: "UK_FCA_NSM_API_URL is not configured. The FCA NSM public search is not assumed to be a stable machine-readable endpoint." }; markCollectorFailure(key, result.notes, result.notes); return result; }
  try {
    const url = new URL(endpoint); url.searchParams.set("issuer", issuer.lei ?? issuer.name);
    const response = await fetchWithRetry(url.toString(), { headers: { Accept: "application/json", "User-Agent": process.env.ANALYZERX_HTTP_USER_AGENT ?? "AnalyzerX/1.0" } }, { key, retries: 2, timeoutMs: 20_000, rateLimitMs: 1_000 });
    if (!response.ok) throw new Error(`FCA NSM HTTP ${response.status}`);
    const payload = await response.json() as unknown;
    const disclosures = parseFcaDisclosures(payload);
    markCollectorSuccess(key, disclosures.length);
    return { status: "fresh" as const, query, issuer, disclosures, parserVersion: PARSER_VERSION, retrievedAt: new Date().toISOString(), notes: "FCA NSM disclosures are event-driven but the public NSM is not guaranteed to be real-time." };
  } catch (error) { markCollectorFailure(key, error); markCollectorParsingError(key, error); return { status: "error" as const, query, issuer, disclosures: [], retrievedAt: new Date().toISOString(), error: String(error) }; }
}

export { PARSER_VERSION };
