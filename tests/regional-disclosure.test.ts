import { describe, expect, it } from "vitest";
import { getRegionalDisclosureConfig, parseRegionalDisclosures, resolveRegionalIssuer } from "../server/regional-disclosure-collector";

describe("regional disclosure collectors", () => {
  it("registers a strict adapter contract for each requested market", () => {
    for (const marketId of ["CA", "AU", "JP", "SG", "HK", "DE", "FR"] as const) expect(getRegionalDisclosureConfig(marketId)?.sourceKey).toBeTruthy();
  });

  it("resolves only exact issuer identifiers", () => {
    const issuer = { symbol: "SHOP.TO", name: "Shopify Inc.", isin: "CA82509L1076" };
    expect(resolveRegionalIssuer([issuer], "SHOP.TO")).toEqual(issuer);
    expect(resolveRegionalIssuer([issuer], "CA82509L1076")).toEqual(issuer);
    expect(resolveRegionalIssuer([issuer], "SHOP")).toBeNull();
  });

  it("parses the common validated disclosure envelope", () => {
    const result = parseRegionalDisclosures({ disclosures: [{ id: "a1", issuerName: "Example plc", issuerSymbol: "EXM.L", headline: "Annual results", filedAt: "2026-08-18T10:00:00Z", documentUrl: "https://example.test/filing.pdf", language: "en" }] }, "GB");
    expect(result[0]).toMatchObject({ id: "a1", issuerName: "Example plc", headline: "Annual results", documentUrl: "https://example.test/filing.pdf" });
    expect(result[0].filedAt).toBe("2026-08-18T10:00:00.000Z");
  });

  it("rejects malformed or non-HTTP disclosure documents", () => {
    expect(() => parseRegionalDisclosures({ disclosures: [{ id: "bad", issuerName: "Example", headline: "Broken", filedAt: "not-a-date", documentUrl: "file:///tmp/x" }] }, "CA")).toThrow(/schema mismatch/);
    expect(() => parseRegionalDisclosures({}, "FR")).toThrow(/disclosures array missing/);
  });
});
