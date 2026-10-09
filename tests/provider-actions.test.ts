import { describe, expect, it } from "vitest";
import { runProviderNow } from "../server/provider-actions";
import { markProviderRejected, resetProviderHealthForTests } from "../server/provider-health";

describe("provider manual actions", () => {
  it("returns a truthful unsupported result for providers without an app adapter", async () => {
    const result = await runProviderNow("firecrawl", "RELIANCE");
    expect(result.status).toBe("unsupported");
    expect(result.records).toBe(0);
    expect(result.summary).toContain("No app-runtime adapter");
  });

  it("refuses a manual run while the provider circuit is cooling down", async () => {
    resetProviderHealthForTests();
    markProviderRejected("gnews", new Error("HTTP 429 rate limit"));
    markProviderRejected("gnews", new Error("HTTP 429 rate limit"));
    markProviderRejected("gnews", new Error("HTTP 429 rate limit"));
    await expect(runProviderNow("gnews", "RELIANCE")).rejects.toThrow("cooling down");
  });
});
