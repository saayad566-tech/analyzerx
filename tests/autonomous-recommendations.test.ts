import { describe, expect, it } from "vitest";
import { buildAutonomousRecommendation, discoverAutonomousRecommendationsFromChains } from "../server/autonomous-recommendations";
import type { SmartEventChain } from "../lib/smart-event-alerts";

// Fixture timestamps are relative to run time so the discovery lookback window
// (default 30 days) always includes the synthetic events.
const isoAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

function event(overrides: Partial<SmartEventChain> = {}): SmartEventChain {
  return {
    id: "event-1",
    eventType: "order",
    customerSymbol: "LT",
    customerName: "Larsen & Toubro",
    customerMarketCapBand: "large-cap",
    supplierSymbol: "WAAREEENER",
    supplierName: "Waaree Energies",
    supplierMarketCapBand: "small-cap",
    supplierSector: "Renewable Energy",
    orderValueInrCr: 1200,
    orderToRevenuePct: 18,
    orderToMarketCapPct: 5,
    capacityMw: null,
    fundingInrCr: null,
    executionPeriod: "24 months",
    purpose: "L&T awarded a ₹1,200 Cr renewable energy order to Waaree Energies.",
    historicalRelationship: "unknown",
    repeatOrderCount: null,
    expectedRevenueImpact: "high",
    evidence: [{ source: "NSE official filing", url: "https://nse.example/event-1", publishedAt: isoAgo(120), retrievedAt: isoAgo(119), status: "verified", excerpt: "Official order disclosure" }],
    detectedAt: isoAgo(120),
    rawHeadline: "L&T awards ₹1,200 Cr renewable order to Waaree Energies",
    ...overrides,
  };
}

describe("autonomous recommendations", () => {
  it("creates a direct beneficiary recommendation with separate impact and confidence", () => {
    const recommendation = buildAutonomousRecommendation(event());
    expect(recommendation).not.toBeNull();
    expect(recommendation?.symbol).toBe("WAAREEENER");
    expect(recommendation?.relationship).toBe("direct-beneficiary");
    expect(recommendation?.direction).toBe("beneficiary");
    expect(recommendation?.impactScore).toBeGreaterThan(0);
    expect(recommendation?.confidenceScore).toBeGreaterThan(0);
    expect(recommendation?.factors.length).toBeGreaterThan(0);
    expect(recommendation?.reason).toContain("source-backed");
  });

  it("rejects events without usable evidence", () => {
    expect(buildAutonomousRecommendation(event({ evidence: [] }))).toBeNull();
    expect(buildAutonomousRecommendation(event({ evidence: [{ source: "Unknown", url: "", publishedAt: "", retrievedAt: "", status: "unavailable" }] }))).toBeNull();
  });

  it("labels adverse and mixed language without inventing a positive opportunity", () => {
    const adverse = buildAutonomousRecommendation(event({ rawHeadline: "Customer cancelled the order after regulatory setback", purpose: "Customer cancelled the contract after a regulatory setback." }));
    expect(adverse?.direction).toBe("negative-impact");
    expect(adverse?.relationship).toBe("affected-company");
    const mixed = buildAutonomousRecommendation(event({ rawHeadline: "Order awarded but delayed after regulatory investigation" }));
    expect(mixed?.direction).toBe("mixed-uncertain");
    expect(mixed?.status).toBe("mixed");
  });

  it("deduplicates equivalent chains and returns an empty result for rejected chains", () => {
    const result = discoverAutonomousRecommendationsFromChains([event(), event({ id: "event-2", evidence: [{ source: "Company IR", url: "https://ir.example/event-1", publishedAt: isoAgo(118), retrievedAt: isoAgo(117), status: "verified" }] })], 30);
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].evidence.length).toBeGreaterThanOrEqual(1);
    expect(discoverAutonomousRecommendationsFromChains([event({ evidence: [] })]).recommendations).toHaveLength(0);
  });
});
