/**
 * Library execution — market-scoped.
 *
 * A library entry is only run against a universe that belongs to the **same** market as the active
 * context. If they differ, the run is refused with a stated reason rather than silently mixing
 * Indian and US companies. That guard is the whole point: cross-market leakage in a screener is
 * invisible to the user but wrong in every row.
 */
import type { MarketId } from "../market-regions";
import { FUNDAMENTAL_SCREENS, rankMagicFormula, runScreen, type Fundamentals, type RankedEntry, type ScreenOutcome } from "./fundamentals";
import type { LibraryEntry } from "./strategy-library";
import type { StrategySpec } from "./strategy";

/** A set of companies explicitly tagged with the market they belong to. */
export type MarketUniverse = { marketId: MarketId; companies: Fundamentals[] };

export type LibraryRun =
  | { kind: "spec"; strategyId: string; marketId: MarketId; spec: StrategySpec }
  | { kind: "screen"; strategyId: string; marketId: MarketId; outcomes: ScreenOutcome[]; passed: number; evaluated: number }
  | { kind: "rank"; strategyId: string; marketId: MarketId; ranked: RankedEntry[] }
  | { kind: "unavailable"; strategyId: string; marketId: MarketId; reason: string };

function unavailable(entry: LibraryEntry, marketId: MarketId, reason: string): LibraryRun {
  return { kind: "unavailable", strategyId: entry.id, marketId, reason };
}

/** Human-readable statement of what a method needs before it can be evaluated. */
export function describeRequirements(entry: LibraryEntry): string {
  if (!entry.implemented) return "Reference only — no algorithm implemented.";
  const needs = entry.implemented.requires.map((item) => (item === "ohlcv" ? "an OHLCV price series" : "a fundamentals file")).join(" and ");
  return `Needs ${needs}. Metrics used: ${entry.implemented.metrics.join(", ")}.`;
}

/**
 * Run one library entry under the active market.
 *
 * `universe` is required for fundamental methods; `spec` methods are returned for the backtest
 * engine to execute against a price series the caller supplies.
 */
export function runLibraryEntry(entry: LibraryEntry, input: { marketId: MarketId; universe?: MarketUniverse | null }): LibraryRun {
  const { marketId } = input;
  if (!entry.implemented) {
    return unavailable(entry, marketId, `${entry.title} is catalogued as a reference. No algorithm is implemented for it, so nothing is run — an empty result would be a false one.`);
  }
  const implementation = entry.implemented;

  if (implementation.kind === "spec") {
    if (!implementation.spec) return unavailable(entry, marketId, "The rule set for this method is missing.");
    return { kind: "spec", strategyId: entry.id, marketId, spec: implementation.spec };
  }

  const universe = input.universe;
  if (!universe || universe.companies.length === 0) {
    return unavailable(entry, marketId, "This method screens fundamentals. Load a fundamentals file to evaluate it.");
  }
  if (universe.marketId !== marketId) {
    return unavailable(entry, marketId, `The loaded universe is tagged ${universe.marketId} but the active market is ${marketId}. Cross-market screening is refused.`);
  }

  if (implementation.kind === "rank") {
    if (implementation.screenId !== "magic-formula") return unavailable(entry, marketId, "This ranking method is not wired.");
    const ranked = rankMagicFormula(universe.companies);
    if (ranked.length === 0) return unavailable(entry, marketId, "No company in the universe has both ROIC and earnings yield available, so no ranking can be produced.");
    return { kind: "rank", strategyId: entry.id, marketId, ranked };
  }

  const screenId = implementation.screenId ?? "";
  if (!FUNDAMENTAL_SCREENS[screenId]) return unavailable(entry, marketId, "This screen is not wired.");
  const outcomes = runScreen(screenId, universe.companies);
  return { kind: "screen", strategyId: entry.id, marketId, outcomes, passed: outcomes.filter((item) => item.passed).length, evaluated: outcomes.length };
}
