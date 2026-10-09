import { describe, expect, it } from "vitest";
import { buildAnalysis } from "../server/fundamental-analysis";

describe("fundamental analysis fallback scorecard", () => {
  const sources = [{ tier: "derived" as const, name: "test baseline", status: "used" as const, note: "deterministic test" }];

  it("always returns a complete five-category numerical score for an empty payload", () => {
    const result = buildAnalysis("UNKNOWN", "UNKNOWN", null, {}, sources);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.categories).toHaveLength(5);
    expect(result.categories.every((category) => Number.isFinite(category.score))).toBe(true);
    expect(result.metrics.roe.basis).toBe("estimated");
    expect(result.risks.length).toBeGreaterThan(0);
    expect(result.fairValue.currentPrice).toBeNull();
  });

  it("preserves reported inputs and derives cash quality when cash flow is missing", () => {
    const result = buildAnalysis("RELIANCE", "RELIANCE", null, { price: 1400, roe: 18, pe: 22, netIncome: 1000, sector: "Indian equities" }, sources);
    expect(result.metrics.roe).toMatchObject({ value: 18, basis: "reported" });
    expect(result.metrics.operatingCashFlow).toMatchObject({ value: 900, basis: "derived" });
    expect(result.metrics.cashQuality).toMatchObject({ value: 900, basis: "derived" });
    expect(result.fairValue.currentPrice).toBe(1400);
    expect(result.fairValue.basis).toBe("unavailable");
  });

  it("preserves reported trend series for visual chart consumers", () => {
    const result = buildAnalysis("TATASTEEL", "TATASTEEL", null, { history: { revenue: [{ period: "Mar 2025", value: 100, basis: "reported", source: "filing" }], eps: [], cashFlow: [] } }, sources);
    expect(result.history.revenue).toHaveLength(1);
    expect(result.history.revenue[0]).toMatchObject({ period: "Mar 2025", value: 100, basis: "reported" });
    expect(result.history.eps).toEqual([]);
    expect(result.history.cashFlow).toEqual([]);
  });

  it("exposes the corporate-action redirect and keeps the score complete", () => {
    const result = buildAnalysis("TATASTBLSL", "TATASTEEL", { from: "TATASTBLSL", to: "TATASTEEL", reason: "Legacy identifier" }, {}, sources);
    expect(result.redirect?.to).toBe("TATASTEEL");
    expect(result.categories).toHaveLength(5);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.verdict).toBeTruthy();
  });
});


describe("deep fundamental pillars", () => {
  const sources = [{ tier: "derived" as const, name: "test baseline", status: "used" as const, note: "deterministic test" }];

  it("uses reported cash flow directly in the cash-flow pillar", () => {
    const result = buildAnalysis("CASH", "CASH", null, {
      price: 100,
      netIncome: 100,
      operatingCashFlow: 180,
      freeCashFlow: 120,
      roe: 18,
      debtToEquity: 0.4,
      promoterHolding: 60,
      promoterPledge: 0,
    }, sources);
    const cashCategory = result.categories.find((category) => category.key === "cashFlow");
    expect(result.metrics.operatingCashFlow).toMatchObject({ value: 180, basis: "reported" });
    expect(result.metrics.freeCashFlow).toMatchObject({ value: 120, basis: "reported" });
    expect(result.metrics.cashConversion).toMatchObject({ value: 1.8, basis: "derived" });
    expect(cashCategory?.score).toBeGreaterThan(0);
    expect(cashCategory?.label).toContain("Cash-flow");
  });

  it("does not invent a DCF per-share value without shares outstanding", () => {
    const result = buildAnalysis("NODCF", "NODCF", null, { freeCashFlow: 100, price: 50 }, sources);
    expect(result.fairValue.dcf.valuePerShare).toBeNull();
    expect(result.fairValue.dcf.basis).toBe("unavailable");
    expect(result.fairValue.dcf.note).toContain("shares outstanding");
  });

  it("calculates a conservative DCF only when the required inputs exist", () => {
    const result = buildAnalysis("DCF", "DCF", null, { freeCashFlow: 1000, sharesOutstanding: 100, netDebt: 200, earningsGrowth: 10 }, sources);
    expect(result.fairValue.dcf.valuePerShare).toBeGreaterThan(0);
    expect(result.fairValue.dcf.basis).toBe("derived");
    expect(result.fairValue.dcf.note).toContain("12% discount rate");
  });
});


describe("institutional research report", () => {
  const sources = [{ tier: "derived" as const, name: "test baseline", status: "used" as const, note: "deterministic test" }];

  it("returns the supplied ten-category 100-point score framework with explainable calculations", () => {
    const result = buildAnalysis("REPORT", "REPORT", null, { price: 100, earningsGrowth: 15, revenueGrowth: 12, operatingCashFlow: 200, freeCashFlow: 120, netIncome: 150, sharesOutstanding: 100 }, sources);
    expect(result.institutionalReport.scoreWeights).toHaveLength(10);
    expect(result.institutionalReport.scoreWeights.map((item) => item.label)).toEqual(["Business Quality & Moat", "Financial Strength", "Growth & Earnings Quality", "Profitability & Capital Efficiency", "Valuation", "Cash Flow & Balance Sheet", "Management & Capital Allocation", "Competitive / Industry Position", "Catalysts & Future Outlook", "Risk Profile"]);
    expect(result.institutionalReport.scoreWeights.reduce((sum, item) => sum + item.max, 0)).toBe(100);
    expect(result.institutionalReport.scoreWeights.every((item) => item.calculation.length > 10)).toBe(true);
    expect(result.institutionalReport.scenarios.map((scenario) => scenario.label)).toEqual(["Bull", "Base", "Bear"]);
    expect(result.institutionalReport.confidenceScore).toBeGreaterThanOrEqual(0);
    expect(result.institutionalReport.confidenceScore).toBeLessThanOrEqual(100);
    expect(result.institutionalReport.outlook12to24m.length).toBeGreaterThan(20);
    expect(result.institutionalReport.weaknesses).toHaveLength(5);
    expect(result.institutionalReport.thesisBullishWhen.length).toBeGreaterThan(1);
    expect(result.institutionalReport.thesisInvalidation.length).toBeGreaterThan(1);
  });

  it("keeps current-versus-fair-value unavailable when no reliable anchor exists", () => {
    const result = buildAnalysis("NOANCHOR", "NOANCHOR", null, {}, sources);
    expect(result.institutionalReport.currentVsFairValuePct).toBeNull();
    expect(result.institutionalReport.freshness).toContain("successful provider");
    expect(result.institutionalReport.sourceHierarchy.length).toBeGreaterThan(2);
  });
});


describe("financial-analysis research logic", () => {
  it("returns an auditable reasoning trail instead of only a score", () => {
    const result = buildAnalysis("AAPL", "AAPL", null, { revenueGrowth: 18, earningsGrowth: 20, operatingCashFlow: -10, netIncome: 20, pe: 40 }, [
      { tier: "primary", name: "Structured provider", status: "used", note: "Reported metrics returned." },
      { tier: "web-fallback", name: "Fallback", status: "failed", note: "Provider unavailable." },
    ]);
    expect(result.researchLogic.methodology.length).toBeGreaterThan(3);
    expect(result.researchLogic.contradictions.some((item) => item.includes("cash flow"))).toBe(true);
    expect(result.researchLogic.evidenceGaps.length).toBeGreaterThan(0);
    expect(result.researchLogic.nextResearchQuestions.length).toBeGreaterThan(2);
    expect(result.researchLogic.decisionRules.some((item) => item.includes("Latest price"))).toBe(true);
  });
});


describe("stock-analysis deep context", () => {
  it("calculates technical context from a verified price series and keeps filings explicit", () => {
    const prices = Array.from({ length: 60 }, (_, index) => 100 + index);
    const result = buildAnalysis("TECH", "TECH", null, {
      price: 159,
      priceSeries: prices,
      promoterHolding: 52,
      promoterPledge: 0,
      pe: 24,
      priceToBook: 3,
      country: "India",
      exchange: "NSE",
    }, [{ tier: "web-fallback", name: "Yahoo chart", status: "used", note: "Chart close series returned." }]);
    expect(result.stockAnalysis.technical.trend).toBe("Bullish");
    expect(result.stockAnalysis.technical.sma20).toBeGreaterThan(0);
    expect(result.stockAnalysis.technical.rsi14).toBeGreaterThan(0);
    expect(result.stockAnalysis.ownership.promoterPledge).toBe(0);
    expect(result.stockAnalysis.filings.status).toBe("unavailable");
    expect(result.stockAnalysis.conclusion).toContain("confidence");
  });
});


describe("report data quality gates", () => {
  const sources = [{ tier: "web-fallback" as const, name: "Screener.in", status: "used" as const, note: "Company-period data" }];

  it("never treats a non-positive price as a valid fair-value anchor", () => {
    const result = buildAnalysis("ADANIENT", "ADANIENT", null, { price: 0, companyName: "Adani Enterprises", country: "India", exchange: "NSE" }, sources);
    expect(result.fairValue.currentPrice).toBeNull();
    expect(result.institutionalReport.currentVsFairValuePct).toBeNull();
    expect(result.fairValue.note).toContain("No reliable current price");
  });

  it("keeps company-specific evidence and filing provenance in the analysis contract", () => {
    const result = buildAnalysis("ADANIENT", "ADANIENT", null, {
      price: 3007,
      companyName: "Adani Enterprises",
      businessSummary: "Diversified infrastructure and resources businesses.",
      promoterHolding: 71.97,
      filingSourceUrl: "https://www.adanienterprises.com/investors/investor-downloads",
      filingPeriod: "Mar 2026",
      country: "India",
      exchange: "NSE",
    }, sources);
    expect(result.qualitative.businessModel).toContain("Diversified infrastructure");
    expect(result.stockAnalysis.ownership.promoterHolding).toBe(71.97);
    expect(result.stockAnalysis.filings.status).toBe("partial");
    expect(result.stockAnalysis.filings.note).toContain("adanienterprises.com");
  });
});


describe("company identity and valuation anchors", () => {
  const sources = [{ tier: "web-fallback" as const, name: "Screener.in", status: "used" as const, note: "Company-period data" }];

  it("creates a transparent relative valuation anchor from EPS and book value when DCF is unavailable", () => {
    const result = buildAnalysis("ADANIENT", "ADANIENT", null, {
      price: 3007,
      eps: 58.54,
      bookValue: 627,
      pe: 51.37,
      priceToBook: 4.8,
      freeCashFlow: -100,
    }, sources);
    expect(result.fairValue.baseValue).toBeGreaterThan(0);
    expect(result.fairValue.basis).toBe("estimated");
    expect(result.fairValue.note).toContain("sector reference multiples");
    expect(result.fairValue.dcf.valuePerShare).toBeNull();
  });
});


describe("universal report coverage", () => {
  const sources = [{ tier: "derived" as const, name: "test baseline", status: "used" as const, note: "deterministic test" }];

  it("returns section-level coverage without hiding unavailable filing evidence", () => {
    const result = buildAnalysis("COVERAGE", "COVERAGE", null, { price: 100, companyName: "Coverage Holdings", businessSummary: "A diversified operating company.", history: { revenue: [{ period: "FY2025", value: 100, basis: "reported", source: "filing" }], eps: [], cashFlow: [] } }, sources);
    expect(result.coverage.score).toBeGreaterThanOrEqual(0);
    expect(result.coverage.score).toBeLessThanOrEqual(100);
    expect(result.coverage.sections.map((section) => section.key)).not.toContain("workforce");
    expect(result.stockAnalysis.profile.futurePlans).toContain("Future plans require dated");
    expect(result.coverage.sections.find((section) => section.key === "filings")?.status).toBe("unavailable");
  });
});


describe("universal multi-market quality gates", () => {
  const sources = [{ tier: "derived" as const, name: "test baseline", status: "used" as const, note: "deterministic test" }];

  it("keeps global fallback reports out of the Indian sector baseline and never treats current price as fair value", () => {
    const result = buildAnalysis("AAPL", "AAPL", null, { price: 100, companyName: "Apple Inc", exchange: "NASDAQ", currency: "USD", country: "United States", priceSeries: [90, 100] }, sources);
    expect(result.market.country).toBe("United States");
    expect(result.stockAnalysis.profile.sector).toBe("Global equities");
    expect(result.fairValue.baseValue).toBeNull();
    expect(result.fairValue.currentPrice).toBe(100);
  });

  it("recognizes bank EPS and cash-flow history without requiring a non-comparable revenue series", () => {
    const history = { revenue: [], eps: [1, 2, 3, 4].map((value, index) => ({ period: String(2022 + index), value, basis: "reported" as const, source: "filing" })), cashFlow: [1, 2, 3, 4].map((value, index) => ({ period: String(2022 + index), value, basis: "reported" as const, source: "filing" })) };
    const result = buildAnalysis("HDFCBANK", "HDFCBANK", null, { companyName: "HDFC Bank Ltd", sector: "Financials", exchange: "NSE", currency: "INR", country: "India", price: 100, history }, sources);
    expect(result.coverage.sections.find((section) => section.key === "financials")?.status).toBe("verified");
  });
});


describe("evidence enrichment safety gates", () => {
  const sources = [{ tier: "derived" as const, name: "test baseline", status: "used" as const, note: "deterministic test" }];

  it("recognizes provider sector labels containing bank and preserves financial history coverage", () => {
    const history = {
      revenue: [],
      eps: [1, 2, 3, 4].map((value, index) => ({ period: String(2022 + index), value, basis: "reported" as const, source: "filing" })),
      cashFlow: [1, 2, 3, 4].map((value, index) => ({ period: String(2022 + index), value, basis: "reported" as const, source: "filing" })),
    };
    const result = buildAnalysis("HDFCBANK", "HDFCBANK", null, { sector: "Regional Banks", price: 100, history }, sources);
    expect(result.coverage.sections.find((section) => section.key === "financials")?.status).toBe("verified");
  });

  it("rejects a unit-mismatched DCF anchor instead of rendering a zero-like valuation", () => {
    const result = buildAnalysis("UNITCHECK", "UNITCHECK", null, { price: 100, freeCashFlow: 100, sharesOutstanding: 1_000_000_000_000, earningsGrowth: 10 }, sources);
    expect(result.fairValue.baseValue).toBeNull();
    expect(result.institutionalReport.currentVsFairValuePct).toBeNull();
    expect(result.fairValue.note).toContain("No intrinsic anchor");
  });
});


describe("scenario valuation outputs", () => {
  it("calculates probability-weighted fair value only from plausible scenario anchors", () => {
    const result = buildAnalysis("SCENARIO", "SCENARIO", null, { price: 100, eps: 5, bookValue: 20, pe: 20, priceToBook: 5 }, [{ tier: "primary", name: "test source", status: "used", note: "deterministic scenario source" }]);
    expect(result.institutionalReport.probabilityWeightedFairValue).toBeGreaterThan(0);
    expect(result.institutionalReport.upsideDownsidePct).not.toBeNull();
  });
});
