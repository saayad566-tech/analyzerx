import { describe, expect, it } from "vitest";
import { extractLiveEventChain } from "../server/live-smart-alerts";
import type { QuantitativeMetric } from "../server/quantitative-metrics";
import { discoverEligibleStocks, normalizeMonitoringQuery } from "../lib/smart-event-alerts";

const profile = (symbol: string, companyName: string, marketCap: number, revenue: number, currency: "INR" = "INR") => ({
  resolvedSymbol: symbol, companyName, market: { exchange: "NSE", currency, country: "India", primaryFocus: true },
  metrics: {}, quantitativeMetrics: {
    marketCap: { key: "marketCap", label: "Market capitalization", value: marketCap, unit: "currency", basis: "reported", formula: "", source: "test" } as QuantitativeMetric,
    revenue: { key: "revenue", label: "Revenue", value: revenue, unit: "currency", basis: "reported", formula: "", source: "test" } as QuantitativeMetric,
  } as Record<string, QuantitativeMetric>, sources: [], asOf: new Date().toISOString(),
});

describe("live Smart Event Alerts", () => {
  it("extracts a source-backed order chain and computes financial significance", () => {
    const article = { id: "event-1", symbol: "WAAREEENER", headline: "L&T awards ₹1,200 Cr renewable order to Waaree Energies", category: "Markets" as const, summary: "The order supports a solar project and was disclosed by the company.", key_entities: ["L&T", "Waaree Energies"], sentiment: "Positive" as const, actionable_impact: "Contract win and expansion", url: "https://www.nseindia.com/example", source: "NSE corporate announcement", published_at: new Date().toISOString(), impact_score: 95, high_impact: true };
    const event = extractLiveEventChain(article, { WAAREEENER: profile("WAAREEENER", "Waaree Energies", 40_000_000_000, 100_000_000_000), LT: profile("LT", "Larsen & Toubro", 5_000_000_000_000, 2_000_000_000_000) });
    expect(event?.eventType).toBe("order");
    expect(event?.customerSymbol).toBe("LT");
    expect(event?.supplierSymbol).toBe("WAAREEENER");
    expect(event?.orderValueInrCr).toBe(1200);
    expect(event?.orderToRevenuePct).toBeCloseTo(12);
    expect(event?.evidence[0]?.status).toBe("verified");
  });

  it("keeps an incomplete entity chain unavailable instead of fabricating a customer", () => {
    const article = { id: "event-2", symbol: "WAAREEENER", headline: "Waaree announces a major renewable order", category: "Markets" as const, summary: "Order value was not disclosed.", key_entities: ["Waaree Energies"], sentiment: "Positive" as const, actionable_impact: "Order", url: "https://example.com/news", source: "News provider", published_at: new Date().toISOString(), impact_score: 70, high_impact: false };
    expect(extractLiveEventChain(article, { WAAREEENER: profile("WAAREEENER", "Waaree Energies", 40_000_000_000, 100_000_000_000) })).toBeNull();
  });

  it("passes live chains through the existing rule evaluator", () => {
    const rule = normalizeMonitoringQuery("Large-cap company places an order with a small-cap renewable company over 10% of revenue");
    const article = { id: "event-3", symbol: "WAAREEENER", headline: "L&T awards ₹1,200 Cr renewable order to Waaree Energies", category: "Markets" as const, summary: "The order supports a solar project and was disclosed by the company.", key_entities: ["L&T", "Waaree Energies"], sentiment: "Positive" as const, actionable_impact: "Contract win", url: "https://www.nseindia.com/example", source: "NSE corporate announcement", published_at: new Date().toISOString(), impact_score: 95, high_impact: true };
    const event = extractLiveEventChain(article, { WAAREEENER: profile("WAAREEENER", "Waaree Energies", 40_000_000_000, 100_000_000_000), LT: profile("LT", "Larsen & Toubro", 5_000_000_000_000, 2_000_000_000_000) });
    const discovery = discoverEligibleStocks(rule, event ? [event] : []);
    expect(discovery.eligibleStocks[0]?.event.orderToRevenuePct).toBeGreaterThan(10);
    expect(discovery.eligibleStocks[0]?.event.supplierMarketCapBand).toBe("small-cap");
    expect(discovery.eligibleStocks[0]?.event.customerMarketCapBand).toBe("mega-cap");
  });
});
