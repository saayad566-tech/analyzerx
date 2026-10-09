import { describe, expect, it } from "vitest";
import { getDataCapabilities, getDataCapabilityMatrix, lineageFromSourceRecord } from "../server/data-capability-registry";

describe("data capability registry", () => {
  it("maps imported datasets to intelligence and user-facing screens", () => {
    const capabilities = getDataCapabilities();
    const announcements = capabilities.find((item) => item.datasetKey === "nse-announcements");
    expect(announcements).toBeDefined();
    expect(announcements?.intelligenceConsumers).toContain("event-intelligence");
    expect(announcements?.uiScreens).toContain("Stock Profile");
    expect(announcements?.routeQuery).toBe("sources.latest");
  });

  it("produces the required imported/stored/intelligence/UI matrix", () => {
    const row = getDataCapabilityMatrix().find((item) => item.dataset === "nse-fii-dii");
    expect(row).toMatchObject({
      imported: true,
      stored: true,
      intelligenceUsed: true,
      uiDisplayed: true,
      feature: "flow",
    });
  });

  it("preserves source lineage and truthful freshness/evidence states", () => {
    const lineage = lineageFromSourceRecord({
      id: "record-1",
      sourceKey: "nse-announcements-rss",
      sourceUrl: "https://example.com/announcement",
      publishedAt: "2026-08-18T10:00:00.000Z",
      retrievedAt: "2026-08-18T10:01:00.000Z",
      freshnessStatus: "fresh",
      dataHash: "sha256",
      parserVersion: "nse-rss-v1",
      normalizedPayload: "{}",
      title: "Order announcement",
    });
    expect(lineage.sourceId).toBe("record-1");
    expect(lineage.sourceName).toContain("NSE");
    expect(lineage.evidenceStatus).toBe("verified");
    expect(lineage.evidenceKind).toBe("reported");
  });
});
