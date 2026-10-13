/**
 * FII/DII flow semantics (FIX 06).
 *
 * Observed problems: a "Today" filter showed an October-1 report as if it were
 * today's; a percentage was shown even when the comparison was mathematically
 * undefined; and selecting the "Buyback" filter only re-ordered the list, so
 * aggregate FII/DII cards stayed visible as if they were buyback signals.
 *
 * This module makes the rules explicit and testable:
 *  - report date, retrieval time and last successful check stay separate;
 *  - a requested period is resolved against the sessions that actually exist,
 *    and when the newest report is missing the app says so and names the latest
 *    available session instead of relabelling old data;
 *  - a percentage is only shown when it is defined (non-zero denominator and no
 *    sign reversal), otherwise a documented explanation is returned;
 *  - a signal filter (Buyback, government benefit) restricts the dataset rather
 *    than only sorting it, and an empty result is reported as empty.
 */

import { round } from "./precision";

/* ------------------------------------------------------------------ periods */

export type FlowRangeKey = "TODAY" | "THREE_DAYS" | "ONE_WEEK" | "ONE_MONTH" | "QTD";

export type TradingCalendar = {
  /** ISO dates (YYYY-MM-DD) on which the exchange is closed. */
  holidays?: string[];
};

/** Session length in days for each requested range. */
export const FLOW_RANGE_DAYS: Record<FlowRangeKey, number> = {
  TODAY: 1,
  THREE_DAYS: 3,
  ONE_WEEK: 7,
  ONE_MONTH: 30,
  QTD: 92,
};

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** A trading session is a weekday that is not a listed exchange holiday. */
export function isTradingSession(isoDate: string, calendar: TradingCalendar = {}): boolean {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return false;
  const day = date.getUTCDay();
  if (day === 0 || day === 6) return false;
  return !(calendar.holidays ?? []).includes(isoDate);
}

/** The most recent trading session on or before `now`. */
export function latestTradingSession(now: Date, calendar: TradingCalendar = {}): string {
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  for (let step = 0; step < 14; step += 1) {
    const iso = toIsoDate(cursor);
    if (isTradingSession(iso, calendar)) return iso;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return toIsoDate(now);
}

export type FlowPeriodResolution = {
  requestedRange: FlowRangeKey;
  /** Sessions actually used, newest first. */
  sessions: string[];
  /** The newest session the exchange has held that the range should cover. */
  expectedLatestSession: string;
  /** The newest session present in the data. */
  latestAvailableSession: string | null;
  /** True when the data reaches the expected latest session. */
  upToDate: boolean;
  /** Plain-language explanation; never relabels old data as new. */
  note: string;
};

/**
 * Resolve a requested range against the sessions present in the data. The
 * caller keeps the report date separate from retrieval time; this function only
 * decides which sessions a range covers and whether the newest one is present.
 */
export function resolveFlowPeriod(range: FlowRangeKey, availableSessions: readonly string[], now: Date, calendar: TradingCalendar = {}): FlowPeriodResolution {
  const expectedLatestSession = latestTradingSession(now, calendar);
  const valid = [...availableSessions].filter((session) => /^\d{4}-\d{2}-\d{2}$/.test(session)).sort((a, b) => b.localeCompare(a));
  const latestAvailableSession = valid[0] ?? null;

  const windowDays = FLOW_RANGE_DAYS[range];
  const cutoff = new Date(`${expectedLatestSession}T00:00:00.000Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - (windowDays - 1));
  const cutoffIso = toIsoDate(cutoff);

  // Only sessions inside the requested window, and never in the future.
  const sessions = valid.filter((session) => session <= expectedLatestSession && session >= cutoffIso);
  const upToDate = latestAvailableSession !== null && latestAvailableSession >= expectedLatestSession;

  let note: string;
  if (latestAvailableSession === null) {
    note = "No report sessions are available from the configured flow provider.";
  } else if (upToDate) {
    note = `Showing ${sessions.length} session${sessions.length === 1 ? "" : "s"} up to ${latestAvailableSession}.`;
  } else if (range === "TODAY") {
    note = `Today's report has not been published yet; the latest available session is ${latestAvailableSession}.`;
  } else {
    note = `The newest published session is ${latestAvailableSession} (expected ${expectedLatestSession}); older sessions are shown with their real report dates.`;
  }

  return { requestedRange: range, sessions, expectedLatestSession, latestAvailableSession, upToDate, note };
}

/* --------------------------------------------------------------- percentages */

export type PercentChangeStatus = "ok" | "missing" | "zero-denominator" | "sign-reversal";

export type PercentChangeResult = {
  pct: number | null;
  status: PercentChangeStatus;
  /** Human-readable explanation, always safe to display. */
  label: string;
};

/**
 * Percentage change with documented conventions. A signed quantity (net flow)
 * has no meaningful percentage change when the prior value is zero, or when the
 * sign flips between periods — both return null with a reason rather than a
 * misleading number.
 */
export function percentChangeConvention(current: number | null, previous: number | null): PercentChangeResult {
  if (current === null || previous === null || !Number.isFinite(current) || !Number.isFinite(previous)) {
    return { pct: null, status: "missing", label: "No comparable period" };
  }
  if (previous === 0) {
    return { pct: null, status: "zero-denominator", label: "Undefined — the prior period was zero" };
  }
  if (previous < 0 !== current < 0) {
    return { pct: null, status: "sign-reversal", label: "Undefined — the flow reversed sign between periods" };
  }
  return { pct: round(((current - previous) / Math.abs(previous)) * 100, 2) ?? null, status: "ok", label: "vs comparable period" };
}

/* ------------------------------------------------------------------- filters */

export type FlowSignalFilter = "buyback" | "governmentBenefit";

export type FlowSignalCandidate = { entity: string; changeLabel?: string; category?: string };

const SIGNAL_PATTERNS: Record<FlowSignalFilter, RegExp> = {
  buyback: /buyback|buy-?back|tender offer|capital reduction/i,
  governmentBenefit: /government|ministry|psu order|policy|subsidy|tender award/i,
};

/** True only when the record itself is a matching signal. */
export function matchesSignalFilter(candidate: FlowSignalCandidate, signal: FlowSignalFilter): boolean {
  const haystack = `${candidate.entity ?? ""} ${candidate.changeLabel ?? ""}`;
  return SIGNAL_PATTERNS[signal].test(haystack);
}

export type FlowFilterState = {
  /** Investor/participant category filter. */
  category: string | null;
  /** Signal/event filter, applied as a restriction not a sort. */
  signal: FlowSignalFilter | null;
};

/**
 * Apply the category and signal filters. The signal filter restricts the set, so
 * selecting "Buyback" can never leave aggregate FII/DII cards on screen.
 */
export function applyFlowFilters<T extends FlowSignalCandidate & { category?: string }>(rows: readonly T[], state: FlowFilterState): { rows: T[]; emptyReason: string | null } {
  let filtered = [...rows];
  if (state.category && state.category !== "All") {
    filtered = filtered.filter((row) => row.category === state.category);
  }
  if (state.signal) {
    filtered = filtered.filter((row) => matchesSignalFilter(row, state.signal!));
  }
  if (filtered.length === 0) {
    const parts: string[] = [];
    if (state.signal) parts.push(state.signal === "buyback" ? "verified buyback signals" : "verified government-benefit signals");
    if (state.category && state.category !== "All") parts.push(`the ${state.category} category`);
    return { rows: [], emptyReason: `No ${parts.join(" in ") || "records"} match the current filters.` };
  }
  return { rows: filtered, emptyReason: null };
}
