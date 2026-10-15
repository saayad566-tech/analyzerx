/**
 * Library execution — market-scoped.
 *
 * A library entry is only run against a universe that belongs to the **same** market as the active
 * context. If they differ, the run is refused with a stated reason rather than silently mixing
 * Indian and US companies. That guard is the whole point: cross-market leakage in a screener is
 * invisible to the user but wrong in every row.
 */
import type { MarketId } from "./core-types";
import { FUNDAMENTAL_SCREENS, rankMagicFormula, runScreen, type Fundamentals, type RankedEntry, type ScreenOutcome } from "./fundamentals";
import type { LibraryEntry } from "./strategy-library";
import type { StrategySpec } from "./strategy";
import { altmanZScore, beneishMScore, piotroskiFScore, type ScoreComponent } from "./scores";
import { findModel, type QuantitativeModel } from "./model-catalogue";

/**
 * A set of companies explicitly tagged with the market they belong to.
 * `priors` carries the previous reporting period per symbol, which the period-over-period models
 * (Piotroski, Beneish) need and the single-period screens ignore.
 */
export type MarketUniverse = { marketId: MarketId; companies: Fundamentals[]; priors?: Record<string, Fundamentals> };

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

/** The score models take the same universe shape, including the optional prior period. */
export type ModelUniverse = MarketUniverse;

export type ModelScoreRow = {
  symbol: string;
  /** The model's headline number (F, Z, or M). Null when it could not be computed. */
  value: number | null;
  headline: string;
  passed: boolean;
  components: ScoreComponent[];
};

export type ModelRun =
  | { kind: "scores"; modelId: string; marketId: MarketId; rows: ModelScoreRow[]; passed: number; evaluated: number }
  | { kind: "unavailable"; modelId: string; marketId: MarketId; reason: string };

/** The score models this engine can actually evaluate, and what each one needs. */
export const RUNNABLE_MODELS = ["piotroski-f", "altman-z", "beneish-m"] as const;

function modelUnavailable(model: QuantitativeModel | null, modelId: string, marketId: MarketId, reason: string): ModelRun {
  return { kind: "unavailable", modelId: model?.id ?? modelId, marketId, reason };
}

/**
 * Run a named quantitative model over a market-scoped universe.
 * The same isolation guard as `runLibraryEntry` applies: a universe from another market is refused.
 */
export function runModel(modelId: string, input: { marketId: MarketId; universe?: ModelUniverse | null }): ModelRun {
  const { marketId } = input;
  const model = findModel(modelId);
  if (!model) return modelUnavailable(null, modelId, marketId, `No model named "${modelId}" is in the catalogue.`);
  if (!model.implemented) return modelUnavailable(model, modelId, marketId, `${model.name} is catalogued but not implemented: ${model.note ?? "no implementation is available."}`);
  if (!(RUNNABLE_MODELS as readonly string[]).includes(modelId)) {
    return modelUnavailable(model, modelId, marketId, `${model.name} is implemented, but not as a universe screen. ${model.note ?? ""}`.trim());
  }

  const universe = input.universe;
  if (!universe || universe.companies.length === 0) {
    return modelUnavailable(model, modelId, marketId, "This model scores fundamentals. Load a fundamentals file to evaluate it.");
  }
  if (universe.marketId !== marketId) {
    return modelUnavailable(model, modelId, marketId, `The loaded universe is tagged ${universe.marketId} but the active market is ${marketId}. Cross-market screening is refused.`);
  }

  const priors = universe.priors ?? {};
  const needsPrior = model.input === "fundamentals-pair";
  if (needsPrior && Object.keys(priors).length === 0) {
    return modelUnavailable(model, modelId, marketId, `${model.name} compares two reporting periods. No company in the loaded file includes a prior period, so it cannot be evaluated.`);
  }

  const rows: ModelScoreRow[] = universe.companies.map((company) => {
    const prior = priors[company.symbol];
    if (modelId === "piotroski-f") {
      if (!prior) return { symbol: company.symbol, value: null, headline: "no prior period supplied", passed: false, components: [] };
      const result = piotroskiFScore(company, prior);
      return { symbol: company.symbol, value: result.score, headline: `F-Score ${result.score}/9 (${result.evaluable} evaluable)`, passed: result.strong, components: result.components };
    }
    if (modelId === "altman-z") {
      const result = altmanZScore(company);
      return { symbol: company.symbol, value: result.z, headline: result.z === null ? "insufficient inputs" : `Z ${result.z.toFixed(2)} — ${result.zone}`, passed: result.zone === "safe", components: result.components };
    }
    if (!prior) return { symbol: company.symbol, value: null, headline: "no prior period supplied", passed: false, components: [] };
    const result = beneishMScore(company, prior);
    return { symbol: company.symbol, value: result.m, headline: result.m === null ? "insufficient inputs" : `M ${result.m.toFixed(2)} — ${result.flagged ? "flagged" : "clean"}`, passed: !result.flagged && result.m !== null, components: result.components };
  });

  const evaluated = rows.filter((row) => row.value !== null).length;
  return { kind: "scores", modelId, marketId, rows, passed: rows.filter((row) => row.passed).length, evaluated };
}
