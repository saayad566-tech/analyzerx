/**
 * Chart geometry.
 *
 * The properties that matter for a chart that must not lie: a candle body spans open to
 * close, a bar with no open is drawn as a tick rather than a fabricated body, a polyline
 * breaks at a gap instead of bridging it, and a pane scales bounded indicators to their
 * real range.
 */
import { describe, it, expect } from "vitest";
import { buildCandles, buildOverlay, buildPane, priceExtent, toPolylines } from "../lib/chart-geometry";

const bar = (o: number | null, h: number | null, l: number | null, c: number, v: number | null = 100) => ({ t: "2026-01-01", o, h, l, c, v });

describe("price extent", () => {
  it("spans the visible high and low", () => {
    const { min, max } = priceExtent([bar(10, 12, 8, 11), bar(11, 15, 9, 14)]);
    expect(min).toBeLessThan(8);
    expect(max).toBeGreaterThan(15);
  });

  it("falls back to the close when a bar has no high or low", () => {
    const { min, max } = priceExtent([bar(null, null, null, 100)]);
    expect(min).toBeLessThan(100);
    expect(max).toBeGreaterThan(100);
  });

  it("returns a usable range for an empty series rather than NaN", () => {
    const { min, max } = priceExtent([]);
    expect(Number.isFinite(min)).toBe(true);
    expect(Number.isFinite(max)).toBe(true);
    expect(max).toBeGreaterThan(min);
  });

  it("widens a flat series so the line is not drawn on the edge", () => {
    const { min, max } = priceExtent([bar(50, 50, 50, 50)]);
    expect(max).toBeGreaterThan(min);
  });
});

describe("candles", () => {
  const bars = [bar(10, 12, 9, 11), bar(11, 13, 10, 10), bar(10, 14, 10, 14)];

  it("draws a body from open to close", () => {
    const { candles } = buildCandles(bars, 300, 260, 10, 18);
    const first = candles[0];
    expect(first).not.toBeNull();
    // Body top is the higher of open and close, so height is |open - close| in pixels.
    expect(first!.bodyHeight).toBeGreaterThan(0);
    expect(first!.bodyY).toBeLessThanOrEqual(first!.closeY + 0.001);
  });

  it("marks a bar up when close is at or above open", () => {
    const { candles } = buildCandles(bars, 300, 260, 10, 18);
    expect(candles[0]!.up).toBe(true);   // 10 -> 11
    expect(candles[1]!.up).toBe(false);  // 11 -> 10
  });

  it("draws the wick to the high and low, not to the body", () => {
    const { candles } = buildCandles(bars, 300, 260, 10, 18);
    const first = candles[0]!;
    expect(first.wickTop).toBeLessThan(first.bodyY);
    expect(first.wickBottom).toBeGreaterThan(first.bodyY + first.bodyHeight - 0.001);
  });

  it("draws a close-only bar as a tick, not a fabricated body", () => {
    const { candles } = buildCandles([bar(null, null, null, 42)], 300, 260, 10, 18);
    const only = candles[0]!;
    expect(only.bodyHeight).toBe(0);
    expect(only.wickTop).toBe(only.wickBottom);
  });

  it("gives every candle the same slot width", () => {
    const { slot } = buildCandles(bars, 300, 260, 10, 18);
    expect(slot).toBeCloseTo(100, 6);
  });

  it("produces grid labels from the visible range", () => {
    const { gridLines } = buildCandles(bars, 300, 260, 10, 18);
    expect(gridLines).toHaveLength(5);
    for (const line of gridLines) expect(line.label.length).toBeGreaterThan(0);
  });
});

describe("polylines", () => {
  it("breaks the line at a gap rather than bridging it", () => {
    const lines = toPolylines([1, 2, null, 4, 5], 10, (value) => 100 - value);
    expect(lines).toHaveLength(2);
  });

  it("returns one line for a contiguous series", () => {
    expect(toPolylines([1, 2, 3, 4], 10, (v) => 100 - v)).toHaveLength(1);
  });

  it("returns nothing for an all-null series", () => {
    expect(toPolylines([null, null], 10, (v) => v)).toEqual([]);
  });

  it("drops a lone point, which cannot form a line", () => {
    expect(toPolylines([null, 5, null], 10, (v) => 100 - v)).toEqual([]);
  });
});

describe("overlays", () => {
  const closes = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 5) * 8);
  const input = { highs: closes.map((c) => c + 1), lows: closes.map((c) => c - 1), closes, volumes: closes.map(() => 1000) };
  const scale = { min: 80, max: 120, height: 260, top: 10, bottom: 18, toY: (v: number) => 10 + ((120 - v) / 40) * 232 };

  it("draws a moving average as one line", () => {
    expect(buildOverlay("ema", input, {}, scale, 300).polylines).toHaveLength(1);
  });

  it("draws Bollinger as three lines (middle, upper, lower)", () => {
    expect(buildOverlay("bollinger", input, {}, scale, 300).polylines).toHaveLength(3);
  });

  it("draws nothing for a panel-only indicator asked to overlay", () => {
    expect(buildOverlay("rsi", input, {}, scale, 300).polylines).toEqual([]);
  });
});

describe("panes", () => {
  const closes = Array.from({ length: 80 }, (_, i) => 100 + Math.sin(i / 4) * 10);
  const input = { highs: closes.map((c) => c + 1), lows: closes.map((c) => c - 1), closes, volumes: closes.map((_, i) => 900 + i) };

  it("scales RSI to a fixed 0-100 axis", () => {
    const pane = buildPane("rsi", input, {}, 300, 96, 10, 18);
    expect(pane.lines.length).toBeGreaterThan(0);
    const labels = pane.gridLines.map((line) => line.label);
    expect(labels).toContain("70");
    expect(labels).toContain("30");
  });

  it("draws a MACD histogram as bars around zero", () => {
    const pane = buildPane("macd", input, {}, 300, 96, 10, 18);
    expect(pane.bars.length).toBeGreaterThan(0);
    expect(pane.bars.some((b) => b.positive)).toBe(true);
    for (const entry of pane.bars) expect(entry.height).toBeGreaterThan(0);
  });

  it("reports a readout, and says so when there is no defined value", () => {
    expect(buildPane("rsi", input, {}, 300, 96, 10, 18).readout).toMatch(/latest/i);
    const tiny = { highs: [1], lows: [1], closes: [1], volumes: [1] };
    expect(buildPane("rsi", tiny, {}, 300, 96, 10, 18).readout).toMatch(/not enough/i);
  });

  it("refuses a price-pane indicator rather than drawing it in a panel", () => {
    const pane = buildPane("ema", input, {}, 300, 96, 10, 18);
    expect(pane.lines).toEqual([]);
    expect(pane.readout).toMatch(/price pane/i);
  });

  it("produces no lines for an indicator with no data, instead of a flat zero line", () => {
    const tiny = { highs: [1, 1], lows: [1, 1], closes: [1, 1], volumes: [1, 1] };
    expect(buildPane("rsi", tiny, {}, 300, 96, 10, 18).lines).toEqual([]);
  });
});
