import { describe, expect, it } from "vitest";
import { getRuntimeHealth } from "../server/runtime-health";

describe("runtime health contract", () => {
  it("reports only safe readiness summaries and feature flags", () => {
    const health = getRuntimeHealth();

    expect(health.contractVersion).toBe(1);
    expect(new Date(health.checkedAt).toString()).not.toBe("Invalid Date");
    expect(health.api.status).toBe("ready");
    expect(["ready", "unavailable"]).toContain(health.services.database.status);
    expect(["ready", "unavailable"]).toContain(health.services.llm.status);
    expect(["ready", "unavailable"]).toContain(health.services.providers.status);
    expect(["ready", "unavailable"]).toContain(health.services.collectors.status);
    expect(health.services.providers.enabled).toBeGreaterThanOrEqual(
      health.services.providers.configured,
    );
    expect(typeof health.featureFlags.nativeLocalAI).toBe("boolean");
    expect(JSON.stringify(health)).not.toMatch(/API_KEY|TOKEN|SECRET|Bearer/i);
  });
});
