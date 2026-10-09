import { describe, expect, it } from "vitest";
import { isValidatedMachineReadableFiling, parseBseFiling, parseCompanyIrFiling } from "../server/filing-adapters";

describe("ownership and graph contracts", () => {
  it("requires authenticated ownership routes in the router source", async () => {
    const source = await import("fs/promises").then((fs) => fs.readFile("server/routers.ts", "utf8"));
    expect(source).toContain("account: router");
    expect(source).toContain("pushTokenRevoke: protectedProcedure");
    expect(source).toContain("savedResearchRevoke: protectedProcedure");
  });

  it("keeps unresolved BSE and IR page snapshots out of verified machine-readable evidence", () => {
    const record = { id: "bse-page", sourceKey: "bse-public-info", sourceUrl: "https://www.bseindia.com/corporates/ann", recordType: "official-source-page", title: null, documentName: "BSE Public Information", normalizedPayload: JSON.stringify({ tables: [] }), freshnessStatus: "fresh", parserVersion: "official-page-v1", retrievedAt: new Date(), publishedAt: null, reportDate: null } as any;
    expect(isValidatedMachineReadableFiling(record)).toBe(false);
    expect(parseBseFiling(record)).not.toBeNull();
    expect(parseCompanyIrFiling(record)).toBeNull();
  });

  it("exposes Account sync controls and Graph filtering contracts", async () => {
    const account = await import("fs/promises").then((fs) => fs.readFile("app/account.tsx", "utf8"));
    const graph = await import("fs/promises").then((fs) => fs.readFile("app/(tabs)/graph.tsx", "utf8"));
    expect(account).toContain("Retry sync");
    expect(account).toContain("resolveWorkspaceSyncConflict");
    expect(graph).toContain("Only conflicts");
    expect(graph).toContain("minimumSources");
  });

  it("exposes contradiction and multi-source edge clustering in the graph contract", async () => {
    const source = await import("fs/promises").then((fs) => fs.readFile("server/graph-projections.ts", "utf8"));
    expect(source).toContain('contradiction: "none" | "mixed-direction" | "conflicting-sources"');
    expect(source).toContain("sourceCount");
    expect(source).toContain("clusterKey");
    expect(source).toContain('cluster.directions.has("positive") && cluster.directions.has("negative")');
  });

  it("accepts a dated validated IR record only when it has structured payload evidence", () => {
    const record = { id: "ir-1", sourceKey: "company-ir", sourceUrl: "https://issuer.example/investor-relations/news.json", recordType: "corporate-announcement", title: "Capacity update", documentName: "IR JSON", normalizedPayload: JSON.stringify({ title: "Capacity update", publishedAt: "2026-08-18T00:00:00Z", summary: "Expansion" }), freshnessStatus: "fresh", parserVersion: "company-ir-json-v1", retrievedAt: new Date(), publishedAt: new Date("2026-08-18T00:00:00Z"), reportDate: null } as any;
    expect(isValidatedMachineReadableFiling(record)).toBe(true);
    expect(parseCompanyIrFiling(record)?.evidenceStatus).toBe("verified");
  });
});
