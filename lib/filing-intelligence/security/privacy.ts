/**
 * Privacy and data flows (Prompt 6, section 4).
 *
 * The map below states, for each piece of data, whether it stays on the device,
 * whether it is sent to a source, and whether any optional backend would see it.
 * It is written from what the code actually does, not from an intention.
 */

export type DataDestination = "device_only" | "sent_to_source" | "backend_only_if_enabled" | "never_collected";

export type DataFlow = {
  id: string;
  data: string;
  destination: DataDestination;
  detail: string;
  /** Whether the user can remove it. */
  userControllable: boolean;
};

export const DATA_FLOWS: DataFlow[] = [
  {
    id: "preferences",
    data: "App preferences and appearance",
    destination: "device_only",
    detail: "Held in the device's own key-value storage. Never sent anywhere.",
    userControllable: true,
  },
  {
    id: "selected_market",
    data: "The market you selected",
    destination: "device_only",
    detail: "Held on the device and used to scope every query, so one market's data is never mixed with another's.",
    userControllable: true,
  },
  {
    id: "watchlist",
    data: "Watchlists and tracked symbols",
    destination: "device_only",
    detail: "Held on the device. Not uploaded, and not required for any feature to work.",
    userControllable: true,
  },
  {
    id: "cached_filings",
    data: "Cached filing text, tables and metadata",
    destination: "device_only",
    detail: "Public disclosure retrieved from an official source and held on the device. Not re-uploaded.",
    userControllable: true,
  },
  {
    id: "source_requests",
    data: "The request sent to a source",
    destination: "sent_to_source",
    detail: "A request to an official source carries the app's User-Agent and the symbol or query. No personal data is added, and no identity is rotated to get around a limit.",
    userControllable: false,
  },
  {
    id: "translation",
    data: "Report text sent for translation",
    destination: "backend_only_if_enabled",
    detail: "No offline model is bundled, so a translation the user requests is sent to an external service. It is sent only on an explicit request, and the response is validated before it is shown.",
    userControllable: true,
  },
  {
    id: "local_ai",
    data: "Text sent to a local model",
    destination: "device_only",
    detail: "A locally installed model runs on the device. Its input and output do not leave it.",
    userControllable: true,
  },
  {
    id: "crash_reports",
    data: "Crash reports",
    destination: "never_collected",
    detail: "No crash-reporting SDK is bundled, so no crash payload is collected or sent.",
    userControllable: false,
  },
  {
    id: "telemetry",
    data: "Usage telemetry",
    destination: "never_collected",
    detail: "No analytics or telemetry SDK is bundled. Nothing about your usage is collected.",
    userControllable: false,
  },
];

export function flowsTo(destination: DataDestination): DataFlow[] {
  return DATA_FLOWS.filter((flow) => flow.destination === destination);
}

/** A plain-language summary of what leaves the device. */
export function privacyStatement(): string {
  const leaving = flowsTo("sent_to_source").length + flowsTo("backend_only_if_enabled").length;
  return [
    "Everything the app stores stays on your device unless a feature needs otherwise.",
    `Of ${DATA_FLOWS.length} kinds of data, ${leaving} can leave the device: a request to an official source, and report text you explicitly ask to translate.`,
    "No analytics, no telemetry and no crash reporting is bundled, so your usage is not collected.",
    "Your watchlists and your selected market are never uploaded.",
  ].join(" ");
}

/* ------------------------------------------------------------------ *
 * Offline behaviour
 * ------------------------------------------------------------------ */

export type DataFreshness = "current" | "cached" | "stale" | "unknown";

export type OfflineState = {
  online: boolean;
  freshness: DataFreshness;
  /** Whether core analysis still works from what is held locally. */
  coreAnalysisAvailable: boolean;
  label: string;
  note: string;
};

/**
 * Describe the offline state honestly.
 *
 * The distinction that matters is between a result that was just fetched and
 * one that came from the cache, so the two are never presented as the same
 * thing.
 */
export function describeOfflineState(input: {
  online: boolean;
  hasCachedData: boolean;
  lastVerifiedCheckUtc: string | null;
  now?: Date;
  staleAfterHours?: number;
}): OfflineState {
  const now = input.now ?? new Date();
  const staleAfter = input.staleAfterHours ?? 48;

  let freshness: DataFreshness = "unknown";
  if (input.lastVerifiedCheckUtc) {
    const checked = new Date(input.lastVerifiedCheckUtc);
    if (!Number.isNaN(checked.getTime())) {
      const hours = (now.getTime() - checked.getTime()) / 3_600_000;
      freshness = hours > staleAfter ? "stale" : input.online ? "current" : "cached";
    } else if (input.hasCachedData) {
      // The check time could not be read, but data is held. That is cached
      // data whose freshness is unknown, not an unknown state with no data.
      freshness = "cached";
    }
  } else if (input.hasCachedData) {
    freshness = "cached";
  }

  if (!input.online) {
    return {
      online: false,
      freshness,
      // Core analysis keeps working on what is already held.
      coreAnalysisAvailable: input.hasCachedData,
      label: input.hasCachedData ? "Offline, showing cached data" : "Offline, no cached data",
      note: input.hasCachedData
        ? "The app is offline. Results come from what was previously retrieved, and their freshness is shown rather than presented as current."
        : "The app is offline and holds nothing for this market yet. Nothing is fabricated to fill the gap.",
    };
  }

  if (freshness === "stale") {
    return { online: true, freshness, coreAnalysisAvailable: true, label: "Online, but the data is stale", note: "The last successful check is beyond the freshness window. A refresh is the way to update it." };
  }
  return {
    online: true,
    freshness,
    coreAnalysisAvailable: true,
    label: freshness === "current" ? "Online, data current" : "Online, showing cached data",
    note: freshness === "current" ? "The data was checked recently." : "The data comes from the cache rather than a fresh check.",
  };
}
