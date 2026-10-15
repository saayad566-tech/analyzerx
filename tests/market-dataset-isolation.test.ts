import { describe, expect, it } from "vitest";

import { assertRowsBelongToMarket, datasetForMarket, supportedDatasetMarkets } from "../lib/market-dataset";
import { MARKET_PROFILES } from "../lib/market-regions";

/**
 * These tests lock in the fix for the reported defect: selecting a market must show that market's
 * content only. Before this change, Live Events, Sectors and Flows rendered India-only fixtures for
 * every market (₹ values, NSE/BSE companies) — i.e. cross-market contamination.
 */

const INDIA_SYMBOLS = ["LT", "WAAREEENER", "TITAGARH"];
const US_SYMBOLS = ["MSFT", "VRT", "NVDA", "PWR"];

describe("market datasets are isolated", () => {
  it("has a supported dataset for India and the United States", () => {
    expect(datasetForMarket("IN").supported).toBe(true);
    expect(datasetForMarket("US").supported).toBe(true);
    expect(supportedDatasetMarkets()).toEqual(expect.arrayContaining(["IN", "US"]));
  });

  it("gives India only Indian events and the US only US events", () => {
    const india = datasetForMarket("IN");
    const us = datasetForMarket("US");
    expect(india.events.some((event) => INDIA_SYMBOLS.includes(event.symbolA))).toBe(true);
    expect(india.events.some((event) => US_SYMBOLS.includes(event.symbolA))).toBe(false);
    expect(us.events.some((event) => US_SYMBOLS.includes(event.symbolA))).toBe(true);
    expect(us.events.some((event) => INDIA_SYMBOLS.includes(event.symbolA))).toBe(false);
  });

  it("tags every market flow with its own market", () => {
    const india = datasetForMarket("IN");
    const us = datasetForMarket("US");
    expect(india.flows.every((flow) => flow.marketId === "IN")).toBe(true);
    expect(us.flows.every((flow) => flow.marketId === "US")).toBe(true);
    expect(assertRowsBelongToMarket(india.flows, "IN")).toEqual({ isolated: true, offenders: 0 });
    expect(assertRowsBelongToMarket(us.flows, "US")).toEqual({ isolated: true, offenders: 0 });
  });

  it("flags a cross-market mix through the isolation guard", () => {
    const mixed = [...datasetForMarket("IN").flows, ...datasetForMarket("US").flows];
    const check = assertRowsBelongToMarket(mixed, "IN");
    expect(check.isolated).toBe(false);
    expect(check.offenders).toBe(datasetForMarket("US").flows.length);
  });

  it("keeps sector sets and flow categories market-specific", () => {
    const india = datasetForMarket("IN");
    const us = datasetForMarket("US");
    expect(india.sectors.map((sector) => sector.name)).not.toEqual(us.sectors.map((sector) => sector.name));
    expect(india.flowCategories).toContain("FII");
    expect(us.flowCategories).toContain("Institutional");
    expect(us.flowCategories).not.toContain("FII");
  });

  it("scopes sector opportunities to their market", () => {
    expect(datasetForMarket("IN").opportunities.every((item) => item.name.length > 0)).toBe(true);
    expect(datasetForMarket("IN").opportunities.map((item) => item.name)).not.toEqual(datasetForMarket("US").opportunities.map((item) => item.name));
  });
});

describe("markets without a curated dataset never borrow another market's content", () => {
  const uncurated = MARKET_PROFILES.map((profile) => profile.id).filter((id) => id !== "IN" && id !== "US");

  it("returns empty, explicitly-unsupported datasets with a notice", () => {
    for (const marketId of uncurated) {
      const dataset = datasetForMarket(marketId);
      expect(dataset.supported).toBe(false);
      expect(dataset.events).toHaveLength(0);
      expect(dataset.storylines).toHaveLength(0);
      expect(dataset.sectors).toHaveLength(0);
      expect(dataset.flows).toHaveLength(0);
      expect(dataset.opportunities).toHaveLength(0);
      expect(dataset.notice.length).toBeGreaterThan(20);
      expect(dataset.notice).toContain(marketId);
    }
  });

  it("does not leak Indian content into an uncurated market", () => {
    const germany = datasetForMarket("DE");
    expect(germany.events.some((event) => INDIA_SYMBOLS.includes(event.symbolA))).toBe(false);
    expect(germany.flows).toHaveLength(0);
  });

  it("returns a safe empty dataset when no market is selected", () => {
    expect(datasetForMarket(null).supported).toBe(false);
    expect(datasetForMarket(undefined).events).toHaveLength(0);
  });

  it("returns a safe empty dataset for an unknown market id", () => {
    const unknown = datasetForMarket("ZZ" as never);
    expect(unknown.supported).toBe(false);
    expect(unknown.events).toHaveLength(0);
  });
});

describe("dataset integrity", () => {
  it("keeps event scores and confidences well-formed for every supported market", () => {
    for (const marketId of supportedDatasetMarkets()) {
      const dataset = datasetForMarket(marketId);
      expect(dataset.events.every((event) => event.score >= 0 && event.score <= 100)).toBe(true);
      expect(dataset.events.every((event) => event.status === "Confirmed" || event.status === "AI inference")).toBe(true);
      expect(dataset.events.every((event) => event.sourceUrl.startsWith("https://"))).toBe(true);
    }
  });

  it("links every storyline event to a storyline that exists", () => {
    for (const marketId of supportedDatasetMarkets()) {
      const dataset = datasetForMarket(marketId);
      const ids = new Set(dataset.storylines.map((storyline) => storyline.id));
      expect(dataset.events.every((event) => ids.has(event.storylineId))).toBe(true);
    }
  });
});
