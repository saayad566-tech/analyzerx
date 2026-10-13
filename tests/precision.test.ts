import { describe, expect, it } from "vitest";

import {
  clampNumber,
  compare,
  difference,
  isNegative,
  isPositive,
  isZero,
  mean,
  meanBy,
  num,
  percentChange,
  percentOf,
  product,
  quotient,
  ratio,
  round,
  sum,
  sumBy,
  sumValid,
  toFixedString,
} from "../lib/precision";

describe("precision layer — exact decimal arithmetic", () => {
  it("avoids binary floating-point drift", () => {
    expect(sum([0.1, 0.2])).toBe(0.3);
    expect(difference(0.3, 0.1)).toBe(0.2);
    expect(product(1.1, 3)).toBe(3.3);
  });

  it("computes institutional-flow nets exactly (the security-wise-flow case)", () => {
    expect(difference(10000.1, 9999.05)).toBe(1.05);
    expect(round(difference(10000.1, 9999.05), 2)).toBe(1.05);
    expect(difference(0.3, 0.1)).toBe(0.2);
  });

  it("computes percentage change with a signed denominator and zero guard", () => {
    expect(percentChange(100, 110)).toBe(10);
    expect(percentChange(-100, -50)).toBe(-50);
    expect(percentChange(0, 5)).toBeNull();
    expect(percentChange(Number.NaN, 5)).toBeNull();
  });

  it("returns null on divide-by-zero instead of Infinity/NaN", () => {
    expect(quotient(5, 0)).toBeNull();
    expect(ratio(0, 0)).toBeNull();
    expect(percentOf(25, 0)).toBeNull();
  });

  it("treats every invalid input as null", () => {
    expect(num(Number.NaN)).toBeNull();
    expect(num(Number.POSITIVE_INFINITY)).toBeNull();
    expect(num(Number.NEGATIVE_INFINITY)).toBeNull();
    expect(num(null)).toBeNull();
    expect(num(undefined)).toBeNull();
    expect(num("")).toBeNull();
    expect(num("abc")).toBeNull();
    expect(num(".")).toBeNull();
  });

  it("parses currency strings, commas and signs", () => {
    expect(num("₹1,234.50")).toBe(1234.5);
    expect(num("-1,000")).toBe(-1000);
  });

  it("rounds half away from zero deterministically", () => {
    expect(round(2.5, 0)).toBe(3);
    expect(round(-2.5, 0)).toBe(-3);
    expect(round(1.005, 2)).toBe(1.01);
    expect(round(1.2345, 2)).toBe(1.23);
  });

  it("formats fixed-precision strings", () => {
    expect(toFixedString(1234.5, 2)).toBe("1234.50");
    expect(toFixedString(-0.005, 2)).toBe("-0.01");
    expect(toFixedString(10, 0)).toBe("10");
  });

  it("aggregates safely, skipping invalid entries", () => {
    expect(sumValid([1, "x", 2, null, 3])).toBe(6);
    expect(sumValid([null, "x"])).toBeNull();
    expect(mean([2, 4, 6])).toBe(4);
    expect(meanBy([{ v: 1 }, { v: 2 }, { v: null }], (row) => row.v)).toBe(1.5);
    expect(sumBy([{ v: 1 }, { v: 2 }], (row) => row.v)).toBe(3);
  });

  it("clamps within a valid range and rejects a bad range", () => {
    expect(clampNumber(150, 0, 100)).toBe(100);
    expect(clampNumber("x", 0, 100)).toBeNull();
    expect(clampNumber(5, 100, 0)).toBeNull();
  });

  it("compares and classifies signs", () => {
    expect(compare(2, 2)).toBe(0);
    expect(compare(1, 2)).toBe(-1);
    expect(compare(3, 2)).toBe(1);
    expect(isZero(0)).toBe(true);
    expect(isPositive(0.0001)).toBe(true);
    expect(isNegative(-0.0001)).toBe(true);
  });

  it("is deterministic — identical inputs always yield identical outputs", () => {
    const first = round(percentChange(1234.5678, 9876.5432), 6);
    const second = round(percentChange(1234.5678, 9876.5432), 6);
    expect(first).toBe(second);
  });
});
