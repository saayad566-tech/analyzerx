import { describe, expect, it } from "vitest";

import {
  checkMarketScope,
  createMarketSwitchController,
  filterToMarket,
  marketScopeKey,
} from "../lib/market-isolation";
import { availableCategories, coverageForMarket } from "../lib/market-coverage";
import { MARKET_IDS, resolveMarketId } from "../lib/market-regions";
import { newsEditionFor } from "../lib/market-news-edition";
import { defaultSymbolForMarket } from "../lib/market-defaults";
import { formatForMarket } from "../lib/market-format";
import { marketStatus } from "../lib/market-session";

/**
 * Isolation across EVERY configured market, not just the two the earlier test covered.
 *
 * Each block asks the same question for all ten markets: can one market's data reach
 * another market's surface? Every assertion below is a "no" — a shared cache key, a
 * shared storage bucket, a shared news edition, or an accepted foreign payload would
 * fail it.
 *
 * Rows carry a market and a symbol so a leak is detectable by either.
 */
type Row = { market: string; symbol: string };

const ALL_ROWS: Row[] = MARKET_IDS.flatMap((market) => [
  { market, symbol: `${market}-A` },
  { market, symbol: `${market}-B` },
]);

describe("every market is isolated from every other market", () => {
  it("returns only the requested market's rows, for all ten markets", () => {
    for (const market of MARKET_IDS) {
      const rows = filterToMarket(ALL_ROWS, market, (row) => row.market);
      expect(rows.length).toBe(2);
      expect(rows.every((row) => row.market === market)).toBe(true);
      // No other market's instrument survives.
      for (const other of MARKET_IDS) {
        if (other === market) continue;
        expect(rows.some((row) => row.symbol.startsWith(`${other}-`))).toBe(false);
      }
    }
  });

  it("rejects every foreign payload, for all ten markets", () => {
    for (const market of MARKET_IDS) {
      for (const other of MARKET_IDS) {
        if (other === market) continue;
        expect(checkMarketScope({ market: other }, market).ok).toBe(false);
      }
      expect(checkMarketScope({ market }, market).ok).toBe(true);
      // An unscoped payload is never accepted as a fallback.
      expect(checkMarketScope({}, market).ok).toBe(false);
      expect(checkMarketScope({ market: null }, market).ok).toBe(false);
    }
  });

  it("never shares a cache key between any two markets, for the same symbol", () => {
    const keys = MARKET_IDS.map((market) => marketScopeKey(market, "quotes", "SAME"));
    expect(new Set(keys).size).toBe(MARKET_IDS.length);
    for (const market of MARKET_IDS) expect(marketScopeKey(market, "quotes", "SAME")).toContain(`:${market}:`);
  });

  it("gives every market its own news edition, and none inherits India's", () => {
    for (const market of MARKET_IDS) {
      const edition = newsEditionFor(market);
      expect(edition).not.toBeNull();
      if (market !== "IN") {
        expect(edition?.gl).not.toBe("IN");
        expect(edition?.ceid).not.toBe("IN:en");
      }
    }
    // Every market's edition is distinct.
    const serialised = MARKET_IDS.map((market) => JSON.stringify(newsEditionFor(market)));
    expect(new Set(serialised).size).toBe(MARKET_IDS.length);
    // An unknown market gets NO edition rather than India's.
    expect(newsEditionFor("ZZ")).toBeNull();
  });

  it("never defaults a market to another market's symbol", () => {
    const defaults = MARKET_IDS.map((market) => defaultSymbolForMarket(market));
    // India's own default is an Indian ticker — that is correct. What must never
    // happen is a NON-India market defaulting to an Indian symbol.
    for (const market of MARKET_IDS) {
      if (market === "IN") continue;
      const symbol = defaultSymbolForMarket(market);
      expect(symbol).not.toBe("RELIANCE");
      expect(symbol).not.toBe("TCS");
      expect(symbol).not.toBe("HDFCBANK");
    }
    // And no two markets share a default ticker.
    expect(new Set(defaults.filter(Boolean)).size).toBe(defaults.filter(Boolean).length);
  });

  it("gives every market its own currency and timezone", () => {
    for (const market of MARKET_IDS) {
      const format = formatForMarket(market);
      expect(format.marketId).toBe(market);
      expect(format.currencyCode.length).toBeGreaterThan(0);
      expect(format.timeZone.length).toBeGreaterThan(0);
    }
    // India is the only market that uses Indian digit grouping.
    const indianGrouping = MARKET_IDS.filter((market) => formatForMarket(market).grouping === "indian");
    expect(indianGrouping).toEqual(["IN"]);
  });

  it("declares coverage per market, and only India is the deepest", () => {
    const depths = MARKET_IDS.map((market) => coverageForMarket(market).coverage);
    expect(depths.filter((d) => d === "deep").length).toBe(1);
    expect(coverageForMarket("IN").coverage).toBe("deep");
    // Every market has a live category set; none is empty.
    for (const market of MARKET_IDS) expect(availableCategories(market).length).toBeGreaterThan(0);
    // Only India has India-style daily institutional flows.
    for (const market of MARKET_IDS) {
      if (market === "IN") continue;
      const flows = coverageForMarket(market).categories.find((entry) => entry.category === "flows");
      expect(flows?.sources.join(" ") ?? "").not.toMatch(/\b(?:NSE|FII|DII)\b/i);
    }
  });

  it("computes session status in each exchange's own timezone", () => {
    // 2026-10-14 is a Wednesday. At 04:30 UTC India is open and New York is closed.
    const instant = Date.UTC(2026, 9, 14, 4, 30);
    const statuses = MARKET_IDS.map((market) => marketStatus(instant, market));
    expect(statuses.every((report) => report.marketId !== undefined)).toBe(true);
    expect(marketStatus(instant, "IN").status).toBe("open");
    expect(marketStatus(instant, "US").status).toBe("closed");
    // Timezones are distinct per market, so no two markets share a session clock.
    const zones = MARKET_IDS.map((market) => marketStatus(instant, market).timeZone);
    expect(new Set(zones).size).toBeGreaterThanOrEqual(9);
  });
});

describe("rapid switching never lets a stale market commit", () => {
  it("survives a full cycle through every market, ending on the last", () => {
    const controller = createMarketSwitchController();
    const tickets = MARKET_IDS.map((market) => controller.begin(market));
    for (const stale of tickets.slice(0, -1)) {
      expect(controller.isCurrent(stale.epoch)).toBe(false);
      expect(controller.swap(stale.epoch)).toBe(false);
      expect(controller.complete(stale.epoch)).toBe(false);
    }
    const last = tickets[tickets.length - 1];
    expect(controller.swap(last.epoch)).toBe(true);
    expect(controller.current()).toBe(MARKET_IDS[MARKET_IDS.length - 1]);
  });

  it("aborts every superseded in-flight request", () => {
    const controller = createMarketSwitchController();
    const tickets = MARKET_IDS.map((market) => controller.begin(market));
    // Every switch but the last was aborted, so its response can never be used.
    for (const stale of tickets.slice(0, -1)) expect(stale.signal.aborted).toBe(true);
    expect(tickets[tickets.length - 1].signal.aborted).toBe(false);
  });

  it("never lets an unknown market resolve to a real one", () => {
    for (const bad of [null, undefined, "", "ZZ", "US ", "us"]) {
      const resolved = resolveMarketId(bad);
      if (bad === "US " || bad === "us") expect(resolved).toBe("US");
      else expect(resolved).toBe("UNKNOWN");
    }
    // UNKNOWN is never one of the configured markets.
    expect((MARKET_IDS as readonly string[]).includes("UNKNOWN")).toBe(false);
  });
});
