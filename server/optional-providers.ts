import { getConfiguredProviders } from "./provider-registry";

import { classifyIndianNewsRelevance, globalIndiaNewsQuery } from "./indian-news-relevance";
import { isProviderCircuitOpen, markProviderHealthy, markProviderRejected } from "./provider-health";
import { recordGdeltFailure, recordGdeltSuccess, reserveGdeltRequest } from "./gdelt-budget";

export type ProviderArticle = {
  marketId?: string;
  symbol: string;
  headline: string;
  summary: string | null;
  url: string;
  source: string;
  publishedAt: string;
};

async function requestJson(url: URL, providerId: string, headers?: HeadersInit) {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}`);
    const payload = await response.json() as Record<string, unknown>;
    markProviderHealthy(providerId, Date.now() - startedAt, payload);
    return payload;
  } catch (error) {
    markProviderRejected(providerId, error, Date.now() - startedAt);
    throw error;
  }
}

function decodeXml(value: string) {
  return value.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

function readTag(block: string, tag: string) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (!match?.[1]) return null;
  const decoded = decodeXml(match[1]);
  return decoded.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || null;
}

export function parseGdeltArticles(payload: unknown, symbol: string): ProviderArticle[] {
  const rows = payload && typeof payload === "object" && Array.isArray((payload as { articles?: unknown }).articles) ? (payload as { articles: unknown[] }).articles : [];
  return rows.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const url = typeof row.url === "string" ? row.url : null;
    const headline = typeof row.title === "string" ? row.title : null;
    if (!url || !headline || !(url.startsWith("https://") || url.startsWith("http://"))) return [];
    const seen = typeof row.seendate === "string" ? row.seendate : "";
    const normalizedSeen = seen.length === 16 && seen.endsWith("Z") ? `${seen.slice(0, 4)}-${seen.slice(4, 6)}-${seen.slice(6, 8)}T${seen.slice(9, 11)}:${seen.slice(11, 13)}:${seen.slice(13, 15)}Z` : seen;
    const parsed = normalizedSeen ? new Date(normalizedSeen) : null;
    return [{ symbol, headline, summary: typeof row.seendate === "string" ? `GDELT source timestamp: ${row.seendate}` : null, url, source: typeof row.domain === "string" ? row.domain : "GDELT", publishedAt: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString() }];
  });
}

export function parseGoogleNewsRss(xml: string, symbol: string): ProviderArticle[] {
  return xml.split(/<item(?:\s[^>]*)?>/i).slice(1, 101).flatMap((itemBody) => {
    const block = itemBody.split(/<\/item>/i)[0];
    const rawTitle = readTag(block, "title");
    const link = readTag(block, "link");
    const publishedAt = readTag(block, "pubDate");
    if (!rawTitle || !link) return [];
    const titleParts = rawTitle.split(/\s+[-–]\s+/);
    const source = readTag(block, "source") ?? (titleParts.length > 1 ? titleParts.at(-1) : null) ?? "Google News";
    const headline = titleParts.length > 1 ? titleParts.slice(0, -1).join(" - ") : rawTitle;
    const parsedDate = publishedAt ? new Date(publishedAt) : null;
    return [{ symbol, headline, summary: null, url: link, source, publishedAt: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : new Date().toISOString() }];
  });
}

async function fetchGdeltQuery(query: string, symbol: string): Promise<ProviderArticle[]> {
  const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  url.searchParams.set("query", query);
  url.searchParams.set("mode", "ArtList");
  url.searchParams.set("format", "json");
  url.searchParams.set("maxrecords", "50");
  url.searchParams.set("sort", "HybridRel");
  const startedAt = Date.now();
  let responseStatus: number | undefined;
  try {
    reserveGdeltRequest();
    const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "AnalyzerX/1.0" }, signal: AbortSignal.timeout(12_000) });
    responseStatus = response.status;
    if (!response.ok) throw new Error(`GDELT DOC returned HTTP ${response.status}`);
    const articles = parseGdeltArticles(await response.json(), symbol);
    recordGdeltSuccess(response.status);
    markProviderHealthy("gdelt", Date.now() - startedAt, articles);
    return articles;
  } catch (error) {
    recordGdeltFailure(error, responseStatus);
    markProviderRejected("gdelt", error, Date.now() - startedAt);
    throw error;
  }
}

async function fetchGoogleNewsRssQuery(query: string, symbol: string): Promise<ProviderArticle[]> {
  const url = new URL("https://news.google.com/rss/search");
  url.searchParams.set("q", query);
  url.searchParams.set("hl", process.env.GOOGLE_NEWS_RSS_LANGUAGE ?? "en-IN");
  url.searchParams.set("gl", process.env.GOOGLE_NEWS_RSS_COUNTRY ?? "IN");
  url.searchParams.set("ceid", process.env.GOOGLE_NEWS_RSS_EDITION ?? "IN:en");
  const startedAt = Date.now();
  try {
    const response = await fetch(url, { headers: { Accept: "application/rss+xml, application/xml, text/xml", "User-Agent": "MarketEventIntelligence/1.0" }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Google News RSS returned HTTP ${response.status}`);
    const articles = parseGoogleNewsRss(await response.text(), symbol);
    markProviderHealthy("google-news-rss", Date.now() - startedAt, articles);
    return articles;
  } catch (error) {
    markProviderRejected("google-news-rss", error, Date.now() - startedAt);
    throw error;
  }
}

const cryptoNewsAliases: Record<string, string> = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  SOL: "Solana",
  XRP: "XRP",
  DOGE: "Dogecoin",
  ADA: "Cardano",
  BNB: "Binance Coin",
  AVAX: "Avalanche crypto",
  LINK: "Chainlink crypto",
};

const MARKET_QUERY_TERMS: Record<string, string> = {
  IN: '(India OR Indian OR NSE OR BSE OR Nifty OR Sensex OR RBI OR SEBI)',
  US: '("United States" OR US OR USA OR NYSE OR NASDAQ OR SEC OR Federal Reserve)',
  GB: '(UK OR Britain OR British OR London OR LSE OR FCA OR "Bank of England")',
  CA: '(Canada OR Canadian OR TSX OR SEDAR OR "Bank of Canada")',
  AU: '(Australia OR Australian OR ASX OR ASIC OR "Reserve Bank of Australia")',
  JP: '(Japan OR Japanese OR JPX OR TSE OR BOJ)',
  SG: '(Singapore OR SGX OR MAS)',
  HK: '(Hong Kong OR HKEX OR SFC OR HKMA)',
  DE: '(Germany OR German OR Xetra OR BaFin OR Bundesbank)',
  FR: '(France OR French OR Euronext OR AMF OR "Banque de France")',
};

export function getNewsSearchQuery(symbol: string, marketId?: string, lookbackDays = 1) {
  const normalized = symbol.trim().toUpperCase();
  const base = normalized.replace(/[-_/](USD|USDT|USDC)$/i, "");
  const alias = cryptoNewsAliases[base];
  const entity = alias ? `("${normalized}" OR "${base}" OR "${alias}")` : `"${normalized}"`;
  const marketTerms = marketId ? MARKET_QUERY_TERMS[marketId] ?? MARKET_QUERY_TERMS.IN : null;
  const safeDays = Math.min(3650, Math.max(1, Math.floor(lookbackDays)));
  return `${entity}${marketTerms ? ` AND ${marketTerms}` : ""} when:${safeDays}d`;
}

export function isWrongMarketGovernmentArticle(article: ProviderArticle, marketId: string) {
  const text = `${article.headline} ${article.summary ?? ""}`.toLowerCase();
  const government = /government|administration|department|ministry|scheme|subsidy|budget|congress|parliament|president|prime minister|white house|executive order|official announcement/i.test(text);
  if (!government) return false;
  if (marketId === "IN") return /\b(us|u\.s\.|usa|united states|washington|white house|congress|federal government|biden|trump)\b/i.test(text) && !/\b(india|indian|nse|bse|rbi|sebi|rupee|inr)\b/i.test(text);
  if (marketId === "US") return /\b(india|indian|new delhi|rbi|sebi|rupee|inr)\b/i.test(text) && !/\b(us|u\.s\.|usa|united states|sec|federal reserve)\b/i.test(text);
  return false;
}

export async function fetchGoogleNewsRss(symbol: string): Promise<ProviderArticle[]> {
  return fetchGoogleNewsRssQuery(getNewsSearchQuery(symbol), symbol);
}

function keepRelevantMarketArticle(article: ProviderArticle, symbols: string[], marketId = "IN") {
  if (isWrongMarketGovernmentArticle(article, marketId)) return false;
  if (article.symbol !== "MARKET") return true;
  if (marketId !== "IN") return true;
  return classifyIndianNewsRelevance({ headline: article.headline, summary: article.summary, symbols }).include;
}

function articlesFromPayload(payload: Record<string, unknown>, symbols: string[], providerName: string, articleKey: "articles" | "data" | "results", marketId = "IN"): ProviderArticle[] {
  const data = Array.isArray(payload[articleKey]) ? payload[articleKey] : [];
  return data.flatMap((item) => {
    const row = item as Record<string, unknown>;
    const source = row.source as Record<string, unknown> | undefined;
    const title = typeof row.title === "string" ? row.title : null;
    const url = typeof row.url === "string" ? row.url : typeof row.link === "string" ? row.link : null;
    if (!title || !url) return [];
    const symbol = symbols.find((candidate) => title.toLowerCase().includes(candidate.toLowerCase())) ?? "MARKET";
    return [{
      marketId,
      symbol,
      headline: title,
      summary: typeof row.description === "string" ? row.description : null,
      url,
      source: typeof row.source === "string" ? row.source : typeof source?.name === "string" ? source.name : providerName,
      publishedAt: typeof row.published_at === "string" ? row.published_at : typeof row.publishedAt === "string" ? row.publishedAt : typeof row.pubDate === "string" ? row.pubDate : new Date().toISOString(),
    }];
  });
}

async function safeProviderArticles(providerId: string, run: () => Promise<ProviderArticle[]>): Promise<ProviderArticle[]> {
  if (isProviderCircuitOpen(providerId)) {
    console.warn(`[OptionalProviders] ${providerId} skipped during provider cooldown`);
    return [];
  }
  try {
    return await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[OptionalProviders] ${providerId} isolated failure: ${message}`);
    return [];
  }
}

export async function fetchProviderNow(providerId: string, symbols: string[], marketId = "IN", lookbackDays = 1): Promise<ProviderArticle[]> {
  switch (providerId) {
    case "gdelt": {
      const results = await Promise.allSettled(symbols.slice(0, 5).map((symbol) => fetchGdeltQuery(getNewsSearchQuery(symbol, marketId, lookbackDays).replace(/ when:\d+d$/, ""), symbol)));
      return results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    }
    case "google-news-rss": {
      const symbolResults = await Promise.allSettled(symbols.slice(0, Number(process.env.GOOGLE_NEWS_RSS_MAX_SYMBOLS ?? 20)).map((symbol) => fetchGoogleNewsRssQuery(getNewsSearchQuery(symbol, marketId, lookbackDays), symbol)));
      const articles = symbolResults.flatMap((result) => result.status === "fulfilled" ? result.value : []);
      if (process.env.ENABLE_GLOBAL_INDIAN_NEWS_RSS !== "false") {
        const globalArticles = await fetchGoogleNewsRssQuery(`${MARKET_QUERY_TERMS[marketId] ?? MARKET_QUERY_TERMS.IN} AND ${globalIndiaNewsQuery} when:${Math.min(3650, Math.max(1, Math.floor(lookbackDays)))}d`, "MARKET");
        articles.push(...globalArticles);
      }
      return articles.filter((article) => keepRelevantMarketArticle(article, symbols, marketId));
    }
    case "marketaux": {
      if (!process.env.MARKETAUX_API_TOKEN) throw new Error("MarketAux is not configured");
      const url = new URL("https://api.marketaux.com/v1/news/all");
      url.searchParams.set("api_token", process.env.MARKETAUX_API_TOKEN);
      url.searchParams.set("symbols", symbols.join(","));
      url.searchParams.set("filter_entities", "true");
      url.searchParams.set("must_have_entities", "true");
      url.searchParams.set("language", "en");
      url.searchParams.set("limit", "50");
      return articlesFromPayload(await requestJson(url, "marketaux"), symbols, "MarketAux", "data", marketId);
    }
    case "newsapi": {
      if (!process.env.NEWS_API_KEY) throw new Error("NewsAPI is not configured");
      const url = new URL("https://newsapi.org/v2/everything");
      url.searchParams.set("apiKey", process.env.NEWS_API_KEY);
      url.searchParams.set("q", `(${symbols.join(" OR ")}) AND ${MARKET_QUERY_TERMS[marketId] ?? MARKET_QUERY_TERMS.IN}`);
      url.searchParams.set("language", "en");
      url.searchParams.set("sortBy", "publishedAt");
      url.searchParams.set("pageSize", "50");
      return articlesFromPayload(await requestJson(url, "newsapi"), symbols, "NewsAPI", "articles", marketId);
    }
    case "gnews": {
      if (!process.env.GNEWS_API_KEY) throw new Error("GNews is not configured");
      const url = new URL("https://gnews.io/api/v4/search");
      url.searchParams.set("q", `(${symbols.join(" OR ")}) AND ${MARKET_QUERY_TERMS[marketId] ?? MARKET_QUERY_TERMS.IN}`);
      url.searchParams.set("lang", "en");
      url.searchParams.set("max", "50");
      url.searchParams.set("apikey", process.env.GNEWS_API_KEY);
      return articlesFromPayload(await requestJson(url, "gnews"), symbols, "GNews", "articles", marketId);
    }
    case "newsdata": {
      if (!process.env.NEWSDATA_API_KEY) throw new Error("NewsData.io is not configured");
      const url = new URL("https://newsdata.io/api/1/latest");
      url.searchParams.set("apikey", process.env.NEWSDATA_API_KEY);
      url.searchParams.set("q", `(${symbols.join(" OR ")}) AND ${MARKET_QUERY_TERMS[marketId] ?? MARKET_QUERY_TERMS.IN}`);
      url.searchParams.set("language", "en");
      return articlesFromPayload(await requestJson(url, "newsdata"), symbols, "NewsData.io", "results", marketId);
    }
    default:
      throw new Error(`Provider ${providerId} does not have a manual app-runtime adapter`);
  }
}

export async function fetchOptionalNews(symbols: string[], marketId = "IN", lookbackDays = 1): Promise<ProviderArticle[]> {
  const configured = new Set(getConfiguredProviders("news").map((provider) => provider.id));
  const tasks: Array<Promise<ProviderArticle[]>> = [];

  tasks.push(safeProviderArticles("gdelt", async () => {
    const results = await Promise.allSettled(symbols.slice(0, 5).map((symbol) => fetchGdeltQuery(getNewsSearchQuery(symbol, marketId, lookbackDays).replace(/ when:\d+d$/, ""), symbol)));
    return results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  }));

  if (process.env.ENABLE_GOOGLE_NEWS_RSS !== "false") {
    const maxSymbols = Number(process.env.GOOGLE_NEWS_RSS_MAX_SYMBOLS ?? 20);
    tasks.push(safeProviderArticles("google-news-rss", async () => {
      const symbolResults = await Promise.allSettled(symbols.slice(0, maxSymbols).map((symbol) => fetchGoogleNewsRssQuery(getNewsSearchQuery(symbol, marketId, lookbackDays), symbol)));
      const articles = symbolResults.flatMap((result) => result.status === "fulfilled" ? result.value : []);
      if (process.env.ENABLE_GLOBAL_INDIAN_NEWS_RSS !== "false") {
        const globalArticles = await safeProviderArticles("google-news-rss", () => fetchGoogleNewsRssQuery(`${MARKET_QUERY_TERMS[marketId] ?? MARKET_QUERY_TERMS.IN} AND ${globalIndiaNewsQuery} when:${Math.min(3650, Math.max(1, Math.floor(lookbackDays)))}d`, "MARKET"));
        articles.push(...globalArticles);
      }
      return articles;
    }));
  }

  if (configured.has("marketaux") && process.env.MARKETAUX_API_TOKEN) {
    tasks.push(safeProviderArticles("marketaux", async () => {
      const url = new URL("https://api.marketaux.com/v1/news/all");
      url.searchParams.set("api_token", process.env.MARKETAUX_API_TOKEN!);
      url.searchParams.set("symbols", symbols.join(","));
      url.searchParams.set("filter_entities", "true");
      url.searchParams.set("must_have_entities", "true");
      url.searchParams.set("language", "en");
      url.searchParams.set("limit", "50");
      return articlesFromPayload(await requestJson(url, "marketaux"), symbols, "MarketAux", "data", marketId);
    }));
  }

  if (configured.has("newsapi") && process.env.NEWS_API_KEY) {
    tasks.push(safeProviderArticles("newsapi", async () => {
      const url = new URL("https://newsapi.org/v2/everything");
      url.searchParams.set("apiKey", process.env.NEWS_API_KEY!);
      url.searchParams.set("q", `(${symbols.join(" OR ")}) AND ${MARKET_QUERY_TERMS[marketId] ?? MARKET_QUERY_TERMS.IN}`);
      url.searchParams.set("language", "en");
      url.searchParams.set("sortBy", "publishedAt");
      url.searchParams.set("pageSize", "50");
      return articlesFromPayload(await requestJson(url, "newsapi"), symbols, "NewsAPI", "articles", marketId);
    }));
  }

  if (configured.has("gnews") && process.env.GNEWS_API_KEY) {
    tasks.push(safeProviderArticles("gnews", async () => {
      const url = new URL("https://gnews.io/api/v4/search");
      url.searchParams.set("q", `(${symbols.join(" OR ")}) AND ${MARKET_QUERY_TERMS[marketId] ?? MARKET_QUERY_TERMS.IN}`);
      url.searchParams.set("lang", "en");
      url.searchParams.set("max", "50");
      url.searchParams.set("apikey", process.env.GNEWS_API_KEY!);
      return articlesFromPayload(await requestJson(url, "gnews"), symbols, "GNews", "articles", marketId);
    }));
  }

  if (configured.has("newsdata") && process.env.NEWSDATA_API_KEY) {
    tasks.push(safeProviderArticles("newsdata", async () => {
      const url = new URL("https://newsdata.io/api/1/latest");
      url.searchParams.set("apikey", process.env.NEWSDATA_API_KEY!);
      url.searchParams.set("q", `(${symbols.join(" OR ")}) AND ${MARKET_QUERY_TERMS[marketId] ?? MARKET_QUERY_TERMS.IN}`);
      url.searchParams.set("language", "en");
      return articlesFromPayload(await requestJson(url, "newsdata"), symbols, "NewsData.io", "results", marketId);
    }));
  }

  const results = await Promise.all(tasks);
  return results.flat().filter((article) => keepRelevantMarketArticle(article, symbols, marketId));
}
