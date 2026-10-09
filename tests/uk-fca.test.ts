import { describe, expect, it } from "vitest";
import { parseFcaDisclosures, resolveFcaIssuer } from "../server/uk-fca";

describe("UK FCA NSM adapter", () => {
  const fixture = { disclosures: [{ id: "nsm-001", issuerName: "Example plc", issuerLei: "549300EXAMPLE00000000", headline: "Full year results", category: "Financial reports", filedAt: "2026-08-18T10:30:00Z", documentUrl: "https://data.fca.org.uk/artefacts/nsm-001.json", relatedIssuers: ["Example plc"], isCorrection: false }] };

  it("parses the validated disclosure fixture", () => {
    expect(parseFcaDisclosures(fixture)[0]).toMatchObject({ id: "nsm-001", headline: "Full year results", category: "Financial reports", documentUrl: "https://data.fca.org.uk/artefacts/nsm-001.json" });
  });

  it("resolves only exact symbol, name, LEI, or ISIN matches", () => {
    const issuers = [{ symbol: "EXM.L", name: "Example plc", lei: "549300EXAMPLE00000000", isin: "GB00EXAMPLE01" }];
    expect(resolveFcaIssuer(issuers, "EXM.L")?.name).toBe("Example plc");
    expect(resolveFcaIssuer(issuers, "549300EXAMPLE00000000")?.symbol).toBe("EXM.L");
    expect(resolveFcaIssuer(issuers, "EXM")).toBeNull();
  });

  it("rejects malformed disclosures instead of inventing missing fields", () => {
    expect(() => parseFcaDisclosures({ disclosures: [{ id: "bad" }] })).toThrow(/schema mismatch/);
  });
});
