/**
 * Signed manifest: verification, diffing, and client failure behaviour.
 *
 * The four properties the mandate requires, plus the structural rules that stop a
 * malformed entry reaching the downloader:
 *   - a valid signature is accepted
 *   - a tampered payload is rejected
 *   - a newer remote version produces update-available
 *   - a timeout or offline launch falls back safely to cache
 *
 * Signatures are produced by the test-only signer in tests/helpers, which is validated
 * against the RFC 8032 vectors, so these exercise the real verification path.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: new Map<string, string>() }));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => store.get(key) ?? null,
    setItem: async (key: string, value: string) => { store.set(key, value); },
    removeItem: async (key: string) => { store.delete(key); },
  },
}));

import {
  canonicalize, canonicalBytes, verifyManifest, validateMarketEntry,
  parseVersion, compareVersions, diffMarketPack, packSizeBytes, packFiles,
  PINNED_MANIFEST_KEYS, type ManifestPayload,
} from "../lib/market-manifest";
import {
  fetchManifest, readCachedManifest, writeCachedManifest, clearCachedManifest,
  isCacheFresh, planMarketPacks, formatBytes, packCacheKey, DEFAULT_MANIFEST_URL,
} from "../lib/market-manifest-client";
import { publicKeyFromSeed, signEd25519, signPayload } from "./helpers/manifest-signer";
import { hexToBytes } from "../lib/ed25519";

/**
 * The RFC 8032 TEST 1 seed, used to sign in this suite.
 *
 * The application pins the PRODUCTION key, which is the correct thing to ship — a test key
 * must never be compiled into a build. So this suite injects its own key through the
 * `pinnedKeys` option, which exists for exactly this purpose, and asserts separately that
 * the production key is pinned and is NOT the test key.
 */
const SEED = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";
const KEY_ID = "analyzerx-manifest-test-1";
/** Every verification in this file runs against this key set. */
const TEST_KEYS = { [KEY_ID]: publicKeyFromSeed(SEED) } as const;

const NOW = new Date("2026-10-15T00:00:00Z");

function payload(overrides: Partial<ManifestPayload> = {}): ManifestPayload {
  return {
    manifestVersion: 1,
    generatedAt: "2026-10-14T00:00:00Z",
    expiresAt: "2026-11-14T00:00:00Z",
    markets: {
      IN: {
        version: "1.0.4",
        minAppVersion: "3.0.0",
        url: "https://example.test/packs/india-1.0.4.bin.gz",
        sizeBytes: 12_345_678,
        sha256: "a".repeat(64),
      },
    },
    ...overrides,
  };
}

/** Produce a properly signed manifest over the canonical payload bytes. */
function signed(p: ManifestPayload, seed = SEED, keyId = KEY_ID) {
  const message = canonicalBytes(p);
  return { payload: p, signature: { algorithm: "Ed25519" as const, keyId, signature: signEd25519(seed, message) } };
}

beforeEach(() => { store.clear(); });

describe("the pinned key is the production key, not the test key", () => {
  it("pins a production key id", () => {
    expect(Object.keys(PINNED_MANIFEST_KEYS)).toContain("analyzerx-manifest-2026");
  });

  it("pins a 32-byte hex public key", () => {
    const value = PINNED_MANIFEST_KEYS["analyzerx-manifest-2026"];
    expect(typeof value).toBe("string");
    expect(value).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does NOT pin the test key, so a test key can never ship", () => {
    expect(PINNED_MANIFEST_KEYS[KEY_ID]).toBeUndefined();
    expect(Object.values(PINNED_MANIFEST_KEYS)).not.toContain(publicKeyFromSeed(SEED));
  });

  it("refuses a manifest signed by the test key in production", () => {
    const verdict = verifyManifest(signed(payload()), { now: NOW });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toMatch(/unknown signing key/i);
  });
});

describe("canonical serialization", () => {
  it("sorts keys so key order cannot change the signed bytes", () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
  });

  it("preserves array order, because part order is meaningful", () => {
    expect(canonicalize([1, 2, 3])).not.toBe(canonicalize([3, 2, 1]));
  });

  it("drops undefined members rather than emitting invalid JSON", () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it("refuses a non-finite number instead of writing null", () => {
    expect(() => canonicalize({ a: Number.NaN })).toThrow(/non-finite/i);
  });

  it("is stable across nested structures", () => {
    const one = { z: { y: 1, x: 2 }, a: [{ c: 1, b: 2 }] };
    const two = { a: [{ b: 2, c: 1 }], z: { x: 2, y: 1 } };
    expect(canonicalize(one)).toBe(canonicalize(two));
  });
});

describe("signature verification", () => {
  it("accepts a correctly signed manifest", () => {
    const verdict = verifyManifest(signed(payload()), { now: NOW, pinnedKeys: TEST_KEYS });
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.keyId).toBe(KEY_ID);
  });

  it("rejects a tampered payload", () => {
    const manifest = signed(payload());
    // Change one byte of the payload after signing.
    (manifest.payload.markets.IN as { version: string }).version = "9.9.9";
    const verdict = verifyManifest(manifest, { now: NOW, pinnedKeys: TEST_KEYS });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toMatch(/signature/i);
  });

  it("rejects a tampered size without the signature being updated", () => {
    const manifest = signed(payload());
    (manifest.payload.markets.IN as { sizeBytes: number }).sizeBytes = 1;
    expect(verifyManifest(manifest, { now: NOW, pinnedKeys: TEST_KEYS }).ok).toBe(false);
  });

  it("rejects an unsigned manifest", () => {
    const verdict = verifyManifest({ payload: payload() }, { now: NOW, pinnedKeys: TEST_KEYS });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toMatch(/unsigned/i);
  });

  it("rejects a signature from an unknown key id", () => {
    const verdict = verifyManifest(signed(payload(), SEED, "not-a-pinned-key"), { now: NOW, pinnedKeys: TEST_KEYS });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toMatch(/unknown signing key/i);
  });

  it("rejects a manifest signed by a different key", () => {
    const otherSeed = "4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb";
    const verdict = verifyManifest(signed(payload(), otherSeed), { now: NOW, pinnedKeys: TEST_KEYS });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toMatch(/signature verification failed/i);
  });

  it("rejects a non-Ed25519 algorithm", () => {
    const manifest = signed(payload());
    (manifest.signature as { algorithm: string }).algorithm = "RSA-PSS";
    const verdict = verifyManifest(manifest, { now: NOW, pinnedKeys: TEST_KEYS });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toMatch(/only ed25519/i);
  });

  it("rejects a malformed signature string", () => {
    const manifest = signed(payload());
    (manifest.signature as { signature: string }).signature = "zz";
    expect(verifyManifest(manifest, { now: NOW, pinnedKeys: TEST_KEYS }).ok).toBe(false);
  });

  it("rejects an expired manifest", () => {
    const verdict = verifyManifest(signed(payload()), { now: new Date("2026-12-01T00:00:00Z"), pinnedKeys: TEST_KEYS });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toMatch(/expired/i);
  });

  it("rejects an unsupported manifest version", () => {
    const p = payload({ manifestVersion: 99 });
    const verdict = verifyManifest(signed(p), { now: NOW, pinnedKeys: TEST_KEYS });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toMatch(/unsupported manifest version/i);
  });
});

describe("entry validation", () => {
  const good = { version: "1.0.4", minAppVersion: "3.0.0", url: "https://e.test/a.bin", sizeBytes: 10, sha256: "b".repeat(64) };

  it("accepts a well-formed entry", () => {
    expect(validateMarketEntry("IN", good).ok).toBe(true);
  });

  it("rejects a plain-http url", () => {
    const verdict = validateMarketEntry("IN", { ...good, url: "http://e.test/a.bin" });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toMatch(/https/i);
  });

  it("rejects a missing or malformed hash", () => {
    expect(validateMarketEntry("IN", { ...good, sha256: "abc" }).ok).toBe(false);
    expect(validateMarketEntry("IN", { ...good, sha256: undefined }).ok).toBe(false);
  });

  it("rejects a non-positive size", () => {
    expect(validateMarketEntry("IN", { ...good, sizeBytes: 0 }).ok).toBe(false);
  });

  it("rejects an entry with neither url nor parts", () => {
    expect(validateMarketEntry("IN", { version: "1.0.0", minAppVersion: "3.0.0", sizeBytes: 1, sha256: "a".repeat(64) }).ok).toBe(false);
  });

  it("accepts a multi-part entry and rejects gaps in the numbering", () => {
    const parts = [
      { index: 1, url: "https://e.test/p1", sizeBytes: 10, sha256: "a".repeat(64) },
      { index: 2, url: "https://e.test/p2", sizeBytes: 10, sha256: "b".repeat(64) },
    ];
    expect(validateMarketEntry("IN", { version: "1.0.0", minAppVersion: "3.0.0", sizeBytes: 20, sha256: "a".repeat(64), parts }).ok).toBe(true);
    const gapped = [parts[0], { ...parts[1], index: 3 }];
    const verdict = validateMarketEntry("IN", { version: "1.0.0", minAppVersion: "3.0.0", sizeBytes: 20, sha256: "a".repeat(64), parts: gapped });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toMatch(/contiguous/i);
  });

  it("rejects a duplicate part index", () => {
    const parts = [
      { index: 1, url: "https://e.test/p1", sizeBytes: 10, sha256: "a".repeat(64) },
      { index: 1, url: "https://e.test/p2", sizeBytes: 10, sha256: "b".repeat(64) },
    ];
    expect(validateMarketEntry("IN", { version: "1.0.0", minAppVersion: "3.0.0", sizeBytes: 20, sha256: "a".repeat(64), parts }).ok).toBe(false);
  });

  it("rejects an insecure part url", () => {
    const parts = [{ index: 1, url: "http://e.test/p1", sizeBytes: 10, sha256: "a".repeat(64) }];
    expect(validateMarketEntry("IN", { version: "1.0.0", minAppVersion: "3.0.0", sizeBytes: 10, sha256: "a".repeat(64), parts }).ok).toBe(false);
  });

  it("refuses a signed manifest containing a bad entry", () => {
    const p = payload();
    (p.markets.IN as { url: string }).url = "http://insecure.test/pack.bin";
    const verdict = verifyManifest(signed(p), { now: NOW, pinnedKeys: TEST_KEYS });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toMatch(/https/i);
  });
});

describe("version comparison", () => {
  it("parses a semantic version", () => {
    expect(parseVersion("1.0.4")).toEqual({ major: 1, minor: 0, patch: 4, prerelease: null });
    expect(parseVersion("1.0.4-rc.1")?.prerelease).toBe("rc.1");
  });

  it("returns null for a malformed version rather than guessing", () => {
    expect(parseVersion("1.0")).toBeNull();
    expect(parseVersion("v1.0.4")).toBeNull();
    expect(parseVersion("")).toBeNull();
  });

  it("orders versions numerically, not lexically", () => {
    expect(compareVersions("1.0.10", "1.0.9")).toBe(1);
    expect(compareVersions("1.2.0", "1.10.0")).toBe(-1);
    expect(compareVersions("2.0.0", "1.99.99")).toBe(1);
  });

  it("sorts a prerelease below its release", () => {
    expect(compareVersions("1.0.0-rc.1", "1.0.0")).toBe(-1);
    expect(compareVersions("1.0.0", "1.0.0-rc.1")).toBe(1);
  });

  it("returns null when either side is unparseable", () => {
    expect(compareVersions("1.0", "1.0.0")).toBeNull();
  });
});

describe("pack diffing", () => {
  const entry = { version: "1.0.4", minAppVersion: "3.0.0", url: "https://e.test/a.bin", sizeBytes: 10, sha256: "a".repeat(64) };

  it("reports absent when nothing is installed", () => {
    expect(diffMarketPack(entry, { version: null }, "3.31.0")).toEqual({ kind: "absent", remoteVersion: "1.0.4" });
  });

  it("reports update-available when the remote version is newer", () => {
    expect(diffMarketPack(entry, { version: "1.0.2" }, "3.31.0")).toEqual({ kind: "update-available", from: "1.0.2", to: "1.0.4" });
  });

  it("reports current when the versions match", () => {
    expect(diffMarketPack(entry, { version: "1.0.4" }, "3.31.0")).toEqual({ kind: "current", version: "1.0.4" });
  });

  it("reports local-ahead rather than offering a downgrade", () => {
    expect(diffMarketPack(entry, { version: "1.0.9" }, "3.31.0")).toEqual({ kind: "local-ahead", from: "1.0.9", to: "1.0.4" });
  });

  it("requires an app update when minAppVersion is not met", () => {
    const strict = { ...entry, minAppVersion: "4.0.0" };
    expect(diffMarketPack(strict, { version: null }, "3.31.0")).toEqual({ kind: "requires-app-update", required: "4.0.0", current: "3.31.0" });
  });

  it("reports uncomparable instead of assuming, when a version is malformed", () => {
    const bad = { ...entry, version: "not-a-version" };
    expect(diffMarketPack(bad, { version: null }, "3.31.0").kind).toBe("uncomparable");
  });
});

describe("pack plans map onto lifecycle states", () => {
  it("maps absent to queued, newer to update-available, current to installed", () => {
    const plans = planMarketPacks(payload(), { IN: { version: "1.0.2" } }, "3.31.0");
    const india = plans.find((plan) => plan.marketId === "IN");
    expect(india?.nextLifecycleState).toBe("update-available");
  });

  it("queues a country with no local pack", () => {
    const plans = planMarketPacks(payload(), {}, "3.31.0");
    expect(plans[0].nextLifecycleState).toBe("queued");
    expect(plans[0].detail).toMatch(/ready to download/i);
  });

  it("marks an up-to-date country installed", () => {
    const plans = planMarketPacks(payload(), { IN: { version: "1.0.4" } }, "3.31.0");
    expect(plans[0].nextLifecycleState).toBe("installed");
  });

  it("does not queue a pack the app is too old to read", () => {
    const p = payload();
    (p.markets.IN as { minAppVersion: string }).minAppVersion = "9.0.0";
    const plans = planMarketPacks(p, {}, "3.31.0");
    expect(plans[0].nextLifecycleState).toBe("not-downloaded");
    expect(plans[0].detail).toMatch(/needs app/i);
  });
});

describe("pack sizing and file listing", () => {
  it("sums parts and lists them in order", () => {
    const entry = {
      version: "1.0.0", minAppVersion: "3.0.0", sizeBytes: 30, sha256: "a".repeat(64),
      parts: [
        { index: 2, url: "https://e.test/p2", sizeBytes: 20, sha256: "b".repeat(64) },
        { index: 1, url: "https://e.test/p1", sizeBytes: 10, sha256: "c".repeat(64) },
      ],
    };
    expect(packSizeBytes(entry)).toBe(30);
    expect(packFiles(entry).map((file) => file.part)).toEqual([1, 2]);
  });

  it("treats a single-file pack as one part-less file", () => {
    const entry = { version: "1.0.0", minAppVersion: "3.0.0", url: "https://e.test/a", sizeBytes: 5, sha256: "a".repeat(64) };
    expect(packFiles(entry)).toEqual([{ url: "https://e.test/a", sha256: "a".repeat(64), sizeBytes: 5, part: null }]);
  });

  it("namespaces a pack cache key per market", () => {
    expect(packCacheKey("IN", null)).not.toBe(packCacheKey("US", null));
    expect(packCacheKey("IN", 1)).not.toBe(packCacheKey("IN", 2));
  });

  it("formats sizes readably", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(12_345_678)).toBe("11.8 MB");
  });
});

describe("client fetch, cache and offline safety", () => {
  it("fetches, verifies and caches a good manifest", async () => {
    const manifest = signed(payload());
    const result = await fetchManifest({ now: NOW, pinnedKeys: TEST_KEYS, fetcher: async () => manifest });
    expect(result.source).toBe("network");
    expect(result.stale).toBe(false);
    expect(result.payload?.markets.IN.version).toBe("1.0.4");
    expect(await readCachedManifest()).not.toBeNull();
  });

  it("falls back to cache on a network failure and reports why", async () => {
    await fetchManifest({ now: NOW, pinnedKeys: TEST_KEYS, fetcher: async () => signed(payload()) });
    const result = await fetchManifest({ now: NOW, pinnedKeys: TEST_KEYS, fetcher: async () => { throw new Error("Network request failed"); } });
    expect(result.source).toBe("cache");
    expect(result.stale).toBe(true);
    expect(result.error).toMatch(/network request failed/i);
    expect(result.payload?.markets.IN.version).toBe("1.0.4");
  });

  it("reports a timeout clearly", async () => {
    const result = await fetchManifest({ now: NOW, pinnedKeys: TEST_KEYS, timeoutMs: 5, fetcher: async () => { const e = new Error("aborted"); e.name = "AbortError"; throw e; } });
    expect(result.source).toBe("none");
    expect(result.payload).toBeNull();
    expect(result.error).toMatch(/timed out after 5 ms/i);
  });

  it("does NOT cache or serve a manifest with a bad signature", async () => {
    const bad = signed(payload());
    (bad.payload.markets.IN as { version: string }).version = "9.9.9";
    const result = await fetchManifest({ now: NOW, pinnedKeys: TEST_KEYS, fetcher: async () => bad });
    expect(result.source).toBe("none");
    expect(result.payload).toBeNull();
    expect(result.error).toMatch(/signature/i);
    // The cache must not have been poisoned by the rejected response.
    expect(await readCachedManifest()).toBeNull();
  });

  it("keeps serving the last good manifest when a later one is tampered", async () => {
    await fetchManifest({ now: NOW, pinnedKeys: TEST_KEYS, fetcher: async () => signed(payload()) });
    const bad = signed(payload());
    (bad.payload.markets.IN as { sizeBytes: number }).sizeBytes = 1;
    const result = await fetchManifest({ now: NOW, pinnedKeys: TEST_KEYS, fetcher: async () => bad });
    expect(result.source).toBe("cache");
    expect(result.payload?.markets.IN.sizeBytes).toBe(12_345_678);
  });

  it("returns nothing rather than crashing when offline with an empty cache", async () => {
    const result = await fetchManifest({ now: NOW, pinnedKeys: TEST_KEYS, fetcher: async () => { throw new Error("offline"); } });
    expect(result.payload).toBeNull();
    expect(result.source).toBe("none");
    expect(result.error).toBeTruthy();
  });

  it("recovers from a corrupt cache", async () => {
    store.set("analyzerx.manifest.cache.v1", "{not json");
    expect(await readCachedManifest()).toBeNull();
    const result = await fetchManifest({ now: NOW, pinnedKeys: TEST_KEYS, fetcher: async () => { throw new Error("offline"); } });
    expect(result.payload).toBeNull();
  });

  it("refuses a non-HTTPS manifest url without making a request", async () => {
    let called = false;
    const result = await fetchManifest({ url: "http://insecure.test/m.json", now: NOW, pinnedKeys: TEST_KEYS, fetcher: async () => { called = true; return signed(payload()); } });
    expect(called).toBe(false);
    expect(result.error).toMatch(/not https/i);
  });

  it("does not retry in a loop: one attempt per call", async () => {
    let attempts = 0;
    await fetchManifest({ now: NOW, pinnedKeys: TEST_KEYS, fetcher: async () => { attempts += 1; throw new Error("down"); } });
    expect(attempts).toBe(1);
  });

  it("serves a cached manifest offline so the app can still describe installs", async () => {
    await fetchManifest({ now: NOW, pinnedKeys: TEST_KEYS, fetcher: async () => signed(payload()) });
    const offline = await fetchManifest({ now: NOW, pinnedKeys: TEST_KEYS, fetcher: async () => { throw new Error("offline"); } });
    expect(offline.payload).not.toBeNull();
    expect(offline.stale).toBe(true);
  });

  it("marks a fresh cache as fresh and an old one as stale", async () => {
    await writeCachedManifest(payload(), KEY_ID);
    const cached = await readCachedManifest();
    expect(cached).not.toBeNull();
    expect(isCacheFresh(cached!, new Date())).toBe(true);
    expect(isCacheFresh(cached!, new Date(Date.now() + 7 * 60 * 60 * 1000))).toBe(false);
  });

  it("clears the cache on request", async () => {
    await writeCachedManifest(payload(), KEY_ID);
    await clearCachedManifest();
    expect(await readCachedManifest()).toBeNull();
  });

  it("defaults to an https endpoint", () => {
    expect(DEFAULT_MANIFEST_URL.startsWith("https://")).toBe(true);
  });
});
