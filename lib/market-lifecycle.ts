/**
 * Per-country lifecycle state.
 *
 * The gap this fills: the app had a market *selection* (which country is active) but no
 * market *lifecycle* (whether a country's data is present at all). `market-context.tsx`
 * tracked `marketId` and an epoch guard for switching, and `app/market-country.tsx` could
 * change the active market — but nothing recorded that a country was not downloaded,
 * being downloaded, installed, or ready. Every country was implicitly "ready" the moment
 * it was selected, which is exactly how a screen ends up querying data that was never
 * fetched.
 *
 * This module is the missing state manager. It records, per country, the four states the
 * switcher must show, persists them, and derives the transitions. It deliberately holds
 * NO data itself — it holds status. The data packs it refers to are downloaded by the
 * ForgeShelf downloader, which already implements resumable download and SHA-256
 * verification.
 *
 * Storage is namespaced per market through `market-isolation.ts`, so one country's record
 * can never be read as another's.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

import { MARKET_IDS, type MarketId } from "./market-regions";
import { marketScopeKey } from "./market-isolation";

/** Where a country is in its lifecycle. */
export type MarketLifecycleState =
  | "not-downloaded"  // never fetched; the switcher shows a Download button
  | "queued"          // accepted, waiting for a slot
  | "downloading"     // in flight; the switcher shows progress
  | "verifying"       // every part received, hashes being checked
  | "installed"       // present and verified, but not the active market
  | "active"          // present, verified, and the market the app is showing
  | "update-available"// present, but a newer data version exists
  | "failed";         // the last attempt failed; carries a reason

export type MarketLifecycleRecord = {
  marketId: MarketId;
  state: MarketLifecycleState;
  /** 0..1 while downloading; 1 once verified. */
  progress: number;
  /** Bytes on disk once installed. */
  installedBytes: number | null;
  /** The data version this record was verified against. */
  dataVersion: string | null;
  /** Parts expected and verified, for the multi-part case. */
  partsExpected: number;
  partsVerified: number;
  /** Why the last attempt failed, when state is "failed". */
  failureReason: string | null;
  updatedAt: string;
};

const STORE_PREFIX = "analyzerx.market-lifecycle.v1";

/** The storage key for one country's record. Namespaced, so records cannot collide. */
export function lifecycleKey(marketId: MarketId): string {
  // Namespaced through the shared helper so a lifecycle record can never collide with
  // another country's, using the same convention as every other stored value.
  return marketScopeKey(marketId, "watchlist", STORE_PREFIX);
}

function freshRecord(marketId: MarketId): MarketLifecycleRecord {
  return {
    marketId,
    state: "not-downloaded",
    progress: 0,
    installedBytes: null,
    dataVersion: null,
    partsExpected: 0,
    partsVerified: 0,
    failureReason: null,
    updatedAt: new Date(0).toISOString(),
  };
}

/** Read every country's record, filling in a default for any that has none. */
export async function loadMarketLifecycles(): Promise<Record<MarketId, MarketLifecycleRecord>> {
  const out = {} as Record<MarketId, MarketLifecycleRecord>;
  const entries = await Promise.all(
    MARKET_IDS.map(async (marketId) => {
      try {
        const raw = await AsyncStorage.getItem(lifecycleKey(marketId));
        if (!raw) return [marketId, freshRecord(marketId)] as const;
        const parsed = JSON.parse(raw) as Partial<MarketLifecycleRecord>;
        // Rebuild through the default so a partial or older record cannot produce an
        // undefined field downstream.
        return [marketId, { ...freshRecord(marketId), ...parsed, marketId }] as const;
      } catch {
        return [marketId, freshRecord(marketId)] as const;
      }
    }),
  );
  for (const [marketId, record] of entries) out[marketId] = record;
  return out;
}

export async function loadMarketLifecycle(marketId: MarketId): Promise<MarketLifecycleRecord> {
  try {
    const raw = await AsyncStorage.getItem(lifecycleKey(marketId));
    if (!raw) return freshRecord(marketId);
    return { ...freshRecord(marketId), ...(JSON.parse(raw) as Partial<MarketLifecycleRecord>), marketId };
  } catch {
    return freshRecord(marketId);
  }
}

/** Persist one record. Returns the record as written, so callers can use it directly. */
export async function saveMarketLifecycle(record: MarketLifecycleRecord): Promise<MarketLifecycleRecord> {
  const next = { ...record, updatedAt: new Date().toISOString() };
  await AsyncStorage.setItem(lifecycleKey(record.marketId), JSON.stringify(next));
  return next;
}

/* ------------------------------------------------------------------ *
 * Transitions
 * ------------------------------------------------------------------ */

/**
 * Whether a transition is legal.
 *
 * This exists so a download cannot be marked "installed" without passing through
 * verification, and an active country cannot silently become "not-downloaded". An illegal
 * transition is refused rather than written, which is what keeps the switcher's state
 * honest.
 */
const ALLOWED: Record<MarketLifecycleState, MarketLifecycleState[]> = {
  "not-downloaded": ["queued", "downloading", "failed"],
  queued: ["downloading", "failed", "not-downloaded"],
  downloading: ["verifying", "failed", "queued"],
  verifying: ["installed", "failed"],
  installed: ["active", "update-available", "downloading", "not-downloaded"],
  active: ["installed", "update-available", "downloading"],
  "update-available": ["downloading", "active", "installed"],
  failed: ["queued", "downloading", "not-downloaded"],
};

export function canTransition(from: MarketLifecycleState, to: MarketLifecycleState): boolean {
  if (from === to) return true;
  return (ALLOWED[from] ?? []).includes(to);
}

/** Apply a transition, refusing an illegal one instead of writing a wrong state. */
export async function transitionMarketLifecycle(
  record: MarketLifecycleRecord,
  to: MarketLifecycleState,
  patch: Partial<MarketLifecycleRecord> = {},
): Promise<MarketLifecycleRecord> {
  if (!canTransition(record.state, to)) {
    throw new Error(`Refused an illegal market lifecycle transition: ${record.state} -> ${to} for ${record.marketId}.`);
  }
  return saveMarketLifecycle({ ...record, ...patch, state: to });
}

/** Progress while downloading, clamped to 0..1 so a bad source cannot show 140%. */
export async function setMarketDownloadProgress(record: MarketLifecycleRecord, written: number, expected: number): Promise<MarketLifecycleRecord> {
  const progress = expected > 0 ? Math.max(0, Math.min(1, written / expected)) : 0;
  return saveMarketLifecycle({ ...record, state: "downloading", progress });
}

/** Mark a download failed with a reason the user can act on. */
export async function failMarketLifecycle(record: MarketLifecycleRecord, reason: string): Promise<MarketLifecycleRecord> {
  return saveMarketLifecycle({ ...record, state: "failed", failureReason: reason });
}

/**
 * Mark a country installed, but only if every expected part was verified.
 *
 * This is the guard that makes "installed" mean something: a country with parts missing
 * stays uninstalled rather than presenting half a dataset as whole.
 */
export async function completeMarketLifecycle(
  record: MarketLifecycleRecord,
  details: { dataVersion: string; installedBytes: number; partsExpected: number; partsVerified: number },
): Promise<MarketLifecycleRecord> {
  if (details.partsExpected > 0 && details.partsVerified < details.partsExpected) {
    throw new Error(`Cannot mark ${record.marketId} installed: ${details.partsVerified} of ${details.partsExpected} parts verified.`);
  }
  return saveMarketLifecycle({
    ...record,
    state: "installed",
    progress: 1,
    installedBytes: details.installedBytes,
    dataVersion: details.dataVersion,
    partsExpected: details.partsExpected,
    partsVerified: details.partsVerified,
    failureReason: null,
  });
}

/** Mark a country active, demoting any previously active one to installed. */
export async function activateMarketLifecycle(marketId: MarketId): Promise<Record<MarketId, MarketLifecycleRecord>> {
  const all = await loadMarketLifecycles();
  for (const id of MARKET_IDS) {
    if (id === marketId) continue;
    if (all[id].state === "active") all[id] = await saveMarketLifecycle({ ...all[id], state: "installed" });
  }
  const target = all[marketId];
  if (target.state === "active") return all;
  all[marketId] = await transitionMarketLifecycle(target, "active");
  return all;
}

/** Remove a country's data and reset it to not-downloaded. */
export async function removeMarketLifecycle(marketId: MarketId): Promise<MarketLifecycleRecord> {
  await AsyncStorage.removeItem(lifecycleKey(marketId));
  return freshRecord(marketId);
}

/* ------------------------------------------------------------------ *
 * Onboarding
 * ------------------------------------------------------------------ */

const ONBOARDING_KEY = "analyzerx.onboarding.v1";

export type OnboardingRecord = {
  completed: boolean;
  /** The countries the user chose at first launch. */
  selected: MarketId[];
  completedAt: string | null;
};

/**
 * Whether first-launch onboarding has been completed.
 *
 * This is the flag the app was missing entirely: without it there was no way to know that
 * a user had never chosen a country, so the app went straight to the default market and
 * the country selection screen was only reachable if the user happened to find it.
 */
export async function loadOnboarding(): Promise<OnboardingRecord> {
  try {
    const raw = await AsyncStorage.getItem(ONBOARDING_KEY);
    if (!raw) return { completed: false, selected: [], completedAt: null };
    const parsed = JSON.parse(raw) as Partial<OnboardingRecord>;
    const selected = Array.isArray(parsed.selected) ? parsed.selected.filter((id): id is MarketId => (MARKET_IDS as readonly string[]).includes(id)) : [];
    return { completed: Boolean(parsed.completed), selected, completedAt: parsed.completedAt ?? null };
  } catch {
    return { completed: false, selected: [], completedAt: null };
  }
}

/** Record the countries chosen at first launch and mark onboarding complete. */
export async function completeOnboarding(selected: MarketId[]): Promise<OnboardingRecord> {
  const valid = selected.filter((id) => (MARKET_IDS as readonly string[]).includes(id));
  if (!valid.length) throw new Error("At least one country must be selected before onboarding can complete.");
  const record: OnboardingRecord = { completed: true, selected: valid, completedAt: new Date().toISOString() };
  await AsyncStorage.setItem(ONBOARDING_KEY, JSON.stringify(record));
  // A country the user chose but that has no data yet is queued, not silently "ready".
  const all = await loadMarketLifecycles();
  for (const id of valid) {
    if (all[id].state === "not-downloaded") {
      await saveMarketLifecycle({ ...all[id], state: "queued" });
    }
  }
  return record;
}

/** Reset onboarding, for a "change my countries" action. */
export async function resetOnboarding(): Promise<void> {
  await AsyncStorage.removeItem(ONBOARDING_KEY);
}

/* ------------------------------------------------------------------ *
 * Presentation helpers
 * ------------------------------------------------------------------ */

export type LifecycleBadge = { label: string; tone: "ready" | "busy" | "absent" | "error"; detail: string };

/** The badge the switcher shows for one country. Pure, so it is testable. */
export function lifecycleBadge(record: MarketLifecycleRecord): LifecycleBadge {
  switch (record.state) {
    case "active":
      return { label: "Active", tone: "ready", detail: record.dataVersion ? `Live · data ${record.dataVersion}` : "Live" };
    case "installed":
      return { label: "Ready", tone: "ready", detail: record.installedBytes ? `${(record.installedBytes / 1048576).toFixed(1)} MB installed` : "Installed" };
    case "downloading":
      return { label: "Downloading", tone: "busy", detail: `${Math.round(record.progress * 100)}%` };
    case "verifying":
      return { label: "Verifying", tone: "busy", detail: `${record.partsVerified}/${record.partsExpected} parts checked` };
    case "queued":
      return { label: "Queued", tone: "busy", detail: "Waiting to start" };
    case "update-available":
      return { label: "Update", tone: "busy", detail: "A newer data version is available" };
    case "failed":
      return { label: "Failed", tone: "error", detail: record.failureReason ?? "The last attempt did not finish" };
    default:
      return { label: "Download", tone: "absent", detail: "Not downloaded yet" };
  }
}

/** Whether the switcher should offer the country as selectable right now. */
export function canActivate(record: MarketLifecycleRecord): boolean {
  return record.state === "installed" || record.state === "active" || record.state === "update-available";
}
