import { describe, expect, it } from "vitest";
import { fallbackExtraction, getMaxArticlesPerPoll, isPermanentLlmFailure, labelMarketContextArticle, scoreArticle, sortTrackedNews } from "../server/news-tracker";

describe("server news tracker", () => {
  it("filters to the requested stock and sorts by impact high-to-low", () => {
    const base = { id: "", category: "Markets" as const, summary: "", key_entities: [], sentiment: "Neutral" as const, actionable_impact: "None", url: "https://example.com", source: "Test", published_at: "2026-08-17T00:00:00.000Z", high_impact: false };
    const ranked = sortTrackedNews([
      { ...base, id: "low", symbol: "TCS", headline: "Lower", impact_score: 40 },
      { ...base, id: "other", symbol: "INFY", headline: "Other", impact_score: 100 },
      { ...base, id: "high", symbol: "TCS", headline: "Higher", impact_score: 90 },
    ], "TCS");
    expect(ranked.map((item) => item.id)).toEqual(["high", "low"]);
  });
  it("produces the required structured extraction fields without mock market values", () => {
    const result = fallbackExtraction({
      symbol: "INFY",
      headline: "Infosys wins a large technology contract",
      summary: "The company announced a new multi-year contract.",
      url: "https://example.com/infy-contract",
      source: "Test source",
      publishedAt: "2026-08-16T10:00:00.000Z",
    });
    expect(result.symbol).toBe("INFY");
    expect(result.headline).toContain("Infosys");
    expect(result.key_entities).toContain("INFY");
    expect(result.sentiment).toBe("Positive");
    expect(result.summary).toBe("The company announced a new multi-year contract.");
    expect(result.impact_score).toBeGreaterThanOrEqual(70);
    expect(result.id).toHaveLength(64);
  });

  it("keeps neutral articles below the high-impact alert threshold", () => {
    const result = fallbackExtraction({
      symbol: "TCS",
      headline: "TCS schedules its quarterly board meeting",
      summary: "The meeting date was disclosed in a routine filing.",
      url: "https://example.com/tcs-board",
      source: "Test source",
      publishedAt: "2026-08-16T10:00:00.000Z",
    });
    expect(result.sentiment).toBe("Neutral");
    expect(result.high_impact).toBe(false);
    expect(result.impact_score).toBeLessThan(90);
  });

  it("caps positive catalyst scores at 100", () => {
    expect(scoreArticle("Positive", "earnings beat, contract win, approval, expansion, and buyback")).toBe(95);
    expect(scoreArticle("Neutral", "None")).toBe(25);
  });

  it("uses a bounded per-poll article cap", () => {
    const original = process.env.NEWS_TRACKER_MAX_ARTICLES_PER_POLL;
    process.env.NEWS_TRACKER_MAX_ARTICLES_PER_POLL = "5000";
    expect(getMaxArticlesPerPoll()).toBe(200);
    process.env.NEWS_TRACKER_MAX_ARTICLES_PER_POLL = "2";
    expect(getMaxArticlesPerPoll()).toBe(10);
    if (original === undefined) delete process.env.NEWS_TRACKER_MAX_ARTICLES_PER_POLL;
    else process.env.NEWS_TRACKER_MAX_ARTICLES_PER_POLL = original;
  });

  it("classifies permanent LLM account failures for cooldown without treating timeouts as permanent", () => {
    expect(isPermanentLlmFailure(new Error("412 Precondition Failed: your account has hit a usage exhausted limit"))).toBe(true);
    expect(isPermanentLlmFailure(new Error("401 Unauthorized: invalid credential"))).toBe(true);
    expect(isPermanentLlmFailure(new Error("LLM extraction timed out after 8000ms"))).toBe(false);
  });

  it("labels global market context without presenting it as company-specific evidence", () => {
    const labeled = labelMarketContextArticle({ symbol: "MARKET", headline: "Crude oil moves higher", summary: null, url: "https://example.com/crude", source: "Google News", publishedAt: "2026-08-17T00:00:00.000Z" }, "RELIANCE");
    expect(labeled.symbol).toBe("RELIANCE");
    expect(labeled.source).toContain("Market context");
  });
});
