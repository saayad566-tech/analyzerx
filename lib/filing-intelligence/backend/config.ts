/**
 * Optional-backend client boundary (Prompt 7, sections 1 and 7).
 *
 * This is the module that makes the acceptance criterion true: the Android app
 * must build and work fully with no backend configured. Everything here
 * defaults to "no backend", and every feature that could need one declares what
 * it does without it.
 *
 * No secret is ever read from, or written to, this module. A backend URL is
 * user-supplied configuration; a privileged key never belongs in the client.
 */

export type BackendState =
  | "not_configured" // the default: device-only
  | "configured" // a URL is set and the user opted in
  | "configured_unreachable" // a URL is set but the last check failed
  | "misconfigured"; // a URL is set but it is not a usable https endpoint

export type BackendConfig = {
  state: BackendState;
  /** The base URL, when one is configured. Never a secret. */
  baseUrl: string | null;
  /** Why the state is what it is, in plain language. */
  reason: string;
  /** True when a feature may attempt a backend call. */
  usable: boolean;
};

export type BackendSettings = {
  /** The user opted in to using a backend. */
  enabled: boolean;
  baseUrl: string | null;
  /** The last health check, when one has run. */
  lastCheckOk: boolean | null;
};

export const DEFAULT_BACKEND_SETTINGS: BackendSettings = {
  enabled: false, // opt-in, so the default is device-only
  baseUrl: null,
  lastCheckOk: null,
};

/**
 * Resolve the backend state.
 *
 * The default is `not_configured`, which is a fully working state rather than a
 * degraded one: every analysis feature runs on the device.
 */
export function resolveBackendConfig(settings: BackendSettings = DEFAULT_BACKEND_SETTINGS): BackendConfig {
  if (!settings.enabled) {
    return {
      state: "not_configured",
      baseUrl: null,
      reason: "No backend is configured. The app runs entirely on the device, which is the default and a fully working state.",
      usable: false,
    };
  }
  if (!settings.baseUrl || !settings.baseUrl.trim()) {
    return { state: "misconfigured", baseUrl: null, reason: "A backend was enabled but no address was supplied.", usable: false };
  }
  const url = settings.baseUrl.trim();
  if (!url.startsWith("https://")) {
    // A plain-http backend would send whatever it carries in the clear.
    return { state: "misconfigured", baseUrl: url, reason: "A backend address must use https. A plain-http address is refused rather than used in the clear.", usable: false };
  }
  if (settings.lastCheckOk === false) {
    return { state: "configured_unreachable", baseUrl: url, reason: "A backend is configured but the last check failed. Device-only behaviour is used until it responds.", usable: false };
  }
  return { state: "configured", baseUrl: url, reason: "A backend is configured and reachable. Device-only behaviour remains available.", usable: true };
}

/** The features that work with no backend at all, and those that do not. */
export type FeatureAvailability = {
  feature: string;
  withoutBackend: "works" | "works_differently" | "unavailable";
  note: string;
};

export const FEATURE_AVAILABILITY: FeatureAvailability[] = [
  { feature: "Filing discovery", withoutBackend: "works", note: "Reads permitted sources directly from the device." },
  { feature: "Document retrieval and parsing", withoutBackend: "works", note: "Fetches and parses on the device." },
  { feature: "Financial calculations", withoutBackend: "works", note: "Deterministic and local." },
  { feature: "Evidence validation and the report", withoutBackend: "works", note: "The validators and the publication gate run locally." },
  { feature: "Multi-language reports", withoutBackend: "works", note: "Language formatting is local; a translation uses an external service only when requested." },
  { feature: "Local AI assistant", withoutBackend: "works", note: "Runs a locally installed model." },
  { feature: "Watchlists and alerts", withoutBackend: "works_differently", note: "Alerts are evaluated when the app is open rather than pushed." },
  { feature: "Detection while the app is closed", withoutBackend: "unavailable", note: "Needs a scheduler. This is the one capability a backend genuinely adds." },
  { feature: "Shared filing metadata across devices", withoutBackend: "unavailable", note: "Each device holds its own cache." },
  { feature: "Accounts and sign-in", withoutBackend: "unavailable", note: "Not required for any local feature." },
];

export function featuresWithoutBackend(): FeatureAvailability[] {
  return FEATURE_AVAILABILITY.filter((entry) => entry.withoutBackend !== "unavailable");
}

export function unavailableWithoutBackend(): FeatureAvailability[] {
  return FEATURE_AVAILABILITY.filter((entry) => entry.withoutBackend === "unavailable");
}

/**
 * Whether a feature may run in the current state.
 *
 * A feature that works on the device always runs; one that needs a backend runs
 * only when the backend is usable, and otherwise reports why not rather than
 * failing silently.
 */
export function canRunFeature(feature: string, config: BackendConfig): { can: boolean; reason: string } {
  const entry = FEATURE_AVAILABILITY.find((item) => item.feature === feature);
  if (!entry) return { can: false, reason: `"${feature}" is not a known feature.` };
  if (entry.withoutBackend !== "unavailable") return { can: true, reason: entry.note };
  if (config.usable) return { can: true, reason: `${entry.note} A backend is configured, so it is available.` };
  return { can: false, reason: `${entry.note} ${config.reason}` };
}

/** The statement shown wherever the backend state matters. */
export function backendStatement(config: BackendConfig = resolveBackendConfig()): string {
  const local = featuresWithoutBackend().length;
  const remote = unavailableWithoutBackend().length;
  return [
    `${local} of ${local + remote} features work with no backend at all.`,
    config.state === "not_configured"
      ? "No backend is configured, and nothing is missing for local analysis."
      : config.reason,
    "The only capability a backend adds is detection while the app is closed.",
  ].join(" ");
}

/**
 * Guard against a client ever holding a privileged key.
 *
 * A service-role key, a database password or a private token must never be in
 * the client. This check exists so a future change cannot add one quietly.
 */
const PRIVILEGED_KEY_PATTERN = /(service[_-]?role|database[_-]?url|db[_-]?password|private[_-]?key|supabase[_-]?service|admin[_-]?secret)/i;

export function assertNoPrivilegedKeyInClient(config: Record<string, unknown>): { clean: boolean; offenders: string[] } {
  const offenders: string[] = [];
  for (const key of Object.keys(config)) {
    if (PRIVILEGED_KEY_PATTERN.test(key)) offenders.push(key);
  }
  return { clean: offenders.length === 0, offenders };
}
