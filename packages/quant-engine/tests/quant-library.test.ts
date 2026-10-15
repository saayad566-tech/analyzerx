import { describe, expect, it } from "vitest";

import {
  accrualsRatio,
  buffettQuality,
  currentRatio,
  daysSalesOutstanding,
  deepValueEvEbit,
  debtToEquity,
  earningsYield,
  enterpriseValue,
  grahamDefensive,
  grahamNetNet,
  isNetNet,
  ncavPerShare,
  netCurrentAssetValue,
  priceToBook,
  priceToEarnings,
  priceToEarningsToGrowth,
  rankMagicFormula,
  returnOnEquity,
  returnOnInvestedCapital,
  runScreen,
  safeDivide,
  slaterPeg,
  type Fundamentals,
} from "../src/fundamentals";
import { parseFundamentals } from "../src/fundamentals-io";
import { describeRequirements, runLibraryEntry } from "../src/library-run";
import { BOOK_LIBRARY, FAMILY_LABELS, IMPLEMENTATIONS, STRATEGY_LIBRARY, findLibraryEntry, implementedEntries, libraryByFamily, libraryStats } from "../src/strategy-library";
import { FUNDAMENTAL_SCREENS } from "../src/fundamentals";
import { SUPPLY_CHAIN_THEMES, classifyCandidate, findTheme, screenSupplyChain, themeRolesByLayer, type Candidate } from "../src/supply-chain";

const company = (overrides: Partial<Fundamentals> & { symbol: string }): Fundamentals => ({ ...overrides });

const goodValue: Fundamentals = company({
  symbol: "CHEAP",
  price: 100,
  eps: 10,
  bookValuePerShare: 80,
  currentAssets: 500,
  currentLiabilities: 200,
  totalDebt: 100,
  equity: 400,
  marketCap: 1_000,
  netIncome: 80,
});

describe("fundamental primitives never invent a number", () => {
  it("returns null instead of Infinity or NaN", () => {
    expect(safeDivide(1, 0)).toBeNull();
    expect(safeDivide(Number.NaN, 2)).toBeNull();
    expect(safeDivide(null, 2)).toBeNull();
    expect(safeDivide(1, undefined)).toBeNull();
    expect(safeDivide(10, 2)).toBe(5);
  });

  it("computes enterprise value from market cap, debt and cash", () => {
    expect(enterpriseValue(company({ symbol: "X", marketCap: 1_000, totalDebt: 200, cash: 50 }))).toBe(1_150);
    expect(enterpriseValue(company({ symbol: "X", marketCap: null }))).toBeNull();
  });

  it("prefers EBIT/EV for earnings yield and falls back to net income / market cap", () => {
    expect(earningsYield(company({ symbol: "X", ebit: 100, marketCap: 1_000 }))).toBeCloseTo(0.1, 10);
    expect(earningsYield(company({ symbol: "X", netIncome: 80, marketCap: 1_000 }))).toBeCloseTo(0.08, 10);
    expect(earningsYield(company({ symbol: "X" }))).toBeNull();
  });

  it("derives ROIC, NCAV, ratios and forensic measures", () => {
    expect(returnOnInvestedCapital(company({ symbol: "X", ebit: 100, equity: 400, totalDebt: 100, cash: 0 }))).toBeCloseTo(0.2, 10);
    expect(netCurrentAssetValue(company({ symbol: "X", currentAssets: 1_000, totalLiabilities: 400 }))).toBe(600);
    expect(ncavPerShare(company({ symbol: "X", currentAssets: 1_000, totalLiabilities: 400, sharesOutstanding: 10 }))).toBe(60);
    expect(currentRatio(company({ symbol: "X", currentAssets: 500, currentLiabilities: 200 }))).toBeCloseTo(2.5, 10);
    expect(debtToEquity(company({ symbol: "X", totalDebt: 100, equity: 400 }))).toBeCloseTo(0.25, 10);
    expect(returnOnEquity(company({ symbol: "X", netIncome: 80, equity: 400 }))).toBeCloseTo(0.2, 10);
    expect(accrualsRatio(company({ symbol: "X", netIncome: 100, operatingCashFlow: 60, totalAssets: 1_000 }))).toBeCloseTo(0.04, 10);
    expect(daysSalesOutstanding(company({ symbol: "X", receivables: 100, revenue: 730 }))).toBeCloseTo(50, 6);
  });

  it("derives P/E, P/B and PEG, preferring supplied ratios", () => {
    expect(priceToEarnings(company({ symbol: "X", price: 100, eps: 10 }))).toBeCloseTo(10, 10);
    expect(priceToEarnings(company({ symbol: "X", peRatio: 12, price: 100, eps: 10 }))).toBe(12);
    expect(priceToBook(company({ symbol: "X", price: 100, bookValuePerShare: 80 }))).toBeCloseTo(1.25, 10);
    // PEG is quoted against percentage points: P/E 20 with 20% growth is a PEG of 1.
    expect(priceToEarningsToGrowth(company({ symbol: "X", peRatio: 20, epsGrowth: 0.2 }))).toBeCloseTo(1, 10);
    expect(priceToEarningsToGrowth(company({ symbol: "X", peRatio: 20, epsGrowth: 0 }))).toBeNull();
  });

  it("flags a Graham net-net", () => {
    expect(isNetNet(company({ symbol: "X", price: 30, currentAssets: 1_000, totalLiabilities: 400, sharesOutstanding: 10 }))).toBe(true);
    expect(isNetNet(company({ symbol: "X", price: 50, currentAssets: 1_000, totalLiabilities: 400, sharesOutstanding: 10 }))).toBe(false);
  });
});

describe("screens evaluate real criteria", () => {
  it("passes a genuinely cheap, sound company on Graham's defensive rules", () => {
    const outcome = grahamDefensive(goodValue);
    expect(outcome.total).toBe(5);
    expect(outcome.passedCount).toBe(5);
    expect(outcome.passed).toBe(true);
  });

  it("fails an expensive company rather than passing it by default", () => {
    const outcome = grahamDefensive(company({ symbol: "RICH", price: 100, eps: 1, bookValuePerShare: 5 }));
    expect(outcome.passed).toBe(false);
    expect(outcome.passedCount).toBeLessThan(5);
  });

  it("marks a criterion failed when the metric cannot be computed at all", () => {
    const outcome = buffettQuality(company({ symbol: "EMPTY" }));
    expect(outcome.passedCount).toBe(0);
    expect(outcome.criteria.every((item) => item.value === null && item.passed === false)).toBe(true);
  });

  it("passes the net-net screen only under two-thirds of NCAV", () => {
    expect(grahamNetNet(company({ symbol: "NN", price: 30, currentAssets: 1_000, totalLiabilities: 400, sharesOutstanding: 10 })).passed).toBe(true);
    expect(grahamNetNet(company({ symbol: "NN", price: 50, currentAssets: 1_000, totalLiabilities: 400, sharesOutstanding: 10 })).passed).toBe(false);
  });

  it("applies deep-value and PEG thresholds", () => {
    expect(deepValueEvEbit(company({ symbol: "DV", ebit: 100, ebitda: 150, marketCap: 500 })).criteria[0].passed).toBe(true);
    expect(slaterPeg(company({ symbol: "G", peRatio: 15, epsGrowth: 0.2 })).criteria[0].passed).toBe(true);
  });

  it("orders a screened universe by how many criteria passed", () => {
    const results = runScreen("graham-defensive", [goodValue, company({ symbol: "RICH", price: 100, eps: 1 })]);
    expect(results[0].symbol).toBe("CHEAP");
    expect(results[1].symbol).toBe("RICH");
  });
});

describe("magic formula ranking", () => {
  const universe: Fundamentals[] = [
    company({ symbol: "A", roic: 0.3, ebit: 100, marketCap: 1_000 }),
    company({ symbol: "B", roic: 0.2, ebit: 300, marketCap: 1_000 }),
    company({ symbol: "C", roic: 0.1, ebit: 50, marketCap: 1_000 }),
    company({ symbol: "MISSING" }),
  ];

  it("combines ROIC and earnings-yield ranks and excludes names missing either input", () => {
    const ranked = rankMagicFormula(universe);
    expect(ranked.map((row) => row.symbol)).toEqual(["A", "B", "C"]); // MISSING is excluded, not averaged
    expect(ranked[2].combinedRank).toBe(6); // worst on both measures
    expect(ranked[0].combinedRank).toBe(3);
    expect(ranked[0].score).toBeCloseTo(75, 6);
    expect(ranked[2].score).toBeCloseTo(0, 6);
  });

  it("returns nothing when no name has both inputs", () => {
    expect(rankMagicFormula([company({ symbol: "X" })])).toEqual([]);
  });
});

describe("fundamentals ingestion", () => {
  it("parses records and converts percentage strings to fractions", () => {
    const result = parseFundamentals(JSON.stringify([{ symbol: "abc", name: "ABC Ltd", roe: "15%", revenueGrowth: "20%", price: "1,000" }]));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.companies[0].symbol).toBe("ABC");
    expect(result.companies[0].roe).toBeCloseTo(0.15, 10);
    expect(result.companies[0].revenueGrowth).toBeCloseTo(0.2, 10);
    expect(result.companies[0].price).toBe(1_000);
  });

  it("drops records without a symbol and reports them", () => {
    const result = parseFundamentals(JSON.stringify([{ name: "No symbol" }, { symbol: "OK" }]));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.companies).toHaveLength(1);
    expect(result.dropped).toBe(1);
  });

  it("reports malformed input instead of guessing", () => {
    expect(parseFundamentals("not json").status).toBe("error");
    expect(parseFundamentals("{}").status).toBe("error");
    expect(parseFundamentals("").status).toBe("error");
  });

  it("accepts an object wrapper", () => {
    const result = parseFundamentals(JSON.stringify({ companies: [{ symbol: "W" }] }));
    expect(result.status).toBe("ok");
  });
});

describe("strategy library is honest about what is implemented", () => {
  it("catalogues exactly the 100 referenced books with unique ids", () => {
    expect(BOOK_LIBRARY).toHaveLength(100);
    expect(new Set(BOOK_LIBRARY.map((book) => book.id)).size).toBe(100);
  });

  it("gives every book a title, author, family and idea", () => {
    for (const book of BOOK_LIBRARY) {
      expect(book.title.length).toBeGreaterThan(0);
      expect(book.author.length).toBeGreaterThan(0);
      expect(book.idea.length).toBeGreaterThan(10);
      expect(FAMILY_LABELS[book.family]).toBeDefined();
    }
  });

  it("only claims implementation where real logic exists", () => {
    for (const [id, implementation] of Object.entries(IMPLEMENTATIONS)) {
      const entry = findLibraryEntry(id);
      expect(entry, `implementation ${id} has no catalogue entry`).not.toBeNull();
      if (implementation.kind === "spec") {
        expect(implementation.spec, `${id} claims a spec but has none`).toBeDefined();
        expect(implementation.spec!.entry.length).toBeGreaterThan(0);
        expect(implementation.spec!.exit.length).toBeGreaterThan(0);
      } else {
        const wired = implementation.screenId === "magic-formula" || Boolean(FUNDAMENTAL_SCREENS[implementation.screenId ?? ""]);
        expect(wired, `${id} references an unwired screen`).toBe(true);
      }
      expect(implementation.requires.length).toBeGreaterThan(0);
    }
  });

  it("marks the rest as reference-only rather than pretending", () => {
    const stats = libraryStats();
    expect(stats.total).toBe(100);
    expect(stats.implemented).toBe(implementedEntries().length);
    expect(stats.referenceOnly).toBe(100 - stats.implemented);
    expect(stats.implemented).toBeGreaterThan(0);
    expect(stats.referenceOnly).toBeGreaterThan(0);
  });

  it("groups every book into exactly one family", () => {
    const groups = libraryByFamily();
    expect(groups.reduce((sum, group) => sum + group.entries.length, 0)).toBe(100);
    expect(groups.every((group) => group.entries.every((entry) => entry.family === group.family))).toBe(true);
  });

  it("has an entry for every implementation and a null marker otherwise", () => {
    expect(STRATEGY_LIBRARY.filter((entry) => entry.implemented === null).length).toBe(100 - implementedEntries().length);
  });
});

describe("library execution is market-scoped", () => {
  const inUniverse = { marketId: "IN" as const, companies: [goodValue] };

  it("returns the rule set for a price-driven method", () => {
    const entry = findLibraryEntry("turtle-trader")!;
    const run = runLibraryEntry(entry, { marketId: "IN" });
    expect(run.kind).toBe("spec");
    if (run.kind === "spec") expect(run.spec.entry[0].kind).toBe("breakoutHigh");
  });

  it("refuses a fundamental method until a universe is loaded", () => {
    const run = runLibraryEntry(findLibraryEntry("intelligent-investor")!, { marketId: "IN" });
    expect(run.kind).toBe("unavailable");
    if (run.kind === "unavailable") expect(run.reason).toContain("fundamentals file");
  });

  it("refuses to screen a universe from another market", () => {
    const run = runLibraryEntry(findLibraryEntry("intelligent-investor")!, { marketId: "IN", universe: { marketId: "US", companies: [goodValue] } });
    expect(run.kind).toBe("unavailable");
    if (run.kind === "unavailable") expect(run.reason).toContain("Cross-market screening is refused");
  });

  it("screens a matching universe and reports the pass count", () => {
    const run = runLibraryEntry(findLibraryEntry("intelligent-investor")!, { marketId: "IN", universe: inUniverse });
    expect(run.kind).toBe("screen");
    if (run.kind === "screen") {
      expect(run.marketId).toBe("IN");
      expect(run.evaluated).toBe(1);
      expect(run.passed).toBe(1);
    }
  });

  it("ranks a matching universe for the magic formula", () => {
    // The ranker needs both ROIC and earnings yield, so the universe must actually carry them.
    const rankUniverse = { marketId: "IN" as const, companies: [company({ symbol: "CHEAP", roic: 0.2, ebit: 100, marketCap: 1_000 })] };
    const run = runLibraryEntry(findLibraryEntry("little-book-beats-market")!, { marketId: "IN", universe: rankUniverse });
    expect(run.kind).toBe("rank");
    if (run.kind === "rank") expect(run.ranked.map((row) => row.symbol)).toEqual(["CHEAP"]);
  });

  it("refuses to rank when no name has the required inputs", () => {
    const run = runLibraryEntry(findLibraryEntry("little-book-beats-market")!, { marketId: "IN", universe: inUniverse });
    expect(run.kind).toBe("unavailable");
    if (run.kind === "unavailable") expect(run.reason).toContain("ROIC and earnings yield");
  });

  it("refuses a reference-only book with a stated reason", () => {
    const run = runLibraryEntry(findLibraryEntry("most-important-thing")!, { marketId: "IN", universe: inUniverse });
    expect(run.kind).toBe("unavailable");
    if (run.kind === "unavailable") expect(run.reason).toContain("reference");
  });

  it("describes what a method needs", () => {
    expect(describeRequirements(findLibraryEntry("turtle-trader")!)).toContain("OHLCV");
    expect(describeRequirements(findLibraryEntry("most-important-thing")!)).toContain("Reference only");
  });
});

describe("picks & shovels supply-chain screening", () => {
  const candidates: Candidate[] = [
    { symbol: "NVDA", name: "NVIDIA", sector: "Semiconductors", description: "gpu and accelerator design" },
    { symbol: "ASML", name: "ASML Holding", sector: "Semiconductor equipment", description: "lithography systems" },
    { symbol: "NEE", name: "NextEra Energy", sector: "Utilities", description: "power generation and transmission" },
    { symbol: "SHOP", name: "Plain Retail Co", sector: "Retail", description: "grocery stores" },
  ];

  it("classifies a candidate into the layer its role implies", () => {
    const theme = findTheme("ai-compute")!;
    expect(classifyCandidate(theme, candidates[0]).layers).toContain("primary");
    expect(classifyCandidate(theme, candidates[1]).layers).toContain("secondary");
    expect(classifyCandidate(theme, candidates[2]).layers).toContain("tertiary");
    expect(classifyCandidate(theme, candidates[3]).matchedRoles).toHaveLength(0);
  });

  it("scores confidence by breadth of fit, capped at one", () => {
    const theme = findTheme("ai-compute")!;
    const one = classifyCandidate(theme, { symbol: "A", name: "Copper Miner", description: "copper" });
    expect(one.confidence).toBeGreaterThan(0);
    expect(one.confidence).toBeLessThanOrEqual(1);
    expect(classifyCandidate(theme, candidates[3]).confidence).toBe(0);
  });

  it("groups a screened universe by layer and reports the unmatched", () => {
    const screen = screenSupplyChain("ai-compute", candidates)!;
    expect(screen.layers.primary.map((item) => item.candidate.symbol)).toContain("NVDA");
    expect(screen.layers.secondary.map((item) => item.candidate.symbol)).toContain("ASML");
    expect(screen.layers.tertiary.map((item) => item.candidate.symbol)).toContain("NEE");
    expect(screen.unmatched.map((item) => item.symbol)).toEqual(["SHOP"]);
  });

  it("returns null for an unknown theme and exposes roles by layer", () => {
    expect(screenSupplyChain("nope", candidates)).toBeNull();
    expect(findTheme("nope")).toBeNull();
    const roles = themeRolesByLayer(findTheme("ai-compute")!);
    expect(roles.primary.length).toBeGreaterThan(0);
    expect(roles.secondary.length).toBeGreaterThan(roles.primary.length);
    expect(SUPPLY_CHAIN_THEMES.length).toBeGreaterThanOrEqual(2);
  });
});
