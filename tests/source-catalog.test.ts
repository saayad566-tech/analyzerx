import { describe, expect, it } from "vitest";

import { configuredUrl, getSourceCatalog } from "../server/source-catalog";

describe("source catalog", () => {
  it("contains official filing and market-source entries with provenance metadata", () => {
    const catalog = getSourceCatalog();
    expect(catalog.find((source) => source.key === "nse-announcements")?.organization).toBe("NSE");
    expect(catalog.find((source) => source.key === "nse-fii-dii")?.kind).toBe("report");
    expect(catalog.find((source) => source.key === "nse-shareholding")?.cadence).toBe("quarterly");
  });

  it("rejects malformed URL values that include an environment assignment", () => {
    const previous = process.env.NSE_FII_DII_REPORT_URL;
    process.env.NSE_FII_DII_REPORT_URL = "NSE_FII_DII_REPORT_URL=https://example.invalid/report";
    expect(configuredUrl("NSE_FII_DII_REPORT_URL", "https://fallback.invalid/report")).toBe("https://fallback.invalid/report");
    process.env.NSE_FII_DII_REPORT_URL = previous;
  });

  it("accepts a valid HTTPS source URL", () => {
    const previous = process.env.TEST_SOURCE_URL;
    process.env.TEST_SOURCE_URL = "https://example.com/report";
    expect(configuredUrl("TEST_SOURCE_URL", "https://fallback.invalid/report")).toBe("https://example.com/report");
    process.env.TEST_SOURCE_URL = previous;
  });

  it("does not present licensed OHLC as configured without a provider URL", () => {
    const priceSource = getSourceCatalog().find((source) => source.key === "licensed-market-data");
    expect(priceSource?.requiresAuthorization).toBe(true);
    expect(priceSource?.directMachineReadable).toBe(true);
    expect(priceSource?.configured).toBe(false);
  });
});
