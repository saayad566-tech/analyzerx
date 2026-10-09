import { describe, expect, it } from "vitest";
import { events, marketFlows, storylines } from "../lib/market-data";
import { passesResearchFilter } from "../lib/screener";
import { totalCombinedScoreWeight } from "../lib/research-model";

describe("market event intelligence data", () => {
  it("keeps storyline events connected by storyline id", () => {
    const greenHydrogen = events.filter((event) => event.storylineId === "story-1");
    expect(greenHydrogen.length).toBe(4);
    expect(greenHydrogen.map((event) => event.kind)).toEqual([
      "Strategic investment",
      "Capacity expansion",
      "Large order",
      "Partnership",
    ]);
  });

  it("contains explicit fact status and confidence for every event", () => {
    expect(events.every((event) => event.status && event.confidence && event.sourceUrl)).toBe(true);
  });

  it("keeps storyline scores within the intelligence score range", () => {
    expect(storylines.every((storyline) => storyline.score >= 0 && storyline.score <= 100)).toBe(true);
  });

  it("sorts market flows high to low by value and filters by category", () => {
    const stockBuying = marketFlows.filter((flow) => flow.category === "Stock buying").sort((a, b) => b.value - a.value);
    expect(stockBuying.map((flow) => flow.value)).toEqual([286, 214]);
    expect(marketFlows.filter((flow) => flow.category === "FII")).toHaveLength(1);
  });

  it("identifies category leaders from flow values", () => {
    const categoryTotals = marketFlows.reduce<Record<string, number>>((totals, flow) => {
      totals[flow.category] = (totals[flow.category] ?? 0) + (flow.action === "Sell" ? -flow.value : flow.value);
      return totals;
    }, {});
    expect(categoryTotals.FII).toBeGreaterThan(categoryTotals.DII);
    expect(categoryTotals["Stock buying"]).toBeGreaterThan(categoryTotals.Options);
  });

  it("requires verified metrics when quantitative screener filters are active", () => {
    const candidate = { symbol: "TEST", name: "Test Co", sector: "Industrial", metricsAvailable: false, redFlags: [], evidence: ["Event context"], expansionSignal: false, triggerKeys: [] };
    expect(passesResearchFilter(candidate, [])).toBe(true);
    expect(passesResearchFilter(candidate, ["quality"])).toBe(false);
    expect(passesResearchFilter({ ...candidate, metricsAvailable: true, verifiedFilters: ["quality", "cash"], triggerKeys: [] }, ["quality", "cash"])).toBe(true);
    expect(passesResearchFilter({ ...candidate, expansionSignal: true, triggerKeys: ["expansion"] }, ["expansion"])).toBe(true);
  });

  it("keeps the combined fundamental and derivatives score allocation at 100 points", () => {
    expect(totalCombinedScoreWeight()).toBe(100);
  });

  it("returns the historical sequence for a selected entity", () => {
    const selectedEntity = "WAAREEENER";
    const timeline = events.filter((event) => event.symbolA === selectedEntity || event.symbolB === selectedEntity);
    expect(timeline).toHaveLength(4);
    expect(timeline.map((event) => event.storylineId)).toEqual(["story-1", "story-1", "story-1", "story-1"]);
  });
});
