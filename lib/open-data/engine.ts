/**
 * AnalyzerX on-device capability engine.
 *
 * Composes the free-source adapters into the shapes the app's screens already
 * consume. Every capability returns real data when a source answers, and an
 * honest, explicitly-labelled empty/derived state when it does not. Nothing is
 * ever fabricated.
 */
import { getMarketProfile } from "../market-regions";
import {
  cached,
  clamp,
  currencyForMarket,
  nowIso,
  round,
  safeNumber,
  toDisplaySymbol,
  toYahooSymbol,
  unavailableProvenance,
  type MarketId,
  type Provenance,
  type SourceStatus, scopedCacheKey } from "./core";
import { resolveSector } from "../sector-registry";
import {
  googleNews,
  googleNewsHeadlines,
  nseAnnouncementsRss,
  nseEquityMaster,
  nseFiiDii,
  nseIndexConstituents,
  nseSmeUniverse,
  type SectorFlowRow,
  fiiDiiGithubHistory,
  fiiDiiGithubLatest,
  nsdlSectorFlows,
  yahooNewsRss,
  quoteFromSeries,
  yahooChart,
  yahooFundamentals,
  yahooSearch,
  yoyGrowth,
  YAHOO_HOSTS,
  type AnnualMetric,
  type FlowRow,
  type NewsArticle,
  type Quote,
  type UniverseRow,
  type YahooHost,
} from "./sources";
import { allLinkHealth, runChain, runMerge, type ChainAttempt } from "./chain";
import { FALLBACK_UNIVERSE, UNIVERSE_SNAPSHOT_DATE, UNIVERSE_SNAPSHOT_SOURCE } from "./universe-fallback";

const TTL = {
  quote: 60_000,
  search: 10 * 60_000,
  universe: 12 * 60 * 60_000,
  constituents: 6 * 60 * 60_000,
  fundamentals: 6 * 60 * 60_000,
  news: 10 * 60_000,
  flows: 15 * 60_000,
  history: 30 * 60_000,
};

/* ------------------------------------------------------------------ *
 * Provider registry (drives providers.* / sources.* / capabilities.*)
 * ------------------------------------------------------------------ */

export type ProviderCapability =
  | "quotes"
  | "search"
  | "universe"
  | "fundamentals"
  | "news"
  | "flows"
  | "sectors"
  | "peers"
  | "macro"
  | "crypto"
  | "filings";

export type ProviderRecord = {
  key: string;
  name: string;
  capability: ProviderCapability;
  markets: MarketId[];
  endpoint: string;
  credentialState: "none-required" | "auth_required";
  licensing: string;
  freshnessTargetSeconds: number;
  status: SourceStatus;
  lastSuccessAt: string | null;
  lastError: string | null;
  latencyMs: number | null;
};

const PROVIDER_DEFS: Omit<ProviderRecord, "status" | "lastSuccessAt" | "lastError" | "latencyMs">[] = [
  { key: "yahoo-finance", name: "Yahoo Finance", capability: "quotes", markets: ["IN", "US", "GB", "CA", "AU", "JP", "SG", "HK", "DE", "FR"], endpoint: "https://query1.finance.yahoo.com/v8/finance/chart", credentialState: "none-required", licensing: "Public endpoint, no key. Redistribution of raw data is restricted; shown for personal research use.", freshnessTargetSeconds: 60 },
  { key: "yahoo-search", name: "Yahoo Finance Search", capability: "search", markets: ["IN", "US", "GB", "CA", "AU", "JP", "SG", "HK", "DE", "FR"], endpoint: "https://query2.finance.yahoo.com/v1/finance/search", credentialState: "none-required", licensing: "Public endpoint, no key.", freshnessTargetSeconds: 3600 },
  { key: "yahoo-fundamentals", name: "Yahoo Finance Fundamentals", capability: "fundamentals", markets: ["IN", "US", "GB", "CA", "AU", "JP", "SG", "HK", "DE", "FR"], endpoint: "https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries", credentialState: "none-required", licensing: "Public endpoint, no key.", freshnessTargetSeconds: 86_400 },
  { key: "nse-equity-master", name: "NSE Equity Master", capability: "universe", markets: ["IN"], endpoint: "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv", credentialState: "none-required", licensing: "NSE public archive.", freshnessTargetSeconds: 86_400 },
  { key: "nse-index-constituents", name: "NSE Index Constituents", capability: "sectors", markets: ["IN"], endpoint: "https://nsearchives.nseindia.com/content/indices", credentialState: "none-required", licensing: "NSE public archive.", freshnessTargetSeconds: 86_400 },
  { key: "nse-fii-dii", name: "NSE FII/DII", capability: "flows", markets: ["IN"], endpoint: "https://www.nseindia.com/api/fiidiiTradeReact", credentialState: "none-required", licensing: "NSE public endpoint.", freshnessTargetSeconds: 3600 },
  { key: "google-news-rss", name: "Google News RSS", capability: "news", markets: ["IN", "US", "GB", "CA", "AU", "JP", "SG", "HK", "DE", "FR"], endpoint: "https://news.google.com/rss/search", credentialState: "none-required", licensing: "RSS feed; links to original publishers.", freshnessTargetSeconds: 600 },
  { key: "gdelt", name: "GDELT DOC 2.0", capability: "news", markets: ["US", "GB", "DE", "FR", "JP", "IN"], endpoint: "https://api.gdeltproject.org/api/v2/doc/doc", credentialState: "none-required", licensing: "Open API.", freshnessTargetSeconds: 900 },
  { key: "sec-edgar", name: "SEC EDGAR", capability: "filings", markets: ["US"], endpoint: "https://data.sec.gov", credentialState: "none-required", licensing: "Public domain, descriptive User-Agent required.", freshnessTargetSeconds: 3600 },
  { key: "ecb-sdmx", name: "ECB SDMX", capability: "macro", markets: ["DE", "FR"], endpoint: "https://data-api.ecb.europa.eu/service/data", credentialState: "none-required", licensing: "Open data.", freshnessTargetSeconds: 86_400 },
  { key: "coingecko", name: "CoinGecko", capability: "crypto", markets: ["US", "GB", "DE", "FR", "JP", "IN"], endpoint: "https://api.coingecko.com/api/v3", credentialState: "none-required", licensing: "Free tier, attribution required.", freshnessTargetSeconds: 300 },
];

const health = new Map<string, { status: SourceStatus; lastSuccessAt: string | null; lastError: string | null; latencyMs: number | null }>();

export function recordHealth(key: string, ok: boolean, latencyMs: number | null, error?: unknown) {
  health.set(key, {
    status: ok ? "live" : "error",
    lastSuccessAt: ok ? nowIso() : health.get(key)?.lastSuccessAt ?? null,
    lastError: ok ? null : String(error).slice(0, 240),
    latencyMs,
  });
}

export function providerRegistry(): ProviderRecord[] {
  const chainHealth = new Map(allLinkHealth().map((entry) => [entry.key, entry]));
  return PROVIDER_DEFS.map((def) => {
    const h = chainHealth.get(def.key) ?? health.get(def.key);
    return {
      ...def,
      status: h?.status ?? "live",
      lastSuccessAt: h?.lastSuccessAt ?? null,
      lastError: h?.lastError ?? null,
      latencyMs: h?.latencyMs ?? null,
    };
  });
}

async function tracked<T>(key: string, run: () => Promise<{ latencyMs: number } & T>): Promise<T> {
  try {
    const result = await run();
    recordHealth(key, true, result.latencyMs);
    return result;
  } catch (error) {
    recordHealth(key, false, null, error);
    throw error;
  }
}

/* ------------------------------------------------------------------ *
 * Quotes / snapshot
 * ------------------------------------------------------------------ */

export type MarketSnapshot = {
  symbol: string;
  source: string;
  sourceUrl: string;
  asOf: string;
  status: SourceStatus;
  quote: Quote | null;
  provenance: Provenance;
  note?: string;
  /** Every provider the failover chain tried, in order. */
  chain?: ChainAttempt[];
};

type QuoteLinkValue = { quote: Quote; url: string; latencyMs: number; onBse: boolean; host: YahooHost; providerKey: string; providerName: string };

export async function snapshot(symbol: string, marketId: MarketId): Promise<MarketSnapshot> {
  const primary = toYahooSymbol(symbol, marketId);
  const clean = symbol.trim().toUpperCase();
  const hasSuffix = /\.(NS|BO|L|T|DE|PA|AS|MI|HK|SI|AX|TO|V|F)$/.test(clean) || clean.startsWith("^") || clean.includes("-");
  // Indian names trade on both exchanges, and Yahoo serves both hosts: the chain
  // covers NSE, BSE and a second Yahoo host, so one failure never blanks a quote.
  const listings = !hasSuffix && marketId === "IN" ? [primary, `${clean}.BO`] : [primary];

  const links = listings.flatMap((listing) =>
    (["query1", "query2"] as YahooHost[]).map((host) => {
      const onBse = listing.endsWith(".BO");
      return {
        key: `yahoo-${host}${onBse ? "-bse" : ""}`,
        name: `Yahoo Finance (${host}${onBse ? " · BSE listing" : ""})`,
        run: async (): Promise<QuoteLinkValue | null> => {
          const result = await cached(scopedCacheKey(marketId, `quote:${listing}:${host}`), TTL.quote, () =>
            yahooChart(listing, "5d", "1d", host),
          );
          const quote = quoteFromSeries(result.value.series);
          if (quote.current === null) return null;
          return {
            quote,
            url: result.value.url,
            latencyMs: result.value.latencyMs,
            onBse,
            host,
            providerKey: `yahoo-${host}${onBse ? "-bse" : ""}`,
            providerName: `Yahoo Finance (${host}${onBse ? " · BSE listing" : ""})`,
          };
        },
      };
    }),
  );

  const outcome = await runChain<QuoteLinkValue>(links);
  const attempts = outcome.attempts;

  if (outcome.value) {
    const { quote, url, latencyMs, onBse, providerKey, providerName } = outcome.value;
    const status: SourceStatus = outcome.degraded ? "delayed" : "live";
    return {
      symbol: quote.displaySymbol || clean,
      source: onBse ? "Yahoo Finance (BSE)" : "Yahoo Finance (NSE)",
      sourceUrl: url,
      asOf: quote.asOf ?? nowIso(),
      status,
      quote,
      chain: attempts,
      provenance: {
        sourceKey: providerKey,
        sourceName: providerName,
        sourceType: "market-data",
        url,
        retrievedAt: nowIso(),
        asOf: quote.asOf,
        status,
        latencyMs,
        basis: "reported",
        ...(outcome.degraded ? { note: `${attempts.filter((a) => !a.ok).length} provider(s) failed before ${providerName} answered.` } : {}),
      },
    };
  }

  return {
    symbol: clean,
    source: "Yahoo Finance",
    sourceUrl: `https://query1.finance.yahoo.com/v8/finance/chart/${primary}`,
    asOf: nowIso(),
    status: "unavailable",
    quote: null,
    chain: attempts,
    provenance: unavailableProvenance(
      "yahoo-finance",
      "Yahoo Finance",
      "market-data",
      `chart/${primary}`,
      `All ${attempts.length} quote providers failed: ${attempts.map((a) => a.error).filter(Boolean).join(" | ").slice(0, 200)}`,
    ),
    note: `Live quote unavailable from all ${attempts.length} providers (NSE, BSE and both Yahoo hosts were tried).`,
  };
}

export async function quotes(symbols: string[], marketId: MarketId): Promise<MarketSnapshot[]> {
  return Promise.all(symbols.slice(0, 12).map((symbol) => snapshot(symbol, marketId)));
}

/* ------------------------------------------------------------------ *
 * Search
 * ------------------------------------------------------------------ */

export type SearchResult = {
  symbol: string;
  name: string;
  exchange: string;
  market: string;
  source: string;
  quoteType: string;
};

export type SearchPayload = {
  query: string;
  marketId: MarketId;
  marketLabel: string;
  results: SearchResult[];
  eventProjections: never[];
  sources: { yahooSearch: boolean; nseUniverse: boolean };
  errors: { yahooSearch: string | null; nseUniverse: string | null };
};

const marketLabelOf = (marketId: MarketId) => getMarketProfile(marketId).country;

export async function search(query: string, marketId: MarketId): Promise<SearchPayload> {
  const q = query.trim();
  let yahooError: string | null = null;
  let nseError: string | null = null;
  const results: SearchResult[] = [];

  try {
    const outcome = await runChain([
      { key: "yahoo-query2-search", name: "Yahoo Finance search (query2)", run: () => cached(scopedCacheKey(marketId, `search:q2:${q}`), TTL.search, () => yahooSearch(q, 15, "query2")) },
      { key: "yahoo-query1-search", name: "Yahoo Finance search (query1)", run: () => cached(scopedCacheKey(marketId, `search:q1:${q}`), TTL.search, () => yahooSearch(q, 15, "query1")) },
    ]);
    if (!outcome.value) throw new Error("Both Yahoo search hosts failed.");
    const hit = outcome.value;
    for (const row of hit.value.hits) {
      results.push({
        symbol: row.displaySymbol,
        name: row.name,
        exchange: row.exchange,
        market: row.isIndian ? "IN" : "GLOBAL",
        source: "Yahoo Finance",
        quoteType: row.quoteType,
      });
    }
  } catch (error) {
    yahooError = String(error).slice(0, 200);
  }

  // Local fallback: match against the cached NSE equity master so search still
  // works offline and for Indian names Yahoo indexes poorly.
  if (results.length < 3) {
    try {
      const universe = await nseUniverse();
      const needle = q.toLowerCase();
      for (const row of universe.securities) {
        if (row.symbol.toLowerCase().includes(needle) || row.name.toLowerCase().includes(needle)) {
          results.push({ symbol: row.symbol, name: row.name, exchange: "NSE", market: "IN", source: "NSE Equity Master", quoteType: "EQUITY" });
          if (results.length >= 20) break;
        }
      }
    } catch (error) {
      nseError = String(error).slice(0, 200);
    }
  }

  const deduped = [...new Map(results.map((r) => [`${r.symbol}:${r.name}`.toUpperCase(), r])).values()];
  const scoped = marketId === "IN" ? deduped.sort((a, b) => Number(b.market === "IN") - Number(a.market === "IN")) : deduped;
  return {
    query: q,
    marketId,
    marketLabel: marketLabelOf(marketId),
    results: scoped.slice(0, 25),
    eventProjections: [],
    sources: { yahooSearch: !yahooError, nseUniverse: !nseError },
    errors: { yahooSearch: yahooError, nseUniverse: nseError },
  };
}

/* ------------------------------------------------------------------ *
 * Universe (NSE equity master)
 * ------------------------------------------------------------------ */

export type UniverseSecurity = {
  symbol: string;
  name: string;
  isin: string;
  series: string;
  market: "IN";
  /** Present when the source (or the pinned snapshot) publishes an industry. */
  industry?: string;
};

export type UniverseSnapshot = {
  asOf: string;
  sourceUrls: string[];
  checksum: string;
  securities: UniverseSecurity[];
  errors: string[];
};

function checksumOf(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}

export async function nseUniverse(): Promise<UniverseSnapshot> {
  const industryBySymbol = new Map(FALLBACK_UNIVERSE.map((row) => [row.symbol.toUpperCase(), row.industry]));
  try {
    const outcome = await runChain([
      { key: "nse-equity-master", name: "NSE Equity Master", run: () => cached(scopedCacheKey("IN", "universe:nse"), TTL.universe, () => nseEquityMaster()) },
      { key: "nse-sme-universe", name: "NSE SME Universe", run: () => cached(scopedCacheKey("IN", "universe:nse-sme"), TTL.universe, () => nseSmeUniverse()) },
    ]);
    if (!outcome.value) throw new Error("Every NSE universe provider failed.");
    const result = outcome.value;
    const securities: UniverseSecurity[] = result.value.rows.map((row: UniverseRow) => ({
      symbol: row.symbol,
      name: row.name,
      isin: row.isin,
      series: row.series,
      market: "IN" as const,
      // The live equity master has no industry column; the pinned constituent
      // snapshot supplies it where the symbol is known.
      industry: industryBySymbol.get(row.symbol.toUpperCase()),
    }));
    if (securities.length === 0) throw new Error("The NSE universe source returned no rows.");
    return {
      asOf: nowIso(),
      sourceUrls: [result.value.url],
      checksum: checksumOf(`${securities.length}:${securities[0]?.symbol ?? ""}`),
      securities,
      errors: [],
    };
  } catch (error) {
    // The live source is unreachable from this network. Fall back to the pinned
    // official snapshot so the Screener and every other universe consumer still
    // has real candidates instead of rendering 0/0.
    return {
      asOf: nowIso(),
      sourceUrls: [UNIVERSE_SNAPSHOT_SOURCE],
      checksum: checksumOf(`fallback:${FALLBACK_UNIVERSE.length}`),
      securities: FALLBACK_UNIVERSE.map((row) => ({
        symbol: row.symbol,
        name: row.name,
        isin: row.isin,
        series: row.series,
        market: "IN" as const,
        industry: row.industry,
      })),
      errors: [
        `Live NSE universe unavailable; using the pinned official snapshot captured ${UNIVERSE_SNAPSHOT_DATE}. ${String(error).slice(0, 160)}`,
      ],
    };
  }
}

/* ------------------------------------------------------------------ *
 * Fundamentals
 * ------------------------------------------------------------------ */

export { buildFundamentalAnalysis as fundamentals } from "./fundamentals";
export type { FundamentalAnalysis } from "@/server/fundamental-analysis";

/* ------------------------------------------------------------------ *
 * News
 * ------------------------------------------------------------------ */

export type NewsPayload = {
  symbol: string;
  fetchedAt: string;
  stale: boolean;
  freshArticleCount: number;
  providerFailures: number;
  articles: NewsArticle[];
  sources: Array<{ key: string; name: string; status: SourceStatus }>;
  /** Every news provider the merge tried, with per-provider counts. */
  chain?: ChainAttempt[];
};

export async function stockNews(symbol: string, limit: number, marketId: MarketId): Promise<NewsPayload> {
  const clean = toDisplaySymbol(toYahooSymbol(symbol, marketId));
  const yahooSymbol = toYahooSymbol(symbol, marketId);

  // Three independent news providers. If one feed is down or rate-limited the
  // others still supply coverage, and every provider's contribution is recorded.
  const merge = await runMerge<NewsArticle>(
    [
      {
        key: "google-news-rss",
        name: "Google News RSS",
        run: async () => (await cached(scopedCacheKey(marketId, `news:g:${clean}`), TTL.news, () => googleNews(`"${clean}" OR "${symbol}" stock`, clean, limit))).value.articles,
      },
      {
        key: "yahoo-news-rss",
        name: "Yahoo Finance news RSS",
        run: async () => (await cached(scopedCacheKey(marketId, `news:y:${clean}`), TTL.news, () => yahooNewsRss(yahooSymbol, limit))).value.articles,
      },
      {
        key: "nse-announcements-rss",
        name: "NSE announcements RSS",
        run: async () =>
          (await cached(scopedCacheKey("IN", "news:nse-announcements"), TTL.news, () => nseAnnouncementsRss(60))).value.articles.filter(
            (article) => article.headline.toUpperCase().includes(clean) || article.summary.toUpperCase().includes(clean),
          ),
      },
    ],
    { key: (article) => article.id, limit: 250 },
  );

  const articles = [...merge.items].sort(
    (a, b) => (Date.parse(b.publishedAt ?? "") || 0) - (Date.parse(a.publishedAt ?? "") || 0),
  );
  const freshCount = articles.filter((a) => a.publishedAt && Date.now() - Date.parse(a.publishedAt) < 3 * 86_400_000).length;
  return {
    symbol: clean,
    fetchedAt: nowIso(),
    stale: freshCount === 0,
    freshArticleCount: freshCount,
    providerFailures: merge.providers.filter((p) => p.status === "error").length,
    articles,
    sources: merge.providers.map((p) => ({ key: p.key, name: p.name, status: p.status })),
    chain: merge.attempts,
  };
}

export async function marketNews(limit = 60): Promise<NewsPayload> {
  const merge = await runMerge<NewsArticle>(
    [
      {
        key: "google-news-rss",
        name: "Google News RSS (market)",
        run: async () => (await cached(scopedCacheKey(marketId, "news:market:g"), TTL.news, () => googleNewsHeadlines(limit))).value.articles,
      },
      {
        key: "nse-announcements-rss",
        name: "NSE announcements RSS",
        run: async () => (await cached(scopedCacheKey("IN", "news:nse-announcements"), TTL.news, () => nseAnnouncementsRss(60))).value.articles,
      },
    ],
    { key: (article) => article.id, limit: 300 },
  );

  const articles = [...merge.items].sort(
    (a, b) => (Date.parse(b.publishedAt ?? "") || 0) - (Date.parse(a.publishedAt ?? "") || 0),
  );
  return {
    symbol: "",
    fetchedAt: nowIso(),
    stale: false,
    freshArticleCount: articles.length,
    providerFailures: merge.providers.filter((p) => p.status === "error").length,
    articles,
    sources: merge.providers.map((p) => ({ key: p.key, name: p.name, status: p.status })),
    chain: merge.attempts,
  };
}

/* ------------------------------------------------------------------ *
 * Institutional flows (NSE FII/DII)
 * ------------------------------------------------------------------ */

export type InstitutionalParticipant = "FII/FPI" | "DII";
export type FlowRange = "TODAY" | "THREE_DAYS" | "ONE_WEEK" | "ONE_MONTH" | "QTD";

/**
 * The flow contract is taken verbatim from the original server module
 * (server/nse-flows.ts) because the screens were written against it. Emitting
 * anything else makes the UI read undefined fields and render wrong numbers.
 */
export type InstitutionalFlowRow = {
  participant: InstitutionalParticipant;
  buy: number | null;
  sell: number | null;
  net: number | null;
};

export type InstitutionalHistoryRecord = {
  reportDate: string;
  rows: InstitutionalFlowRow[];
};

export type InstitutionalFlowComparison = {
  participant: InstitutionalParticipant;
  currentNet: number | null;
  previousNet: number | null;
  changePct: number | null;
};

export type InstitutionalFlows = {
  status: SourceStatus;
  source: string;
  upstream: "NSE" | "NSE via intermediary";
  reportDate: string | null;
  fetchedAt: string;
  freshnessLabel: string;
  freshnessBusinessDays: number | null;
  rows: InstitutionalFlowRow[];
  history: InstitutionalHistoryRecord[];
  range: string;
  rangeLabel: string;
  comparison: InstitutionalFlowComparison[];
  error: string | null;
  /** Fortnightly FPI sector allocation (NSDL-derived). Device-side source. */
  sectorAllocation?: { rows: SectorFlowRow[]; asOf: string | null; source: string; error: string | null };
};

/** Sum buy/sell/net per participant across the records in a window. */
function aggregateFlows(records: InstitutionalHistoryRecord[]): InstitutionalFlowRow[] {
  return (["FII/FPI", "DII"] as InstitutionalParticipant[]).map((participant) => {
    const rows = records
      .map((record) => record.rows.find((row) => row.participant === participant))
      .filter((row): row is InstitutionalFlowRow => Boolean(row));
    const add = (key: "buy" | "sell" | "net") => {
      const values = rows.map((row) => row[key]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      return values.length ? Number(values.reduce((sum, value) => sum + value, 0).toFixed(2)) : null;
    };
    return { participant, buy: add("buy"), sell: add("sell"), net: add("net") };
  });
}

/** Split the newest-first history into the selected window and the one before it. */
function rangeRecords(
  history: InstitutionalHistoryRecord[],
  range: string,
): { current: InstitutionalHistoryRecord[]; previous: InstitutionalHistoryRecord[] } {
  if (!history.length) return { current: [], previous: [] };
  if (range === "TODAY") return { current: history.slice(0, 1), previous: history.slice(1, 2) };
  if (range === "QTD") {
    const anchor = new Date(`${history[0].reportDate}T00:00:00.000Z`);
    if (Number.isNaN(anchor.getTime())) return { current: history, previous: [] };
    const quarterStart = new Date(Date.UTC(anchor.getUTCFullYear(), Math.floor(anchor.getUTCMonth() / 3) * 3, 1));
    const current = history.filter((item) => new Date(`${item.reportDate}T00:00:00.000Z`) >= quarterStart);
    return { current, previous: history.slice(current.length, current.length * 2) };
  }
  const size = range === "THREE_DAYS" ? 3 : range === "ONE_WEEK" ? 5 : 22;
  return { current: history.slice(0, size), previous: history.slice(size, size * 2) };
}

function percentChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return Number((((current - previous) / Math.abs(previous)) * 100).toFixed(2));
}

const RANGE_LABELS: Record<string, string> = { TODAY: "Today", THREE_DAYS: "Last 3 sessions", ONE_WEEK: "Last week", ONE_MONTH: "Last month", QTD: "Quarter to date" };

export async function institutionalFlows(range = "TODAY"): Promise<InstitutionalFlows> {
  let status: SourceStatus = "unavailable";
  let sourceName = "NSE FII/DII provisional report";
  let upstream: "NSE" | "NSE via intermediary" = "NSE";
  let reportDate: string | null = null;
  let freshnessLabel = "Unavailable";
  let error: string | null = null;
  let liveRows: InstitutionalFlowRow[] = [];

  // Primary: NSE's own provisional report for the current session.
  const nseOutcome = await runChain([
    { key: "nse-fii-dii", name: "NSE FII/DII", run: () => cached(scopedCacheKey("IN", "flows:fii-dii"), TTL.flows, () => nseFiiDii()) },
  ]);

  if (nseOutcome.value) {
    liveRows = nseOutcome.value.value.rows.map((row) => ({
      participant: /DII/i.test(row.category) ? ("DII" as const) : ("FII/FPI" as const),
      buy: row.buyValue,
      sell: row.sellValue,
      net: row.netValue,
    }));
    status = "fresh";
    reportDate = nseOutcome.value.value.rows[0]?.date ?? null;
    freshnessLabel = "Provisional, as published by NSE";
  } else {
    // Secondary: the keyless GitHub-hosted dataset, which carries its own chain.
    const gh = await runChain([
      { key: "fii-dii-github", name: "FII/DII open dataset", run: () => cached(scopedCacheKey("IN", "flows:fii-dii-github"), TTL.flows, () => fiiDiiGithubLatest()) },
    ]);
    const ghSession = gh.value ? gh.value.value.session : null;
    if (ghSession) {
      const leg = ghSession.equity;
      liveRows = [
        { participant: "FII/FPI", buy: leg.fiiBuy, sell: leg.fiiSell, net: leg.fiiNet },
        { participant: "DII", buy: leg.diiBuy, sell: leg.diiSell, net: leg.diiNet },
      ];
      status = "fresh";
      sourceName = "FII/DII open dataset (keyless, GitHub-hosted)";
      upstream = "NSE via intermediary";
      reportDate = ghSession.date;
      freshnessLabel = `Via ${ghSession.upstream}; provisional until custodian confirmation`;
    } else {
      error = `NSE and the open dataset both failed: ${nseOutcome.attempts[0]?.error ?? "unknown"}`;
    }
  }

  // History: newest first, matching the server contract so the range windows
  // and the screens' slicing both behave as designed.
  let history: InstitutionalHistoryRecord[] = [];
  try {
    const backfill = await cached(scopedCacheKey("IN", "flows:fii-dii-history"), 6 * 60 * 60_000, () => fiiDiiGithubHistory(30));
    history = backfill.value.sessions
      .map((session) => ({
        reportDate: session.date,
        rows: [
          { participant: "FII/FPI" as const, buy: session.equity.fiiBuy, sell: session.equity.fiiSell, net: session.equity.fiiNet },
          { participant: "DII" as const, buy: session.equity.diiBuy, sell: session.equity.diiSell, net: session.equity.diiNet },
        ],
      }))
      .filter((record) => record.rows.some((row) => row.net !== null || row.buy !== null || row.sell !== null))
      .sort((a, b) => b.reportDate.localeCompare(a.reportDate));
  } catch {
    history = [];
  }

  // If the live session could not be fetched but history exists, the newest
  // history record is the live session. It is labelled as backfilled.
  if (liveRows.length === 0 && history.length > 0) {
    liveRows = history[0].rows;
    status = "fresh";
    sourceName = "FII/DII open dataset (keyless, GitHub-hosted)";
    upstream = "NSE via intermediary";
    reportDate = history[0].reportDate;
    freshnessLabel = "Backfilled from the open dataset; provisional until custodian confirmation";
  }

  // The selected range must actually change the numbers, so the rows become the
  // aggregate over the window and the comparison is like-for-like.
  const windows = rangeRecords(history, range);
  const rows = windows.current.length ? aggregateFlows(windows.current) : liveRows;
  const previousRows = aggregateFlows(windows.previous);
  const comparison: InstitutionalFlowComparison[] = rows.map((row) => {
    const previousNet = previousRows.find((item) => item.participant === row.participant)?.net ?? null;
    return {
      participant: row.participant,
      currentNet: row.net,
      previousNet,
      changePct: percentChange(row.net, previousNet),
    };
  });
  const sessions = windows.current.length || (liveRows.length ? 1 : 0);
  const rangeLabel = `${RANGE_LABELS[range] ?? range} · ${sessions} session${sessions === 1 ? "" : "s"} available`;

  const sectorAllocation = await sectorInstitutionalFlows();

  return {
    status,
    source: sourceName,
    upstream,
    reportDate,
    fetchedAt: nowIso(),
    freshnessLabel,
    freshnessBusinessDays: 0,
    rows,
    history,
    range,
    rangeLabel,
    comparison,
    error,
    sectorAllocation,
  };
}

/** NSDL-derived fortnightly FPI sector allocation. Device-side source. */
export async function sectorInstitutionalFlows(): Promise<{ rows: SectorFlowRow[]; asOf: string | null; source: string; error: string | null }> {
  const outcome = await runChain([
    { key: "nsdl-sector-flows", name: "NSDL FPI sector allocation", run: () => cached(scopedCacheKey("IN", "flows:sector"), 6 * 60 * 60_000, () => nsdlSectorFlows()) },
  ]);
  if (!outcome.value) {
    return { rows: [], asOf: null, source: "NSDL FPI sector allocation", error: `Sector flow dataset unavailable: ${outcome.attempts[0]?.error ?? "unknown"}` };
  }
  return { rows: outcome.value.value.rows, asOf: outcome.value.value.asOf, source: outcome.value.value.url, error: null };
}

/* ------------------------------------------------------------------ *
 * Sectors / peers (NSE index constituents)
 * ------------------------------------------------------------------ */

export type SectorConstituent = {
  symbol: string;
  name: string;
  industry: string;
  sector: string;
  score: number;
  source: string;
};

export async function sectorConstituents(
  sector: string,
  limit = 100,
): Promise<{
  sector: string;
  asOf: string;
  constituents: SectorConstituent[];
  source: string;
  error: string | null;
  /** "supported" | "unsupported" | "error" — lets the UI distinguish an
   *  uncovered sector from a failed request without parsing an error string. */
  status: "supported" | "unsupported" | "error";
  /** Human-readable explanation, present whenever status is not "supported". */
  reason: string | null;
}> {
  // Resolve through the verified registry rather than concatenating "NIFTY"
  // with the sector name, which produced invalid symbols like
  // NIFTYRENEWABLEENERGY and surfaced a raw SourceError in the UI.
  const resolution = resolveSector(sector);
  if (resolution.status === "unsupported") {
    return {
      sector: resolution.displayName,
      asOf: nowIso(),
      constituents: [],
      source: resolution.entry?.source ?? "No verified NSE constituent index",
      error: null,
      status: "unsupported",
      reason: resolution.reason,
    };
  }

  const indexKey = resolution.indexKey;
  try {
    const result = await cached(scopedCacheKey("IN", `sector:${indexKey}`), TTL.constituents, () =>
      tracked("nse-index-constituents", () => nseIndexConstituents(indexKey)),
    );
    const constituents = result.value.rows.slice(0, limit).map((row) => ({
      symbol: row.symbol,
      name: row.name,
      industry: row.industry,
      sector: row.industry,
      // No per-constituent score is invented here; scoring happens in the caller
      // for a bounded prefix and the rest stay explicitly unscored.
      score: 50,
      source: "NSE index constituents",
    }));
    return { sector: resolution.entry.displayName, asOf: nowIso(), constituents, source: result.value.url, error: null, status: "supported", reason: null };
  } catch (error) {
    return {
      sector: resolution.entry.displayName,
      asOf: nowIso(),
      constituents: [],
      source: `NSE ${indexKey} (${resolution.entry.source})`,
      // A plain, human-readable message — never a raw exception class name.
      error: `The NSE constituent file for ${resolution.entry.displayName} could not be retrieved.`,
      status: "error",
      reason: String(error).slice(0, 200),
    };
  }
}

export type PeerComparison = {
  symbol: string;
  asOf: string;
  peers: Array<{ symbol: string; name: string; pe: number | null; marketCap: null; source: string }>;
  comparisonBasis: string;
  unavailable: string[];
};

export async function peerComparison(symbol: string, marketId: MarketId): Promise<PeerComparison> {
  const clean = toDisplaySymbol(toYahooSymbol(symbol, marketId));
  const unavailable: string[] = [];
  // Find the sector the symbol belongs to using the NSE index lists we can fetch.
  const indexKeys = ["NIFTY50", "NIFTYBANK", "NIFTYIT", "NIFTYAUTO", "NIFTYPHARMA", "NIFTYFMCG", "NIFTYMETAL", "NIFTYENERGY", "NIFTYREALTY", "NIFTYFINSERVICE"];
  for (const indexKey of indexKeys) {
    try {
      const result = await cached(scopedCacheKey("IN", `sector:${indexKey}`), TTL.constituents, () => tracked("nse-index-constituents", () => nseIndexConstituents(indexKey)));
      const match = result.value.rows.find((row) => row.symbol === clean);
      if (match) {
        const peers = result.value.rows.filter((row) => row.symbol !== clean).slice(0, 8);
        const withPe = await Promise.all(
          peers.map(async (peer) => {
            try {
              const snap = await snapshot(peer.symbol, marketId);
              const eps = latestEpsCache.get(peer.symbol) ?? null;
              return { symbol: peer.symbol, name: peer.name, pe: snap.quote?.current && eps ? round(snap.quote.current / eps, 2) : null, marketCap: null as null, source: "Yahoo Finance" };
            } catch {
              return { symbol: peer.symbol, name: peer.name, pe: null, marketCap: null as null, source: "Unavailable" };
            }
          }),
        );
        return {
          symbol: clean,
          asOf: nowIso(),
          peers: withPe,
          comparisonBasis: `Peers taken from the ${indexKey} constituent list; P/E derived from the latest price and latest reported annual EPS.`,
          unavailable,
        };
      }
    } catch (error) {
      unavailable.push(`${indexKey}: ${String(error).slice(0, 80)}`);
    }
  }
  return { symbol: clean, asOf: nowIso(), peers: [], comparisonBasis: "No matching NSE index membership was found for this symbol.", unavailable };
}

/** Small cache so peer P/E derivation does not refetch EPS repeatedly. */
const latestEpsCache = new Map<string, number | null>();

export async function primeEps(symbols: string[], marketId: MarketId) {
  await Promise.all(
    symbols.map(async (symbol) => {
      if (latestEpsCache.has(symbol)) return;
      try {
        const result = await cached(scopedCacheKey(marketId, `fund:${toYahooSymbol(symbol, marketId)}`), TTL.fundamentals, () => tracked("yahoo-fundamentals", () => yahooFundamentals(toYahooSymbol(symbol, marketId))));
        const points = result.value.data.metrics.annualDilutedEPS ?? [];
        const latest = points.length ? [...points].sort((a, b) => a.asOfDate.localeCompare(b.asOfDate)).slice(-1)[0] : null;
        latestEpsCache.set(symbol, latest?.raw ?? null);
      } catch {
        latestEpsCache.set(symbol, null);
      }
    }),
  );
}

/* ------------------------------------------------------------------ *
 * History (for charts)
 * ------------------------------------------------------------------ */

export async function priceHistory(symbol: string, range = "6mo", interval = "1d", marketId: MarketId) {
  const yahooSymbol = toYahooSymbol(symbol, marketId);
  const outcome = await runChain(
    (["query1", "query2"] as YahooHost[]).map((host) => ({
      key: `yahoo-${host}`,
      name: `Yahoo Finance (${host})`,
      run: () => cached(scopedCacheKey(marketId, `history:${yahooSymbol}:${range}:${interval}:${host}`), TTL.history, () => yahooChart(yahooSymbol, range, interval, host)),
    })),
  );
  if (!outcome.value) throw new Error(`Price history unavailable from all ${outcome.attempts.length} providers.`);
  const result = outcome.value;
  const series = result.value.series;
  const points = series.timestamps
    .map((ts, index) => ({ t: new Date(ts * 1000).toISOString(), c: series.closes[index] ?? null }))
    .filter((point) => point.c !== null);
  return { symbol: toDisplaySymbol(yahooSymbol), range, interval, points, source: result.value.url, latencyMs: result.value.latencyMs };
}

/* ------------------------------------------------------------------ *
 * Multi-asset timing (index + crypto via Yahoo, macro via ECB)
 * ------------------------------------------------------------------ */

export type TimingSignal = { name: string; type: "technical" | "macro"; action: string; score: number; changePct: number | null; source: string; freshness: string | null };

export async function multiAssetTiming(): Promise<{ generatedAt: string; signals: TimingSignal[]; unavailable: string[] }> {
  const targets: Array<{ name: string; symbol: string; type: "technical" | "macro" }> = [
    { name: "NIFTY 50", symbol: "^NSEI", type: "technical" },
    { name: "SENSEX", symbol: "^BSESN", type: "technical" },
    { name: "BANK NIFTY", symbol: "^NSEBANK", type: "technical" },
    { name: "S&P 500", symbol: "^GSPC", type: "technical" },
    { name: "Bitcoin", symbol: "BTC-USD", type: "macro" },
    { name: "Gold", symbol: "GC=F", type: "macro" },
    { name: "Brent crude", symbol: "BZ=F", type: "macro" },
    { name: "USD/INR", symbol: "INR=X", type: "macro" },
  ];
  const unavailable: string[] = [];
  const signals = (
    await Promise.all(
      targets.map(async (target) => {
        try {
          const result = await cached(scopedCacheKey(marketId, `quote:${target.symbol}`), TTL.quote, () => tracked("yahoo-finance", () => yahooChart(target.symbol, "1mo", "1d")));
          const quote = quoteFromSeries(result.value.series);
          const changePct = quote.changePercent;
          const score = changePct === null ? 50 : clamp(round(50 + changePct * 2));
          const action = changePct === null ? "NO_CONFIRMED_SIGNAL" : changePct > 0.5 ? "UPWARD_MOMENTUM" : changePct < -0.5 ? "DOWNWARD_MOMENTUM" : "FLAT";
          return { name: target.name, type: target.type, action, score, changePct, source: "Yahoo Finance", freshness: quote.asOf } satisfies TimingSignal;
        } catch (error) {
          unavailable.push(`${target.name}: ${String(error).slice(0, 80)}`);
          return null;
        }
      }),
    )
  ).filter((signal): signal is TimingSignal => Boolean(signal));
  return { generatedAt: nowIso(), signals, unavailable };
}

/* ------------------------------------------------------------------ *
 * Capability matrix
 * ------------------------------------------------------------------ */

export function capabilityMatrix() {
  const providers = providerRegistry();
  return providers.map((provider) => ({
    capability: provider.capability,
    provider: provider.name,
    markets: provider.markets,
    credentialState: provider.credentialState,
    status: provider.status,
    freshnessTargetSeconds: provider.freshnessTargetSeconds,
    licensing: provider.licensing,
    lastSuccessAt: provider.lastSuccessAt,
    latencyMs: provider.latencyMs,
  }));
}

export function capabilityList() {
  const providers = providerRegistry();
  const byCapability = new Map<string, ProviderRecord[]>();
  for (const provider of providers) {
    const list = byCapability.get(provider.capability) ?? [];
    list.push(provider);
    byCapability.set(provider.capability, list);
  }
  return [...byCapability.entries()].map(([capability, list]) => ({
    capability,
    status: list.every((p) => p.status === "live") ? "live" : list.some((p) => p.status === "live") ? "partial" : "unavailable",
    providers: list.map((p) => ({ key: p.key, name: p.name, credentialState: p.credentialState, status: p.status })),
  }));
}

export { PROVIDER_DEFS };
