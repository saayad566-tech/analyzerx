/**
 * Live-tracker operational states (FIX 04).
 *
 * The Live screen previously said "Automatic publication is active", "Server
 * freshness: not available", "0 providers configured" and "0 stored" at the
 * same time — mutually inconsistent claims, because the badge, the copy and the
 * counts were each computed from a different signal.
 *
 * This module derives ONE state from the real tracker inputs, and every piece of
 * copy the UI shows (badge, headline, description, counts, timestamps) is a pure
 * function of that single state. A successful empty poll is not a failure; a
 * failed request is not a successful empty poll.
 */

export type TrackerStateKey =
  | "unconfigured"
  | "configuration-incomplete"
  | "checking"
  | "healthy"
  | "stale"
  | "request-failed"
  | "authentication-failed"
  | "server-unavailable"
  | "empty-success"
  | "success-with-items";

export type TrackerTone = "neutral" | "progress" | "ok" | "warn" | "error";

export type TrackerStateInput = {
  /** Number of providers that are actually configured and enabled. */
  providersConfigured: number;
  /** Providers that must be configured for a complete pipeline (usually 1). */
  providersRequired?: number;
  /** Providers that are enabled but missing a required credential. */
  providersNeedingCredentials?: number;
  /** A check is in flight right now. */
  isChecking: boolean;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  /** Classification of the last error, when known. */
  errorKind?: "auth" | "network" | "server" | "unknown" | null;
  /** Articles persisted in total. */
  articlesStored: number;
  /** Articles persisted by the most recent successful check (0 = none found). */
  articlesStoredLastCheck?: number;
  /** How long a successful result stays "fresh". */
  staleAfterMs?: number;
  /**
   * True only when a real, always-on service performs polling, persistence,
   * deduplication and publication. An in-app foreground interval is NOT this.
   */
  hasDurableScheduler: boolean;
  /** Injectable clock so the derivation is pure and testable. */
  now?: number;
};

export type TrackerState = {
  key: TrackerStateKey;
  label: string;
  description: string;
  tone: TrackerTone;
  /** Whether the UI may claim automated publication for this state. */
  canClaimAutomation: boolean;
  /** Whether the app should describe its mode as on-device/manual instead. */
  onDeviceOnly: boolean;
  /** Age of the last successful check in ms, or null. */
  lastSuccessAgeMs: number | null;
};

const DEFAULT_STALE_AFTER_MS = 3 * 60 * 60 * 1000;

function parseMs(value: string | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** Derive the single operational state from the tracker inputs. */
export function deriveTrackerState(input: TrackerStateInput): TrackerState {
  const now = input.now ?? Date.now();
  const staleAfterMs = input.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const providersRequired = input.providersRequired ?? 1;
  const lastSuccessMs = parseMs(input.lastSuccessAt);
  const lastSuccessAgeMs = lastSuccessMs === null ? null : Math.max(0, now - lastSuccessMs);
  const needsCredentials = (input.providersNeedingCredentials ?? 0) > 0;

  const base = (key: TrackerStateKey, label: string, description: string, tone: TrackerTone, canClaimAutomation: boolean, onDeviceOnly: boolean): TrackerState => ({
    key, label, description, tone, canClaimAutomation, onDeviceOnly, lastSuccessAgeMs,
  });

  // 1. Nothing configured at all.
  if (input.providersConfigured === 0) {
    return base(
      "unconfigured",
      "Not configured",
      "No news provider is configured, so the tracker has nothing to poll. Automatic collection is not active. Add a provider credential or feed URL to enable checks.",
      "neutral",
      false,
      true,
    );
  }

  // 2. Some configuration, but not enough to run the pipeline.
  if (input.providersConfigured < providersRequired || needsCredentials) {
    return base(
      "configuration-incomplete",
      "Configuration incomplete",
      `Providers are configured but the pipeline is incomplete${needsCredentials ? " (a required credential is missing)" : ""}. Checks may be partial; automatic collection is not claimed.`,
      "warn",
      false,
      true,
    );
  }

  // 3. A check is running.
  if (input.isChecking) {
    return base("checking", "Checking", "A check is running against the configured providers.", "progress", false, !input.hasDurableScheduler);
  }

  // 4-6. Failures, classified.
  if (input.errorKind === "auth") {
    return base("authentication-failed", "Authentication failed", "A configured provider rejected the credential. No data was published from this check.", "error", false, !input.hasDurableScheduler);
  }
  if (input.errorKind === "server") {
    return base("server-unavailable", "Server unavailable", "The configured source could not be reached. Cached items keep their original report date and are marked stale.", "error", false, !input.hasDurableScheduler);
  }
  if (input.lastError && lastSuccessMs === null) {
    return base("request-failed", "Request failed", "The last check failed and no successful check has completed yet, so no items are shown as fresh.", "error", false, !input.hasDurableScheduler);
  }
  if (input.errorKind === "network") {
    return base("request-failed", "Request failed", "The last check could not reach the network. Cached items are marked with their real report date.", "error", false, !input.hasDurableScheduler);
  }

  // 7. A success exists but is old.
  if (lastSuccessMs !== null && lastSuccessAgeMs !== null && lastSuccessAgeMs > staleAfterMs) {
    return base(
      "stale",
      "Connected but stale",
      `The last successful check was ${Math.round(lastSuccessAgeMs / 3_600_000)} h ago. Items are shown with their real report date and are marked stale.`,
      "warn",
      input.hasDurableScheduler,
      !input.hasDurableScheduler,
    );
  }

  // 8. A successful check that found nothing new — this is NOT a failure.
  if (lastSuccessMs !== null && (input.articlesStoredLastCheck ?? 0) === 0) {
    return base("empty-success", "Checked · no new items", "The last check completed successfully and found no new items. This is a normal result, not an error.", "ok", input.hasDurableScheduler, !input.hasDurableScheduler);
  }

  // 9. A successful check with items.
  if (lastSuccessMs !== null) {
    return base(
      "success-with-items",
      "Connected and healthy",
      `The last check succeeded and stored ${input.articlesStoredLastCheck ?? 0} item(s).`,
      "ok",
      input.hasDurableScheduler,
      !input.hasDurableScheduler,
    );
  }

  // No success, no error, not checking: a check has never completed.
  return base("checking", "Not checked yet", "The tracker has not completed a check yet. No items are shown as fresh.", "progress", false, !input.hasDurableScheduler);
}

/**
 * The automation claim the UI is allowed to make. When there is no durable
 * scheduler the app must describe itself as on-device/manual instead.
 */
export function trackerAutomationClaim(state: TrackerState): string {
  if (state.canClaimAutomation) return "Automatic collection is active: a configured service polls, persists, deduplicates and publishes items.";
  return "Checks run on this device while the app is open. There is no always-on background service, so collection is best-effort and does not continue when the app is closed.";
}

/** Counts and freshness text for the status panel, all derived from the same state. */
export function trackerPresentation(input: TrackerStateInput) {
  const state = deriveTrackerState(input);
  return {
    state,
    badgeLabel: state.label,
    tone: state.tone,
    automationClaim: trackerAutomationClaim(state),
    providersLabel: `${input.providersConfigured} provider${input.providersConfigured === 1 ? "" : "s"} configured`,
    storedLabel: `${input.articlesStored} stored`,
    lastCheckedLabel: input.lastSuccessAt ? `Last successful check ${input.lastSuccessAt}` : "No successful check yet",
    // Never invent a freshness value: state it as unavailable when unknown.
    freshnessLabel: state.lastSuccessAgeMs === null ? "not available" : `${Math.round(state.lastSuccessAgeMs / 60_000)} min ago`,
  };
}
