/**
 * Strict market-context isolation.
 *
 * The defect this fixes: market data bleeding. Switching India -> USA could leave
 * Indian indices, tickers or news bound to the UI, or let a late US response
 * overwrite the newly selected market. Two mechanisms prevent that here:
 *
 *  1. NAMESPACING. Every cache key, query key and stored payload carries the
 *     country code, so `data:US:quotes:AAPL` can never collide with
 *     `data:IN:quotes:AAPL`. Nothing is stored in an unscoped key.
 *
 *  2. ATOMIC SWITCHING WITH EPOCHS. A switch runs a fixed lifecycle and stamps
 *     every in-flight request with the epoch it was issued under. When the user
 *     switches again mid-flight, the epoch moves; the older request's result is
 *     then recognised as superseded and DISCARDED rather than rendered. This is
 *     what stops a slow Indian response landing after a switch to the US.
 *
 * This module is pure — no React, no react-native, no I/O — so it is fully
 * unit-testable and cannot itself become a source of market confusion.
 */

export type MarketId = string;

/** Categories that are namespaced per market. */
export type MarketCategory =
  | "quotes"
  | "news"
  | "macro"
  | "filings"
  | "fundamentals"
  | "flows"
  | "options"
  | "indices"
  | "sectors"
  | "watchlist"
  | "search";

/**
 * Build a market-scoped cache/query key. Every part is namespaced with the country
 * code so two markets can never share a key.
 *
 *   marketScopeKey("US", "quotes", "AAPL") -> "data:US:quotes:AAPL"
 */
export function marketScopeKey(marketId: MarketId, category: MarketCategory, ...parts: (string | number)[]): string {
  const market = normaliseMarket(marketId);
  if (!market) throw new Error("marketScopeKey requires a non-empty market id");
  const tail = parts
    .filter((part) => part !== null && part !== undefined && `${part}`.length > 0)
    .map((part) => `${part}`.trim().toUpperCase());
  return ["data", market, category, ...tail].join(":");
}

/** Normalise a market id to its canonical upper-case form, or "" when absent. */
export function normaliseMarket(marketId: string | null | undefined): string {
  return (marketId ?? "").trim().toUpperCase();
}

export type ScopedEnvelope<T> = {
  /** The market the payload was produced for. REQUIRED — there is no unscoped form. */
  market: MarketId;
  value: T;
};

export type ScopeVerdict =
  | { ok: true }
  | { ok: false; reason: string; expected: string; received: string };

/**
 * Decide whether a payload belongs to the active market.
 *
 * A payload with no market is rejected: an unscoped payload is exactly how
 * cross-market data gets in, so it is treated as invalid rather than assumed
 * to be fine.
 */
export function checkMarketScope(
  payload: { market?: string | null } | null | undefined,
  activeMarketId: MarketId,
): ScopeVerdict {
  const expected = normaliseMarket(activeMarketId);
  if (!expected) return { ok: false, reason: "No active market is set.", expected, received: "" };
  if (!payload) return { ok: false, reason: "Payload is missing its market scope.", expected, received: "" };
  const received = normaliseMarket(payload.market);
  if (!received) {
    return {
      ok: false,
      reason: "Payload has no market scope; unscoped data is rejected so markets cannot mix.",
      expected,
      received,
    };
  }
  if (received !== expected) {
    return {
      ok: false,
      reason: `Payload belongs to market ${received} but the active market is ${expected}. Cross-market data is rejected.`,
      expected,
      received,
    };
  }
  return { ok: true };
}

/** Convenience boolean form of {@link checkMarketScope}. */
export function isScopedToMarket(
  payload: { market?: string | null } | null | undefined,
  activeMarketId: MarketId,
): boolean {
  return checkMarketScope(payload, activeMarketId).ok;
}

/**
 * Drop any row that is not scoped to the active market.
 *
 * `pick` reads the market off a row; a row whose market is absent or different is
 * discarded. Never returns another market's rows, and never substitutes them.
 */
export function filterToMarket<T>(
  rows: readonly T[] | null | undefined,
  activeMarketId: MarketId,
  pick: (row: T) => string | null | undefined,
): T[] {
  const expected = normaliseMarket(activeMarketId);
  if (!expected || !rows) return [];
  return rows.filter((row) => normaliseMarket(pick(row)) === expected);
}

export type SwitchPhase =
  | "idle"
  | "start"
  | "flushed"
  | "torn-down"
  | "swapped"
  | "fetched"
  | "complete";

export type SwitchTicket = {
  /** Monotonic id for this switch attempt. Later switches get a larger epoch. */
  epoch: number;
  /** The market this attempt is switching TO. */
  target: string;
  /** Aborted when a newer switch begins, so stale requests stop. */
  signal: AbortSignal;
};

export type SwitchTrace = { epoch: number; target: string; phase: SwitchPhase; at: number };

export type MarketSwitchController = {
  /** Current active market, or null before the first switch. */
  current(): string | null;
  /** The latest epoch issued. */
  epoch(): number;
  /**
   * Step 1-2: pause the previous market and flush its volatile state.
   * Returns a ticket carrying the new epoch and an AbortSignal.
   */
  begin(target: MarketId): SwitchTicket;
  /** Step 3: close sockets/pollers bound to the previous market. */
  teardown(epoch: number): boolean;
  /** Step 4: commit the new active market. */
  swap(epoch: number): boolean;
  /** Step 5: mark data as fetched for this epoch. */
  fetched(epoch: number): boolean;
  /** Step 6: mark the switch complete. */
  complete(epoch: number): boolean;
  /**
   * True when `epoch` is still the newest. A stale response must be discarded:
   *   const t = controller.begin("US");
   *   const data = await load(t.signal);
   *   if (!controller.isCurrent(t.epoch)) return;   // user switched again
   */
  isCurrent(epoch: number): boolean;
  /** Abort whatever is in flight (used on unmount). */
  abort(): void;
  /** Ordered trace of phases, for diagnostics and tests. */
  trace(): SwitchTrace[];
};

export type SwitchHooks = {
  /** Called before the new market is committed — clear caches, indexes, lists. */
  onFlush?: (previous: string | null, target: string) => void;
  /** Called when a switch is superseded by a newer one. */
  onSuperseded?: (epoch: number, target: string) => void;
  /** Injectable clock for deterministic tests. */
  now?: () => number;
};

/**
 * Create a controller that enforces the atomic switch lifecycle:
 *
 *   begin -> teardown -> swap -> fetched -> complete
 *
 * A switch that is superseded part-way through stops advancing: every later step
 * returns false, so a stale switch can never commit its market or render its data.
 */
export function createMarketSwitchController(hooks: SwitchHooks = {}): MarketSwitchController {
  const now = hooks.now ?? (() => Date.now());
  let active: string | null = null;
  let epoch = 0;
  let inFlight: AbortController | null = null;
  const phases: SwitchTrace[] = [];

  const record = (at: number, target: string, phase: SwitchPhase) => {
    phases.push({ epoch: at, target, phase, at: now() });
  };

  const isCurrent = (candidate: number) => candidate === epoch;

  return {
    current: () => active,
    epoch: () => epoch,
    trace: () => phases.slice(),

    begin(target) {
      const next = normaliseMarket(target);
      if (!next) throw new Error("begin requires a non-empty target market");

      // Supersede whatever was in flight.
      if (inFlight) {
        const supersededEpoch = epoch;
        const supersededTarget = phases.length ? phases[phases.length - 1].target : "";
        inFlight.abort();
        hooks.onSuperseded?.(supersededEpoch, supersededTarget);
      }

      epoch += 1;
      inFlight = new AbortController();
      const previous = active;
      record(epoch, next, "start");

      // FLUSH: drop volatile state for the previous market.
      hooks.onFlush?.(previous, next);
      record(epoch, next, "flushed");

      return { epoch, target: next, signal: inFlight.signal };
    },

    teardown(candidate) {
      if (!isCurrent(candidate)) return false;
      record(candidate, phases[phases.length - 1]?.target ?? "", "torn-down");
      return true;
    },

    swap(candidate) {
      if (!isCurrent(candidate)) return false;
      const target = phases[phases.length - 1]?.target ?? "";
      active = target;
      record(candidate, target, "swapped");
      return true;
    },

    fetched(candidate) {
      if (!isCurrent(candidate)) return false;
      record(candidate, active ?? "", "fetched");
      return true;
    },

    complete(candidate) {
      if (!isCurrent(candidate)) return false;
      record(candidate, active ?? "", "complete");
      return true;
    },

    isCurrent,

    abort() {
      if (inFlight) inFlight.abort();
      inFlight = null;
      epoch += 1;
    },
  };
}

/** Build a react-query/tRPC query key that is namespaced by market. */
export function scopedQueryKey(marketId: MarketId, category: MarketCategory, ...parts: (string | number)[]): string[] {
  return [marketScopeKey(marketId, category, ...parts)];
}

/**
 * Re-key a record of per-market caches, dropping anything not belonging to the
 * active market. Used when hydrating from persisted storage, where an old
 * market's entries must not leak into the current view.
 */
export function isolateStoredByMarket<T>(
  stored: Record<string, T> | null | undefined,
  activeMarketId: MarketId,
): T | null {
  const expected = normaliseMarket(activeMarketId);
  if (!expected || !stored) return null;
  for (const key of Object.keys(stored)) {
    if (normaliseMarket(key) === expected) return stored[key];
  }
  return null;
}
