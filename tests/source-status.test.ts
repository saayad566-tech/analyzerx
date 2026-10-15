import { describe, expect, it } from "vitest";

import { calculateCoverage, deriveSourceStatus, fallbackMayPromote } from "../lib/source-status";

const NOW = Date.parse("2026-10-13T12:00:00Z");

describe("source status model (master mandate Phase 6)", () => {
  it("reports Not Implemented when no adapter exists", () => {
    const result = deriveSourceStatus({ adapterExists: false, now: NOW });
    expect(result.status).toBe("not-implemented");
    expect(result.canClaimCovered).toBe(false);
  });

  it("reports Requires User Action ahead of other causes", () => {
    const result = deriveSourceStatus({ adapterExists: true, requiresUserAction: true, lastSuccessAt: "2026-10-13T11:00:00Z", now: NOW });
    expect(result.status).toBe("requires-user-action");
  });

  it("reports Not Configured when a credential is missing", () => {
    const result = deriveSourceStatus({ adapterExists: true, requiresCredential: true, credentialPresent: false, now: NOW });
    expect(result.status).toBe("not-configured");
    expect(result.canClaimCovered).toBe(false);
  });

  it("reports Blocked with the documented reason", () => {
    const result = deriveSourceStatus({ adapterExists: true, blockedReason: "Terms of service prohibit redistribution.", now: NOW });
    expect(result.status).toBe("blocked");
    expect(result.reason).toMatch(/terms of service/i);
  });

  it("reports Unavailable when nothing has ever succeeded", () => {
    expect(deriveSourceStatus({ adapterExists: true, lastSuccessAt: null, now: NOW }).status).toBe("unavailable");
    expect(deriveSourceStatus({ adapterExists: true, lastSuccessAt: null, lastError: "HTTP 503", now: NOW }).reason).toMatch(/503/);
  });

  it("reports Partially Covered for stale data and for incomplete fields", () => {
    const stale = deriveSourceStatus({ adapterExists: true, lastSuccessAt: "2026-09-01T00:00:00Z", now: NOW });
    expect(stale.status).toBe("partially-covered");

    const incomplete = deriveSourceStatus({ adapterExists: true, lastSuccessAt: "2026-10-13T11:00:00Z", requiredFields: 10, validatedFields: 6, now: NOW });
    expect(incomplete.status).toBe("partially-covered");
    expect(incomplete.fieldCoverage).toBeCloseTo(0.6, 4);
  });

  it("reports Operational only with recent, complete, validated data", () => {
    const result = deriveSourceStatus({ adapterExists: true, lastSuccessAt: "2026-10-13T11:00:00Z", requiredFields: 5, validatedFields: 5, now: NOW });
    expect(result.status).toBe("operational");
    expect(result.canClaimCovered).toBe(true);
  });

  it("never claims Covered for reachable-but-unvalidated states", () => {
    const cases = [
      { adapterExists: false },
      { adapterExists: true, requiresCredential: true, credentialPresent: false },
      { adapterExists: true, blockedReason: "legal" },
      { adapterExists: true, lastSuccessAt: null },
      { adapterExists: true, lastSuccessAt: "2026-01-01T00:00:00Z" },
      { adapterExists: true, lastSuccessAt: "2026-10-13T11:00:00Z", requiredFields: 4, validatedFields: 1 },
    ];
    for (const input of cases) {
      const result = deriveSourceStatus({ ...input, now: NOW });
      expect(result.canClaimCovered).toBe(false);
      expect(result.label).not.toBe("Operational");
    }
  });

  it("treats an invalid last-success timestamp as unavailable", () => {
    expect(deriveSourceStatus({ adapterExists: true, lastSuccessAt: "not-a-date", now: NOW }).status).toBe("unavailable");
  });
});

describe("fallback promotion and coverage (mandate §8/§9)", () => {
  it("only promotes a fallback that returned validated, relevant data", () => {
    expect(fallbackMayPromote({ returnedValidatedData: true, relevantToCategory: true })).toBe(true);
    expect(fallbackMayPromote({ returnedValidatedData: false, relevantToCategory: true })).toBe(false);
    expect(fallbackMayPromote({ returnedValidatedData: true, relevantToCategory: false })).toBe(false);
  });

  it("states the denominator rather than assuming 100% coverage", () => {
    const result = calculateCoverage({ requiredItems: 40, validatedItems: 10 });
    expect(result.coverage).toBeCloseTo(0.25, 4);
    expect(result.denominator).toMatch(/40 required/);
    expect(calculateCoverage({ requiredItems: 0, validatedItems: 0 }).coverage).toBeNull();
  });

  it("never exceeds 1 or drops below 0", () => {
    expect(calculateCoverage({ requiredItems: 10, validatedItems: 99 }).coverage).toBe(1);
    expect(calculateCoverage({ requiredItems: 10, validatedItems: -5 }).coverage).toBe(0);
  });
});
