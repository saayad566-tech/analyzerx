import { describe, expect, it } from "vitest";
import { buildEntity } from "../server/entities";

describe("entity master", () => {
  it("builds a bounded canonical entity with exact aliases and lineage fields", () => {
    const entity = buildEntity("lt", { aliases: ["L&T", "Larsen and Toubro"], sourceUrl: "https://www.nseindia.com/", sourceRecordId: "record-1" });
    expect(entity.canonicalSymbol).toBe("LT");
    expect(entity.entityType).toBe("company");
    expect(JSON.parse(entity.aliasesJson)).toContain("LT");
    expect(entity.sourceRecordId).toBe("record-1");
    expect(entity.confidenceScore).toBeGreaterThanOrEqual(0);
    expect(entity.confidenceScore).toBeLessThanOrEqual(100);
  });

  it("does not silently merge unknown symbols", () => {
    const entity = buildEntity("unknown-company");
    expect(entity.resolutionStatus).toBe("unresolved");
    expect(entity.canonicalSymbol).toBe("UNKNOWN-COMPANY");
    expect(entity.confidenceScore).toBe(20);
  });
});
