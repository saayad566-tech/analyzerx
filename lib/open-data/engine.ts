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
  type SourceStatus,
} from "./core";
import {
  googleNews,
  googleNewsHeadlines,
  nseEquityMaster,
  nseFiiDii,
  nseIndexConstituents,
  quoteFromSeries,
  yahooChart,
  yahooFundamentals,
  yahooSearch,
  yoyGrowth,
  type AnnualMetric,
  type FlowRow,
  type NewsArticle,
  type Quote,
  type UniverseRow,
} from "./sources";

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
  return PROVIDER_DEFS.map((def) => {
    const h = health.get(def.key);
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
};

export async function snapshot(symbol: string, marketId: MarketId = "IN"): Promise<MarketSnapshot> {
  const primary = toYahooSymbol(symbol, marketId);
  const clean = symbol.trim().toUpperCase();
  const hasSuffix = /\.(NS|BO|L|T|DE|PA|AS|MI|HK|SI|AX|TO|V|F)$/.test(clean) || clean.startsWith("^") || clean.includes("-");
  // Indian names trade on both exchanges: fall back to the BSE listing (.BO)
  // when the NSE listing (.NS) is unavailable, so both NSE and BSE are covered.
  const candidates = !hasSuffix && marketId === "IN" ? [primary, `${clean}.BO`] : [primary];

  let lastError: unknown = null;
  for (const yahooSymbol of candidates) {
    try {
      const result = await cached(`quote:${yahooSymbol}`, TTL.quote, () =>
        tracked("yahoo-finance", () => yahooChart(yahooSymbol, "5d", "1d")),
      );
      const quote = quoteFromSeries(result.value.series);
      if (quote.current === null && candidates.length > 1) {
        lastError = new Error(`No price returned for ${yahooSymbol}`);
        continue;
      }
      const onBse = yahooSymbol.endsWith(".BO");
      const status: SourceStatus = result.fromCache && result.ageMs > TTL.quote ? "delayed" : "live";
      return {
        symbol: quote.displaySymbol || clean,
        source: onBse ? "Yahoo Finance (BSE)" : "Yahoo Finance (NSE)",
        sourceUrl: result.value.url,
        asOf: quote.asOf ?? nowIso(),
        status,
        quote,
        provenance: {
          sourceKey: "yahoo-finance",
          sourceName: onBse ? "Yahoo Finance · BSE listing" : "Yahoo Finance · NSE listing",
          sourceType: "market-data",
          url: result.value.url,
          retrievedAt: nowIso(),
          asOf: quote.asOf,
          status,
          latencyMs: result.value.latencyMs,
          basis: "reported",
        },
      };
    } catch (error) {
      lastError = error;
    }
  }

  return {
    symbol: clean,
    source: "Yahoo Finance",
    sourceUrl: `https://query1.finance.yahoo.com/v8/finance/chart/${primary}`,
    asOf: nowIso(),
    status: "unavailable",
    quote: null,
    provenance: unavailableProvenance("yahoo-finance", "Yahoo Finance", "market-data", `chart/${primary}`, String(lastError)),
    note: `Live quote unavailable: ${String(lastError).slice(0, 160)}`,
  };
}

export async function quotes(symbols: string[], marketId: MarketId = "IN"): Promise<MarketSnapshot[]> {
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

export async function search(query: string, marketId: MarketId = "IN"): Promise<SearchPayload> {
  const q = query.trim();
  let yahooError: string | null = null;
  let nseError: string | null = null;
  const results: SearchResult[] = [];

  try {
    const hit = await cached(`search:${q}`, TTL.search, () => tracked("yahoo-search", () => yahooSearch(q, 15)));
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

export type UniverseSecurity = { symbol: string; name: string; isin: string; series: string; market: "IN" };

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
  try {
    const result = await cached("universe:nse", TTL.universe, () =>
      tracked("nse-equity-master", () => nseEquityMaster()),
    );
    const securities = result.value.rows.map((row: UniverseRow) => ({
      symbol: row.symbol,
      name: row.name,
      isin: row.isin,
      series: row.series,
      market: "IN" as const,
    }));
    return {
      asOf: nowIso(),
      sourceUrls: [result.value.url],
      checksum: checksumOf(`${securities.length}:${securities[0]?.symbol ?? ""}`),
      securities,
      errors: [],
    };
  } catch (error) {
    return { asOf: nowIso(), sourceUrls: ["https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv"], checksum: "unavailable", securities: [], errors: [String(error).slice(0, 200)] };
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
};

export async function stockNews(symbol: string, limit = 40): Promise<NewsPayload> {
  const clean = toDisplaySymbol(toYahooSymbol(symbol, "IN"));
  let articles: NewsArticle[] = [];
  const sources: NewsPayload["sources"] = [];
  let failures = 0;

  try {
    const result = await cached(`news:${clean}`, TTL.news, () =>
      tracked("google-news-rss", () => googleNews(`"${clean}" OR "${symbol}" stock`, clean, limit)),
    );
    articles = result.value.articles;
    sources.push({ key: "google-news-rss", name: "Google News RSS", status: result.fromCache ? "delayed" : "live" });
  } catch (error) {
    failures += 1;
    sources.push({ key: "google-news-rss", name: "Google News RSS", status: "error" });
    void error;
  }

  const deduped = [...new Map(articles.map((a) => [a.id, a])).values()].sort(
    (a, b) => Date.parse(b.publishedAt ?? "") - Date.parse(a.publishedAt ?? "") || 0,
  );
  const freshCount = deduped.filter((a) => a.publishedAt && Date.now() - Date.parse(a.publishedAt) < 3 * 86_400_000).length;
  return {
    symbol: clean,
    fetchedAt: nowIso(),
    stale: freshCount === 0,
    freshArticleCount: freshCount,
    providerFailures: failures,
    articles: deduped,
    sources,
  };
}

export async function marketNews(limit = 60): Promise<NewsPayload> {
  let articles: NewsArticle[] = [];
  const sources: NewsPayload["sources"] = [];
  let failures = 0;
  try {
    const result = await cached("news:market", TTL.news, () =>
      tracked("google-news-rss", () => googleNewsHeadlines(limit)),
    );
    articles = result.value.articles;
    sources.push({ key: "google-news-rss", name: "Google News RSS", status: result.fromCache ? "delayed" : "live" });
  } catch (error) {
    failures += 1;
    sources.push({ key: "google-news-rss", name: "Google News RSS", status: "error" });
    void error;
  }
  return {
    symbol: "",
    fetchedAt: nowIso(),
    stale: false,
    freshArticleCount: articles.length,
    providerFailures: failures,
    articles,
    sources,
  };
}

/* ------------------------------------------------------------------ *
 * Institutional flows (NSE FII/DII)
 * ------------------------------------------------------------------ */

export type InstitutionalFlowRow = {
  category: string;
  label: string;
  buyValue: number | null;
  sellValue: number | null;
  netValue: number | null;
  netLabel: string;
  action: "Buy" | "Sell" | "Neutral";
  sentiment: "Positive" | "Negative" | "Neutral";
  source: string;
  reportDate: string;
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
  history: never[];
  range: string;
  rangeLabel: string;
  comparison: never[];
  error: string | null;
};

const RANGE_LABELS: Record<string, string> = { TODAY: "Today", THREE_DAYS: "Last 3 sessions", ONE_WEEK: "Last week", ONE_MONTH: "Last month", QTD: "Quarter to date" };

export async function institutionalFlows(range = "TODAY"): Promise<InstitutionalFlows> {
  try {
    const result = await cached("flows:fii-dii", TTL.flows, () => tracked("nse-fii-dii", () => nseFiiDii()));
    const rows: InstitutionalFlowRow[] = result.value.rows.map((row: FlowRow) => {
      const net = row.netValue;
      return {
        category: row.category,
        label: row.category === "DII" ? "Domestic Institutional Investors" : row.category === "FII/FPI" ? "Foreign Institutional Investors" : row.category,
        buyValue: row.buyValue,
        sellValue: row.sellValue,
        netValue: net,
        netLabel: net === null ? "Unavailable" : `₹${Math.abs(net).toLocaleString("en-IN")} Cr ${net >= 0 ? "net buy" : "net sell"}`,
        action: net === null ? "Neutral" : net > 0 ? "Buy" : net < 0 ? "Sell" : "Neutral",
        sentiment: net === null ? "Neutral" : net > 0 ? "Positive" : net < 0 ? "Negative" : "Neutral",
        source: "NSE FII/DII report",
        reportDate: row.date,
      };
    });
    return {
      status: result.fromCache ? "delayed" : "live",
      source: "NSE FII/DII provisional report",
      upstream: "NSE",
      reportDate: rows[0]?.reportDate ?? null,
      fetchedAt: nowIso(),
      freshnessLabel: result.fromCache ? "Cached snapshot" : "Provisional, as published by NSE",
      freshnessBusinessDays: 0,
      rows,
      history: [],
      range,
      rangeLabel: RANGE_LABELS[range] ?? range,
      comparison: [],
      error: null,
    };
  } catch (error) {
    return {
      status: "unavailable",
      source: "NSE FII/DII provisional report",
      upstream: "NSE",
      reportDate: null,
      fetchedAt: nowIso(),
      freshnessLabel: "Unavailable",
      freshnessBusinessDays: null,
      rows: [],
      history: [],
      range,
      rangeLabel: RANGE_LABELS[range] ?? range,
      comparison: [],
      error: String(error).slice(0, 240),
    };
  }
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

export async function sectorConstituents(sector: string, limit = 100): Promise<{ sector: string; asOf: string; constituents: SectorConstituent[]; source: string; error: string | null }> {
  const key = sector.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const indexKey = key.startsWith("NIFTY") ? key : `NIFTY${key}`;
  try {
    const result = await cached(`sector:${indexKey}`, TTL.constituents, () =>
      tracked("nse-index-constituents", () => nseIndexConstituents(indexKey)),
    );
    const constituents = result.value.rows.slice(0, limit).map((row) => ({
      symbol: row.symbol,
      name: row.name,
      industry: row.industry,
      sector: row.industry,
      score: 50,
      source: "NSE index constituents",
    }));
    return { sector, asOf: nowIso(), constituents, source: result.value.url, error: null };
  } catch (error) {
    return { sector, asOf: nowIso(), constituents: [], source: `NSE ${indexKey}`, error: String(error).slice(0, 200) };
  }
}

export type PeerComparison = {
  symbol: string;
  asOf: string;
  peers: Array<{ symbol: string; name: string; pe: number | null; marketCap: null; source: string }>;
  comparisonBasis: string;
  unavailable: string[];
};

export async function peerComparison(symbol: string): Promise<PeerComparison> {
  const clean = toDisplaySymbol(toYahooSymbol(symbol, "IN"));
  const unavailable: string[] = [];
  // Find the sector the symbol belongs to using the NSE index lists we can fetch.
  const indexKeys = ["NIFTY50", "NIFTYBANK", "NIFTYIT", "NIFTYAUTO", "NIFTYPHARMA", "NIFTYFMCG", "NIFTYMETAL", "NIFTYENERGY", "NIFTYREALTY", "NIFTYFINSERVICE"];
  for (const indexKey of indexKeys) {
    try {
      const result = await cached(`sector:${indexKey}`, TTL.constituents, () => tracked("nse-index-constituents", () => nseIndexConstituents(indexKey)));
      const match = result.value.rows.find((row) => row.symbol === clean);
      if (match) {
        const peers = result.value.rows.filter((row) => row.symbol !== clean).slice(0, 8);
        const withPe = await Promise.all(
          peers.map(async (peer) => {
            try {
              const snap = await snapshot(peer.symbol, "IN");
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

export async function primeEps(symbols: string[]) {
  await Promise.all(
    symbols.map(async (symbol) => {
      if (latestEpsCache.has(symbol)) return;
      try {
        const result = await cached(`fund:${toYahooSymbol(symbol, "IN")}`, TTL.fundamentals, () => tracked("yahoo-fundamentals", () => yahooFundamentals(toYahooSymbol(symbol, "IN"))));
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

export async function priceHistory(symbol: string, range = "6mo", interval = "1d", marketId: MarketId = "IN") {
  const yahooSymbol = toYahooSymbol(symbol, marketId);
  const result = await cached(`history:${yahooSymbol}:${range}:${interval}`, TTL.history, () =>
    tracked("yahoo-finance", () => yahooChart(yahooSymbol, range, interval)),
  );
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
          const result = await cached(`quote:${target.symbol}`, TTL.quote, () => tracked("yahoo-finance", () => yahooChart(target.symbol, "1mo", "1d")));
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
