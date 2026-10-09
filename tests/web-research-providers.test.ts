import { describe, expect, it } from "vitest";
import { getProviderRegistry } from "../server/provider-registry";

describe("optional web-research providers", () => {
  it("keeps Firecrawl connector validation separate from live app ingestion", () => {
    const provider = getProviderRegistry().find((item) => item.id === "firecrawl");
    expect(provider?.domain).toBe("web-research");
    expect(provider?.status).toBe("connector_validated");
    expect(provider?.enabled).toBe(false);
    expect(provider?.notes.toLowerCase()).toContain("server-side app ingestion");
  });

  it("does not treat TinyFish as live after the known 403 credential state", () => {
    const provider = getProviderRegistry().find((item) => item.id === "tinyfish");
    expect(provider?.domain).toBe("web-research");
    expect(["configured", "needs_secret", "rejected"].includes(provider?.status ?? "")).toBe(true);
    expect(provider?.enabled).toBe(false);
  });
});
