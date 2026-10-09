import { describe, expect, it } from "vitest";
import { getProviderHealthFor, markProviderHealthy, markProviderRejected, markProviderUnavailable } from "../server/provider-health";

describe("provider health telemetry", () => {
  it("records latency and last successful response", () => {
    markProviderHealthy("test-provider", 42);
    const health = getProviderHealthFor("test-provider");
    expect(health?.status).toBe("healthy");
    expect(health?.latencyMs).toBe(42);
    expect(health?.lastSuccessAt).toBeTruthy();
    expect(health?.lastCheckedAt).toBeTruthy();
    expect(health?.lastError).toBeNull();
  });

  it("retains the last success when a later request is rejected", () => {
    markProviderHealthy("test-provider-retained", 18);
    const first = getProviderHealthFor("test-provider-retained")?.lastSuccessAt;
    markProviderRejected("test-provider-retained", new Error("HTTP 402"), 210);
    const health = getProviderHealthFor("test-provider-retained");
    expect(health?.status).toBe("rejected");
    expect(health?.latencyMs).toBe(210);
    expect(health?.lastSuccessAt).toBe(first);
    expect(health?.lastError).toContain("HTTP 402");
  });

  it("records disabled providers as unavailable without inventing a success", () => {
    markProviderUnavailable("test-provider-disabled", "Not configured");
    const health = getProviderHealthFor("test-provider-disabled");
    expect(health?.status).toBe("unavailable");
    expect(health?.lastSuccessAt).toBeNull();
    expect(health?.lastError).toContain("Not configured");
  });

  it("opens a circuit after repeated rate limits and redacts secrets in the payload preview", () => {
    markProviderHealthy("test-provider-circuit", 12, { data: [{ value: 1 }], apiKey: "do-not-display" });
    markProviderRejected("test-provider-circuit", new Error("HTTP 429 rate limit"), 20);
    markProviderRejected("test-provider-circuit", new Error("HTTP 429 rate limit"), 20);
    markProviderRejected("test-provider-circuit", new Error("HTTP 429 rate limit"), 20);
    const health = getProviderHealthFor("test-provider-circuit");
    expect(health?.circuitState).toBe("open");
    expect(health?.failureClass).toBe("rate-limit");
    expect(health?.cooldownUntil).toBeTruthy();
    expect(health?.lastPayloadPreview).toContain("[redacted]");
    expect(health?.lastPayloadPreview).not.toContain("do-not-display");
  });
});
