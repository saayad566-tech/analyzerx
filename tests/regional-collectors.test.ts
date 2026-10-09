import { describe, expect, it } from "vitest";
import { getRegionalCollectorRegistry, runRegionalCollector } from "../server/regional-collectors";

describe("regional collectors", () => {
  it("registers all configured markets and exposes SEC as the first runnable collector", () => {
    const registry = getRegionalCollectorRegistry();
    expect(registry).toHaveLength(10);
    expect(registry.find((item) => item.marketId === "US")).toMatchObject({ state: "catalog-validated", sourceKeys: ["sec-edgar-tickers", "sec-edgar-submissions", "sec-company-facts"] });
    expect(registry.find((item) => item.marketId === "JP")?.blockedScope).toContain("quotes");
  });

  it("requires a symbol for SEC collection instead of running an unbounded sweep", async () => {
    await expect(runRegionalCollector("US")).resolves.toMatchObject({ status: "needs-symbol" });
  });

  it("does not claim runtime collection for catalog-only markets", async () => {
    await expect(runRegionalCollector("GB", "SHEL.L")).resolves.toMatchObject({ marketId: "GB", status: "catalog-validated" });
  });
});
