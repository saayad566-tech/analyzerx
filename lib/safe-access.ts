/**
 * Defensive nested access for provider payloads (mandate §4).
 *
 * Two recurring fatal crashes are addressed here:
 *   - "Cannot read property 'basis' of undefined"
 *   - "Cannot read property 'latestValue' of undefined"
 *
 * Both happen because a nested object (`metrics.operatingCashFlow`,
 * `summary`) is treated as guaranteed by the TypeScript type, while the runtime
 * payload can omit it. One missing field must not take down a screen.
 *
 * Every helper returns a safe value for any input and never throws.
 */

export type MaybeMetric = { value?: number | null; basis?: unknown; unit?: string | null; label?: unknown } | null | undefined;

/** A finite number, or null. */
export function metricValueOf(metric: MaybeMetric): number | null {
  const value = metric?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** The metric's `basis` string, or a fallback. */
export function metricBasis(metric: MaybeMetric, fallback = "unavailable"): string {
  const basis = metric?.basis;
  return typeof basis === "string" && basis.trim().length > 0 ? basis : fallback;
}

/** The metric's unit, or null. */
export function metricUnit(metric: MaybeMetric): string | null {
  const unit = metric?.unit;
  return typeof unit === "string" && unit.trim().length > 0 ? unit : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

/** `summary.latestValue` without crashing when `summary` is missing. */
export function summaryLatestValue(summary: unknown): number | null {
  const record = asRecord(summary);
  const value = record?.latestValue;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** `summary.latestPeriod` without crashing when `summary` is missing. */
export function summaryLatestPeriod(summary: unknown): string | null {
  const record = asRecord(summary);
  const value = record?.latestPeriod;
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/** The first entry of `summary.units`, or null. */
export function summaryFirstUnit(summary: unknown): string | null {
  const record = asRecord(summary);
  const units = record?.units;
  if (!Array.isArray(units)) return null;
  const first = units.find((unit) => typeof unit === "string" && unit.trim().length > 0);
  return typeof first === "string" ? first : null;
}

/**
 * Read `parent[key]` without crashing on a missing parent or a non-object value.
 * Useful where the code then reads further properties off the result.
 */
export function objectAt(parent: unknown, key: string): Record<string, unknown> | null {
  return asRecord(asRecord(parent)?.[key]);
}

/** Read a nested array safely. */
export function arrayAt(parent: unknown, key: string): unknown[] {
  const value = asRecord(parent)?.[key];
  return Array.isArray(value) ? value : [];
}
