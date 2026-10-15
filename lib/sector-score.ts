/**
 * Deterministic sector scoring (FIX 05, Step 4 and 5).
 *
 * The sector overview previously displayed hard-coded numbers ("82 / 100",
 * "+7 pts since last week") with no traceable inputs, and the detail screen
 * ranked names on a fixed `score: 50`. This module replaces that with a
 * documented, versioned formula whose inputs, coverage and timestamps are all
 * returned alongside the number, so the same inputs and formula version always
 * produce the same score.
 *
 * It deliberately does NOT call the output "institutional buying strength": the
 * inputs available today (aggregate FII/DII market flows, event counts) do not
 * support that interpretation for a sector, so the label is a neutral research
 * score and the limitations are stated.
 */

import { clampNumber, round } from "./precision";

export const SECTOR_SCORE_VERSION = "1.0.0";

/** Weighting method, documented so a score can be reproduced. */
export const SECTOR_SCORE_WEIGHTS = {
  /** Observed buying pressure from verified flow/event evidence. */
  buying: 0.4,
  /** Institutional concentration (FII + DII participation). */
  institutional: 0.3,
  /** Event momentum in the current window. */
  eventMomentum: 0.2,
  /** Catalyst evidence strength. */
  catalyst: 0.1,
} as const;

/** Below this coverage the score is labelled provisional rather than presented as final. */
export const SECTOR_SCORE_PROVISIONAL_COVERAGE = 0.75;

export type SectorScoreComponents = {
  buying: number | null;
  institutional: number | null;
  eventMomentum: number | null;
  catalyst: number | null;
};

export type SectorScoreInput = {
  sectorId: string;
  /** Each component is a 0-100 value or null when unavailable. */
  components: SectorScoreComponents;
  /** When each input was retrieved, for the audit trail. */
  sourceTimestamps?: Record<string, string | null>;
  /** Injectable clock so the function stays pure and testable. */
  computedAt?: string;
};

export type SectorScoreResult = {
  sectorId: string;
  /** Null when no component is available — the UI must show "Unavailable". */
  score: number | null;
  label: "Research score" | "Provisional research score" | "Unavailable";
  /** Fraction of total weight backed by real inputs. */
  coverage: number;
  /** Per-component contribution, so a score can be explained. */
  contributions: Array<{ key: keyof SectorScoreComponents; value: number | null; weight: number; contribution: number }>;
  missing: Array<keyof SectorScoreComponents>;
  weightMethod: string;
  missingDataRule: string;
  normalization: string;
  version: string;
  computedAt: string;
  sourceTimestamps: Record<string, string | null>;
  limitations: string[];
};

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? clampNumber(value, 0, 100) : null;
}

/** Compute a sector score deterministically. Same inputs + version ⇒ same output. */
export function computeSectorScore(input: SectorScoreInput): SectorScoreResult {
  const entries = (Object.keys(SECTOR_SCORE_WEIGHTS) as Array<keyof SectorScoreComponents>).map((key) => {
    const value = finiteOrNull(input.components[key]);
    const weight = SECTOR_SCORE_WEIGHTS[key];
    return { key, value, weight, contribution: value === null ? 0 : round((value * weight) / 100, 4) ?? 0 };
  });

  const availableWeight = entries.reduce((acc, entry) => acc + (entry.value === null ? 0 : entry.weight), 0);
  const totalWeight = entries.reduce((acc, entry) => acc + entry.weight, 0);
  const weightedSum = entries.reduce((acc, entry) => acc + (entry.value === null ? 0 : entry.value * entry.weight), 0);
  const coverage = totalWeight > 0 ? availableWeight / totalWeight : 0;

  // Missing-data rule: renormalise by the available weight; if nothing is
  // available, the score is unavailable rather than a fabricated default.
  const score = availableWeight > 0 ? round(weightedSum / availableWeight, 2) : null;

  const missing = entries.filter((entry) => entry.value === null).map((entry) => entry.key);
  const label: SectorScoreResult["label"] =
    score === null ? "Unavailable" : coverage < SECTOR_SCORE_PROVISIONAL_COVERAGE ? "Provisional research score" : "Research score";

  const limitations: string[] = [];
  if (missing.length) limitations.push(`Not included (no verified input): ${missing.join(", ")}.`);
  limitations.push("Aggregate FII/DII market flows are never attributed to a sector or stock; they are contextual only.");
  limitations.push("This is a research signal, not institutional buying strength and not a return forecast.");

  return {
    sectorId: input.sectorId,
    score,
    label,
    coverage: round(coverage, 4) ?? 0,
    contributions: entries,
    missing,
    weightMethod: `Weighted mean of available components: buying ${SECTOR_SCORE_WEIGHTS.buying}, institutional ${SECTOR_SCORE_WEIGHTS.institutional}, eventMomentum ${SECTOR_SCORE_WEIGHTS.eventMomentum}, catalyst ${SECTOR_SCORE_WEIGHTS.catalyst}.`,
    missingDataRule: "Weights are renormalised over the components that are present; if none are present the score is Unavailable.",
    normalization: "Each component is clamped to 0-100 before weighting.",
    version: SECTOR_SCORE_VERSION,
    computedAt: input.computedAt ?? new Date().toISOString(),
    sourceTimestamps: input.sourceTimestamps ?? {},
    limitations,
  };
}
