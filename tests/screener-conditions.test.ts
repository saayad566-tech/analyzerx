import { describe, expect, it } from "vitest";
import { evaluateCondition, parseCondition, runCondition } from "../packages/quant-engine/src/conditions";
import type { Candle } from "../packages/quant-engine/src/core-types";

/** Build ascending candles. Volume defaults to 100 on every bar except the last. */
function bars(closes: number[], lastVolume = 100, baseVolume = 100): Candle[] {
  return closes.map((close, i) => ({
    time: 1_700_000_000_000 + i * 86_400_000,
    open: close,
    high: close,
    low: close,
    close,
    volume: i === closes.length - 1 ? lastVolume : baseVolume,
  }));
}

const RISING = bars(Array.from({ length: 20 }, (_, i) => 100 + i));
const FALLING = bars(Array.from({ length: 20 }, (_, i) => 120 - i));

describe("condition language — parsing", () => {
  it("parses the product's own examples", () => {
    const a = parseCondition("RSI < 30 and Volume > 5x");
    expect(a.ok).toBe(true);
    if (a.ok) expect(a.canonical).toBe("rsi(14) < 30 and volume > 5x");

    const b = parseCondition("Price > 200 EMA and changePct(3) > 10%");
    expect(b.ok).toBe(true);
    if (b.ok) expect(b.canonical).toBe("price > ema(200) and changePct(3) > 10");
  });

  it("parses boolean structure with parentheses and not", () => {
    const r = parseCondition("not (close > 100 or close < 50) and volume > 0");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.canonical).toBe("not (close > 100 or close < 50) and volume > 0");
  });

  it("reports a precise error instead of guessing at free text", () => {
    const bad = parseCondition("10% gain in 3 days");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.position).toBeGreaterThanOrEqual(0);

    const unknown = parseCondition("hello > 5");
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error.message).toContain("hello");

    const dangling = parseCondition("close >");
    expect(dangling.ok).toBe(false);

    const trailing = parseCondition("close > 5 and");
    expect(trailing.ok).toBe(false);

    const unclosed = parseCondition("(close > 5");
    expect(unclosed.ok).toBe(false);
  });
});

describe("condition language — evaluation", () => {
  it("computes RSI on a rising and a falling series", () => {
    const up = runCondition("rsi(14) > 70", RISING);
    expect(up.ok && up.result.passed).toBe(true);
    const down = runCondition("rsi(14) < 30", FALLING);
    expect(down.ok && down.result.passed).toBe(true);
    // And the opposite must be false, not vacuously true.
    const opposite = runCondition("rsi(14) < 30", RISING);
    expect(opposite.ok && opposite.result.passed).toBe(false);
  });

  it("resolves a 5x volume literal against the 20-bar mean", () => {
    const c = bars([100, 100, 100, 100, 100], 1000, 100); // last volume 10x the baseline
    const above = runCondition("volume > 5x", c);
    expect(above.ok && above.result.passed).toBe(true);
    const below = runCondition("volume > 20x", c);
    expect(below.ok && below.result.passed).toBe(false);
  });

  it("treats `10%` as the number 10 and respects the boundary", () => {
    const c = bars([100, 100, 100, 100, 110]); // changePct(3) === 10
    const gte = runCondition("changePct(3) >= 10%", c);
    expect(gte.ok && gte.result.passed).toBe(true);
    const gt = runCondition("changePct(3) > 10%", c);
    expect(gt.ok && gt.result.passed).toBe(false);
  });

  it("compares price against a moving average", () => {
    const above = runCondition("close > sma(3)", RISING);
    expect(above.ok && above.result.passed).toBe(true);
    const below = runCondition("close < sma(3)", RISING);
    expect(below.ok && below.result.passed).toBe(false);
  });

  it("never passes on missing data — it flags it", () => {
    const short = bars([100, 101, 102]);
    const r = runCondition("close > ema(200)", short);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.insufficientData).toBe(true);
      expect(r.result.passed).toBe(false);
    }
  });

  it("handles and / or / not with real short-circuit semantics", () => {
    const c = bars([100, 100, 100, 100, 110], 1000, 100);
    expect(runCondition("changePct(3) > 5% and volume > 5x", c).ok).toBe(true);
    const both = runCondition("changePct(3) > 5% and volume > 5x", c);
    expect(both.ok && both.result.passed).toBe(true);

    const oneFalse = runCondition("changePct(3) > 50% and volume > 5x", c);
    expect(oneFalse.ok && oneFalse.result.passed).toBe(false);

    const eitherTrue = runCondition("changePct(3) > 50% or volume > 5x", c);
    expect(eitherTrue.ok && eitherTrue.result.passed).toBe(true);

    const negated = runCondition("not (changePct(3) > 50%)", c);
    expect(negated.ok && negated.result.passed).toBe(true);
  });

  it("returns the clause detail so the UI can explain a match", () => {
    const c = bars([100, 100, 100, 100, 110], 1000, 100);
    const r = runCondition("changePct(3) > 5% and volume > 5x", c);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.clauses).toHaveLength(2);
      expect(r.result.clauses[0].left).toBeCloseTo(10, 6);
      expect(r.result.clauses[1].left).toBe(1000);
      expect(r.result.clauses[1].right).toBeCloseTo(500, 6);
    }
  });

  it("evaluates a parsed AST directly", () => {
    const parsed = parseCondition("close > 100");
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(evaluateCondition(parsed.ast, RISING).passed).toBe(true);
  });
});
