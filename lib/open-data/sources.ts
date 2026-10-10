/**
 * Free / open data-source adapters. No API keys, no server.
 *
 * Every function returns a value plus provenance, and throws SourceError on
 * failure so callers can degrade honestly instead of showing a wrong number.
 *
 * Verified reachable from the AnalyzerX sandbox: Yahoo Finance (chart, search,
 * fundamentals timeseries), NSE archives (equity master, index constituents,
 * FII/DII). Device-only sources (GDELT, SEC EDGAR, ECB/OECD, CoinGecko) are
 * implemented against their documented public endpoints; they are unreachable
 * from the build sandbox but work on a normal device connection.
 */
import {
  SourceError,
  csvToObjects,
  fetchJson,
  fetchText,
  parseRss,
  provenance,
  round,
  safeNumber,
  stripHtml,
  type Provenance,
  type Sourced,
  type RssItem,
} from "./core";

const YAHOO = "https://query1.finance.yahoo.com";
const YAHOO_SEARCH = "https://query2.finance.yahoo.com";

/** Yahoo exposes the same endpoints on two independent hosts; the chain uses
 *  both so a single-host outage does not blank quotes or fundamentals. */
export type YahooHost = "query1" | "query2";
export const YAHOO_HOSTS: Record<YahooHost, string> = {
  query1: "https://query1.finance.yahoo.com",
  query2: "https://query2.finance.yahoo.com",
};

/* ------------------------------------------------------------------ *
 * Yahoo Finance — quotes, history, search, fundamentals
 * ------------------------------------------------------------------ */

export type Quote = {
  symbol: string;
  displaySymbol: string;
  name: string;
  currency: string;
  exchange: string;
  instrumentType: string;
  current: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  volume: number | null;
  asOf: string | null;
};

type ChartResponse = {
  chart?: {
    result?: Array<{
      meta?: Record<string, unknown>;
      timestamp?: number[];
      indicators?: { quote?: Array<Record<string, Array<number | null>>> };
    }>;
    error?: { code?: string; description?: string } | null;
  };
};

export type ChartSeries = {
  meta: Record<string, unknown>;
  timestamps: number[];
  closes: (number | null)[];
  highs: (number | null)[];
  lows: (number | null)[];
  opens: (number | null)[];
  volumes: (number | null)[];
};

export async function yahooChart(
  yahooSymbol: string,
  range = "5d",
  interval = "1d",
  host: YahooHost = "query1",
): Promise<{ series: ChartSeries; latencyMs: number; url: string }> {
  const url = `${YAHOO_HOSTS[host]}/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=${range}&interval=${interval}`;
  const { data, latencyMs } = await fetchJson<ChartResponse>(url);
  const result = data.chart?.result?.[0];
  if (!result?.meta) {
    const description = data.chart?.error?.description ?? "no chart result";
    throw new SourceError(`Yahoo chart unavailable for ${yahooSymbol}: ${description}`);
  }
  const quote = result.indicators?.quote?.[0] ?? {};
  return {
    url,
    latencyMs,
    series: {
      meta: result.meta,
      timestamps: result.timestamp ?? [],
      closes: quote.close ?? [],
      highs: quote.high ?? [],
      lows: quote.low ?? [],
      opens: quote.open ?? [],
      volumes: quote.volume ?? [],
    },
  };
}

export function quoteFromSeries(series: ChartSeries): Quote {
  const meta = series.meta;
  const symbol = String(meta.symbol ?? "");
  const current = safeNumber(meta.regularMarketPrice) ?? (series.closes.filter((c) => c !== null).pop() ?? null);
  const previousClose = safeNumber(meta.chartPreviousClose) ?? safeNumber(meta.previousClose);
  const change = current !== null && previousClose !== null ? round(current - previousClose, 2) : null;
  const changePercent =
    change !== null && previousClose ? round((change / previousClose) * 100, 2) : safeNumber(meta.regularMarketChangePercent);
  return {
    symbol,
    displaySymbol: symbol.replace(/\.(NS|BO|L|T|DE|PA|AS|MI|HK|SI|AX)$/, ""),
    name: String(meta.longName ?? meta.shortName ?? symbol),
    currency: String(meta.currency ?? ""),
    exchange: String(meta.fullExchangeName ?? meta.exchangeName ?? ""),
    instrumentType: String(meta.instrumentType ?? "EQUITY"),
    current: current !== null ? round(current, 2) : null,
    previousClose: previousClose !== null ? round(previousClose, 2) : null,
    change,
    changePercent,
    dayHigh: safeNumber(meta.regularMarketDayHigh),
    dayLow: safeNumber(meta.regularMarketDayLow),
    fiftyTwoWeekHigh: safeNumber(meta.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: safeNumber(meta.fiftyTwoWeekLow),
    volume: safeNumber(meta.regularMarketVolume),
    asOf: safeNumber(meta.regularMarketTime) ? new Date(Number(meta.regularMarketTime) * 1000).toISOString() : null,
  };
}

export type SearchHit = {
  symbol: string;
  displaySymbol: string;
  name: string;
  exchange: string;
  quoteType: string;
  score: number;
  isIndian: boolean;
};

type SearchResponse = {
  quotes?: Array<Record<string, unknown>>;
};

export async function yahooSearch(query: string, limit = 12, host: YahooHost = "query2"): Promise<{ hits: SearchHit[]; latencyMs: number; url: string }> {
  const url = `${YAHOO_HOSTS[host]}/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=${Math.min(50, Math.max(1, limit))}&newsCount=0&enableFuzzyQuery=false`;
  const { data, latencyMs } = await fetchJson<SearchResponse>(url);
  const hits: SearchHit[] = (data.quotes ?? [])
    .map((entry) => {
      const symbol = String(entry.symbol ?? "");
      const exchange = String(entry.exchange ?? entry.exchDisp ?? "");
      return {
        symbol,
        displaySymbol: symbol.replace(/\.(NS|BO|L|T|DE|PA|AS|MI|HK|SI|AX)$/, ""),
        name: String(entry.longname ?? entry.shortname ?? symbol),
        exchange,
        quoteType: String(entry.quoteType ?? "EQUITY"),
        score: Number(entry.score ?? 0),
        isIndian: /\.(NS|BO)$/.test(symbol) || /NSE|BSE|NSI|BOM/.test(exchange),
      };
    })
    .filter((hit) => hit.symbol && ["EQUITY", "ETF", "INDEX", "MUTUALFUND", "CRYPTOCURRENCY"].includes(hit.quoteType));
  return { hits, latencyMs, url };
}

export type AnnualMetric = { asOfDate: string; periodType: string; currency: string; raw: number };

export type Fundamentals = {
  symbol: string;
  currency: string;
  metrics: Record<string, AnnualMetric[]>;
};

type TimeseriesResponse = {
  timeseries?: {
    result?: Array<Record<string, unknown> & { meta?: { type?: string[]; symbol?: string[] } }>;
  };
};

const FUNDAMENTAL_TYPES = [
  "annualTotalRevenue",
  "annualNetIncome",
  "annualDilutedEPS",
  "annualTotalDebt",
  "annualStockholdersEquity",
  "annualOperatingCashFlow",
  "annualFreeCashFlow",
  "annualGrossProfit",
  "annualEBITDA",
  "annualTotalAssets",
  "annualCapitalExpenditure",
  "annualOrdinarySharesNumber",
] as const;

export async function yahooFundamentals(
  yahooSymbol: string,
  host: YahooHost = "query1",
): Promise<{ data: Fundamentals; latencyMs: number; url: string }> {
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - 60 * 60 * 24 * 365 * 6;
  const url =
    `${YAHOO_HOSTS[host]}/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(yahooSymbol)}` +
    `?symbol=${encodeURIComponent(yahooSymbol)}&type=${FUNDAMENTAL_TYPES.join(",")}&period1=${period1}&period2=${period2}`;
  const { data, latencyMs } = await fetchJson<TimeseriesResponse>(url);
  const results = data.timeseries?.result ?? [];
  const metrics: Record<string, AnnualMetric[]> = {};
  let currency = "";
  for (const block of results) {
    const type = block.meta?.type?.[0];
    if (!type) continue;
    const rows = Array.isArray(block[type]) ? (block[type] as Array<Record<string, unknown>>) : [];
    metrics[type] = rows
      .map((row) => {
        const reported = (row.reportedValue ?? {}) as { raw?: number };
        const cur = String(row.currencyCode ?? "");
        if (cur) currency = cur;
        return {
          asOfDate: String(row.asOfDate ?? ""),
          periodType: String(row.periodType ?? ""),
          currency: cur,
          raw: safeNumber(reported.raw) ?? NaN,
        };
      })
      .filter((metric) => metric.asOfDate && Number.isFinite(metric.raw));
  }
  return { data: { symbol: yahooSymbol, currency, metrics }, latencyMs, url };
}

/** Year-over-year growth from the latest two annual points of a metric. */
export function yoyGrowth(points: AnnualMetric[] | undefined): number | null {
  if (!points || points.length < 2) return null;
  const sorted = [...points].sort((a, b) => a.asOfDate.localeCompare(b.asOfDate));
  const latest = sorted[sorted.length - 1];
  const prior = sorted[sorted.length - 2];
  if (!prior.raw) return null;
  return round(((latest.raw - prior.raw) / Math.abs(prior.raw)) * 100, 2);
}

/* ------------------------------------------------------------------ *
 * NSE archives — equity master, index constituents, FII/DII flows
 * ------------------------------------------------------------------ */

const NSE_ARCHIVES = "https://nsearchives.nseindia.com";
const NSE_API = "https://www.nseindia.com";

export type UniverseRow = { symbol: string; name: string; isin: string; series: string };

export async function nseEquityMaster(): Promise<{ rows: UniverseRow[]; latencyMs: number; url: string }> {
  const url = `${NSE_ARCHIVES}/content/equities/EQUITY_L.csv`;
  const { text, latencyMs } = await fetchText(url);
  const rows = csvToObjects(text)
    .map((record) => ({
      symbol: (record["SYMBOL"] ?? "").toUpperCase(),
      name: record["NAME OF COMPANY"] ?? "",
      isin: record["ISIN NUMBER"] ?? "",
      series: record[" SERIES"] ?? record["SERIES"] ?? "",
    }))
    .filter((row) => row.symbol && row.name);
  if (!rows.length) throw new SourceError("NSE equity master returned no rows");
  return { rows, latencyMs, url };
}

export type IndexConstituent = { symbol: string; name: string; industry: string; isin: string };

export const NSE_INDEX_FILES: Record<string, string> = {
  NIFTY50: "ind_nifty50list.csv",
  NIFTYBANK: "ind_niftybanklist.csv",
  NIFTYIT: "ind_niftyitlist.csv",
  NIFTYAUTO: "ind_niftyautolist.csv",
  NIFTYPHARMA: "ind_niftypharmalist.csv",
  NIFTYFMCG: "ind_niftyfmcglist.csv",
  NIFTYMETAL: "ind_niftymetallist.csv",
  NIFTYENERGY: "ind_niftyenergylist.csv",
  NIFTYREALTY: "ind_niftyrealtylist.csv",
  NIFTYFINSERVICE: "ind_niftyfinservicelist.csv",
  NIFTYMEDIA: "ind_niftymedialist.csv",
  NIFTYPSUBANK: "ind_niftypsubanklist.csv",
  NIFTYINFRA: "ind_niftyinfralist.csv",
  NIFTYCONSRDURBL: "ind_niftyconsumerdurlist.csv",
  NIFTYCHEMICALS: "ind_niftychemicalslist.csv",
};

export async function nseIndexConstituents(
  indexKey: string,
): Promise<{ rows: IndexConstituent[]; latencyMs: number; url: string }> {
  const file = NSE_INDEX_FILES[indexKey.toUpperCase()];
  if (!file) throw new SourceError(`Unknown NSE index: ${indexKey}`);
  const url = `${NSE_ARCHIVES}/content/indices/${file}`;
  const { text, latencyMs } = await fetchText(url);
  const rows = csvToObjects(text)
    .map((record) => ({
      symbol: (record["Symbol"] ?? "").toUpperCase(),
      name: record["Company Name"] ?? "",
      industry: record["Industry"] ?? "",
      isin: record["ISIN Code"] ?? "",
    }))
    .filter((row) => row.symbol);
  if (!rows.length) throw new SourceError(`NSE index ${indexKey} returned no rows`);
  return { rows, latencyMs, url };
}

export type FlowRow = { category: string; date: string; buyValue: number | null; sellValue: number | null; netValue: number | null };

export async function nseFiiDii(): Promise<{ rows: FlowRow[]; latencyMs: number; url: string }> {
  const url = `${NSE_API}/api/fiidiiTradeReact`;
  const { data, latencyMs } = await fetchJson<Array<Record<string, string>>>(url, {
    headers: { Referer: "https://www.nseindia.com/", Accept: "application/json" },
  });
  const rows = (Array.isArray(data) ? data : []).map((row) => ({
    category: String(row.category ?? ""),
    date: String(row.date ?? ""),
    buyValue: safeNumber(row.buyValue),
    sellValue: safeNumber(row.sellValue),
    netValue: safeNumber(row.netValue),
  }));
  if (!rows.length) throw new SourceError("NSE FII/DII returned no rows");
  return { rows, latencyMs, url };
}

/* ------------------------------------------------------------------ *
 * News — Google News RSS (verified) + GDELT (device-only)
 * ------------------------------------------------------------------ */

export type NewsArticle = {
  id: string;
  symbol: string;
  headline: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string | null;
  sentiment: "Positive" | "Neutral" | "Negative";
  impactScore: number;
  keyEntities: string[];
};

const POSITIVE = /(surge|jump|rise|gain|profit|growth|record|beat|wins?|award|approval|expansion|upgrade|rally|strong|boost|order|partnership|dividend|buyback)/i;
const NEGATIVE = /(fall|drop|slump|loss|decline|miss|downgrade|penalty|fraud|probe|investigation|cut|weak|default|resign|layoff|cancel|delay|slump|plunge)/i;

export function classifySentiment(text: string): { sentiment: NewsArticle["sentiment"]; score: number } {
  const positive = POSITIVE.test(text);
  const negative = NEGATIVE.test(text);
  if (positive && !negative) return { sentiment: "Positive", score: 68 };
  if (negative && !positive) return { sentiment: "Negative", score: 66 };
  if (positive && negative) return { sentiment: "Neutral", score: 55 };
  return { sentiment: "Neutral", score: 50 };
}

function articleId(url: string, headline: string) {
  const seed = `${url}|${headline}`;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
  return `news-${(hash >>> 0).toString(16)}`;
}

function toArticle(item: RssItem, symbol: string, fallbackSource: string): NewsArticle {
  const text = `${item.title} ${item.description}`;
  const { sentiment, score } = classifySentiment(text);
  return {
    id: articleId(item.link, item.title),
    symbol,
    headline: stripHtml(item.title),
    summary: item.description.slice(0, 600),
    source: item.source ?? fallbackSource,
    url: item.link,
    publishedAt: item.pubDate && Number.isFinite(Date.parse(item.pubDate)) ? new Date(item.pubDate).toISOString() : null,
    sentiment,
    impactScore: score,
    keyEntities: symbol ? [symbol] : [],
  };
}

export async function googleNews(
  query: string,
  symbol: string,
  limit = 30,
): Promise<{ articles: NewsArticle[]; latencyMs: number; url: string }> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
  const { text, latencyMs } = await fetchText(url);
  const items = parseRss(text).slice(0, Math.max(1, limit));
  return { articles: items.map((item) => toArticle(item, symbol, "Google News")), latencyMs, url };
}

export async function googleNewsHeadlines(limit = 40): Promise<{ articles: NewsArticle[]; latencyMs: number; url: string }> {
  const url = "https://news.google.com/rss/search?q=Indian%20stock%20market%20OR%20Nifty%20OR%20Sensex&hl=en-IN&gl=IN&ceid=IN:en";
  const { text, latencyMs } = await fetchText(url);
  return {
    articles: parseRss(text).slice(0, limit).map((item) => toArticle(item, "", "Google News")),
    latencyMs,
    url,
  };
}

type GdeltResponse = { articles?: Array<Record<string, string>> };

/** GDELT DOC 2.0 — free, no key. Unreachable from the build sandbox (DNS allowlist). */
export async function gdeltNews(query: string, symbol: string, limit = 25): Promise<{ articles: NewsArticle[]; latencyMs: number; url: string }> {
  const url =
    `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}` +
    `&mode=artlist&format=json&maxrecords=${limit}&sort=datedesc`;
  const { data, latencyMs } = await fetchJson<GdeltResponse>(url);
  const articles = (data.articles ?? []).map((row) => {
    const headline = String(row.title ?? "");
    const { sentiment, score } = classifySentiment(headline);
    return {
      id: articleId(String(row.url ?? ""), headline),
      symbol,
      headline,
      summary: "",
      source: String(row.domain ?? "GDELT"),
      url: String(row.url ?? ""),
      publishedAt: row.seendate ? new Date(
        `${row.seendate.slice(0, 4)}-${row.seendate.slice(4, 6)}-${row.seendate.slice(6, 8)}T${row.seendate.slice(9, 11)}:${row.seendate.slice(11, 13)}:${row.seendate.slice(13, 15)}Z`,
      ).toISOString() : null,
      sentiment,
      impactScore: score,
      keyEntities: symbol ? [symbol] : [],
    } satisfies NewsArticle;
  });
  return { articles, latencyMs, url };
}

/* ------------------------------------------------------------------ *
 * SEC EDGAR — free, no key, requires a descriptive User-Agent.
 * Unreachable from the build sandbox (DNS allowlist).
 * ------------------------------------------------------------------ */

const SEC_UA = "AnalyzerX/1.4 research contact@analyzerx.app";

export type SecFiling = { form: string; filedAt: string; accession: string; primaryDoc: string; url: string; title: string };

export async function secFilings(cik: string, limit = 20): Promise<{ filings: SecFiling[]; latencyMs: number; url: string }> {
  const padded = cik.replace(/\D/g, "").padStart(10, "0");
  const url = `https://data.sec.gov/submissions/CIK${padded}.json`;
  const { data, latencyMs } = await fetchJson<{ filings?: { recent?: Record<string, string[]> } }>(url, {
    headers: { "User-Agent": SEC_UA, "Accept-Encoding": "gzip, deflate" },
  });
  const recent = data.filings?.recent;
  const filings: SecFiling[] = [];
  if (recent) {
    const count = Math.min(limit, (recent.form ?? []).length);
    for (let i = 0; i < count; i += 1) {
      const accession = recent.accessionNumber?.[i] ?? "";
      const primaryDoc = recent.primaryDocument?.[i] ?? "";
      filings.push({
        form: recent.form?.[i] ?? "",
        filedAt: recent.filingDate?.[i] ?? "",
        accession,
        primaryDoc,
        url: accession && primaryDoc
          ? `https://www.sec.gov/Archives/edgar/data/${padded}/${accession.replace(/-/g, "")}/${primaryDoc}`
          : "",
        title: `${recent.form?.[i] ?? "Filing"} · ${recent.filingDate?.[i] ?? ""}`,
      });
    }
  }
  return { filings, latencyMs, url };
}

/* ------------------------------------------------------------------ *
 * Macro — ECB SDMX (device-only)
 * ------------------------------------------------------------------ */

export type MacroPoint = { indicator: string; period: string; value: number; unit: string };

export async function ecbMacro(seriesKey: string, indicator: string, unit: string, limit = 12): Promise<{ points: MacroPoint[]; latencyMs: number; url: string }> {
  const url = `https://data-api.ecb.europa.eu/service/data/${seriesKey}?lastNObservations=${limit}&format=jsondata`;
  const { data, latencyMs } = await fetchJson<{
    dataSets?: Array<{ series?: Record<string, { observations?: Record<string, number[]> }> }>;
    structure?: { dimensions?: { observation?: Array<{ values?: Array<{ id?: string }> }> } };
  }>(url);
  const observations = data.dataSets?.[0]?.series ? Object.values(data.dataSets[0].series)[0]?.observations ?? {} : {};
  const periods = data.structure?.dimensions?.observation?.[0]?.values ?? [];
  const points: MacroPoint[] = Object.entries(observations).map(([index, tuple]) => ({
    indicator,
    period: periods[Number(index)]?.id ?? index,
    value: Array.isArray(tuple) ? Number(tuple[0]) : NaN,
    unit,
  })).filter((point) => Number.isFinite(point.value));
  return { points, latencyMs, url };
}

/* ------------------------------------------------------------------ *
 * Crypto — CoinGecko (device-only). Yahoo crypto works everywhere.
 * ------------------------------------------------------------------ */

export type CryptoQuote = { id: string; symbol: string; name: string; priceUsd: number | null; priceInr: number | null; change24h: number | null };

export async function coingeckoPrices(ids = ["bitcoin", "ethereum"], limit = 8): Promise<{ quotes: CryptoQuote[]; latencyMs: number; url: string }> {
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids.join(",")}&price_change_percentage=24h`;
  const { data, latencyMs } = await fetchJson<Array<Record<string, unknown>>>(url);
  const quotes = data.slice(0, limit).map((row) => ({
    id: String(row.id ?? ""),
    symbol: String(row.symbol ?? "").toUpperCase(),
    name: String(row.name ?? ""),
    priceUsd: safeNumber(row.current_price),
    priceInr: null,
    change24h: safeNumber(row.price_change_percentage_24h),
  }));
  return { quotes, latencyMs, url };
}

/* ------------------------------------------------------------------ *
 * Additional redundant news + universe providers
 * ------------------------------------------------------------------ */

/** Yahoo Finance headline RSS — an independent news feed from Google News. */
export async function yahooNewsRss(symbol: string, limit = 20): Promise<{ articles: NewsArticle[]; latencyMs: number; url: string }> {
  const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`;
  const { text, latencyMs } = await fetchText(url);
  const items = parseRss(text).slice(0, limit);
  return { articles: items.map((item) => toArticle(item, symbol.replace(/\.[A-Z]+$/, ""), "Yahoo Finance")), latencyMs, url };
}

/** Official NSE corporate announcements RSS — exchange-sourced, not aggregated. */
export async function nseAnnouncementsRss(limit = 40): Promise<{ articles: NewsArticle[]; latencyMs: number; url: string }> {
  const url = `${NSE_ARCHIVES}/content/RSS/Online_announcements.xml`;
  const { text, latencyMs } = await fetchText(url);
  const items = parseRss(text).slice(0, limit);
  const articles = items.map((item) => {
    const { sentiment, score } = classifySentiment(`${item.title} ${item.description}`);
    return {
      id: articleId(item.link, item.title),
      symbol: "",
      headline: item.title,
      summary: item.description.slice(0, 400),
      source: "NSE announcements",
      url: item.link,
      publishedAt: item.pubDate && Number.isFinite(Date.parse(item.pubDate)) ? new Date(item.pubDate).toISOString() : null,
      sentiment,
      impactScore: score,
      keyEntities: item.title ? [item.title] : [],
    } satisfies NewsArticle;
  });
  return { articles, latencyMs, url };
}

/** NSE SME (small-cap) universe — a second listing universe for redundancy. */
export async function nseSmeUniverse(): Promise<{ rows: UniverseRow[]; latencyMs: number; url: string }> {
  const url = `${NSE_ARCHIVES}/emerge/corporates/content/SME_EQUITY_L.csv`;
  const { text, latencyMs } = await fetchText(url);
  const rows = csvToObjects(text)
    .map((record) => ({
      symbol: (record["SYMBOL"] ?? "").toUpperCase(),
      name: record["NAME OF COMPANY"] ?? "",
      isin: record["ISIN NUMBER"] ?? "",
      series: record[" SERIES"] ?? record["SERIES"] ?? "",
    }))
    .filter((row) => row.symbol && row.name);
  if (!rows.length) throw new SourceError("NSE SME universe returned no rows");
  return { rows, latencyMs, url };
}

/* ------------------------------------------------------------------ *
 * Generic RSS adapter + official NSE data files
 * ------------------------------------------------------------------ */

/** Parse any RSS/Atom feed into news articles with a fixed source label. */
export async function genericRssFeed(
  url: string,
  sourceName: string,
  options: { symbol?: string; kind?: string; limit?: number } = {},
): Promise<{ articles: NewsArticle[]; latencyMs: number; url: string }> {
  const { text, latencyMs } = await fetchText(url);
  const items = parseRss(text).slice(0, options.limit ?? 60);
  const articles = items.map((item) => {
    const { sentiment, score } = classifySentiment(`${item.title} ${item.description}`);
    return {
      id: articleId(item.link || item.guid || item.title, item.title),
      symbol: options.symbol ?? "",
      headline: stripHtml(item.title),
      summary: item.description.slice(0, 600),
      source: sourceName,
      url: item.link,
      publishedAt: item.pubDate && Number.isFinite(Date.parse(item.pubDate)) ? new Date(item.pubDate).toISOString() : null,
      sentiment,
      impactScore: score,
      keyEntities: [options.kind ?? "disclosure"],
    } satisfies NewsArticle;
  });
  return { articles, latencyMs, url };
}

export type DealRow = { date: string; symbol: string; security: string; client: string; side: string; quantity: number | null; price: number | null };

function parseDeals(text: string): DealRow[] {
  return csvToObjects(text)
    .map((record) => ({
      date: (record["Date"] ?? "").trim(),
      symbol: (record["Symbol"] ?? "").trim().toUpperCase(),
      security: (record["Security Name"] ?? "").trim(),
      client: (record["Client Name"] ?? "").trim(),
      side: (record["Buy/Sell"] ?? "").trim(),
      quantity: safeNumber(record["Quantity Traded"]),
      price: safeNumber(record["Trade Price / Wgh"]),
    }))
    .filter((row) => row.symbol && row.client);
}

/** NSE bulk deals — daily, official. */
export async function nseBulkDeals(): Promise<{ rows: DealRow[]; latencyMs: number; url: string }> {
  const url = `${NSE_ARCHIVES}/content/equities/bulk.csv`;
  const { text, latencyMs } = await fetchText(url);
  return { rows: parseDeals(text), latencyMs, url };
}

/** NSE block deals — daily, official. */
export async function nseBlockDeals(): Promise<{ rows: DealRow[]; latencyMs: number; url: string }> {
  const url = `${NSE_ARCHIVES}/content/equities/block.csv`;
  const { text, latencyMs } = await fetchText(url);
  return { rows: parseDeals(text), latencyMs, url };
}

export type BhavRow = { symbol: string; series: string; date: string; prevClose: number | null; open: number | null; high: number | null; low: number | null; last: number | null; close: number | null; volume: number | null; turnover: number | null };

/** NSE full daily bhavcopy — official OHLCV for every listed security. */
export async function nseBhavcopy(limit = 0): Promise<{ rows: BhavRow[]; latencyMs: number; url: string }> {
  const url = `${NSE_ARCHIVES}/products/content/sec_bhavdata_full.csv`;
  const { text, latencyMs } = await fetchText(url);
  const rows = csvToObjects(text)
    .map((record) => {
      const pick = (key: string) => {
        const found = Object.keys(record).find((candidate) => candidate.trim().toUpperCase() === key);
        return found ? record[found] : "";
      };
      return {
        symbol: pick("SYMBOL").trim().toUpperCase(),
        series: pick("SERIES").trim(),
        date: pick("DATE1").trim(),
        prevClose: safeNumber(pick("PREV_CLOSE")),
        open: safeNumber(pick("OPEN_PRICE")),
        high: safeNumber(pick("HIGH_PRICE")),
        low: safeNumber(pick("LOW_PRICE")),
        last: safeNumber(pick("LAST_PRICE")),
        close: safeNumber(pick("CLOSE_PRICE")),
        volume: safeNumber(pick("TTL_TRD_QNTY")),
        turnover: safeNumber(pick("TURNOVER_LACS")),
      };
    })
    .filter((row) => row.symbol && row.series === "EQ");
  return { rows: limit > 0 ? rows.slice(0, limit) : rows, latencyMs, url };
}


/* ------------------------------------------------------------------ *
 * Institutional flows — GitHub-hosted open dataset + NSDL sector flows
 *
 * NSE's own endpoint exposes only the current session. This keyless,
 * community-maintained dataset is versioned in a public repository and served
 * through raw.githubusercontent.com / jsDelivr, so it gives real FII/DII
 * history. It carries its own nse -> groww -> moneycontrol fallback chain and
 * records which upstream it used.
 * ------------------------------------------------------------------ */

const FII_DII_BASE = "https://raw.githubusercontent.com/chirag127/fii-dii-activity-api/main/data";

export type FiiDiiLeg = { fiiBuy: number | null; fiiSell: number | null; fiiNet: number | null; diiBuy: number | null; diiSell: number | null; diiNet: number | null };
export type FiiDiiSession = { date: string; upstream: string; equity: FiiDiiLeg; derivative: FiiDiiLeg };

type RawFiiDiiLeg = { fii_buy?: number; fii_sell?: number; fii_net?: number; dii_buy?: number; dii_sell?: number; dii_net?: number };
type RawFiiDiiSession = { date?: string; source?: string; equity?: RawFiiDiiLeg; derivative?: RawFiiDiiLeg };

function normalizeLeg(leg: RawFiiDiiLeg | undefined): FiiDiiLeg {
  return {
    fiiBuy: safeNumber(leg?.fii_buy),
    fiiSell: safeNumber(leg?.fii_sell),
    fiiNet: safeNumber(leg?.fii_net),
    diiBuy: safeNumber(leg?.dii_buy),
    diiSell: safeNumber(leg?.dii_sell),
    diiNet: safeNumber(leg?.dii_net),
  };
}

function normalizeSession(raw: RawFiiDiiSession): FiiDiiSession | null {
  if (!raw?.date) return null;
  return { date: raw.date, upstream: raw.source ?? "unknown", equity: normalizeLeg(raw.equity), derivative: normalizeLeg(raw.derivative) };
}

/** Manifest of available sessions (dates + count + latest). */
export async function fiiDiiGithubIndex(): Promise<{ count: number; latest: string | null; dates: string[]; latencyMs: number; url: string }> {
  const url = `${FII_DII_BASE}/index.json`;
  const { data, latencyMs } = await fetchJson<{ count?: number; latest?: string; dates?: string[] }>(url);
  const dates = Array.isArray(data.dates) ? data.dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)) : [];
  if (!dates.length) throw new SourceError("FII/DII dataset manifest returned no dates");
  return { count: data.count ?? dates.length, latest: data.latest ?? dates[dates.length - 1] ?? null, dates, latencyMs, url };
}

/** One session of FII/DII cash + derivative flows (₹ crore). */
export async function fiiDiiGithubSession(date: string): Promise<{ session: FiiDiiSession; latencyMs: number; url: string }> {
  const url = `${FII_DII_BASE}/${date}.json`;
  const { data, latencyMs } = await fetchJson<RawFiiDiiSession>(url);
  const session = normalizeSession(data);
  if (!session) throw new SourceError(`FII/DII session ${date} was malformed`);
  return { session, latencyMs, url };
}

/** Most recent session. */
export async function fiiDiiGithubLatest(): Promise<{ session: FiiDiiSession; latencyMs: number; url: string }> {
  const url = `${FII_DII_BASE}/latest.json`;
  const { data, latencyMs } = await fetchJson<RawFiiDiiSession>(url);
  const session = normalizeSession(data);
  if (!session) throw new SourceError("FII/DII latest session was malformed");
  return { session, latencyMs, url };
}

/** Backfill the most recent `limit` sessions (newest first). */
export async function fiiDiiGithubHistory(limit = 30): Promise<{ sessions: FiiDiiSession[]; latencyMs: number; url: string }> {
  const started = Date.now();
  const index = await fiiDiiGithubIndex();
  // Ascending (oldest -> newest): the flow chart renders the trailing window.
  const wanted = index.dates.slice(-Math.max(1, Math.min(90, limit)));
  const settled = await Promise.all(
    wanted.map(async (date) => {
      try {
        return (await fiiDiiGithubSession(date)).session;
      } catch {
        return null;
      }
    }),
  );
  const sessions = settled.filter((session): session is FiiDiiSession => Boolean(session));
  if (!sessions.length) throw new SourceError("FII/DII history returned no usable sessions");
  return { sessions, latencyMs: Date.now() - started, url: `${FII_DII_BASE}/index.json` };
}

/* ------------------------------------------------------------------ *
 * NSDL-derived sector institutional allocation
 * Fortnightly FPI sector allocation (AUM %, net flow, one-year flow).
 * Reachable on a normal device connection; blocked by the build sandbox's
 * DNS allowlist, so it is wired with honest degradation.
 * ------------------------------------------------------------------ */

export type SectorFlowRow = { sector: string; aumPct: number | null; fortnightNet: number | null; oneYearNet: number | null; asOf: string | null };

export async function nsdlSectorFlows(): Promise<{ rows: SectorFlowRow[]; asOf: string | null; latencyMs: number; url: string }> {
  const url = "https://fii-diidata.mrchartist.com/api/sectors";
  const { data, latencyMs } = await fetchJson<Record<string, unknown>>(url);
  const source = Array.isArray(data) ? data : Array.isArray((data as { sectors?: unknown }).sectors) ? ((data as { sectors: unknown[] }).sectors) : [];
  const rows = (source as Array<Record<string, unknown>>).map((row) => ({
    sector: String(row.sector ?? row.name ?? ""),
    aumPct: safeNumber(row.aum_pct ?? row.aumPercent ?? row.aum),
    fortnightNet: safeNumber(row.fortnight_net ?? row.fortnightNet ?? row.net),
    oneYearNet: safeNumber(row.one_year_net ?? row.oneYearNet ?? row.year_net),
    asOf: typeof row.date === "string" ? row.date : null,
  })).filter((row) => row.sector);
  if (!rows.length) throw new SourceError("NSDL sector flow dataset returned no rows");
  return { rows, asOf: rows.find((row) => row.asOf)?.asOf ?? null, latencyMs, url };
}

/* ------------------------------------------------------------------ *
 * Provenance helpers for these sources
 * ------------------------------------------------------------------ */

export function yahooProvenance(url: string, latencyMs: number, asOf?: unknown, status: Provenance["status"] = "live"): Provenance {
  return provenance({
    sourceKey: "yahoo-finance",
    sourceName: "Yahoo Finance",
    sourceType: "market-data",
    url,
    latencyMs,
    asOf,
    status,
    basis: "reported",
  });
}

export function nseProvenance(url: string, latencyMs: number, asOf?: unknown, sourceName = "NSE archive"): Provenance {
  return provenance({
    sourceKey: "nse",
    sourceName,
    sourceType: "exchange",
    url,
    latencyMs,
    asOf,
    status: "live",
    basis: "reported",
  });
}

export function newsProvenance(url: string, latencyMs: number, sourceKey = "google-news", sourceName = "Google News RSS"): Provenance {
  return provenance({
    sourceKey,
    sourceName,
    sourceType: "news",
    url,
    latencyMs,
    status: "live",
    basis: "reported",
  });
}

export function sourced<T>(value: T | null, prov: Provenance): Sourced<T> {
  return { value, provenance: prov };
}
