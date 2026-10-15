/**
 * Data-source status model (master mandate Phase 6 / §8).
 *
 * The mandate requires every source to carry one of seven explicit states with a
 * reason, and forbids marking a source `Covered` merely because its website is
 * reachable or a connector has been written. A fallback may only change a
 * category's status after it has returned validated, relevant data.
 *
 * This module turns the raw signals a source actually has (adapter present,
 * credential present, last success, last error, documented restriction, field
 * completeness) into exactly one of those states, plus the reason.
 */

export type SourceStatus =
  | "operational"
  | "partially-covered"
  | "unavailable"
  | "blocked"
  | "not-configured"
  | "not-implemented"
  | "requires-user-action";

export type SourceStatusInput = {
  /** A functioning retrieval path exists in code. */
  adapterExists: boolean;
  /** The source needs a credential to work. */
  requiresCredential?: boolean;
  /** A credential is actually present. */
  credentialPresent?: boolean;
  /** The source needs something only the user can supply (consent, upload, config). */
  requiresUserAction?: boolean;
  /** A documented restriction prevents access through the current method. */
  blockedReason?: string | null;
  /** Last successful, validated retrieval. */
  lastSuccessAt?: string | null;
  /** Last failure message, if any. */
  lastError?: string | null;
  /** Required fields for this category. */
  requiredFields?: number;
  /** Fields actually returned and validated. */
  validatedFields?: number;
  /** Injectable clock. */
  now?: number;
  /** How long a success stays current. */
  maxAgeMs?: number;
};

export type SourceStatusResult = {
  status: SourceStatus;
  label: string;
  reason: string;
  /** True only for `operational` — the mandate's "Covered" bar. */
  canClaimCovered: boolean;
  /** Fraction of required fields validated, when applicable. */
  fieldCoverage: number | null;
};

const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const LABELS: Record<SourceStatus, string> = {
  operational: "Operational",
  "partially-covered": "Partially Covered",
  unavailable: "Unavailable",
  blocked: "Blocked",
  "not-configured": "Not Configured",
  "not-implemented": "Not Implemented",
  "requires-user-action": "Requires User Action",
};

function result(status: SourceStatus, reason: string, fieldCoverage: number | null): SourceStatusResult {
  return { status, label: LABELS[status], reason, canClaimCovered: status === "operational", fieldCoverage };
}

/** Derive the single authoritative status for a source. */
export function deriveSourceStatus(input: SourceStatusInput): SourceStatusResult {
  const now = input.now ?? Date.now();
  const maxAgeMs = input.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const required = input.requiredFields ?? 0;
  const validated = input.validatedFields ?? 0;
  const fieldCoverage = required > 0 ? Math.min(1, Math.max(0, validated / required)) : null;

  // Order matters: the most specific, most actionable cause wins.
  if (!input.adapterExists) {
    return result("not-implemented", "No functioning adapter or retrieval path exists for this source.", fieldCoverage);
  }
  if (input.requiresUserAction) {
    return result("requires-user-action", "This source needs an action from you (consent, an uploaded document, or configuration) before it can return data.", fieldCoverage);
  }
  if (input.requiresCredential && !input.credentialPresent) {
    return result("not-configured", "This source requires a credential that is not configured.", fieldCoverage);
  }
  if (input.blockedReason) {
    return result("blocked", input.blockedReason, fieldCoverage);
  }
  if (!input.lastSuccessAt) {
    return result("unavailable", input.lastError ? `No successful retrieval yet. Last error: ${input.lastError.slice(0, 160)}` : "No successful retrieval has been recorded yet.", fieldCoverage);
  }

  const lastSuccess = Date.parse(input.lastSuccessAt);
  if (!Number.isFinite(lastSuccess)) {
    return result("unavailable", "The recorded last-success timestamp is not a valid date.", fieldCoverage);
  }
  const age = now - lastSuccess;
  if (age > maxAgeMs) {
    return result("partially-covered", `The most recent validated data is ${Math.round(age / 3_600_000)} hours old, beyond the ${Math.round(maxAgeMs / 3_600_000)}-hour freshness window.`, fieldCoverage);
  }
  if (required > 0 && validated < required) {
    return result("partially-covered", `${validated} of ${required} required fields were returned and validated.`, fieldCoverage);
  }
  return result("operational", "Recent data was retrieved and validated for this source.", fieldCoverage);
}

/**
 * Whether a fallback may change a category's status. The mandate is explicit: a
 * fallback counts only once it has returned validated, relevant data.
 */
export function fallbackMayPromote(fallback: { returnedValidatedData: boolean; relevantToCategory: boolean }): boolean {
  return fallback.returnedValidatedData && fallback.relevantToCategory;
}

/**
 * Coverage must be calculated from validated records, never from the number of
 * registered sources or written connectors (mandate §9). The denominator is
 * stated explicitly.
 */
export function calculateCoverage(input: { requiredItems: number; validatedItems: number }): { coverage: number | null; denominator: string } {
  const denominator = `${input.requiredItems} required market/category/field/period combinations`;
  if (input.requiredItems <= 0) return { coverage: null, denominator: "no required items were declared" };
  const coverage = Math.min(1, Math.max(0, input.validatedItems / input.requiredItems));
  return { coverage, denominator };
}
