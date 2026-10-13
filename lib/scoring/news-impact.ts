/**
 * Engine B — News Impact Score (PRD Section 9).
 *
 * Signed score in [-100, +100]: how much a news item may move a specific stock,
 * with source tiering, centrality, materiality and exponential temporal decay.
 * No catalyst means 0, never NaN (PRD 9.3). All parameters live in the versioned
 * config so a score is reproducible.
 */

import { clampNumber, product, round, sumValid } from "@/lib/precision";
import { DEFAULT_SCORING_CONFIG, type NewsConfig } from "./config";

export type NewsSourceTier = "tier1" | "tier2" | "tier3";

export type NewsImpactInput = {
  /** Polarity in [-1, +1] (FinBERT, or a dictionary baseline as fallback). */
  sentiment: number;
  /** Event type key from the config's catalyst magnitudes. */
  eventType: string;
  /** Event value as a fraction of market cap or revenue, clamped to [0, 1]. */
  materialityRatio: number;
  sourceTier: NewsSourceTier;
  /** Rumour language reduces the source multiplier further (PRD 9.3). */
  rumour?: boolean;
  /** 0-1: ticker in headline, mention density, subject vs passing mention. */
  centrality: number;
  /** Age of the story in hours (from publication, or fetch time if unknown). */
  ageHours: number;
  /** Independent corroborating stories (counted once, boosted modestly). */
  corroboratingSources?: number;
  config?: NewsConfig;
};

export type NewsImpactResult = {
  impact: number;
  magnitude: number;
  direction: "positive" | "negative" | "neutral";
  rawImpact: number;
  sourceMultiplier: number;
  centralityFactor: number;
  decayFactor: number;
  halfLifeHours: number;
  eventType: string;
  confidence: number;
};

const TIER_CONFIDENCE: Record<NewsSourceTier, number> = { tier1: 1, tier2: 0.7, tier3: 0.4 };

export function computeNewsImpact(input: NewsImpactInput): NewsImpactResult {
  const config = input.config ?? DEFAULT_SCORING_CONFIG.news;
  const { weights, sourceMultiplier, catalystMagnitudes, halfLifeHours, defaultHalfLifeHours, corroborationBoost } = config;

  const sentiment = clampNumber(input.sentiment, -1, 1) ?? 0;
  const catalyst = catalystMagnitudes[input.eventType] ?? 0;
  const materiality = clampNumber(input.materialityRatio, 0, 1) ?? 0;
  const centrality = clampNumber(input.centrality, 0, 1) ?? 0;
  const ageHours = Number.isFinite(input.ageHours) ? Math.max(0, input.ageHours) : 0;

  // Materiality inherits the catalyst's direction; with no catalyst, sentiment's.
  const direction = catalyst !== 0 ? Math.sign(catalyst) : Math.sign(sentiment) || 1;
  const rawImpact = sumValid([
    product(weights.sentiment, sentiment),
    product(weights.catalyst, catalyst),
    product(weights.materiality, materiality * direction),
  ]) ?? 0;

  const tierMultiplier = sourceMultiplier[input.sourceTier] ?? sourceMultiplier.tier3;
  const rumourMultiplier = input.rumour ? sourceMultiplier.rumourPenalty : 1;
  const corroborating = Math.max(0, Math.floor(input.corroboratingSources ?? 1) - 1);
  const corroboration = Math.min(1.5, 1 + corroborationBoost * Math.min(3, corroborating));
  const effectiveSourceMultiplier = round(tierMultiplier * rumourMultiplier * corroboration, 4) ?? tierMultiplier;

  // Centrality is a down-weight, not a zero: a passing mention keeps half weight.
  const centralityFactor = round(0.5 + 0.5 * centrality, 4) ?? 1;

  const halfLife = halfLifeHours[input.eventType] ?? defaultHalfLifeHours;
  const decayFactor = round(Math.exp((-Math.LN2 * ageHours) / Math.max(1, halfLife)), 6) ?? 1;

  const impact = clampNumber(rawImpact * effectiveSourceMultiplier * centralityFactor * decayFactor, -100, 100) ?? 0;
  const magnitude = Math.abs(impact);

  const confidence = clampNumber(
    0.4 * centrality + 0.4 * (TIER_CONFIDENCE[input.sourceTier] ?? 0.4) + 0.2 * Math.min(1, (input.corroboratingSources ?? 1) / 3),
    0,
    1,
  ) ?? 0;

  return {
    impact: round(impact, 2) ?? 0,
    magnitude: round(magnitude, 2) ?? 0,
    direction: impact > 0.5 ? "positive" : impact < -0.5 ? "negative" : "neutral",
    rawImpact: round(rawImpact, 2) ?? 0,
    sourceMultiplier: effectiveSourceMultiplier,
    centralityFactor,
    decayFactor,
    halfLifeHours: halfLife,
    eventType: input.eventType,
    confidence: round(confidence, 4) ?? 0,
  };
}
