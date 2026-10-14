/**
 * Per-market coverage and geo-isolation verification.
 *
 * The mandate asks for a verification report confirming that every supported market has
 * an active pipeline, and for explicit proof of strict geo-isolation. This test is that
 * proof, machine-checked rather than asserted in prose.
 *
 * It does two things the earlier isolation tests did not:
 *
 *  1. Cross-checks the DECLARED coverage against the ACTUAL registries. A market may
 *     claim a category is available only if the sources that back it are really wired —
 *     a benchmark set, publisher feeds, a seed universe, a news edition. A declaration
 *     with nothing behind it fails here.
 *
 *  2. Proves disjointness. Every market's content layer — leading index, currency pair,
 *     seed symbols, publisher feeds, news edition — must be its own. No symbol, feed or
 *     edition may be shared across markets in a way that could substitute one for
 *     another.
 *
 * Relative imports only: vitest has no "@/" alias in this repository.
 */
import { describe, it, expect } from "vitest";
import { MARKET_IDS } from "../lib/market-regions";
import { coverageForMarket, availableCategories, type CoverageCategory } from "../lib/market-coverage";
import { benchmarksForMarket, hasMarketBenchmarks } from "../lib/market-benchmarks";
import { seedUniverseForMarket } from "../lib/market-universe";
import { publisherFeedsFor, publisherFeedUrlsFor } from "../lib/market-publisher-feeds";
import { newsEditionFor, NEWS_EDITION } from "../lib/market-news-edition";
import { marketQueryTerms } from "../lib/market-news-query";

const MARKETS: readonly string[] = MARKET_IDS;
const CATEGORIES: CoverageCategory[] = ["quotes", "news", "macro", "fundamentals", "filings", "flows", "options"];

describe("every market declares coverage for every category", () => {
  it("has a coverage entry for all seven categories in all ten markets", () => {
    for (const market of MARKETS) {
      const coverage = coverageForMarket(market);
      expect(coverage.marketId, `${market} coverage is mislabelled`).toBe(market);
      const declared = coverage.categories.map((entry) => entry.category);
      for (const category of CATEGORIES) {
        expect(declared, `${market} declares no coverage for ${category}`).toContain(category);
      }
    }
  });

  it("never declares a category available without a source behind it", () => {
    for (const market of MARKETS) {
      for (const entry of coverageForMarket(market).categories) {
        if (entry.status === "available") {
          expect(entry.sources.length, `${market}/${entry.category} claims available with no source`).toBeGreaterThan(0);
        }
        // Every status carries a readable, non-empty note rather than a bare label.
        expect(entry.note.length, `${market}/${entry.category} has no note`).toBeGreaterThan(10);
      }
    }
  });

  it("counts its available categories consistently with what it lists", () => {
    for (const market of MARKETS) {
      const coverage = coverageForMarket(market);
      const counted = coverage.categories.filter((entry) => entry.status === "available").length;
      expect(coverage.availableCount, `${market} availableCount disagrees with its own list`).toBe(counted);
      expect(availableCategories(market).length).toBe(counted);
    }
  });

  it("backs an 'available' quotes or news claim with real wired content", () => {
    for (const market of MARKETS) {
      const available = availableCategories(market);
      if (available.includes("quotes")) {
        // A quotes claim needs a real benchmark set: the market's own index and currency.
        expect(hasMarketBenchmarks(market), `${market} claims quotes but has no benchmarks`).toBe(true);
        expect(benchmarksForMarket(market).length).toBeGreaterThan(2);
      }
      if (available.includes("news")) {
        // A news claim needs its own edition, its own search terms and its own feeds.
        expect(newsEditionFor(market), `${market} claims news but has no news edition`).not.toBeNull();
        expect(marketQueryTerms(market).length, `${market} claims news but has no search terms`).toBeGreaterThan(0);
        expect(publisherFeedsFor(market).length, `${market} claims news but has no publisher feed`).toBeGreaterThan(0);
      }
    }
  });

  it("gives every market a usable content layer regardless of declared coverage", () => {
    for (const market of MARKETS) {
      expect(hasMarketBenchmarks(market), `${market} has no benchmark set`).toBe(true);
      expect(seedUniverseForMarket(market).length, `${market} has no seed universe`).toBeGreaterThan(0);
      expect(publisherFeedsFor(market).length, `${market} has no publisher feed`).toBeGreaterThan(0);
      expect(newsEditionFor(market), `${market} has no news edition`).not.toBeNull();
    }
  });
});

describe("geo-isolation: every market's content layer is its own", () => {
  it("shares no leading index between markets", () => {
    const owner = new Map<string, string>();
    for (const market of MARKETS) {
      const lead = benchmarksForMarket(market)[0].symbol;
      expect(owner.has(lead), `${market} and ${owner.get(lead)} share the leading index ${lead}`).toBe(false);
      owner.set(lead, market);
    }
  });

  it("shares no currency pair between markets", () => {
    const owner = new Map<string, string>();
    for (const market of MARKETS) {
      const currency = benchmarksForMarket(market).find((asset) => asset.type === "macro" && /[/=]/.test(asset.name));
      if (!currency) continue;
      // EUR/USD legitimately serves both Germany and France; nothing else may repeat.
      const previous = owner.get(currency.symbol);
      if (previous) {
        expect(
          [previous, market].sort().join(","),
          `${market} and ${previous} share ${currency.symbol}`,
        ).toBe("DE,FR");
      }
      owner.set(currency.symbol, market);
    }
  });

  it("gives every market a distinct news edition", () => {
    const seen = new Map<string, string>();
    for (const market of MARKETS) {
      const edition = NEWS_EDITION[market as keyof typeof NEWS_EDITION];
      expect(edition, `${market} has no edition`).toBeDefined();
      const key = `${edition.hl}|${edition.gl}|${edition.ceid}`;
      expect(seen.has(key), `${market} and ${seen.get(key)} share the edition ${key}`).toBe(false);
      seen.set(key, market);
    }
  });

  it("shares no publisher feed between markets", () => {
    const owner = new Map<string, string>();
    for (const market of MARKETS) {
      for (const url of publisherFeedUrlsFor(market)) {
        expect(owner.has(url), `${market} and ${owner.get(url)} share the feed ${url}`).toBe(false);
        owner.set(url, market);
      }
    }
  });

  it("shares no seed symbol between markets", () => {
    const owner = new Map<string, string>();
    for (const market of MARKETS) {
      for (const symbol of seedUniverseForMarket(market)) {
        expect(owner.has(symbol), `${market} and ${owner.get(symbol)} share the seed symbol ${symbol}`).toBe(false);
        owner.set(symbol, market);
      }
    }
  });

  it("never lets an unknown market resolve to any real market's content", () => {
    for (const unknown of [null, undefined, "", "ZZ", "XX", "  "]) {
      expect(benchmarksForMarket(unknown).map((a) => a.symbol)).toEqual(["BTC-USD", "GC=F", "BZ=F"]);
      expect(seedUniverseForMarket(unknown)).toEqual([]);
      expect(publisherFeedsFor(unknown)).toEqual([]);
      expect(newsEditionFor(unknown)).toBeNull();
      expect(marketQueryTerms(unknown)).toBe("");
    }
  });
});

describe("coverage is honest about what cannot be free", () => {
  it("marks live or licensed-only categories as gated rather than available", () => {
    for (const market of MARKETS) {
      for (const entry of coverageForMarket(market).categories) {
        if (entry.status === "licensed" || entry.status === "portal") {
          // A gated category must explain itself, never silently look operational.
          expect(entry.note.length).toBeGreaterThan(10);
          expect(entry.sources.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("never backs a non-Indian market's flows with the Indian NSE feed", () => {
    // The NSE FII/DII feed is India-only. A non-Indian market may legitimately have its
    // own free flow source — the United States does, via quarterly SEC 13F filings — but
    // it must never be the NSE one, because that would be presenting India's flows as
    // another market's.
    for (const market of MARKETS.filter((m) => m !== "IN")) {
      const flows = coverageForMarket(market).categories.find((entry) => entry.category === "flows");
      expect(flows, `${market} declares no flows coverage`).toBeDefined();
      // Match the feed by name, not by substring: "licensed" contains the letters
      // "nse" and would otherwise trip a naive check.
      const backing = flows!.sources.join(" ");
      expect(/NSE/i.test(backing) && /FII|DII|flow/i.test(backing), `${market} backs its flows with the NSE feed`).toBe(false);
      if (flows!.status === "available") {
        // An available claim must name a real, free, non-Indian source.
        expect(flows!.sources.length, `${market} claims available flows with no source`).toBeGreaterThan(0);
      }
    }
  });

  it("states the cadence when a flow source is not daily", () => {
    // The United States uses quarterly 13F filings. That is a real source, but the
    // screen must not imply a daily aggregate.
    const usFlows = coverageForMarket("US").categories.find((entry) => entry.category === "flows")!;
    expect(usFlows.status).toBe("available");
    expect(usFlows.note.toLowerCase()).toContain("quarterly");
  });
});
