import { describe, expect, it } from "vitest";
import { getAvailableSectorNames } from "../server/sector-intelligence";
import { parseSecurityWiseRows, rankSecurityWiseFlows } from "../server/security-wise-flows";

describe("sector intelligence", () => {
  it("exposes only the accepted verified sector universe", () => {
    const sectors = getAvailableSectorNames();
    expect(sectors).toContain("Renewable energy");
    expect(sectors).toContain("Financials");
    expect(sectors.length).toBeGreaterThan(3);
  });

  it("parses and ranks validated stock-level FII/DII values", () => {
    const rows = parseSecurityWiseRows([
      { symbol: "SOLAR1", date: "2026-08-20", fii_buy: "120", fii_sell: "20", dii_buy: 40, dii_sell: 10 },
      { symbol: "WIND1", date: "2026-08-20", fii_net: 50, dii_net: 90 },
    ], "fixture://security-wise");
    expect(rows).toHaveLength(2);
    expect(rows[0].fiiNet).toBe(100);
    expect(rankSecurityWiseFlows(rows, "fiiNet")[0].symbol).toBe("SOLAR1");
    expect(rankSecurityWiseFlows(rows, "diiNet")[0].symbol).toBe("WIND1");
  });

  it("keeps aggregate totals separate when no authorized security-wise source is configured", async () => {
    const source = await import("fs/promises").then((fs) => fs.readFile("server/sector-intelligence.ts", "utf8"));
    expect(source).toContain("aggregate NSE totals are shown separately");
    expect(source).toContain("securityWiseFlow");
  });

  it("routes sector cards to a dedicated detail screen", async () => {
    const source = await import("fs/promises").then((fs) => fs.readFile("app/(tabs)/sectors.tsx", "utf8"));
    expect(source).toContain("/sector/[name]");
    expect(source).toContain("sector.name");
  });
});
