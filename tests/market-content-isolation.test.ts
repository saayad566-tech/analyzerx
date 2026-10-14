/**
 * Content-level market isolation.
 *
 * The isolation tests that existed checked *scoping* — that a cache key or a query carried
 * a market. They did not check that the CONTENT was right, so a hardcoded list of Indian
 * benchmarks, Indian publisher feeds or Indian demo events passed every existing test.
 *
 * These tests assert the content itself, for every supported market. They are the
 * regression net for the defects reported after the market switch:
 *   - the Screener showed NIFTY 50 / SENSEX / BANK NIFTY for every market
 *   - the Live tab showed a hardcoded Indian demo feed for every market
 *   - every publisher feed was tagged India, including Reuters, CNBC and the FT
 *   - the local link defaulted a missing market to India
 *
 * Relative imports only: vitest has no "@/" alias in this repository.
 */
import { describe, it, expect } from "vitest";
import { benchmarksForMarket, hasMarketBenchmarks, MARKET_BENCHMARKS } from "../lib/market-benchmarks";
import { seedUniverseForMarket, MARKET_SEED_UNIVERSE } from "../lib/market-universe";
import { publisherFeedsFor, publisherFeedUrlsFor, PUBLISHER_FEEDS } from "../lib/market-publisher-feeds";
import { marketQueryTerms, topicFeedUrl, MARKET_TOPICS } from "../lib/market-news-query";
import { eventProjectionsToMarketEvents, eventProjectionToMarketEvent } from "../lib/event-projection-view";
import { MARKET_IDS } from "../lib/market-regions";

const MARKETS: readonly string[] = MARKET_IDS;

/** Symbols that must never appear for a market other than India. */
const INDIA_ONLY_SYMBOLS = ["^NSEI", "^BSESN", "^NSEBANK", "INR=X"];
const INDIA_ONLY_FEED_MARKERS = ["economictimes", "moneycontrol", "livemint", "thehindubusinessline", "cnbctv18", "bseindia", "rbi.org.in", "sebi.gov.in"];

describe("multi-asset benchmarks", () => {
  it("covers every supported market", () => {
    for (const market of MARKETS) {
      expect(hasMarketBenchmarks(market), `${market} has no benchmark set`).toBe(true);
      expect(MARKET_BENCHMARKS[market as keyof typeof MARKET_BENCHMARKS]).toBeDefined();
    }
  });

  it("never shows Indian indices to a market that is not India", () => {
    for (const market of MARKETS.filter((m) => m !== "IN")) {
      const symbols = benchmarksForMarket(market).map((asset) => asset.symbol);
      for (const indian of INDIA_ONLY_SYMBOLS) {
        expect(symbols, `${market} was served the Indian symbol ${indian}`).not.toContain(indian);
      }
    }
  });

  it("gives India its own benchmarks", () => {
    const symbols = benchmarksForMarket("IN").map((asset) => asset.symbol);
    expect(symbols).toContain("^NSEI");
    expect(symbols).toContain("^BSESN");
    expect(symbols).toContain("INR=X");
  });

  it("gives each market its own leading index", () => {
    expect(benchmarksForMarket("US")[0].symbol).toBe("^GSPC");
    expect(benchmarksForMarket("GB")[0].symbol).toBe("^FTSE");
    expect(benchmarksForMarket("JP")[0].symbol).toBe("^N225");
    expect(benchmarksForMarket("AU")[0].symbol).toBe("^AXJO");
    expect(benchmarksForMarket("DE")[0].symbol).toBe("^GDAXI");
    expect(benchmarksForMarket("HK")[0].symbol).toBe("^HSI");
    expect(benchmarksForMarket("FR")[0].symbol).toBe("^FCHI");
    expect(benchmarksForMarket("CA")[0].symbol).toBe("^GSPTSE");
    expect(benchmarksForMarket("SG")[0].symbol).toBe("^STI");
  });

  it("gives each market its own currency pair", () => {
    expect(benchmarksForMarket("GB").map((a) => a.symbol)).toContain("GBPUSD=X");
    expect(benchmarksForMarket("JP").map((a) => a.symbol)).toContain("JPY=X");
    expect(benchmarksForMarket("AU").map((a) => a.symbol)).toContain("AUDUSD=X");
    expect(benchmarksForMarket("CA").map((a) => a.symbol)).toContain("CAD=X");
  });

  it("shows only global assets to an unknown market, never India's", () => {
    for (const unknown of [null, undefined, "", "ZZ", "XX"]) {
      const symbols = benchmarksForMarket(unknown).map((asset) => asset.symbol);
      expect(symbols).toEqual(["BTC-USD", "GC=F", "BZ=F"]);
      for (const indian of INDIA_ONLY_SYMBOLS) expect(symbols).not.toContain(indian);
    }
  });

  it("includes the three global assets for every known market", () => {
    for (const market of MARKETS) {
      const symbols = benchmarksForMarket(market).map((asset) => asset.symbol);
      expect(symbols).toContain("BTC-USD");
      expect(symbols).toContain("GC=F");
      expect(symbols).toContain("BZ=F");
    }
  });
});

describe("seed universe", () => {
  it("covers every market with a non-empty list", () => {
    for (const market of MARKETS) {
      expect(seedUniverseForMarket(market).length, `${market} has no seed universe`).toBeGreaterThan(0);
      expect(MARKET_SEED_UNIVERSE[market as keyof typeof MARKET_SEED_UNIVERSE]).toBeDefined();
    }
  });

  it("never hands an Indian symbol list to another market", () => {
    const indianSeed = new Set(seedUniverseForMarket("IN"));
    for (const market of MARKETS.filter((m) => m !== "IN")) {
      for (const symbol of seedUniverseForMarket(market)) {
        expect(indianSeed.has(symbol), `${market} was served the Indian symbol ${symbol}`).toBe(false);
      }
    }
  });

  it("uses each market's own exchange suffix", () => {
    expect(seedUniverseForMarket("US").every((s) => !s.includes("."))).toBe(true);
    expect(seedUniverseForMarket("GB").every((s) => s.endsWith(".L"))).toBe(true);
    expect(seedUniverseForMarket("CA").every((s) => s.endsWith(".TO"))).toBe(true);
    expect(seedUniverseForMarket("AU").every((s) => s.endsWith(".AX"))).toBe(true);
    expect(seedUniverseForMarket("JP").every((s) => s.endsWith(".T"))).toBe(true);
    expect(seedUniverseForMarket("SG").every((s) => s.endsWith(".SI"))).toBe(true);
    expect(seedUniverseForMarket("HK").every((s) => s.endsWith(".HK"))).toBe(true);
    expect(seedUniverseForMarket("DE").every((s) => s.endsWith(".DE"))).toBe(true);
    expect(seedUniverseForMarket("FR").every((s) => s.endsWith(".PA"))).toBe(true);
  });

  it("returns nothing for an unknown market", () => {
    for (const unknown of [null, undefined, "", "ZZ"]) {
      expect(seedUniverseForMarket(unknown)).toEqual([]);
    }
  });
});

describe("publisher feeds", () => {
  it("tags every feed with a real market", () => {
    for (const feed of PUBLISHER_FEEDS) {
      expect(MARKETS, `${feed.id} is tagged ${feed.market}`).toContain(feed.market);
    }
  });

  it("gives every market at least one feed of its own", () => {
    for (const market of MARKETS) {
      expect(publisherFeedsFor(market).length, `${market} has no publisher feed`).toBeGreaterThan(0);
    }
  });

  it("never hands Indian outlets to another market", () => {
    for (const market of MARKETS.filter((m) => m !== "IN")) {
      const urls = publisherFeedUrlsFor(market).join(" ").toLowerCase();
      for (const marker of INDIA_ONLY_FEED_MARKERS) {
        expect(urls, `${market} was served the Indian outlet ${marker}`).not.toContain(marker);
      }
    }
  });

  it("does not file the same feed under two markets", () => {
    const seen = new Map<string, string>();
    for (const feed of PUBLISHER_FEEDS) {
      const previous = seen.get(feed.id);
      expect(previous, `${feed.id} is filed under both ${previous} and ${feed.market}`).toBeUndefined();
      seen.set(feed.id, feed.market);
    }
  });

  it("returns nothing for an unknown market", () => {
    for (const unknown of [null, undefined, "", "ZZ"]) {
      expect(publisherFeedsFor(unknown)).toEqual([]);
    }
  });
});

describe("news search vocabulary", () => {
  it("has terms for every market", () => {
    for (const market of MARKETS) {
      expect(marketQueryTerms(market).length, `${market} has no search terms`).toBeGreaterThan(0);
    }
  });

  it("never applies Indian terms to another market", () => {
    for (const market of MARKETS.filter((m) => m !== "IN")) {
      const terms = marketQueryTerms(market);
      expect(terms).not.toContain("Nifty");
      expect(terms).not.toContain("Sensex");
      expect(terms).not.toContain("SEBI");
    }
  });

  it("builds topic URLs with the market's own news edition", () => {
    const us = topicFeedUrl("US", MARKET_TOPICS[0]);
    expect(us).toContain("gl=US");
    expect(us).toContain("ceid=US:en");
    const de = topicFeedUrl("DE", MARKET_TOPICS[0]);
    expect(de).toContain("gl=DE");
    expect(de).toContain("ceid=DE:de");
  });

  it("never builds an India-edition URL for another market", () => {
    for (const market of MARKETS.filter((m) => m !== "IN")) {
      for (const topic of MARKET_TOPICS) {
        const url = topicFeedUrl(market, topic) ?? "";
        expect(url, `${market}/${topic.id} used the India edition`).not.toContain("gl=IN");
        expect(url, `${market}/${topic.id} used the India edition`).not.toContain("ceid=IN");
      }
    }
  });

  it("returns null for an unknown market rather than an India URL", () => {
    for (const unknown of [null, undefined, "", "ZZ"]) {
      expect(topicFeedUrl(unknown, MARKET_TOPICS[0])).toBeNull();
      expect(marketQueryTerms(unknown)).toBe("");
    }
  });
});

describe("event projection mapping", () => {
  const row = {
    id: "p1",
    marketId: "AU",
    symbol: "BHP.AX",
    eventType: "order",
    title: "BHP signs supply agreement",
    summary: "A verified Australian event.",
    relationshipJson: JSON.stringify({ entities: ["BHP.AX", "FMG.AX"], relationship: "supplies" }),
    sentiment: "positive" as const,
    impactScore: 88,
    confidenceScore: 90,
    status: "active" as const,
    sourceUrl: "https://example.com/a",
    sourceKey: "au-asx-announcements",
    eventAt: "2026-10-14T04:05:00.000Z",
  };

  it("maps a real projection onto the card shape", () => {
    const event = eventProjectionToMarketEvent(row);
    expect(event.title).toBe("BHP signs supply agreement");
    expect(event.symbolA).toBe("BHP.AX");
    expect(event.symbolB).toBe("FMG.AX");
    expect(event.kind).toBe("Large order");
    expect(event.confidence).toBe("High");
    expect(event.score).toBe(88);
    expect(event.status).toBe("Confirmed");
  });

  it("carries no Indian content of its own", () => {
    const event = eventProjectionToMarketEvent(row);
    const blob = JSON.stringify(event).toLowerCase();
    expect(blob).not.toContain("nifty");
    expect(blob).not.toContain("sensex");
    expect(blob).not.toContain("₹");
    expect(blob).not.toContain("larsen");
    expect(blob).not.toContain("waaree");
  });

  it("survives a malformed relationship payload without inventing a second party", () => {
    const event = eventProjectionToMarketEvent({ ...row, relationshipJson: "not json" });
    expect(event.symbolA).toBe("BHP.AX");
    expect(event.symbolB).toBeUndefined();
  });

  it("maps an empty list to an empty list, never to demo data", () => {
    expect(eventProjectionsToMarketEvents([])).toEqual([]);
  });
});

describe("no Indian substitution anywhere in the content layer", () => {
  it("no market is served another market's leading index", () => {
    const leaders = new Map<string, string>();
    for (const market of MARKETS) {
      const leader = benchmarksForMarket(market)[0].symbol;
      expect(leaders.has(leader), `${market} shares a leading index with ${leaders.get(leader)}`).toBe(false);
      leaders.set(leader, market);
    }
  });
});
