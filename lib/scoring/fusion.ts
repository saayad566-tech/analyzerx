/**
 * Fusion layer (PRD Section 12).
 *
 * News and Deep Score stay separate numbers with separate horizons. News can
 * raise a re-check flag or a watchlist flag, but it never silently rewrites the
 * Deep Score.
 */

import type { DeepScoreResult } from "./deep-score";
import type { NewsImpactResult } from "./news-impact";

/** Events severe enough to force an early Deep Score re-check (PRD 12). */
const RECHECK_EVENTS = new Set(["fraud", "bankruptcy", "auditor_exit", "regulatory_penalty", "pledge_invocation", "default"]);

export type FusionResult = {
  recheckFlag: boolean;
  recheckReason: string | null;
  watchlistOpportunity: boolean;
  watchlistReason: string | null;
  /** 2x2 view: Deep Score strong/weak vs recent News Impact positive/negative. */
  quadrant: "strong-positive" | "strong-negative" | "weak-positive" | "weak-negative" | "unavailable";
};

const STRONG_SCORE = 55;

export function fuseSignals(deep: DeepScoreResult | null, news: NewsImpactResult | null): FusionResult {
  const deepStrong = deep?.score !== null && deep !== null && (deep.score as number) >= STRONG_SCORE;
  const newsPositive = (news?.impact ?? 0) > 0.5;
  const newsNegative = (news?.impact ?? 0) < -0.5;

  const quadrant: FusionResult["quadrant"] =
    deep === null && news === null ? "unavailable"
      : deepStrong && newsPositive ? "strong-positive"
        : deepStrong && newsNegative ? "strong-negative"
          : newsPositive ? "weak-positive"
            : newsNegative ? "weak-negative"
              : deep === null ? "unavailable" : deepStrong ? "strong-positive" : "weak-positive";

  // A high-magnitude negative structural event forces a re-check of governance
  // and solvency pillars, but never rewrites the score itself.
  const severeEvent = news !== null && RECHECK_EVENTS.has(news.eventType) && news.impact <= -40;
  const recheckFlag = severeEvent || (news !== null && news.magnitude >= 75 && newsNegative);

  // A positive catalyst can raise a watchlist flag only when the Deep Score is at
  // least grade B (score >= 55) — a catalyst on a weak name is not an opportunity.
  const watchlistOpportunity = news !== null && newsPositive && deepStrong;

  return {
    recheckFlag,
    recheckReason: recheckFlag
      ? `High-impact negative event (${news?.eventType.replaceAll("_", " ")}, impact ${news?.impact}) — re-check governance and solvency pillars from the latest filings.`
      : null,
    watchlistOpportunity,
    watchlistReason: watchlistOpportunity
      ? `Positive catalyst on a ${deep?.grade ?? "strong"} Deep Score — flagged for watchlist review, not a recommendation.`
      : null,
    quadrant,
  };
}
