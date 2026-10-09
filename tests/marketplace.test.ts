import { describe, expect, it } from "vitest";
import { MARKETPLACE_TOOLS, assessMarketplaceTool, recommendMarketplaceTools } from "../lib/marketplace";
const androidProfile = {
  platform: "android-arm64",
  os: "android",
  architecture: "arm64-v8a",
  cpuModel: "Test Android ARM64",
  cpuCores: 8,
  totalMemoryBytes: 8_000_000_000,
  freeStorageBytes: 12_000_000_000,
  backend: "cpu",
  gpuName: null,
  vramBytes: null,
  driverVersion: null,
  hostConnected: false,
  capturedAt: "2026-08-18T00:00:00.000Z",
} as const;

describe("finance marketplace", () => {
  it("contains only stock-market intelligence tools", () => {
    expect(MARKETPLACE_TOOLS.length).toBeGreaterThanOrEqual(8);
    expect(MARKETPLACE_TOOLS.every((tool) => ["data", "research", "analysis", "portfolio", "news", "reports", "assistant", "operations"].includes(tool.category))).toBe(true);
    expect(MARKETPLACE_TOOLS.some((tool) => /music|video studio|image studio|creator/i.test(tool.name))).toBe(false);
  });

  it("recommends Android-specific tools for an arm64 phone", () => {
    const recommendations = recommendMarketplaceTools(androidProfile);
    expect(recommendations.some((item) => item.tool.id === "android-market-data-sync")).toBe(true);
    expect(recommendations.some((item) => item.tool.id === "android-technical-analysis")).toBe(true);
    expect(recommendations.some((item) => item.tool.id === "android-report-reader")).toBe(true);
  });

  it("keeps local model re-ranking separate from source retrieval", () => {
    const tool = MARKETPLACE_TOOLS.find((item) => item.id === "android-local-sentiment");
    expect(tool?.safetyNote.toLowerCase()).toContain("source retrieval");
    expect(tool && assessMarketplaceTool(tool, androidProfile).status).toBe("reduced");
  });
});
