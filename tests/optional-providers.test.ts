import { afterEach, describe, expect, it, vi } from "vitest";

describe("optional provider isolation", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("parses GDELT articles with source provenance", async () => {
    const { parseGdeltArticles } = await import("../server/optional-providers");
    const articles = parseGdeltArticles({ articles: [{ title: "Global markets update", url: "https://example.com/markets", domain: "example.com", seendate: "20260819T131500Z" }] }, "MARKET");
    expect(articles).toHaveLength(1);
    expect(articles[0]?.source).toBe("example.com");
    expect(articles[0]?.publishedAt).toBe("2026-08-19T13:15:00.000Z");
  });

  it("keeps valid NewsData results when MarketAux fails", async () => {
    process.env.ENABLE_GOOGLE_NEWS_RSS = "false";
    process.env.MARKETAUX_API_TOKEN = "test-marketaux";
    process.env.NEWSDATA_API_KEY = "test-newsdata";
    process.env.NEWS_API_KEY = undefined;
    process.env.ENABLE_NEWS_API = "false";
    process.env.GNEWS_API_KEY = undefined;

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("marketaux.com")) return new Response("quota exhausted", { status: 402 });
      if (url.includes("api.gdeltproject.org")) {
        return new Response(JSON.stringify({ articles: [{ title: "Reliance reports stronger revenue growth", url: "https://example.com/gdelt-reliance", domain: "example.com", seendate: "20260819T100000Z" }] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("newsdata.io")) {
        return new Response(JSON.stringify({ results: [{ title: "Reliance reports stronger revenue growth", link: "https://example.com/reliance", description: "Verified provider response", source_name: "NewsData", pubDate: "2026-08-17T10:00:00Z" }] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
    }));

    const { fetchOptionalNews } = await import("../server/optional-providers");
    const articles = await fetchOptionalNews(["RELIANCE"], "IN");

    expect(articles).toHaveLength(2);
    expect(articles.map((article) => article.source)).toEqual(expect.arrayContaining(["NewsData.io", "example.com"]));
    expect(articles[0]?.symbol).toBe("RELIANCE");
  });
});
