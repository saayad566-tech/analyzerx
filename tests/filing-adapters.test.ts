import { describe, expect, it } from "vitest";
import { filterFilingsForSymbol, normalizeValidatedFiling } from "../server/filing-adapters";
import type { SourceRecord } from "../drizzle/schema";

const base: SourceRecord = {
  marketId: "IN",
  id: "nse-record-1", sourceKey: "nse-announcements-rss", sourceUrl: "https://www.nseindia.com/companies-listing/corporate-filings-announcements", documentName: "Online announcements.xml", recordType: "corporate-announcement", externalId: "x1", symbol: "RELIANCE", title: "Reliance announces a new project", reportDate: null, publishedAt: new Date("2026-08-18T06:00:00Z"), retrievedAt: new Date("2026-08-18T07:00:00Z"), freshnessStatus: "fresh", rawPayload: "{}", normalizedPayload: JSON.stringify({ title: "Reliance announces a new project", description: "Official announcement", publishedAt: "2026-08-18T06:00:00Z" }), errorMessage: null, dataHash: "hash", parserVersion: "nse-rss-v1", supersedesId: null, createdAt: new Date("2026-08-18T07:00:00Z"),
};

describe("validated filing adapters", () => {
  it("normalizes an official NSE record with lineage and verified evidence state", () => {
    const filing = normalizeValidatedFiling(base);
    expect(filing?.symbol).toBe("RELIANCE");
    expect(filing?.sourceKey).toBe("nse-announcements-rss");
    expect(filing?.sourceUrl).toContain("nseindia.com");
    expect(filing?.evidenceStatus).toBe("verified");
    expect(filing?.parserVersion).toBe("nse-rss-v1");
  });

  it("rejects non-official records and filters by exact symbol or explicit text", () => {
    expect(normalizeValidatedFiling({ ...base, sourceKey: "random-blog", sourceUrl: "https://example.com", symbol: "RELIANCE" })).toBeNull();
    expect(filterFilingsForSymbol([base], "RELIANCE")).toHaveLength(1);
    expect(filterFilingsForSymbol([base], "TCS")).toHaveLength(0);
  });
});
