import { describe, expect, it } from "vitest";
import { isWrongMarketGovernmentArticle } from "../server/optional-providers";
import { canonicalArticleKey } from "../server/news-tracker";

describe("market-isolated government news and canonical deduplication", () => {
  it("rejects a US government announcement from the India panel", () => {
    expect(isWrongMarketGovernmentArticle({ symbol: "MARKET", headline: "US government announces new subsidy scheme", summary: "Washington officials issued the announcement.", url: "https://example.com/us", source: "Example", publishedAt: new Date().toISOString() }, "IN")).toBe(true);
  });

  it("does not reject an India government announcement from the India panel", () => {
    expect(isWrongMarketGovernmentArticle({ symbol: "MARKET", headline: "Indian government announces new infrastructure scheme", summary: "The Ministry of Finance published the details.", url: "https://example.com/in", source: "Example", publishedAt: new Date().toISOString() }, "IN")).toBe(false);
  });

  it("uses one market-symbol-story identity across provider headline suffixes", () => {
    const first = canonicalArticleKey({ marketId: "IN", symbol: "RELIANCE", headline: "Reliance announces expansion - Reuters" });
    const second = canonicalArticleKey({ marketId: "IN", symbol: "RELIANCE", headline: "Reliance announces expansion - Bloomberg" });
    expect(first).toBe(second);
  });
});
