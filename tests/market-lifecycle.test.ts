/**
 * Market lifecycle and onboarding.
 *
 * These assert the properties that make the switcher's state trustworthy: an illegal
 * transition is refused rather than written, a country cannot be marked installed with
 * parts missing, and onboarding cannot complete without a country.
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
  lifecycleKey, loadMarketLifecycle, loadMarketLifecycles, saveMarketLifecycle,
  canTransition, transitionMarketLifecycle, completeMarketLifecycle, failMarketLifecycle,
  setMarketDownloadProgress, activateMarketLifecycle, removeMarketLifecycle,
  loadOnboarding, completeOnboarding, resetOnboarding,
  lifecycleBadge, canActivate, type MarketLifecycleRecord,
} from "../lib/market-lifecycle";

const fresh = (marketId: "IN" | "US" | "GB" = "IN"): MarketLifecycleRecord => ({
  marketId, state: "not-downloaded", progress: 0, installedBytes: null, dataVersion: null,
  partsExpected: 0, partsVerified: 0, failureReason: null, updatedAt: new Date(0).toISOString(),
});

beforeEach(() => { store.clear(); });

describe("storage separation", () => {
  it("namespaces each country's record so they cannot collide", () => {
    expect(lifecycleKey("IN")).not.toBe(lifecycleKey("US"));
    expect(lifecycleKey("IN")).toContain("IN");
    expect(lifecycleKey("US")).toContain("US");
  });

  it("returns a default record for a country never touched", async () => {
    const record = await loadMarketLifecycle("FR");
    expect(record.marketId).toBe("FR");
    expect(record.state).toBe("not-downloaded");
    expect(record.progress).toBe(0);
  });

  it("gives every supported market a record, defaulted where absent", async () => {
    const all = await loadMarketLifecycles();
    expect(Object.keys(all).length).toBeGreaterThanOrEqual(10);
    for (const record of Object.values(all)) {
      expect(record.state).toBe("not-downloaded");
    }
  });

  it("writes one country's record without touching another's", async () => {
    await saveMarketLifecycle({ ...fresh("IN"), state: "installed", installedBytes: 1234 });
    const us = await loadMarketLifecycle("US");
    expect(us.state).toBe("not-downloaded");
    const inRecord = await loadMarketLifecycle("IN");
    expect(inRecord.state).toBe("installed");
    expect(inRecord.installedBytes).toBe(1234);
  });

  it("recovers from a corrupt record rather than throwing", async () => {
    store.set(lifecycleKey("IN"), "{not json");
    const record = await loadMarketLifecycle("IN");
    expect(record.state).toBe("not-downloaded");
  });

  it("fills missing fields on an older partial record", async () => {
    store.set(lifecycleKey("IN"), JSON.stringify({ state: "installed" }));
    const record = await loadMarketLifecycle("IN");
    expect(record.state).toBe("installed");
    expect(record.partsExpected).toBe(0);
    expect(record.marketId).toBe("IN");
  });
});

describe("transitions", () => {
  it("allows the legal path from not-downloaded to active", () => {
    expect(canTransition("not-downloaded", "downloading")).toBe(true);
    expect(canTransition("downloading", "verifying")).toBe(true);
    expect(canTransition("verifying", "installed")).toBe(true);
    expect(canTransition("installed", "active")).toBe(true);
  });

  it("refuses to jump straight from not-downloaded to installed", () => {
    expect(canTransition("not-downloaded", "installed")).toBe(false);
    expect(canTransition("not-downloaded", "active")).toBe(false);
  });

  it("refuses a transition that would skip verification", async () => {
    const record = await saveMarketLifecycle({ ...fresh("IN"), state: "downloading" });
    await expect(transitionMarketLifecycle(record, "installed")).rejects.toThrow(/illegal/i);
  });

  it("allows recovery from failed", () => {
    expect(canTransition("failed", "downloading")).toBe(true);
    expect(canTransition("failed", "not-downloaded")).toBe(true);
  });
});

describe("download progress and completion", () => {
  it("clamps progress to 0..1", async () => {
    const record = await saveMarketLifecycle({ ...fresh("IN"), state: "downloading" });
    const over = await setMarketDownloadProgress(record, 500, 100);
    expect(over.progress).toBe(1);
    const under = await setMarketDownloadProgress(record, -5, 100);
    expect(under.progress).toBe(0);
  });

  it("refuses to mark a country installed with parts missing", async () => {
    const record = await saveMarketLifecycle({ ...fresh("IN"), state: "verifying" });
    await expect(completeMarketLifecycle(record, { dataVersion: "v1", installedBytes: 10, partsExpected: 3, partsVerified: 2 }))
      .rejects.toThrow(/2 of 3 parts/i);
  });

  it("marks a country installed only when every part is verified", async () => {
    const record = await saveMarketLifecycle({ ...fresh("IN"), state: "verifying" });
    const done = await completeMarketLifecycle(record, { dataVersion: "v1", installedBytes: 2048, partsExpected: 2, partsVerified: 2 });
    expect(done.state).toBe("installed");
    expect(done.progress).toBe(1);
    expect(done.dataVersion).toBe("v1");
    expect(done.failureReason).toBeNull();
  });

  it("records a failure reason the user can act on", async () => {
    const record = await saveMarketLifecycle({ ...fresh("IN"), state: "downloading" });
    const failed = await failMarketLifecycle(record, "Network unavailable");
    expect(failed.state).toBe("failed");
    expect(failed.failureReason).toBe("Network unavailable");
  });
});

describe("activation", () => {
  it("marks the chosen country active and demotes the previous one", async () => {
    await saveMarketLifecycle({ ...fresh("IN"), state: "installed" });
    await saveMarketLifecycle({ ...fresh("US"), state: "installed" });
    let all = await activateMarketLifecycle("IN");
    expect(all.IN.state).toBe("active");
    all = await activateMarketLifecycle("US");
    expect(all.US.state).toBe("active");
    expect(all.IN.state).toBe("installed");
  });

  it("only ever leaves one country active", async () => {
    await saveMarketLifecycle({ ...fresh("IN"), state: "installed" });
    await saveMarketLifecycle({ ...fresh("US"), state: "installed" });
    await saveMarketLifecycle({ ...fresh("GB"), state: "installed" });
    await activateMarketLifecycle("IN");
    await activateMarketLifecycle("US");
    const all = await activateMarketLifecycle("GB");
    const active = Object.values(all).filter((record) => record.state === "active");
    expect(active).toHaveLength(1);
    expect(active[0].marketId).toBe("GB");
  });

  it("refuses to activate a country whose data was never downloaded", async () => {
    const all = await loadMarketLifecycles();
    expect(canActivate(all.IN)).toBe(false);
    expect(canActivate({ ...fresh("IN"), state: "installed" })).toBe(true);
    expect(canActivate({ ...fresh("IN"), state: "active" })).toBe(true);
  });

  it("removes a country back to not-downloaded", async () => {
    await saveMarketLifecycle({ ...fresh("IN"), state: "installed", installedBytes: 99 });
    const removed = await removeMarketLifecycle("IN");
    expect(removed.state).toBe("not-downloaded");
    expect((await loadMarketLifecycle("IN")).installedBytes).toBeNull();
  });
});

describe("onboarding", () => {
  it("starts incomplete with nothing selected", async () => {
    const record = await loadOnboarding();
    expect(record.completed).toBe(false);
    expect(record.selected).toEqual([]);
  });

  it("refuses to complete with no country chosen", async () => {
    await expect(completeOnboarding([])).rejects.toThrow(/at least one country/i);
  });

  it("queues the chosen countries rather than claiming they are ready", async () => {
    await completeOnboarding(["IN", "US"]);
    const all = await loadMarketLifecycles();
    expect(all.IN.state).toBe("queued");
    expect(all.US.state).toBe("queued");
    expect(all.GB.state).toBe("not-downloaded");
  });

  it("records completion and survives a reload", async () => {
    await completeOnboarding(["IN"]);
    const record = await loadOnboarding();
    expect(record.completed).toBe(true);
    expect(record.selected).toEqual(["IN"]);
    expect(record.completedAt).not.toBeNull();
  });

  it("ignores an unknown country id rather than storing it", async () => {
    await completeOnboarding(["IN", "ZZ" as never]);
    const record = await loadOnboarding();
    expect(record.selected).toEqual(["IN"]);
  });

  it("can be reset", async () => {
    await completeOnboarding(["IN"]);
    await resetOnboarding();
    expect((await loadOnboarding()).completed).toBe(false);
  });

  it("treats corrupt onboarding storage as not-yet-complete rather than crashing", async () => {
    store.set("analyzerx.onboarding.v1", "]]not json[[");
    const record = await loadOnboarding();
    expect(record.completed).toBe(false);
  });
});

describe("presentation", () => {
  it("labels every state", () => {
    for (const state of ["not-downloaded", "queued", "downloading", "verifying", "installed", "active", "update-available", "failed"] as const) {
      const badge = lifecycleBadge({ ...fresh("IN"), state });
      expect(badge.label.length).toBeGreaterThan(2);
      expect(badge.detail.length).toBeGreaterThan(2);
      expect(["ready", "busy", "absent", "error"]).toContain(badge.tone);
    }
  });

  it("shows a percentage while downloading and a part count while verifying", () => {
    expect(lifecycleBadge({ ...fresh("IN"), state: "downloading", progress: 0.42 }).detail).toContain("42%");
    expect(lifecycleBadge({ ...fresh("IN"), state: "verifying", partsExpected: 3, partsVerified: 1 }).detail).toContain("1/3");
  });

  it("surfaces the failure reason", () => {
    expect(lifecycleBadge({ ...fresh("IN"), state: "failed", failureReason: "Disk full" }).detail).toBe("Disk full");
  });
});
