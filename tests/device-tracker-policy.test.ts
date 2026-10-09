import { describe, expect, it } from "vitest";
import { getDeviceTrackerAvailability, getDeviceTrackerDisclosure, getSafeDeviceTrackerIntervalMs, shouldPauseDeviceInference } from "../lib/device-tracker-policy";

describe("device tracker policy", () => {
  it("pauses inference at or above the thermal safety threshold", () => {
    expect(shouldPauseDeviceInference(44.9)).toBe(false);
    expect(shouldPauseDeviceInference(45)).toBe(true);
    expect(shouldPauseDeviceInference(null)).toBe(false);
  });

  it("uses a longer interval during thermal protection", () => {
    expect(getSafeDeviceTrackerIntervalMs(44)).toBe(300_000);
    expect(getSafeDeviceTrackerIntervalMs(46)).toBe(600_000);
  });

  it("requires a native build for Android assist and stays server-only elsewhere", () => {
    expect(getDeviceTrackerAvailability("android", false)).toBe("native-build-required");
    expect(getDeviceTrackerAvailability("ios", true)).toBe("server-only");
  });

  it("discloses that Android assist is best effort and native-build dependent", () => {
    expect(getDeviceTrackerDisclosure("android-assist")).toContain("best-effort");
    expect(getDeviceTrackerDisclosure("android-assist")).toContain("custom native build");
  });
});
