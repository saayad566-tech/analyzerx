import { describe, expect, it } from "vitest";
import { runProvidersInParallel } from "../server/parallel-providers";

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("parallel provider runner", () => {
  it("runs independent providers concurrently", async () => {
    const started = Date.now();
    const results = await runProvidersInParallel([
      { id: "slow-a", tier: "secondary", enabled: true, run: async () => { await delay(80); return "a"; } },
      { id: "slow-b", tier: "web-fallback", enabled: true, run: async () => { await delay(80); return "b"; } },
    ]);
    expect(Date.now() - started).toBeLessThan(145);
    expect(results.map((item) => item.value)).toEqual(["a", "b"]);
    expect(results.every((item) => item.status === "used")).toBe(true);
  });

  it("skips a provider with an open circuit while healthy providers still run", async () => {
    const { markProviderRejected, resetProviderHealthForTests } = await import("../server/provider-health");
    resetProviderHealthForTests();
    markProviderRejected("cooling-provider", new Error("HTTP 429 rate limit"));
    markProviderRejected("cooling-provider", new Error("HTTP 429 rate limit"));
    markProviderRejected("cooling-provider", new Error("HTTP 429 rate limit"));
    const results = await runProvidersInParallel([
      { id: "cooling-provider", tier: "secondary", enabled: true, run: async () => "must-not-run" },
      { id: "healthy-provider", tier: "primary", enabled: true, run: async () => "runs" },
    ]);
    expect(results[0]?.status).toBe("circuit-open");
    expect(results[1]?.value).toBe("runs");
  });

  it("isolates failures, timeouts, and disabled providers", async () => {
    const results = await runProvidersInParallel([
      { id: "ok", tier: "primary", enabled: true, run: async () => "ok" },
      { id: "failed", tier: "secondary", enabled: true, run: async () => { throw new Error("upstream unavailable"); } },
      { id: "disabled", tier: "web-fallback", enabled: false, run: async () => "never" },
      { id: "timeout", tier: "web-fallback", enabled: true, run: async () => { await delay(50); return "late"; } },
    ], 10);
    expect(results.map((item) => item.status)).toEqual(["used", "failed", "not-configured", "failed"]);
    expect(results[1]?.error).toContain("upstream unavailable");
    expect(results[3]?.error).toContain("timed out");
  });
});
