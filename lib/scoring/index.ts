/**
 * AnalyzerX Institutional Scoring Engine — public API.
 *
 * Two independent engines plus the fusion layer:
 *   A. Deep Analysis Score  — `computeDeepScore`
 *   B. News Impact Score    — `computeNewsImpact`
 *   Fusion                  — `fuseSignals`
 *
 * All are pure functions of features and a versioned config, so the same inputs
 * and the same config version always produce an identical score.
 */

export * from "./config";
export * from "./metrics";
export * from "./percentile";
export * from "./deep-score";
export * from "./news-impact";
export * from "./fusion";
