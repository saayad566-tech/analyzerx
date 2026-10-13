/**
 * Engine A — Deep Analysis Score (PRD Section 8).
 *
 * Pipeline (8.1): metric computation -> cleaning/winsorisation -> sector-relative
 * percentile -> pillar aggregation -> composite -> risk overlay -> confidence.
 *
 * Every score is explainable: because the composite is a weighted sum, the
 * per-metric contribution is an exact additive decomposition (SHAP-style, exact
 * for a linear score — PRD 8.5/FR-7), and the contributions sum to the
 * pre-overlay composite. Missing metrics redistribute their weight and reduce
 * confidence rather than producing NaN (FR-5).
 */

import { clampNumber, round, sumValid } from "@/lib/precision";
import {
  DEFAULT_SCORING_CONFIG,
  metricForSector,
  type PillarKey,
  type RatingBand,
  type ScoringConfig,
  type SectorModel,
} from "./config";
import { anchoredPercentile, isUsableValue, sectorPercentile } from "./percentile";

export type DeepScoreInput = {
  symbol: string;
  sector: SectorModel;
  /** Computed metric values for the subject company. */
  metrics: Record<string, number | null | undefined>;
  /** Sector peer values per metric key, used for the relative percentile. */
  peers?: Record<string, number[]>;
  /** Boolean risk flags, e.g. `majorRegulatoryAction`, `auditorQualifiedOrResigned`. */
  flags?: Record<string, boolean>;
  /** Data freshness factor in [0,1]; 1.0 within one quarter, decaying after (PRD 18). */
  freshness?: number;
  /** Override for tests/backtests; defaults to the shipped config. */
  config?: ScoringConfig;
};

export type MetricContribution = {
  key: string;
  label: string;
  pillar: PillarKey;
  rawValue: number | null;
  percentile: number | null;
  /** Where the percentile came from: a sector peer sample, or absolute anchors. */
  percentileSource: "sector" | "baseline" | null;
  /** Signed points this metric contributes to the composite (pre-overlay). */
  contribution: number;
  available: boolean;
};

export type PillarResult = {
  key: PillarKey;
  label: string;
  weight: number;
  score: number | null;
  confidence: number;
  metricsAvailable: number;
  metricsTotal: number;
};

export type OverlayPenalty = { id: string; label: string; penalty: number; description: string };

export type DeepScoreResult = {
  symbol: string;
  sector: SectorModel;
  configVersion: string;
  /** 0-100 composite after the risk overlay. */
  score: number | null;
  /** Composite before the overlay, for transparency. */
  preOverlayScore: number | null;
  overlayTotal: number;
  overlayPenalties: OverlayPenalty[];
  /** 0-1 overall confidence = weighted coverage x freshness. */
  confidence: number;
  grade: RatingBand["grade"] | "Provisional";
  gradeMeaning: string;
  pillars: PillarResult[];
  contributions: MetricContribution[];
  /** Metrics that could not be scored, with the reason. */
  unavailable: { key: string; label: string; reason: string }[];
  /** How percentiles were sourced: sector peers, absolute anchors, or both. */
  peerSource: "sector" | "baseline" | "mixed" | "none";
  provisional: boolean;
};

/** PRD 8.3 — evaluate the risk overlay; penalties are negative and capped. */
export function evaluateOverlay(input: DeepScoreInput, config: ScoringConfig): { penalties: OverlayPenalty[]; total: number } {
  const metrics = input.metrics;
  const flags = input.flags ?? {};
  const penalties: OverlayPenalty[] = [];

  for (const rule of config.overlay.rules) {
    const trigger = rule.trigger;
    if (trigger.kind === "flag") {
      if (flags[trigger.flagKey]) penalties.push({ id: rule.id, label: rule.label, penalty: rule.penalty, description: rule.description });
      continue;
    }
    const value = metrics[trigger.metricKey];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    if (trigger.kind === "at-least" && value >= trigger.value) {
      penalties.push({ id: rule.id, label: rule.label, penalty: rule.penalty, description: rule.description });
    } else if (trigger.kind === "at-most" && value <= trigger.value) {
      penalties.push({ id: rule.id, label: rule.label, penalty: rule.penalty, description: rule.description });
    } else if (trigger.kind === "scaled" && value >= trigger.from) {
      const span = trigger.to - trigger.from;
      const ratio = span === 0 ? 1 : Math.min(1, Math.max(0, (value - trigger.from) / span));
      const penalty = trigger.penaltyFrom + ratio * (trigger.penaltyTo - trigger.penaltyFrom);
      penalties.push({ id: rule.id, label: rule.label, penalty: round(penalty, 2) ?? rule.penalty, description: rule.description });
    }
  }

  const raw = penalties.reduce((acc, item) => acc + item.penalty, 0);
  const total = Math.max(-config.overlay.cap, raw);
  return { penalties, total: round(total, 2) ?? 0 };
}

/** Compute the Deep Score. Deterministic for identical inputs + config version. */
export function computeDeepScore(input: DeepScoreInput): DeepScoreResult {
  const config = input.config ?? DEFAULT_SCORING_CONFIG;
  const sector = input.sector;
  const peers = input.peers ?? {};
  const freshness = typeof input.freshness === "number" && Number.isFinite(input.freshness) ? Math.min(1, Math.max(0, input.freshness)) : 1;

  const contributions: MetricContribution[] = [];
  const unavailable: { key: string; label: string; reason: string }[] = [];
  let usedBaseline = false;

  // Per-pillar accumulators of (weight, weightedPercentile).
  const pillarAccumulator = new Map<PillarKey, { weightSum: number; weightedSum: number; available: number; total: number }>();
  for (const pillar of config.pillars) pillarAccumulator.set(pillar.key, { weightSum: 0, weightedSum: 0, available: 0, total: 0 });

  for (const metric of config.metrics) {
    const accumulator = pillarAccumulator.get(metric.pillar);
    if (!accumulator) continue;
    const { weight, direction } = metricForSector(metric, sector);
    if (weight <= 0) continue; // removed for this sector (e.g. D/E for banks)
    accumulator.total += 1;

    const rawValue = input.metrics[metric.key] ?? null;
    if (!isUsableValue(rawValue ?? null, metric.negativeMeansUnavailable)) {
      unavailable.push({
        key: metric.key,
        label: metric.label,
        reason: rawValue === null || rawValue === undefined ? "not reported" : metric.negativeMeansUnavailable && (rawValue as number) < 0 ? "negative — not meaningful for this metric" : "invalid value",
      });
      contributions.push({ key: metric.key, label: metric.label, pillar: metric.pillar, rawValue: rawValue ?? null, percentile: null, percentileSource: null, contribution: 0, available: false });
      continue;
    }

    // Primary: sector-relative percentile. Fallback: absolute anchors, used only
    // when the metric has no peer sample, and clearly labelled as such.
    const peerSample = peers[metric.key] ?? [];
    let percentile: number | null = null;
    let percentileSource: "sector" | "baseline" | null = null;
    if (peerSample.length > 0) {
      percentile = sectorPercentile(rawValue as number, peerSample, direction);
      percentileSource = "sector";
    } else if (config.anchors[metric.key]) {
      percentile = anchoredPercentile(rawValue as number, config.anchors[metric.key]);
      percentileSource = "baseline";
    }
    if (percentile === null) {
      unavailable.push({ key: metric.key, label: metric.label, reason: "no peer sample or anchors" });
      contributions.push({ key: metric.key, label: metric.label, pillar: metric.pillar, rawValue: rawValue ?? null, percentile: null, percentileSource: null, contribution: 0, available: false });
      continue;
    }

    if (percentileSource === "baseline") usedBaseline = true;
    accumulator.weightSum += weight;
    accumulator.weightedSum += weight * percentile;
    accumulator.available += 1;
    contributions.push({ key: metric.key, label: metric.label, pillar: metric.pillar, rawValue: rawValue ?? null, percentile, percentileSource, contribution: 0, available: true });
  }

  // Pillar scores (weight redistribution for missing metrics — never NaN).
  const pillars: PillarResult[] = config.pillars.map((pillar) => {
    const accumulator = pillarAccumulator.get(pillar.key) ?? { weightSum: 0, weightedSum: 0, available: 0, total: 0 };
    const score = accumulator.weightSum > 0 ? round(accumulator.weightedSum / accumulator.weightSum, 2) : null;
    const coverage = accumulator.total > 0 ? accumulator.available / accumulator.total : 0;
    return {
      key: pillar.key,
      label: pillar.label,
      weight: pillar.weight,
      score,
      confidence: round(coverage * freshness, 4) ?? 0,
      metricsAvailable: accumulator.available,
      metricsTotal: accumulator.total,
    };
  });

  // Composite = Σ W_k P_k over pillars with a score, renormalised by the weight
  // actually available so a missing pillar does not silently drag the score down.
  const availablePillars = pillars.filter((pillar) => pillar.score !== null);
  const availablePillarWeight = availablePillars.reduce((acc, pillar) => acc + pillar.weight, 0);
  const weightedPillarSum = availablePillars.reduce((acc, pillar) => acc + pillar.weight * (pillar.score as number), 0);
  const preOverlay = availablePillarWeight > 0 ? round(weightedPillarSum / availablePillarWeight, 2) : null;

  // Exact additive decomposition: metric i contributes W_p * (w_i * p_i / Σ w_avail)
  // within its pillar, normalised by the available pillar weight.
  if (preOverlay !== null) {
    for (const contribution of contributions) {
      if (!contribution.available || contribution.percentile === null) continue;
      const pillar = pillars.find((item) => item.key === contribution.pillar);
      const accumulator = pillarAccumulator.get(contribution.pillar);
      if (!pillar || !accumulator || accumulator.weightSum === 0 || availablePillarWeight === 0) continue;
      const { weight } = metricForSector(config.metrics.find((metric) => metric.key === contribution.key) ?? config.metrics[0], sector);
      const share = (weight * contribution.percentile) / accumulator.weightSum;
      // Units are already 0-100 (percentile x weight share), so the pillar weight
      // fraction times the share, normalised by the available pillar weight,
      // yields the metric's points on the final composite scale.
      contribution.contribution = round((pillar.weight * share) / availablePillarWeight, 4) ?? 0;
    }
  }

  const overlay = evaluateOverlay(input, config);
  const score = preOverlay === null ? null : clampNumber(preOverlay - Math.abs(overlay.total), 0, 100);

  // Overall confidence: weighted metric coverage x freshness (PRD 18).
  const totalWeight = config.metrics.reduce((acc, metric) => acc + metricForSector(metric, sector).weight, 0);
  const availableWeight = config.metrics.reduce((acc, metric) => {
    const { weight } = metricForSector(metric, sector);
    if (weight <= 0) return acc;
    const usable = isUsableValue(input.metrics[metric.key] ?? null, metric.negativeMeansUnavailable);
    return acc + (usable ? weight : 0);
  }, 0);
  const coverage = totalWeight > 0 ? availableWeight / totalWeight : 0;
  const confidence = round(coverage * freshness, 4) ?? 0;

  const provisional = confidence < config.provisionalConfidenceThreshold || score === null;
  const band = config.ratingBands.find((item) => (score ?? -1) >= item.min) ?? config.ratingBands[config.ratingBands.length - 1];

  return {
    symbol: input.symbol,
    sector,
    configVersion: config.version,
    score,
    preOverlayScore: preOverlay,
    overlayTotal: overlay.total,
    overlayPenalties: overlay.penalties,
    confidence,
    grade: provisional ? "Provisional" : band.grade,
    gradeMeaning: provisional ? "Confidence below the reporting threshold; shown as provisional." : band.meaning,
    pillars,
    contributions: contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)),
    unavailable,
    peerSource: usedBaseline ? (contributions.some((item) => item.percentileSource === "sector") ? "mixed" : "baseline") : contributions.some((item) => item.percentileSource === "sector") ? "sector" : "none",
    provisional,
  };
}

/** The largest positive and negative contributors — the "what drives this score" list. */
export function topDrivers(result: DeepScoreResult, limit = 5): { positive: MetricContribution[]; negative: MetricContribution[] } {
  const available = result.contributions.filter((item) => item.available);
  const positive = [...available].filter((item) => item.contribution > 0).sort((a, b) => b.contribution - a.contribution).slice(0, limit);
  const negative = [...available].filter((item) => item.contribution < 0).sort((a, b) => a.contribution - b.contribution).slice(0, limit);
  return { positive, negative };
}

/** Sanity helper used by tests and the report: contributions sum to the pre-overlay score. */
export function contributionSum(result: DeepScoreResult): number | null {
  return sumValid(result.contributions.map((item) => item.contribution));
}
