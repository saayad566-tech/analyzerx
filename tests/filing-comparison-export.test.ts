import { describe, expect, it } from "vitest";
import { buildFilingComparison, filingComparisonToMarkdown } from "../server/filing-comparison";

describe("filing comparison export", () => {
  it("preserves market, date range, units, and source provenance in Markdown", () => {
    const result = buildFilingComparison({
      AAPL: [{ symbol: "AAPL", sourceKey: "sec-company-facts", normalizedPayload: JSON.stringify({ facts: [{ tag: "Revenues", value: 100, unit: "USD", end: "2024-12-31", filed: "2025-02-01", form: "10-K" }] }) }],
      MSFT: [],
    }, { symbols: ["AAPL", "MSFT"], from: "2024-01-01", to: "2024-12-31", forms: ["10-K"], metrics: ["Revenues"] });
    const markdown = filingComparisonToMarkdown({ ...result, marketId: "US", marketLabel: "United States" });
    expect(markdown).toContain("**Market:** United States");
    expect(markdown).toContain("2024-01-01 to 2024-12-31");
    expect(markdown).toContain("| AAPL | Revenues | 100 | USD |");
    expect(markdown).toContain("**MSFT:** No SEC company-facts record is stored for this issuer.");
    expect(markdown).toContain("SEC EDGAR");
  });

  it("does not turn non-US unavailable comparisons into fabricated observations", () => {
    const markdown = filingComparisonToMarkdown({ symbols: ["SAP.DE", "MC.PA"], from: null, to: null, forms: [], metrics: ["Revenues"], points: [], unavailable: [{ symbol: "SAP.DE", reason: "Germany XBRL comparison is unavailable until a validated structured filing adapter is promoted." }, { symbol: "MC.PA", reason: "France XBRL comparison is unavailable until a validated structured filing adapter is promoted." }], refreshedAt: "2026-08-18T00:00:00.000Z", marketId: "DE", marketLabel: "Germany" });
    expect(markdown).toContain("Germany XBRL comparison is unavailable");
    expect(markdown).toContain("France XBRL comparison is unavailable");
    expect(markdown).toContain("No matching source-backed facts");
  });
});
