import { describe, expect, it } from "vitest";
import { validateAnalyzerXAction } from "../server/market-chat";
import { buildAnalysis } from "../server/fundamental-analysis";
import { fundamentalAnalysisToPdf, reportFileName } from "../server/research-report";

describe("AnalyzerX assistant action safety", () => {
  it("allows only navigation, news filtering, and report opening actions", () => {
    expect(validateAnalyzerXAction({ actionType: "navigate", actionRoute: "/flows" })).toEqual({ type: "navigate", route: "/flows", params: undefined });
    expect(validateAnalyzerXAction({ actionType: "open_report", actionSymbol: "tcs" })).toEqual({ type: "open_report", symbol: "TCS" });
    expect(validateAnalyzerXAction({ actionType: "filter_news", actionSymbol: "RELIANCE", actionSentiment: "Positive" })).toEqual({ type: "filter_news", symbol: "RELIANCE", sentiment: "Positive" });
  });

  it("rejects arbitrary routes and execution-like actions", () => {
    expect(validateAnalyzerXAction({ actionType: "navigate", actionRoute: "https://evil.example" })).toBeNull();
    expect(validateAnalyzerXAction({ actionType: "place_order", actionSymbol: "TCS" })).toBeNull();
    expect(validateAnalyzerXAction({ actionType: "open_report", actionSymbol: "bad symbol" })).toBeNull();
  });
});

describe("AnalyzerX PDF research export", () => {
  it("returns a non-empty PDF with a PDF filename and report metadata", async () => {
    const report = buildAnalysis("TCS", "TCS", null, { companyName: "Tata Consultancy Services", price: 3800, revenueGrowth: 12, earningsGrowth: 14, operatingCashFlow: 100, freeCashFlow: 75, netIncome: 90, sharesOutstanding: 100 }, [{ tier: "primary", name: "Test filing", status: "used", note: "test source" }]);
    const pdf = await fundamentalAnalysisToPdf(report);
    expect(reportFileName(report, "pdf")).toBe("tcs-institutional-research.pdf");
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(4_000);
  });
});
