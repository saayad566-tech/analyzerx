import { describe, expect, it } from "vitest";

import { filterLocalAIInferenceSamples, localAIInferenceSamplesToCsv } from "../lib/local-ai-telemetry-core";

const sample = { modelId: "gemma3-1b", startedAt: "2026-08-18T00:00:00.000Z", durationMs: 1200, tokenCount: 24, backend: "cpu", batteryLevel: 0.8, isCharging: false, memoryBytes: null, thermalStatus: "unavailable", success: true, errorCode: undefined };

describe("Local AI telemetry CSV export", () => {
  it("writes a stable header and one row with nullable fields", () => {
    const csv = localAIInferenceSamplesToCsv([sample]);
    expect(csv.split("\n")[0]).toBe("model_id,started_at,duration_ms,token_count,backend,battery_level,is_charging,memory_bytes,thermal_status,success,error_code");
    expect(csv).toContain("gemma3-1b,2026-08-18T00:00:00.000Z,1200,24,cpu,0.8,false,,unavailable,true,");
  });

  it("filters samples by supported date ranges", () => {
    const now = new Date("2026-08-18T12:00:00.000Z");
    const samples = [
      { ...sample, startedAt: "2026-08-18T10:00:00.000Z" },
      { ...sample, startedAt: "2026-08-10T10:00:00.000Z" },
      { ...sample, startedAt: "2026-01-10T10:00:00.000Z" },
    ];
    expect(filterLocalAIInferenceSamples(samples, "today", now)).toHaveLength(1);
    expect(filterLocalAIInferenceSamples(samples, "7d", now)).toHaveLength(1);
    expect(filterLocalAIInferenceSamples(samples, "30d", now)).toHaveLength(2);
    expect(filterLocalAIInferenceSamples(samples, "qtd", now)).toHaveLength(3);
    expect(filterLocalAIInferenceSamples(samples, "all", now)).toHaveLength(3);
  });

  it("escapes commas, quotes, and line breaks", () => {
    const csv = localAIInferenceSamplesToCsv([{ ...sample, modelId: 'qwen, "test"\nmodel' }]);
    expect(csv).toContain('"qwen, ""test""\nmodel"');
  });
});
