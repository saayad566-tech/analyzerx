import { describe, expect, it } from "vitest";

import { parseGoogleNewsRss } from "../server/optional-providers";

describe("Google News RSS parser", () => {
  it("extracts headline, redirect link, publication date, source, and symbol", () => {
    const items = parseGoogleNewsRss(`<?xml version="1.0"?><rss><channel><item><title><![CDATA[RELIANCE announces expansion - Example Finance]]></title><link>https://news.google.com/rss/articles/abc</link><pubDate>Mon, 17 Aug 2026 09:41:26 GMT</pubDate><source url="https://example.com">Example Finance</source></item></channel></rss>`, "RELIANCE");
    expect(items).toEqual([{ symbol: "RELIANCE", headline: "RELIANCE announces expansion", summary: null, url: "https://news.google.com/rss/articles/abc", source: "Example Finance", publishedAt: "2026-08-17T09:41:26.000Z" }]);
  });

  it("handles missing optional source and invalid publication date without inventing the source link", () => {
    const before = Date.now();
    const items = parseGoogleNewsRss("<rss><channel><item><title>Headline only</title><link>https://news.google.com/rss/articles/xyz</link><pubDate>not-a-date</pubDate></item></channel></rss>", "TCS");
    const after = Date.now();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ symbol: "TCS", headline: "Headline only", url: "https://news.google.com/rss/articles/xyz", source: "Google News" });
    expect(new Date(items[0].publishedAt).getTime()).toBeGreaterThanOrEqual(before);
    expect(new Date(items[0].publishedAt).getTime()).toBeLessThanOrEqual(after);
  });

  it("ignores entries without a title or link", () => {
    expect(parseGoogleNewsRss("<rss><channel><item><title>Missing link</title></item><item><link>https://example.com</link></item></channel></rss>", "INFY")).toEqual([]);
  });
});
