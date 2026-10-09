import { analyzeFundamentals, type FundamentalAnalysis } from "./fundamental-analysis";
import { fetchStockNewsNow, getLatestTrackedNews } from "./news-tracker";
import { getMultiAssetTimingSignals } from "./research-signals";
import { invokeLLM, type MessageContent } from "./_core/llm";
import { getMarketProfile, type MarketId } from "../lib/market-regions";
import { runResearchDesk } from "./research-desk";

export type MarketChatMessage = { role: "user" | "assistant"; content: string };
export type MarketChatAttachment = { kind: "image" | "audio"; dataUrl: string; mimeType: string; name?: string };
export type MarketChatSource = { label: string; detail: string; url?: string };
export type AnalyzerXAction =
  | { type: "navigate"; route: "/" | "/flows" | "/graph" | "/sectors" | "/screener" | "/alerts" | "/market-chat" | "/storylines" | "/research-workspace" | "/research-desk" | "/support" | "/account"; params?: Record<string, string> }
  | { type: "filter_news"; symbol: string; sentiment?: "Positive" | "Neutral" | "Negative" }
  | { type: "open_report"; symbol: string };

export type MarketChatResponse = {
  answer: string;
  marketId: MarketId;
  marketLabel: string;
  symbol: string | null;
  confidence: "high" | "medium" | "low";
  engine: "server-grounded" | "multimodal-grounded" | "deterministic-fallback";
  runtimeModel: string;
  sources: MarketChatSource[];
  dataAsOf: string | null;
  limitations: string[];
  suggestedQuestions: string[];
  action: AnalyzerXAction | null;
};

const COMMON_SYMBOLS: Record<string, string> = {
  reliance: "RELIANCE", "reliance industries": "RELIANCE", tcs: "TCS", "tata consultancy services": "TCS", infosys: "INFY", infy: "INFY",
  "tata motors": "TATAMOTORS", "tata power": "TATAPOWER", "adani enterprises": "ADANIENT", "adani ports": "ADANIPORTS", jiofin: "JIOFIN", "jio financial": "JIOFIN",
};

function isGeneralChatQuestion(message: string): boolean {
  return !/(price|quote|stock|share|ticker|market|news|headline|filing|earnings|result|dividend|valuation|p\/?e|crypto|bitcoin|gold|forex|fii|dii|chart|technical|fundamental|company|latest|today|current|recent|forecast)/i.test(message);
}

function inferSymbol(message: string, explicit?: string) {
  if (explicit?.trim()) return explicit.trim().toUpperCase();
  const lower = message.toLowerCase();
  const named = Object.entries(COMMON_SYMBOLS).find(([name]) => lower.includes(name));
  if (named) return named[1];
  const ticker = message.match(/\b[A-Z][A-Z0-9.-]{1,9}(?:\.(?:NS|BO|L|DE|PA|TO))?\b/);
  return ticker?.[0]?.toUpperCase() ?? null;
}

function compactAnalysis(analysis: FundamentalAnalysis) {
  return { requestedSymbol: analysis.requestedSymbol, resolvedSymbol: analysis.resolvedSymbol, companyName: analysis.companyName, market: analysis.market, score: analysis.score, verdict: analysis.verdict, confidenceScore: analysis.institutionalReport.confidenceScore, metrics: analysis.metrics, quantitativeMetrics: analysis.quantitativeMetrics, risks: analysis.risks.slice(0, 8), fairValue: analysis.fairValue, conclusion: analysis.stockAnalysis.conclusion, sources: analysis.sources, warnings: analysis.warnings, asOf: analysis.asOf };
}

function buildContext(symbol: string | null, analysis: FundamentalAnalysis | null, news: Awaited<ReturnType<typeof fetchStockNewsNow>> | null, globalNews: Awaited<ReturnType<typeof getLatestTrackedNews>>, assets: Awaited<ReturnType<typeof getMultiAssetTimingSignals>>, marketId: MarketId) {
  const market = getMarketProfile(marketId);
  return JSON.stringify({
    marketScope: { id: market.id, country: market.country, currency: market.currency, exchanges: market.exchanges, coverage: market.coverage, adapterState: market.adapterState },
    questionScope: symbol ? `Selected ${market.country} entity: ${symbol}` : `Selected ${market.country} market context; no specific entity was confidently identified`,
    analysis: analysis ? compactAnalysis(analysis) : null,
    news: news ? { symbol: news.symbol, fetchedAt: news.fetchedAt, stale: news.stale, freshArticleCount: news.freshArticleCount, providerFailures: news.providerFailures, articles: news.articles.slice(0, 12).map((item) => ({ headline: item.headline, summary: item.summary, sentiment: item.sentiment, impact_score: item.impact_score, source: item.source, url: item.url, published_at: item.published_at })) } : null,
    globalNews: globalNews.slice(0, 12).map((item) => ({ symbol: item.symbol, headline: item.headline, summary: item.summary, sentiment: item.sentiment, impact_score: item.impact_score, source: item.source, url: item.url, published_at: item.published_at })),
    multiAssetSignals: assets.signals.map((item) => ({ name: item.name, assetType: item.type, action: item.action, score: item.score, changePct: item.changePct, source: item.source, asOf: item.freshness })),
  });
}

export function validateAnalyzerXAction(value: Record<string, unknown>, symbol: string | null = null): AnalyzerXAction | null {
  const type = value.actionType;
  if (type === "navigate" && typeof value.actionRoute === "string" && ["/", "/flows", "/graph", "/sectors", "/screener", "/alerts", "/market-chat", "/storylines", "/research-workspace", "/research-desk", "/support", "/account"].includes(value.actionRoute)) {
    return { type, route: value.actionRoute as AnalyzerXAction & { type: "navigate" } extends infer T ? T extends { route: infer R } ? R : never : never, params: typeof value.actionSymbol === "string" ? { symbol: value.actionSymbol.toUpperCase() } : undefined } as AnalyzerXAction;
  }
  if (type === "open_report" && typeof value.actionSymbol === "string" && /^[A-Z0-9.-]{1,20}$/i.test(value.actionSymbol)) return { type, symbol: value.actionSymbol.toUpperCase() };
  if (type === "filter_news" && typeof value.actionSymbol === "string" && /^[A-Z0-9.-]{1,20}$/i.test(value.actionSymbol)) {
    const sentiment = value.actionSentiment === "Positive" || value.actionSentiment === "Neutral" || value.actionSentiment === "Negative" ? value.actionSentiment : undefined;
    return { type, symbol: value.actionSymbol.toUpperCase(), sentiment };
  }
  if (type === "navigate" && symbol) return { type, route: "/screener", params: { symbol } };
  return null;
}

function deterministicIntent(message: string, symbol: string | null, marketId: MarketId): MarketChatResponse | null {
  const market = getMarketProfile(marketId);
  const lower = message.toLowerCase();
  const base = (answer: string, action: AnalyzerXAction | null = null, suggestedQuestions: string[] = ["Analyze TCS fundamentals", "Show the latest market news", "Open the Market Flows screen"]): MarketChatResponse => ({ answer, marketId, marketLabel: market.country, symbol, confidence: "high", engine: "deterministic-fallback", runtimeModel: "deterministic", sources: [{ label: "AnalyzerX in-app guidance", detail: "Built-in navigation and help contract" }], dataAsOf: null, limitations: [`Selected market: ${market.country}. This is an app-guidance or educational response, not live market data.`], suggestedQuestions, action });
  if (/market flows|fii.*dii|dii.*fii|capital flows/.test(lower)) return base("Open Market Flows from the bottom navigation, then choose Today, 3 Days, 1 Week, 1 Month, or QTD. The screen recomputes the selected range and shows the latest verified FII/DII totals plus prior-period comparison.", { type: "navigate", route: "/flows" });
  if (/open .*screener|go to .*screener|where .*screener/.test(lower)) return base("The Screener is in the bottom navigation. It contains worldwide stock search, fundamental analysis, Multibagger strategies, derivatives status, and PDF report export.", { type: "navigate", route: "/screener" });
  if (/storyline|company timeline/.test(lower)) return base("Open Storylines from the bottom navigation to follow company events chronologically. Select an entity to open its timeline and related evidence.", { type: "navigate", route: "/storylines" });
  if (/clear .*history|delete .*assistant history|remove .*chat/.test(lower)) return base("Use the trash icon in the AnalyzerX Assistant header. Chat history is stored locally on this device and can be cleared there.", { type: "navigate", route: "/market-chat" });
  if (/screenshot|upload .*chart|analy[sz]e an image/.test(lower)) return base("Yes. Tap the image button in AnalyzerX Assistant, choose a screenshot or chart, and send it with an optional question. The assistant accepts bounded image attachments and will state when visual interpretation is unavailable.", null, ["What does this chart show?", "Explain this error screenshot", "Analyze TCS fundamentals"]);
  if (/voice|microphone|audio/.test(lower)) return base("Yes. Tap the microphone button, grant permission, speak your question, tap stop, and send the attached voice input. If permission is denied, you can type the same question in plain English.", null, ["Ask by voice about Reliance", "Explain FII versus DII", "Open Market Flows"]);
  if (/pdf|research report/.test(lower) && /generate|export|download|how do|open/.test(lower)) return base("Open Screener, choose or search a stock, then use the research report export control. AnalyzerX generates a readable PDF with scorecards, evidence, valuation, risks, source disclosures, and data limitations.", symbol ? { type: "open_report", symbol } : { type: "navigate", route: "/screener" });
  if (/latest news|positive news|news for/.test(lower) && symbol) return base(`I can open the verified news feed for ${symbol}. The feed shows headline, source, publication time, sentiment, impact score, and provider freshness; it does not guarantee a price reaction.`, { type: "filter_news", symbol, sentiment: /positive/.test(lower) ? "Positive" : undefined });
  if (/compound interest/.test(lower)) return base("Compound interest means returns are added to the balance, so future returns can apply to both the original amount and earlier returns. The result depends on time, rate, contributions, fees, and risk; it is not a guaranteed market outcome.", null, ["Explain diversification simply", "What does risk versus uncertainty mean?", "What is a data source?"]);
  if (/diversification/.test(lower)) return base("Diversification spreads exposure across different assets, sectors, geographies, or time periods. It can reduce concentration risk but cannot remove market losses or guarantee returns.");
  if (/guarantee.*stock|all my savings|invest all/.test(lower)) return base("No assistant can guarantee a stock outcome. Concentrating all savings in one company creates substantial concentration risk; consider your own objectives, time horizon, liquidity needs, and professional advice before acting.", null, ["Explain risk versus uncertainty", "What does a confidence score mean?", "How does AnalyzerX score news impact?"]);
  if (/morning routine|overwhelmed|research habit|organize/.test(lower)) return base("Keep the routine small: define one research question, review source freshness, record evidence and risks, and set a fixed time limit. If market information feels overwhelming, pause, reduce alerts, and return to a written plan rather than reacting to every headline.");
  if (/what is a data source|source.*mean|confidence score|chart legend|risk versus uncertainty|what moves forex|crypto and gold volatility|neutral sentiment|roce|free cash flow|pe and peg/.test(lower)) return base("I can explain the concept, but I will not invent a live value. In AnalyzerX, read the displayed source, data-as-of time, confidence, and limitation labels together; a missing or estimated field must be treated as evidence-limited, not as a confirmed fact.");
  return null;
}

function fallback(symbol: string | null, analysis: FundamentalAnalysis | null, news: Awaited<ReturnType<typeof fetchStockNewsNow>> | null, globalNews: Awaited<ReturnType<typeof getLatestTrackedNews>>, assets: Awaited<ReturnType<typeof getMultiAssetTimingSignals>>, reason: string, attachmentCount: number, marketId: MarketId): MarketChatResponse {
  const limitations = ["The hosted reasoning model was unavailable, so this is a deterministic verified-data summary.", reason];
  if (!analysis && !news && globalNews.length === 0) return { answer: "I could not identify a company or retrieve verified market context. Try a symbol, upload a chart or screenshot, or ask about a visible AnalyzerX feature.", marketId, marketLabel: getMarketProfile(marketId).country, symbol, confidence: "low", engine: "deterministic-fallback", runtimeModel: "deterministic", sources: [], dataAsOf: null, limitations, suggestedQuestions: ["Analyze TCS fundamentals", "Show the latest market news", "Open the Market Flows screen"], action: null };
  const pieces: string[] = [];
  if (analysis) pieces.push(`${analysis.companyName} (${analysis.resolvedSymbol}) has a research score of ${analysis.score}/100 with a verdict of ${analysis.verdict}.`);
  if (analysis?.risks.length) pieces.push(`Key recorded risks: ${analysis.risks.slice(0, 3).join("; ")}.`);
  if (news) pieces.push(`${news.freshArticleCount} fresh verified news item${news.freshArticleCount === 1 ? "" : "s"} were returned; ${news.providerFailures} provider failure${news.providerFailures === 1 ? "" : "s"} were reported.`);
  if (!analysis && globalNews.length) pieces.push(`The tracker has ${globalNews.length} recent verified market item${globalNews.length === 1 ? "" : "s"} available for the broader market.`);
  if (assets.signals.length) pieces.push(`Multi-asset context is available for ${assets.signals.map((item) => item.name).join(", ")}.`);
  if (attachmentCount) pieces.push(`I received ${attachmentCount} attachment${attachmentCount === 1 ? "" : "s"}, but visual/audio interpretation was unavailable in this fallback response.`);
  return { answer: pieces.join(" "), marketId, marketLabel: getMarketProfile(marketId).country, symbol, confidence: analysis?.institutionalReport.confidenceScore && analysis.institutionalReport.confidenceScore >= 70 ? "medium" : "low", engine: "deterministic-fallback", runtimeModel: "deterministic", sources: analysis?.sources.map((source) => ({ label: source.name, detail: source.note })) ?? (news ? [{ label: "Verified news tracker", detail: `${news.freshArticleCount} fresh item(s), fetched ${news.fetchedAt}` }] : []), dataAsOf: analysis?.asOf ?? news?.fetchedAt ?? globalNews[0]?.published_at ?? null, limitations, suggestedQuestions: ["What evidence supports this score?", "Show the latest news catalysts", "What data gaps should I verify?"], action: null };
}

export type GroundedMarketContext = {
  symbol: string | null;
  analysis: Awaited<ReturnType<typeof analyzeFundamentals>> | null;
  news: Awaited<ReturnType<typeof fetchStockNewsNow>> | null;
  globalNews: Awaited<ReturnType<typeof getLatestTrackedNews>>;
  assets: Awaited<ReturnType<typeof getMultiAssetTimingSignals>>;
  sources: MarketChatSource[];
  dataAsOf: string | null;
  context: string;
};

export async function collectGroundedMarketContext(message: string, explicitSymbol?: string, marketId: MarketId = "IN"): Promise<GroundedMarketContext> {
  const cleanMessage = message.trim().slice(0, 2_000);
  if (!cleanMessage) throw new Error("A market question is required");
  const symbol = inferSymbol(cleanMessage, explicitSymbol);
  const settled = await Promise.allSettled([
    symbol ? analyzeFundamentals(symbol) : Promise.resolve(null),
    symbol ? fetchStockNewsNow(symbol, false, marketId) : Promise.resolve(null),
    getLatestTrackedNews(20, undefined, marketId),
    getMultiAssetTimingSignals(),
  ]);
  const analysis = settled[0].status === "fulfilled" ? settled[0].value : null;
  const news = settled[1].status === "fulfilled" ? settled[1].value : null;
  const globalNews = settled[2].status === "fulfilled" ? settled[2].value : [];
  const assets = settled[3].status === "fulfilled" ? settled[3].value : { generatedAt: new Date().toISOString(), signals: [], unavailable: [] };
  const sources = analysis?.sources.map((source) => ({ label: source.name, detail: source.note })) ?? (news ? [{ label: "Verified news tracker", detail: `${news.freshArticleCount} fresh item(s), fetched ${news.fetchedAt}` }] : globalNews.slice(0, 4).map((item) => ({ label: item.source, detail: item.headline, url: item.url })));
  const dataAsOf = analysis?.asOf ?? news?.fetchedAt ?? assets.generatedAt ?? globalNews[0]?.published_at ?? null;
  return { symbol, analysis, news, globalNews, assets, sources, dataAsOf, context: buildContext(symbol, analysis, news, globalNews, assets, marketId) };
}

export async function answerMarketChat(message: string, explicitSymbol?: string, history: MarketChatMessage[] = [], attachments: MarketChatAttachment[] = [], marketId: MarketId = "IN"): Promise<MarketChatResponse> {
  const cleanMessage = message.trim().slice(0, 2_000) || (attachments.length ? "Please analyze the attached image or audio in AnalyzerX." : "");
  if (!cleanMessage) throw new Error("A market question is required, or attach an image/audio input");
  const symbol = inferSymbol(cleanMessage, explicitSymbol);
  const intentResponse = deterministicIntent(cleanMessage, symbol, marketId);
  if (intentResponse) return intentResponse;
  if (/deep research|research desk|multi-agent|specialist agents?|research team/i.test(cleanMessage)) {
    const desk = await runResearchDesk({ message: cleanMessage, symbol: symbol ?? undefined, marketId, depth: "deep" });
    return { answer: desk.answer, marketId, marketLabel: desk.marketLabel, symbol: desk.symbol, confidence: desk.confidence, engine: "deterministic-fallback", runtimeModel: "research-desk-deterministic", sources: desk.evidence.slice(0, 8).map((item) => ({ label: item.source, detail: item.label, url: item.url })), dataAsOf: desk.evidence.map((item) => item.observedAt).filter((item): item is string => Boolean(item)).sort().at(-1) ?? null, limitations: desk.limitations.slice(0, 6), suggestedQuestions: ["Show the evidence map", "Compare the technical and fundamental lanes", "Open the selected market report"], action: null };
  }
  const generalQuestion = isGeneralChatQuestion(cleanMessage) && !explicitSymbol;
  const grounded = generalQuestion
    ? {
        symbol: null,
        analysis: null,
        news: null,
        globalNews: [],
        assets: { generatedAt: new Date().toISOString(), signals: [], unavailable: [] },
        sources: [],
        dataAsOf: null,
        context: JSON.stringify({ marketScope: getMarketProfile(marketId), questionScope: "General conversation; no live market retrieval requested", analysis: null, news: null, globalNews: [], multiAssetSignals: [] }),
      }
    : await collectGroundedMarketContext(cleanMessage, explicitSymbol, marketId);
  const { analysis, news, globalNews, assets, context } = grounded;
  const safeHistory = history.slice(-8).map((item) => ({ role: item.role, content: item.content.slice(0, 1_000) }));
  const safeAttachments = attachments.slice(0, 2).filter((item) => (item.kind === "image" ? item.mimeType.startsWith("image/") : item.mimeType.startsWith("audio/")) && item.dataUrl.length <= 8_000_000);
  const content: MessageContent[] = [{ type: "text", text: JSON.stringify({ history: safeHistory, question: cleanMessage, verifiedContext: JSON.parse(context), requestedAction: "If the user asks to navigate, filter news, or open a report, return one allowlisted action; never execute financial transactions." }) }];
  for (const attachment of safeAttachments) content.push(attachment.kind === "image" ? { type: "image_url", image_url: { url: attachment.dataUrl, detail: "auto" } } : { type: "file_url", file_url: { url: attachment.dataUrl, mime_type: attachment.mimeType as "audio/mpeg" | "audio/wav" | "audio/mp4" } });
  const runtimeModel = safeAttachments.length ? "gemini-3-flash-preview" : "gpt-5-mini";
  try {
    const response = await invokeLLM({ model: runtimeModel, messages: [
      { role: "system", content: "You are AnalyzerX Assistant, a concise, supportive, privacy-aware in-app guide and market research assistant. Answer ordinary questions helpfully from general knowledge. Use only the supplied verified context for current market claims; when the context is empty, do not pretend to have live data. Explain charts, scores, data freshness, and app navigation in plain English. For screenshots, identify visible UI states and troubleshooting steps; for audio, summarize the request and answer it. Never invent prices, filings, earnings, ownership, catalysts, or future outcomes. Do not give personalized financial advice or execute trades. Return JSON only. If the user asks for a screen, filter, or report, return an allowlisted action plan for the app to execute." },
      { role: "user", content },
    ],
    maxTokens: safeAttachments.length ? 1_000 : 900,
    responseFormat: { type: "json_schema", json_schema: { name: "analyzerx_assistant_response", strict: true, schema: { type: "object", properties: { answer: { type: "string" }, confidence: { type: "string", enum: ["high", "medium", "low"] }, limitations: { type: "array", items: { type: "string" } }, suggestedQuestions: { type: "array", items: { type: "string" } }, actionType: { type: "string", enum: ["none", "navigate", "filter_news", "open_report"] }, actionRoute: { type: "string" }, actionSymbol: { type: "string" }, actionSentiment: { type: "string", enum: ["Positive", "Neutral", "Negative"] } }, required: ["answer", "confidence", "limitations", "suggestedQuestions", "actionType", "actionRoute", "actionSymbol", "actionSentiment"], additionalProperties: false } } },
    });
    const raw = response.choices[0]?.message?.content;
    const parsed = typeof raw === "string" ? JSON.parse(raw) as Record<string, unknown> : null;
    if (!parsed || typeof parsed.answer !== "string" || !parsed.answer.trim()) throw new Error("The assistant returned an empty answer");
    return { answer: parsed.answer, marketId, marketLabel: getMarketProfile(marketId).country, symbol, confidence: parsed.confidence === "high" || parsed.confidence === "medium" ? parsed.confidence : "low", engine: safeAttachments.length ? "multimodal-grounded" : "server-grounded", runtimeModel, sources: analysis?.sources.map((source) => ({ label: source.name, detail: source.note })) ?? (news ? [{ label: "Verified news tracker", detail: `${news.freshArticleCount} fresh item(s), fetched ${news.fetchedAt}` }] : globalNews.slice(0, 4).map((item) => ({ label: item.source, detail: item.headline, url: item.url }))), dataAsOf: analysis?.asOf ?? news?.fetchedAt ?? assets.generatedAt ?? null, limitations: Array.isArray(parsed.limitations) ? parsed.limitations.filter((item): item is string => typeof item === "string").slice(0, 4) : [], suggestedQuestions: Array.isArray(parsed.suggestedQuestions) ? parsed.suggestedQuestions.filter((item): item is string => typeof item === "string").slice(0, 4) : [], action: validateAnalyzerXAction(parsed, symbol) };
  } catch (error) {
    return fallback(symbol, analysis, news, globalNews, assets, error instanceof Error ? error.message : "Unknown model error", safeAttachments.length, marketId);
  }
}
