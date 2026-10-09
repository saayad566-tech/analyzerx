export type PublicDataStatus = "ok" | "partial" | "stale" | "cooldown" | "unavailable" | "invalid";

export type PublicDataResult<T> = {
  sourceKey: string;
  status: PublicDataStatus;
  data: T | null;
  url: string;
  retrievedAt: string;
  httpStatus?: number;
  error?: string;
  freshnessSeconds?: number;
  provenance: { source: string; url: string; retrievedAt: string; checksum?: string };
};

export type PublicAdapter<T> = () => Promise<PublicDataResult<T>>;

const now = () => new Date().toISOString();

async function sha256(text: string) {
  if (typeof crypto !== "undefined" && "subtle" in crypto) {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
  }
  return undefined;
}

async function requestJson<T>(sourceKey: string, url: string, init?: RequestInit, options: { requiresKey?: boolean; headers?: Record<string, string> } = {}): Promise<PublicDataResult<T>> {
  const retrievedAt = now();
  try {
    const response = await fetch(url, { ...init, headers: { Accept: "application/json", ...options.headers, ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(12_000) });
    const body = await response.text();
    const checksum = await sha256(body);
    if (response.status === 401 || response.status === 403 || response.status === 429) return { sourceKey, status: "cooldown", data: null, url, retrievedAt, httpStatus: response.status, error: `Provider cooldown or authorization state: HTTP ${response.status}`, provenance: { source: sourceKey, url, retrievedAt, checksum } };
    if (!response.ok) return { sourceKey, status: "unavailable", data: null, url, retrievedAt, httpStatus: response.status, error: `Provider returned HTTP ${response.status}`, provenance: { source: sourceKey, url, retrievedAt, checksum } };
    try { return { sourceKey, status: "ok", data: JSON.parse(body) as T, url, retrievedAt, httpStatus: response.status, provenance: { source: sourceKey, url, retrievedAt, checksum } }; }
    catch { return { sourceKey, status: "invalid", data: null, url, retrievedAt, httpStatus: response.status, error: "Provider returned a non-JSON body", provenance: { source: sourceKey, url, retrievedAt, checksum } }; }
  } catch (error) {
    return { sourceKey, status: "unavailable", data: null, url, retrievedAt, error: error instanceof Error ? error.message : "Unknown provider error", provenance: { source: sourceKey, url, retrievedAt } };
  }
}

export function buildSecCompanyFactsUrl(cik: string) {
  const normalized = cik.replace(/\D/g, "").padStart(10, "0");
  return `https://data.sec.gov/api/xbrl/companyfacts/CIK${normalized}.json`;
}

export function secCompanyFacts(cik: string, userAgent = process.env.SEC_USER_AGENT): Promise<PublicDataResult<Record<string, unknown>>> {
  if (!userAgent?.trim()) return Promise.resolve({ sourceKey: "sec-company-facts", status: "unavailable", data: null, url: buildSecCompanyFactsUrl(cik), retrievedAt: now(), error: "SEC_USER_AGENT is not configured; compliant identification is required.", provenance: { source: "SEC", url: buildSecCompanyFactsUrl(cik), retrievedAt: now() } });
  return requestJson("sec-company-facts", buildSecCompanyFactsUrl(cik), undefined, { headers: { "User-Agent": userAgent } });
}

export function buildEcbDataUrl(flowRef: string, key = "") {
  return `https://data-api.ecb.europa.eu/service/data/${flowRef}${key ? `?format=csvdata&startPeriod=${encodeURIComponent(key)}` : "?format=jsondata"}`;
}

export function ecbData(flowRef: string, startPeriod?: string): Promise<PublicDataResult<Record<string, unknown>>> {
  return requestJson("ecb-sdmx", buildEcbDataUrl(flowRef, startPeriod));
}

export function buildWorldBankIndicatorUrl(country: string, indicator: string, startYear?: number, endYear?: number) {
  const range = startYear || endYear ? `&date=${startYear ?? ""}:${endYear ?? ""}` : "";
  return `https://api.worldbank.org/v2/country/${encodeURIComponent(country)}/indicator/${encodeURIComponent(indicator)}?format=json&per_page=1000${range}`;
}

export function worldBankIndicator(country: string, indicator: string, startYear?: number, endYear?: number): Promise<PublicDataResult<unknown>> {
  return requestJson("world-bank-indicators", buildWorldBankIndicatorUrl(country, indicator, startYear, endYear));
}

export function buildCoinGeckoMarketsUrl(vsCurrency = "usd", ids?: string[]) {
  const params = new URLSearchParams({ vs_currency: vsCurrency, order: "market_cap_desc", per_page: "100", page: "1", sparkline: "false" });
  if (ids?.length) params.set("ids", ids.join(","));
  return `https://api.coingecko.com/api/v3/coins/markets?${params.toString()}`;
}

export function coinGeckoMarkets(vsCurrency = "usd", ids?: string[], apiKey = process.env.COINGECKO_API_KEY): Promise<PublicDataResult<unknown>> {
  if (!apiKey?.trim()) return Promise.resolve({ sourceKey: "coingecko-demo", status: "unavailable", data: null, url: buildCoinGeckoMarketsUrl(vsCurrency, ids), retrievedAt: now(), error: "COINGECKO_API_KEY is not configured; the Demo API key is required for authenticated access.", provenance: { source: "CoinGecko", url: buildCoinGeckoMarketsUrl(vsCurrency, ids), retrievedAt: now() } });
  return requestJson("coingecko-demo", buildCoinGeckoMarketsUrl(vsCurrency, ids), undefined, { headers: { "x-cg-demo-api-key": apiKey } });
}

export type OpenFigiMappingRequest = { idType: "ID_ISIN" | "TICKER" | "ID_BB_GLOBAL" | "ID_EXCH_SYMBOL"; idValue: string; exchCode?: string };
export function openFigiMapping(requests: OpenFigiMappingRequest[]): Promise<PublicDataResult<unknown>> {
  const url = "https://api.openfigi.com/v3/mapping";
  return requestJson("openfigi", url, { method: "POST", body: JSON.stringify(requests), headers: { "Content-Type": "application/json" } });
}

export function gdeltArticles(query: string, mode: "artlist" | "timelinevol" = "artlist", maxRecords = 50): Promise<PublicDataResult<unknown>> {
  const params = new URLSearchParams({ query, mode, format: "json", maxrecords: String(Math.min(250, Math.max(1, maxRecords))), sort: "HybridRel" });
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?${params.toString()}`;
  return requestJson("gdelt-news", url);
}

export function fredObservations(seriesId: string, apiKey = process.env.FRED_API_KEY): Promise<PublicDataResult<unknown>> {
  const base = "https://api.stlouisfed.org/fred/series/observations";
  if (!apiKey?.trim()) return Promise.resolve({ sourceKey: "fred-api", status: "unavailable", data: null, url: `${base}?series_id=${encodeURIComponent(seriesId)}`, retrievedAt: now(), error: "FRED_API_KEY is not configured; FRED API requests require a key.", provenance: { source: "FRED", url: base, retrievedAt: now() } });
  const params = new URLSearchParams({ series_id: seriesId, api_key: apiKey, file_type: "json", sort_order: "asc" });
  return requestJson("fred-api", `${base}?${params.toString()}`);
}

export async function fetchPublicDataParallel<T extends Record<string, unknown>>(adapters: Record<string, PublicAdapter<unknown>>): Promise<{ data: Partial<T>; results: PublicDataResult<unknown>[]; status: "ok" | "partial" | "unavailable" }> {
  const entries = Object.entries(adapters);
  const settled: Array<[string, PublicDataResult<unknown>]> = await Promise.all(entries.map(async ([key, adapter]) => {
    try { return [key, await adapter()] as [string, PublicDataResult<unknown>]; }
    catch (error) {
      return [key, { sourceKey: key, status: "unavailable", data: null, url: "", retrievedAt: now(), error: error instanceof Error ? error.message : "Unknown adapter error", provenance: { source: key, url: "", retrievedAt: now() } } as PublicDataResult<unknown>];
    }
  }));
  const data: Partial<T> = {};
  const results = settled.map(([, result]) => result);
  for (const [key, result] of settled) if (result.status === "ok" && result.data !== null) (data as Record<string, unknown>)[key] = result.data;
  return { data, results, status: results.length > 0 && results.every((result) => result.status === "ok") ? "ok" : results.some((result) => result.status === "ok" || result.status === "partial") ? "partial" : "unavailable" };
}
