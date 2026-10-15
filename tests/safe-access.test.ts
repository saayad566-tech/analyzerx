import { describe, expect, it } from "vitest";

import {
  arrayAt,
  metricBasis,
  metricUnit,
  metricValueOf,
  objectAt,
  summaryFirstUnit,
  summaryLatestPeriod,
  summaryLatestValue,
} from "../lib/safe-access";

describe("metric access (crash: \"Cannot read property 'basis' of undefined\")", () => {
  it("never throws when the metric object itself is missing", () => {
    for (const value of [undefined, null, {}, "text", 0]) {
      expect(() => metricBasis(value)).not.toThrow();
      expect(metricBasis(value)).toBe("unavailable");
      expect(metricValueOf(value)).toBeNull();
      expect(metricUnit(value)).toBeNull();
    }
  });

  it("reads a real metric", () => {
    const metric = { value: 12.5, basis: "reported", unit: "%" };
    expect(metricValueOf(metric)).toBe(12.5);
    expect(metricBasis(metric)).toBe("reported");
    expect(metricUnit(metric)).toBe("%");
  });

  it("falls back for a blank basis rather than rendering empty", () => {
    expect(metricBasis({ value: 1, basis: "   " })).toBe("unavailable");
    expect(metricBasis({ value: 1 }, "estimated")).toBe("estimated");
  });

  it("rejects non-finite values", () => {
    expect(metricValueOf({ value: Number.NaN })).toBeNull();
    expect(metricValueOf({ value: Number.POSITIVE_INFINITY })).toBeNull();
  });
});

describe("summary access (crash: \"Cannot read property 'latestValue' of undefined\")", () => {
  it("never throws when summary is missing", () => {
    for (const value of [undefined, null, "text", 42, []]) {
      expect(() => summaryLatestValue(value)).not.toThrow();
      expect(summaryLatestValue(value)).toBeNull();
      expect(summaryLatestPeriod(value)).toBeNull();
      expect(summaryFirstUnit(value)).toBeNull();
    }
  });

  it("reads a real summary", () => {
    const summary = { latestPeriod: "2026-09", latestValue: 3.25, units: ["%", "index"] };
    expect(summaryLatestValue(summary)).toBe(3.25);
    expect(summaryLatestPeriod(summary)).toBe("2026-09");
    expect(summaryFirstUnit(summary)).toBe("%");
  });

  it("handles an empty or malformed units array", () => {
    expect(summaryFirstUnit({ units: [] })).toBeNull();
    expect(summaryFirstUnit({ units: "not-an-array" })).toBeNull();
    expect(summaryFirstUnit({ units: [null, "", "ok"] })).toBe("ok");
  });
});

describe("nested access", () => {
  it("reads a nested object without crashing", () => {
    expect(objectAt({ a: { b: 1 } }, "a")).toEqual({ b: 1 });
    expect(objectAt({ a: 1 }, "a")).toBeNull();
    expect(objectAt(undefined, "a")).toBeNull();
    expect(objectAt(null, "a")).toBeNull();
  });

  it("reads a nested array without crashing", () => {
    expect(arrayAt({ a: [1, 2] }, "a")).toEqual([1, 2]);
    expect(arrayAt({ a: "x" }, "a")).toEqual([]);
    expect(arrayAt(undefined, "a")).toEqual([]);
  });

  it("supports the exact chained read that used to crash", () => {
    // metrics.operatingCashFlow.basis
    const payload: Record<string, unknown> = { metrics: {} };
    const metric = objectAt(payload, "metrics")?.operatingCashFlow;
    expect(() => metricBasis(metric as { basis?: unknown })).not.toThrow();
    expect(metricBasis(metric as { basis?: unknown })).toBe("unavailable");
  });
});
