import { describe, expect, it } from "vitest";
import { scanDeepResearch, summariseSignals, type DeepResearchInput } from "../lib/deep-research";

function article(partial: Partial<DeepResearchInput> & { headline: string }): DeepResearchInput {
  return {
    id: partial.id ?? "a1",
    symbol: partial.symbol ?? "TEST",
    headline: partial.headline,
    summary: partial.summary ?? "",
    source: partial.source ?? "Test Source",
    url: partial.url ?? "https://example.test/a",
    published_at: partial.published_at ?? "2026-10-12T00:00:00.000Z",
    impact_score: partial.impact_score ?? 50,
  };
}

describe("deep research catalyst scan", () => {
  it("classifies a discovery headline and returns the exact matched phrase", () => {
    const signals = scanDeepResearch([
      article({ headline: "Bhartiya Petrol finds sulphur deposit at its Gujarat block" }),
    ]);
    expect(signals).toHaveLength(1);
    expect(signals[0].category).toBe("discovery");
    // The match must be auditable, not paraphrased.
    expect(signals[0].headline.toLowerCase()).toContain(signals[0].matchedPhrase.toLowerCase());
    expect(signals[0].headlineMatch).toBe(true);
  });

  it("classifies expansion, order, capital and ownership signals", () => {
    const cases: Array<[string, string]> = [
      ["Company to expand capacity with a new plant in Odisha", "expansion"],
      ["Firm bags order worth 1,200 crore from NTPC", "order_win"],
      ["Board approves QIP fundraise of 500 crore", "capital"],
      ["Promoter stake sale via block deal", "ownership"],
      ["Receives environmental clearance for the new unit", "regulatory"],
    ];
    for (const [headline, expected] of cases) {
      const signals = scanDeepResearch([article({ headline })]);
      expect(signals[0]?.category).toBe(expected);
    }
  });

  it("returns nothing for an article with no catalyst", () => {
    expect(scanDeepResearch([article({ headline: "Analyst maintains rating on the stock" })])).toHaveLength(0);
  });

  it("ranks a headline match above a summary-only match", () => {
    const signals = scanDeepResearch([
      article({ id: "s1", headline: "Routine update", summary: "The firm will expand capacity next year.", impact_score: 90 }),
      article({ id: "s2", headline: "Firm bags a major order", summary: "", impact_score: 40 }),
    ]);
    expect(signals[0].id.startsWith("s2")).toBe(true);
    expect(signals[0].headlineMatch).toBe(true);
    expect(signals[1].headlineMatch).toBe(false);
  });

  it("emits at most one signal per article and honours the limit", () => {
    const many = Array.from({ length: 30 }, (_unused, index) =>
      article({ id: `x${index}`, headline: `Firm bags order ${index} and expands capacity` }),
    );
    const signals = scanDeepResearch(many, 8);
    expect(signals).toHaveLength(8);
    expect(new Set(signals.map((s) => s.id)).size).toBe(signals.length);
  });

  it("summarises counts per category", () => {
    const signals = scanDeepResearch([
      article({ id: "a", headline: "Firm bags order worth 100 crore" }),
      article({ id: "b", headline: "Firm wins another contract" }),
      article({ id: "c", headline: "Firm to expand capacity" }),
    ]);
    const summary = summariseSignals(signals);
    const order = summary.find((row) => row.category === "order_win");
    expect(order?.count).toBe(2);
  });

  it("never invents a signal from an empty article", () => {
    expect(scanDeepResearch([article({ headline: "" })])).toHaveLength(0);
  });
});
