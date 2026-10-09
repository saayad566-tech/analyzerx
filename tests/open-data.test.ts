import { describe, expect, it, vi } from "vitest";
import { ProxyAgent, setGlobalDispatcher } from "undici";

// This sandbox reaches the public internet through an egress proxy; a device
// does not. Route Node's fetch through the proxy when one is configured so the
// live source tests exercise the same code paths the app uses.
const egressProxy =
  process.env.https_proxy ?? process.env.HTTPS_PROXY ?? process.env.http_proxy ?? process.env.HTTP_PROXY;
if (egressProxy) setGlobalDispatcher(new ProxyAgent(egressProxy));

// The open-data layer caches through AsyncStorage; in Node we stub it so the
// same code paths run without a device.
vi.mock("@react-native-async-storage/async-storage", () => {
  const store = new Map<string, string>();
  return {
    default: {
      getItem: async (key: string) => store.get(key) ?? null,
      setItem: async (key: string, value: string) => void store.set(key, value),
      removeItem: async (key: string) => void store.delete(key),
      getAllKeys: async () => [...store.keys()],
      multiRemove: async (keys: string[]) => keys.forEach((key) => store.delete(key)),
    },
  };
});

import {
  clamp,
  parseCsv,
  parseRss,
  stripHtml,
  toDisplaySymbol,
  toYahooSymbol,
  csvToObjects,
} from "../lib/open-data/core";
import { classifySentiment } from "../lib/open-data/sources";
import {
  capabilityMatrix,
  fundamentals,
  institutionalFlows,
  marketNews,
  multiAssetTiming,
  nseUniverse,
  priceHistory,
  providerRegistry,
  search,
  sectorConstituents,
  snapshot,
  stockNews,
} from "../lib/open-data/engine";
import { resolveLocal } from "../lib/open-data/link";

const NETWORK_TIMEOUT = 60_000;

describe("open-data parsers (deterministic)", () => {
  it("parses CSV with quoted fields and embedded commas", () => {
    const rows = parseCsv('a,b\n"x,1",2\n"he said ""hi""",4');
    expect(rows[1]).toEqual(["x,1", "2"]);
    expect(rows[2]).toEqual(['he said "hi"', "4"]);
  });

  it("maps CSV rows to objects using the header", () => {
    const objects = csvToObjects("SYMBOL,NAME OF COMPANY\nRELIANCE,Reliance Industries Ltd.");
    expect(objects[0]["SYMBOL"]).toBe("RELIANCE");
    expect(objects[0]["NAME OF COMPANY"]).toBe("Reliance Industries Ltd.");
  });

  it("parses RSS items and strips HTML", () => {
    const xml = `<rss><channel><item><title><![CDATA[Reliance &amp; Co rises]]></title><link>https://e.com/1</link><description><![CDATA[<b>Big</b> move]]></description><pubDate>Tue, 07 Oct 2026 10:00:00 GMT</pubDate><source>ET</source></item></channel></rss>`;
    const items = parseRss(xml);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Reliance & Co rises");
    expect(items[0].link).toBe("https://e.com/1");
    expect(items[0].description).toBe("Big move");
    expect(items[0].source).toBe("ET");
  });

  it("classifies sentiment deterministically", () => {
    expect(classifySentiment("Company wins large order, shares surge").sentiment).toBe("Positive");
    expect(classifySentiment("Shares plunge after fraud probe").sentiment).toBe("Negative");
    expect(classifySentiment("Company reports quarterly results").sentiment).toBe("Neutral");
  });

  it("maps symbols to Yahoo tickers per market", () => {
    expect(toYahooSymbol("reliance", "IN")).toBe("RELIANCE.NS");
    expect(toYahooSymbol("AAPL", "US")).toBe("AAPL");
    expect(toYahooSymbol("VOD", "GB")).toBe("VOD.L");
    expect(toYahooSymbol("^NSEI", "IN")).toBe("^NSEI");
    expect(toDisplaySymbol("RELIANCE.NS")).toBe("RELIANCE");
  });

  it("clamps scores into range", () => {
    expect(clamp(120)).toBe(100);
    expect(clamp(-5)).toBe(0);
  });

  it("strips tags and decodes entities", () => {
    expect(stripHtml("<p>Hello&nbsp;<b>world</b></p>")).toBe("Hello world");
  });
});

describe("open-data live sources (contract + availability)", () => {
  it("returns a well-formed quote snapshot", async () => {
    const result = await snapshot("RELIANCE", "IN");
    expect(result).toHaveProperty("symbol");
    expect(result).toHaveProperty("provenance");
    expect(result.provenance).toHaveProperty("retrievedAt");
    if (result.quote) {
      expect(typeof result.quote.current === "number" || result.quote.current === null).toBe(true);
      expect(result.status === "live" || result.status === "delayed").toBe(true);
    }
  }, NETWORK_TIMEOUT);

  it("returns a well-formed search payload", async () => {
    const result = await search("reliance", "IN");
    expect(Array.isArray(result.results)).toBe(true);
    expect(result.marketLabel).toBe("India");
    for (const row of result.results) expect(row).toHaveProperty("symbol");
  }, NETWORK_TIMEOUT);

  it("loads the NSE equity master universe", async () => {
    const universe = await nseUniverse();
    expect(Array.isArray(universe.securities)).toBe(true);
    expect(universe).toHaveProperty("checksum");
    if (universe.securities.length) {
      expect(universe.securities[0]).toHaveProperty("symbol");
      expect(universe.securities[0].market).toBe("IN");
    }
  }, NETWORK_TIMEOUT);

  it("returns well-formed institutional flows", async () => {
    const flows = await institutionalFlows("TODAY");
    expect(Array.isArray(flows.rows)).toBe(true);
    expect(flows).toHaveProperty("status");
    expect(flows).toHaveProperty("rangeLabel");
  }, NETWORK_TIMEOUT);

  it("returns well-formed news", async () => {
    const news = await stockNews("RELIANCE", 10);
    expect(Array.isArray(news.articles)).toBe(true);
    expect(news).toHaveProperty("freshArticleCount");
    for (const article of news.articles.slice(0, 3)) {
      expect(article).toHaveProperty("headline");
      expect(article).toHaveProperty("url");
      expect(["Positive", "Neutral", "Negative"]).toContain(article.sentiment);
    }
  }, NETWORK_TIMEOUT);

  it("returns a well-formed fundamentals analysis with real reported metrics", async () => {
    const analysis = await fundamentals("RELIANCE", "IN");
    expect(analysis.score).toBeGreaterThanOrEqual(0);
    expect(analysis.score).toBeLessThanOrEqual(100);
    expect(analysis.institutionalReport.scoreWeights).toHaveLength(4);
    expect(Array.isArray(analysis.coverage.sections)).toBe(true);
    expect(analysis.market.currency).toBe("INR");
    expect(analysis).toHaveProperty("stockAnalysis");
    if (analysis.metrics.earningsPerShare) expect(analysis.metrics.earningsPerShare.basis).toBe("reported");
    expect(analysis.marketCap).toBeDefined();
    expect(analysis.institutionalReport.scenarios.length).toBe(3);
    expect(analysis.stockAnalysis.technical).toBeDefined();
    expect(analysis.multibaggerThesis.scoreBreakdown.length).toBeGreaterThan(0);
  }, NETWORK_TIMEOUT);

  it("returns sector constituents and multi-asset signals", async () => {
    const [sector, timing, history] = await Promise.all([
      sectorConstituents("NIFTYBANK", 50),
      multiAssetTiming(),
      priceHistory("RELIANCE", "1mo", "1d", "IN").catch(() => ({ points: [] as Array<{ t: string; c: number | null }> })),
    ]);
    expect(Array.isArray(sector.constituents)).toBe(true);
    expect(Array.isArray(timing.signals)).toBe(true);
    expect(Array.isArray(history.points)).toBe(true);
  }, NETWORK_TIMEOUT);

  it("reports provider registry and capability matrix", async () => {
    const providers = providerRegistry();
    expect(providers.length).toBeGreaterThan(5);
    for (const provider of providers) {
      expect(provider).toHaveProperty("credentialState");
      expect(provider).toHaveProperty("licensing");
      expect(["none-required", "auth_required"]).toContain(provider.credentialState);
    }
    const matrix = capabilityMatrix();
    expect(matrix.length).toBe(providers.length);
  });

  it("proves at least one free source is reachable from this environment", async () => {
    const results = await Promise.all([
      snapshot("RELIANCE", "IN").then((r) => Boolean(r.quote)).catch(() => false),
      marketNews(5).then((r) => r.articles.length > 0).catch(() => false),
      nseUniverse().then((r) => r.securities.length > 0).catch(() => false),
      institutionalFlows("TODAY").then((r) => r.rows.length > 0).catch(() => false),
    ]);
    expect(results.some(Boolean)).toBe(true);
  }, NETWORK_TIMEOUT);
});

describe("local tRPC link resolves every screen path without a server", () => {
  const cases: Array<[string, unknown]> = [
    ["market.search", { query: "infosys", marketId: "IN" }],
    ["market.snapshot", { symbol: "RELIANCE" }],
    ["market.universe", undefined],
    ["market.institutionalFlows", { range: "TODAY" }],
    ["news.stock", { symbol: "RELIANCE" }],
    ["news.archive", undefined],
    ["events.latest", { limit: 5 }],
    ["capabilities.matrix", undefined],
    ["providers.list", undefined],
    ["sources.list", undefined],
    ["account.watchlistUpsert", { symbol: "TCS" }],
    ["account.watchlist", undefined],
    ["researchDesk.status", undefined],
    ["graph.projection", undefined],
    ["runtime.health", undefined],
    ["does.not.exist", undefined],
  ];

  it.each(cases)("resolves %s", async (path, input) => {
    const result = await resolveLocal(path, input);
    expect(result).toBeDefined();
  }, NETWORK_TIMEOUT);

  it("never throws for an unknown procedure", async () => {
    const result = await resolveLocal("does.not.exist", undefined);
    expect(result).toBeDefined();
  });

  it("resolves the fundamentals procedure with a scored, sourced analysis", async () => {
    const result = (await resolveLocal("market.fundamentals", { symbol: "RELIANCE" })) as { score: number; sources: unknown[] };
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.sources)).toBe(true);
  }, NETWORK_TIMEOUT);

  it("resolves sector constituents and multi-asset timing", async () => {
    const [sector, timing] = await Promise.all([
      resolveLocal("market.sectorConstituents", { sector: "NIFTYBANK" }) as Promise<{ rows: unknown[]; flow: unknown; coverageLabel: string }>,
      resolveLocal("market.multiAssetTiming", undefined) as Promise<{ signals: unknown[] }>,
    ]);
    expect(Array.isArray(sector.rows)).toBe(true);
    expect(sector.flow).toBeDefined();
    expect(typeof sector.coverageLabel).toBe("string");
    expect(Array.isArray(timing.signals)).toBe(true);
  }, NETWORK_TIMEOUT);

  it("watchlist round-trips through device-local storage", async () => {
    await resolveLocal("account.watchlistUpsert", { symbol: "INFY" });
    const list = (await resolveLocal("account.watchlist", undefined)) as Array<{ symbol: string }>;
    expect(Array.isArray(list)).toBe(true);
    expect(list.some((row) => row.symbol === "INFY")).toBe(true);
  });

  it("returns a grounded chat answer with evidence", async () => {
    const answer = (await resolveLocal("chat.ask", { message: "Reliance", symbol: "RELIANCE" })) as {
      answer: string;
      evidence: unknown[];
      runtime: string;
    };
    expect(typeof answer.answer).toBe("string");
    expect(answer.answer.length).toBeGreaterThan(20);
    expect(answer.runtime).toBe("deterministic");
  }, NETWORK_TIMEOUT);

  it("chat.ask matches the screen contract", async () => {
    const r = (await resolveLocal("chat.ask", { message: "What is happening with Reliance?", symbol: "RELIANCE", marketId: "IN" })) as Record<string, unknown>;
    expect(typeof r.answer).toBe("string");
    expect(["high", "medium", "low"]).toContain(r.confidence);
    expect(Array.isArray(r.sources)).toBe(true);
    expect(Array.isArray(r.limitations)).toBe(true);
    expect(Array.isArray(r.suggestedQuestions)).toBe(true);
    expect(r).toHaveProperty("dataAsOf");
    for (const s of r.sources as Array<Record<string, unknown>>) {
      expect(typeof s.label).toBe("string");
      expect(typeof s.detail).toBe("string");
    }
  }, NETWORK_TIMEOUT);

  it("chat.ground matches the screen contract", async () => {
    const r = (await resolveLocal("chat.ground", { message: "Reliance", symbol: "RELIANCE" })) as Record<string, unknown>;
    expect(Array.isArray(r.sources)).toBe(true);
    expect(r).toHaveProperty("dataAsOf");
    expect(typeof r.context).toBe("string");
  }, NETWORK_TIMEOUT);

  it("chat.general returns a non-empty answer", async () => {
    const r = (await resolveLocal("chat.general", { message: "How is the market today?" })) as { answer: string };
    expect(typeof r.answer).toBe("string");
    expect(r.answer.length).toBeGreaterThan(10);
  }, NETWORK_TIMEOUT);

  it("sector constituents honour sort and direction", async () => {
    const desc = (await resolveLocal("market.sectorConstituents", { sector: "NIFTYBANK", sort: "score", direction: "desc" })) as { rows: Array<{ score: number | null }>; sort: string; direction: string };
    expect(desc.sort).toBe("score");
    expect(desc.direction).toBe("desc");
    const scores = desc.rows.map((r) => r.score).filter((s): s is number => typeof s === "number");
    for (let i = 1; i < scores.length; i += 1) expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i]);

    const asc = (await resolveLocal("market.sectorConstituents", { sector: "NIFTYBANK", sort: "score", direction: "asc" })) as { rows: Array<{ score: number | null }> };
    const ascScores = asc.rows.map((r) => r.score).filter((s): s is number => typeof s === "number");
    for (let i = 1; i < ascScores.length; i += 1) expect(ascScores[i - 1]).toBeLessThanOrEqual(ascScores[i]);
  }, NETWORK_TIMEOUT);

  it("exposes security-wise flow state so the sector screen never infers it", async () => {
    const r = (await resolveLocal("market.sectorConstituents", { sector: "NIFTY50" })) as { securityWiseFlow: { available: boolean; topFii: unknown[]; topDii: unknown[] } };
    expect(r.securityWiseFlow.available).toBe(false);
    expect(Array.isArray(r.securityWiseFlow.topFii)).toBe(true);
    expect(Array.isArray(r.securityWiseFlow.topDii)).toBe(true);
  }, NETWORK_TIMEOUT);

  it("labels the exchange it actually priced from (NSE or BSE)", async () => {
    const r = (await resolveLocal("market.snapshot", { symbol: "RELIANCE", marketId: "IN" })) as { source: string; quote: unknown; chain?: unknown[] };
    expect(r.source).toMatch(/NSE|BSE/);
    expect(Array.isArray(r.chain)).toBe(true);
    expect((r.chain as unknown[]).length).toBeGreaterThan(0);
  }, NETWORK_TIMEOUT);

  it("records which news providers answered (multi-feed redundancy)", async () => {
    const news = await stockNews("RELIANCE", 20);
    expect(Array.isArray(news.chain)).toBe(true);
    expect((news.chain ?? []).length).toBeGreaterThanOrEqual(3);
    // Every configured feed is attempted; at least one must supply coverage.
    const answered = (news.chain ?? []).filter((attempt) => attempt.ok);
    expect(answered.length).toBeGreaterThanOrEqual(1);
    expect(news.articles.length).toBeGreaterThan(0);
  }, NETWORK_TIMEOUT);

  it("fails over across Yahoo hosts for fundamentals", async () => {
    const analysis = await fundamentals("RELIANCE", "IN");
    // The analysis is built from whichever host answered; it must never be blank
    // just because one host is unavailable.
    expect(analysis.score).toBeGreaterThanOrEqual(0);
    expect(analysis.sources.some((s) => s.status === "used")).toBe(true);
  }, NETWORK_TIMEOUT);
});
