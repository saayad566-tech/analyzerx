import { describe, expect, it } from "vitest";

import {
  formatForMarket,
  formatMarketCompact,
  formatMarketCurrency,
  formatMarketDate,
  formatMarketNumber,
  formatMarketTime,
  usesIndianGrouping,
} from "../lib/market-format";
import {
  exchangeLocalParts,
  isMarketTrading,
  marketStatus,
  sessionForMarket,
} from "../lib/market-session";
import {
  activeStoreKey,
  marketStoreKey,
  namespaceStoredKeys,
  partitionByMarket,
  recordSearch,
  searchSuggestions,
  userMarketStoreKey,
  type SearchEntry,
} from "../lib/market-scoped-store";
import { SUPPORTED_MARKET_IDS } from "../lib/market-registry";

// 2026-10-14 is a Wednesday.
const WED = Date.UTC(2026, 9, 14);
const at = (h: number, m = 0) => WED + h * 3_600_000 + m * 60_000;

describe("market formatting — currency", () => {
  it("uses the market's own currency symbol", () => {
    expect(formatMarketCurrency(1234.5, "IN")).toBe("\u20b91,234.50");
    expect(formatMarketCurrency(1234.5, "US")).toBe("$1,234.50");
    expect(formatMarketCurrency(1234.5, "GB")).toBe("\u00a31,234.50");
    expect(formatMarketCurrency(1234.5, "JP")).toBe("\u00a51,234.50");
    expect(formatMarketCurrency(1234.5, "DE")).toBe("\u20ac1,234.50");
    expect(formatMarketCurrency(1234.5, "HK")).toBe("HK$1,234.50");
  });

  it("never shows a rupee sign on a US figure, or vice versa", () => {
    expect(formatMarketCurrency(100, "US")).not.toContain("\u20b9");
    expect(formatMarketCurrency(100, "IN")).not.toContain("$");
  });

  it("supports an explicit ISO-code style", () => {
    expect(formatMarketCurrency(1000, "IN", { style: "code", decimals: 0 })).toBe("1,000 INR");
    expect(formatMarketCurrency(1000, "US", { style: "code", decimals: 0 })).toBe("1,000 USD");
  });

  it("handles null, undefined and non-finite values honestly", () => {
    expect(formatMarketCurrency(null, "US")).toBe("\u2014");
    expect(formatMarketCurrency(undefined, "IN")).toBe("\u2014");
    expect(formatMarketCurrency(Number.NaN, "US")).toBe("\u2014");
    expect(formatMarketCurrency(Number.POSITIVE_INFINITY, "IN")).toBe("\u2014");
  });

  it("formats negatives with a leading sign", () => {
    expect(formatMarketCurrency(-1234.5, "US")).toBe("-$1,234.50");
  });
});

describe("market formatting — number grouping", () => {
  it("groups digits the Indian way for India", () => {
    expect(formatMarketNumber(1234567, "IN")).toBe("12,34,567.00");
    expect(formatMarketNumber(1234, "IN")).toBe("1,234.00");
    expect(formatMarketNumber(12345, "IN")).toBe("12,345.00");
    expect(formatMarketNumber(12345678, "IN")).toBe("1,23,45,678.00");
  });

  it("groups digits the international way everywhere else", () => {
    expect(formatMarketNumber(1234567, "US")).toBe("1,234,567.00");
    expect(formatMarketNumber(12345678, "GB")).toBe("12,345,678.00");
    expect(formatMarketNumber(1234, "DE")).toBe("1,234.00");
  });

  it("honours decimals and the grouped flag", () => {
    expect(formatMarketNumber(1234.5678, "US", { decimals: 0 })).toBe("1,235");
    expect(formatMarketNumber(1234.5, "US", { grouped: false })).toBe("1234.50");
  });

  it("knows which markets use Indian grouping", () => {
    expect(usesIndianGrouping("IN")).toBe(true);
    expect(usesIndianGrouping("US")).toBe(false);
  });
});

describe("market formatting — compact scale words", () => {
  it("uses lakh and crore for India", () => {
    expect(formatMarketCompact(25000000, "IN")).toBe("\u20b92.50 Cr");
    expect(formatMarketCompact(250000, "IN")).toBe("\u20b92.50 L");
  });

  it("uses million and billion elsewhere", () => {
    expect(formatMarketCompact(25000000, "US")).toBe("$25.00 M");
    expect(formatMarketCompact(2500000000, "US")).toBe("$2.50 B");
    expect(formatMarketCompact(2500, "GB")).toBe("\u00a32.50 K");
  });

  it("falls back to the full currency below the smallest scale", () => {
    expect(formatMarketCompact(250, "US")).toBe("$250.00");
    expect(formatMarketCompact(250, "IN")).toBe("\u20b9250.00");
  });

  it("never puts a crore label on a US amount", () => {
    expect(formatMarketCompact(25000000, "US")).not.toContain("Cr");
    expect(formatMarketCompact(25000000, "US")).not.toContain("L");
  });
});

describe("market formatting — dates and times", () => {
  it("uses day-first dates for India and month-first for the US", () => {
    const parts = { year: 2026, month: 10, day: 14 };
    expect(formatMarketDate(parts, "IN")).toBe("14/10/2026");
    expect(formatMarketDate(parts, "US")).toBe("10/14/2026");
  });

  it("pads the clock and clamps out-of-range values", () => {
    expect(formatMarketTime(9, 5)).toBe("09:05");
    expect(formatMarketTime(23, 59)).toBe("23:59");
    expect(formatMarketTime(25, 61)).toBe("23:59");
  });

  it("exposes the market's locale and timezone", () => {
    expect(formatForMarket("IN").timeZone).toBe("Asia/Kolkata");
    expect(formatForMarket("US").timeZone).toBe("America/New_York");
    expect(formatForMarket("IN").currencyCode).toBe("INR");
  });
});

describe("market session — status in the exchange's timezone", () => {
  it("reports India open at 10:00 IST", () => {
    const report = marketStatus(at(4, 30), "IN"); // 04:30 UTC = 10:00 IST
    expect(report.status).toBe("open");
    expect(report.isTrading).toBe(true);
    expect(report.localTime).toBe("10:00");
    expect(report.localDate).toBe("2026-10-14");
  });

  it("does not let the device's own timezone decide the status", () => {
    // 10:00 IST is 00:30 in New York, where the market is closed.
    const instant = at(4, 30);
    expect(marketStatus(instant, "IN").status).toBe("open");
    expect(marketStatus(instant, "US").status).toBe("closed");
    // And the reverse: 10:00 in New York is 19:30 in India.
    const other = at(14, 0);
    expect(marketStatus(other, "US").status).toBe("open");
    expect(marketStatus(other, "IN").status).toBe("closed");
  });

  it("reports US pre-market and post-market windows", () => {
    expect(marketStatus(at(12, 0), "US").status).toBe("pre-market"); // 08:00 ET
    expect(marketStatus(at(21, 0), "US").status).toBe("post-market"); // 17:00 ET
  });

  it("reports the mid-session break for markets that have one", () => {
    expect(marketStatus(at(1, 0), "JP").status).toBe("open"); // 10:00 JST
    expect(marketStatus(at(3, 0), "JP").status).toBe("break"); // 12:00 JST
    // HK's break is 12:00-13:00, so 11:00 is still open and 12:15 is the break.
    expect(marketStatus(at(3, 0), "HK").status).toBe("open"); // 11:00 HKT
    expect(marketStatus(at(4, 15), "HK").status).toBe("break"); // 12:15 HKT
  });

  it("reports the weekend using the exchange's local weekday", () => {
    const saturday = Date.UTC(2026, 9, 17, 14, 0);
    for (const marketId of SUPPORTED_MARKET_IDS) {
      expect(marketStatus(saturday, marketId).status).toBe("weekend");
      expect(marketStatus(saturday, marketId).isTrading).toBe(false);
    }
  });

  it("never reports trading outside regular hours", () => {
    for (const marketId of SUPPORTED_MARKET_IDS) {
      for (const hour of [0, 3, 6, 9, 12, 15, 18, 21]) {
        const report = marketStatus(at(hour), marketId);
        if (report.status !== "open") expect(report.isTrading).toBe(false);
      }
    }
  });

  it("resolves timezone parts with DST handled by Intl", () => {
    const summer = exchangeLocalParts(Date.UTC(2026, 6, 15, 14, 0), "America/New_York");
    const winter = exchangeLocalParts(Date.UTC(2026, 0, 15, 14, 0), "America/New_York");
    expect(summer?.hour).toBe(10); // EDT, UTC-4
    expect(winter?.hour).toBe(9); // EST, UTC-5
  });

  it("exposes the session definition and a trading predicate", () => {
    expect(sessionForMarket("IN").timeZone).toBe("Asia/Kolkata");
    expect(sessionForMarket("IN").regular[0].openMinute).toBe(9 * 60 + 15);
    expect(sessionForMarket("JP").regular.length).toBe(2);
    expect(isMarketTrading(at(4, 30), "IN")).toBe(true);
    expect(isMarketTrading(at(4, 30), "US")).toBe(false);
  });

  it("gives every supported market a labelled, reasoned report", () => {
    for (const marketId of SUPPORTED_MARKET_IDS) {
      const report = marketStatus(at(4, 30), marketId);
      expect(report.marketId).toBe(marketId);
      expect(report.label.length).toBeGreaterThan(0);
      expect(report.reason.length).toBeGreaterThan(10);
      expect(report.localTime).toMatch(/^\d{2}:\d{2}$/);
    }
  });
});

describe("market-scoped store — keys", () => {
  it("namespaces device history by market", () => {
    expect(marketStoreKey("IN", "searches")).toBe("user_history:IN:searches");
    expect(marketStoreKey("US", "recents")).toBe("user_history:US:recents");
    expect(marketStoreKey("in", "watchlist")).toBe("user_history:IN:watchlist");
  });

  it("scopes signed-in data by both user and market", () => {
    expect(userMarketStoreKey("u_42", "US", "watchlist")).toBe("user:u_42:watchlist:US");
    expect(userMarketStoreKey("u_42", "IN", "watchlist")).not.toBe(userMarketStoreKey("u_42", "US", "watchlist"));
    expect(userMarketStoreKey("u_1", "US", "alerts")).not.toBe(userMarketStoreKey("u_2", "US", "alerts"));
  });

  it("refuses an unscoped key", () => {
    expect(() => marketStoreKey("", "searches")).toThrow();
    expect(() => userMarketStoreKey("", "US", "alerts")).toThrow();
    expect(() => userMarketStoreKey("u_1", "", "alerts")).toThrow();
  });

  it("chooses the right key for the session", () => {
    expect(activeStoreKey("US", "searches")).toBe("user_history:US:searches");
    expect(activeStoreKey("US", "searches", "u_9")).toBe("user:u_9:searches:US");
  });
});

describe("market-scoped store — history isolation", () => {
  const history: SearchEntry[] = [
    { market: "IN", query: "TATA", at: 10 },
    { market: "US", query: "AAPL", at: 20 },
    { market: "IN", query: "RELIANCE", at: 30 },
    { market: "US", query: "MSFT", at: 40 },
  ];

  it("partitions records by market and drops unscoped rows", () => {
    expect(partitionByMarket(history, "IN", (e) => e.market).map((e) => e.query)).toEqual(["TATA", "RELIANCE"]);
    expect(partitionByMarket([...history, { market: null as unknown as string, query: "GHOST", at: 1 }], "US", (e) => e.market).map((e) => e.query)).toEqual(["AAPL", "MSFT"]);
    expect(partitionByMarket(history, "ZZ", (e) => e.market)).toEqual([]);
    expect(partitionByMarket(null, "US", (e: SearchEntry) => e.market)).toEqual([]);
  });

  it("never surfaces an Indian search in the US history", () => {
    const usOnly = partitionByMarket(history, "US", (e) => e.market);
    expect(usOnly.some((entry) => entry.query === "TATA")).toBe(false);
    const suggestions = searchSuggestions(history, "US", "");
    expect(suggestions).toEqual(["MSFT", "AAPL"]);
    expect(suggestions).not.toContain("TATA");
  });

  it("records a search into the market's own bucket, newest first", () => {
    const after = recordSearch(history, "IN", "HDFC", 50);
    expect(after[0]).toEqual({ market: "IN", query: "HDFC", at: 50 });
    // The result is the IN bucket only — US entries are correctly NOT carried over.
    expect(after.every((entry) => entry.market === "IN")).toBe(true);
    expect(after.some((entry) => entry.query === "AAPL")).toBe(false);
    expect(after.length).toBe(3);
  });

  it("de-duplicates case-insensitively and caps the list", () => {
    const after = recordSearch(history, "IN", "tata", 60);
    expect(after.filter((entry) => entry.market === "IN" && entry.query.toLowerCase() === "tata").length).toBe(1);
    expect(after[0].at).toBe(60);
    let growing: SearchEntry[] = [];
    for (let index = 0; index < 30; index += 1) growing = recordSearch(growing, "US", `SYM${index}`, index, 5);
    expect(growing.length).toBe(5);
  });

  it("filters suggestions by prefix within the market only", () => {
    expect(searchSuggestions(history, "IN", "rel")).toEqual(["RELIANCE"]);
    expect(searchSuggestions(history, "US", "rel")).toEqual([]);
    expect(searchSuggestions(history, "US", "", 1)).toEqual(["MSFT"]);
  });

  it("ignores empty queries and unscoped markets when recording", () => {
    expect(recordSearch(history, "IN", "   ", 99)).toEqual(history);
    expect(recordSearch(history, "", "X", 99)).toEqual(history);
  });

  it("namespaces a legacy flat map into the market bucket", () => {
    expect(namespaceStoredKeys({ a: 1 }, "US", "searches")).toEqual({ "user_history:US:searches:a": 1 });
    expect(namespaceStoredKeys(null, "US", "searches")).toEqual({});
  });
});
