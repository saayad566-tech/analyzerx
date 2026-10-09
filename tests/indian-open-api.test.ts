import { describe, expect, it } from "vitest";
import { normalizeIndianOpenQuote, normalizeIndianOpenSearch } from "../server/indian-open-api";

describe("Indian Stock Market API adapter", () => {
  it("normalizes documented quote and fundamentals fields", () => {
    const normalized = normalizeIndianOpenQuote({
      status: "success",
      symbol: "ITC",
      exchange: "NSE",
      ticker: "ITC.NS",
      data: {
        company_name: "ITC Limited",
        last_price: 445.5,
        change: 2.3,
        percent_change: 0.52,
        pe_ratio: 28.45,
        dividend_yield: 3.45,
        book_value: 156.5,
        earnings_per_share: 15.65,
        sector: "Consumer Defensive",
        timestamp: "2026-08-17T08:00:00Z",
      },
    });
    expect(normalized.quote.current).toBe(445.5);
    expect(normalized.quote.changePercent).toBe(0.52);
    expect(normalized.fundamentals.pe).toBe(28.45);
    expect(normalized.fundamentals.earningsPerShare).toBe(15.65);
    expect(normalized.fundamentals.companyName).toBe("ITC Limited");
  });

  it("normalizes documented search results without inventing matches", () => {
    expect(normalizeIndianOpenSearch({ status: "success", results: [{ symbol: "TCS.NS", company_name: "Tata Consultancy Services Limited" }] })).toEqual([
      { symbol: "TCS", name: "Tata Consultancy Services Limited", exchange: "NSE/BSE", source: "Indian Stock Market API (0xramm)" },
    ]);
    expect(normalizeIndianOpenSearch({ status: "success", results: [] })).toEqual([]);
  });
});
