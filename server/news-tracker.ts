import { createHash } from "node:crypto";
import { invokeLLM } from "./_core/llm";
import { deactivatePushTokens, getEnabledPushTokenPage, getImpactRankedNewsEvents, getLatestNewsEvents, getNewsArchiveEvents, saveHeldNewsArticle, saveNewsEvent } from "./db";
import { selectPushProvider } from "./push-batching";
import { deliverPush, type PushTransport } from "./push-delivery";
import { getFcmAccessToken, parseServiceAccount, type TokenTransport } from "./fcm-auth";
import { fetchOptionalNews } from "./optional-providers";
import { classifyIndianNewsRelevance, classifyNewsPublication } from "./indian-news-relevance";
import { fetchNseUniverse } from "./nse-universe";
import { type MarketId } from "../lib/market-regions";
import { filterAndSortArchiveArticles, type ArchiveOrder, type ArchiveScope, type ArchiveSentiment } from "../lib/news-archive";

export type NewsCategory = "Tech" | "Finance" | "Markets" | "Crypto" | "General";
export type NewsSentiment = "Positive" | "Neutral" | "Negative";

export type ExtractedNews = {
  id: string;
  marketId?: MarketId;
  symbol: string;
  headline: string;
  category: NewsCategory;
  summary: string;
  key_entities: string[];
  sentiment: NewsSentiment;
  actionable_impact: string;
  url: string;
  source: string;
  published_at: string;
  impact_score: number;
  high_impact: boolean;
};

type RawArticle = {
  marketId?: MarketId;
  symbol: string;
  headline: string;
  summary?: string | null;
  url: string;
  source: string;
  publishedAt: string;
};

type TrackerStatus = {
  running: boolean;
  lastStartedAt: string | null;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  articlesSeen: number;
  articlesStored: number;
  articlesHeld: number;
  notificationsSent: number;
  coverageMode: "configured" | "nse-universe" | "fallback";
  universeCount: number;
  coveredSymbols: number;
  batchSize: number;
  batchOffset: number;
  lastCoverageAt: string | null;
};

const DEFAULT_SYMBOLS = ["RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK", "ADANIENT", "TATAMOTORS"];
const TRACKER_INTERVAL_MS = Math.max(60_000, Number(process.env.NEWS_TRACKER_POLL_MS ?? 60_000));
const SYMBOL_REFRESH_COOLDOWN_MS = Math.max(15_000, Number(process.env.NEWS_SYMBOL_REFRESH_COOLDOWN_MS ?? 30_000));
const MAX_ARTICLES_PER_SYMBOL = 10;
const MAX_ARCHIVE_ARTICLES_PER_SYMBOL = 100;
const DEFAULT_MAX_ARTICLES_PER_POLL = 50;
const LLM_EXTRACTION_TIMEOUT_MS = 8_000;
const LLM_EXTRACTION_COOLDOWN_MS = Math.max(60_000, Number(process.env.LLM_EXTRACTION_COOLDOWN_MS ?? 15 * 60_000));
const articles = new Map<string, ExtractedNews>();
const notified = new Set<string>();

async function fetchWithRetry(input: RequestInfo | URL, init: RequestInit, attempts = 3) {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetch(input, init);
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
/**
 * A single-attempt HTTP transport for the push senders.
 * Retrying is handled once, inside the delivery loop, with backoff + jitter — so this must not
 * retry as well, or a transient failure would be multiplied.
 */
const pushTransport: PushTransport = async (url, init) => {
  const response = await fetch(url, { method: init.method, headers: init.headers, body: init.body, signal: AbortSignal.timeout(15_000) });
  return { ok: response.ok, status: response.status, headers: { get: (name: string) => response.headers.get(name) }, json: () => response.json() };
};

/** Transport for the FCM OAuth2 token exchange. */
const fcmTokenTransport: TokenTransport = async (url, init) => {
  const response = await fetch(url, { method: init.method, headers: init.headers, body: init.body, signal: AbortSignal.timeout(15_000) });
  return { ok: response.ok, status: response.status, json: () => response.json() };
};

const status: TrackerStatus = {
  running: false,
  lastStartedAt: null,
  lastSuccessAt: null,
  lastAttemptAt: null,
  lastError: null,
  articlesSeen: 0,
  articlesStored: 0,
  articlesHeld: 0,
  notificationsSent: 0,
  coverageMode: "fallback",
  universeCount: 0,
  coveredSymbols: 0,
  batchSize: 0,
  batchOffset: 0,
  lastCoverageAt: null,
};
let interval: ReturnType<typeof setInterval> | null = null;
let pollInFlight = false;
let universeCursor = 0;
let finnhubRateLimitedUntil = 0;
let llmExtractionDisabledUntil = 0;
let llmPermanentFailureLogged = false;
type StockNewsResult = {
  symbol: string;
  providerFailures: number;
  freshArticleCount: number;
  stale: boolean;
  fetchedAt: string;
  articles: ExtractedNews[];
  refreshSuppressed: boolean;
};
const symbolNewsCache = new Map<string, { fetchedAtMs: number; result: StockNewsResult }>();

function uniqueSymbols(values: string[]) {
  return [...new Set(values.map((value) => value.trim().toUpperCase()).filter(Boolean))];
}

async function getCoverageBatch() {
  const configured = uniqueSymbols((process.env.NEWS_TRACKER_SYMBOLS ?? "").split(","));
  const priority = uniqueSymbols((process.env.NEWS_TRACKER_PRIORITY_SYMBOLS ?? DEFAULT_SYMBOLS.join(",")).split(","));
  const requestedBatchSize = Number(process.env.NEWS_TRACKER_SYMBOL_BATCH_SIZE ?? 25);
  const batchSize = Math.min(100, Math.max(5, Number.isFinite(requestedBatchSize) ? requestedBatchSize : 25));
  if (configured.length) {
    const selected = uniqueSymbols([...priority, ...configured]).slice(0, batchSize);
    status.coverageMode = "configured";
    status.universeCount = configured.length;
    status.coveredSymbols = selected.length;
    status.batchSize = selected.length;
    status.batchOffset = 0;
    status.lastCoverageAt = new Date().toISOString();
    return { symbols: selected, universeErrors: [] as string[] };
  }
  try {
    const snapshot = await fetchNseUniverse();
    const universeSymbols = uniqueSymbols(snapshot.securities.map((security) => security.symbol));
    if (!universeSymbols.length) throw new Error("Official NSE universe returned no securities");
    const rotating = universeSymbols.filter((symbol) => !priority.includes(symbol));
    const available = Math.max(0, batchSize - priority.length);
    const start = rotating.length ? universeCursor % rotating.length : 0;
    const selectedRotating = rotating.length ? Array.from({ length: Math.min(available, rotating.length) }, (_, index) => rotating[(start + index) % rotating.length]) : [];
    universeCursor = rotating.length ? (start + selectedRotating.length) % rotating.length : 0;
    const selected = uniqueSymbols([...priority, ...selectedRotating]).slice(0, batchSize);
    status.coverageMode = snapshot.errors.length ? "fallback" : "nse-universe";
    status.universeCount = universeSymbols.length;
    status.coveredSymbols = selected.length;
    status.batchSize = selected.length;
    status.batchOffset = start;
    status.lastCoverageAt = new Date().toISOString();
    return { symbols: selected, universeErrors: snapshot.errors };
  } catch (error) {
    const selected = uniqueSymbols(priority).slice(0, batchSize);
    status.coverageMode = "fallback";
    status.universeCount = selected.length;
    status.coveredSymbols = selected.length;
    status.batchSize = selected.length;
    status.batchOffset = 0;
    status.lastCoverageAt = new Date().toISOString();
    return { symbols: selected, universeErrors: [String(error)] };
  }
}

async function fetchSymbolNewsInBatches(symbols: string[]) {
  const batchConcurrency = Math.min(5, Math.max(1, Number(process.env.NEWS_TRACKER_SYMBOL_CONCURRENCY ?? 2)));
  const results: PromiseSettledResult<RawArticle[]>[] = [];
  let rateLimited = Date.now() < finnhubRateLimitedUntil;
  for (let index = 0; index < symbols.length && !rateLimited; index += batchConcurrency) {
    const chunk = symbols.slice(index, index + batchConcurrency);
    const chunkResults = await Promise.allSettled(chunk.map((symbol) => fetchFinnhubNews(symbol)));
    results.push(...chunkResults);
    rateLimited = chunkResults.some((result) => result.status === "rejected" && String(result.reason).includes("429"));
  }
  return { results, rateLimited };
}

const trackerSystemPrompt = `You are an embedded real-time financial news parsing engine. Return only valid JSON matching the requested schema. Extract only facts present in the input. Keep the summary to 2 concise sentences. Use category Tech, Finance, Markets, Crypto, or General. Use sentiment Positive, Neutral, or Negative. actionable_impact must be a short market-relevance note or None.`;

function cleanText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function canonicalizeHeadline(value: string) {
  return value.toLowerCase()
    .replace(/\s[-|–—]\s[^-–—|]+$/, "")
    .replace(/\b(live|breaking|latest|update|reported|says|according to)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalArticleKey(article: Pick<RawArticle, "headline" | "marketId" | "symbol">) {
  return `${article.marketId ?? "IN"}|${article.symbol.toUpperCase()}|${canonicalizeHeadline(article.headline)}`;
}

function hashArticle(article: Pick<RawArticle, "headline" | "url" | "marketId" | "symbol">) {
  return createHash("sha256").update(canonicalArticleKey(article)).digest("hex");
}

export function scoreArticle(sentiment: NewsSentiment, impact: string) {
  const base = sentiment === "Positive" ? 70 : sentiment === "Negative" ? 45 : 25;
  const catalyst = /earnings|contract|order|approval|upgrade|partnership|growth|buyback|expansion|guidance|investment/i.test(impact) ? 25 : 0;
  return Math.min(100, base + catalyst);
}

export function fallbackExtraction(article: RawArticle): ExtractedNews {
  const sentiment: NewsSentiment = /profit|growth|order|win|approval|upgrade|partnership|expansion|investment/i.test(`${article.headline} ${article.summary ?? ""}`) ? "Positive" : /loss|fraud|downgrade|investigation|default/i.test(`${article.headline} ${article.summary ?? ""}`) ? "Negative" : "Neutral";
  const actionableImpact = sentiment === "Neutral" ? "None" : sentiment === "Positive" ? "Potentially positive catalyst; verify the original filing and price reaction." : "Potential downside risk; verify the original source and company response.";
  return {
    id: hashArticle(article),
    marketId: article.marketId,
    symbol: article.symbol,
    headline: cleanText(article.headline, "Untitled market article"),
    category: "Markets",
    summary: cleanText(article.summary, "Source summary unavailable."),
    key_entities: [article.symbol],
    sentiment,
    actionable_impact: actionableImpact,
    url: article.url,
    source: article.source,
    published_at: article.publishedAt,
    impact_score: scoreArticle(sentiment, actionableImpact),
    high_impact: scoreArticle(sentiment, actionableImpact) >= 90,
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`LLM extraction timed out after ${timeoutMs}ms`)), timeoutMs)),
  ]);
}

export function isPermanentLlmFailure(error: unknown) {
  const message = String(error);
  return /usage exhausted|quota|payment required|unauthorized|invalid.*(?:key|credential)|account.*(?:disabled|exhaust)/i.test(message);
}

async function extractArticle(article: RawArticle): Promise<ExtractedNews> {
  if (Date.now() < llmExtractionDisabledUntil) return fallbackExtraction(article);
  try {
    const response = await withTimeout(invokeLLM({
      model: "gpt-5-mini",
      messages: [
        { role: "system", content: trackerSystemPrompt },
        { role: "user", content: JSON.stringify({ raw_news_text: `${article.headline}\n${article.summary ?? ""}`, symbol: article.symbol, marketId: article.marketId }) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "news_extraction",
          strict: true,
          schema: {
            type: "object",
            properties: {
              headline: { type: "string" },
              category: { type: "string", enum: ["Tech", "Finance", "Markets", "Crypto", "General"] },
              summary: { type: "string" },
              key_entities: { type: "array", items: { type: "string" } },
              sentiment: { type: "string", enum: ["Positive", "Neutral", "Negative"] },
              actionable_impact: { type: "string" },
            },
            required: ["headline", "category", "summary", "key_entities", "sentiment", "actionable_impact"],
            additionalProperties: false,
          },
        },
      },
      reasoning: { effort: "minimal" },
    }), LLM_EXTRACTION_TIMEOUT_MS);
    const content = response.choices?.[0]?.message?.content;
    const parsed = typeof content === "string" ? JSON.parse(content) as Record<string, unknown> : null;
    if (!parsed) return fallbackExtraction(article);
    const sentiment = parsed.sentiment === "Positive" || parsed.sentiment === "Negative" ? parsed.sentiment : "Neutral";
    const impact = cleanText(parsed.actionable_impact, "None");
    const impactScore = scoreArticle(sentiment, impact);
    return {
      id: hashArticle(article),
      marketId: article.marketId,
      symbol: article.symbol,
      headline: cleanText(parsed.headline, article.headline),
      category: parsed.category === "Tech" || parsed.category === "Finance" || parsed.category === "Markets" || parsed.category === "Crypto" ? parsed.category : "General",
      summary: cleanText(parsed.summary, "Summary unavailable."),
      key_entities: Array.isArray(parsed.key_entities) ? parsed.key_entities.filter((item): item is string => typeof item === "string").slice(0, 8) : [article.symbol],
      sentiment,
      actionable_impact: impact,
      url: article.url,
      source: article.source,
      published_at: article.publishedAt,
      impact_score: impactScore,
      high_impact: impactScore >= 90,
    };
  } catch (error) {
    const message = String(error);
    const permanentFailure = isPermanentLlmFailure(error);
    if (permanentFailure) {
      llmExtractionDisabledUntil = Date.now() + LLM_EXTRACTION_COOLDOWN_MS;
      if (!llmPermanentFailureLogged) {
        console.warn(`[NewsTracker] LLM extraction disabled for ${Math.round(LLM_EXTRACTION_COOLDOWN_MS / 60_000)} minutes; deterministic extraction fallback active: ${message}`);
        llmPermanentFailureLogged = true;
      }
    } else {
      console.warn(`[NewsTracker] extraction fallback for ${article.symbol}:`, error);
    }
    return fallbackExtraction(article);
  }
}

async function persistExtractedArticle(raw: RawArticle) {
  const publication = classifyNewsPublication({ marketId: raw.marketId ?? "IN", headline: raw.headline, summary: raw.summary, symbol: raw.symbol, source: raw.source });
  if (!publication.published) {
    status.articlesHeld += 1;
    const articleHash = hashArticle(raw);
    await saveHeldNewsArticle({
      id: `${raw.marketId ?? "IN"}:${articleHash}`,
      marketId: raw.marketId ?? "IN",
      symbol: raw.symbol === "MARKET" ? null : raw.symbol,
      articleId: articleHash,
      articleHash,
      headline: raw.headline,
      summary: raw.summary ?? "",
      url: raw.url,
      source: raw.source,
      publishedAt: new Date(raw.publishedAt),
      holdReason: publication.holdReason,
      classification: publication.classification,
      confidence: publication.confidence,
      score: publication.score,
      matchedSymbolsJson: JSON.stringify(publication.matchedSymbols),
      matchedThemesJson: JSON.stringify(publication.matchedThemes),
      reasonsJson: JSON.stringify(publication.reasons),
      status: "held",
    });
    return false;
  }
  const id = hashArticle(raw);
  if (articles.has(id)) return false;
  const extracted = await extractArticle(raw);
  articles.set(id, extracted);
  await saveNewsEvent({
    id: extracted.id,
      marketId: extracted.marketId ?? "IN",
    symbol: extracted.symbol,
    headline: extracted.headline,
    category: extracted.category,
    summary: extracted.summary,
    keyEntities: JSON.stringify(extracted.key_entities),
    sentiment: extracted.sentiment,
    actionableImpact: extracted.actionable_impact,
    url: extracted.url,
    source: extracted.source,
    publishedAt: new Date(extracted.published_at),
    impactScore: extracted.impact_score,
    highImpact: extracted.high_impact,
  });
  status.articlesStored += 1;
  await notifyHighImpact(extracted);
  return true;
}

async function persistExtractedArticles(rawArticles: RawArticle[], concurrency = 4) {
  const results: PromiseSettledResult<boolean>[] = [];
  for (let index = 0; index < rawArticles.length; index += concurrency) {
    const chunk = rawArticles.slice(index, index + concurrency);
    results.push(...await Promise.allSettled(chunk.map(persistExtractedArticle)));
  }
  return results;
}

async function fetchFinnhubNews(symbol: string, days = 1, marketId: MarketId = "IN"): Promise<RawArticle[]> {
  const token = process.env.FINNHUB_API_KEY;
    if (!token) throw new Error("Finnhub news provider is not configured");
  if (Date.now() < finnhubRateLimitedUntil) throw new Error("Finnhub rate-limit cooldown active");
  const now = new Date();
  const archiveDays = Math.min(3650, Math.max(1, Math.floor(days)));
  const from = new Date(now.getTime() - archiveDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  const url = new URL("https://finnhub.io/api/v1/company-news");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);
  url.searchParams.set("token", token);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetchWithRetry(url, { signal: controller.signal });
    if (!response.ok) {
      if (response.status === 429) finnhubRateLimitedUntil = Date.now() + Math.max(60_000, Number(process.env.FINNHUB_RATE_LIMIT_COOLDOWN_MS ?? 300_000));
      throw new Error(`Finnhub returned HTTP ${response.status}`);
    }
    const payload = await response.json() as Array<Record<string, unknown>>;
    return payload.slice(0, days > 1 ? MAX_ARCHIVE_ARTICLES_PER_SYMBOL : MAX_ARTICLES_PER_SYMBOL).flatMap((item) => {
      if (typeof item.headline !== "string" || typeof item.url !== "string") return [];
      return [{ marketId, symbol, headline: item.headline, summary: typeof item.summary === "string" ? item.summary : null, url: item.url, source: typeof item.source === "string" ? item.source : "Finnhub", publishedAt: typeof item.datetime === "number" ? new Date(item.datetime * 1000).toISOString() : new Date().toISOString() }];
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRssFeed(feedUrl: string, marketId: MarketId = "IN"): Promise<RawArticle[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetchWithRetry(feedUrl, { headers: { Accept: "application/rss+xml, application/xml, text/xml" }, signal: controller.signal });
    if (!response.ok) throw new Error(`RSS returned HTTP ${response.status}`);
    const xml = await response.text();
    const items = [...xml.matchAll(new RegExp("<item[\\s\\S]*?</item>", "gi"))].slice(0, MAX_ARTICLES_PER_SYMBOL);
    return items.flatMap((match) => {
      const block = match[0];
      const read = (tag: string) => block.match(new RegExp(`<${tag}[^>]*>([\s\S]*?)<\/${tag}>`, "i"))?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, "").trim();
      const headline = read("title");
      const url = read("link");
      if (!headline || !url) return [];
      return [{ marketId, symbol: "MARKET", headline, summary: read("description") ?? null, url, source: new URL(feedUrl).hostname, publishedAt: read("pubDate") ? new Date(read("pubDate")!).toISOString() : new Date().toISOString() }];
    });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Deliver a high-impact alert to every registered device.
 *
 * Transport is chosen for free: FCM HTTP v1 when the operator has configured a Firebase service
 * account, otherwise Expo's push service. Both cost nothing. Delivery is paged and cursor-based,
 * retried with backoff, and tokens the service reports as unregistered are deactivated.
 */
async function notifyHighImpact(article: ExtractedNews) {
  if (!article.high_impact || notified.has(article.id)) return;
  notified.add(article.id);

  const serviceAccount = parseServiceAccount(process.env.FCM_SERVICE_ACCOUNT_JSON);
  let accessToken: string | undefined;
  let projectId: string | undefined;
  if (selectPushProvider({ fcmConfigured: serviceAccount !== null }) === "fcm" && serviceAccount) {
    const minted = await getFcmAccessToken({ transport: fcmTokenTransport, serviceAccount });
    if (minted.status === "ok") {
      accessToken = minted.accessToken;
      projectId = serviceAccount.projectId;
    } else {
      console.warn(`[NewsTracker] FCM is configured but could not authenticate (${minted.status}); using the free Expo transport instead.`);
    }
  }
  const provider = accessToken && projectId ? "fcm" : "expo";

  try {
    const summary = await deliverPush({
      provider,
      transport: pushTransport,
      readPage: (cursor, limit) => getEnabledPushTokenPage({ after: cursor, limit }),
      deactivate: deactivatePushTokens,
      accessToken,
      projectId,
      notification: { title: `${article.symbol} high-impact news`, body: article.headline, data: { url: "/", newsId: article.id, symbol: article.symbol } },
      onLog: (level, message) => {
        if (level === "error") console.warn(`[NewsTracker] ${message}`);
        else console.log(`[NewsTracker] ${message}`);
      },
    });
    if (summary.noRecipients) {
      console.log(`[NewsTracker] high-impact alert queued without registered devices ${article.symbol}: ${article.headline}`);
      return;
    }
    status.notificationsSent += summary.delivered;
    if (summary.retryableTokens.length) {
      console.log(`[NewsTracker] ${summary.retryableTokens.length} push token(s) failed transiently and will be retried on the next alert.`);
    }
  } catch (error) {
    console.warn("[NewsTracker] push delivery failed:", error);
  }
}

export function getMaxArticlesPerPoll() {
  const configured = Number(process.env.NEWS_TRACKER_MAX_ARTICLES_PER_POLL ?? DEFAULT_MAX_ARTICLES_PER_POLL);
  return Math.min(200, Math.max(10, Number.isFinite(configured) ? configured : DEFAULT_MAX_ARTICLES_PER_POLL));
}

export function labelMarketContextArticle(article: RawArticle, symbol: string): RawArticle {
  if (article.symbol !== "MARKET") return article;
  return { ...article, symbol, source: `${article.source} · Market context` };
}

export async function fetchStockNewsNow(symbol: string, forceRefresh = false, marketId: MarketId = "IN", requestedDays?: number): Promise<StockNewsResult> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const cacheKey = `${marketId}:${normalizedSymbol}`;
  const cached = symbolNewsCache.get(cacheKey);
  if (cached && !forceRefresh && Date.now() - cached.fetchedAtMs < SYMBOL_REFRESH_COOLDOWN_MS) {
    return { ...cached.result, refreshSuppressed: forceRefresh };
  }
  const configuredArchiveDays = Number(process.env.NEWS_ARCHIVE_LOOKBACK_DAYS ?? 30);
  const archiveDays = Number.isFinite(requestedDays) ? Math.min(3650, Math.max(1, Math.floor(requestedDays!))) : Number.isFinite(configuredArchiveDays) ? Math.min(3650, Math.max(1, Math.floor(configuredArchiveDays))) : 30;
  const results = await Promise.allSettled([fetchFinnhubNews(normalizedSymbol, archiveDays, marketId), fetchOptionalNews([normalizedSymbol], marketId, archiveDays).then((items) => items.map((item) => ({ ...item, marketId } as RawArticle)))]);
  const failures = results.filter((result) => result.status === "rejected");
  const rawArticles = results
    .flatMap((result) => result.status === "fulfilled" ? result.value : [])
    .filter((article) => article.symbol === normalizedSymbol || article.symbol === "MARKET")
    .map((article) => ({ ...labelMarketContextArticle({ ...article, marketId }, normalizedSymbol), marketId }));
  const cappedRawArticles = rawArticles.slice(0, getMaxArticlesPerPoll());
  const storedArticles = await getLatestTrackedNews(MAX_ARTICLES_PER_SYMBOL, normalizedSymbol, marketId);
  if (!rawArticles.length && failures.length === results.length && !storedArticles.length) throw new Error(`No configured news provider returned data for ${normalizedSymbol}`);
  status.articlesSeen += cappedRawArticles.length;
  await persistExtractedArticles(cappedRawArticles);
  const rankedArticles = await getLatestTrackedNews(MAX_ARTICLES_PER_SYMBOL, normalizedSymbol, marketId);
  const fallbackArticles = sortTrackedNews([...articles.values()].filter((article) => (article.marketId ?? marketId) === marketId), normalizedSymbol).slice(0, MAX_ARTICLES_PER_SYMBOL);
  const returnedArticles = rankedArticles.length ? rankedArticles : fallbackArticles;
  const result = {
    symbol: normalizedSymbol,
    providerFailures: failures.length,
    freshArticleCount: cappedRawArticles.length,
    stale: cappedRawArticles.length === 0 && returnedArticles.length > 0,
    fetchedAt: new Date().toISOString(),
    articles: returnedArticles,
    refreshSuppressed: false,
  };
  symbolNewsCache.set(cacheKey, { fetchedAtMs: Date.now(), result });
  return result;
}

export async function backfillHistoricalNews(symbol: string, days: number, marketId: MarketId = "IN") {
  const safeDays = Math.min(3650, Math.max(2, Math.floor(days)));
  return fetchStockNewsNow(symbol, true, marketId, safeDays);
}

export async function pollNewsNow() {
  if (pollInFlight) return { skipped: true, reason: "poll already running" };
  pollInFlight = true;
  status.lastAttemptAt = new Date().toISOString();
  try {
    const coverage = await getCoverageBatch();
    const symbols = coverage.symbols;
    const rssUrls = (process.env.NEWS_TRACKER_RSS_URLS ?? "").split(",").map((item: string) => item.trim()).filter((item: string) => item.startsWith("http")).slice(0, 10);
    const symbolBatch = await fetchSymbolNewsInBatches(symbols);
    const symbolResults = symbolBatch.results;
    const auxiliaryResults = await Promise.allSettled([
      ...rssUrls.map((feedUrl: string) => fetchRssFeed(feedUrl, "IN")),
      fetchOptionalNews(symbols, "IN").then((items) => items.map((item) => ({ ...item, marketId: "IN" as const, summary: item.summary ?? null } as RawArticle))),
    ]);
    const pollResults = [...symbolResults, ...auxiliaryResults];
    const failedProviders = pollResults.filter((result) => result.status === "rejected");
    const rawArticles = pollResults.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    const cappedRawArticles = rawArticles.slice(0, getMaxArticlesPerPoll());
    if (failedProviders.length === pollResults.length && failedProviders.length > 0) throw new Error(`All configured news providers failed: ${String(failedProviders[0].reason)}`);
    const capWarning = rawArticles.length > cappedRawArticles.length ? `; ${rawArticles.length - cappedRawArticles.length} articles deferred by poll cap` : "";
    const rateLimitWarning = symbolBatch.rateLimited ? "; Finnhub rate limit cooldown active" : "";
    if (failedProviders.length > 0 || coverage.universeErrors.length > 0 || capWarning || rateLimitWarning) status.lastError = `${failedProviders.length} provider polls failed; ${coverage.universeErrors.length} universe warnings${rateLimitWarning}${capWarning}; partial results retained`;
    status.articlesSeen += cappedRawArticles.length;
    await persistExtractedArticles(cappedRawArticles);
    let autonomousRecommendations = 0;
    try {
      const { discoverAutonomousRecommendations } = await import("./autonomous-recommendations");
      autonomousRecommendations = (await discoverAutonomousRecommendations(Number(process.env.AUTONOMOUS_RECOMMENDATION_LOOKBACK_DAYS ?? 30), 50)).recommendations.length;
    } catch (error) {
      console.warn("[NewsTracker] autonomous recommendation evaluation unavailable:", error);
    }
    let eventProjections = 0;
    try {
      const { projectLatestEvidence } = await import("./event-projections");
      eventProjections = (await projectLatestEvidence(Number(process.env.EVENT_PROJECTION_MAX_PER_POLL ?? 250))).stored;
    } catch (error) {
      console.warn("[NewsTracker] event projection evaluation unavailable:", error);
    }
    status.lastSuccessAt = new Date().toISOString();
    if (failedProviders.length === 0 && coverage.universeErrors.length === 0 && !capWarning && !rateLimitWarning) status.lastError = null;
    return { skipped: false, seen: cappedRawArticles.length, stored: status.articlesStored, autonomousRecommendations, eventProjections };
  } catch (error) {
    status.lastError = String(error);
    console.error("[NewsTracker] poll failed:", error);
    return { skipped: false, seen: 0, stored: 0, error: status.lastError };
  } finally {
    pollInFlight = false;
  }
}

export function startNewsTracker() {
  if (interval) return;
  status.running = true;
  status.lastStartedAt = new Date().toISOString();
  void pollNewsNow();
  interval = setInterval(() => void pollNewsNow(), TRACKER_INTERVAL_MS);
  console.log(`[NewsTracker] started with ${TRACKER_INTERVAL_MS}ms interval`);
}

export function getNewsTrackerStatus(): TrackerStatus {
  return { ...status, running: Boolean(interval) && status.running };
}

export function sortTrackedNews(items: ExtractedNews[], symbol?: string) {
  return items
    .filter((item) => !symbol || item.symbol === symbol)
    .sort((left, right) => symbol ? right.impact_score - left.impact_score || right.published_at.localeCompare(left.published_at) : right.published_at.localeCompare(left.published_at));
}

function mapPersistedNews(item: Awaited<ReturnType<typeof getLatestNewsEvents>>[number]) {
  return {
    id: item.id,
    marketId: (item.marketId as MarketId) ?? "IN",
    symbol: item.symbol,
    headline: item.headline,
    category: item.category,
    summary: item.summary?.trim() || item.actionableImpact?.trim() || "Impact explanation unavailable from the stored source payload; review the original source before acting.",
    key_entities: (() => { try { return JSON.parse(item.keyEntities) as string[]; } catch { return []; } })(),
    sentiment: item.sentiment,
    actionable_impact: item.actionableImpact,
    url: item.url,
    source: item.source,
    published_at: item.publishedAt.toISOString(),
    impact_score: item.impactScore,
    high_impact: item.highImpact,
  };
}

function keepPublishedNews(item: ReturnType<typeof mapPersistedNews>, marketId?: MarketId) {
  return item.source.includes("Manually approved") || classifyNewsPublication({ marketId: item.marketId ?? marketId ?? "IN", headline: item.headline, summary: item.summary, symbol: item.symbol, source: item.source }).published;
}

function dedupeCanonicalArticles(items: ReturnType<typeof mapPersistedNews>[]) {
  const groups = new Map<string, ReturnType<typeof mapPersistedNews>[]>();
  for (const item of items) {
    const key = canonicalArticleKey({ marketId: item.marketId, symbol: item.symbol, headline: item.headline });
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => {
    const representative = [...group].sort((left, right) => right.impact_score - left.impact_score || right.published_at.localeCompare(left.published_at))[0];
    const sources = [...new Set(group.flatMap((item) => item.source.split(" · ").map((value) => value.trim())).filter(Boolean))];
    return { ...representative, source: sources.length > 1 ? `${sources[0]} +${sources.length - 1} sources` : sources[0] ?? representative.source };
  });
}

export async function getLatestTrackedNews(limit = 50, symbol?: string, marketId?: MarketId) {
  const persisted = symbol ? await getImpactRankedNewsEvents(symbol, limit, marketId) : await getLatestNewsEvents(limit, marketId);
  if (persisted.length) return dedupeCanonicalArticles(persisted.map(mapPersistedNews)).filter((item) => keepPublishedNews(item, marketId)).slice(0, limit);
  return sortTrackedNews([...articles.values()], symbol).filter((item) => {
    if (item.source.includes("Manually approved")) return true;
    return classifyNewsPublication({ marketId: item.marketId ?? "IN", headline: item.headline, summary: item.summary, symbol: item.symbol, source: item.source }).published;
  }).slice(0, limit);
}

function parseDateOnly(value: string, endExclusive = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  if (endExclusive) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

export function resolveHistoricalArchiveRange({ days = 30, startDate, endDate, now = new Date() }: { days?: number; startDate?: string; endDate?: string; now?: Date }) {
  if ((startDate && !endDate) || (!startDate && endDate)) return { error: "Select both a start date and an end date." } as const;
  if (startDate && endDate) {
    const from = parseDateOnly(startDate);
    const to = parseDateOnly(endDate, true);
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    if (!from || !to) return { error: "Use valid calendar dates in YYYY-MM-DD format." } as const;
    if (to <= from) return { error: "End date must be on or after the start date." } as const;
    if (to > today) return { error: "The archive cannot include future dates." } as const;
    const maxCustomRangeDays = 3650;
    if (to.getTime() - from.getTime() > maxCustomRangeDays * 24 * 60 * 60 * 1000) return { error: "Custom archive ranges are limited to ten years for performance and provider-coverage safety." } as const;
    return { from, to, days: Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)), startDate, endDate } as const;
  }
  const safeDays = Math.max(1, Math.min(365, Math.floor(days)));
  return { from: new Date(now.getTime() - safeDays * 24 * 60 * 60 * 1000), to: undefined, days: safeDays, startDate: undefined, endDate: undefined } as const;
}

export async function getHistoricalTrackedNews({ limit = 100, symbol, marketId = "IN", days = 30, startDate, endDate, page = 0, archiveScope = "All archive", archiveSentiment = "All sentiment", archiveOrder = "Newest first" }: { limit?: number; symbol?: string; marketId?: MarketId; days?: number; startDate?: string; endDate?: string; page?: number; archiveScope?: ArchiveScope; archiveSentiment?: ArchiveSentiment; archiveOrder?: ArchiveOrder }) {
  const range = resolveHistoricalArchiveRange({ days, startDate, endDate });
  if ("error" in range) return { marketId, days: 0, page: Math.max(0, page), limit: Math.min(200, Math.max(1, limit)), articles: [], fetchedAt: new Date().toISOString(), coverage: "invalid" as const, sourceCoverage: [], rangeError: range.error };
  const persisted = await getNewsArchiveEvents({ marketId, symbol, from: range.from, to: range.to, limit: 5000, offset: 0 });
  // Persisted rows have already passed the publication gate (or were explicitly approved).
  // Do not re-run today’s adjudicator over historical records: rules evolve, and doing so
  // can erase valid older coverage from the archive while leaving current-day rows visible.
  const allArticles = filterAndSortArchiveArticles(dedupeCanonicalArticles(persisted.map(mapPersistedNews)), archiveScope, archiveSentiment, archiveOrder);
  const pageSize = Math.min(200, Math.max(1, limit));
  const pageStart = Math.max(0, page) * pageSize;
  const articles = allArticles.slice(pageStart, pageStart + pageSize);
  const bySource = new Map<string, { count: number; earliest: string; latest: string }>();
  for (const article of allArticles) {
    const publishedAt = article.published_at;
    const current = bySource.get(article.source);
    if (!current) bySource.set(article.source, { count: 1, earliest: publishedAt, latest: publishedAt });
    else {
      current.count += 1;
      if (publishedAt < current.earliest) current.earliest = publishedAt;
      if (publishedAt > current.latest) current.latest = publishedAt;
    }
  }
  const sourceCoverage = [...bySource.entries()].map(([source, value]) => ({ source, ...value, freshness: Date.now() - Date.parse(value.latest) <= 7 * 24 * 60 * 60 * 1000 ? "fresh" as const : "stale" as const }));
  return { marketId, days: range.days, startDate: range.startDate, endDate: range.endDate, page: Math.max(0, page), limit: pageSize, articles, fetchedAt: new Date().toISOString(), coverage: allArticles.length ? "persisted" as const : "unavailable" as const, sourceCoverage, missingCoverage: allArticles.length === 0 ? "No persisted verified items matched this market, date range, and filter combination." : sourceCoverage.some((item) => item.freshness === "stale") ? "Some matching sources are older than seven days; provider history may be incomplete." : null };
}
