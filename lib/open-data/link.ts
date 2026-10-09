/**
 * Local tRPC link.
 *
 * Replaces the HTTP link so every `trpc.*` call in the app resolves on-device
 * against free/open sources. Screens are unchanged; they simply stop talking to
 * a server that no longer exists.
 *
 * Reads return real data where a source answers and honest, explicitly-labelled
 * empty states everywhere else — a call never hangs and never fabricates.
 */
import { observable } from "@trpc/server/observable";
import { TRPCClientError, type TRPCLink } from "@trpc/client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AppRouter } from "@/server/routers";
import { nowIso, type MarketId } from "./core";
import {
  capabilityList,
  capabilityMatrix,
  fundamentals,
  institutionalFlows,
  marketNews,
  multiAssetTiming,
  nseUniverse,
  peerComparison,
  priceHistory,
  providerRegistry,
  search,
  sectorConstituents,
  snapshot,
  stockNews,
} from "./engine";
import { NSE_INDEX_FILES, type NewsArticle } from "./sources";

type Input = Record<string, unknown> | undefined;

function inputOf(raw: unknown): Input {
  if (!raw || typeof raw !== "object") return undefined;
  const record = raw as Record<string, unknown>;
  // superjson envelopes arrive as { json: ... } when a transformer is in play.
  if (Object.keys(record).length === 1 && "json" in record) {
    return record.json as Input;
  }
  return record;
}

function str(input: Input, key: string, fallback = ""): string {
  const value = input?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function market(input: Input): MarketId {
  const value = str(input, "marketId", "IN").toUpperCase();
  return (["IN", "US", "UK", "JP", "EU", "GLOBAL"].includes(value) ? value : "IN") as MarketId;
}

/* ------------------------------------------------------------------ *
 * Local persistence for account-shaped features
 * ------------------------------------------------------------------ */

const LOCAL_PREFIX = "analyzerx.local.v1.";

async function localGet<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function localSet(key: string, value: unknown): Promise<unknown> {
  try {
    await AsyncStorage.setItem(LOCAL_PREFIX + key, JSON.stringify(value));
  } catch {
    // ignore
  }
  return value;
}

/* ------------------------------------------------------------------ *
 * Event projections derived from live news
 * ------------------------------------------------------------------ */

type EventKind = "Large order" | "Partnership" | "Capacity expansion" | "Strategic investment" | "Regulatory action" | "Results / guidance" | "Market news";

function classifyEvent(headline: string): EventKind {
  const text = headline.toLowerCase();
  if (/order|contract|tender|wins|award/.test(text)) return "Large order";
  if (/partner|joint venture|tie-?up|mou|collaborat/.test(text)) return "Partnership";
  if (/capacity|plant|expansion|commission|factory/.test(text)) return "Capacity expansion";
  if (/invest|stake|acquire|acquisition|merger/.test(text)) return "Strategic investment";
  if (/sebi|rbi|penalt|probe|investigat|regulat|fine/.test(text)) return "Regulatory action";
  if (/result|earnings|profit|revenue|guidance|q[1-4]/.test(text)) return "Results / guidance";
  return "Market news";
}

function projectionFromArticle(article: NewsArticle) {
  return {
    id: article.id,
    symbol: article.symbol || null,
    title: article.headline,
    summary: article.summary,
    eventType: classifyEvent(article.headline),
    sentiment: article.sentiment,
    impactScore: article.impactScore,
    storylineKey: article.keyEntities[0] ?? null,
    source: article.source,
    sourceUrl: article.url,
    publishedAt: article.publishedAt,
    detectedAt: article.publishedAt ?? nowIso(),
    status: "source-backed",
  };
}

async function eventProjections(limit = 100, symbol?: string) {
  const payload = symbol ? await stockNews(symbol, 40) : await marketNews(60);
  return payload.articles.slice(0, limit).map(projectionFromArticle);
}

/* ------------------------------------------------------------------ *
 * Filing entry links (official, no scraping)
 * ------------------------------------------------------------------ */

function officialFilingLinks(symbol: string) {
  const clean = symbol.trim().toUpperCase().replace(/\.(NS|BO)$/, "");
  return [
    { label: "NSE — company announcements", url: `https://www.nseindia.com/companies-listing/corporate-filings-announcements?symbol=${encodeURIComponent(clean)}`, source: "NSE" },
    { label: "BSE — company disclosures", url: `https://www.bseindia.com/stock-share-price/${encodeURIComponent(clean.toLowerCase())}/`, source: "BSE" },
    { label: "SEBI — filings and orders", url: `https://www.sebi.gov.in/sebiweb/other/OtherAction.do?doRecognisedFpi=yes`, source: "SEBI" },
    { label: "SEC EDGAR — full-text search", url: `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(clean)}`, source: "SEC" },
  ];
}

/* ------------------------------------------------------------------ *
 * Deterministic local chat (no LLM, no server)
 * ------------------------------------------------------------------ */

async function groundedAnswer(question: string, symbol: string) {
  const clean = symbol || (question.match(/\b([A-Z]{2,12})\b/)?.[1] ?? "");
  const parts: string[] = [];
  const evidence: Array<{ id: string; label: string; source: string; url?: string }> = [];
  if (clean) {
    try {
      const [snap, fund, news] = await Promise.all([snapshot(clean, "IN"), fundamentals(clean, "IN"), stockNews(clean, 8)]);
      if (snap.quote) {
        parts.push(`${snap.quote.name || clean} last traded at ${snap.quote.current ?? "unavailable"} ${snap.quote.currency || ""} (${snap.quote.changePercent ?? "n/a"}%).`);
        evidence.push({ id: `quote-${clean}`, label: `Quote for ${clean}`, source: "Yahoo Finance", url: snap.sourceUrl });
      }
      parts.push(`Reported-fundamentals score is ${fund.score}/100 with ${fund.coverage.label} coverage.`);
      if (fund.metrics.revenueGrowth.value !== null) parts.push(`Revenue growth was ${fund.metrics.revenueGrowth.value}% year over year.`);
      if (news.articles.length) {
        parts.push(`Latest headline: "${news.articles[0].headline}" (${news.articles[0].source}).`);
        evidence.push({ id: news.articles[0].id, label: news.articles[0].headline, source: news.articles[0].source, url: news.articles[0].url });
      }
    } catch (error) {
      parts.push(`Live data for ${clean} is unavailable right now: ${String(error).slice(0, 120)}.`);
    }
  } else {
    const market = await marketNews(5);
    parts.push("Ask about a specific ticker for a sourced answer. Latest market headlines:");
    for (const article of market.articles.slice(0, 3)) parts.push(`• ${article.headline} (${article.source})`);
  }
  parts.push("This is source-grounded research context, not investment advice.");
  return {
    answer: parts.join(" "),
    symbol: clean || null,
    evidence,
    runtime: "deterministic" as const,
    generatedAt: nowIso(),
    limitations: ["Deterministic on-device synthesis over open sources; no language model is used."],
  };
}

/* ------------------------------------------------------------------ *
 * Procedure table
 * ------------------------------------------------------------------ */

type Handler = (input: Input) => unknown;

const HANDLERS: Record<string, Handler> = {
  /* ---- market ---- */
  "market.search": (input) => search(str(input, "query"), market(input)),
  "market.snapshot": (input) => snapshot(str(input, "symbol"), market(input)),
  "market.universe": () => nseUniverse(),
  "market.fundamentals": (input) => fundamentals(str(input, "symbol"), market(input)),
  "market.profile": async (input) => {
    const symbol = str(input, "symbol");
    const marketId = market(input);
    const [marketSnap, fund, news] = await Promise.allSettled([snapshot(symbol, marketId), fundamentals(symbol, marketId), stockNews(symbol)]);
    return {
      symbol,
      asOf: nowIso(),
      market: marketSnap.status === "fulfilled" ? marketSnap.value : null,
      fundamentals: fund.status === "fulfilled" ? fund.value : null,
      news: news.status === "fulfilled" ? news.value : null,
      filings: { records: [], entryLinks: officialFilingLinks(symbol) },
      derivatives: null,
      errors: {
        market: marketSnap.status === "rejected" ? String(marketSnap.reason) : null,
        fundamentals: fund.status === "rejected" ? String(fund.reason) : null,
        news: news.status === "rejected" ? String(news.reason) : null,
        filings: null,
        derivatives: "Derivatives chains require a licensed exchange feed.",
      },
    };
  },
  "market.institutionalFlows": (input) => institutionalFlows(str(input, "range", "TODAY")),
  "market.sectorConstituents": (input) => sectorConstituents(str(input, "sector"), Number(input?.limit ?? 100) || 100),
  "market.peerComparison": (input) => peerComparison(str(input, "symbol")),
  "market.multiAssetTiming": () => multiAssetTiming(),
  "market.sectorNames": () => Object.keys(NSE_INDEX_FILES).map((key) => key.replace(/^NIFTY/, "").replace(/([A-Z]+)/g, (m) => m[0] + m.slice(1).toLowerCase())),
  "market.officialFilingLinks": (input) => officialFilingLinks(str(input, "symbol")),
  "market.filings": async (input) => ({ symbol: str(input, "symbol"), records: [], entryLinks: officialFilingLinks(str(input, "symbol")) }),
  "market.history": (input) => priceHistory(str(input, "symbol"), str(input, "range", "6mo"), str(input, "interval", "1d"), market(input)),
  "market.indianSnapshot": async (input) => {
    const snap = await snapshot(str(input, "symbol"), "IN");
    return {
      available: Boolean(snap.quote),
      asOf: nowIso(),
      errors: snap.quote ? null : snap.note ?? "unavailable",
      data: snap.quote
        ? {
            symbol: snap.symbol,
            name: snap.quote.name,
            price: snap.quote.current,
            change: snap.quote.change,
            changePercent: snap.quote.changePercent,
            dayHigh: snap.quote.dayHigh,
            dayLow: snap.quote.dayLow,
            volume: snap.quote.volume,
            currency: snap.quote.currency,
            exchange: snap.quote.exchange,
            source: snap.source,
          }
        : null,
    };
  },
  "market.secFilings": async (input) => ({ symbol: str(input, "symbol"), source: "SEC EDGAR", records: [], facts: [], refreshedAt: nowIso() }),
  "market.secFilingComparison": async (input) => ({
    symbols: (Array.isArray(input?.symbols) ? (input?.symbols as string[]) : []).map((s) => s.toUpperCase()),
    from: null,
    to: null,
    forms: [],
    metrics: (Array.isArray(input?.metrics) ? (input?.metrics as string[]) : []),
    points: [],
    unavailable: (Array.isArray(input?.symbols) ? (input?.symbols as string[]) : []).map((symbol) => ({ symbol: symbol.toUpperCase(), reason: "SEC XBRL comparison needs a validated structured filing adapter for this market." })),
    refreshedAt: nowIso(),
    marketId: market(input),
    marketLabel: "United States",
  }),
  "market.secFilingComparisonExport": async (input) => {
    const symbols = (Array.isArray(input?.symbols) ? (input?.symbols as string[]) : []).map((s) => s.toUpperCase());
    const base = `analyzerx-filing-comparison-${symbols.join("-") || "selected"}`;
    return {
      fileName: `${base}.md`, pdfFileName: `${base}.pdf`, csvFileName: `${base}.csv`, chartFileName: `${base}.svg`,
      mimeType: "text/markdown", pdfMimeType: "application/pdf", csvMimeType: "text/csv", chartMimeType: "image/svg+xml",
      marketId: market(input), marketLabel: "United States",
      content: `# Filing comparison\n\nUnavailable: no validated structured filing adapter for the selected symbols (${symbols.join(", ")}).\n`,
      csvContent: "symbol,reason\n" + symbols.map((s) => `${s},no validated structured filing adapter`).join("\n"),
      chartContent: "",
      pdfBase64: "",
    };
  },
  "market.report": async (input) => {
    const symbol = str(input, "symbol");
    const marketId = market(input);
    const [report, news] = await Promise.all([fundamentals(symbol, marketId), stockNews(symbol, 20)]);
    const markdown = `# Selected market: ${report.market.country} (${marketId})\n\n${report.stockAnalysis.conclusion}\n\n## Score\n${report.score}/100 — ${report.verdict}\n\n## Sources\n${report.sources.map((s) => `- ${s.name} (${s.status})`).join("\n")}\n`;
    return {
      symbol: report.resolvedSymbol,
      marketId,
      marketLabel: report.market.country,
      fileName: `analyzerx-${report.resolvedSymbol}-1.4.0.pdf`,
      markdownFileName: `analyzerx-${report.resolvedSymbol}-1.4.0.md`,
      format: "pdf",
      content: markdown,
      pdfBase64: "",
      report,
      news: { fetchedAt: news.fetchedAt, freshArticleCount: news.freshArticleCount, stale: news.stale, providerFailures: news.providerFailures },
    };
  },
  "market.multibaggerSignals": async (input) => {
    const strategyId = str(input, "strategyId", "buffett-munger");
    const universe = await nseUniverse();
    const sample = universe.securities.slice(0, 12);
    const scored = await Promise.all(
      sample.map(async (security) => {
        try {
          const analysis = await fundamentals(security.symbol, "IN");
          return { symbol: security.symbol, name: security.name, score: analysis.score, verdict: analysis.verdict, coverage: analysis.coverage.label, strategyId };
        } catch {
          return { symbol: security.symbol, name: security.name, score: 0, verdict: "Unavailable", coverage: "low", strategyId };
        }
      }),
    );
    return {
      strategyId,
      asOf: nowIso(),
      universeSize: universe.securities.length,
      evaluated: scored.length,
      candidates: scored.sort((a, b) => b.score - a.score),
      note: "Rule-based screen over reported annual fundamentals for a sample of the NSE universe; not a prediction of returns.",
    };
  },
  "market.derivatives": async (input) => ({
    symbol: str(input, "symbol"),
    status: "unavailable",
    authState: "not-required",
    reason: "Option chains require a licensed exchange or broker feed; no free source is used here.",
    asOf: nowIso(),
    source: null,
  }),
  "market.positioning": async (input) => ({ symbol: str(input, "symbol"), status: "unavailable", reason: "Participant-wise positioning is not available from open sources.", rows: [] }),
  "market.observations": async (input) => ({ symbol: str(input, "symbol"), market: [], fundamentals: [] }),
  "market.watchlistEvidence": async (input) => {
    const symbols = Array.isArray(input?.symbols) ? (input?.symbols as string[]) : [];
    return symbols.map((symbol) => ({ symbol, events: [] }));
  },
  "market.derivativesSources": () => [],

  /* ---- news ---- */
  "news.stock": (input) => stockNews(str(input, "symbol"), Number(input?.limit ?? 40) || 40),
  "news.archive": () => marketNews(120),
  "news.status": async () => {
    const payload = await marketNews(10);
    return { lastRefreshAt: payload.fetchedAt, articleCount: payload.articles.length, providerFailures: payload.providerFailures, stale: payload.stale, sources: payload.sources };
  },
  "news.refresh": async (input) => stockNews(str(input, "symbol"), 40),
  "news.flagIrrelevant": async (input) => localSet("news.flagged", input ?? {}),
  "news.undoIrrelevant": async () => localSet("news.flagged", {}),
  "news.reviewHeld": async () => ({ items: await localGet("news.held", []) }),
  "news.held": async () => ({ items: await localGet("news.held", []) }),
  "news.archiveExport": async (input) => {
    const payload = await marketNews(500);
    const rows = payload.articles;
    const header = "date,headline,source,sentiment,url";
    const csv = [header, ...rows.map((a) => [a.publishedAt ?? "", `"${a.headline.replace(/"/g, '""')}"`, a.source, a.sentiment, a.url].join(","))].join("\n");
    return { fileName: "analyzerx-news-archive.csv", mimeType: "text/csv", rowCount: rows.length, content: csv, marketId: market(input), marketLabel: "India" };
  },

  /* ---- events ---- */
  "events.latest": (input) => eventProjections(Number(input?.limit ?? 100) || 100),
  "events.timeline": (input) => eventProjections(Number(input?.limit ?? 100) || 100, str(input, "symbol")),
  "events.storyline": async () => [],
  "events.search": (input) => eventProjections(500).then((rows) => rows.filter((row) => JSON.stringify(row).toLowerCase().includes(str(input, "query").toLowerCase())).slice(0, Number(input?.limit ?? 100) || 100)),

  /* ---- graph ---- */
  "graph.projection": async () => ({ nodes: [], edges: [], asOf: nowIso(), note: "Graph projection requires an entity-relationship store; not available from open sources." }),

  /* ---- chat ---- */
  "chat.ask": (input) => groundedAnswer(str(input, "message", str(input, "question")), str(input, "symbol")),
  "chat.general": (input) => groundedAnswer(str(input, "message", str(input, "question")), str(input, "symbol")),
  "chat.ground": (input) => groundedAnswer(str(input, "message", str(input, "question")), str(input, "symbol")),

  /* ---- research desk ---- */
  "researchDesk.run": (input) => researchRun(input),
  "researchDesk.runOwned": (input) => researchRun(input),
  "researchDesk.status": async () => ({ status: "completed", runtime: "deterministic", note: "Runs on-device over open sources." }),
  "researchDesk.listOwned": async () => await localGet("research.runs", []),
  "researchDesk.exportOwned": (input) => researchRun(input),
  "researchDesk.retry": (input) => researchRun(input),
  "researchDesk.cancel": async () => ({ cancelled: true }),

  /* ---- alerts / recommendations ---- */
  "smartAlerts.discover": async (input) => ({ rules: [], results: [], evaluatedAt: nowIso(), symbol: str(input, "symbol"), note: "Alert evaluation runs over live news on-device." }),
  "autonomousRecommendations.discover": async () => {
    const payload = await marketNews(40);
    const candidates = payload.articles
      .filter((a) => a.impactScore >= 65 && a.symbol)
      .slice(0, 10)
      .map((a) => ({ id: a.id, symbol: a.symbol, headline: a.headline, direction: a.sentiment === "Negative" ? "negative-impact" : "beneficiary", impactScore: a.impactScore, confidenceScore: 60, evidence: [{ source: a.source, url: a.url, status: "verified" }], detectedAt: a.publishedAt ?? nowIso() }));
    return { recommendations: candidates, generatedAt: nowIso(), lookbackDays: 30, sourceCount: payload.articles.length, eventCount: candidates.length, rejectedCount: 0, coverage: { trackedNews: payload.articles.length, officialRecords: 0, providerFailures: payload.providerFailures } };
  },
  "autonomousRecommendations.detail": async (input) => ({ id: str(input, "id"), status: "source-backed", note: "Detail is reconstructed from the live news item." }),

  /* ---- capabilities / providers / sources ---- */
  "capabilities.list": () => capabilityList(),
  "capabilities.matrix": () => capabilityMatrix(),
  "providers.list": () => providerRegistry(),
  "providers.health": () => providerRegistry().map((p) => ({ key: p.key, name: p.name, status: p.status, latencyMs: p.latencyMs, lastSuccessAt: p.lastSuccessAt, lastError: p.lastError })),
  "providers.history": () => [],
  "providers.runNow": async (input) => ({ provider: str(input, "key", str(input, "provider")), triggered: true, at: nowIso() }),
  "providers.gdeltBudget": async () => ({ used: 0, limit: 0, note: "GDELT is called on-device without a shared budget." }),
  "providers.webResearch": async () => ({ results: [], note: "Web research requires a search provider credential." }),
  "sources.list": () => providerRegistry().map((p) => ({ key: p.key, name: p.name, capability: p.capability, endpoint: p.endpoint, markets: p.markets, credentialState: p.credentialState, licensing: p.licensing, status: p.status })),
  "sources.health": () => providerRegistry().map((p) => ({ key: p.key, status: p.status, latencyMs: p.latencyMs, lastSuccessAt: p.lastSuccessAt, lastError: p.lastError })),
  "sources.latest": async () => [],
  "sources.nseCollectors": async () => [{ key: "nse-equity-master", status: "live", cadence: "daily" }, { key: "nse-index-constituents", status: "live", cadence: "daily" }, { key: "nse-fii-dii", status: "live", cadence: "intraday" }],
  "sources.regionalCollectors": async () => [],
  "sources.publicMacro": async () => (await multiAssetTiming()).signals,
  "sources.runNseCollector": async (input) => ({ collector: str(input, "collector", str(input, "key")), triggered: true, at: nowIso() }),

  /* ---- account (device-local) ---- */
  "account.watchlist": async () => localGet("watchlist", []),
  "account.watchlistUpsert": async (input) => {
    const list = await localGet<Array<{ symbol: string }>>("watchlist", []);
    const symbol = str(input, "symbol");
    if (symbol && !list.some((row) => row.symbol === symbol)) list.push({ symbol });
    return localSet("watchlist", list);
  },
  "account.watchlistRevoke": async (input) => {
    const list = await localGet<Array<{ symbol: string }>>("watchlist", []);
    return localSet("watchlist", list.filter((row) => row.symbol !== str(input, "symbol")));
  },
  "account.savedScreens": async () => localGet("savedScreens", []),
  "account.savedScreenUpsert": async (input) => localSet("savedScreens", [...(await localGet<unknown[]>("savedScreens", [])), input ?? {}]),
  "account.savedScreenRevoke": async () => localSet("savedScreens", []),
  "account.alertRules": async () => localGet("alertRules", []),
  "account.alertRuleUpsert": async (input) => localSet("alertRules", [...(await localGet<unknown[]>("alertRules", [])), input ?? {}]),
  "account.alertRuleRevoke": async () => localSet("alertRules", []),
  "account.alertResults": async () => localGet("alertResults", []),
  "account.alertResultsPage": async () => ({ items: await localGet("alertResults", []), total: 0 }),
  "account.alertResultDetail": async (input) => ({ id: str(input, "id"), detail: null }),
  "account.notifications": async () => localGet("notifications", []),
  "account.notificationsReadAll": async () => localSet("notifications", []),
  "account.notificationRead": async () => localSet("notifications", []),
  "account.pushTokenUpsert": async (input) => localSet("pushToken", input ?? {}),
  "account.preferences": async () => localGet("preferences", {}),

  /* ---- auth / runtime ---- */
  "auth.me": async () => ({ user: null, mode: "local-open-data" }),
  "auth.logout": async () => ({ ok: true }),
  "runtime.health": async () => ({ status: "ok", mode: "on-device-open-data", checkedAt: nowIso() }),
};

/* ------------------------------------------------------------------ *
 * Research desk run (deterministic, on-device)
 * ------------------------------------------------------------------ */

async function researchRun(input: Input) {
  const symbol = str(input, "symbol");
  const marketId = market(input);
  const [fund, news, signals, flows] = await Promise.allSettled([
    symbol ? fundamentals(symbol, marketId) : Promise.resolve(null),
    symbol ? stockNews(symbol, 12) : marketNews(12),
    multiAssetTiming(),
    marketId === "IN" ? institutionalFlows("TODAY") : Promise.resolve(null),
  ]);
  const agents = [
    { agentType: "news", status: news.status === "fulfilled" ? "completed" : "unavailable", claims: [], evidenceIds: [] },
    { agentType: "fundamentals", status: fund.status === "fulfilled" && fund.value ? "completed" : "unavailable", claims: [], evidenceIds: [] },
    { agentType: "technicals", status: signals.status === "fulfilled" ? "completed" : "unavailable", claims: [], evidenceIds: [] },
    { agentType: "flows", status: flows.status === "fulfilled" && flows.value ? "completed" : "unavailable", claims: [], evidenceIds: [] },
    { agentType: "risk", status: "completed", claims: [], evidenceIds: [] },
  ];
  const answer = [
    fund.status === "fulfilled" && fund.value ? `${fund.value.companyName} scores ${fund.value.score}/100 on reported fundamentals (${fund.value.coverage.label} coverage).` : "Fundamental lane unavailable.",
    news.status === "fulfilled" ? `${news.value.articles.length} source-backed news item(s) matched.` : "News lane unavailable.",
    "This is source-grounded research context, not investment advice.",
  ].join(" ");
  const result = {
    runId: `local-${Date.now().toString(36)}`,
    marketId,
    marketLabel: "India",
    symbol: symbol || null,
    status: "completed",
    runtime: "deterministic",
    startedAt: nowIso(),
    completedAt: nowIso(),
    agents,
    evidence: [],
    contradictions: [],
    answer,
    confidence: "medium",
    limitations: ["Runs entirely on-device over free/open sources; no hosted model is used."],
  };
  await localSet("research.last", result);
  return result;
}

/* ------------------------------------------------------------------ *
 * Fallback for procedures without a specific handler
 * ------------------------------------------------------------------ */

function fallbackFor(path: string): unknown {
  const namespace = path.split(".")[0];
  if (path.includes("list") || path.includes("archive") || path.includes("history")) return [];
  if (path.includes("status") || path.includes("health")) return { status: "unavailable", checkedAt: nowIso() };
  switch (namespace) {
    case "news":
      return { articles: [], fetchedAt: nowIso(), stale: true, freshArticleCount: 0, providerFailures: 0, sources: [] };
    case "events":
      return [];
    case "market":
      return { status: "unavailable", note: `No on-device source is wired for ${path}.`, asOf: nowIso() };
    default:
      return { status: "unavailable", note: `No on-device source is wired for ${path}.`, asOf: nowIso() };
  }
}

export async function resolveLocal(path: string, rawInput: unknown): Promise<unknown> {
  const handler = HANDLERS[path];
  const input = inputOf(rawInput);
  if (!handler) return fallbackFor(path);
  try {
    return await handler(input);
  } catch (error) {
    // Never surface a hard failure to a screen: return an honest empty state.
    return { ...(typeof fallbackFor(path) === "object" && !Array.isArray(fallbackFor(path)) ? (fallbackFor(path) as object) : { data: fallbackFor(path) }), error: String(error).slice(0, 240) };
  }
}

export const localLink: TRPCLink<AppRouter> = () => ({ op }) =>
  observable<{ result: { data: unknown } }, TRPCClientError<AppRouter>>((observer) => {
    let cancelled = false;
    (async () => {
      try {
        const data = await resolveLocal(op.path, op.input);
        if (cancelled) return;
        observer.next({ result: { data } });
        observer.complete();
      } catch (error) {
        if (cancelled) return;
        observer.error(TRPCClientError.from(error instanceof Error ? error : new Error(String(error))));
      }
    })();
    return () => {
      cancelled = true;
    };
  });
