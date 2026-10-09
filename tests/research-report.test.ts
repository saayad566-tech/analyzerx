import { describe, expect, it } from "vitest";
import { buildAnalysis } from "../server/fundamental-analysis";
import { fundamentalAnalysisToMarkdown, reportFileName } from "../server/research-report";

describe("separate institutional research reports", () => {
  it("creates a complete standalone report with a stock-specific filename", () => {
    const report = buildAnalysis("TATAMOTORS", "TATAMOTORS", null, { companyName: "Tata Motors", price: 700, revenueGrowth: 12, earningsGrowth: 15, operatingCashFlow: 100, freeCashFlow: 60, netIncome: 80, sharesOutstanding: 100 }, [{ tier: "primary", name: "Official filing", status: "used", note: "test source" }]);
    const markdown = fundamentalAnalysisToMarkdown(report);
    expect(reportFileName(report)).toBe("tatamotors-institutional-research.md");
    for (const section of ["Executive Summary", "Business Model, Plans, and Competitive Position", "Financial Analysis", "Institutional Score Calculation", "Final Investment Intelligence", "Catalysts and Future Outlook", "Risks, Red Flags, and Bear Case", "Bull / Base / Bear Scenarios", "Data Freshness and Source Hierarchy", "Research Disclaimer"]) {
      expect(markdown).toContain(`## ${section}`);
    }
    expect(markdown).toContain("Tata Motors");
    expect(markdown).toContain("/100");
    expect(markdown).toContain("Estimated");
    expect(markdown).toContain("12–24 month outlook");
    expect(markdown).toContain("Top Weaknesses");
    expect(markdown).toContain("Thesis Invalidation Conditions");
    expect(markdown).toContain(`**Primary score:** Legacy Institutional Five-Pillar Score ${report.score}/100`);
    expect(markdown).toContain(`**Secondary lens:** Multibagger Thesis Score ${report.multibaggerThesis.score}/100`);
  });

  it("keeps a separate report contract for a second symbol", () => {
    const report = buildAnalysis("JIOFIN", "JIOFIN", null, {}, [{ tier: "derived", name: "Sector baseline", status: "used", note: "test source" }]);
    expect(reportFileName(report)).toBe("jiofin-institutional-research.md");
    expect(fundamentalAnalysisToMarkdown(report)).not.toContain("TATAMOTORS");
  });
});


it("keeps global market metadata and currency in the report", () => {
  const report = buildAnalysis("AAPL", "AAPL", null, { companyName: "Apple Inc.", exchange: "NASDAQ", currency: "USD", country: "United States", price: 200 }, [{ tier: "primary", name: "Finnhub global", status: "used", note: "global test source" }]);
  const markdown = fundamentalAnalysisToMarkdown(report);
  expect(report.market).toEqual({ exchange: "NASDAQ", currency: "USD", country: "United States", primaryFocus: false });
  expect(markdown).toContain("United States · NASDAQ · USD");
  expect(markdown).toContain("USD ");
  expect(markdown).not.toContain("Indian equities (NSE/BSE routing)");
});


describe("modern report quality sections", () => {
  it("renders readable coverage and company-context sections instead of hiding gaps", () => {
    const report = buildAnalysis("ADANIENT", "ADANIENT", null, { companyName: "Adani Enterprises", price: 2500, businessSummary: "Integrated infrastructure and incubation platform", promoterHolding: 72.5, filingSourceUrl: "https://example.com/filing", filingPeriod: "FY2025" }, [{ tier: "primary", name: "Company filing", status: "used", note: "test source" }]);
    const markdown = fundamentalAnalysisToMarkdown(report);
    expect(markdown).toContain("## Coverage & Data Quality");
    expect(markdown).toContain("Current operating scope");
    expect(markdown).toContain("Future-plan evidence");
    expect(markdown).not.toContain("Employees");
    expect(markdown).toContain("Coverage score:");
    expect(markdown).toContain("Filing-derived evidence checks");
    expect(markdown).toContain("TAM / addressable market");
    expect(report.coverage.sections.length).toBeGreaterThanOrEqual(8);
  });
});


describe("chart-ready report data", () => {
  it("includes source-aware trend tables and separate valuation anchors", () => {
    const report = buildAnalysis("CHART", "CHART", null, { companyName: "Chart Holdings", price: 100, history: { revenue: [{ period: "FY2024", value: 80, basis: "reported", source: "filing" }, { period: "FY2025", value: 100, basis: "reported", source: "filing" }], eps: [{ period: "FY2025", value: 5, basis: "reported", source: "filing" }], cashFlow: [] } }, [{ tier: "primary", name: "Filing", status: "used", note: "test source" }]);
    const markdown = fundamentalAnalysisToMarkdown(report);
    expect(markdown).toContain("### Chart Data — Revenue");
    expect(markdown).toContain("FY2024");
    expect(markdown).toContain("### Chart Data — EPS");
    expect(markdown).toContain("### Chart Data — Operating Cash Flow");
    expect(markdown).toContain("### Valuation Chart Data");
    expect(markdown).toContain("Current price");
    expect(markdown).toContain("Low relative anchor");
    expect(markdown).toContain("must not be read as intrinsic value");
  });
});


it("includes the selected-symbol verified news scan in platform exports", () => {
  const report = buildAnalysis("RELIANCE", "RELIANCE", null, { companyName: "Reliance Industries", price: 1300 }, [{ tier: "primary", name: "Filing", status: "used", note: "test source" }]);
  const markdown = fundamentalAnalysisToMarkdown(report, [{ id: "news-1", symbol: "RELIANCE", headline: "Reliance announces expansion", category: "Markets", summary: "Company expansion update", key_entities: ["Reliance"], sentiment: "Positive", actionable_impact: "Expansion catalyst", url: "https://example.com/news-1", source: "Example News", published_at: "2026-08-17T10:00:00.000Z", impact_score: 85, high_impact: true }]);
  expect(markdown).toContain("## Verified News Scan");
  expect(markdown).toContain("Reliance announces expansion");
  expect(markdown).toContain("Example News");
  expect(markdown).toContain("https://example.com/news-1");
});
