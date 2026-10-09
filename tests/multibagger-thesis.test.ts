import { describe, expect, it } from "vitest";
import { buildMultibaggerThesis } from "../server/multibagger-thesis";

const strongInput = {
  companyName: "Example Industries",
  symbol: "EXAMPLE",
  sector: "Industrial technology",
  price: 100,
  metrics: {
    revenueGrowth: { value: 22, basis: "reported" as const },
    earningsGrowth: { value: 25, basis: "reported" as const },
    roe: { value: 22, basis: "reported" as const },
    roce: { value: 24, basis: "reported" as const },
    debtToEquity: { value: 0.3, basis: "reported" as const },
    pe: { value: 24, basis: "reported" as const },
    promoterHolding: { value: 55, basis: "reported" as const },
    promoterPledge: { value: 0, basis: "reported" as const },
    cashConversion: { value: 1.05, basis: "derived" as const },
    operatingMargin: { value: 18, basis: "reported" as const },
  },
  history: {
    revenue: [{ value: 40 }, { value: 52 }, { value: 65 }, { value: 80 }, { value: 100 }],
    eps: [{ value: 4 }, { value: 5 }, { value: 7 }, { value: 9 }, { value: 12 }],
    cashFlow: [{ value: 6 }, { value: 8 }, { value: 11 }, { value: 14 }, { value: 18 }],
  },
  catalysts: ["Capacity expansion with a dated commissioning milestone"],
  risks: ["Execution risk"],
  evidenceGaps: [],
};

describe("Multibagger Thesis Engine", () => {
  it("calculates the framework, scenarios, and 5x/10x CAGR math", () => {
    const thesis = buildMultibaggerThesis(strongInput);
    expect(thesis.score).toBeGreaterThan(0);
    expect(thesis.scoreBreakdown.reduce((sum, item) => sum + item.max, 0)).toBe(100);
    expect(thesis.how.some((line) => line.includes("38.0%"))).toBe(true);
    expect(thesis.how.some((line) => line.includes("25.9%"))).toBe(true);
    expect(thesis.scenarios).toHaveLength(3);
    expect(thesis.valuation.fiveYear.base).toBe(300);
  });

  it("hard-rejects severe leverage or pledge evidence without inventing a positive thesis", () => {
    const thesis = buildMultibaggerThesis({
      ...strongInput,
      metrics: { ...strongInput.metrics, debtToEquity: { value: 4, basis: "reported" }, promoterPledge: { value: 35, basis: "reported" } },
    });
    expect(thesis.label).toBe("Rejected by risk gates");
    expect(thesis.hardRejectionFlags.length).toBeGreaterThanOrEqual(2);
  });

  it("exposes transparent gaps and grounded research fallback instructions", () => {
    const thesis = buildMultibaggerThesis({ companyName: "Sparse Co", symbol: "SPARSE", metrics: {}, price: null });
    expect(thesis.confidence).toBe("Low");
    expect(thesis.evidenceGaps.length).toBeGreaterThan(0);
    expect(thesis.researchFallback.status).toBe("gaps_require_grounded_research");
    expect(thesis.beginnerSummary).toContain("multibagger");
  });
});
