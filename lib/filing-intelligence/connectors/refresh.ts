/**
 * Refresh filings (guidance: a Refresh filings button, automatic checks for new
 * documents from approved sources, and a visible status for every source).
 *
 * The orchestration is where the access policy actually bites: a connector is
 * called only when the policy allows the requested mode, and a source that is
 * blocked is reported as blocked with the reason, never silently skipped and
 * never presented as refreshed.
 *
 * Every source ends the run with one of the four states the guidance names -
 * Connected, Stale, Blocked or Unsupported - derived from the policy verdict
 * and the actual fetch result.
 */

import { mergeFetched, type CachedFiling } from "./cache";
import { evaluateAccess, type AccessBasis, type AccessMode } from "./policy";
import { CONNECTORS } from "./registry";
import type { Connector } from "./types";
import type { CoverageStatus } from "../types";

export type SourceOutcome = {
  sourceId: string;
  label: string;
  market: string;
  /** One of connected | stale | blocked | unsupported | planned | degraded. */
  status: CoverageStatus;
  allowed: boolean;
  message: string;
  added: number;
  existing: number;
  lastSuccessfulCheckUtc: string | null;
  lastError: string | null;
  accessBasis: AccessBasis;
  termsNote: string;
  attributionRequired: boolean;
  verifiedEndToEnd: boolean;
};

export type RefreshResult = {
  mode: AccessMode;
  ranAtUtc: string;
  outcomes: SourceOutcome[];
  cache: CachedFiling[];
  totalAdded: number;
  /** Plain-language summary of the run, shown to the user. */
  message: string;
};

export type RefreshOptions = {
  cache: CachedFiling[];
  query?: { symbol?: string; companyName?: string; limit?: number };
  mode: AccessMode;
  connectors?: Connector[];
  now?: Date;
};

/**
 * Run one refresh across every registered source, in the given mode.
 *
 * In `automatic` mode the sources whose terms forbid systematic collection come
 * back blocked, which is the point: a background run must not harvest them.
 */
export async function refreshFilings(options: RefreshOptions): Promise<RefreshResult> {
  const connectors = options.connectors ?? CONNECTORS;
  const now = options.now ?? new Date();
  const query = options.query ?? {};
  let cache = options.cache;
  let totalAdded = 0;
  const outcomes: SourceOutcome[] = [];

  for (const connector of connectors) {
    const terms = connector.terms;
    const decision = evaluateAccess(terms, options.mode);

    if (!decision.allowed) {
      outcomes.push({
        sourceId: terms.sourceId,
        label: terms.label,
        market: terms.market,
        status: decision.status,
        allowed: false,
        message: decision.reason,
        added: 0,
        existing: 0,
        lastSuccessfulCheckUtc: null,
        lastError: null,
        accessBasis: terms.accessBasis,
        termsNote: terms.termsNote,
        attributionRequired: terms.attributionRequired,
        verifiedEndToEnd: connector.verifiedEndToEnd,
      });
      continue;
    }

    let result;
    try {
      result = await connector.fetchFilings(query, options.mode);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      outcomes.push({
        sourceId: terms.sourceId,
        label: terms.label,
        market: terms.market,
        status: "degraded",
        allowed: true,
        message: `The adapter for ${terms.label} failed: ${message}`,
        added: 0,
        existing: 0,
        lastSuccessfulCheckUtc: null,
        lastError: message,
        accessBasis: terms.accessBasis,
        termsNote: terms.termsNote,
        attributionRequired: terms.attributionRequired,
        verifiedEndToEnd: connector.verifiedEndToEnd,
      });
      continue;
    }

    if (result.status === "not_implemented") {
      outcomes.push({
        sourceId: terms.sourceId,
        label: terms.label,
        market: terms.market,
        status: "planned",
        allowed: true,
        message: result.message,
        added: 0,
        existing: 0,
        lastSuccessfulCheckUtc: null,
        lastError: null,
        accessBasis: terms.accessBasis,
        termsNote: terms.termsNote,
        attributionRequired: terms.attributionRequired,
        verifiedEndToEnd: connector.verifiedEndToEnd,
      });
      continue;
    }

    const merge = mergeFetched(cache, terms.sourceId, result.filings, now);
    cache = merge.cache;
    totalAdded += merge.added.length;

    let status: CoverageStatus;
    if (result.status === "error") status = "degraded";
    else if (result.status === "blocked") status = "blocked";
    else if (result.status === "empty") status = "stale";
    else status = "connected";

    outcomes.push({
      sourceId: terms.sourceId,
      label: terms.label,
      market: terms.market,
      status,
      allowed: true,
      message: result.message,
      added: merge.added.length,
      existing: merge.existing.length,
      lastSuccessfulCheckUtc: result.status === "ok" ? now.toISOString() : null,
      lastError: result.status === "error" ? result.message : null,
      accessBasis: terms.accessBasis,
      termsNote: terms.termsNote,
      attributionRequired: terms.attributionRequired,
      verifiedEndToEnd: connector.verifiedEndToEnd,
    });
  }

  const connected = outcomes.filter((outcome) => outcome.status === "connected").length;
  const blocked = outcomes.filter((outcome) => outcome.status === "blocked").length;
  const failed = outcomes.filter((outcome) => outcome.status === "degraded").length;

  const parts: string[] = [];
  parts.push(totalAdded > 0 ? `${totalAdded} new filing${totalAdded === 1 ? "" : "s"} cached.` : "No new filings.");
  parts.push(`${connected} source${connected === 1 ? "" : "s"} read.`);
  if (blocked) parts.push(`${blocked} blocked by the source's terms.`);
  if (failed) parts.push(`${failed} source${failed === 1 ? "" : "s"} failed.`);

  return { mode: options.mode, ranAtUtc: now.toISOString(), outcomes, cache, totalAdded, message: parts.join(" ") };
}

/**
 * The four states the guidance asks to show for every source, in plain words,
 * with the reason a source is in that state.
 */
export function describeStatus(status: CoverageStatus): string {
  switch (status) {
    case "connected":
      return "Connected";
    case "stale":
      return "Stale";
    case "blocked":
      return "Blocked";
    case "unsupported":
      return "Unsupported";
    case "planned":
      return "Not implemented";
    case "degraded":
      return "Degraded";
    case "tested":
      return "Tested";
    case "production_ready":
      return "Production-ready";
    case "in_development":
      return "In development";
  }
}
