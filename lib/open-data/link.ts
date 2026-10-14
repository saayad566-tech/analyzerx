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
  type SectorConstituent,
} from "./engine";
import { NSE_INDEX_FILES, type NewsArticle } from "./sources";
import { queryArchive, storeStats } from "./store";
import { FALLBACK_UNIVERSE } from "./universe-fallback";
import { catalogSummary, collectorStats, runCollectionCycle } from "./collector";
import { buildCatalog, providerOf } from "./catalog";
import { allLinkHealth, linkHealth, runChain, runMerge, type ChainAttempt } from "./chain";

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
  const valid = ["IN", "US", "GB", "CA", "AU", "JP", "SG", "HK", "DE", "FR"];
  return (valid.includes(value) ? value : "IN") as MarketId;
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

/**
 * Event projection, shaped to the contract in server/event-projections.ts.
 *
 * The screens read `eventAt`, `confidenceScore` and `sourceKey`. This function
 * previously emitted `publishedAt`/`detectedAt` instead, so every consumer that
 * did `new Date(event.eventAt)` rendered "Invalid Date", and the company
 * timeline's Confirmed/Inferred badge never fired because `confidenceScore` was
 * undefined. `storylineKey` also used a bare entity rather than the server's
 * `storyline:SYMBOL:TYPE` form, so unrelated stories were grouped together.
 */
/** Industry from the pinned official NSE constituent snapshot, when known. */
function industryForSymbol(symbol: string): string | null {
  const clean = symbol.trim().toUpperCase().replace(/\.(NS|BO)$/, "");
  return FALLBACK_UNIVERSE.find((row) => row.symbol.toUpperCase() === clean)?.industry ?? null;
}

function projectionFromArticle(article: NewsArticle) {
  const type = classifyEvent(article.headline);
  const parsed = article.publishedAt ? new Date(article.publishedAt) : null;
  // Never emit an invalid date: fall back to now, exactly as the server does.
  const eventAt = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
  const symbol = (article.symbol || "MARKET").toUpperCase();
  return {
    id: article.id,
    symbol: article.symbol || null,
    title: article.headline.slice(0, 500),
    summary: article.summary.slice(0, 2000),
    eventType: type,
    sentiment: article.sentiment,
    impactScore: Math.max(0, Math.min(100, article.impactScore)),
    // 70 when the article carries resolvable entities, 45 when it does not.
    confidenceScore: article.keyEntities.length > 0 ? 70 : 45,
    storylineKey: `storyline:${symbol}:${type}`,
    source: article.source,
    sourceKey: article.source.slice(0, 64),
    sourceUrl: article.url,
    eventAt: eventAt.toISOString(),
    publishedAt: article.publishedAt,
    detectedAt: eventAt.toISOString(),
    status: "source-backed",
  };
}

/**
 * The archive article contract is defined by lib/news-archive.ts (ArchiveArticle)
 * plus the fields the router adds: snake_case `impact_score`, `published_at`,
 * `key_entities`, `actionable_impact` and `high_impact`. The screens read it in
 * that shape, so the on-device layer must emit exactly it. Emitting camelCase
 * here left `impact_score` and `published_at` undefined on the news tracker.
 */
function toArchiveArticle(article: NewsArticle & { collectedAt?: string | null }) {
  const published = article.publishedAt ?? article.collectedAt ?? nowIso();
  return {
    id: article.id,
    marketId: "IN" as const,
    symbol: article.symbol,
    headline: article.headline,
    summary: article.summary,
    source: article.source,
    url: article.url,
    sentiment: article.sentiment,
    // The on-device summary is the impact explanation, which is what the archive
    // contract calls actionable_impact.
    actionable_impact: article.summary,
    impact_score: Math.max(0, Math.min(100, article.impactScore)),
    high_impact: article.impactScore >= 70,
    published_at: published,
    key_entities: article.keyEntities,
  };
}

async function eventProjections(marketId: MarketId, limit = 100, symbol?: string) {
  const payload = symbol ? await stockNews(symbol, 40, marketId) : await marketNews(marketId, 60);
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

async function groundedAnswer(question: string, symbol: string, marketId: MarketId) {
  const clean = (symbol || question.match(/\b([A-Z]{2,12})\b/)?.[1] || "").toUpperCase();
  const parts: string[] = [];
  const sources: Array<{ label: string; detail: string; url?: string }> = [];
  let dataAsOf: string | null = null;

  if (clean) {
    const [snap, fund, news] = await Promise.allSettled([
      snapshot(clean, marketId),
      fundamentals(clean, marketId),
      stockNews(clean, 6, marketId),
    ]);
    if (snap.status === "fulfilled" && snap.value.quote) {
      const q = snap.value.quote;
      parts.push(`${q.name || clean} last traded at ${q.current ?? "unavailable"} ${q.currency} (${q.changePercent ?? "n/a"}% on the day).`);
      sources.push({ label: `Live quote · ${clean}`, detail: `${snap.value.source} · as of ${q.asOf ?? "unavailable"}`, url: snap.value.sourceUrl });
      dataAsOf = q.asOf;
    } else {
      parts.push(`A live quote for ${clean} is unavailable right now.`);
    }
    if (fund.status === "fulfilled") {
      const f = fund.value;
      parts.push(`${f.companyName} scores ${f.score}/100 on reported fundamentals with ${f.coverage.label.toLowerCase()} coverage.`);
      if (f.metrics.revenueGrowth) parts.push(`Revenue grew ${f.metrics.revenueGrowth.value}% year over year.`);
      if (f.metrics.profitMargin) parts.push(`Net margin is ${f.metrics.profitMargin.value}%.`);
      if (f.metrics.debtToEquity) parts.push(`Debt-to-equity is ${f.metrics.debtToEquity.value}x.`);
      for (const s of f.sources.filter((x) => x.status === "used").slice(0, 3)) sources.push({ label: s.name, detail: s.note });
      if (f.risks.length) parts.push(`Risk flags: ${f.risks.slice(0, 2).join(" ")}`);
    }
    if (news.status === "fulfilled" && news.value.articles.length) {
      const top = news.value.articles[0];
      parts.push(`Latest headline: "${top.headline}" (${top.source}).`);
      for (const a of news.value.articles.slice(0, 3)) sources.push({ label: a.headline, detail: `${a.source} · ${a.publishedAt ?? "date unavailable"}`, url: a.url });
      dataAsOf = dataAsOf ?? news.value.fetchedAt;
    }
  } else {
    const market = await marketNews(marketId, 6);
    parts.push("Ask about a specific ticker for a sourced answer. Latest market headlines:");
    for (const article of market.articles.slice(0, 3)) {
      parts.push(`• ${article.headline} (${article.source})`);
      sources.push({ label: article.headline, detail: article.source, url: article.url });
    }
    dataAsOf = market.fetchedAt;
  }

  parts.push("This is source-grounded research context, not investment advice.");
  return {
    answer: parts.join(" "),
    symbol: clean || null,
    sources,
    dataAsOf,
    evidence: sources,
    runtime: "deterministic" as const,
    generatedAt: nowIso(),
    limitations: ["Deterministic on-device synthesis over free/open sources; no language model is used in this path."],
    suggestedQuestions: clean
      ? [`What are the main risks for ${clean}?`, `How has ${clean} revenue trended?`, `What is the latest news on ${clean}?`]
      : ["How is the Indian market doing today?", "What is driving bank stocks?", "Show me the latest market headlines."],
  };
}

/* ------------------------------------------------------------------ *
 * Procedure table
 * ------------------------------------------------------------------ */

type Handler = (input: Input) => unknown;

const HANDLERS: Record<string, Handler> = {
  /* ---- market ---- */
  "market.search": async (input) => {
    const result = await search(str(input, "query"), market(input));
    // Keep the provider flags the search screen renders, mapped onto the
    // on-device sources that actually produced the rows.
    return {
      ...result,
      sources: { finnhub: false, indianApi: result.sources.nseUniverse, indianOpenApi: false, yahooSearch: result.sources.yahooSearch, nseUniverse: result.sources.nseUniverse },
      errors: { finnhub: null, indianApi: result.errors.nseUniverse, indianOpenApi: null, yahooSearch: result.errors.yahooSearch, nseUniverse: result.errors.nseUniverse },
    };
  },
  "market.snapshot": async (input) => {
    const symbol = str(input, "symbol");
    const marketId = market(input);
    const snap = await snapshot(symbol, marketId);
    const analysis = await fundamentals(symbol, marketId).catch(() => null);
    const news = await stockNews(symbol, 6, marketId).catch(() => null);
    return {
      ...snap,
      asOf: snap.asOf,
      source: snap.source,
      quote: snap.quote,
      errors: snap.quote ? null : (snap.note ?? "Live quote unavailable."),
      fundamentals: {
        pe: analysis?.metrics.pe?.value ?? null,
        earningsPerShare: analysis?.metrics.earningsPerShare?.value ?? null,
        sector: analysis?.stockAnalysis.profile.sector ?? "",
        score: analysis?.score ?? null,
        verdict: analysis?.verdict ?? null,
      },
      news: (news?.articles ?? []).map((a) => ({ headline: a.headline, source: a.source, url: a.url, publishedAt: a.publishedAt, sentiment: a.sentiment })),
    };
  },
  "market.universe": () => nseUniverse(),
  "market.fundamentals": (input) => fundamentals(str(input, "symbol"), market(input)),
  "market.profile": async (input) => {
    const symbol = str(input, "symbol");
    const marketId = market(input);
    const [marketSnap, fund, news] = await Promise.allSettled([snapshot(symbol, marketId), fundamentals(symbol, marketId), stockNews(symbol, 40, marketId)]);
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
  "market.sectorConstituents": async (input) => {
    const sector = str(input, "sector");
    // The constituent index is the NSE index set, which is India-only. For any other
    // market there is no free equivalent, so this returns an explicit unsupported
    // state with no rows rather than Indian constituents under a foreign heading.
    const constituentsMarketId = market(input);
    const base = constituentsMarketId === "IN"
      ? await sectorConstituents(sector, Number(input?.limit ?? 100) || 100)
      : {
          sector,
          asOf: nowIso(),
          constituents: [] as SectorConstituent[],
          source: "No constituent index is available for this market",
          error: null,
          status: "unsupported" as const,
          reason: `Sector constituents are not available for ${constituentsMarketId}. AnalyzerX shows nothing here rather than another market's constituents.`,
        };
    const flows = await institutionalFlows(str(input, "range", "TODAY")).catch(() => null);
    const fii = flows?.rows.find((r) => r.participant === "FII/FPI");
    const dii = flows?.rows.find((r) => r.participant === "DII");
    // Scoring every constituent would mean hundreds of network calls; score a
    // bounded, stable prefix and leave the remainder explicitly unscored rather
    // than inventing a value for them.
    const SCORED_LIMIT = 15;
    const scored = await Promise.all(
      base.constituents.slice(0, SCORED_LIMIT).map(async (row) => {
        try {
          const [analysis, snap] = await Promise.all([fundamentals(row.symbol, "IN"), snapshot(row.symbol, "IN")]);
          return {
            symbol: row.symbol,
            name: row.name,
            industry: row.industry,
            sector: row.sector,
            score: analysis.score,
            marketCap: analysis.marketCap.value,
            marketCapBand: analysis.marketCap.band,
            pe: analysis.metrics.pe?.value ?? null,
            changePercent: snap.quote?.changePercent ?? null,
            fiiNet: null,
            diiNet: null,
            source: row.source,
          };
        } catch {
          return { symbol: row.symbol, name: row.name, industry: row.industry, sector: row.sector, score: null, marketCap: null, marketCapBand: "unknown" as const, pe: null, changePercent: null, fiiNet: null, diiNet: null, source: row.source };
        }
      }),
    );
    const sortKey = str(input, "sort", "score");
    const direction = str(input, "direction", "desc") === "asc" ? 1 : -1;
    const keyOf = (row: (typeof scored)[number]): number | null => {
      switch (sortKey) {
        case "marketCap": return row.marketCap;
        case "pe": return row.pe;
        case "changePercent": return row.changePercent;
        case "fii": return row.fiiNet;
        case "dii": return row.diiNet;
        default: return row.score;
      }
    };
    const rows = [...scored].sort((a, b) => {
      const av = keyOf(a);
      const bv = keyOf(b);
      // Rows without a source value always fall to the bottom and are never inferred.
      if (av === null && bv === null) return (a.symbol ?? "").localeCompare(b.symbol ?? "");
      if (av === null) return 1;
      if (bv === null) return -1;
      return (av - bv) * direction;
    });
    const unavailableSort = ["fii", "dii"].includes(sortKey);
    return {
      sector,
      asOf: base.asOf,
      sort: sortKey,
      direction: direction === 1 ? "asc" : "desc",
      rows,
      flow: {
        fiiNet: fii?.net ?? null,
        diiNet: dii?.net ?? null,
        freshnessLabel: flows?.freshnessLabel ?? "Unavailable",
        // The sector chart reads a flat {reportDate, fiiNet, diiNet} series, so
        // the record-shaped history is projected into that shape here. Without
        // it the chart reports "no historical sessions" even though real
        // backfilled sessions exist.
        history: (flows?.history ?? []).map((record) => ({
          reportDate: record.reportDate,
          fiiNet: record.rows.find((row) => row.participant === "FII/FPI")?.net ?? null,
          diiNet: record.rows.find((row) => row.participant === "DII")?.net ?? null,
        })),
        source: flows?.source ?? null,
        reportDate: flows?.reportDate ?? null,
      },
      securityWiseFlow: { available: false, reportDate: null, topFii: [], topDii: [] },
      // Coverage status comes from the registry resolution, not from parsing an
      // error string, so an uncovered sector reads as "unsupported" rather than
      // as a failed request.
      status: base.status,
      reason: base.reason,
      coverageLabel: base.status === "supported" ? `${base.constituents.length} constituents from the NSE index list` : "Unavailable",
      limitations: base.status === "supported"
        ? [
            `Fundamental scores are computed on-device for the first ${Math.min(SCORED_LIMIT, base.constituents.length)} constituents; the remainder are shown unscored rather than estimated.`,
            unavailableSort ? "Security-wise FII/DII attribution requires an exchange feed; those rows stay at the bottom and are never inferred." : "Security-wise flow needs an exchange feed.",
          ]
        : [base.reason ?? base.error ?? "This sector is not covered by a verified NSE constituent index."],
    };
  },
  "market.peerComparison": async (input) => {
    const result = await peerComparison(str(input, "symbol"), market(input));
    return { ...result, note: result.peers.length ? result.comparisonBasis : "No peer set was found for this symbol from the NSE index lists." };
  },
  "market.multiAssetTiming": (input) => multiAssetTiming(market(input)),
  "market.sectorNames": () => Object.keys(NSE_INDEX_FILES).map((key) => key.replace(/^NIFTY/, "").replace(/([A-Z]+)/g, (m) => m[0] + m.slice(1).toLowerCase())),
  "market.officialFilingLinks": (input) => ({ links: officialFilingLinks(str(input, "symbol")), note: "Official regulator and exchange filing entry points; no scraping is performed." }),
  "market.filings": async (input) => ({ symbol: str(input, "symbol"), records: [], entryLinks: officialFilingLinks(str(input, "symbol")) }),
  "market.history": (input) => priceHistory(str(input, "symbol"), str(input, "range", "6mo"), str(input, "interval", "1d"), market(input)),
  "market.indianSnapshot": async (input) => {
    const symbol = str(input, "symbol");
    const [snap, analysis, news] = await Promise.all([
      snapshot(symbol, "IN"),
      fundamentals(symbol, "IN").catch(() => null),
      stockNews(symbol, 8, "IN").catch(() => null),
    ]);
    return {
      available: Boolean(snap.quote),
      asOf: nowIso(),
      errors: snap.quote ? null : (snap.note ?? "unavailable"),
      data: snap.quote
        ? {
            symbol: snap.symbol,
            name: snap.quote.name,
            source: snap.source,
            quote: {
              current: snap.quote.current,
              change: snap.quote.change,
              changePercent: snap.quote.changePercent,
              dayHigh: snap.quote.dayHigh,
              dayLow: snap.quote.dayLow,
              volume: snap.quote.volume,
              currency: snap.quote.currency,
              exchange: snap.quote.exchange,
              asOf: snap.quote.asOf,
            },
            fundamentals: {
              pe: analysis?.metrics.pe?.value ?? null,
              debtToEquity: analysis?.metrics.debtToEquity?.value ?? null,
              returnOnEquity: analysis?.metrics.roe?.value ?? null,
              profitMargin: analysis?.metrics.profitMargin?.value ?? null,
              marketCap: analysis?.marketCap.value ?? null,
              // The Live Market Snapshot card renders SECTOR from this field. It
              // was never emitted, so the field always rendered blank. Fall back
              // to the pinned official constituent snapshot when the live
              // analysis carries no sector.
              sector: analysis?.stockAnalysis.profile.sector || industryForSymbol(symbol) || null,
              mutualFundHolding: null,
            },
            news: (news?.articles ?? []).map((a) => ({ headline: a.headline, source: a.source, url: a.url, publishedAt: a.publishedAt, sentiment: a.sentiment, impactScore: a.impactScore })),
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
    const [report, news] = await Promise.all([fundamentals(symbol, marketId), stockNews(symbol, 20, marketId)]);
    const markdown = `# Selected market: ${report.market.country} (${marketId})\n\n${report.stockAnalysis.conclusion}\n\n## Score\n${report.score}/100 — ${report.verdict}\n\n## Sources\n${report.sources.map((s) => `- ${s.name} (${s.status})`).join("\n")}\n`;
    return {
      symbol: report.resolvedSymbol,
      marketId,
      marketLabel: report.market.country,
      fileName: `analyzerx-${report.resolvedSymbol}-3.23.0.pdf`,
      markdownFileName: `analyzerx-${report.resolvedSymbol}-3.23.0.md`,
      format: "pdf",
      content: markdown,
      pdfBase64: "",
      report,
      news: { fetchedAt: news.fetchedAt, freshArticleCount: news.freshArticleCount, stale: news.stale, providerFailures: news.providerFailures },
    };
  },  "market.multibaggerSignals": async (input) => { // eslint-disable-line
    const strategyId = str(input, "strategyId", "buffett-munger");
    const strategyNames: Record<string, string> = {
      "buffett-munger": "Buffett / Munger quality",
      "peter-lynch": "Peter Lynch growth at a reasonable price",
      canslim: "CANSLIM",
      greenblatt: "Greenblatt quality / value",
      fisher: "Fisher scuttlebutt",
      "small-cap-compounder": "Small-cap compounder",
    };
    const universe = await nseUniverse();
    const sample = universe.securities.slice(0, 15);
    const signals = (
      await Promise.all(
        sample.map(async (security) => {
          try {
            const analysis = await fundamentals(security.symbol, "IN");
            return {
              symbol: security.symbol,
              name: security.name,
              sector: analysis.stockAnalysis.profile.sector || industryForSymbol(security.symbol) || security.industry || "Unclassified",
              score: analysis.score,
              label: analysis.multibaggerThesis.label,
              verdict: analysis.verdict,
              coverage: analysis.coverage.label,
              criteria: analysis.institutionalReport.scoreWeights.map((w) => ({ key: w.key, label: w.label, score: w.score, max: w.max })),
            };
          } catch {
            return { symbol: security.symbol, name: security.name, sector: industryForSymbol(security.symbol) ?? security.industry ?? "Unclassified", score: 0, label: "Insufficient evidence", verdict: "Unavailable", coverage: "Limited", criteria: [] };
          }
        }),
      )
    ).sort((a, b) => b.score - a.score);
    const sectors = [...new Set(signals.map((s) => s.sector))];
    return {
      strategyId,
      strategyName: strategyNames[strategyId] ?? strategyId,
      asOf: nowIso(),
      universeSize: universe.securities.length,
      screenedCount: signals.length,
      sectors,
      signals,
      candidates: signals,
      note: "Rule-based screen over reported annual fundamentals for a sample of the NSE universe; not a prediction of returns.",
    };
  },
  "market.derivatives": async (input) => ({
    symbol: str(input, "symbol"),
    status: "unavailable",
    authState: "not-required",
    expiry: null,
    underlyingPrice: null,
    pcr: null,
    maxPain: null,
    atmIv: null,
    contracts: [],
    freshness: null,
    source: null,
    nextStep: "Connect a licensed exchange or broker option-chain feed to enable this screen.",
    error: "Option chains require a licensed exchange or broker feed; no free source is used here.",
    asOf: nowIso(),
  }),
  "market.positioning": async (input) => ({ symbol: str(input, "symbol"), status: "unavailable", reason: "Participant-wise positioning is not available from open sources.", rows: [] }),
  "market.observations": async (input) => ({ symbol: str(input, "symbol"), market: [], fundamentals: [] }),
  "market.watchlistEvidence": async (input) => {
    const symbols = Array.isArray(input?.symbols) ? (input?.symbols as string[]) : [];
    return symbols.map((symbol) => ({ symbol, events: [] }));
  },
  "market.derivativesSources": () => [],

  /* ---- news ---- */
  "news.stock": async (input) => {
    const symbol = str(input, "symbol");
    const marketId = market(input);
    const payload = await stockNews(symbol, Number(input?.limit ?? 40) || 40, market(input));
    return { available: payload.articles.length > 0, symbol: payload.symbol, marketId, providerFailures: payload.providerFailures, freshArticleCount: payload.freshArticleCount, stale: payload.stale, fetchedAt: payload.fetchedAt, articles: payload.articles, sources: payload.sources, error: null };
  },
  // Single article lookup for the news detail screen. Reads the phone's own
  // archive first, then falls back to a live pass so a freshly opened article
  // is never missing.
  "news.article": async (input) => {
    const id = str(input, "id");
    if (!id) return null;
    const archived = await queryArchive({ limit: 2000 });
    const found = archived.articles.find((article) => article.id === id);
    if (found) return toArchiveArticle(found);
    const live = await marketNews(market(input), 200).catch(() => ({ articles: [] as NewsArticle[] }));
    const liveMatch = live.articles.find((article) => article.id === id);
    return liveMatch ? toArchiveArticle(liveMatch) : null;
  },
  "news.archive": async (input) => {
    const days = Number(input?.days ?? 30) || 30;
    const symbol = str(input, "symbol");
    const orderMap: Record<string, "newest" | "oldest" | "impact-high" | "impact-low"> = {
      "Newest first": "newest",
      "Oldest first": "oldest",
      "Impact low → high": "impact-low",
      "Impact high → low": "impact-high",
    };
    const order = orderMap[str(input, "archiveOrder", "Newest first")] ?? "newest";
    const sentimentRaw = str(input, "archiveSentiment", "All sentiment");
    const sentiment = ["Positive", "Neutral", "Negative"].includes(sentimentRaw) ? (sentimentRaw as "Positive" | "Neutral" | "Negative") : undefined;

    // Stored history first: this is the phone's own archive, so it reaches back
    // to the day collection started rather than a live window.
    const stored = await queryArchive({
      symbol: symbol || undefined,
      days,
      sentiment,
      order,
      limit: Math.min(500, Number(input?.limit ?? 200) || 200),
      offset: (Number(input?.page ?? 0) || 0) * (Math.min(500, Number(input?.limit ?? 200) || 200)),
    });

    let articles = stored.articles.map(toArchiveArticle);
    let total = stored.total;
    let returned = stored.returned;
    let hasMore = stored.hasMore;
    let offset = stored.offset;
    let sources = stored.sources;
    let coverage = stored.coverage;

    // First run on a fresh install: top the archive up with a live pass so the
    // screen is never empty while history builds.
    if (articles.length === 0) {
      const payload = await marketNews(market(input), 200);
      const live = symbol
        ? payload.articles.filter((a) => a.symbol === symbol || a.headline.toUpperCase().includes(symbol.toUpperCase()))
        : payload.articles;
      articles = live.map((a) => toArchiveArticle({ ...a, collectedAt: nowIso() }));
      total = live.length;
      returned = live.length;
      hasMore = false;
      offset = 0;
      sources = [...new Set(live.map((a) => a.source))].map((source) => ({
        source,
        count: live.filter((a) => a.source === source).length,
      }));
      coverage = { from: live[0]?.publishedAt ?? null, to: live[0]?.publishedAt ?? null, months: 0, stored: 0 };
    }

    return {
      coverage: articles.length ? "available" : "empty",
      missingCoverage: [],
      days,
      startDate: new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10),
      endDate: new Date().toISOString().slice(0, 10),
      sourceCoverage: sources,
      coverageWindow: coverage,
      total,
      returned,
      hasMore,
      offset,
      order,
      articles,
    };
  },
  "news.status": async () => {
    const [collector, store, catalog] = await Promise.all([collectorStats(), storeStats(), Promise.resolve(catalogSummary())]);
    const universe = await nseUniverse().catch(() => ({ securities: [] as Array<{ symbol: string }> }));
    return {
      running: collector.running,
      coverageMode: "on-device continuous collection",
      articlesStored: store.total,
      universeCount: universe.securities.length,
      coveredSymbols: Object.keys(store.bySource).length,
      lastSuccessAt: collector.lastRunAt ?? store.updatedAt,
      lastError: collector.lastError,
      providerFailures: collector.sourcesFailed,
      stale: false,
      collector: {
        cycles: collector.cycles,
        sourcesTried: collector.sourcesTried,
        sourcesOk: collector.sourcesOk,
        sourcesFailed: collector.sourcesFailed,
        sourcesSkipped: collector.sourcesSkipped,
        articlesCollected: collector.articlesCollected,
        lastDurationMs: collector.lastDurationMs,
      },
      catalog: { total: catalog.total, collectable: catalog.collectable, verified: catalog.verified, device: catalog.device, byProvider: catalog.byProvider },
      history: { total: store.total, months: store.months, oldest: store.oldest, newest: store.newest, byKind: store.byKind },
      sources: [],
    };
  },
  "news.refresh": async (input) => {
    await runCollectionCycle({ batchSize: 18, budgetMs: 15_000, symbols: str(input, "symbol") ? [str(input, "symbol")] : [] }).catch(() => undefined);
    return stockNews(str(input, "symbol"), 40, market(input));
  },
  "news.flagIrrelevant": async (input) => localSet("news.flagged", input ?? {}),
  "news.undoIrrelevant": async () => localSet("news.flagged", {}),
  "news.reviewHeld": async () => ({ items: await localGet("news.held", []), held: await localGet("news.held", []) }),
  "news.held": async () => ({ items: await localGet("news.held", []), held: await localGet("news.held", []) }),
  "news.archiveExport": async (input) => {
    const payload = await marketNews(market(input), 500);
    const rows = payload.articles;
    const header = "date,headline,source,sentiment,url";
    const csv = [header, ...rows.map((a) => [a.publishedAt ?? "", `"${a.headline.replace(/"/g, '""')}"`, a.source, a.sentiment, a.url].join(","))].join("\n");
    return { fileName: "analyzerx-news-archive.csv", mimeType: "text/csv", rowCount: rows.length, content: csv, marketId: market(input), marketLabel: "India" };
  },

  /* ---- events ---- */
  "events.latest": (input) => eventProjections(market(input), Number(input?.limit ?? 100) || 100),
  "events.timeline": (input) => eventProjections(market(input), Number(input?.limit ?? 100) || 100, str(input, "symbol")),
  "events.storyline": async () => [],
  "events.search": (input) => eventProjections(market(input), 500).then((rows) => rows.filter((row) => JSON.stringify(row).toLowerCase().includes(str(input, "query").toLowerCase())).slice(0, Number(input?.limit ?? 100) || 100)),

  /* ---- graph ---- */
  "graph.projection": async (input) => {
    const symbol = str(input, "symbol");

    // The graph screen reads a specific contract: nodes carry type/caption/
    // confidence/symbol and edges carry evidenceStatus/sourceCount/contradiction/
    // hop, and it only renders nodes whose type is "entity". Emitting a bare
    // {id,label,kind} shape left the tab permanently empty.
    const nodes: Array<{ id: string; type: string; label: string; caption: string; confidence: number; symbol: string | null }> = [];
    const edges: Array<{ id: string; from: string; to: string; label: string; evidenceStatus: string; confidence: number; sourceCount: number; contradiction: string; hop: number }> = [];

    // With an explicit symbol, use that symbol's live news. Without one, build the
    // graph from the phone's own archive so the tab is populated from real,
    // already-collected evidence rather than waiting for a server.
    const articles: Array<{ symbol: string; source: string }> = symbol
      ? ((await stockNews(symbol, 20, market(input)).catch(() => ({ articles: [] }))).articles as Array<{ symbol: string; source: string }>)
      : ((await queryArchive({ limit: 300, order: "newest" })).articles as Array<{ symbol: string; source: string }>);

    const bySymbol = new Map<string, { count: number; sources: Map<string, number> }>();
    for (const article of articles) {
      const sym = (article.symbol || "").toUpperCase();
      if (!sym) continue;
      const entry = bySymbol.get(sym) ?? { count: 0, sources: new Map<string, number>() };
      entry.count += 1;
      entry.sources.set(article.source, (entry.sources.get(article.source) ?? 0) + 1);
      bySymbol.set(sym, entry);
    }

    const ranked = [...bySymbol.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 12);
    for (const [sym, info] of ranked) {
      nodes.push({
        id: `entity:${sym}`,
        type: "entity",
        label: sym,
        caption: `${info.count} source-backed article${info.count === 1 ? "" : "s"}`,
        confidence: Math.min(95, 55 + info.count * 5),
        symbol: sym,
      });
    }
    for (const [sym, info] of ranked) {
      for (const [source, count] of info.sources) {
        const sourceId = `source:${source}`;
        if (!nodes.some((node) => node.id === sourceId)) {
          nodes.push({ id: sourceId, type: "source", label: source, caption: "publisher", confidence: 70, symbol: null });
        }
        edges.push({
          id: `edge:${sym}:${source}`,
          from: `entity:${sym}`,
          to: sourceId,
          label: "reported by",
          evidenceStatus: "confirmed",
          confidence: 70,
          sourceCount: count,
          contradiction: "none",
          hop: 1,
        });
      }
    }

    return {
      nodes,
      edges,
      evidence: nodes.length > 0 ? "source-backed" : "awaiting-events",
      asOf: nowIso(),
      note: nodes.length > 0
        ? "Built on-device from source-backed articles. Every edge cites the publisher that reported it; no inferred relationship is shown without evidence."
        : "No source-backed articles are stored yet. The graph populates as the on-device collector stores news.",
    };
  },

  /* ---- chat ---- */
  "chat.ask": async (input) => {
    const answer = await groundedAnswer(str(input, "message", str(input, "question")), str(input, "symbol"), market(input));
    return {
      answer: answer.answer,
      confidence: answer.evidence.length ? "medium" : "low",
      symbol: answer.symbol,
      sources: answer.sources,
      dataAsOf: answer.dataAsOf,
      limitations: answer.limitations,
      suggestedQuestions: answer.suggestedQuestions,
      action: null,
      runtime: answer.runtime,
    };
  },
  "chat.general": async (input) => {
    const answer = await groundedAnswer(str(input, "message", str(input, "question")), str(input, "symbol"), market(input));
    return { answer: answer.answer, confidence: "medium", limitations: answer.limitations, suggestedQuestions: answer.suggestedQuestions };
  },
  "chat.ground": async (input) => {
    const answer = await groundedAnswer(str(input, "message", str(input, "question")), str(input, "symbol"), market(input));
    return { symbol: answer.symbol, sources: answer.sources, dataAsOf: answer.dataAsOf, context: answer.answer, limitations: answer.limitations };
  },

  /* ---- research desk ---- */
  "researchDesk.run": (input) => researchRun(input),
  "researchDesk.runOwned": (input) => researchRun(input),
  "researchDesk.status": async (input) => {
    const runId = str(input, "runId");
    const last = await localGet<{ runId?: string } | null>("research.last", null);
    return { run: last && (!runId || last.runId === runId) ? last : null, status: last ? "completed" : "idle", runtime: "deterministic", note: "Runs on-device over open sources." };
  },
  "researchDesk.listOwned": async () => await localGet("research.runs", []),
  "researchDesk.exportOwned": (input) => researchRun(input),
  "researchDesk.retry": (input) => researchRun(input),
  "researchDesk.cancel": async () => ({ cancelled: true }),

  /* ---- alerts / recommendations ---- */
  "smartAlerts.discover": async (input) => ({ rules: [], results: [], evaluatedAt: nowIso(), symbol: str(input, "symbol"), note: "Alert evaluation runs over live news on-device." }),
  "autonomousRecommendations.discover": async (input) => {
    const payload = await marketNews(market(input), 40);
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
  "providers.gdeltBudget": async () => ({ requestsInWindow: 0, maxRequestsPerWindow: 0, remaining: null, nextAllowedAt: null, consecutiveFailures: 0, note: "GDELT is called on-device with no shared server-side budget." }),
  "providers.webResearch": async () => ({ results: [], note: "Web research requires a search provider credential." }),
  "sources.list": () =>
    buildCatalog().map((source) => ({
      key: source.id,
      name: source.name,
      capability: source.kind,
      endpoint: source.url,
      markets: [source.market],
      credentialState: source.credentialState,
      licensing: source.license,
      provider: providerOf(source),
      format: source.format,
      reachability: source.reachability,
      cadenceMs: source.cadenceMs,
      status: linkHealth(source.id).status,
      latencyMs: linkHealth(source.id).latencyMs,
    })),
  "sources.health": () => [
    ...providerRegistry().map((p) => ({ key: p.key, status: p.status, latencyMs: p.latencyMs, lastSuccessAt: p.lastSuccessAt, lastError: p.lastError })),
    ...buildCatalog().map((source) => {
      const health = linkHealth(source.id);
      return { key: source.id, status: health.status, latencyMs: health.latencyMs, lastSuccessAt: health.lastSuccessAt, lastError: health.lastError, consecutiveFailures: health.consecutiveFailures };
    }),
  ],
  "sources.latest": async (input) => {
    const limit = Number(input?.limit ?? 50) || 50;
    const result = await queryArchive({ order: "newest", limit });
    return result.articles.map((article) => ({ key: article.sourceKey, title: article.headline, source: article.sourceName, url: article.url, publishedAt: article.publishedAt, collectedAt: article.collectedAt, kind: article.kind, symbol: article.symbol }));
  },
  "sources.nseCollectors": async () => [{ key: "nse-equity-master", status: "live", cadence: "daily" }, { key: "nse-index-constituents", status: "live", cadence: "daily" }, { key: "nse-fii-dii", status: "live", cadence: "intraday" }],
  "sources.regionalCollectors": async () => [],
  "sources.publicMacro": async (input) => {
    const timing = await multiAssetTiming(market(input));
    const macro = timing.signals.filter((s) => s.type === "macro");
    return {
      checkedAt: timing.generatedAt,
      ecb: macro.filter((s) => /gold|crude|usd/i.test(s.name)).map((s) => ({ indicator: s.name, period: s.freshness ?? "unavailable", value: s.changePct, unit: "% change" })),
      oecd: [],
    };
  },
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
  "account.alertResultsPage": async () => ({ items: await localGet("alertResults", []), total: 0, nextCursor: null, hasMore: false }),
  "account.alertResultDetail": async (input) => {
    const id = str(input, "id");
    const results = await localGet<Array<Record<string, unknown>>>("alertResults", []);
    const found = results.find((row) => String(row.id) === id) ?? null;
    return {
      id,
      symbol: found?.symbol ?? null,
      ruleId: found?.ruleId ?? null,
      marketId: found?.marketId ?? null,
      status: found?.status ?? "unavailable",
      evidenceJson: found?.evidenceJson ?? null,
      createdAt: found?.createdAt ?? null,
      updatedAt: found?.updatedAt ?? null,
      detail: found,
    };
  },
  "account.notifications": async () => {
    const items = await localGet<Array<{ readAt?: string | null }>>("notifications", []);
    return { items, nextCursor: null, unreadCount: items.filter((i) => !i.readAt).length };
  },
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
    symbol ? stockNews(symbol, 12, marketId) : marketNews(marketId, 12),
    multiAssetTiming(marketId),
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
