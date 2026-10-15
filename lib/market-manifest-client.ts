/**
 * Manifest client: fetch, verify, cache, and diff against local installs.
 *
 * Responsibilities, in order:
 *
 *   1. Fetch the signed manifest over HTTPS with a hard timeout.
 *   2. Verify the Ed25519 signature against a pinned key BEFORE reading any entry.
 *   3. Cache the verified payload so a later offline launch still has metadata.
 *   4. Diff the remote versions against local installs and report what each country needs.
 *
 * Failure policy:
 *
 *   - A network failure is NOT a fatal error. The last verified manifest is served from
 *     cache so the app can still say what is installed and what is out of date.
 *   - A signature failure IS fatal for that response. A tampered or unsigned manifest is
 *     discarded, and the cached copy is used instead — never the unverified one.
 *   - A cached copy is only ever written after verification, so the cache cannot be
 *     poisoned by a bad response.
 *
 * There is no fallback to a plain-HTTP endpoint and no "accept on first use" mode. If the
 * manifest cannot be verified, the app reports that honestly rather than downloading
 * something it cannot trust.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  verifyManifest, diffMarketPack, packSizeBytes,
  type ManifestPayload, type ManifestMarketEntry, type PackStatus,
} from "./market-manifest";
import { marketScopeKey } from "./market-isolation";

/** Where the last verified manifest is cached. Global, not per-market: it covers all. */
const CACHE_KEY = "analyzerx.manifest.cache.v1";

/** The production manifest location. HTTPS only; the verifier rejects anything else. */
// The live signed manifest. Hosted as a Release asset so it is served over HTTPS with no
// server to run, and so a new manifest can be published without shipping an app build.
export const DEFAULT_MANIFEST_URL = "https://github.com/saayad566-tech/analyzerx/releases/download/packs-IN-1.0.0/market-manifest.json";

const DEFAULT_TIMEOUT_MS = 5_000;
/** A cached manifest is served when offline, but never presented as freshly checked. */
const CACHE_FRESH_MS = 6 * 60 * 60 * 1000;

export type CachedManifest = {
  payload: ManifestPayload;
  keyId: string;
  /** When this copy was fetched and verified. */
  fetchedAt: string;
};

export type ManifestFetchSource = "network" | "cache" | "none";

export type ManifestFetchResult = {
  /** The verified payload, or null when there is neither a live nor a cached copy. */
  payload: ManifestPayload | null;
  source: ManifestFetchSource;
  /** True when the served copy came from cache because the network failed. */
  stale: boolean;
  fetchedAt: string | null;
  /** Why a network attempt did not produce a live manifest. Null on success. */
  error: string | null;
};

/* ------------------------------------------------------------------ *
 * Cache
 * ------------------------------------------------------------------ */

export async function readCachedManifest(): Promise<CachedManifest | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedManifest>;
    if (!parsed.payload || typeof parsed.payload !== "object") return null;
    return { payload: parsed.payload as ManifestPayload, keyId: parsed.keyId ?? "unknown", fetchedAt: parsed.fetchedAt ?? new Date(0).toISOString() };
  } catch {
    // A corrupt cache is treated as absent rather than crashing the launch path.
    return null;
  }
}

/**
 * Write a verified payload to the cache.
 *
 * Only called after `verifyManifest` has accepted the payload, so the cache can only ever
 * contain something that passed signature verification.
 */
export async function writeCachedManifest(payload: ManifestPayload, keyId: string): Promise<CachedManifest> {
  const record: CachedManifest = { payload, keyId, fetchedAt: new Date().toISOString() };
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(record));
  return record;
}

export async function clearCachedManifest(): Promise<void> {
  await AsyncStorage.removeItem(CACHE_KEY);
}

/** Whether a cached copy is recent enough to present as current rather than stale. */
export function isCacheFresh(cached: CachedManifest, now: Date = new Date()): boolean {
  const fetched = Date.parse(cached.fetchedAt);
  if (Number.isNaN(fetched)) return false;
  return now.getTime() - fetched < CACHE_FRESH_MS;
}

/* ------------------------------------------------------------------ *
 * Fetch
 * ------------------------------------------------------------------ */

/**
 * Fetch with a hard timeout.
 *
 * `AbortController` is used rather than racing a timer, so the underlying request is
 * actually cancelled and a slow response cannot arrive later and be mistaken for a fresh
 * one. The timeout matters here because this runs on the launch path: a hung request would
 * otherwise hold the country list in a loading state indefinitely.
 */
async function fetchWithTimeout(url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json", "cache-control": "no-cache" },
    });
    if (!response.ok) throw new Error(`Manifest endpoint returned HTTP ${response.status}.`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch, verify and cache the manifest.
 *
 * On any failure the cached copy is served with `stale: true` and the reason attached, so
 * the UI can say "showing last known data" instead of either crashing or pretending the
 * network call succeeded.
 */
export async function fetchManifest(options: {
  url?: string;
  timeoutMs?: number;
  now?: Date;
  /** Injectable for tests: replaces the network call. */
  fetcher?: (url: string, timeoutMs: number) => Promise<unknown>;
  /**
   * Override the pinned key set. The application always uses the default production keys;
   * this exists so a test can verify against its own key without a test key ever being
   * compiled into a shipped build.
   */
  pinnedKeys?: Readonly<Record<string, string>>;
} = {}): Promise<ManifestFetchResult> {
  const url = options.url ?? DEFAULT_MANIFEST_URL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = options.now ?? new Date();
  const fetcher = options.fetcher ?? fetchWithTimeout;

  // A non-HTTPS manifest URL is refused before a request is even made.
  if (!/^https:\/\//i.test(url)) {
    const cached = await readCachedManifest();
    return {
      payload: cached?.payload ?? null,
      source: cached ? "cache" : "none",
      stale: Boolean(cached),
      fetchedAt: cached?.fetchedAt ?? null,
      error: "The manifest URL is not HTTPS; refusing to fetch over an insecure transport.",
    };
  }

  try {
    const raw = await fetcher(url, timeoutMs);
    const verdict = verifyManifest(raw, { now, pinnedKeys: options.pinnedKeys });
    if (!verdict.ok) {
      // A bad signature is not recoverable by retrying: serve the cache and say why.
      const cached = await readCachedManifest();
      return {
        payload: cached?.payload ?? null,
        source: cached ? "cache" : "none",
        stale: Boolean(cached),
        fetchedAt: cached?.fetchedAt ?? null,
        error: verdict.reason,
      };
    }
    await writeCachedManifest(verdict.payload, verdict.keyId);
    return { payload: verdict.payload, source: "network", stale: false, fetchedAt: now.toISOString(), error: null };
  } catch (error) {
    // Offline, DNS failure, timeout, malformed JSON. Serve the cache; never retry in a loop.
    const cached = await readCachedManifest();
    const reason = error instanceof Error
      ? (error.name === "AbortError" ? `Manifest request timed out after ${timeoutMs} ms.` : error.message)
      : "The manifest could not be fetched.";
    return {
      payload: cached?.payload ?? null,
      source: cached ? "cache" : "none",
      stale: Boolean(cached),
      fetchedAt: cached?.fetchedAt ?? null,
      error: reason,
    };
  }
}

/* ------------------------------------------------------------------ *
 * Diffing against local installs
 * ------------------------------------------------------------------ */

export type MarketPackPlan = {
  marketId: string;
  entry: ManifestMarketEntry;
  status: PackStatus;
  sizeBytes: number;
  /** The lifecycle state this plan implies. */
  nextLifecycleState: "queued" | "update-available" | "not-downloaded" | "installed";
  /** A sentence for the switcher, already honest about what will happen. */
  detail: string;
};

/**
 * Work out what each country needs.
 *
 * The mapping from a pack status to a lifecycle state is the bridge the mandate asks for:
 * a country with no local pack becomes `queued` (ready to download), a newer remote version
 * becomes `update-available`, and a pack requiring a newer app is reported rather than
 * downloaded.
 */
export function planMarketPacks(
  payload: ManifestPayload,
  local: Record<string, { version: string | null }>,
  appVersion: string,
): MarketPackPlan[] {
  return Object.entries(payload.markets)
    .map(([marketId, entry]) => {
      const status = diffMarketPack(entry, local[marketId] ?? { version: null }, appVersion);
      const sizeBytes = packSizeBytes(entry);
      switch (status.kind) {
        case "absent":
          return { marketId, entry, status, sizeBytes, nextLifecycleState: "queued" as const, detail: `Ready to download ${formatBytes(sizeBytes)}.` };
        case "update-available":
          return { marketId, entry, status, sizeBytes, nextLifecycleState: "update-available" as const, detail: `Update available: ${status.from} to ${status.to} (${formatBytes(sizeBytes)}).` };
        case "current":
          return { marketId, entry, status, sizeBytes, nextLifecycleState: "installed" as const, detail: `Up to date at ${status.version}.` };
        case "local-ahead":
          return { marketId, entry, status, sizeBytes, nextLifecycleState: "installed" as const, detail: `Installed ${status.from} is newer than the published ${status.to}; nothing to do.` };
        case "requires-app-update":
          return { marketId, entry, status, sizeBytes, nextLifecycleState: "not-downloaded" as const, detail: `Needs app ${status.required} or newer; this build is ${status.current}.` };
        default:
          return { marketId, entry, status, sizeBytes, nextLifecycleState: "not-downloaded" as const, detail: `Versions could not be compared: ${status.reason}` };
      }
    })
    .sort((a, b) => a.marketId.localeCompare(b.marketId));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

/**
 * Per-country cache key for a downloaded pack, so two countries' files cannot collide.
 * Exported so the downloader and the verifier agree on exactly one naming scheme.
 */
export function packCacheKey(marketId: string, part: number | null): string {
  return marketScopeKey(marketId, "fundamentals", "pack", part === null ? "single" : `part${part}`);
}
