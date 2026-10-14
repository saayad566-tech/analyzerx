/**
 * Chart timeframes.
 *
 * Each entry maps a user-facing label to the two parameters the price source actually
 * takes: a `range` and an `interval`. Yahoo caps how far back a short interval can go
 * (a 1-minute series is only available for a few days), so the pairs here are chosen to
 * be ones the source will genuinely serve rather than ones that would return an error.
 */
export type TimeframeId = "1D" | "5D" | "1mo" | "3mo" | "6mo" | "1y" | "2y" | "5y";

export type Timeframe = {
  id: TimeframeId;
  label: string;
  /** Passed to the source as `range`. */
  range: string;
  /** Passed to the source as `interval`. */
  interval: string;
  /** One-line description of what the bars represent. */
  detail: string;
};

export const CHART_TIMEFRAMES: readonly Timeframe[] = [
  { id: "1D", label: "1D", range: "1d", interval: "5m", detail: "One session in 5-minute bars." },
  { id: "5D", label: "5D", range: "5d", interval: "30m", detail: "Five sessions in 30-minute bars." },
  { id: "1mo", label: "1M", range: "1mo", interval: "1d", detail: "One month of daily bars." },
  { id: "3mo", label: "3M", range: "3mo", interval: "1d", detail: "Three months of daily bars." },
  { id: "6mo", label: "6M", range: "6mo", interval: "1d", detail: "Six months of daily bars." },
  { id: "1y", label: "1Y", range: "1y", interval: "1d", detail: "One year of daily bars." },
  { id: "2y", label: "2Y", range: "2y", interval: "1wk", detail: "Two years of weekly bars." },
  { id: "5y", label: "5Y", range: "5y", interval: "1wk", detail: "Five years of weekly bars." },
];

export function timeframeById(id: string): Timeframe {
  return CHART_TIMEFRAMES.find((entry) => entry.id === id) ?? CHART_TIMEFRAMES[4];
}
