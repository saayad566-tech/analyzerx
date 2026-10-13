import { describe, expect, it } from "vitest";

import {
  defaultSymbolForMarket,
  providerSymbolForMarket,
  defaultSymbolsForMarket,
  isSymbolPlausibleForMarket,
  knownMarketIds,
  marketExampleSymbols,
  marketScopedPeers,
  resolveMarketScopedSymbol,
} from "../lib/market-defaults";

describe("market-scoped defaults (master mandate Phase 3)", () => {
  it("never returns an Indian instrument for a non-Indian market", () => {
    // The defect the mandate names explicitly: "RELIANCE" used as a generic
    // fallback for a US/UK/FR/JP query.
    for (const marketId of ["US", "GB", "CA", "AU", "JP", "SG", "HK", "DE", "FR"]) {
      const symbol = defaultSymbolForMarket(marketId);
      expect(symbol).not.toBe("RELIANCE");
      expect(symbol).not.toMatch(/^(TCS|INFY|HDFCBANK)$/);
      expect(symbol).toBeTruthy();
    }
    expect(defaultSymbolForMarket("US")).toBe("AAPL");
    expect(defaultSymbolForMarket("FR")).toBe("MC.PA");
    expect(defaultSymbolForMarket("JP")).toBe("7203.T");
  });

  it("still returns the market's own instrument for India", () => {
    expect(defaultSymbolForMarket("IN")).toBe("RELIANCE");
  });

  it("returns null for an unknown market rather than guessing", () => {
    expect(defaultSymbolForMarket("ZZ")).toBeNull();
    expect(defaultSymbolsForMarket("ZZ")).toEqual([]);
    expect(resolveMarketScopedSymbol(null, "ZZ")).toBeNull();
  });

  it("prefers a supplied symbol and only then the market default", () => {
    expect(resolveMarketScopedSymbol("nvda", "US")).toBe("NVDA");
    expect(resolveMarketScopedSymbol("  ", "FR")).toBe("MC.PA");
    expect(resolveMarketScopedSymbol(null, "DE")).toBe("SAP.DE");
  });

  it("bounds the number of default symbols", () => {
    expect(defaultSymbolsForMarket("US", 2)).toEqual(["AAPL", "MSFT"]);
    expect(defaultSymbolsForMarket("US", 0)).toEqual([]);
    expect(defaultSymbolsForMarket("US", -3)).toEqual([]);
  });

  it("accepts a bare ticker only for markets that use one", () => {
    expect(isSymbolPlausibleForMarket("AAPL", "US")).toBe(true);
    expect(isSymbolPlausibleForMarket("RELIANCE", "IN")).toBe(true);
    expect(isSymbolPlausibleForMarket("MC.PA", "FR")).toBe(true);
    expect(isSymbolPlausibleForMarket("7203.T", "JP")).toBe(true);
  });

  it("rejects a ticker carrying another market's exchange suffix", () => {
    // This is the check that would have caught an Indian ticker in a French feed.
    expect(isSymbolPlausibleForMarket("RELIANCE.NS", "FR")).toBe(false);
    expect(isSymbolPlausibleForMarket("SAP.DE", "US")).toBe(false);
    expect(isSymbolPlausibleForMarket("MC.PA", "GB")).toBe(false);
    expect(isSymbolPlausibleForMarket("", "US")).toBe(false);
    expect(isSymbolPlausibleForMarket(null, "US")).toBe(false);
    expect(isSymbolPlausibleForMarket("AAPL", "ZZ")).toBe(false);
  });

  it("scopes peers to the active market and excludes the subject", () => {
    expect(marketScopedPeers("US", "AAPL")).toEqual(["MSFT", "NVDA"]);
    expect(marketScopedPeers("FR", "MC.PA")).toEqual(["OR.PA", "AIR.PA"]);
    // No Indian peers leak into a non-Indian market.
    expect(marketScopedPeers("US", null).some((symbol) => symbol === "RELIANCE")).toBe(false);
    expect(marketScopedPeers("ZZ", null)).toEqual([]);
  });

  it("declares exactly the supported markets", () => {
    expect(knownMarketIds().sort()).toEqual(["AU", "CA", "DE", "FR", "GB", "HK", "IN", "JP", "SG", "US"]);
    for (const marketId of knownMarketIds()) expect(marketExampleSymbols(marketId).length).toBeGreaterThan(0);
  });
describe("provider symbol mapping (screenshot regression)", () => {
  it("no longer forces an Indian suffix onto every search result", () => {
    // The home screen used `${symbol}.NS` for every selection, so picking a US
    // ticker produced AAPL.NS and the snapshot rendered Indian data.
    expect(providerSymbolForMarket("AAPL", "US")).toBe("AAPL");
    expect(providerSymbolForMarket("MSFT", "US")).toBe("MSFT");
    expect(providerSymbolForMarket("AAPL", "US")).not.toContain(".NS");
  });

  it("applies each market's own primary suffix", () => {
    expect(providerSymbolForMarket("RELIANCE", "IN")).toBe("RELIANCE.NS");
    expect(providerSymbolForMarket("SHEL", "GB")).toBe("SHEL.L");
    expect(providerSymbolForMarket("MC", "FR")).toBe("MC.PA");
    expect(providerSymbolForMarket("7203", "JP")).toBe("7203.T");
    expect(providerSymbolForMarket("SAP", "DE")).toBe("SAP.DE");
    expect(providerSymbolForMarket("RY", "CA")).toBe("RY.TO");
    expect(providerSymbolForMarket("BHP", "AU")).toBe("BHP.AX");
    expect(providerSymbolForMarket("D05", "SG")).toBe("D05.SI");
    expect(providerSymbolForMarket("0700", "HK")).toBe("0700.HK");
  });

  it("never double-suffixes and leaves unknown markets alone", () => {
    expect(providerSymbolForMarket("RELIANCE.NS", "IN")).toBe("RELIANCE.NS");
    expect(providerSymbolForMarket("MC.PA", "US")).toBe("MC.PA");
    expect(providerSymbolForMarket("X", "ZZ")).toBe("X");
  });

  it("returns null for an empty symbol rather than inventing one", () => {
    expect(providerSymbolForMarket("", "US")).toBeNull();
    expect(providerSymbolForMarket(null, "US")).toBeNull();
    expect(providerSymbolForMarket("   ", "IN")).toBeNull();
  });

  it("produces a market-scoped default that is plausible for that market", () => {
    for (const marketId of ["US", "GB", "CA", "AU", "JP", "SG", "HK", "DE", "FR"]) {
      const symbol = defaultSymbolForMarket(marketId)!;
      expect(isSymbolPlausibleForMarket(symbol, marketId)).toBe(true);
    }
  });
});

});
