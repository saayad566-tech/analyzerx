import { describe, expect, it } from "vitest";

import { parseNseUniverseCsv } from "../server/nse-universe";

describe("NSE universe parser", () => {
  it("normalizes official equity CSV rows", () => {
    const rows = parseNseUniverseCsv("SYMBOL,NAME OF COMPANY,SERIES,DATE OF LISTING,PAID UP VALUE,MARKET LOT,ISIN NUMBER,FACE VALUE\n20MICRONS,20 Microns Limited,EQ,06-OCT-2008,5,1,INE144J01027,5\n", "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv");
    expect(rows).toEqual([{ symbol: "20MICRONS", name: "20 Microns Limited", series: "EQ", listingDate: "2008-10-06", isin: "INE144J01027", exchange: "NSE", sourceUrl: "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv" }]);
  });

  it("supports quoted company names and ignores incomplete rows", () => {
    const rows = parseNseUniverseCsv("SYMBOL,COMPANY NAME,SERIES,ISIN\nABC,\"A, B Holdings\",EQ,INE000A01000\n,Missing Symbol,EQ,INE000A01001\n", "https://example.com/universe.csv");
    expect(rows).toEqual([{ symbol: "ABC", name: "A, B Holdings", series: "EQ", listingDate: null, isin: "INE000A01000", exchange: "NSE", sourceUrl: "https://example.com/universe.csv" }]);
  });
});
