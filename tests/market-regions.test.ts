import { describe, expect, it } from "vitest";
import { DEFAULT_MARKET_ID, MARKET_PROFILES, getMarketProfile } from "../lib/market-regions";

describe("market regions", () => {
  it("defaults to the deep India profile", () => {
    const india = getMarketProfile(DEFAULT_MARKET_ID);
    expect(india.id).toBe("IN");
    expect(india.coverage).toBe("deep");
    expect(india.exchanges).toEqual(["NSE", "BSE"]);
  });

  it("keeps country metadata and ticker formats distinct", () => {
    expect(getMarketProfile("US").currency).toBe("USD");
    expect(getMarketProfile("US").tickerExamples).toContain("AAPL");
    expect(getMarketProfile("JP").tickerExamples).toContain("7203.T");
    expect(getMarketProfile("IN").tickerExamples).not.toContain("AAPL");
  });

  it("records source-backed adapter validation without overstating runtime coverage", () => {
    expect(getMarketProfile("IN").adapterState).toBe("validated");
    expect(getMarketProfile("US").adapterState).toBe("catalog-validated");
    expect(getMarketProfile("US").primarySources).toContain("SEC EDGAR APIs");
    expect(getMarketProfile("JP").primarySources).toContain("JPX/TDnet");
  });

  it("falls back safely for unknown profiles", () => {
    expect(getMarketProfile("unknown").id).toBe(DEFAULT_MARKET_ID);
    expect(MARKET_PROFILES.length).toBeGreaterThanOrEqual(10);
  });
});
