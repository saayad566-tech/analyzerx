/**
 * Source state machine (Phase 2).
 *
 * The specification is explicit about three traps:
 *   - a configured connector is not necessarily connected;
 *   - a successful HTTP response does not necessarily mean valid financial data
 *     was retrieved;
 *   - a connected source without a successful recent check must not be marked
 *     healthy.
 *
 * So the state is always derived from recorded evidence, and a transition is
 * only legal along the edges declared below. Anything else is a bug rather than
 * a judgement call.
 */

import type { AccessClass, HealthEvidence, SourceState } from "./types";

/** How long a successful check stays fresh before a source is called stale. */
export const STALENESS_HOURS = 48;

/**
 * The legal edges. A source may not jump from `planned` to `connected`, because
 * that would claim a working integration that has never run.
 */
const TRANSITIONS: Record<SourceState, SourceState[]> = {
  planned: ["available", "unsupported", "blocked"],
  available: ["connected", "blocked", "degraded", "failed", "unsupported"],
  connected: ["stale", "degraded", "failed", "blocked"],
  stale: ["connected", "degraded", "failed", "blocked"],
  degraded: ["connected", "stale", "failed", "blocked"],
  failed: ["connected", "degraded", "stale", "blocked"],
  blocked: ["available", "planned", "unsupported"],
  unsupported: ["available", "planned", "blocked"],
};

export function canTransition(from: SourceState, to: SourceState): boolean {
  if (from === to) return true;
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** The states reachable from a given state. */
export function nextStates(from: SourceState): SourceState[] {
  return TRANSITIONS[from] ?? [];
}

export type StateDerivation = {
  state: SourceState;
  /** Why the state was derived, in plain language. */
  reason: string;
};

export type DeriveInput = {
  accessClass: AccessClass;
  /** Whether an adapter exists in the codebase for this source. */
  hasAdapter: boolean;
  /** Whether the adapter has ever retrieved valid, parsed data end to end. */
  verifiedEndToEnd: boolean;
  health: HealthEvidence;
  /** True when the source's own terms forbid the access being attempted. */
  termsForbidAccess?: boolean;
  /** A dependency that blocks the source, when one exists. */
  blocker?: string | null;
  now?: Date;
  stalenessHours?: number;
};

/**
 * Derive the state from evidence.
 *
 * The order of the checks matters: an unsupported or terms-forbidden source is
 * never reported as merely stale, and a source that has never produced valid
 * data is never reported as connected even if its HTTP calls succeed.
 */
export function deriveState(input: DeriveInput): StateDerivation {
  const now = input.now ?? new Date();
  const stalenessHours = input.stalenessHours ?? STALENESS_HOURS;

  if (input.accessClass === "F_unsupported") {
    return { state: "unsupported", reason: "The source is unsupported: no permitted access path has been established." };
  }

  if (input.termsForbidAccess) {
    return { state: "blocked", reason: "The source's terms do not permit this access, so it is blocked rather than attempted." };
  }

  if (!input.hasAdapter) {
    return {
      state: input.blocker ? "blocked" : "planned",
      reason: input.blocker
        ? `No adapter is implemented. Blocked on: ${input.blocker}`
        : "No adapter is implemented for this source yet.",
    };
  }

  if (!input.verifiedEndToEnd) {
    return {
      state: input.blocker ? "blocked" : "available",
      reason: input.blocker
        ? `An adapter exists but no end-to-end run has retrieved valid data. Blocked on: ${input.blocker}`
        : "An adapter exists, but no end-to-end run has yet retrieved and parsed valid data from this source.",
    };
  }

  if (input.health.lastError) {
    return { state: "degraded", reason: `The most recent attempt failed: ${input.health.lastError}` };
  }

  if (!input.health.lastSuccessfulCheckUtc) {
    // The adapter has produced valid data, but no check time is recorded, so
    // current health cannot be asserted. This is "available" (capability
    // proven) rather than "connected" (healthy now) or "stale" (was fresh,
    // now old) - neither of which the evidence supports.
    return {
      state: "available",
      reason: "An end-to-end run has retrieved valid data, but no check time is recorded, so current health is not asserted.",
    };
  }

  const last = new Date(input.health.lastSuccessfulCheckUtc);
  if (Number.isNaN(last.getTime())) {
    return { state: "stale", reason: "The recorded last-successful-check time could not be parsed, so health cannot be asserted." };
  }

  const ageHours = (now.getTime() - last.getTime()) / 3_600_000;
  if (ageHours > stalenessHours) {
    return {
      state: "stale",
      reason: `The last successful check was ${Math.round(ageHours)} hours ago, beyond the ${stalenessHours}-hour freshness window.`,
    };
  }

  return {
    state: "connected",
    reason: `Valid data was retrieved and the last successful check was ${Math.round(ageHours)} hours ago, within the freshness window.`,
  };
}

/**
 * Apply a derived state to a record, refusing an illegal jump.
 * Returns the record unchanged and reports the refusal rather than silently
 * forcing an invalid transition.
 */
export function applyState<T extends { state: SourceState }>(record: T, next: SourceState): { record: T; applied: boolean; note: string | null } {
  if (canTransition(record.state, next)) {
    return { record: { ...record, state: next }, applied: true, note: null };
  }
  return {
    record,
    applied: false,
    note: `Refused an invalid transition ${record.state} -> ${next}.`,
  };
}
