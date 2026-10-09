import { describe, expect, it } from "vitest";
import { filterAndSortArchiveArticles } from "../lib/news-archive";

const articles = [
  { headline: "Routine update", actionable_impact: "No material change", category: "Markets", sentiment: "Neutral" as const, impact_score: 20, high_impact: false, published_at: "2026-08-18T10:00:00.000Z" },
  { headline: "Earnings beat and contract win", actionable_impact: "Positive catalyst", category: "Earnings", sentiment: "Positive" as const, impact_score: 90, high_impact: true, published_at: "2026-08-19T10:00:00.000Z" },
  { headline: "Regulatory review", actionable_impact: "Potential risk", category: "Regulatory", sentiment: "Negative" as const, impact_score: 65, high_impact: false, published_at: "2026-08-17T10:00:00.000Z" },
];

describe("news archive filters", () => {
  it("filters special events and sentiment independently", () => {
    expect(filterAndSortArchiveArticles(articles, "Special Events", "All sentiment", "Newest first")).toHaveLength(2);
    expect(filterAndSortArchiveArticles(articles, "All archive", "Positive", "Newest first").map((item) => item.headline)).toEqual(["Earnings beat and contract win"]);
    expect(filterAndSortArchiveArticles(articles, "All archive", "Negative", "Newest first").map((item) => item.headline)).toEqual(["Regulatory review"]);
  });

  it("sorts oldest/newest and impact in the selected direction", () => {
    expect(filterAndSortArchiveArticles(articles, "All archive", "All sentiment", "Oldest first")[0].headline).toBe("Regulatory review");
    expect(filterAndSortArchiveArticles(articles, "All archive", "All sentiment", "Impact low → high")[0].impact_score).toBe(20);
    expect(filterAndSortArchiveArticles(articles, "All archive", "All sentiment", "Impact high → low")[0].impact_score).toBe(90);
  });
});
