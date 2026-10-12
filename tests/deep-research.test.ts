import { describe, expect, it } from "vitest";
import { scanDeepResearch, scanDeepResearchDetailed, summariseSignals, type DeepResearchInput } from "../lib/deep-research";

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
    const signals = scanDeepResearch(many, { limit: 8 });
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

describe("Rule 6: mandatory temporal anchoring and date stamping", () => {
  const now = new Date("2026-10-12T00:00:00.000Z");

  it("anchors every catalyst with all three time markers", () => {
    const signals = scanDeepResearch(
      [article({ headline: "Firm bags order worth 1,200 crore on October 5, 2026", summary: "Delivery expected in Q4 2026." })],
      { now, windowDays: 30 },
    );
    expect(signals).toHaveLength(1);
    const t = signals[0].temporal;
    // 1. event / announcement date
    expect(t.eventDate).toBe("2026-10-05");
    expect(t.eventDateLabel?.toLowerCase()).toContain("october 5, 2026");
    expect(t.eventDateBasis).toBe("stated_in_source");
    // 2. document / filing date
    expect(t.documentDate).toBe("2026-10-12");
    // 3. target execution timeline
    expect(t.executionTimeline).toBe("Q4 2026");
    expect(t.executionBasis).toBe("stated_in_source");
  });

  it("reads the announcement date in both common formats", () => {
    const a = scanDeepResearch([article({ headline: "Partnership signed on 5 October 2026" })], { now });
    const b = scanDeepResearch([article({ headline: "Partnership signed October 5, 2026" })], { now });
    expect(a[0].temporal.eventDate).toBe("2026-10-05");
    expect(b[0].temporal.eventDate).toBe("2026-10-05");
  });

  it("parses fiscal-year, half-year and immediate execution timelines", () => {
    const cases: Array<[string, string]> = [
      ["Order win, to be executed in FY2027", "FY2027"],
      ["Expansion to be commissioned by March 2027", "By March 2027"],
      ["Approval granted with immediate effect", "Immediate"],
      ["Contract effective H2 2027", "H2 2027"],
    ];
    for (const [summary, expected] of cases) {
      const signals = scanDeepResearch([article({ headline: "Firm bags order", summary })], { now });
      expect(signals[0]?.temporal.executionTimeline).toBe(expected);
    }
  });

  it("never claims a stated date when the text names none", () => {
    const signals = scanDeepResearch([article({ headline: "Firm bags a major order" })], { now });
    const t = signals[0].temporal;
    expect(t.eventDateBasis).toBe("document_date");
    expect(t.eventDate).toBe(t.documentDate);
    expect(t.executionTimeline).toBeNull();
    expect(t.executionBasis).toBe("unstated");
  });

  it("drops events outside the tracking window", () => {
    const result = scanDeepResearchDetailed(
      [article({ headline: "Firm bags order worth 100 crore announced on March 2, 2025", published_at: "2026-10-12T00:00:00.000Z" })],
      { now, windowDays: 30 },
    );
    expect(result.signals).toHaveLength(0);
    expect(result.excludedOutOfWindow).toBe(1);
    expect(result.windowStart).toBe("2026-09-12");
  });

  it("keeps an out-of-window event when it is a current update to an earlier agreement", () => {
    const result = scanDeepResearchDetailed(
      [
        article({
          headline: "Firm bags additional order under the earlier agreement signed on March 2, 2025",
          published_at: "2026-10-12T00:00:00.000Z",
        }),
      ],
      { now, windowDays: 30 },
    );
    expect(result.excludedOutOfWindow).toBe(0);
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0].isHistoricalUpdate).toBe(true);
  });

  it("keeps an undated catalyst and anchors it to the filing date", () => {
    const result = scanDeepResearchDetailed(
      [article({ headline: "Firm to expand capacity", published_at: "2026-10-01T00:00:00.000Z" })],
      { now, windowDays: 30 },
    );
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0].temporal.documentDate).toBe("2026-10-01");
  });
});
