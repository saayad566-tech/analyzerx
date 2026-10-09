import { describe, expect, it } from "vitest";
import { filterAndSortArchiveArticles } from "../lib/news-archive";

const articles = [
  { headline: "Positive contract win", actionable_impact: "Contract win", category: "Markets", sentiment: "Positive" as const, impact_score: 88, high_impact: true, published_at: "2026-08-17T10:00:00.000Z", id: "positive" },
  { headline: "Routine filing", actionable_impact: "None", category: "Finance", sentiment: "Neutral" as const, impact_score: 25, high_impact: false, published_at: "2026-08-16T10:00:00.000Z", id: "neutral" },
  { headline: "Negative margin warning", actionable_impact: "Guidance risk", category: "Finance", sentiment: "Negative" as const, impact_score: 64, high_impact: true, published_at: "2026-08-15T10:00:00.000Z", id: "negative" },
];

describe("news archive filters", () => {
  it("filters positive, neutral, and negative sentiment independently", () => {
    expect(filterAndSortArchiveArticles(articles, "All archive", "Positive", "Newest first").map((item) => item.id)).toEqual(["positive"]);
    expect(filterAndSortArchiveArticles(articles, "All archive", "Neutral", "Newest first").map((item) => item.id)).toEqual(["neutral"]);
    expect(filterAndSortArchiveArticles(articles, "All archive", "Negative", "Newest first").map((item) => item.id)).toEqual(["negative"]);
  });

  it("combines sentiment with Special Events and impact ordering", () => {
    expect(filterAndSortArchiveArticles(articles, "Special Events", "All sentiment", "Impact low → high").map((item) => item.id)).toEqual(["negative", "positive"]);
    expect(filterAndSortArchiveArticles(articles, "Special Events", "Positive", "Oldest first").map((item) => item.id)).toEqual(["positive"]);
  });
});
