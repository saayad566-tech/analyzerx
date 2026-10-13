import { describe, expect, it } from "vitest";

import { deriveTrackerState, trackerAutomationClaim, trackerPresentation, type TrackerStateInput } from "../lib/tracker-state";

const NOW = Date.parse("2026-10-12T12:00:00Z");
const hoursAgo = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString();

function input(overrides: Partial<TrackerStateInput> = {}): TrackerStateInput {
  return {
    providersConfigured: 1,
    providersRequired: 1,
    isChecking: false,
    lastAttemptAt: hoursAgo(1),
    lastSuccessAt: hoursAgo(1),
    lastError: null,
    articlesStored: 12,
    articlesStoredLastCheck: 3,
    hasDurableScheduler: false,
    now: NOW,
    ...overrides,
  };
}

describe("deriveTrackerState (FIX 04)", () => {
  it("reports unconfigured with zero providers and never claims automation", () => {
    const state = deriveTrackerState(input({ providersConfigured: 0, lastSuccessAt: null, articlesStored: 0, articlesStoredLastCheck: 0 }));
    expect(state.key).toBe("unconfigured");
    expect(state.canClaimAutomation).toBe(false);
    expect(state.description).toMatch(/not active/i);
  });

  it("reports incomplete configuration when a credential is missing", () => {
    expect(deriveTrackerState(input({ providersNeedingCredentials: 2 })).key).toBe("configuration-incomplete");
    expect(deriveTrackerState(input({ providersConfigured: 0, providersRequired: 2 })).key).toBe("unconfigured");
  });

  it("distinguishes checking from a completed check", () => {
    expect(deriveTrackerState(input({ isChecking: true })).key).toBe("checking");
  });

  it("classifies failures distinctly", () => {
    expect(deriveTrackerState(input({ errorKind: "auth" })).key).toBe("authentication-failed");
    expect(deriveTrackerState(input({ errorKind: "server" })).key).toBe("server-unavailable");
    expect(deriveTrackerState(input({ errorKind: "network" })).key).toBe("request-failed");
    expect(deriveTrackerState(input({ lastSuccessAt: null, lastError: "boom" })).key).toBe("request-failed");
  });

  it("treats a successful empty check as success, not failure", () => {
    const state = deriveTrackerState(input({ articlesStoredLastCheck: 0, lastError: null }));
    expect(state.key).toBe("empty-success");
    expect(state.tone).toBe("ok");
  });

  it("marks an old success as stale and keeps the real age", () => {
    const state = deriveTrackerState(input({ lastSuccessAt: hoursAgo(10) }));
    expect(state.key).toBe("stale");
    expect(state.lastSuccessAgeMs).toBe(10 * 3_600_000);
  });

  it("reports healthy when a recent check stored items", () => {
    expect(deriveTrackerState(input()).key).toBe("success-with-items");
  });

  it("never claims automation without a durable scheduler", () => {
    const onDevice = deriveTrackerState(input({ hasDurableScheduler: false }));
    expect(onDevice.canClaimAutomation).toBe(false);
    expect(trackerAutomationClaim(onDevice)).toMatch(/on this device/i);
    expect(trackerAutomationClaim(onDevice)).not.toMatch(/^Automatic collection is active/i);

    const durable = deriveTrackerState(input({ hasDurableScheduler: true }));
    expect(durable.canClaimAutomation).toBe(true);
    expect(trackerAutomationClaim(durable)).toMatch(/Automatic collection is active/i);
  });

  it("returns a state for every combination without throwing", () => {
    const values = [0, 1, 3];
    for (const providersConfigured of values) {
      for (const lastSuccessAt of [null, hoursAgo(1), hoursAgo(99)]) {
        for (const isChecking of [true, false]) {
          for (const lastError of [null, "err"]) {
            for (const errorKind of [null, "auth", "network", "server", "unknown"] as const) {
              const state = deriveTrackerState(input({ providersConfigured, lastSuccessAt, isChecking, lastError, errorKind }));
              expect(state.key).toBeTruthy();
              expect(state.label).toBeTruthy();
              expect(state.description).toBeTruthy();
            }
          }
        }
      }
    }
  });
});

describe("trackerPresentation (FIX 04)", () => {
  it("derives every label from the same state", () => {
    const view = trackerPresentation(input({ providersConfigured: 0, articlesStored: 0, lastSuccessAt: null }));
    expect(view.state.key).toBe("unconfigured");
    expect(view.badgeLabel).toBe("Not configured");
    expect(view.providersLabel).toBe("0 providers configured");
    expect(view.storedLabel).toBe("0 stored");
    expect(view.freshnessLabel).toBe("not available");
    expect(view.automationClaim).not.toMatch(/Automatic collection is active/);
  });

  it("never invents a freshness value when there is no successful check", () => {
    expect(trackerPresentation(input({ lastSuccessAt: null })).freshnessLabel).toBe("not available");
  });

  it("pluralises the provider count correctly", () => {
    expect(trackerPresentation(input({ providersConfigured: 1 })).providersLabel).toBe("1 provider configured");
    expect(trackerPresentation(input({ providersConfigured: 2 })).providersLabel).toBe("2 providers configured");
  });
});
