/**
 * Defensive text helpers for values that arrive from providers.
 *
 * A screen crashed with "Cannot read property 'replaceAll' of undefined" because
 * a provider-supplied enum (`signal.action`, `asset.action`) was rendered through
 * `.replaceAll(...)` without a guard. Provider payloads are untrusted: any field
 * can be absent, null, or the wrong type, and one missing field must never take
 * down a whole screen.
 *
 * These helpers make the safe behaviour the default and are unit-tested.
 */

/** Humanise an enum-like token: `"strong_buy"` -> `"strong buy"`. Never throws. */
export function humanize(value: unknown, separator: "_" | "-" = "_"): string {
  if (typeof value !== "string") return "Unavailable";
  const trimmed = value.trim();
  if (!trimmed) return "Unavailable";
  return trimmed.split(separator).join(" ");
}

/** Join a list of strings safely; returns "" for a missing or non-array value. */
export function joinList(value: unknown, separator = ", "): string {
  if (!Array.isArray(value)) return "";
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .join(separator);
}

/** Array length of a possibly-missing list. */
export function listLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

/** A display-safe string for any unknown value. */
export function displayText(value: unknown, fallback = "Unavailable"): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}
