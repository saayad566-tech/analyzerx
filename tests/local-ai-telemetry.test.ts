import { describe, expect, it } from "vitest";

import { summarizeLocalAIInference, type LocalAIInferenceSample } from "../lib/local-ai-telemetry-core";

describe("local AI telemetry", () => {
  it("summarizes successful inference latency and throughput", () => {
    const samples: LocalAIInferenceSample[] = [
      { modelId: "gemma3-1b", startedAt: new Date(0).toISOString(), durationMs: 2000, tokenCount: 20, backend: "litert-lm-android", success: true, batteryLevel: 0.84 },
      { modelId: "gemma3-1b", startedAt: new Date(1).toISOString(), durationMs: 1000, tokenCount: 10, backend: "litert-lm-android", success: true, batteryLevel: 0.82, memoryBytes: 456_000_000, thermalStatus: "light" },
      { modelId: "gemma3-1b", startedAt: new Date(2).toISOString(), durationMs: 500, tokenCount: 0, backend: "litert-lm-android", success: false },
    ];
    expect(summarizeLocalAIInference(samples)).toMatchObject({ sampleCount: 3, successRate: 2 / 3, averageDurationMs: 1167, averageTokensPerSecond: 10, latestBatteryLevel: null, latestMemoryBytes: 456_000_000, latestThermalStatus: "light" });
  });

  it("returns an empty summary without samples", () => {
    expect(summarizeLocalAIInference([])).toMatchObject({ sampleCount: 0, successRate: 0, averageDurationMs: 0, averageTokensPerSecond: 0 });
  });
});
