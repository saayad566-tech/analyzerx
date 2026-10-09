import { describe, expect, it } from "vitest";
import { fallbackExtraction, resolveHistoricalArchiveRange } from "../server/news-tracker";

describe("historical news archive ranges", () => {
  const now = new Date("2026-08-19T12:00:00.000Z");

  it("accepts an inclusive custom date range with an exclusive end boundary", () => {
    const range = resolveHistoricalArchiveRange({ startDate: "2026-06-01", endDate: "2026-06-30", now });
    expect("error" in range).toBe(false);
    if (!("error" in range)) {
      expect(range.startDate).toBe("2026-06-01");
      expect(range.endDate).toBe("2026-06-30");
      expect(range.days).toBe(30);
      expect(range.to?.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    }
  });

  it("rejects incomplete, reversed, future, malformed, and over-one-year ranges", () => {
    expect(resolveHistoricalArchiveRange({ startDate: "2026-06-01", now })).toEqual({ error: "Select both a start date and an end date." });
    expect(resolveHistoricalArchiveRange({ startDate: "2026-07-01", endDate: "2026-06-01", now })).toEqual({ error: "End date must be on or after the start date." });
    expect(resolveHistoricalArchiveRange({ startDate: "2026-08-20", endDate: "2026-08-20", now })).toEqual({ error: "The archive cannot include future dates." });
    expect(resolveHistoricalArchiveRange({ startDate: "2026-02-30", endDate: "2026-03-01", now })).toEqual({ error: "Use valid calendar dates in YYYY-MM-DD format." });
    expect(resolveHistoricalArchiveRange({ startDate: "2015-01-01", endDate: "2026-08-01", now })).toEqual({ error: "Custom archive ranges are limited to ten years for performance and provider-coverage safety." });
  });

  it("keeps preset windows bounded when no custom dates are supplied", () => {
    const range = resolveHistoricalArchiveRange({ days: 365, now });
    expect("error" in range).toBe(false);
    if (!("error" in range)) expect(range.days).toBe(365);
  });

  it("supports a nine-month preset without collapsing to the current day", () => {
    const range = resolveHistoricalArchiveRange({ days: 270, now });
    expect("error" in range).toBe(false);
    if (!("error" in range)) {
      expect(range.days).toBe(270);
      expect(range.from.toISOString()).toBe("2025-11-22T12:00:00.000Z");
      expect(range.to).toBeUndefined();
    }
  });

  it("accepts multi-year custom ranges within the operational ceiling", () => {
    const range = resolveHistoricalArchiveRange({ startDate: "2020-01-01", endDate: "2026-08-01", now });
    expect("error" in range).toBe(false);
    if (!("error" in range)) {
      expect(range.startDate).toBe("2020-01-01");
      expect(range.endDate).toBe("2026-08-01");
      expect(range.days).toBeGreaterThan(2000);
    }
  });

  it("preserves Unicode source headlines exactly in fallback extraction", () => {
    const article = fallbackExtraction({ marketId: "IN", symbol: "TEST", headline: "इकलौता लोहार की कलाकार", summary: "मूल स्रोत शीर्षक", url: "https://example.com/story", source: "source-test", publishedAt: "2026-08-18T10:00:00.000Z" });
    expect(article.headline).toBe("इकलौता लोहार की कलाकार");
  });
});
