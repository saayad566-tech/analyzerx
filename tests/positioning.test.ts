import { describe, expect, it, vi } from "vitest";

vi.mock("../server/nse-flows", () => ({
  fetchNseInstitutionalFlows: vi.fn(async () => ({ available: true, source: "NSE", reportDate: "2026-08-17", freshness: "fresh", rows: [] })),
}));

import { getPositioningCoverage } from "../server/positioning";

describe("positioning coverage", () => {
  it("does not convert aggregate flows into a stock-level whale claim", async () => {
    const result = await getPositioningCoverage("reliance", "IN");
    expect(result.symbol).toBe("RELIANCE");
    expect(result.securityLevelAvailable).toBe(false);
    expect(result.evidence.stockLevel).toBeNull();
    expect(result.missingInputs.length).toBeGreaterThan(0);
    expect(result.explanation).toContain("do not prove");
  });
});
