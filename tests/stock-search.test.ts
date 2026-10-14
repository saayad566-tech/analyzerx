import { describe, expect, it } from "vitest";
import { createDirectStockResultForMarket, isValidDirectStockSymbol, normalizeStockSymbol, rankStockMatches, type StockSearchResult } from "../lib/stock-search";

const universe: StockSearchResult[] = [
  { symbol: "ADANIENT", name: "Adani Enterprises Limited", sector: "Diversified", exchange: "NSE", source: "Indian API" },
  { symbol: "ADANIPORTS", name: "Adani Ports and Special Economic Zone Limited", sector: "Infrastructure", exchange: "NSE", source: "Indian API" },
  { symbol: "HDFCBANK", name: "HDFC Bank Limited", sector: "Financials", exchange: "NSE", source: "Finnhub" },
  { symbol: "INFY.NS", name: "Infosys Limited", sector: "IT services", exchange: "NSE", source: "Finnhub" },
];

describe("broad stock search", () => {
  it("normalizes exchange prefixes and suffixes", () => {
    expect(normalizeStockSymbol("NSE:INFY.NS")).toBe("INFY");
    expect(normalizeStockSymbol("bse:500325.BO")).toBe("500325");
  });

  it("matches partial company names and tickers with prefix priority", () => {
    expect(rankStockMatches(universe, "Adani", 12).map((stock) => stock.symbol)).toEqual(["ADANIENT", "ADANIPORTS"]);
    expect(rankStockMatches(universe, "AD", 12).map((stock) => stock.symbol)).toEqual(["ADANIENT", "ADANIPORTS"]);
    expect(rankStockMatches(universe, "hdfc", 12)[0]?.symbol).toBe("HDFCBANK");
  });

  it("deduplicates the same symbol returned by multiple providers", () => {
    const results = rankStockMatches([...universe, { ...universe[0], source: "Finnhub" }], "ADANI", 12);
    expect(results.filter((stock) => stock.symbol === "ADANIENT")).toHaveLength(1);
  });

  it("returns no results for an unknown query", () => {
    expect(rankStockMatches(universe, "ZZZZ", 12)).toEqual([]);
  });

  it("accepts a valid exact ticker even when autocomplete has no row", () => {
    expect(isValidDirectStockSymbol("TATASTBLSL")).toBe("TATASTBLSL");
    expect(createDirectStockResultForMarket("TATASTBLSL", "IN")).toMatchObject({ symbol: "TATASTBLSL", name: "TATASTBLSL", source: "Market-aware direct lookup", exchange: "NSE" });
  });

  it("uses the selected market exchange and country context for direct lookups", () => {
    expect(createDirectStockResultForMarket("SAP.DE", "DE")).toMatchObject({ symbol: "SAP.DE", exchange: "XETRA", sector: "Germany equities" });
    expect(createDirectStockResultForMarket("AAPL", "US")).toMatchObject({ symbol: "AAPL", exchange: "NYSE", sector: "United States equities" });
  });

  it("rejects free-form text as a direct ticker", () => {
    expect(createDirectStockResultForMarket("Tata Steel", "IN")).toBeNull();
    expect(createDirectStockResultForMarket("***", "IN")).toBeNull();
  });
});
