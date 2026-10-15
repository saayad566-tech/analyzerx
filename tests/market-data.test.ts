import { describe, expect, it } from "vitest";
import { passesResearchFilter } from "../lib/screener";
import { totalCombinedScoreWeight } from "../lib/research-model";
import { eventProjectionToMarketEvent, eventProjectionsToMarketEvents } from "../lib/event-projection-view";

/**
 * Research-model and event-mapping contracts.
 *
 * This file used to assert the contents of the hardcoded demo arrays in
 * `lib/market-data.ts` — a four-event "green hydrogen" storyline, hardcoded flow values
 * of 286 and 214, and a fixed Indian entity timeline. Those arrays were fabricated demo
 * data that rendered for every market and have been removed, so the assertions on them
 * are gone with it.
 *
 * What remains is the real contract: the screener filter must refuse to pass a
 * quantitative filter on a candidate with no verified metrics, the combined score
 * allocation must stay at 100, and the event mapper must carry only what the projection
 * actually contains.
 */

describe("research model", () => {
  it("keeps the combined fundamental and derivatives score allocation at 100 points", () => {
    expect(totalCombinedScoreWeight()).toBe(100);
  });
});

describe("screener research filter", () => {
  it("requires verified metrics when quantitative filters are active", () => {
    const candidate = { symbol: "TEST", name: "Test Co", sector: "Industrial", metricsAvailable: false, redFlags: [], evidence: ["Event context"], expansionSignal: false, triggerKeys: [] };
    expect(passesResearchFilter(candidate, [])).toBe(true);
    expect(passesResearchFilter(candidate, ["quality"])).toBe(false);
    expect(passesResearchFilter({ ...candidate, metricsAvailable: true, verifiedFilters: ["quality", "cash"], triggerKeys: [] }, ["quality", "cash"])).toBe(true);
    expect(passesResearchFilter({ ...candidate, expansionSignal: true, triggerKeys: ["expansion"] }, ["expansion"])).toBe(true);
  });
});

describe("event projection mapping", () => {
  const base = {
    id: "p1",
    marketId: "IN",
    symbol: "RELIANCE",
    eventType: "order",
    title: "Verified order",
    summary: "A verified event.",
    relationshipJson: JSON.stringify({ entities: ["RELIANCE"], relationship: "reported-by-source" }),
    sentiment: "positive" as const,
    impactScore: 70,
    confidenceScore: 90,
    status: "active" as const,
    sourceUrl: "https://example.com/a",
    sourceKey: "nse-rss-announcements",
    eventAt: "2026-10-14T04:05:00.000Z",
  };

  it("maps one projection onto the card shape without inventing fields", () => {
    const event = eventProjectionToMarketEvent(base);
    expect(event.symbolA).toBe("RELIANCE");
    expect(event.symbolB).toBeUndefined();
    expect(event.score).toBe(70);
    expect(event.status).toBe("Confirmed");
  });

  it("does not invent a second party from a malformed relationship", () => {
    const event = eventProjectionToMarketEvent({ ...base, relationshipJson: "{}" });
    expect(event.symbolA).toBe("RELIANCE");
    expect(event.symbolB).toBeUndefined();
  });

  it("maps an empty list to an empty list rather than to demo data", () => {
    expect(eventProjectionsToMarketEvents([])).toEqual([]);
  });

  it("carries no fabricated Indian content of its own", () => {
    const blob = JSON.stringify(eventProjectionToMarketEvent({ ...base, marketId: "FR", symbol: "MC.PA", sourceKey: "eu-esef" })).toLowerCase();
    for (const forbidden of ["nifty", "sensex", "₹", "larsen", "waaree", "titagarh", "gujarat"]) {
      expect(blob, `the mapper produced ${forbidden}`).not.toContain(forbidden);
    }
  });
});
