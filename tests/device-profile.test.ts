import { describe, expect, it } from "vitest";

import {
  classifyDevice,
  localModelBudgetMb,
  modelFits,
  pacedIntervalMs,
  recommendedModelFileMb,
  shouldPreloadModel,
  type DeviceProfile,
} from "../lib/device-profile";

const GB = 1024;
const low = () => classifyDevice({ totalRamMb: 2 * GB, isLowRamDevice: true, cpuCores: 4, memoryClassMb: 128, sdkInt: 33 });
const mid = () => classifyDevice({ totalRamMb: 4 * GB, cpuCores: 8, memoryClassMb: 256, sdkInt: 34 });
const high = () => classifyDevice({ totalRamMb: 12 * GB, cpuCores: 8, memoryClassMb: 512, sdkInt: 35 });

describe("device profile — classification", () => {
  it("classifies a Go-edition class device as low", () => {
    const profile = low();
    expect(profile.tier).toBe("low");
    expect(profile.behaviour.localAiEnabled).toBe(false);
    expect(profile.behaviour.maxLocalModelParams).toBe(0);
    expect(profile.behaviour.frugal).toBe(true);
  });

  it("demotes on any single low-end signal", () => {
    expect(classifyDevice({ totalRamMb: 2 * GB, cpuCores: 8 }).tier).toBe("low");
    expect(classifyDevice({ totalRamMb: 12 * GB, cpuCores: 2 }).tier).toBe("low");
    expect(classifyDevice({ totalRamMb: 8 * GB, isLowRamDevice: true }).tier).toBe("low");
  });

  it("classifies a 4 GB device as mid, matching the full-Android floor", () => {
    const profile = mid();
    expect(profile.tier).toBe("mid");
    expect(profile.behaviour.localAiEnabled).toBe(true);
    expect(profile.behaviour.maxLocalModelParams).toBe(1);
  });

  it("classifies a 12 GB 8-core device as high", () => {
    const profile = high();
    expect(profile.tier).toBe("high");
    expect(profile.behaviour.maxLocalModelParams).toBe(3);
    expect(profile.behaviour.pollIntervalMultiplier).toBe(1);
  });

  it("never promotes a device on a missing or unreadable signal", () => {
    expect(classifyDevice({}).tier).toBe("mid");
    expect(classifyDevice().tier).toBe("mid");
    expect(classifyDevice({ totalRamMb: null, cpuCores: null, memoryClassMb: null, isLowRamDevice: null }).tier).toBe("mid");
    expect(classifyDevice({ totalRamMb: Number.NaN, cpuCores: Number.NaN }).tier).toBe("mid");
  });

  it("always explains itself", () => {
    for (const profile of [low(), mid(), high()] as DeviceProfile[]) {
      expect(profile.reasons.length).toBeGreaterThan(0);
      expect(profile.summary.length).toBeGreaterThan(20);
    }
  });

  it("behaves more conservatively as the tier falls", () => {
    expect(low().behaviour.listWindowSize).toBeLessThan(mid().behaviour.listWindowSize);
    expect(mid().behaviour.listWindowSize).toBeLessThan(high().behaviour.listWindowSize);
    expect(low().behaviour.cacheEntries).toBeLessThan(high().behaviour.cacheEntries);
    expect(low().behaviour.pollIntervalMultiplier).toBeGreaterThan(high().behaviour.pollIntervalMultiplier);
  });
});

describe("device profile — model fit", () => {
  it("runs a 3B Q4 model on a high-tier device", () => {
    // ~2 GB on disk at Q4, needing ~4 GB to run — comfortable on 12 GB.
    expect(modelFits(high(), 2000).fits).toBe(true);
  });

  it("refuses a 7B Q4 model on a phone", () => {
    // ~4.5 GB on disk, ~8 GB to run.
    expect(modelFits(high(), 4500).fits).toBe(false);
  });

  it("allows a small model on mid but not a 3B", () => {
    expect(modelFits(mid(), 800).fits).toBe(true);
    expect(modelFits(mid(), 2000).fits).toBe(false);
  });

  it("allows nothing on a low-tier device", () => {
    expect(modelFits(low(), 100).fits).toBe(false);
    expect(modelFits(low(), 100).reason).toMatch(/disabled/i);
  });

  it("rejects a nonsensical model size", () => {
    expect(modelFits(high(), 0).fits).toBe(false);
    expect(modelFits(high(), Number.NaN).fits).toBe(false);
  });

  it("budgets 40% of RAM and reserves the rest for the OS and KV cache", () => {
    expect(localModelBudgetMb(high())).toBe(Math.floor(12 * GB * 0.4));
    expect(localModelBudgetMb(low())).toBe(0);
    expect(recommendedModelFileMb(high())).toBe(Math.floor(localModelBudgetMb(high()) / 2));
  });

  it("paces polling and only preloads on a high-tier device", () => {
    expect(pacedIntervalMs(low(), 120_000)).toBe(240_000);
    expect(pacedIntervalMs(mid(), 120_000)).toBe(180_000);
    expect(pacedIntervalMs(high(), 120_000)).toBe(120_000);
    expect(shouldPreloadModel(high())).toBe(true);
    expect(shouldPreloadModel(mid())).toBe(false);
  });
});
