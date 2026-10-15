import { describe, expect, it } from "vitest";

import {
  checkMarketScope,
  createMarketSwitchController,
  filterToMarket,
  isolateStoredByMarket,
  isScopedToMarket,
  marketScopeKey,
  normaliseMarket,
  scopedQueryKey,
} from "../lib/market-isolation";
import {
  availableCategories,
  categoryLabel,
  coverageForMarket,
  coverageSummary,
  coverageTone,
} from "../lib/market-coverage";
import { SUPPORTED_MARKET_IDS } from "../lib/market-registry";

describe("market isolation — namespacing", () => {
  it("namespaces every key with the country code", () => {
    expect(marketScopeKey("US", "quotes", "AAPL")).toBe("data:US:quotes:AAPL");
    expect(marketScopeKey("in", "news")).toBe("data:IN:news");
  });

  it("never lets two markets share a key", () => {
    const us = marketScopeKey("US", "quotes", "AAPL");
    const ind = marketScopeKey("IN", "quotes", "AAPL");
    expect(us).not.toBe(ind);
    // The same symbol in two markets is a different key — the core of the fix.
    expect(us.startsWith("data:US:")).toBe(true);
    expect(ind.startsWith("data:IN:")).toBe(true);
  });

  it("normalises case and ignores empty parts", () => {
    expect(normaliseMarket(" us ")).toBe("US");
    expect(normaliseMarket(null)).toBe("");
    expect(marketScopeKey("US", "quotes", "aapl")).toBe("data:US:quotes:AAPL");
    expect(marketScopeKey("US", "search", "", "hdfc")).toBe("data:US:search:HDFC");
  });

  it("refuses to build an unscoped key", () => {
    expect(() => marketScopeKey("", "quotes")).toThrow();
    expect(() => marketScopeKey("   ", "news")).toThrow();
  });

  it("scopedQueryKey returns a market-namespaced array", () => {
    expect(scopedQueryKey("DE", "quotes", "SAP")).toEqual(["data:DE:quotes:SAP"]);
  });
});

describe("market isolation — cross-market rejection", () => {
  it("accepts a payload scoped to the active market", () => {
    expect(checkMarketScope({ market: "US" }, "US").ok).toBe(true);
    expect(isScopedToMarket({ market: "us" }, "US")).toBe(true);
  });

  it("rejects a payload from another market", () => {
    const verdict = checkMarketScope({ market: "IN" }, "US");
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.expected).toBe("US");
      expect(verdict.received).toBe("IN");
      expect(verdict.reason).toMatch(/cross-market/i);
    }
  });

  it("rejects an unscoped payload rather than assuming it is fine", () => {
    expect(checkMarketScope({}, "US").ok).toBe(false);
    expect(checkMarketScope({ market: "" }, "US").ok).toBe(false);
    expect(checkMarketScope(null, "US").ok).toBe(false);
    expect(isScopedToMarket({ market: null }, "US")).toBe(false);
  });

  it("rejects everything when no active market is set", () => {
    expect(checkMarketScope({ market: "US" }, "").ok).toBe(false);
  });

  it("filters rows down to the active market and never substitutes", () => {
    const rows = [
      { market: "IN", symbol: "RELIANCE" },
      { market: "US", symbol: "AAPL" },
      { market: "US", symbol: "MSFT" },
      { market: null, symbol: "GHOST" },
    ];
    const us = filterToMarket(rows, "US", (row) => row.market);
    expect(us.map((row) => row.symbol)).toEqual(["AAPL", "MSFT"]);
    // An empty market yields an empty list — never another market's rows.
    expect(filterToMarket(rows, "ZZ", (row) => row.market)).toEqual([]);
    expect(filterToMarket(null, "US", (row: { market: string }) => row.market)).toEqual([]);
  });

  it("isolates persisted per-market caches on hydrate", () => {
    const stored = { IN: { index: "NIFTY" }, US: { index: "S&P 500" } };
    expect(isolateStoredByMarket(stored, "US")).toEqual({ index: "S&P 500" });
    expect(isolateStoredByMarket(stored, "GB")).toBeNull();
    expect(isolateStoredByMarket(null, "US")).toBeNull();
  });
});

describe("market isolation — atomic switch lifecycle", () => {
  it("runs begin -> teardown -> swap -> fetched -> complete in order", () => {
    const controller = createMarketSwitchController();
    const ticket = controller.begin("US");
    expect(controller.teardown(ticket.epoch)).toBe(true);
    expect(controller.swap(ticket.epoch)).toBe(true);
    expect(controller.current()).toBe("US");
    expect(controller.fetched(ticket.epoch)).toBe(true);
    expect(controller.complete(ticket.epoch)).toBe(true);
    expect(controller.trace().map((entry) => entry.phase)).toEqual([
      "start", "flushed", "torn-down", "swapped", "fetched", "complete",
    ]);
  });

  it("flushes the previous market before committing the new one", () => {
    const flushed: Array<{ previous: string | null; target: string }> = [];
    const controller = createMarketSwitchController({
      onFlush: (previous, target) => flushed.push({ previous, target }),
    });
    controller.begin("IN");
    controller.swap(1);
    controller.begin("US");
    expect(flushed).toEqual([
      { previous: null, target: "IN" },
      { previous: "IN", target: "US" },
    ]);
  });

  it("discards a stale response after a rapid switch", () => {
    const controller = createMarketSwitchController();
    const first = controller.begin("IN");
    const second = controller.begin("US"); // user switched again mid-flight

    // The IN request finished late — its epoch is no longer current.
    expect(controller.isCurrent(first.epoch)).toBe(false);
    expect(controller.isCurrent(second.epoch)).toBe(true);

    // And the stale switch cannot commit its market.
    expect(controller.swap(first.epoch)).toBe(false);
    expect(controller.complete(first.epoch)).toBe(false);
    expect(controller.swap(second.epoch)).toBe(true);
    expect(controller.current()).toBe("US");
  });

  it("aborts the in-flight signal when superseded", () => {
    const superseded: number[] = [];
    const controller = createMarketSwitchController({ onSuperseded: (epoch) => superseded.push(epoch) });
    const first = controller.begin("IN");
    expect(first.signal.aborted).toBe(false);
    controller.begin("US");
    expect(first.signal.aborted).toBe(true);
    expect(superseded).toEqual([1]);
  });

  it("survives a fast IN -> US -> GB -> JP sequence, ending on the last market", () => {
    const controller = createMarketSwitchController();
    const tickets = ["IN", "US", "GB", "JP"].map((market) => controller.begin(market));
    for (const stale of tickets.slice(0, -1)) expect(controller.isCurrent(stale.epoch)).toBe(false);
    const last = tickets[tickets.length - 1];
    expect(controller.swap(last.epoch)).toBe(true);
    expect(controller.current()).toBe("JP");
  });

  it("refuses an empty target and aborts on demand", () => {
    const controller = createMarketSwitchController();
    expect(() => controller.begin("  ")).toThrow();
    const ticket = controller.begin("US");
    controller.abort();
    expect(ticket.signal.aborted).toBe(true);
    expect(controller.isCurrent(ticket.epoch)).toBe(false);
  });

  it("uses an injectable clock for deterministic traces", () => {
    let t = 0;
    const controller = createMarketSwitchController({ now: () => (t += 10) });
    controller.begin("US");
    expect(controller.trace().every((entry) => entry.at > 0)).toBe(true);
  });
});

describe("market coverage — honest per-category status", () => {
  it("covers every supported market", () => {
    for (const marketId of SUPPORTED_MARKET_IDS) {
      const coverage = coverageForMarket(marketId);
      expect(coverage.categories.length).toBe(7);
      expect(coverage.availableCount).toBeGreaterThan(0);
    }
  });

  it("marks quotes, news and macro available for every market", () => {
    for (const marketId of SUPPORTED_MARKET_IDS) {
      const live = availableCategories(marketId);
      expect(live).toContain("quotes");
      expect(live).toContain("news");
      expect(live).toContain("macro");
    }
  });

  it("gives US real, free filings via SEC EDGAR", () => {
    const filings = coverageForMarket("US").categories.find((entry) => entry.category === "filings");
    expect(filings?.status).toBe("available");
    expect(filings?.sources.join(" ")).toMatch(/SEC EDGAR/);
  });

  it("does not claim a machine feed where only a portal exists", () => {
    for (const marketId of ["GB", "CA", "AU", "SG", "HK"]) {
      const filings = coverageForMarket(marketId).categories.find((entry) => entry.category === "filings");
      expect(filings?.status).toBe("portal");
      expect(filings?.note).toMatch(/no .*machine-readable|no free public API|portal/i);
    }
  });

  it("marks institutional flows as licensed where no free source exists", () => {
    for (const marketId of ["GB", "DE", "JP", "SG", "HK", "AU", "CA", "FR"]) {
      const flows = coverageForMarket(marketId).categories.find((entry) => entry.category === "flows");
      expect(flows?.status).toBe("licensed");
      // And says so rather than showing a proxy from another market.
      expect(flows?.note).toMatch(/not published free|licensed/i);
    }
  });

  it("marks India deepest and the US broad", () => {
    expect(coverageForMarket("IN").coverage).toBe("deep");
    expect(coverageForMarket("US").coverage).toBe("broad");
    expect(coverageForMarket("GB").coverage).toBe("standard");
    expect(coverageForMarket("IN").availableCount).toBe(7);
  });

  it("never reports a category as available with no backing source", () => {
    for (const marketId of SUPPORTED_MARKET_IDS) {
      for (const entry of coverageForMarket(marketId).categories) {
        if (entry.status === "available") expect(entry.sources.length).toBeGreaterThan(0);
        expect(entry.note.length).toBeGreaterThan(10);
      }
    }
  });

  it("produces a readable summary and stable labels/tones", () => {
    expect(coverageSummary("IN")).toMatch(/7 of 7 categories live/);
    expect(coverageSummary("GB")).toMatch(/3 of 7 categories live/);
    expect(categoryLabel("flows")).toBe("institutional flows");
    expect(coverageTone("available")).toBe("good");
    expect(coverageTone("partial")).toBe("warn");
    expect(coverageTone("licensed")).toBe("muted");
    expect(coverageTone("portal")).toBe("muted");
  });

  it("handles an unknown market without throwing", () => {
    const coverage = coverageForMarket("ZZ");
    expect(coverage.categories.length).toBe(7);
    expect(coverage.availableCount).toBe(3);
  });
});
