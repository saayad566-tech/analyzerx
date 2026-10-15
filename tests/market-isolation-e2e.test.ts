import { describe, expect, it } from "vitest";

import {
  checkMarketScope,
  filterToMarket,
  marketScopeKey,
} from "../lib/market-isolation";
import { availableCategories, coverageForMarket } from "../lib/market-coverage";
import { MARKET_IDS, isMarketId, resolveMarketId } from "../lib/market-regions";
import { defaultSymbolForMarket } from "../lib/market-defaults";
import { newsEditionFor } from "../lib/market-news-edition";

/**
 * End-to-end isolation checks for the two markets the mandate names: France and the
 * United States. Each assertion asks the same question — can an Indian item reach a
 * FR or US surface? — and asserts it cannot.
 *
 * These run against the real isolation modules, not fixtures, so a regression in the
 * modules fails here.
 */

const NON_INDIA = ["FR", "US", "GB", "CA", "AU", "JP", "SG", "HK", "DE"] as const;

/** A row as it would come back from a provider. */
type Row = { market: string; symbol: string; headline?: string };

const MIXED_ROWS: Row[] = [
  { market: "IN", symbol: "RELIANCE", headline: "Reliance Q2 results" },
  { market: "IN", symbol: "TCS", headline: "TCS wins deal" },
  { market: "FR", symbol: "AIR.PA", headline: "Airbus deliveries" },
  { market: "FR", symbol: "MC.PA", headline: "LVMH revenue" },
  { market: "US", symbol: "AAPL", headline: "Apple earnings" },
  { market: "US", symbol: "MSFT", headline: "Microsoft cloud" },
];

describe("France and US isolation — no Indian item appears", () => {
  it.each(["FR", "US"])("returns only %s rows when asked for %s", (market) => {
    const rows = filterToMarket(MIXED_ROWS, market, (row) => row.market);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.market === market)).toBe(true);
    // The decisive assertion: no Indian instrument reaches a FR or US view.
    expect(rows.some((row) => row.symbol === "RELIANCE")).toBe(false);
    expect(rows.some((row) => row.symbol === "TCS")).toBe(false);
    expect(rows.some((row) => row.market === "IN")).toBe(false);
  });

  it.each(["FR", "US"])("rejects an Indian payload presented to %s", (market) => {
    const verdict = checkMarketScope({ market: "IN" }, market);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.expected).toBe(market);
      expect(verdict.received).toBe("IN");
    }
  });

  it.each(["FR", "US"])("rejects an unscoped payload for %s rather than assuming India", (market) => {
    expect(checkMarketScope({}, market).ok).toBe(false);
    expect(checkMarketScope({ market: null }, market).ok).toBe(false);
    expect(checkMarketScope(null, market).ok).toBe(false);
  });

  it("never shares a cache key between India and France for the same symbol", () => {
    // The same ticker string in two markets must be two different cache entries.
    expect(marketScopeKey("FR", "quotes", "AIR")).not.toBe(marketScopeKey("IN", "quotes", "AIR"));
    expect(marketScopeKey("US", "news", "AAPL")).not.toBe(marketScopeKey("IN", "news", "AAPL"));
    expect(marketScopeKey("FR", "quotes", "AIR")).toContain(":FR:");
    expect(marketScopeKey("US", "quotes", "AAPL")).toContain(":US:");
  });

  it.each(["FR", "US"])("does not default %s to an Indian symbol", (market) => {
    expect(defaultSymbolForMarket(market)).not.toBe("RELIANCE");
    expect(defaultSymbolForMarket(market)).not.toBe("TCS");
  });
});

describe("India-only features are unavailable for France and the US", () => {
  it("France has no free institutional-flow source, and says so", () => {
    const flows = coverageForMarket("FR").categories.find((entry) => entry.category === "flows");
    // India's NSE FII/DII feed is India-only. France has no free equivalent, so the
    // honest state is licensed — never "available" off the Indian feed.
    expect(flows?.status).not.toBe("available");
    expect(flows?.note ?? "").toMatch(/licensed|not published free/i);
    // And the FR note must not cite the NSE feed.
    expect(flows?.sources.join(" ")).not.toMatch(/\b(?:NSE|FII|DII)\b/i);
  });

  it("the US flow source is its OWN (SEC 13F), never India's NSE feed", () => {
    const flows = coverageForMarket("US").categories.find((entry) => entry.category === "flows");
    // The US genuinely has free institutional data via SEC 13F, so "available" is
    // correct here — but it must be backed by the SEC, not the Indian feed.
    expect(flows?.status).toBe("available");
    expect(flows?.sources.join(" ")).toMatch(/SEC/);
    expect(flows?.sources.join(" ")).not.toMatch(/\b(?:NSE|FII|DII)\b/i);
  });

  it("no non-India market's flow note cites the Indian feed", () => {
    for (const market of NON_INDIA) {
      const flows = coverageForMarket(market).categories.find((entry) => entry.category === "flows");
      expect(flows?.sources.join(" ") ?? "").not.toMatch(/\b(?:NSE|FII|DII)\b/i);
    }
  });

  it("France and the US still get quotes, news and macro", () => {
    for (const market of ["FR", "US"]) {
      const live = availableCategories(market);
      expect(live).toContain("quotes");
      expect(live).toContain("news");
      expect(live).toContain("macro");
    }
  });

  it("reports France's depth honestly rather than as India's", () => {
    const fr = coverageForMarket("FR");
    const ind = coverageForMarket("IN");
    expect(fr.coverage).toBe("standard");
    expect(ind.coverage).toBe("deep");
    // France must not inherit India's category count.
    expect(fr.availableCount).toBeLessThan(ind.availableCount);
  });
});

describe("news is fetched from the market's own edition", () => {
  it("uses the French edition for France and the US edition for the US", () => {
    expect(newsEditionFor("FR")).toEqual({ hl: "fr-FR", gl: "FR", ceid: "FR:fr" });
    expect(newsEditionFor("US")).toEqual({ hl: "en-US", gl: "US", ceid: "US:en" });
    expect(newsEditionFor("IN")).toEqual({ hl: "en-IN", gl: "IN", ceid: "IN:en" });
  });

  it("never returns the India edition for another market", () => {
    for (const market of NON_INDIA) {
      expect(newsEditionFor(market)?.gl).not.toBe("IN");
      expect(newsEditionFor(market)?.ceid).not.toBe("IN:en");
    }
  });

  it("returns no edition for an unknown market rather than the India one", () => {
    expect(newsEditionFor("ZZ")).toBeNull();
    expect(newsEditionFor(null)).toBeNull();
    expect(newsEditionFor("")).toBeNull();
  });
});

describe("market identity never silently becomes India", () => {
  it("resolves a missing or unknown market to UNKNOWN, not IN", () => {
    expect(resolveMarketId(null)).toBe("UNKNOWN");
    expect(resolveMarketId(undefined)).toBe("UNKNOWN");
    expect(resolveMarketId("")).toBe("UNKNOWN");
    expect(resolveMarketId("ZZ")).toBe("UNKNOWN");
    expect(resolveMarketId("FR")).toBe("FR");
  });

  it("never accepts UNKNOWN as a real market", () => {
    expect(isMarketId("UNKNOWN")).toBe(false);
    expect(isMarketId("IN")).toBe(true);
  });

  it("keeps the configured market list explicit and India first only as the default", () => {
    expect(MARKET_IDS.length).toBe(10);
    expect(MARKET_IDS).toContain("FR");
    expect(MARKET_IDS).toContain("US");
  });
});
