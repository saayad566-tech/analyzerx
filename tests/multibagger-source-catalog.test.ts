import { describe, expect, it } from "vitest";
import { getSourceCatalog } from "../server/source-catalog";

describe("multibagger enrichment source catalog", () => {
  it("keeps official public sources explicit and bounded", () => {
    const catalog = getSourceCatalog();
    const keys = catalog.map((source) => source.key);
    expect(keys).toEqual(expect.arrayContaining(["sec-company-facts", "sebi-filings", "amfi-portfolio-disclosure", "amfi-research", "nsdl-fpi-sector"]));
    const sec = catalog.find((source) => source.key === "sec-company-facts");
    expect(sec?.requiresAuthorization).toBe(false);
    expect(sec?.directMachineReadable).toBe(true);
    const amfi = catalog.find((source) => source.key === "amfi-portfolio-disclosure");
    expect(amfi?.notes).toContain("not interpret it as real-time");
  });
});
