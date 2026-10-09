import { describe, expect, it } from "vitest";
import { getOfficialFilingLinks } from "../server/advanced-research";
import { mergeRecentSearches } from "../lib/local-preferences";

describe("benchmark-driven research features", () => {
  it("returns only official filing entry points with provenance notes", () => {
    const result = getOfficialFilingLinks("reliance");
    expect(result.symbol).toBe("RELIANCE");
    expect(result.links.length).toBeGreaterThanOrEqual(5);
    expect(result.links.every((link) => link.url.startsWith("https://"))).toBe(true);
    expect(result.note).toContain("official");
  });

  it("keeps the research queue deduplicated and newest-first", () => {
    expect(mergeRecentSearches("TCS", ["RELIANCE", "TCS", "INFY"])).toEqual(["TCS", "RELIANCE", "INFY"]);
  });
});
