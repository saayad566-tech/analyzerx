/**
 * Natural-language screener.
 *
 * The properties that matter: a phrase is either understood exactly or reported as
 * unparsed — never silently dropped; the comparator is never inverted; and a candidate
 * whose indicator is undefined is excluded rather than counted as a match.
 */
import { describe, it, expect } from "vitest";
import { parseScreen, summarise, evaluateCondition, runScreen, EXAMPLE_SCREENS, type ScreenerCandidate } from "../lib/nl-screener";

/** A rising series: RSI will be high and price above its averages. */
const rising = (n = 120) => ({
  symbol: "RISE",
  bars: Array.from({ length: n }, (_, i) => ({ o: 100 + i - 0.5, h: 101 + i, l: 99 + i, c: 100 + i, v: 1000 + i })),
});
/** A falling series: RSI will be low and price below its averages. */
const falling = (n = 120) => ({
  symbol: "FALL",
  bars: Array.from({ length: n }, (_, i) => ({ o: 200 - i + 0.5, h: 201 - i, l: 199 - i, c: 200 - i, v: 1000 + i })),
});

describe("parsing", () => {
  it("reads an RSI threshold with the right comparator", () => {
    const parsed = parseScreen("RSI below 30");
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.conditions).toHaveLength(1);
    expect(parsed.conditions[0].indicator).toBe("rsi");
    expect(parsed.conditions[0].comparator).toBe("below");
    expect(parsed.conditions[0].value).toBe(30);
  });

  it("never inverts above and below", () => {
    expect(parseScreen("RSI above 70").conditions[0].comparator).toBe("above");
    expect(parseScreen("RSI below 70").conditions[0].comparator).toBe("below");
    expect(parseScreen("RSI greater than 70").conditions[0].comparator).toBe("above");
    expect(parseScreen("RSI less than 70").conditions[0].comparator).toBe("below");
  });

  it("splits several conditions on joining words", () => {
    const parsed = parseScreen("RSI below 30 and MACD above 0 and ADX above 25");
    expect(parsed.conditions).toHaveLength(3);
    expect(parsed.conditions.map((c) => c.indicator)).toEqual(["rsi", "macd", "adx"]);
    expect(parsed.unparsed).toEqual([]);
  });

  it("recognises a crossover, not just a level", () => {
    const parsed = parseScreen("MACD crosses above 0");
    expect(parsed.conditions[0].comparator).toBe("crossesAbove");
  });

  it("recognises a two-line comparison", () => {
    expect(parseScreen("MACD above signal").conditions[0].secondary).toBe("signal");
    expect(parseScreen("stochastic %K above %D").conditions[0].secondary).toBe("d");
    expect(parseScreen("price above upper Bollinger Band").conditions[0].secondary).toBe("upper");
  });

  it("reads a lookback period", () => {
    expect(parseScreen("price above 200-day EMA").conditions[0].period).toBe(200);
    expect(parseScreen("RSI(14) below 30").conditions[0].period).toBe(14);
  });

  it("reads a range", () => {
    const parsed = parseScreen("RSI between 40 and 60");
    expect(parsed.conditions[0].comparator).toBe("between");
    expect(parsed.conditions[0].value).toBe(40);
    expect(parsed.conditions[0].valueUpper).toBe(60);
  });

  it("reports what it could not read instead of dropping it", () => {
    const parsed = parseScreen("RSI below 30 and make me a sandwich");
    expect(parsed.conditions).toHaveLength(1);
    expect(parsed.unparsed).toContain("make me a sandwich");
  });

  it("returns nothing for gibberish rather than inventing a condition", () => {
    const parsed = parseScreen("the quick brown fox");
    expect(parsed.conditions).toHaveLength(0);
    expect(parsed.unparsed.length).toBeGreaterThan(0);
    expect(parsed.summary).toMatch(/no conditions/i);
  });

  it("uses OR only when the query says or", () => {
    expect(parseScreen("RSI below 30 or RSI above 70").combinator).toBe("or");
    expect(parseScreen("RSI below 30 and MACD above 0").combinator).toBe("and");
  });

  it("summarises in readable terms", () => {
    const summary = summarise(parseScreen("RSI below 30 and MACD above 0").conditions);
    expect(summary).toContain("rsi");
    expect(summary).toContain("below 30");
    expect(summary).toContain("AND");
  });

  it("understands every example it advertises", () => {
    for (const example of EXAMPLE_SCREENS) {
      const parsed = parseScreen(example);
      expect(parsed.unparsed, `${example} had unparsed fragments`).toEqual([]);
      expect(parsed.conditions.length, `${example} produced no conditions`).toBeGreaterThan(0);
    }
  });
});

describe("evaluation", () => {
  it("passes a rising series on RSI above 70 and fails it on below 30", () => {
    const up = rising();
    const above = evaluateCondition(parseScreen("RSI above 70").conditions[0], up);
    const below = evaluateCondition(parseScreen("RSI below 30").conditions[0], up);
    expect(above.passed).toBe(true);
    expect(below.passed).toBe(false);
  });

  it("passes a falling series on RSI below 30 and fails it on above 70", () => {
    const down = falling();
    expect(evaluateCondition(parseScreen("RSI below 30").conditions[0], down).passed).toBe(true);
    expect(evaluateCondition(parseScreen("RSI above 70").conditions[0], down).passed).toBe(false);
  });

  it("compares price to a moving average correctly", () => {
    expect(evaluateCondition(parseScreen("price above 50-day EMA").conditions[0], rising()).passed).toBe(true);
    expect(evaluateCondition(parseScreen("price above 50-day EMA").conditions[0], falling()).passed).toBe(false);
  });

  it("returns null rather than a guess when there is not enough history", () => {
    const tiny: ScreenerCandidate = { symbol: "TINY", bars: [{ o: 1, h: 1, l: 1, c: 1, v: 1 }] };
    const outcome = evaluateCondition(parseScreen("RSI below 30").conditions[0], tiny);
    expect(outcome.passed).toBeNull();
    expect(outcome.detail).toMatch(/not enough history/i);
  });

  it("excludes a candidate with an undefined indicator from an AND screen", () => {
    const tiny: ScreenerCandidate = { symbol: "TINY", bars: [{ o: 1, h: 1, l: 1, c: 1, v: 1 }] };
    const parsed = parseScreen("RSI below 30");
    const [result] = runScreen(parsed, [tiny]);
    expect(result.matched).toBe(false);
    expect(result.undefinedCount).toBe(1);
  });

  it("treats 'at 50' as a tolerance, not exact equality", () => {
    const flat = { symbol: "FLAT", bars: Array.from({ length: 80 }, () => ({ o: 100, h: 100, l: 100, c: 100, v: 100 })) };
    const outcome = evaluateCondition(parseScreen("RSI at 50").conditions[0], flat);
    expect(outcome.passed).toBe(true);
  });

  it("requires two bars for a cross", () => {
    const one: ScreenerCandidate = { symbol: "ONE", bars: [{ o: 1, h: 1, l: 1, c: 1, v: 1 }] };
    const outcome = evaluateCondition(parseScreen("MACD crosses above 0").conditions[0], one);
    expect(outcome.passed).toBeNull();
  });

  it("matches on AND only when every condition passes", () => {
    const parsed = parseScreen("RSI above 70 and price above 50-day EMA");
    const [up] = runScreen(parsed, [rising()]);
    expect(up.matched).toBe(true);
    expect(up.passedCount).toBe(2);
    const [down] = runScreen(parsed, [falling()]);
    expect(down.matched).toBe(false);
  });

  it("matches on OR when any condition passes", () => {
    const parsed = parseScreen("RSI below 30 or price above 50-day EMA");
    const [up] = runScreen(parsed, [rising()]);
    expect(up.matched).toBe(true);
  });

  it("sorts matches first", () => {
    const results = runScreen(parseScreen("RSI above 70"), [falling(), rising()]);
    expect(results[0].symbol).toBe("RISE");
    expect(results[0].matched).toBe(true);
  });

  it("evaluates every example without throwing", () => {
    for (const example of EXAMPLE_SCREENS) {
      const results = runScreen(parseScreen(example), [rising(), falling()]);
      expect(results).toHaveLength(2);
      for (const result of results) {
        expect(typeof result.matched).toBe("boolean");
        expect(result.outcomes).toHaveLength(parseScreen(example).conditions.length);
      }
    }
  });

  it("never claims a match when nothing could be evaluated", () => {
    const tiny: ScreenerCandidate = { symbol: "TINY", bars: [{ o: 1, h: 1, l: 1, c: 1, v: 1 }] };
    const results = runScreen(parseScreen("RSI below 30 and ADX above 25"), [tiny]);
    expect(results[0].matched).toBe(false);
    expect(results[0].undefinedCount).toBe(2);
  });
});
