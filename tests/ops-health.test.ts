import { describe, expect, it } from "vitest";
import { getProviderRegistry } from "../server/provider-registry";
import { getProviderHealth, markProviderRejected } from "../server/provider-health";

describe("operations health contracts", () => {
  it("reports the Dhan option-chain capability as read-only and credential-gated", () => {
    const dhan = getProviderRegistry().find((provider) => provider.id === "dhan-mcp");
    expect(dhan?.enabled).toBe(true);
    expect(["configured", "needs_secret"]).toContain(dhan?.status);
    expect(dhan?.notes).toContain("Read-only DhanHQ option-chain adapter");
    expect(dhan?.notes).toContain("no order or trading route is enabled");
  });

  it("keeps a rejected provider enabled for isolated retry while exposing runtime failure telemetry", () => {
    markProviderRejected("gnews", new Error("Provider returned HTTP 403"));
    const gnews = getProviderRegistry().find((provider) => provider.id === "gnews");
    expect(gnews?.enabled).toBe(true);
    expect(gnews?.runtimeStatus).toBe("rejected");
    expect(gnews?.notes).toContain("HTTP 403");
    expect(gnews?.notes).toContain("remains enabled");
    expect(getProviderHealth().find((item) => item.id === "gnews")?.lastError).toContain("403");
  });
});
