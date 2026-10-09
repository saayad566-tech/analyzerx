import { describe, expect, it } from "vitest";
import { calculateQuantitativeMetrics } from "../server/quantitative-metrics";

describe("quantitative metrics", () => {
  it("derives valuation and cash-quality ratios only when required inputs exist", () => {
    const metrics = calculateQuantitativeMetrics({ marketCap: 1000, revenue: 250, freeCashFlow: 100, operatingCashFlow: 120, netIncome: 100, netDebt: 100, pe: 20, earningsGrowth: 10 });
    expect(metrics.ps.value).toBe(4);
    expect(metrics.pfcf.value).toBe(10);
    expect(metrics.evSales.value).toBe(4.4);
    expect(metrics.cfoNetIncome.value).toBe(1.2);
    expect(metrics.fcfYield.value).toBe(10);
    expect(metrics.peg.value).toBe(2);
    expect(metrics.ps.basis).toBe("derived");
  });

  it("does not invent missing accounting inputs", () => {
    const metrics = calculateQuantitativeMetrics({ pe: 22, priceToBook: 3 });
    expect(metrics.pe.value).toBe(22);
    expect(metrics.pe.basis).toBe("reported");
    expect(metrics.ps.value).toBeNull();
    expect(metrics.ps.basis).toBe("unavailable");
    expect(metrics.roic.value).toBeNull();
    expect(metrics.roic.basis).toBe("unavailable");
  });

  it("calculates historical growth and price context from supplied series", () => {
    const metrics = calculateQuantitativeMetrics({ history: { revenue: [{ period: "2022", value: 100 }, { period: "2023", value: 121 }, { period: "2024", value: 144 }], eps: [{ period: "2022", value: 2 }, { period: "2023", value: 2.4 }, { period: "2024", value: 3 }], cashFlow: [{ period: "2022", value: 10 }, { period: "2023", value: -2 }, { period: "2024", value: 8 }] }, priceSeries: [100, 110, 120] });
    expect(metrics.revenueCagr3.value).toBeGreaterThan(15);
    expect(metrics.epsCagr3.value).toBeGreaterThan(20);
    expect(metrics.fcfPositivePeriods.value).toBeCloseTo(66.6667, 3);
    expect(metrics.oneYearChange.value).toBeCloseTo(20, 8);
    expect(metrics.sma20.basis).toBe("unavailable");
  });
});
