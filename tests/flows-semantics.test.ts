import { describe, expect, it } from "vitest";

import {
  FLOW_RANGE_DAYS,
  applyFlowFilters,
  isTradingSession,
  latestTradingSession,
  matchesSignalFilter,
  percentChangeConvention,
  resolveFlowPeriod,
} from "../lib/flows-semantics";

describe("percentChangeConvention (FIX 06)", () => {
  it("computes a normal percentage change", () => {
    const result = percentChangeConvention(150, 100);
    expect(result.pct).toBe(50);
    expect(result.status).toBe("ok");
  });

  it("returns undefined rather than a misleading figure for a zero denominator", () => {
    const result = percentChangeConvention(100, 0);
    expect(result.pct).toBeNull();
    expect(result.status).toBe("zero-denominator");
    expect(result.label).toMatch(/prior period was zero/i);
  });

  it("returns undefined when the sign reverses between periods", () => {
    // -100 → +100 is a sign flip, not a "+200%" increase.
    const result = percentChangeConvention(100, -100);
    expect(result.pct).toBeNull();
    expect(result.status).toBe("sign-reversal");
    expect(result.label).toMatch(/reversed sign/i);
  });

  it("handles missing and non-finite inputs", () => {
    expect(percentChangeConvention(null, 100).status).toBe("missing");
    expect(percentChangeConvention(100, null).status).toBe("missing");
    expect(percentChangeConvention(Number.NaN, 100).status).toBe("missing");
  });

  it("reproduces the reported figures from their source values", () => {
    // -9484.22 vs a prior period, and +10041.84 vs its prior period.
    // Both periods negative (no sign flip): a percentage is defined.
    expect(percentChangeConvention(-9484.22, -9035.0).pct).toBeCloseTo(-4.97, 1);
    expect(percentChangeConvention(10041.84, 6952.0).pct).toBeCloseTo(44.44, 1);
  });
});

describe("trading calendar (FIX 06)", () => {
  it("excludes weekends", () => {
    expect(isTradingSession("2026-10-10")).toBe(false); // Saturday
    expect(isTradingSession("2026-10-11")).toBe(false); // Sunday
    expect(isTradingSession("2026-10-12")).toBe(true); // Monday
  });

  it("excludes listed holidays", () => {
    expect(isTradingSession("2026-10-12", { holidays: ["2026-10-12"] })).toBe(false);
  });

  it("finds the latest trading session, skipping a weekend", () => {
    // Sunday 11 Oct 2026 → the latest session is Friday 9 Oct.
    expect(latestTradingSession(new Date("2026-10-11T12:00:00Z"))).toBe("2026-10-09");
    expect(latestTradingSession(new Date("2026-10-12T12:00:00Z"))).toBe("2026-10-12");
  });
});

describe("resolveFlowPeriod (FIX 06)", () => {
  const now = new Date("2026-10-12T12:00:00Z");

  it("says so when today's report is not published, and names the latest session", () => {
    const result = resolveFlowPeriod("TODAY", ["2026-10-01", "2026-09-30"], now);
    expect(result.upToDate).toBe(false);
    expect(result.latestAvailableSession).toBe("2026-10-01");
    expect(result.note).toMatch(/has not been published/i);
    expect(result.note).toContain("2026-10-01");
    // The old data is never relabelled as today's.
    expect(result.note).not.toMatch(/showing today/i);
  });

  it("reports up to date when the newest session is present", () => {
    const result = resolveFlowPeriod("TODAY", ["2026-10-12", "2026-10-09"], now);
    expect(result.upToDate).toBe(true);
    expect(result.sessions).toEqual(["2026-10-12"]);
  });

  it("bounds a range to its window and never includes future sessions", () => {
    const sessions = ["2026-10-20", "2026-10-12", "2026-10-09", "2026-10-01", "2026-09-01"];
    const week = resolveFlowPeriod("ONE_WEEK", sessions, now);
    expect(week.sessions).not.toContain("2026-10-20");
    expect(week.sessions).not.toContain("2026-09-01");
    expect(week.sessions).toContain("2026-10-12");
    expect(FLOW_RANGE_DAYS.ONE_WEEK).toBe(7);
  });

  it("handles an empty provider response", () => {
    const result = resolveFlowPeriod("TODAY", [], now);
    expect(result.latestAvailableSession).toBeNull();
    expect(result.note).toMatch(/No report sessions are available/i);
  });
});

describe("flow filters (FIX 06)", () => {
  const rows = [
    { entity: "FII net flow", category: "FII", changeLabel: "Aggregate participant data" },
    { entity: "DII net flow", category: "DII", changeLabel: "Aggregate participant data" },
    { entity: "Reliance Industries", category: "Bulk deals", changeLabel: "Company buyback announced" },
    { entity: "NTPC", category: "Bulk deals", changeLabel: "Government order award" },
  ];

  it("restricts to buyback signals so aggregate FII/DII cards disappear", () => {
    const result = applyFlowFilters(rows, { category: null, signal: "buyback" });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].entity).toBe("Reliance Industries");
    expect(result.rows.some((row) => row.category === "FII" || row.category === "DII")).toBe(false);
  });

  it("restricts to government-benefit signals", () => {
    const result = applyFlowFilters(rows, { category: null, signal: "governmentBenefit" });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].entity).toBe("NTPC");
  });

  it("returns a clear empty reason instead of fabricating records", () => {
    const result = applyFlowFilters([{ entity: "FII net flow", category: "FII" }], { category: null, signal: "buyback" });
    expect(result.rows).toHaveLength(0);
    expect(result.emptyReason).toMatch(/no verified buyback signals/i);
  });

  it("combines a category filter with a signal filter", () => {
    const result = applyFlowFilters(rows, { category: "Bulk deals", signal: "buyback" });
    expect(result.rows).toHaveLength(1);
    const none = applyFlowFilters(rows, { category: "FII", signal: "buyback" });
    expect(none.rows).toHaveLength(0);
    expect(none.emptyReason).toMatch(/buyback/i);
  });

  it("matches signals only on the record's own text", () => {
    expect(matchesSignalFilter({ entity: "Reliance buyback" }, "buyback")).toBe(true);
    expect(matchesSignalFilter({ entity: "Reliance results" }, "buyback")).toBe(false);
  });
});
