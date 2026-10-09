import { describe, expect, it } from "vitest";
import { deduplicateEventChains, discoverEligibleStocks, normalizeMonitoringQuery, scoreSmartEvent, smartAlertTemplates, type SmartEventChain } from "../server/smart-event-alerts";

const evidence = (url: string, source = "NSE") => ({ source, url, publishedAt: "2026-08-18T10:00:00.000Z", retrievedAt: "2026-08-18T10:05:00.000Z", status: "verified" as const, excerpt: "Verified filing excerpt" });
const baseEvent: SmartEventChain = {
  id: "evt-1", eventType: "order", customerSymbol: "LT", customerName: "Larsen & Toubro", customerMarketCapBand: "large-cap", supplierSymbol: "WAAREEENER", supplierName: "Waaree Energies", supplierMarketCapBand: "small-cap", supplierSector: "Renewable Energy", orderValueInrCr: 850, orderToRevenuePct: 38, expectedRevenueImpact: "high", historicalRelationship: "new", evidence: [evidence("https://nse.example/1")], detectedAt: "2026-08-18T10:05:00.000Z", purpose: "Solar project" };

describe("Smart Event Alerts", () => {
  it("normalizes natural-language conditions", () => {
    const rule = normalizeMonitoringQuery("Notify me when a large-cap company places a major order with a small-cap renewable company.");
    expect(rule.customerMarketCaps).toContain("large-cap");
    expect(rule.supplierMarketCaps).toContain("small-cap");
    expect(rule.sectors).toContain("Renewable Energy");
    expect(rule.eventTypes).toContain("order");
  });

  it("deduplicates the same event across sources while retaining evidence", () => {
    const duplicate = { ...baseEvent, id: "evt-2", evidence: [evidence("https://bse.example/1", "BSE")] };
    const result = deduplicateEventChains([baseEvent, duplicate]);
    expect(result).toHaveLength(1);
    expect(result[0].evidence).toHaveLength(2);
  });

  it("scores material large-cap to small-cap events with explainable factors", () => {
    const score = scoreSmartEvent(baseEvent);
    expect(score.score).toBeGreaterThanOrEqual(70);
    expect(score.factors.map((factor) => factor.label)).toEqual(expect.arrayContaining(["Order value", "Revenue materiality", "Company-size relationship", "Evidence quality"]));
  });

  it("returns eligible, potential, and no-longer-eligible states with a reason", () => {
    const rule = normalizeMonitoringQuery("Notify me when a large-cap company places an order above 100 Cr with a small-cap renewable company.");
    const discovery = discoverEligibleStocks(rule, [baseEvent, { ...baseEvent, id: "evt-3", supplierSymbol: "UNKNOWN2", supplierName: "Unconfirmed Supplier", supplierMarketCapBand: "unknown", evidence: [{ ...evidence("https://example.com/partial"), status: "partial" }] }]);
    expect(discovery.counts.eligible).toBeGreaterThanOrEqual(1);
    expect(discovery.eligibleStocks[0].whySeeingThis).toContain("shown because");
    expect(discovery.eligibleStocks.some((item) => item.status === "potential" || item.status === "no-longer-eligible")).toBe(true);
  });

  it("exposes built-in templates without claiming matching stocks", () => {
    expect(smartAlertTemplates().length).toBeGreaterThanOrEqual(4);
    expect(smartAlertTemplates().every((rule) => rule.id && rule.query)).toBe(true);
  });
});
