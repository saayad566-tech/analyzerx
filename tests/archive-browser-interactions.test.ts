import { describe, expect, it } from "vitest";
import { calendarMonthForShortcut } from "../lib/calendar-presets";
import { archiveToCsv, archiveToPdf } from "../server/archive-export";

describe("archive browser interactions", () => {
  it("maps arrow and page keys to UTC-safe month navigation", () => {
    const month = new Date(Date.UTC(2026, 0, 1));
    expect(calendarMonthForShortcut(month, "ArrowLeft").toISOString()).toBe("2025-12-01T00:00:00.000Z");
    expect(calendarMonthForShortcut(month, "ArrowRight").toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(calendarMonthForShortcut(month, "PageUp").toISOString()).toBe("2025-01-01T00:00:00.000Z");
    expect(calendarMonthForShortcut(month, "PageDown").toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("produces downloadable CSV and PDF payloads for a selected archive range", async () => {
    const records = [{
      id: "article-1",
      headline: "Reliance Industries signs verified agreement",
      summary: "Source-grounded archive item",
      source: "Official filing",
      url: "https://example.com/article-1",
      published_at: "2026-08-18T10:00:00.000Z",
      marketId: "IN",
      symbol: "RELIANCE",
      impact_score: 82,
      actionable_impact: "Verified agreement",
      high_impact: true,
      category: "contract",
      sentiment: "Positive" as const,
    }];
    const filters = { marketId: "IN", startDate: "2026-08-18", endDate: "2026-08-19", archiveScope: "All archive" as const, archiveSentiment: "All sentiment" as const, archiveOrder: "Newest first" as const };
    const csv = archiveToCsv(records, filters);
    const pdf = await archiveToPdf(records, filters);
    expect(csv).toContain("RELIANCE");
    expect(csv).toContain("Official filing");
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
