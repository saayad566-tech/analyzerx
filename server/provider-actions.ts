import { isProviderCircuitOpen, getProviderHealthFor, markProviderHealthy, markProviderRejected } from "./provider-health";
import { type MarketId } from "../lib/market-regions";
import { fetchProviderNow, type ProviderArticle } from "./optional-providers";
import { fetchIndianOpenStock } from "./indian-open-api";
import { getIndiaStockMcpSnapshot } from "./india-stock-mcp";
import { fetchDerivativesSnapshot } from "./derivatives";
import { recordProviderHealthSnapshot } from "./db";

export type ProviderRunResult = {
  providerId: string;
  symbol: string;
  status: "used" | "unsupported";
  records: number;
  summary: string;
  articles?: ProviderArticle[];
  health: ReturnType<typeof getProviderHealthFor>;
};

function asSymbol(symbol: string | undefined) {
  // No default instrument is assumed. Falling back to an Indian ticker for an
  // unspecified run is the cross-market substitution the mandate forbids.
  const clean = (symbol ?? "").trim();
  if (!clean) throw new Error("A symbol is required to run a provider; no default instrument is assumed.");
  return clean.toUpperCase();
}

function persistHealth(providerId: string) {
  const health = getProviderHealthFor(providerId);
  if (!health?.lastCheckedAt) return;
  void recordProviderHealthSnapshot({ providerId, status: health.status, circuitState: health.circuitState, failureClass: health.failureClass, latencyMs: health.latencyMs, checkedAt: new Date(health.lastCheckedAt), successAt: health.lastSuccessAt ? new Date(health.lastSuccessAt) : null, payloadPreview: health.lastPayloadPreview, errorMessage: health.lastError });
}

async function runFinnhub(symbol: string) {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) throw new Error("Finnhub is not configured");
  const endpoints = ["quote", "stock/profile2"];
  const payload: Record<string, unknown> = {};
  for (const endpoint of endpoints) {
    const url = new URL(`https://finnhub.io/api/v1/${endpoint}`);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("token", token);
    const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Finnhub ${endpoint} returned HTTP ${response.status}`);
    payload[endpoint] = await response.json();
  }
  return payload;
}

async function runIndianApi(symbol: string) {
  const token = process.env.INDIAN_API_KEY;
  if (!token) throw new Error("Indian API is not configured");
  const url = new URL("/stock", process.env.INDIAN_API_BASE_URL ?? "https://stock.indianapi.in");
  url.searchParams.set("name", symbol);
  const response = await fetch(url, { headers: { Accept: "application/json", "X-Api-Key": token }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Indian API returned HTTP ${response.status}`);
  return response.json();
}

export async function runProviderNow(providerId: string, requestedSymbol: string | undefined, marketId: MarketId): Promise<ProviderRunResult> {
  const symbol = asSymbol(requestedSymbol);
  if (isProviderCircuitOpen(providerId)) {
    const health = getProviderHealthFor(providerId);
    throw new Error(`Provider ${providerId} is cooling down until ${health?.cooldownUntil ?? "a later retry"}`);
  }
  const startedAt = Date.now();
  try {
    let payload: unknown;
    let articles: ProviderArticle[] | undefined;
    switch (providerId) {
      case "google-news-rss":
      case "marketaux":
      case "newsapi":
      case "newsdata":
      case "gnews":
        articles = await fetchProviderNow(providerId, [symbol], marketId);
        return { providerId, symbol, status: "used", records: articles.length, summary: `${articles.length} article records returned`, articles, health: getProviderHealthFor(providerId) };
      case "finnhub":
        payload = await runFinnhub(symbol);
        break;
      case "indian-api":
        payload = await runIndianApi(symbol);
        break;
      case "indian-open-api":
        payload = await fetchIndianOpenStock(symbol);
        break;
      case "india-stock-mcp":
        payload = await getIndiaStockMcpSnapshot(symbol);
        break;
      case "dhan-mcp":
        payload = await fetchDerivativesSnapshot(symbol);
        const derivativesPayload = payload as Awaited<ReturnType<typeof fetchDerivativesSnapshot>>;
        if (derivativesPayload.status === "auth_required" || derivativesPayload.status === "error") throw new Error(derivativesPayload.error ?? "Dhan derivatives provider unavailable");
        break;
      default:
        return { providerId, symbol, status: "unsupported", records: 0, summary: "No app-runtime adapter is configured for this provider; it remains visible for capability tracking.", health: getProviderHealthFor(providerId) };
    }
    markProviderHealthy(providerId, Date.now() - startedAt, payload);
    persistHealth(providerId);
    return { providerId, symbol, status: "used", records: 1, summary: "Provider payload received and preview stored", health: getProviderHealthFor(providerId) };
  } catch (error) {
    markProviderRejected(providerId, error, Date.now() - startedAt);
    persistHealth(providerId);
    throw error;
  }
}
