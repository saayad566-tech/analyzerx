import { describe, expect, it } from "vitest";
import { archiveToCsv, archiveToPdf, filterArchiveExportArticles } from "../server/archive-export";
import { classifyMarketCap, marketCapBandLabel } from "../lib/market-cap";

type TestArticle = {
  id: string; marketId: string; symbol: string; headline: string; summary: string; sentiment: "Positive" | "Neutral" | "Negative"; actionable_impact: string; url: string; source: string; published_at: string; impact_score: number; high_impact: boolean; category: string;
};

const filters = { marketId: "IN", marketLabel: "India", symbol: "TINY.NS", startDate: "2026-06-01", endDate: "2026-08-29", archiveScope: "All archive" as const, archiveSentiment: "All sentiment" as const, archiveOrder: "Newest first" as const };
const article: TestArticle = { id: "1", marketId: "IN", symbol: "TINY.NS", headline: "=HYPERLINK(\"https://example.com\",\"Source\")", summary: "Verified summary", sentiment: "Positive", actionable_impact: "Contract win", url: "https://example.com/news", source: "Official filing", published_at: "2026-08-19T10:00:00.000Z", impact_score: 92, high_impact: true, category: "Finance" };

describe("archive exports", () => {
  it("keeps filters and escapes CSV formula-like headlines", () => {
    const csv = archiveToCsv([article], filters);
    expect(csv).toContain("AnalyzerX historical news archive");
    expect(csv).toContain("\"'=HYPERLINK(\"\"https://example.com\"\",\"\"Source\"\")\"");
    expect(csv).toContain("https://example.com/news");
  });

  it("filters special-event and sentiment selections deterministically", () => {
    const negative = { ...article, id: "2", sentiment: "Negative" as const, high_impact: false, actionable_impact: "Routine update" };
    expect(filterArchiveExportArticles([article, negative], { archiveScope: "Special Events", archiveSentiment: "Positive", archiveOrder: "Impact high → low" })).toHaveLength(1);
    expect(filterArchiveExportArticles([article, negative], { archiveScope: "All archive", archiveSentiment: "All sentiment", archiveOrder: "Oldest first" })[0].id).toBe("1");
  });

  it("creates a readable PDF payload even for an empty verified range", async () => {
    const pdf = await archiveToPdf([], filters);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });
});

describe("market-cap taxonomy", () => {
  it("covers penny/micro through large cap and preserves unknown", () => {
    expect(marketCapBandLabel(classifyMarketCap("IN", 100))).toBe("Penny / Micro-cap");
    expect(marketCapBandLabel(classifyMarketCap("IN", 10_000))).toBe("Small-cap");
    expect(marketCapBandLabel(classifyMarketCap("IN", 50_000))).toBe("Mid-cap");
    expect(marketCapBandLabel(classifyMarketCap("IN", 200_000))).toBe("Large-cap");
    expect(classifyMarketCap("IN", null)).toBe("unknown");
    expect(classifyMarketCap("UNKNOWN", 100)).toBe("unknown");
  });
});
