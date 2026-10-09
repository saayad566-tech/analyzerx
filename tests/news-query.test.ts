import { describe, expect, it } from "vitest";
import { getNewsSearchQuery } from "../server/optional-providers";

describe("news search query routing", () => {
  it("expands common crypto symbols into name-aware free RSS queries", () => {
    expect(getNewsSearchQuery("btc-usd")).toContain("Bitcoin");
    expect(getNewsSearchQuery("ETH")).toContain("Ethereum");
  });

  it("preserves global equity symbols without adding Indian-only assumptions", () => {
    expect(getNewsSearchQuery("sap.de")).toBe('"SAP.DE" when:1d');
    expect(getNewsSearchQuery("aapl")).toBe('"AAPL" when:1d');
  });

  it("adds the selected country context only when a market is explicitly requested", () => {
    expect(getNewsSearchQuery("RELIANCE", "IN")).toContain("India");
    expect(getNewsSearchQuery("AAPL", "US")).toContain("United States");
    expect(getNewsSearchQuery("AAPL")).toBe('"AAPL" when:1d');
  });
});
