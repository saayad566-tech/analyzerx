import { describe, expect, it } from "vitest";
import { DEFAULT_ALERT_NOTIFICATION_PREFERENCES, isWithinQuietHours } from "../lib/local-preferences";

describe("unified history and alert preferences", () => {
  it("defaults to in-app and push delivery with other channels unavailable", () => {
    expect(DEFAULT_ALERT_NOTIFICATION_PREFERENCES.enabled).toBe(true);
    expect(DEFAULT_ALERT_NOTIFICATION_PREFERENCES.channels["in-app"]).toBe(true);
    expect(DEFAULT_ALERT_NOTIFICATION_PREFERENCES.channels.push).toBe(true);
    expect(DEFAULT_ALERT_NOTIFICATION_PREFERENCES.channels.email).toBe(false);
  });

  it("handles a quiet window that crosses midnight", () => {
    const prefs = { ...DEFAULT_ALERT_NOTIFICATION_PREFERENCES, quietHoursEnabled: true, quietStart: "22:00", quietEnd: "07:00" };
    expect(isWithinQuietHours(new Date("2026-08-18T23:30:00"), prefs)).toBe(true);
    expect(isWithinQuietHours(new Date("2026-08-18T06:30:00"), prefs)).toBe(true);
    expect(isWithinQuietHours(new Date("2026-08-18T12:00:00"), prefs)).toBe(false);
  });

  it("does not suppress alerts when quiet hours are disabled", () => {
    const prefs = { ...DEFAULT_ALERT_NOTIFICATION_PREFERENCES, quietHoursEnabled: false };
    expect(isWithinQuietHours(new Date("2026-08-18T23:30:00"), prefs)).toBe(false);
  });
});
