/**
 * Sector-relative percentile scoring with winsorisation (PRD 8.1 step 4-5,
 * FR-4, and Section 18).
 *
 * score = 100 * rank(x within sector) / N, inverted when lower is better.
 * Cleaning winsorises at the 1st/99th percentile within the sector and treats a
 * negative value on a "negative means not meaningful" metric (e.g. negative
 * P/E) as unavailable rather than "cheap".
 */

import { round } from "../precision";
import type { MetricDirection } from "./config";

/** Winsorise a sample at the given percentiles (defaults 1st/99th). */
export function winsorise(values: readonly number[], lowerPercentile = 0.01, upperPercentile = 0.99): number[] {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return [];
  const sorted = [...finite].sort((a, b) => a - b);
  const lower = quantile(sorted, lowerPercentile);
  const upper = quantile(sorted, upperPercentile);
  return finite.map((value) => Math.min(upper, Math.max(lower, value)));
}

/** Linear-interpolated quantile of an already-sorted array. */
export function quantile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  if (sorted.length === 1) return sorted[0];
  const position = Math.min(1, Math.max(0, p)) * (sorted.length - 1);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  if (lowerIndex === upperIndex) return sorted[lowerIndex];
  const weight = position - lowerIndex;
  return sorted[lowerIndex] * (1 - weight) + sorted[upperIndex] * weight;
}

/**
 * Percentile rank of `value` within `peers` (both winsorised together), 0-100.
 * Inverted for "lower-better" metrics so 100 is always the most attractive.
 */
export function sectorPercentile(value: number, peers: readonly number[], direction: MetricDirection = "higher-better"): number | null {
  if (!Number.isFinite(value)) return null;
  const peerSample = winsorise(peers);
  // With no peers the metric is neutral rather than unusable, so a lone name can
  // still be scored (with the confidence penalty carried by the coverage term).
  if (peerSample.length === 0) return 50;
  const below = peerSample.filter((peer) => peer < value).length;
  const equal = peerSample.filter((peer) => peer === value).length;
  // Mid-rank so ties do not inflate the score.
  const percentile = (100 * (below + equal / 2)) / peerSample.length;
  const oriented = direction === "lower-better" ? 100 - percentile : percentile;
  return round(oriented, 2);
}

/**
 * Absolute-anchor percentile: maps `best` to 100 and `worst` to 0, clamped.
 * Used only when no sector peer sample exists (clearly labelled as such).
 */
export function anchoredPercentile(value: number, anchors: { best: number; worst: number }): number | null {
  if (!Number.isFinite(value)) return null;
  const span = anchors.best - anchors.worst;
  if (span === 0) return 50;
  const percentile = (100 * (value - anchors.worst)) / span;
  return round(Math.min(100, Math.max(0, percentile)), 2);
}

/** True when a value is usable given the metric's semantics. */
export function isUsableValue(value: number | null | undefined, negativeMeansUnavailable = false): boolean {
  if (value === null || value === undefined || !Number.isFinite(value)) return false;
  if (negativeMeansUnavailable && value < 0) return false;
  return true;
}
