import { describe, expect, it } from "vitest";

import { extractHtmlTables, parseRssItems } from "../server/source-ingestion";

describe("NSE announcements RSS parser", () => {
  it("extracts title, description, link, guid, and publication date", () => {
    const items = parseRssItems(`<rss><channel><item><title><![CDATA[Safe Enterprises]]></title><description>Press release &amp; order</description><link>https://nsearchives.nseindia.com/corporate/SAFE.pdf</link><guid>SAFE-1</guid><pubDate>Mon, 17 Aug 2026 09:41:26 GMT</pubDate></item></channel></rss>`);
    expect(items).toEqual([{ title: "Safe Enterprises", description: "Press release & order", link: "https://nsearchives.nseindia.com/corporate/SAFE.pdf", guid: "SAFE-1", pubDate: "Mon, 17 Aug 2026 09:41:26 GMT" }]);
  });

  it("ignores empty RSS items", () => {
    expect(parseRssItems("<rss><item><title></title><description></description></item></rss>")).toEqual([]);
  });

  it("normalizes visible HTML table cells without inventing values", () => {
    expect(extractHtmlTables("<table><tr><th>Symbol</th><th>Purpose</th></tr><tr><td>NBCC</td><td>Dividend - Rs 1</td></tr></table>")).toEqual([[["Symbol", "Purpose"], ["NBCC", "Dividend - Rs 1"]]]);
  });
});
