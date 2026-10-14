import { z } from "zod";
import { marketIdSchema } from "../lib/market-schema";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { backfillHistoricalNews, fetchStockNewsNow, getHistoricalTrackedNews, getLatestTrackedNews, getNewsTrackerStatus, pollNewsNow } from "./news-tracker";
import { getProviderRegistry } from "./provider-registry";
import { getProviderHealth } from "./provider-health";
import { runProviderNow } from "./provider-actions";
import { answerMarketChat, collectGroundedMarketContext, type MarketChatAttachment, type MarketChatMessage } from "./market-chat";
import { answerGeneralChat, type GeneralChatMessage } from "./general-chat";
import { buildDeepScore } from "./scoring";
import { describeMarketCoverage, searchCountries } from "../lib/market-registry";
import { analyzeSentiment, getSentimentAvailability } from "./sentiment";
import { fetchNseInstitutionalFlows, type FlowRange } from "./nse-flows";
import { getLatestSourceRecords, getSourceRecordsForSymbol, getUserMarketPreference, upsertUserMarketPreference, saveNewsRelevanceFeedback, undoNewsRelevanceFeedback, listUserNewsRelevanceFeedback, listHeldNewsArticles, getHeldNewsArticle, reviewHeldNewsArticle, saveNewsEvent } from "./db";
import { getSourceCatalog } from "./source-catalog";
import { listUserNotifications, markUserNotificationRead, markAllUserNotificationsRead } from "./db";
import { ingestCatalogSource } from "./source-ingestion";
import { ingestSecCompany } from "./sec-edgar-ingestion";
import { ingestFcaIssuer } from "./uk-fca-ingestion";
import { getNseCollectorRegistry, runNseCollector } from "./nse-collectors";
import { getRegionalCollectorRegistry, runRegionalCollector } from "./regional-collectors";
import { getAllCollectorHealth } from "./collector-runtime";
import { fetchNseUniverse } from "./nse-universe";
import { getPositioningCoverage } from "./positioning";
import { getIndiaStockMcpHistory, getIndiaStockMcpSnapshot, getIndiaStockMcpStatus, searchIndiaStockMcp } from "./india-stock-mcp";
import { fetchIndianOpenSearch, fetchIndianOpenStock, normalizeIndianOpenQuote, normalizeIndianOpenSearch } from "./indian-open-api";
import { analyzeFundamentals } from "./fundamental-analysis";
import { comparePeers, getOfficialFilingLinks } from "./advanced-research";
import { fundamentalAnalysisToMarkdown, fundamentalAnalysisToPdf, reportFileName } from "./research-report";
import { fetchDerivativesSnapshot, getDerivativesSourceCatalog } from "./derivatives";
import { getMultiAssetTimingSignals, getMultibaggerSignals, type MultibaggerStrategyId } from "./research-signals";
import { discoverLiveSmartAlerts, persistSmartAlertDiscovery } from "./live-smart-alerts";
import { getAutonomousRecommendation, getEventProjectionsForStoryline, getEventProjectionsForSymbol, getFundamentalObservationsForSymbol, getLatestEventProjections, getMarketObservationsForSymbol, getSmartAlertHistory, getUserAlertResult, listUserAlertResultsPage, getResearchRun, listResearchRuns, listResearchAgentRuns, getUserNotificationPreferences, listProviderHealthHistory, getEnabledUserPushTokens, listUserAlertResults, listUserAlertRules, listUserSavedResearch, listUserSavedScreens, listUserWatchlistItems, revokeUserAlertRule, revokeUserPushToken, revokeUserSavedResearch, revokeUserSavedScreen, revokeUserWatchlistItem, upsertUserAlertRule, upsertUserNotificationPreferences, upsertUserPushToken, upsertUserSavedResearch, upsertUserSavedScreen, upsertUserWatchlistItem, cancelResearchRun } from "./db";
import { normalizeMonitoringQuery, type SmartAlertDiscovery } from "./smart-event-alerts";
import { getDataCapabilities, getDataCapabilityMatrix } from "./data-capability-registry";
import { discoverAutonomousRecommendations, getPersistedAutonomousRecommendations } from "./autonomous-recommendations";
import { persistProfileObservations } from "./data-observations";
import { filterFilingsForSymbol } from "./filing-adapters";
import { buildFilingComparison, DEFAULT_METRICS, filingComparisonToCsv, filingComparisonToMarkdown, filingComparisonToPdf, filingComparisonToSvg } from "./filing-comparison";
import { getMarketProfile, type MarketId } from "../lib/market-regions";
import { getRelationshipGraph } from "./graph-projections";
import { getAvailableSectorNames, getSectorConstituents, type SectorSort } from "./sector-intelligence";
import { runResearchDesk, runOwnedResearchDesk, retryOwnedResearchDesk, getOwnedResearchDeskResult, researchDeskToMarkdown, researchDeskToCsv, researchDeskToPdf, RESEARCH_AGENT_TYPES, type ResearchAgentType } from "./research-desk";
import { resolveResearchRuntime, type ResearchDeviceCapabilities, type ResearchRuntimePreference } from "./research-runtime-policy";
import { fetchPublicMacroContext } from "./public-macro";
import { getGdeltBudgetStatus } from "./gdelt-budget";
import { archiveToCsv, archiveToPdf, filterArchiveExportArticles } from "./archive-export";
import { getRuntimeHealth } from "./runtime-health";

const symbolInput = z.object({
  symbol: z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9.-]+$/).transform((value) => value.toUpperCase()),
  // Explicit market scope. Without it a caller silently defaulted to India.
  marketId: marketIdSchema,
});

type FinnhubQuote = {
  c?: number;
  d?: number;
  dp?: number;
  h?: number;
  l?: number;
  o?: number;
  pc?: number;
  t?: number;
};

type IndianStockResponse = {
  stockDetailsReusableData?: Record<string, unknown>;
  recentNews?: Array<Record<string, unknown>>;
};

type FinnhubNewsItem = {
  id?: number;
  headline?: string;
  url?: string;
  summary?: string;
  source?: string;
  datetime?: number;
  related?: string;
};

type IndianSearchResponse = {
  results?: Array<Record<string, unknown>>;
  result?: Array<Record<string, unknown>>;
  data?: Array<Record<string, unknown>>;
};

type FinnhubSearchResponse = {
  result?: Array<Record<string, unknown>>;
};

async function fetchIndian<T>(symbol: string) {
  const token = process.env.INDIAN_API_KEY;
  if (!token) throw new Error("Indian API is not configured");
  const baseUrl = process.env.INDIAN_API_BASE_URL ?? "https://stock.indianapi.in";
  const url = new URL("/stock", baseUrl);
  url.searchParams.set("name", symbol);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, { headers: { Accept: "application/json", "X-Api-Key": token }, signal: controller.signal });
    if (!response.ok) throw new Error(`Indian API returned HTTP ${response.status}`);
    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchIndianSearch(query: string) {
  const token = process.env.INDIAN_API_KEY;
  if (!token) throw new Error("Indian API is not configured");
  const baseUrl = process.env.INDIAN_API_BASE_URL ?? "https://stock.indianapi.in";
  const url = new URL("/search", baseUrl);
  url.searchParams.set("q", query);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, { headers: { Accept: "application/json", "X-Api-Key": token }, signal: controller.signal });
    if (!response.ok) throw new Error(`Indian API search returned HTTP ${response.status}`);
    return await response.json() as IndianSearchResponse;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchFinnhub<T>(path: string, params: Record<string, string>) {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) throw new Error("Finnhub is not configured");
  const url = new URL(`https://finnhub.io/api/v1/${path}`);
  url.searchParams.set("token", token);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Finnhub ${path} returned HTTP ${response.status}`);
    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeQuote(quote: FinnhubQuote) {
  return {
    current: typeof quote.c === "number" ? quote.c : null,
    change: typeof quote.d === "number" ? quote.d : null,
    changePercent: typeof quote.dp === "number" ? quote.dp : null,
    high: typeof quote.h === "number" ? quote.h : null,
    low: typeof quote.l === "number" ? quote.l : null,
    open: typeof quote.o === "number" ? quote.o : null,
    previousClose: typeof quote.pc === "number" ? quote.pc : null,
    timestamp: typeof quote.t === "number" ? new Date(quote.t * 1000).toISOString() : null,
  };
}

function parseProviderNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/[^0-9.+-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeIndianSnapshot(payload: IndianStockResponse, symbol: string) {
  const reusable = payload.stockDetailsReusableData ?? {};
  const news = Array.isArray(payload.recentNews) ? payload.recentNews : [];
  return {
    symbol,
    source: "Indian API",
    quote: {
      current: parseProviderNumber(reusable.price),
      changePercent: parseProviderNumber(reusable.percentChange),
      high: parseProviderNumber(reusable.high),
      low: parseProviderNumber(reusable.low),
      marketCap: parseProviderNumber(reusable.marketCap),
      date: typeof reusable.date === "string" ? reusable.date : null,
      time: typeof reusable.time === "string" ? reusable.time : null,
    },
    fundamentals: {
      pe: parseProviderNumber(reusable.pPerEBasicExcludingExtraordinaryItemsTTM),
      dividendYield: parseProviderNumber(reusable.currentDividendYieldCommonStockPrimaryIssueLTM),
      debtToEquity: parseProviderNumber(reusable.totalDebtPerTotalEquityMostRecentQuarter),
      netIncome: parseProviderNumber(reusable.NetIncome),
      promoterHolding: typeof reusable.promoterShareHolding === "object" ? reusable.promoterShareHolding : null,
      mutualFundHolding: typeof reusable.mutualFundShareHolding === "object" ? reusable.mutualFundShareHolding : null,
      fiscalYear: typeof reusable.FiscalYear === "string" ? reusable.FiscalYear : null,
    },
    news: news.filter((item) => typeof item.headline === "string" && typeof item.url === "string").slice(0, 10).map((item) => ({
      headline: item.headline,
      url: item.url,
      summary: typeof item.summary === "string" ? item.summary : null,
      publishedAt: typeof item.lastPublishedDate === "string" ? item.lastPublishedDate : typeof item.date === "string" ? item.date : null,
    })),
  };
}

function inferExchange(symbol: string, exchangeValue: string) {
  if (exchangeValue) return exchangeValue.includes("NSE") ? "NSE" : exchangeValue.includes("BSE") ? "BSE" : exchangeValue;
  const suffix = symbol.match(/\.([A-Z0-9]+)$/)?.[1];
  const suffixMap: Record<string, string> = { NS: "NSE", BO: "BSE", L: "London Stock Exchange", TO: "Toronto Stock Exchange", V: "TSX Venture", DE: "Xetra / Frankfurt", PA: "Euronext Paris", F: "Frankfurt", AS: "Euronext Amsterdam", T: "Tokyo Stock Exchange", HK: "Hong Kong Stock Exchange", SS: "Shanghai Stock Exchange", SZ: "Shenzhen Stock Exchange", TW: "Taiwan Stock Exchange", KS: "Korea Stock Exchange", KQ: "KOSDAQ", AX: "Australian Securities Exchange", SI: "Singapore Exchange", JO: "Johannesburg Stock Exchange", SA: "B3 / Saudi suffix ambiguous", MX: "Mexico Stock Exchange" };
  return suffixMap[suffix ?? ""] ?? "Global exchange";
}

function normalizeSearchResults(payload: IndianSearchResponse, source: "Indian API" | "Finnhub") {
  const items = Array.isArray(payload.results) ? payload.results : Array.isArray(payload.data) ? payload.data : Array.isArray(payload.result) ? payload.result : [];
  return items.map((item) => {
    const symbol = typeof item.symbol === "string" ? item.symbol : typeof item.displaySymbol === "string" ? item.displaySymbol : "";
    const name = typeof item.company_name === "string" ? item.company_name : typeof item.companyName === "string" ? item.companyName : typeof item.description === "string" ? item.description : "";
    const exchangeValue = typeof item.exchange === "string" ? item.exchange.toUpperCase() : typeof item.exchangeCode === "string" ? item.exchangeCode.toUpperCase() : "";
    return {
      symbol: symbol.replace(/^(NSE|BSE):/, "").toUpperCase(),
      name: name.trim(),
      sector: typeof item.sector === "string" ? item.sector : exchangeValue ? "Global equities" : "Indian equities",
      exchange: inferExchange(symbol, exchangeValue),
      source,
    } as const;
  }).filter((item) => item.symbol && item.name);
}

function normalizeNews(items: FinnhubNewsItem[]) {
  return items
    .filter((item) => typeof item.headline === "string" && item.headline.length > 0 && typeof item.url === "string" && item.url.length > 0)
    .slice(0, 10)
    .map((item) => ({
      id: item.id ?? null,
      headline: item.headline!,
      url: item.url!,
      summary: typeof item.summary === "string" ? item.summary : null,
      source: typeof item.source === "string" ? item.source : null,
      related: typeof item.related === "string" ? item.related : null,
      publishedAt: typeof item.datetime === "number" ? new Date(item.datetime * 1000).toISOString() : null,
    }));
}

async function fetchMarketSnapshot(symbol: string, requestedMarketId?: string) {
  const now = new Date();
  // Honour the caller's explicit market. The suffix is only a fallback for
  // callers that supply none, and a bare international ticker must never be
  // assumed to be Indian.
  const snapshotMarketId = (requestedMarketId ?? (/(\.NS|\.BO)$/i.test(symbol) ? "IN" : undefined)) as
    | "IN" | "US" | "GB" | "CA" | "AU" | "JP" | "SG" | "HK" | "DE" | "FR" | undefined;
  const isIndianMarket = snapshotMarketId === "IN" || snapshotMarketId === undefined;
  const to = now.toISOString().slice(0, 10);
  const fromDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const from = fromDate.toISOString().slice(0, 10);
  const [quoteResult, newsResult, indianOpenResult, trackedNewsResult] = await Promise.allSettled([
    fetchFinnhub<FinnhubQuote>("quote", { symbol }),
    fetchFinnhub<FinnhubNewsItem[]>("company-news", { symbol, from, to }),
    isIndianMarket ? fetchIndianOpenStock(symbol) : Promise.resolve(null),
    getLatestTrackedNews(10, symbol, snapshotMarketId),
  ]);
  // A non-Indian market resolves null here, so the India-specific normalizer is
  // only applied when a real Indian payload came back.
  const indianOpen = indianOpenResult.status === "fulfilled" && indianOpenResult.value
    ? normalizeIndianOpenQuote(indianOpenResult.value)
    : null;
  const finnhubQuote = quoteResult.status === "fulfilled" ? normalizeQuote(quoteResult.value) : null;
  const trackedNews = trackedNewsResult.status === "fulfilled" ? trackedNewsResult.value.slice(0, 10).map((item) => ({
    id: item.id ?? null,
    headline: item.headline,
    url: item.url,
    summary: item.summary ?? null,
    source: item.source ?? null,
    related: item.symbol ?? symbol,
    publishedAt: item.published_at ?? null,
  })) : [];
  const normalizedFinnhubNews = newsResult.status === "fulfilled" ? normalizeNews(newsResult.value) : [];
  return {
    symbol,
    source: [finnhubQuote ? "Finnhub" : null, indianOpen ? indianOpen.source : null, trackedNews.length ? "AnalyzerX archive" : null].filter(Boolean).join(" + ") || "No live provider available",
    asOf: now.toISOString(),
    quote: finnhubQuote ?? indianOpen?.quote ?? null,
    alternateQuote: indianOpen?.quote ?? null,
    fundamentals: indianOpen?.fundamentals ?? null,
    news: normalizedFinnhubNews.length ? normalizedFinnhubNews : trackedNews,
    errors: {
      quote: quoteResult.status === "rejected" ? String(quoteResult.reason) : null,
      indianOpen: indianOpenResult.status === "rejected" ? String(indianOpenResult.reason) : null,
      news: newsResult.status === "rejected" && trackedNews.length === 0 ? String(newsResult.reason) : null,
    },
  };
}

export const appRouter = router({
  system: systemRouter,
  runtime: router({
    health: publicProcedure.query(() => getRuntimeHealth()),
  }),
  graph: router({
    projection: publicProcedure.input(z.object({ marketId: marketIdSchema, symbol: symbolInput.shape.symbol.optional(), maxHops: z.number().int().min(1).max(2).default(2), limit: z.number().int().min(1).max(100).default(80) })).query(({ input }) => getRelationshipGraph(input.marketId, input.symbol, input.maxHops, input.limit)),
  }),
  events: router({
    latest: publicProcedure.input(z.object({ marketId: marketIdSchema, limit: z.number().int().min(1).max(500).default(100), lookbackDays: z.number().int().min(1).max(730).default(365) })).query(({ input }) => getLatestEventProjections(input.marketId, input.limit, input.lookbackDays)),
    timeline: publicProcedure.input(z.object({ marketId: marketIdSchema, symbol: symbolInput.shape.symbol, limit: z.number().int().min(1).max(500).default(100), lookbackDays: z.number().int().min(1).max(730).default(365) })).query(({ input }) => getEventProjectionsForSymbol(input.marketId, input.symbol, input.limit, input.lookbackDays)),
    storyline: publicProcedure.input(z.object({ storylineKey: z.string().trim().min(1).max(160), limit: z.number().int().min(1).max(500).default(100) })).query(({ input }) => getEventProjectionsForStoryline(input.storylineKey, input.limit)),
    search: publicProcedure.input(z.object({ marketId: marketIdSchema, query: z.string().trim().min(1).max(80), limit: z.number().int().min(1).max(500).default(100) })).query(async ({ input }) => { const rows = await getLatestEventProjections(input.marketId, 500); const query = input.query.toLowerCase(); return rows.filter((row) => `${row.symbol ?? ""} ${row.title} ${row.summary} ${row.eventType} ${row.storylineKey ?? ""}`.toLowerCase().includes(query)).slice(0, input.limit); }),
  }),
  account: router({
    watchlist: protectedProcedure.input(z.object({ marketId: marketIdSchema })).query(({ ctx, input }) => listUserWatchlistItems(input.marketId, ctx.user.id)),
    watchlistUpsert: protectedProcedure.input(z.object({ symbol: symbolInput.shape.symbol, entityId: z.string().max(96).nullable().optional() })).mutation(({ ctx, input }) => upsertUserWatchlistItem(ctx.user.id, input.symbol, input.entityId)),
    watchlistRevoke: protectedProcedure.input(z.object({ symbol: symbolInput.shape.symbol })).mutation(({ ctx, input }) => revokeUserWatchlistItem(ctx.user.id, input.symbol)),
    savedScreens: protectedProcedure.input(z.object({ marketId: marketIdSchema })).query(({ ctx, input }) => listUserSavedScreens(input.marketId, ctx.user.id)),
    savedScreenUpsert: protectedProcedure.input(z.object({ name: z.string().trim().min(1).max(120), filters: z.array(z.string().trim().min(1).max(160)).max(50) })).mutation(({ ctx, input }) => upsertUserSavedScreen(ctx.user.id, { name: input.name, filtersJson: JSON.stringify(input.filters) })),
    savedScreenRevoke: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ ctx, input }) => revokeUserSavedScreen(ctx.user.id, input.id)),
    alertRules: protectedProcedure.input(z.object({ marketId: marketIdSchema })).query(({ ctx, input }) => listUserAlertRules(input.marketId, ctx.user.id)),
    alertRuleUpsert: protectedProcedure.input(z.object({ id: z.string().trim().min(1).max(96), title: z.string().trim().min(1).max(255), query: z.string().trim().min(1).max(4_000), enabled: z.boolean().optional() })).mutation(({ ctx, input }) => upsertUserAlertRule(ctx.user.id, input)),
    alertRuleRevoke: protectedProcedure.input(z.object({ id: z.string().trim().min(1).max(96) })).mutation(({ ctx, input }) => revokeUserAlertRule(ctx.user.id, input.id)),
    alertResults: protectedProcedure.input(z.object({ limit: z.number().int().min(1).max(200).default(100) }).optional()).query(({ ctx, input }) => listUserAlertResults(ctx.user.id, input?.limit ?? 100)),
    alertResultsPage: protectedProcedure.input(z.object({ limit: z.number().int().min(1).max(100).default(25), cursor: z.string().max(512).nullable().optional(), marketId: z.enum(["ALL", "IN", "US", "GB", "CA", "AU", "JP", "SG", "HK", "DE", "FR"]).default("ALL"), ruleId: z.string().trim().max(96).default("ALL") })).query(({ ctx, input }) => listUserAlertResultsPage(ctx.user.id, input)),
    alertResultDetail: protectedProcedure.input(z.object({ id: z.string().trim().min(1).max(160) })).query(({ ctx, input }) => getUserAlertResult(ctx.user.id, input.id)),
    marketPreference: protectedProcedure.query(({ ctx }) => getUserMarketPreference(ctx.user.id)),
    marketPreferenceSync: protectedProcedure.input(z.object({ marketId: z.string().trim().min(2).max(8).regex(/^[A-Z]{2}$/), clientUpdatedAt: z.string().datetime(), clientRevision: z.number().int().min(1).max(1_000_000).optional(), clientWriter: z.enum(["device", "server"]).optional() })).mutation(({ ctx, input }) => upsertUserMarketPreference(ctx.user.id, { marketId: input.marketId, clientUpdatedAt: new Date(input.clientUpdatedAt), clientRevision: input.clientRevision, clientWriter: input.clientWriter })),
    notificationPreferences: protectedProcedure.query(({ ctx }) => getUserNotificationPreferences(ctx.user.id)),
    notificationPreferencesUpsert: protectedProcedure.input(z.object({ enabled: z.boolean(), minimumScore: z.number().int().min(0).max(100), channels: z.record(z.string(), z.boolean()), quietHoursEnabled: z.boolean(), quietStart: z.string().regex(/^([01]\\d|2[0-3]):[0-5]\\d$/), quietEnd: z.string().regex(/^([01]\\d|2[0-3]):[0-5]\\d$/), timezone: z.string().trim().min(1).max(64), quietHoursOverrideForCritical: z.boolean() })).mutation(({ ctx, input }) => upsertUserNotificationPreferences(ctx.user.id, { enabled: input.enabled, minimumScore: input.minimumScore, channelsJson: JSON.stringify(input.channels), quietHoursEnabled: input.quietHoursEnabled, quietStart: input.quietStart, quietEnd: input.quietEnd, timezone: input.timezone, quietHoursOverrideForCritical: input.quietHoursOverrideForCritical })),
    pushTokenUpsert: protectedProcedure.input(z.object({ token: z.string().trim().min(8).max(512), platform: z.enum(["ios", "android", "web"]) })).mutation(({ ctx, input }) => upsertUserPushToken(ctx.user.id, input)),
    pushTokenRevoke: protectedProcedure.input(z.object({ token: z.string().trim().min(8).max(512) })).mutation(({ ctx, input }) => revokeUserPushToken(ctx.user.id, input.token)),
    pushTokens: protectedProcedure.query(({ ctx }) => getEnabledUserPushTokens(ctx.user.id)),
    notifications: protectedProcedure.input(z.object({ limit: z.number().int().min(1).max(100).default(30), cursor: z.string().datetime().optional(), marketId: z.string().trim().max(8).optional(), unreadOnly: z.boolean().default(false) }).optional()).query(({ ctx, input }) => listUserNotifications(ctx.user.id, input ?? { limit: 30, unreadOnly: false })),
    notificationRead: protectedProcedure.input(z.object({ id: z.string().trim().min(1).max(160) })).mutation(({ ctx, input }) => markUserNotificationRead(ctx.user.id, input.id)),
    notificationsReadAll: protectedProcedure.mutation(({ ctx }) => markAllUserNotificationsRead(ctx.user.id)),
    savedResearch: protectedProcedure.input(z.object({ marketId: marketIdSchema })).query(({ ctx, input }) => listUserSavedResearch(input.marketId, ctx.user.id)),
    savedResearchUpsert: protectedProcedure.input(z.object({ id: z.string().trim().min(1).max(128), symbol: symbolInput.shape.symbol, title: z.string().trim().min(1).max(255), reportType: z.string().trim().min(1).max(64), storageKey: z.string().trim().max(512).nullable().optional(), source: z.record(z.string(), z.unknown()) })).mutation(({ ctx, input }) => upsertUserSavedResearch(ctx.user.id, { id: input.id, symbol: input.symbol, title: input.title, reportType: input.reportType, storageKey: input.storageKey ?? null, sourceJson: JSON.stringify(input.source), revokedAt: null })),
    savedResearchRevoke: protectedProcedure.input(z.object({ id: z.string().trim().min(1).max(128) })).mutation(({ ctx, input }) => revokeUserSavedResearch(ctx.user.id, input.id)),
  }),
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  chat: router({
    ask: publicProcedure.input(z.object({ message: z.string().trim().max(2_000).default(""), symbol: z.string().trim().max(20).regex(/^[A-Za-z0-9.-]+$/).optional(), marketId: marketIdSchema, history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(1_000) })).max(8).default([]), attachments: z.array(z.object({ kind: z.enum(["image", "audio"]), dataUrl: z.string().max(8_000_000), mimeType: z.string().max(80), name: z.string().max(160).optional() })).max(2).default([]) })).mutation(({ input }) => answerMarketChat(input.message, input.marketId, input.symbol, input.history as MarketChatMessage[], input.attachments as MarketChatAttachment[])),
    general: publicProcedure.input(z.object({ message: z.string().trim().min(1).max(2_000), history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(1_000) })).max(20).default([]) })).mutation(({ input }) => answerGeneralChat(input.message, input.history as GeneralChatMessage[])),
    ground: publicProcedure.input(z.object({ message: z.string().trim().min(1).max(2_000), symbol: z.string().trim().max(20).regex(/^[A-Za-z0-9.-]+$/).optional(), marketId: marketIdSchema })).mutation(({ input }) => collectGroundedMarketContext(input.message, input.symbol, input.marketId)),
  }),
  scoring: router({
    // Institutional Deep Score for a symbol (Engine A). Returns the composite,
    // confidence, grade, pillar breakdown, per-metric explainability, overlay and
    // the percentile source, so the UI never overstates what it knows.
    deepScore: publicProcedure
      .input(z.object({ symbol: z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9.-]+$/), marketId: marketIdSchema }))
      .mutation(({ input }) => buildDeepScore(input.symbol, input.marketId)),
  }),
  sentiment: router({
    // Availability is reported honestly: with no server-side credential this is
    // `not-configured`, never a fabricated score (audit mandate §11.4).
    status: publicProcedure.query(() => getSentimentAvailability()),
    analyze: publicProcedure
      .input(z.object({
        articles: z.array(z.object({
          id: z.string().trim().min(1).max(300),
          title: z.string().trim().max(500),
          text: z.string().max(20_000),
          publisher: z.string().trim().max(200).optional(),
          url: z.string().trim().max(2_000).optional(),
          publishedAt: z.string().max(40).nullable().optional(),
        })).max(12),
      }))
      .mutation(({ input }) => analyzeSentiment(input.articles)),
  }),
  marketRegistry: router({
    // Known-vs-supported market identity. A country present in the registry but
    // without an adapter is reported as Not Implemented, never as supported.
    search: publicProcedure
      .input(z.object({ query: z.string().trim().max(60), limit: z.number().int().min(1).max(20).default(8) }))
      .query(({ input }) => searchCountries(input.query, input.limit)),
    coverage: publicProcedure
      .input(z.object({ marketId: z.string().trim().min(2).max(3) }))
      .query(({ input }) => describeMarketCoverage(input.marketId)),
  }),
  researchDesk: router({
    run: publicProcedure.input(z.object({ message: z.string().trim().min(1).max(2_000), symbol: z.string().trim().max(20).regex(/^[A-Za-z0-9.-]+$/).optional(), marketId: marketIdSchema, depth: z.enum(["quick", "standard", "deep"]).default("standard"), includeAgents: z.array(z.enum(RESEARCH_AGENT_TYPES as unknown as [ResearchAgentType, ...ResearchAgentType[]])).max(8).optional() })).mutation(({ input }) => runResearchDesk(input)),
    runOwned: protectedProcedure.input(z.object({ message: z.string().trim().min(1).max(2_000), symbol: z.string().trim().max(20).regex(/^[A-Za-z0-9.-]+$/).optional(), marketId: marketIdSchema, depth: z.enum(["quick", "standard", "deep"]).default("standard"), includeAgents: z.array(z.enum(RESEARCH_AGENT_TYPES as unknown as [ResearchAgentType, ...ResearchAgentType[]])).max(8).optional(), runtimePreference: z.enum(["auto", "hosted", "local", "deterministic"]).default("auto"), device: z.object({ platform: z.string().max(32).nullable().optional(), totalMemoryBytes: z.number().int().nullable().optional(), cpuArchitectures: z.array(z.string().max(32)).max(8).optional(), nativeRuntimeAvailable: z.boolean().optional(), activeModelId: z.string().max(64).nullable().optional(), localModelReady: z.boolean().optional() }).optional() })).mutation(({ ctx, input }) => runOwnedResearchDesk(ctx.user.id, input as Parameters<typeof runOwnedResearchDesk>[1])),
    listOwned: protectedProcedure.input(z.object({ limit: z.number().int().min(1).max(100).default(30), marketId: z.enum(["ALL", "IN", "US", "GB", "CA", "AU", "JP", "SG", "HK", "DE", "FR"]).default("ALL") })).query(({ ctx, input }) => listResearchRuns(ctx.user.id, input)),
    status: protectedProcedure.input(z.object({ runId: z.string().trim().min(1).max(160) })).query(({ ctx, input }) => getOwnedResearchDeskResult(ctx.user.id, input.runId)),
    retry: protectedProcedure.input(z.object({ runId: z.string().trim().min(1).max(160) })).mutation(({ ctx, input }) => retryOwnedResearchDesk(ctx.user.id, input.runId)),
    cancel: protectedProcedure.input(z.object({ runId: z.string().trim().min(1).max(160) })).mutation(async ({ ctx, input }) => ({ runId: input.runId, cancelled: await cancelResearchRun(ctx.user.id, input.runId) })),
    runtimePolicy: publicProcedure.input(z.object({ preference: z.enum(["auto", "hosted", "local", "deterministic"]).default("auto"), hostedAvailable: z.boolean().default(true), device: z.object({ platform: z.string().max(32).nullable().optional(), totalMemoryBytes: z.number().int().nullable().optional(), cpuArchitectures: z.array(z.string().max(32)).max(8).optional(), nativeRuntimeAvailable: z.boolean().optional(), activeModelId: z.string().max(64).nullable().optional(), localModelReady: z.boolean().optional() }).optional() })).query(({ input }) => resolveResearchRuntime(input as { preference: ResearchRuntimePreference; hostedAvailable: boolean; device?: ResearchDeviceCapabilities })),
    exportOwned: protectedProcedure.input(z.object({ runId: z.string().trim().min(1).max(160), format: z.enum(["md", "csv", "pdf"]).default("md") })).query(async ({ ctx, input }) => {
      const stored = await getOwnedResearchDeskResult(ctx.user.id, input.runId);
      if (!stored?.run.resultJson) throw new Error("Completed Research Desk result is unavailable for export.");
      const result = JSON.parse(stored.run.resultJson) as Awaited<ReturnType<typeof runResearchDesk>>;
      const baseName = `analyzerx-research-desk-${result.symbol ?? "market"}-${result.marketId}-${result.runId}`.replace(/[^A-Za-z0-9-]/g, "-");
      if (input.format === "csv") return { fileName: `${baseName}.csv`, mimeType: "text/csv", content: researchDeskToCsv(result), marketId: result.marketId, marketLabel: result.marketLabel };
      if (input.format === "pdf") return { fileName: `${baseName}.pdf`, mimeType: "application/pdf", contentBase64: (await researchDeskToPdf(result)).toString("base64"), marketId: result.marketId, marketLabel: result.marketLabel };
      return { fileName: `${baseName}.md`, mimeType: "text/markdown", content: researchDeskToMarkdown(result), marketId: result.marketId, marketLabel: result.marketLabel };
    }),
  }),
  capabilities: router({
    list: publicProcedure.query(() => getDataCapabilities()),
    matrix: publicProcedure.query(() => getDataCapabilityMatrix()),
  }),
  providers: router({
    list: publicProcedure.query(() => getProviderRegistry()),
    gdeltBudget: publicProcedure.query(() => getGdeltBudgetStatus()),
    health: adminProcedure.query(() => getProviderHealth()),
    history: adminProcedure.input(z.object({ providerId: z.string().trim().min(1).max(64).optional(), limit: z.number().int().min(1).max(200).default(50) }).optional()).query(({ input }) => listProviderHealthHistory(input?.providerId, input?.limit ?? 50)),
    runNow: adminProcedure.input(z.object({ marketId: marketIdSchema, providerId: z.string().trim().min(1).max(64), symbol: z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9.-]+$/).optional() })).mutation(async ({ input }) => {
      try {
        return await runProviderNow(input.providerId, input.symbol, input.marketId);
      } catch (error) {
        return { providerId: input.providerId, symbol: input.symbol?.toUpperCase() ?? "", status: "failed" as const, records: 0, summary: String(error), health: getProviderHealth().find((item) => item.id === input.providerId) ?? null };
      }
    }),
    webResearch: publicProcedure.query(() => getProviderRegistry().filter((provider) => provider.domain === "web-research")),
  }),
  sources: router({
    list: publicProcedure.query(() => getSourceCatalog()),
    latest: publicProcedure.input(z.object({ marketId: marketIdSchema, limit: z.number().int().min(1).max(100).default(50) })).query(({ input }) => getLatestSourceRecords(input.marketId, input.limit)),
    ingest: adminProcedure.input(z.object({ sourceKey: z.string().trim().min(1).max(64) })).mutation(({ input }) => ingestCatalogSource(input.sourceKey)),
    ingestSecCompany: adminProcedure.input(symbolInput).mutation(({ input }) => ingestSecCompany(input.symbol)),
    ingestFcaIssuer: adminProcedure.input(z.object({ query: z.string().trim().min(1).max(128) })).mutation(({ input }) => ingestFcaIssuer(input.query)),
    nseCollectors: publicProcedure.query(() => getNseCollectorRegistry()),
    health: publicProcedure.query(() => getAllCollectorHealth()),
    runNseCollector: adminProcedure.input(z.object({ key: z.string().trim().min(1).max(64) })).mutation(({ input }) => runNseCollector(input.key)),
    regionalCollectors: publicProcedure.query(() => getRegionalCollectorRegistry()),
    publicMacro: publicProcedure.query(() => fetchPublicMacroContext()),
    runRegionalCollector: adminProcedure.input(z.object({ marketId: marketIdSchema, symbol: z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9.-]+$/).optional() })).mutation(({ input }) => runRegionalCollector(input.marketId, input.symbol)),
  }),
  news: router({
    status: publicProcedure.query(() => getNewsTrackerStatus()),
    latest: publicProcedure.input(z.object({ limit: z.number().int().min(1).max(100).default(50), symbol: z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9.-]+$/).transform((value) => value.toUpperCase()).optional(), marketId: marketIdSchema })).query(({ input }) => getLatestTrackedNews(input.limit, input.symbol, input.marketId)),
    archive: publicProcedure.input(z.object({ days: z.union([z.literal(30), z.literal(90), z.literal(180), z.literal(270), z.literal(365)]).default(30), startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), page: z.number().int().min(0).max(50).default(0), limit: z.number().int().min(1).max(200).default(100), symbol: z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9.-]+$/).transform((value) => value.toUpperCase()).optional(), marketId: marketIdSchema, archiveScope: z.enum(["All archive", "Special Events"]).default("All archive"), archiveSentiment: z.enum(["All sentiment", "Positive", "Neutral", "Negative"]).default("All sentiment"), archiveOrder: z.enum(["Newest first", "Oldest first", "Impact low → high", "Impact high → low"]).default("Newest first") })).query(({ input }) => getHistoricalTrackedNews(input)),
    archiveExport: publicProcedure.input(z.object({ format: z.enum(["csv", "pdf"]), days: z.union([z.literal(30), z.literal(90), z.literal(180), z.literal(270), z.literal(365)]).default(30), startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), symbol: z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9.-]+$/).transform((value) => value.toUpperCase()).optional(), marketId: marketIdSchema, archiveScope: z.enum(["All archive", "Special Events"]).default("All archive"), archiveSentiment: z.enum(["All sentiment", "Positive", "Neutral", "Negative"]).default("All sentiment"), archiveOrder: z.enum(["Newest first", "Oldest first", "Impact low → high", "Impact high → low"]).default("Newest first") })).query(async ({ input }) => {
      const firstPage = await getHistoricalTrackedNews({ ...input, page: 0, limit: 200 });
      if (firstPage.coverage === "invalid") throw new Error(firstPage.rangeError ?? "The selected archive range is invalid.");
      const validFirstPage = firstPage as Exclude<typeof firstPage, { coverage: "invalid" }>;
      const pages = [validFirstPage];
      for (let page = 1; page < 10 && pages[page - 1].articles.length === 200; page += 1) {
        const nextPage = await getHistoricalTrackedNews({ ...input, page, limit: 200 });
        if (nextPage.coverage === "invalid") break;
        pages.push(nextPage as Exclude<typeof nextPage, { coverage: "invalid" }>);
      }
      const result = { ...firstPage, articles: pages.flatMap((page) => page.articles) };
      const filters = { marketId: input.marketId, marketLabel: getMarketProfile(input.marketId as MarketId).country, symbol: input.symbol, startDate: result.startDate, endDate: result.endDate, archiveScope: input.archiveScope, archiveSentiment: input.archiveSentiment, archiveOrder: input.archiveOrder } as const;
      const articles = filterArchiveExportArticles(result.articles, filters);
      const baseName = `analyzerx-news-archive-${input.marketId}-${input.symbol ?? "market"}-${result.startDate ?? `${result.days}d`}`.replace(/[^A-Za-z0-9-]/g, "-");
      if (input.format === "csv") return { fileName: `${baseName}.csv`, mimeType: "text/csv", content: archiveToCsv(articles, filters), marketId: input.marketId, marketLabel: filters.marketLabel, rowCount: articles.length };
      return { fileName: `${baseName}.pdf`, mimeType: "application/pdf", contentBase64: (await archiveToPdf(articles, filters)).toString("base64"), marketId: input.marketId, marketLabel: filters.marketLabel, rowCount: articles.length };
    }),
    stock: publicProcedure.input(symbolInput.extend({ marketId: marketIdSchema })).query(async ({ input }) => {
      try {
        const result = await fetchStockNewsNow(input.symbol, false, input.marketId);
        return { available: result.articles.length > 0, symbol: result.symbol, marketId: input.marketId, providerFailures: result.providerFailures, freshArticleCount: result.freshArticleCount, stale: result.stale, fetchedAt: result.fetchedAt, articles: result.articles, error: null };
      } catch (error) {
        return { available: false, symbol: input.symbol, marketId: input.marketId, providerFailures: 0, freshArticleCount: 0, stale: false, fetchedAt: new Date().toISOString(), articles: [], error: String(error) };
      }
    }),
    backfill: protectedProcedure.input(symbolInput.extend({ days: z.number().int().min(2).max(3650), marketId: marketIdSchema })).mutation(async ({ input }) => {
      try {
        const result = await backfillHistoricalNews(input.symbol, input.days, input.marketId);
        return { ok: true, symbol: result.symbol, marketId: input.marketId, requestedDays: input.days, articlesStoredOrReturned: result.articles.length, providerFailures: result.providerFailures, fetchedAt: result.fetchedAt, stale: result.stale, error: null };
      } catch (error) {
        return { ok: false, symbol: input.symbol, marketId: input.marketId, requestedDays: input.days, articlesStoredOrReturned: 0, providerFailures: 1, fetchedAt: new Date().toISOString(), stale: true, error: String(error) };
      }
    }),
    refresh: publicProcedure.input(symbolInput.partial().extend({ marketId: marketIdSchema }).optional()).mutation(async ({ input }) => {
      const [tracker, selected] = await Promise.all([
        pollNewsNow(),
        input?.symbol ? fetchStockNewsNow(input.symbol, true, input.marketId).catch((error) => ({ symbol: input.symbol, providerFailures: 1, freshArticleCount: 0, stale: true, fetchedAt: new Date().toISOString(), articles: [], error: String(error), refreshSuppressed: false })) : Promise.resolve(null),
      ]);
      return { tracker, selected };
    }),
    flagIrrelevant: protectedProcedure.input(z.object({ marketId: marketIdSchema, symbol: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9.-]+$/).transform((value) => value.toUpperCase()), articleId: z.string().trim().min(1).max(128), articleHash: z.string().trim().min(16).max(128), headline: z.string().trim().min(1).max(2000), url: z.string().url().max(2048), reason: z.enum(["not_about_company", "wrong_market", "duplicate", "low_quality", "other"]).default("not_about_company") })).mutation(async ({ ctx, input }) => {
      const saved = await saveNewsRelevanceFeedback({ id: `${ctx.user.id}:${input.marketId}:${input.articleId}`, userId: ctx.user.id, marketId: input.marketId, symbol: input.symbol, articleId: input.articleId, articleHash: input.articleHash, headline: input.headline, url: input.url, reason: input.reason, status: "active" });
      return { saved, articleId: input.articleId, marketId: input.marketId };
    }),
    undoIrrelevant: protectedProcedure.input(z.object({ marketId: marketIdSchema, articleId: z.string().trim().min(1).max(128) })).mutation(async ({ ctx, input }) => {
      const updated = await undoNewsRelevanceFeedback(ctx.user.id, input.articleId, input.marketId);
      return { updated, articleId: input.articleId, marketId: input.marketId };
    }),
    myIrrelevant: protectedProcedure.input(z.object({ marketId: marketIdSchema, articleIds: z.array(z.string().trim().min(1).max(128)).max(500).optional() })).query(({ ctx, input }) => listUserNewsRelevanceFeedback(ctx.user.id, input.marketId, input.articleIds)),
    held: protectedProcedure.input(z.object({ marketId: marketIdSchema, status: z.enum(["held", "approved", "dismissed"]).default("held"), limit: z.number().int().min(1).max(200).default(100) })).query(async ({ input }) => {
      const rows = await listHeldNewsArticles(input.marketId, input.status, input.limit);
      const parse = (value: string) => { try { return JSON.parse(value) as unknown; } catch { return []; } };
      return rows.map((row) => ({ ...row, matchedSymbols: parse(row.matchedSymbolsJson), matchedThemes: parse(row.matchedThemesJson), reasons: parse(row.reasonsJson), publishedAt: row.publishedAt.toISOString(), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), reviewedAt: row.reviewedAt?.toISOString() ?? null }));
    }),
    heldDetail: protectedProcedure.input(z.object({ marketId: marketIdSchema, id: z.string().trim().min(1).max(160) })).query(async ({ input }) => {
      const row = await getHeldNewsArticle(input.id, input.marketId);
      if (!row) return null;
      const parse = (value: string) => { try { return JSON.parse(value) as unknown; } catch { return []; } };
      return { ...row, matchedSymbols: parse(row.matchedSymbolsJson), matchedThemes: parse(row.matchedThemesJson), reasons: parse(row.reasonsJson), publishedAt: row.publishedAt.toISOString(), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), reviewedAt: row.reviewedAt?.toISOString() ?? null };
    }),
    reviewHeld: protectedProcedure.input(z.object({ marketId: marketIdSchema, id: z.string().trim().min(1).max(160), decision: z.enum(["approved", "dismissed"]), note: z.string().trim().max(500).optional() })).mutation(async ({ ctx, input }) => {
      const reviewed = await reviewHeldNewsArticle(input.id, input.marketId, ctx.user.id, input.decision, input.note);
      if (!reviewed) return { updated: false, published: false, reason: "Article was already reviewed, missing, or unavailable." };
      if (input.decision === "approved") {
        await saveNewsEvent({ id: reviewed.articleHash, marketId: reviewed.marketId, symbol: reviewed.symbol ?? "MARKET", headline: reviewed.headline, category: "Finance", summary: reviewed.summary, keyEntities: reviewed.matchedSymbolsJson, sentiment: "Neutral", actionableImpact: "Manually approved after Held for Review inspection.", url: reviewed.url, source: `${reviewed.source} · Manually approved`, publishedAt: reviewed.publishedAt, impactScore: reviewed.score, highImpact: false });
      }
      return { updated: true, published: input.decision === "approved", id: reviewed.id, marketId: reviewed.marketId };
    }),
  }),
  autonomousRecommendations: router({
    discover: publicProcedure.input(z.object({ lookbackDays: z.number().int().min(1).max(180).default(30), limit: z.number().int().min(1).max(100).default(50) }).optional()).query(({ input }) => discoverAutonomousRecommendations("IN", input?.lookbackDays ?? 30, input?.limit ?? 50)),
    latest: publicProcedure.input(z.object({ lookbackDays: z.number().int().min(1).max(180).default(30), limit: z.number().int().min(1).max(100).default(50), sort: z.enum(["impact", "confidence", "latest"]).default("impact") }).optional()).query(({ input }) => getPersistedAutonomousRecommendations(input ?? {})),
    detail: publicProcedure.input(z.object({ id: z.string().trim().min(1).max(160) })).query(async ({ input }) => {
      const record = await getAutonomousRecommendation(input.id);
      if (!record) return null;
      const parse = (value: string) => { try { return JSON.parse(value) as unknown; } catch { return []; } };
      return { ...record, factors: parse(record.factorsJson), evidence: parse(record.evidenceJson), sourceTimestamp: record.sourceTimestamp.toISOString(), eventTimestamp: record.eventTimestamp.toISOString(), detectedAt: record.detectedAt.toISOString(), lastSeenAt: record.lastSeenAt.toISOString(), staleAt: record.staleAt?.toISOString() ?? null, invalidatedAt: record.invalidatedAt?.toISOString() ?? null };
    }),
  }),
  smartAlerts: router({
    discover: publicProcedure.input(z.object({ query: z.string().trim().min(3).max(500), marketId: marketIdSchema, lookbackDays: z.number().int().min(1).max(180).default(30), limit: z.number().int().min(1).max(100).default(50), sort: z.enum(["match-score", "order-value", "order-revenue", "market-cap-impact", "latest-event", "sector", "potential-impact"]).default("match-score") })).query(async ({ input }): Promise<SmartAlertDiscovery & { delivery: Awaited<ReturnType<typeof persistSmartAlertDiscovery>> }> => {
      const stableRuleId = `${input.marketId}-live-${input.query.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80)}`;
      const rule = normalizeMonitoringQuery(input.query, stableRuleId);
      const discovery = await discoverLiveSmartAlerts(rule, { marketId: input.marketId, lookbackDays: input.lookbackDays, limit: input.limit, sort: input.sort });
      const delivery = await persistSmartAlertDiscovery(discovery);
      return { ...discovery, delivery };
    }),
    refreshFromResearchRun: protectedProcedure.input(z.object({ runId: z.string().trim().min(1).max(160), query: z.string().trim().min(3).max(500), lookbackDays: z.number().int().min(1).max(180).default(30), limit: z.number().int().min(1).max(100).default(50), sort: z.enum(["match-score", "order-value", "order-revenue", "market-cap-impact", "latest-event", "sector", "potential-impact"]).default("match-score") })).query(async ({ ctx, input }) => {
      const run = await getResearchRun(ctx.user.id, input.runId);
      if (!run) throw new Error("Research run not found or not owned by this account.");
      if (!["completed", "degraded"].includes(run.status)) throw new Error(`Research run is ${run.status}; Smart Alerts refresh requires a completed or degraded run.`);
      const stableRuleId = `${run.marketId}-research-${input.runId.slice(-24)}-${input.query.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}`;
      const rule = normalizeMonitoringQuery(input.query, stableRuleId);
      const discovery = await discoverLiveSmartAlerts(rule, { marketId: run.marketId as MarketId, lookbackDays: input.lookbackDays, limit: input.limit, sort: input.sort });
      const delivery = await persistSmartAlertDiscovery(discovery);
      return { runId: input.runId, marketId: run.marketId, marketLabel: getMarketProfile(run.marketId as MarketId).country, discovery, delivery };
    }),
    history: publicProcedure.input(z.object({ ruleId: z.string().trim().min(1).max(96), marketId: z.enum(["ALL", "IN", "US", "GB", "CA", "AU", "JP", "SG", "HK", "DE", "FR"]).default("ALL"), limit: z.number().int().min(1).max(100).default(50) })).query(({ input }) => getSmartAlertHistory(input.ruleId, input.limit, input.marketId)),
  }),
  market: router({
    secFilings: publicProcedure.input(z.object({ marketId: marketIdSchema, symbol: symbolInput.shape.symbol, form: z.string().trim().max(20).optional(), from: z.string().date().optional(), to: z.string().date().optional() })).query(async ({ input }) => {
      const records = await getSourceRecordsForSymbol(input.marketId, input.symbol, 2_000);
      const secRecords = records.filter((record) => /^sec-edgar|^sec-company-facts/i.test(record.sourceKey));
      const filings = filterFilingsForSymbol(secRecords, input.symbol).filter((filing) => !input.form || filing.filingType.toLowerCase().includes(input.form.toLowerCase())).filter((filing) => !input.from || !filing.publishedAt || filing.publishedAt.slice(0, 10) >= input.from).filter((filing) => !input.to || !filing.publishedAt || filing.publishedAt.slice(0, 10) <= input.to);
      const factsRecord = secRecords.find((record) => record.sourceKey === "sec-company-facts");
      let facts: Array<{ taxonomy: string; tag: string; unit: string; value: number; end?: string; filed?: string; form?: string }> = [];
      if (factsRecord?.normalizedPayload) { try { const parsed = JSON.parse(factsRecord.normalizedPayload) as { facts?: unknown }; facts = Array.isArray(parsed.facts) ? parsed.facts.filter((fact): fact is typeof facts[number] => Boolean(fact && typeof fact === "object" && typeof (fact as { tag?: unknown }).tag === "string" && typeof (fact as { value?: unknown }).value === "number")) : []; } catch { facts = []; } }
      return { symbol: input.symbol, source: "SEC EDGAR", records: filings, facts: facts.slice(-500), refreshedAt: new Date().toISOString() };
    }),
    secFilingComparison: publicProcedure.input(z.object({ symbols: z.array(symbolInput.shape.symbol).min(2).max(8), from: z.string().date().optional(), to: z.string().date().optional(), forms: z.array(z.string().trim().max(20)).max(10).optional(), metrics: z.array(z.string().trim().max(100)).max(20).default(DEFAULT_METRICS), marketId: marketIdSchema.default("US") })).query(async ({ input }) => {
      const market = getMarketProfile(input.marketId as MarketId);
      if (input.marketId !== "US") return { symbols: input.symbols.map((symbol) => symbol.toUpperCase()), from: input.from ?? null, to: input.to ?? null, forms: input.forms ?? [], metrics: input.metrics, points: [], unavailable: input.symbols.map((symbol) => ({ symbol: symbol.toUpperCase(), reason: `${market.country} XBRL comparison is unavailable until a validated structured filing adapter is promoted.` })), refreshedAt: new Date().toISOString(), marketId: market.id, marketLabel: market.country };
      const recordsBySymbol = Object.fromEntries(await Promise.all(input.symbols.map(async (symbol) => [symbol.toUpperCase(), await getSourceRecordsForSymbol(input.marketId, symbol, 2_000)])));
      return { ...buildFilingComparison(recordsBySymbol, input), marketId: market.id, marketLabel: market.country };
    }),
    secFilingComparisonExport: publicProcedure.input(z.object({ symbols: z.array(symbolInput.shape.symbol).min(2).max(8), from: z.string().date().optional(), to: z.string().date().optional(), forms: z.array(z.string().trim().max(20)).max(10).optional(), metrics: z.array(z.string().trim().max(100)).max(20).default(DEFAULT_METRICS), marketId: marketIdSchema.default("US") })).query(async ({ input }) => {
      const market = getMarketProfile(input.marketId as MarketId);
      const comparison = input.marketId !== "US"
        ? { symbols: input.symbols.map((symbol) => symbol.toUpperCase()), from: input.from ?? null, to: input.to ?? null, forms: input.forms ?? [], metrics: input.metrics, points: [], unavailable: input.symbols.map((symbol) => ({ symbol: symbol.toUpperCase(), reason: `${market.country} XBRL comparison is unavailable until a validated structured filing adapter is promoted.` })), refreshedAt: new Date().toISOString(), marketId: market.id, marketLabel: market.country }
        : { ...buildFilingComparison(Object.fromEntries(await Promise.all(input.symbols.map(async (symbol) => [symbol.toUpperCase(), await getSourceRecordsForSymbol(input.marketId, symbol, 2_000)]))), input), marketId: market.id, marketLabel: market.country };
      const safeSymbols = comparison.symbols.join("-").replace(/[^A-Z0-9-]/gi, "-").slice(0, 80);
      const baseName = `analyzerx-filing-comparison-${safeSymbols || "selected-market"}`;
      const [pdf, markdown] = await Promise.all([filingComparisonToPdf(comparison), Promise.resolve(filingComparisonToMarkdown(comparison))]);
      return { fileName: `${baseName}.md`, pdfFileName: `${baseName}.pdf`, csvFileName: `${baseName}.csv`, chartFileName: `${baseName}.svg`, mimeType: "text/markdown", pdfMimeType: "application/pdf", csvMimeType: "text/csv", chartMimeType: "image/svg+xml", marketId: market.id, marketLabel: market.country, content: markdown, csvContent: filingComparisonToCsv(comparison), chartContent: filingComparisonToSvg(comparison), pdfBase64: pdf.toString("base64") };
    }),
    profile: publicProcedure.input(symbolInput).query(async ({ input }) => {
      const [market, fundamentals, news, filings, derivatives] = await Promise.allSettled([
        fetchMarketSnapshot(input.symbol, input.marketId),
        analyzeFundamentals(input.symbol, input.marketId),
        fetchStockNewsNow(input.symbol, false, input.marketId),
        getSourceRecordsForSymbol(input.marketId, input.symbol),
        fetchDerivativesSnapshot(input.symbol, input.marketId),
      ]);
      const profile = {
        symbol: input.symbol,
        asOf: new Date().toISOString(),
        market: market.status === "fulfilled" ? market.value : null,
        fundamentals: fundamentals.status === "fulfilled" ? fundamentals.value : null,
        news: news.status === "fulfilled" ? news.value : null,
        filings: filings.status === "fulfilled" ? { records: filterFilingsForSymbol(filings.value, input.symbol), entryLinks: getOfficialFilingLinks(input.symbol) } : { records: [], entryLinks: getOfficialFilingLinks(input.symbol) },
        derivatives: derivatives.status === "fulfilled" ? derivatives.value : null,
        errors: {
          market: market.status === "rejected" ? String(market.reason) : null,
          fundamentals: fundamentals.status === "rejected" ? String(fundamentals.reason) : null,
          news: news.status === "rejected" ? String(news.reason) : null,
          filings: filings.status === "rejected" ? String(filings.reason) : null,
          derivatives: derivatives.status === "rejected" ? String(derivatives.reason) : null,
        },
      };
      void persistProfileObservations(input.symbol, { market: profile.market, fundamentals: profile.fundamentals }).catch(() => undefined);
      return profile;
    }),
    snapshot: publicProcedure.input(symbolInput).query(({ input }) => fetchMarketSnapshot(input.symbol, input.marketId)),
    observations: publicProcedure.input(z.object({ symbol: symbolInput.shape.symbol, limit: z.number().int().min(1).max(500).default(100) })).query(async ({ input }) => ({ symbol: input.symbol, market: await getMarketObservationsForSymbol(input.symbol, input.limit), fundamentals: await getFundamentalObservationsForSymbol(input.symbol, input.limit) })),
    watchlistEvidence: publicProcedure.input(z.object({ marketId: marketIdSchema, symbols: z.array(symbolInput.shape.symbol).min(1).max(50) })).query(async ({ input }) => { const rows = await getLatestEventProjections(input.marketId, 500); return input.symbols.map((symbol) => ({ symbol, events: rows.filter((row) => row.symbol === symbol).slice(0, 20) })); }),
    universe: publicProcedure.query(async () => fetchNseUniverse()),
    positioning: publicProcedure.input(symbolInput).query(async ({ input }) => getPositioningCoverage(input.symbol)),
    sectorNames: publicProcedure.query(() => getAvailableSectorNames()),
    sectorConstituents: publicProcedure.input(z.object({ marketId: marketIdSchema, sector: z.string().trim().min(1).max(80), sort: z.enum(["score", "fii", "dii", "marketCap", "changePercent", "pe"]).default("score"), direction: z.enum(["asc", "desc"]).default("desc"), range: z.enum(["TODAY", "THREE_DAYS", "ONE_WEEK", "ONE_MONTH", "QTD"]).default("TODAY"), limit: z.number().int().min(1).max(100).default(100) })).query(({ input }) => getSectorConstituents(input.sector, { sort: input.sort as SectorSort, direction: input.direction, range: input.range, limit: input.limit })),
    indiaStockMcpStatus: publicProcedure.query(() => getIndiaStockMcpStatus()),
    indiaStockMcpSnapshot: publicProcedure.input(symbolInput).query(({ input }) => getIndiaStockMcpSnapshot(input.symbol)),
    indiaStockMcpHistory: publicProcedure.input(z.object({ symbol: symbolInput.shape.symbol, from: z.string().date(), to: z.string().date(), interval: z.enum(["1d", "1wk", "1mo"]).default("1d") })).query(({ input }) => getIndiaStockMcpHistory(input.symbol, input.from, input.to, input.interval)),
    indiaStockMcpSearch: publicProcedure.input(z.object({ query: z.string().trim().min(1).max(60) })).query(({ input }) => searchIndiaStockMcp(input.query)),
    search: publicProcedure.input(z.object({ query: z.string().trim().min(1).max(60), marketId: marketIdSchema })).query(async ({ input }) => {
      const [indianResult, finnhubResult, indianOpenResult, projectionResult] = await Promise.allSettled([
        fetchIndianSearch(input.query),
        fetchFinnhub<FinnhubSearchResponse>("search", { q: input.query }),
        fetchIndianOpenSearch(input.query),
        getLatestEventProjections(input.marketId, 500),
      ]);
      const results = [
        ...(indianResult.status === "fulfilled" ? normalizeSearchResults(indianResult.value, "Indian API") : []),
        ...(finnhubResult.status === "fulfilled" ? normalizeSearchResults(finnhubResult.value as unknown as IndianSearchResponse, "Finnhub") : []),
        ...(indianOpenResult.status === "fulfilled" ? normalizeIndianOpenSearch(indianOpenResult.value) : []),
      ];
      const dedupedResults = [...new Map(results.map((item) => [`${item.symbol}:${item.name}`.toUpperCase(), item])).values()];
      const projectionMatches = projectionResult.status === "fulfilled" ? projectionResult.value.filter((row) => `${row.symbol ?? ""} ${row.title} ${row.summary}`.toLowerCase().includes(input.query.toLowerCase())).slice(0, 25) : [];
      return {
        query: input.query,
        marketId: input.marketId,
        marketLabel: getMarketProfile(input.marketId as MarketId).country,
        results: dedupedResults,
        eventProjections: projectionMatches,
        sources: {
          indianApi: indianResult.status === "fulfilled",
          finnhub: finnhubResult.status === "fulfilled",
          indianOpenApi: indianOpenResult.status === "fulfilled",
        },
        errors: {
          indianApi: indianResult.status === "rejected" ? String(indianResult.reason) : null,
          finnhub: finnhubResult.status === "rejected" ? String(finnhubResult.reason) : null,
          indianOpenApi: indianOpenResult.status === "rejected" ? String(indianOpenResult.reason) : null,
        },
      };
    }),
    institutionalFlows: publicProcedure.input(z.object({ range: z.enum(["TODAY", "THREE_DAYS", "ONE_WEEK", "ONE_MONTH", "QTD"]).default("TODAY") }).optional()).query(({ input }) => fetchNseInstitutionalFlows({ range: input?.range as FlowRange | undefined })),
    fundamentals: publicProcedure.input(symbolInput).query(({ input }) => analyzeFundamentals(input.symbol, input.marketId)),
    report: publicProcedure.input(z.object({ symbol: symbolInput.shape.symbol, marketId: marketIdSchema })).query(async ({ input }) => {
      const market = getMarketProfile(input.marketId as MarketId);
      const report = await analyzeFundamentals(input.symbol, input.marketId);
      const news = await fetchStockNewsNow(report.resolvedSymbol, false, input.marketId);
      const [pdf, markdown] = await Promise.all([fundamentalAnalysisToPdf(report, news.articles, market.country), Promise.resolve(`${`# Selected market: ${market.country} (${market.id})`}\n\n${fundamentalAnalysisToMarkdown(report, news.articles)}`)]);
      return { symbol: report.resolvedSymbol, marketId: market.id, marketLabel: market.country, fileName: reportFileName(report, "pdf"), markdownFileName: reportFileName(report), format: "pdf", content: markdown, pdfBase64: pdf.toString("base64"), report, news: { fetchedAt: news.fetchedAt, freshArticleCount: news.freshArticleCount, stale: news.stale, providerFailures: news.providerFailures } };
    }),
    peerComparison: publicProcedure.input(symbolInput).query(({ input }) => comparePeers(input.symbol, input.marketId)),
    filings: publicProcedure.input(symbolInput).query(async ({ input }) => ({ symbol: input.symbol, records: filterFilingsForSymbol(await getLatestSourceRecords(input.marketId, 500), input.symbol), entryLinks: getOfficialFilingLinks(input.symbol) })),
    officialFilingLinks: publicProcedure.input(symbolInput).query(({ input }) => getOfficialFilingLinks(input.symbol)),
    derivatives: publicProcedure.input(symbolInput).query(({ input }) => fetchDerivativesSnapshot(input.symbol, input.marketId)),
    derivativesSources: publicProcedure.query(() => getDerivativesSourceCatalog()),
    multibaggerSignals: publicProcedure.input(z.object({ marketId: marketIdSchema, strategyId: z.enum(["buffett-munger", "peter-lynch", "canslim", "greenblatt", "fisher", "small-cap-compounder"]).default("buffett-munger") })).query(({ input }) => getMultibaggerSignals(input.marketId, input.strategyId as MultibaggerStrategyId)),
    multiAssetTiming: publicProcedure.input(z.object({ marketId: marketIdSchema })).query(({ input }) => getMultiAssetTimingSignals(input.marketId)),
    indianSnapshot: publicProcedure.input(symbolInput).query(async ({ input }) => {
      try {
        const payload = await fetchIndian<IndianStockResponse>(input.symbol);
        return { available: true, asOf: new Date().toISOString(), errors: null, data: normalizeIndianSnapshot(payload, input.symbol) };
      } catch (error) {
        return { available: false, asOf: new Date().toISOString(), errors: String(error), data: null };
      }
    }),
  }),
});

export type AppRouter = typeof appRouter;
