import { describe, expect, it } from "vitest";
import { buildFilingComparison, filingComparisonToCsv, filingComparisonToPdf, filingComparisonToSvg } from "../server/filing-comparison";

describe("filing comparison export formats", () => {
  const result = { ...buildFilingComparison({ AAPL: [{ symbol: "AAPL", sourceKey: "sec-company-facts", normalizedPayload: JSON.stringify({ facts: [{ tag: "Revenues", value: 1234, unit: "USD", end: "2024-12-31", form: "10-K" }] }) }], MSFT: [] }, { symbols: ["AAPL", "MSFT"], from: "2024-01-01", to: "2024-12-31", forms: ["10-K"], metrics: ["Revenues"] }), marketId: "US", marketLabel: "United States" };

  it("exports spreadsheet-safe CSV with metadata and unavailable coverage", () => {
    const csv = filingComparisonToCsv(result);
    expect(csv).toContain('"Market","United States"');
    expect(csv).toContain('"AAPL","Revenues","1234","USD"');
    expect(csv).toContain('"Unavailable symbol","Reason"');
    expect(csv).toContain("MSFT");
  });

  it("exports a downloadable source-grounded SVG chart with escaped labels", () => {
    const svg = filingComparisonToSvg({ ...result, marketLabel: "United <States>" });
    expect(svg).toContain("<svg");
    expect(svg).toContain("United &lt;States&gt;");
    expect(svg).toContain("AAPL");
  });

  it("renders a non-empty styled PDF buffer", async () => {
    const pdf = await filingComparisonToPdf(result);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1_000);
  });
});
