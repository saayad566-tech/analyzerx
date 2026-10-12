/**
 * Execution modes (Prompt 5, section 1).
 *
 * Mode A is Android-only and is what this build actually does. Mode B is an
 * optional scheduled service that is NOT implemented, and this module says so
 * rather than implying automatic monitoring exists.
 *
 * The honest position on background execution: Android does not guarantee exact
 * scheduled execution, and this build does not bundle a background-task module
 * at all. So the strongest supported fallback is a check on app open, a manual
 * refresh, and an optional foreground interval that stops when the app closes.
 * Nothing here promises a run while the app is closed.
 */

export type ExecutionMode = "A_android_only" | "B_scheduled_service";

export type ModeCapability = {
  id: string;
  label: string;
  available: boolean;
  /** What actually provides it. */
  provider: string;
  /** What it can and cannot do. */
  limitation: string;
};

/**
 * What this build can genuinely do. Every entry states its limitation, so the
 * UI cannot imply a guarantee that does not exist.
 */
export const MODE_A_CAPABILITIES: ModeCapability[] = [
  {
    id: "on_open",
    label: "Check on app open",
    available: true,
    provider: "The app's own launch path",
    limitation: "Runs only when the user opens the app.",
  },
  {
    id: "manual_refresh",
    label: "Manual refresh",
    available: true,
    provider: "The Refresh filings action",
    limitation: "Runs only when the user asks for it, which is also the permitted path for sources whose terms restrict automated collection.",
  },
  {
    id: "foreground_interval",
    label: "Foreground interval while the app is open",
    available: true,
    provider: "An in-process timer",
    limitation: "Stops the moment the app is backgrounded or closed; it does not survive process termination.",
  },
  {
    id: "background_task",
    label: "Background execution while the app is closed",
    available: false,
    provider: "Not bundled in this build",
    limitation: "No background-task module is bundled, so no run happens while the app is closed. Android could not guarantee exact timing even if one were.",
  },
  {
    id: "push_wake",
    label: "Server push to wake the app",
    available: false,
    provider: "Not implemented",
    limitation: "Would require a backend and a push service. Not present, and not required for the app to work.",
  },
];

export type ModeDefinition = {
  mode: ExecutionMode;
  label: string;
  implemented: boolean;
  summary: string;
  /** What the mode needs to run. */
  requirements: string[];
  /** What it cannot promise. */
  limitations: string[];
  /** Whether the app remains fully usable without it. */
  appUsableWithout: boolean;
};

export const MODE_A: ModeDefinition = {
  mode: "A_android_only",
  label: "Mode A · Android-only",
  implemented: true,
  summary:
    "The app checks permitted sources when it is opened and when the user refreshes, caches what it processes, and reports the freshness of every source honestly.",
  requirements: ["The app itself", "A network connection at the moment of the check"],
  limitations: [
    "Android does not guarantee exact scheduled execution, so no fixed time is promised.",
    "A check does not run while the app is closed.",
    "Sources whose terms prohibit automated collection are read only on a user-initiated refresh.",
  ],
  appUsableWithout: true,
};

export const MODE_B: ModeDefinition = {
  mode: "B_scheduled_service",
  label: "Mode B · Optional scheduled service",
  implemented: false,
  summary:
    "A scheduled service would fetch new filings even when the app is closed. It is NOT implemented in this build, and the app does not depend on it.",
  requirements: [
    "A free-tier scheduler or serverless host that genuinely permits the workload",
    "Verified quotas, inactivity rules, sleep behaviour, execution limits and storage",
    "A documented path that does not require a credit card",
  ],
  limitations: [
    "Not implemented, so no automatic monitoring exists today.",
    "Free tiers sleep, throttle and expire, so a free-tier provider must never be an undocumented single point of failure.",
    "It would hold no secrets in the client and would need its own deployment and recovery runbook.",
  ],
  appUsableWithout: true,
};

export const MODES: ModeDefinition[] = [MODE_A, MODE_B];

/** A plain statement of what monitoring this build provides, for the UI. */
export function monitoringStatement(): string {
  return [
    "Monitoring runs in Mode A only: the app checks permitted sources when it is opened and when you refresh.",
    "No check runs while the app is closed, because no background-task module is bundled and Android could not guarantee exact timing in any case.",
    "Mode B, a scheduled service, is not implemented. The app is fully usable without it.",
  ].join(" ");
}

/** The capability a requested behaviour maps to, so a caller can check it. */
export function capabilityFor(behaviour: "on_open" | "manual_refresh" | "foreground_interval" | "background_task" | "push_wake"): ModeCapability {
  const capability = MODE_A_CAPABILITIES.find((entry) => entry.id === behaviour);
  if (!capability) throw new Error(`No capability is defined for "${behaviour}".`);
  return capability;
}

/**
 * Whether a behaviour can be relied on. Callers use this instead of assuming,
 * so a screen cannot offer something the build cannot do.
 */
export function canReliablyRun(behaviour: "on_open" | "manual_refresh" | "foreground_interval" | "background_task" | "push_wake"): { can: boolean; reason: string } {
  const capability = capabilityFor(behaviour);
  return { can: capability.available, reason: capability.limitation };
}
