import { describe, expect, it } from "vitest";

import { candleProblem, describeSeries, parseCsv, parseJson, parseOhlcv, parseTimestamp, validateCandles } from "../lib/quant/ohlcv";
import type { Candle } from "../lib/quant/types";

const candle = (time: number, open: number, high: number, low: number, close: number, volume = 1): Candle => ({ time, open, high, low, close, volume });

describe("parseTimestamp", () => {
  it("accepts ISO dates, epoch seconds and epoch milliseconds", () => {
    expect(parseTimestamp("2024-01-01T00:00:00Z")).toBe(Date.parse("2024-01-01T00:00:00Z"));
    expect(parseTimestamp("1700000000")).toBe(1_700_000_000_000);
    expect(parseTimestamp("1700000000000")).toBe(1_700_000_000_000);
    expect(parseTimestamp(1_700_000_000)).toBe(1_700_000_000_000);
  });

  it("rejects nonsense rather than mis-dating the series", () => {
    expect(parseTimestamp("not a date")).toBeNull();
    expect(parseTimestamp("")).toBeNull();
    expect(parseTimestamp("0")).toBeNull();
    expect(parseTimestamp("5")).toBeNull(); // too small to be a real epoch
    expect(parseTimestamp(undefined)).toBeNull();
  });
});

describe("candleProblem", () => {
  it("accepts a well-formed bar", () => {
    expect(candleProblem(candle(1, 10, 12, 9, 11))).toBeNull();
  });

  it("rejects impossible bars", () => {
    expect(candleProblem(candle(1, 10, 9, 12, 11))).toContain("high is below low");
    expect(candleProblem(candle(1, 10, 12, 9, 13))).toContain("high is below the open/close");
    expect(candleProblem(candle(1, 10, 12, 9, 8))).toContain("low is above the open/close");
    expect(candleProblem(candle(1, 10, 12, 9, 11, -5))).toContain("negative volume");
    expect(candleProblem(candle(1, -1, -1, -1, -1))).toContain("non-positive price");
    expect(candleProblem(candle(1, 0, 12, 9, 11))).not.toBeNull(); // still rejected, by the geometry rule
    expect(candleProblem(candle(1, 10, 12, 9, Number.NaN))).toContain("non-finite");
    expect(candleProblem(candle(0, 10, 12, 9, 11))).toContain("invalid timestamp");
  });
});

describe("validateCandles", () => {
  it("sorts ascending and drops unusable bars", () => {
    const result = validateCandles([candle(3, 10, 12, 9, 11), candle(1, 10, 12, 9, 11), candle(2, 10, 9, 12, 11)]);
    expect(result.candles.map((c) => c.time)).toEqual([1, 3]);
    expect(result.dropped).toBe(1);
    expect(result.issues).toHaveLength(1);
  });

  it("collapses duplicate timestamps keeping the last occurrence", () => {
    const result = validateCandles([candle(1, 10, 12, 9, 11), candle(1, 20, 22, 19, 21)]);
    expect(result.candles).toHaveLength(1);
    expect(result.candles[0].close).toBe(21);
  });
});

describe("parseCsv", () => {
  it("parses a comma-separated file with ISO dates", () => {
    const csv = "time,open,high,low,close,volume\n2024-01-01,10,12,9,11,100\n2024-01-02,11,13,10,12,150";
    const result = parseCsv(csv);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.candles).toHaveLength(2);
    expect(result.candles[0].close).toBe(11);
    expect(result.candles[1].volume).toBe(150);
    expect(result.candles[0].time).toBe(Date.parse("2024-01-01"));
  });

  it("auto-detects a semicolon delimiter and epoch-second timestamps", () => {
    const csv = "time;open;high;low;close\n1700000000;10;12;9;11\n1700086400;11;13;10;12";
    const result = parseCsv(csv);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.candles[0].time).toBe(1_700_000_000_000);
    expect(result.candles).toHaveLength(2);
  });

  it("rejects a file with no close column", () => {
    const result = parseCsv("time,open,high,low\n2024-01-01,10,12,9");
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.reason).toContain("close");
  });

  it("rejects a file with no data rows", () => {
    expect(parseCsv("time,open,high,low,close").status).toBe("error");
  });

  it("drops unparsable rows and reports them instead of inventing values", () => {
    const csv = "time,open,high,low,close\n2024-01-01,10,12,9,11\n2024-01-02,abc,13,10,12\n2024-01-03,11,13,10,12";
    const result = parseCsv(csv);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.candles).toHaveLength(2);
    expect(result.dropped).toBeGreaterThanOrEqual(1);
    expect(result.issues.length).toBeGreaterThanOrEqual(1);
  });

  it("tolerates currency symbols and thousands separators", () => {
    const csv = "time,open,high,low,close\n2024-01-01,\"1,000\",1200,900,\"1,100\"";
    const result = parseCsv(csv);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.candles[0].open).toBe(1_000);
    expect(result.candles[0].close).toBe(1_100);
  });

  it("notes synthetic spacing when there is no time column, rather than pretending", () => {
    const csv = "open,high,low,close\n10,12,9,11\n11,13,10,12";
    const result = parseCsv(csv);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.notes.join(" ")).toContain("one day apart");
    expect(result.candles[1].time - result.candles[0].time).toBe(86_400_000);
  });
});

describe("parseJson", () => {
  it("parses an array of objects", () => {
    const json = JSON.stringify([{ time: 1_700_000_000, open: 10, high: 12, low: 9, close: 11 }]);
    const result = parseJson(json);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.candles).toHaveLength(1);
  });

  it("accepts an object wrapper and short field names", () => {
    const json = JSON.stringify({ data: [{ t: 1, o: 10, h: 12, l: 9, c: 11 }] });
    const result = parseJson(json);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.candles[0].close).toBe(11);
  });

  it("reports malformed JSON and a missing array clearly", () => {
    expect(parseJson("{not json").status).toBe("error");
    const noArray = parseJson(JSON.stringify({ hello: "world" }));
    expect(noArray.status).toBe("error");
    if (noArray.status === "error") expect(noArray.reason).toContain("array");
  });
});

describe("parseOhlcv auto-detection", () => {
  it("routes JSON-looking input to the JSON parser and the rest to CSV", () => {
    expect(parseOhlcv("[]").status).toBe("error"); // empty JSON array → no rows
    const csv = parseOhlcv("open,high,low,close\n10,12,9,11");
    expect(csv.status).toBe("ok");
  });

  it("rejects empty input", () => {
    expect(parseOhlcv("   ").status).toBe("error");
  });
});

describe("describeSeries", () => {
  it("reports the bar count and span honestly", () => {
    const info = describeSeries([candle(0, 1, 1, 1, 1), candle(86_400_000, 1, 1, 1, 1)]);
    expect(info.bars).toBe(2);
    expect(info.spanDays).toBeCloseTo(1, 6);
  });

  it("handles an empty series", () => {
    expect(describeSeries([])).toEqual({ bars: 0, from: null, to: null, spanDays: null });
  });
});
