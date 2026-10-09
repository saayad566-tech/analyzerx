import { createHash } from "node:crypto";
import { saveSourceRecord } from "./db";
import { fetchWithRetry, markCollectorFailure, markCollectorParsingError, markCollectorStarted, markCollectorSuccess } from "./collector-runtime";
import type { MarketId } from "../lib/market-regions";

export type RegionalIssuer = { symbol: string; name: string; lei?: string; isin?: string; exchange?: string };
export type RegionalDisclosure = { id: string; issuerName: string; issuerSymbol?: string; issuerLei?: string; headline: string; category?: string; filedAt: string; documentUrl: string; relatedIssuers?: string[]; isCorrection?: boolean; language?: string };
export type RegionalDisclosureResult = { marketId: MarketId; status: "fresh" | "unresolved" | "access-gated" | "error"; query: string; issuer?: RegionalIssuer; disclosures: RegionalDisclosure[]; retrievedAt: string; parserVersion: string; recordsStored: number; notes?: string; error?: string };

const CONFIG: Partial<Record<MarketId, { sourceKey: string; endpointEnv: string; issuerMapEnv: string; parserVersion: string; sourceLabel: string }>> = {
  CA: { sourceKey: "ca-sedar-plus", endpointEnv: "CA_SEDAR_PLUS_API_URL", issuerMapEnv: "CA_ISSUER_MAP_JSON", parserVersion: "ca-sedar-plus-v1", sourceLabel: "Canada SEDAR+" },
  AU: { sourceKey: "au-asx-announcements", endpointEnv: "AU_ASX_ANNOUNCEMENTS_API_URL", issuerMapEnv: "AU_ISSUER_MAP_JSON", parserVersion: "au-asx-announcements-v1", sourceLabel: "Australia ASX announcements" },
  JP: { sourceKey: "jp-jpx-tdnet", endpointEnv: "JP_JPX_TDNET_API_URL", issuerMapEnv: "JP_ISSUER_MAP_JSON", parserVersion: "jp-jpx-tdnet-v1", sourceLabel: "Japan JPX/TDnet" },
  SG: { sourceKey: "sg-sgx-disclosures", endpointEnv: "SG_SGX_DISCLOSURES_API_URL", issuerMapEnv: "SG_ISSUER_MAP_JSON", parserVersion: "sg-sgx-disclosures-v1", sourceLabel: "Singapore SGX disclosures" },
  HK: { sourceKey: "hk-hkexnews", endpointEnv: "HK_HKEXNEWS_API_URL", issuerMapEnv: "HK_ISSUER_MAP_JSON", parserVersion: "hk-hkexnews-v1", sourceLabel: "Hong Kong HKEXnews" },
  DE: { sourceKey: "eu-esef", endpointEnv: "DE_ESEF_API_URL", issuerMapEnv: "DE_ISSUER_MAP_JSON", parserVersion: "de-esef-v1", sourceLabel: "Germany EU ESEF" },
  FR: { sourceKey: "fr-amf-disclosures", endpointEnv: "FR_AMF_DISCLOSURES_API_URL", issuerMapEnv: "FR_ISSUER_MAP_JSON", parserVersion: "fr-amf-disclosures-v1", sourceLabel: "France AMF disclosures" },
};

function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
function endpointFor(config: { endpointEnv: string }) { const value = process.env[config.endpointEnv]?.trim(); return value && /^https?:\/\//i.test(value) ? value : null; }
function issuerMapFor(config: { issuerMapEnv: string }): RegionalIssuer[] { try { const parsed = JSON.parse(process.env[config.issuerMapEnv] ?? "[]") as unknown; return Array.isArray(parsed) ? parsed.filter((row): row is RegionalIssuer => Boolean(row && typeof row === "object" && typeof (row as RegionalIssuer).symbol === "string" && typeof (row as RegionalIssuer).name === "string")) : []; } catch { return []; } }

export function resolveRegionalIssuer(issuers: RegionalIssuer[], query: string) { const normalized = query.trim().toUpperCase(); return issuers.find((issuer) => [issuer.symbol, issuer.name, issuer.lei, issuer.isin].some((value) => value?.toUpperCase() === normalized)) ?? null; }

export function parseRegionalDisclosures(payload: unknown, marketId: MarketId): RegionalDisclosure[] {
  if (!payload || typeof payload !== "object") throw new Error(`${marketId} disclosure payload is not an object`);
  const rows = (payload as { disclosures?: unknown }).disclosures;
  if (!Array.isArray(rows)) throw new Error(`${marketId} disclosure schema mismatch: disclosures array missing`);
  return rows.map((row, index) => {
    if (!row || typeof row !== "object") throw new Error(`${marketId} disclosure schema mismatch at row ${index}`);
    const value = row as Record<string, unknown>;
    const id = typeof value.id === "string" ? value.id : "";
    const issuerName = typeof value.issuerName === "string" ? value.issuerName : "";
    const headline = typeof value.headline === "string" ? value.headline : "";
    const filedAt = typeof value.filedAt === "string" ? value.filedAt : "";
    const documentUrl = typeof value.documentUrl === "string" ? value.documentUrl : "";
    if (!id || !issuerName || !headline || !filedAt || !/^https?:\/\//i.test(documentUrl) || Number.isNaN(new Date(filedAt).getTime())) throw new Error(`${marketId} disclosure schema mismatch at row ${index}`);
    return { id, issuerName, issuerSymbol: typeof value.issuerSymbol === "string" ? value.issuerSymbol : undefined, issuerLei: typeof value.issuerLei === "string" ? value.issuerLei : undefined, headline, category: typeof value.category === "string" ? value.category : undefined, filedAt: new Date(filedAt).toISOString(), documentUrl, relatedIssuers: Array.isArray(value.relatedIssuers) ? value.relatedIssuers.filter((item): item is string => typeof item === "string") : undefined, isCorrection: typeof value.isCorrection === "boolean" ? value.isCorrection : undefined, language: typeof value.language === "string" ? value.language : undefined };
  });
}

export async function collectRegionalDisclosures(marketId: MarketId, query: string): Promise<RegionalDisclosureResult> {
  const config = CONFIG[marketId];
  const retrievedAt = new Date().toISOString();
  if (!config) return { marketId, query, status: "access-gated", disclosures: [], retrievedAt, parserVersion: "unsupported", recordsStored: 0, notes: "No regional disclosure adapter is configured for this market." };
  markCollectorStarted(config.sourceKey);
  const issuer = resolveRegionalIssuer(issuerMapFor(config), query);
  if (!issuer) { const notes = `No exact ${marketId} issuer symbol/name/LEI/ISIN mapping configured.`; markCollectorFailure(config.sourceKey, notes, notes); return { marketId, query, issuer: undefined, status: "unresolved", disclosures: [], retrievedAt, parserVersion: config.parserVersion, recordsStored: 0, notes }; }
  const endpoint = endpointFor(config);
  if (!endpoint) { const notes = `${config.endpointEnv} is not configured. ${config.sourceLabel} is not assumed to expose a stable public machine-readable endpoint.`; markCollectorFailure(config.sourceKey, notes, notes); return { marketId, query, issuer, status: "access-gated", disclosures: [], retrievedAt, parserVersion: config.parserVersion, recordsStored: 0, notes }; }
  try {
    const url = new URL(endpoint); url.searchParams.set("issuer", issuer.lei ?? issuer.isin ?? issuer.symbol);
    const response = await fetchWithRetry(url.toString(), { headers: { Accept: "application/json", "User-Agent": process.env.ANALYZERX_HTTP_USER_AGENT ?? "AnalyzerX/1.0" } }, { key: config.sourceKey, retries: 2, timeoutMs: 20_000, rateLimitMs: 1_000 });
    if (!response.ok) throw new Error(`${config.sourceLabel} HTTP ${response.status}`);
    const rawPayload = await response.text();
    const disclosures = parseRegionalDisclosures(JSON.parse(rawPayload) as unknown, marketId);
    let recordsStored = 0;
    for (const disclosure of disclosures) {
      const normalized = JSON.stringify({ marketId, issuer, disclosure });
      recordsStored += Number(await saveSourceRecord({ id: `${config.sourceKey}:${disclosure.id}`, sourceKey: config.sourceKey, sourceUrl: disclosure.documentUrl, documentName: disclosure.headline, symbol: issuer.symbol, recordType: "regional-disclosure", externalId: disclosure.id, title: disclosure.headline, publishedAt: new Date(disclosure.filedAt), reportDate: null, retrievedAt: new Date(retrievedAt), freshnessStatus: "fresh", rawPayload, normalizedPayload: normalized, dataHash: hash(normalized), parserVersion: config.parserVersion, errorMessage: null }));
    }
    markCollectorSuccess(config.sourceKey, disclosures.length);
    return { marketId, query, issuer, status: "fresh", disclosures, retrievedAt, parserVersion: config.parserVersion, recordsStored, notes: `${config.sourceLabel} disclosures collected from an explicitly configured authorized endpoint.` };
  } catch (error) {
    markCollectorFailure(config.sourceKey, error); markCollectorParsingError(config.sourceKey, error);
    return { marketId, query, issuer, status: "error", disclosures: [], retrievedAt, parserVersion: config.parserVersion, recordsStored: 0, error: String(error) };
  }
}

export function getRegionalDisclosureConfig(marketId: MarketId) { return CONFIG[marketId] ?? null; }
