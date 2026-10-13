import { describe, expect, it } from "vitest";

import { SECTOR_REGISTRY, UNSUPPORTED_SECTORS, normalizeSectorKey, resolveSector, supportedSectorNames } from "../lib/sector-registry";
import { SECTOR_SCORE_VERSION, SECTOR_SCORE_WEIGHTS, computeSectorScore } from "../lib/sector-score";

describe("sector registry (FIX 05)", () => {
  it("resolves every registry entry to its own verified index", () => {
    for (const entry of SECTOR_REGISTRY) {
      const resolution = resolveSector(entry.displayName);
      expect(resolution.status).toBe("supported");
      if (resolution.status === "supported") expect(resolution.indexKey).toBe(entry.indexKey);
    }
  });

  it("never invents an index for a theme without an official one", () => {
    // This is the exact case that produced "Unknown NSE index: NIFTYRENEWABLEENERGY".
    const resolution = resolveSector("Renewable Energy");
    expect(resolution.status).toBe("unsupported");
    if (resolution.status === "unsupported") {
      expect(resolution.reason).toMatch(/renewable/i);
      expect(resolution.reason).not.toMatch(/SourceError|Unknown NSE index/);
    }
  });

  it("resolves aliases and case/format variations", () => {
    for (const input of ["banks", "BANKING", " Nifty Bank ", "niftybank"]) {
      expect(resolveSector(input).status).toBe("supported");
    }
    expect(normalizeSectorKey("Nifty  Financial Services")).toBe("financial services");
    expect(normalizeSectorKey("NIFTYIT")).toBe("it");
  });

  it("returns a structured unsupported result for unknown and empty input", () => {
    const unknown = resolveSector("Interstellar Mining");
    expect(unknown.status).toBe("unsupported");
    if (unknown.status === "unsupported") expect(unknown.reason).toContain("No verified NSE index");
    expect(resolveSector("").status).toBe("unsupported");
    expect(resolveSector("   ").status).toBe("unsupported");
  });

  it("keeps unsupported themes out of the supported name list", () => {
    const names = supportedSectorNames();
    for (const entry of UNSUPPORTED_SECTORS) expect(names).not.toContain(entry.displayName);
    expect(names.length).toBe(SECTOR_REGISTRY.length);
  });

  it("never throws for arbitrary input", () => {
    for (const input of ["", " ", "!!!", "nifty", "renewable", "🚀", "NIFTYRENEWABLEENERGY"]) {
      expect(() => resolveSector(input)).not.toThrow();
    }
  });
});

describe("deterministic sector score (FIX 05)", () => {
  const full = { sectorId: "renewable-energy", components: { buying: 92, institutional: 61, eventMomentum: 74, catalyst: 50 } };

  it("is deterministic for identical inputs and version", () => {
    const a = computeSectorScore({ ...full, computedAt: "2026-10-12T00:00:00.000Z" });
    const b = computeSectorScore({ ...full, computedAt: "2026-10-12T00:00:00.000Z" });
    expect(a).toEqual(b);
    expect(a.version).toBe(SECTOR_SCORE_VERSION);
  });

  it("weights sum to 1 and the score is the weighted mean", () => {
    const total = Object.values(SECTOR_SCORE_WEIGHTS).reduce((acc, value) => acc + value, 0);
    expect(Math.round(total * 100)).toBe(100);
    const result = computeSectorScore(full);
    const expected = (92 * 0.4 + 61 * 0.3 + 74 * 0.2 + 50 * 0.1) / 1;
    expect(result.score).toBeCloseTo(expected, 1);
    expect(result.label).toBe("Research score");
  });

  it("returns Unavailable rather than a fabricated default when nothing is available", () => {
    const result = computeSectorScore({ sectorId: "x", components: { buying: null, institutional: null, eventMomentum: null, catalyst: null } });
    expect(result.score).toBeNull();
    expect(result.label).toBe("Unavailable");
    expect(result.coverage).toBe(0);
  });

  it("renormalises over available components and labels partial coverage provisional", () => {
    const result = computeSectorScore({ sectorId: "x", components: { buying: 80, institutional: null, eventMomentum: null, catalyst: null } });
    expect(result.score).toBe(80);
    expect(result.coverage).toBeCloseTo(0.4, 4);
    expect(result.label).toBe("Provisional research score");
    expect(result.missing).toContain("institutional");
  });

  it("never labels the output institutional buying strength", () => {
    const result = computeSectorScore(full);
    expect(result.label).not.toMatch(/institutional/i);
    expect(result.limitations.join(" ")).toMatch(/not institutional buying strength/i);
  });

  it("clamps out-of-range and ignores non-finite inputs", () => {
    const result = computeSectorScore({ sectorId: "x", components: { buying: 250, institutional: -40, eventMomentum: Number.NaN, catalyst: Number.POSITIVE_INFINITY } });
    expect(result.contributions.find((c) => c.key === "buying")!.value).toBe(100);
    expect(result.contributions.find((c) => c.key === "institutional")!.value).toBe(0);
    expect(result.contributions.find((c) => c.key === "eventMomentum")!.value).toBeNull();
    expect(result.contributions.find((c) => c.key === "catalyst")!.value).toBeNull();
  });
});
