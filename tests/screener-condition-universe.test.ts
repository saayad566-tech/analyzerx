import { describe, expect, it } from "vitest";
import {
  addNamedCondition,
  parseConditionList,
  parseSymbolBlocks,
  screenUniverse,
  validateCondition,
  type ConditionInstrument,
  type NamedCondition,
} from "../lib/screener-conditions";

function series(closes: number[], volume = 100): ConditionInstrument["candles"] {
  return closes.map((close, i) => ({
    time: 1_700_000_000_000 + i * 86_400_000,
    open: close,
    high: close,
    low: close,
    close,
    volume: i === closes.length - 1 ? volume : 100,
  }));
}

describe("condition validation", () => {
  it("returns the canonical form for a valid expression", () => {
    const v = validateCondition("RSI < 30 and Volume > 5x");
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.canonical).toBe("rsi(14) < 30 and volume > 5x");
  });

  it("refuses an empty or unparseable expression with a position", () => {
    const empty = validateCondition("   ");
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error.message).toContain("Enter a condition");

    const bad = validateCondition("nonsense > 5");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.position).toBeGreaterThanOrEqual(0);
  });
});

describe("screening a universe", () => {
  const universe: ConditionInstrument[] = [
    { symbol: "UPCO", market: "PASTED", candles: series([100, 100, 100, 100, 112], 900) },
    { symbol: "FLATCO", market: "PASTED", candles: series([100, 101, 100, 102, 101]) },
    { symbol: "SHORT", market: "PASTED", candles: series([100]) },
  ];

  it("returns only the matching instruments", () => {
    const out = screenUniverse("changePct(3) > 10% and volume > 5x", universe);
    expect(out.validation.ok).toBe(true);
    expect(out.hits.map((h) => h.symbol)).toEqual(["UPCO"]);
    expect(out.evaluated).toBe(2);
    expect(out.skipped.map((s) => s.symbol)).toEqual(["SHORT"]);
  });

  it("does not run an expression that does not parse", () => {
    const out = screenUniverse("this is not a condition", universe);
    expect(out.validation.ok).toBe(false);
    expect(out.hits).toHaveLength(0);
    expect(out.evaluated).toBe(0);
  });

  it("can return the misses too, with the clause detail that explains them", () => {
    const out = screenUniverse("close > 200", universe, { includeMisses: true });
    expect(out.hits).toHaveLength(2);
    expect(out.hits.every((h) => h.passed === false)).toBe(true);
    expect(out.hits[0].clauses[0].left).toBe(112);
    expect(out.hits[0].clauses[0].right).toBe(200);
  });

  it("flags missing data rather than passing on it", () => {
    const out = screenUniverse("close > ema(200)", universe, { includeMisses: true });
    expect(out.hits.every((h) => h.insufficientData)).toBe(true);
    expect(out.hits.every((h) => h.passed === false)).toBe(true);
  });
});

describe("pasted universe blocks", () => {
  it("splits on `# SYMBOL` lines", () => {
    const text = "# RELIANCE\n2026-01-02,1,2,0.5,1.5,100\n# TCS\n2026-01-02,1,2,0.5,1.5,200\n";
    const blocks = parseSymbolBlocks(text);
    expect(blocks.map((b) => b.symbol)).toEqual(["RELIANCE", "TCS"]);
    expect(blocks[0].body).toContain("2026-01-02");
    expect(blocks[1].body).not.toContain("RELIANCE");
  });

  it("keeps text before the first header as one unnamed series and drops empties", () => {
    const blocks = parseSymbolBlocks("2026-01-02,1,2,0.5,1.5,100\n\n#\n# EMPTY\n");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].symbol).toBe("SERIES 1");
  });

  it("returns nothing for blank input", () => {
    expect(parseSymbolBlocks("   \n\n")).toHaveLength(0);
  });
});

describe("saved condition persistence", () => {
  it("drops a corrupt stored payload instead of trusting it", () => {
    expect(parseConditionList(null)).toEqual([]);
    expect(parseConditionList("{not json")).toEqual([]);
    expect(parseConditionList('{"a":1}')).toEqual([]);
    expect(parseConditionList('[{"id":"1"}]')).toEqual([]); // missing name/expression
  });

  it("keeps only well-formed entries", () => {
    const good: NamedCondition = {
      id: "1",
      name: "Oversold",
      expression: "RSI < 30",
      canonical: "rsi(14) < 30",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const parsed = parseConditionList(JSON.stringify([good, { id: "2" }]));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe("Oversold");
  });

  it("replaces a condition with the same name and puts the newest first", () => {
    const base: NamedCondition[] = [
      { id: "1", name: "A", expression: "close > 1", canonical: "close > 1", createdAt: "x" },
      { id: "2", name: "B", expression: "close > 2", canonical: "close > 2", createdAt: "y" },
    ];
    const next = addNamedCondition(base, {
      id: "3",
      name: "A",
      expression: "close > 9",
      canonical: "close > 9",
      createdAt: "z",
    });
    expect(next).toHaveLength(2);
    expect(next[0].expression).toBe("close > 9");
  });
});
