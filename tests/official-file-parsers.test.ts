import { describe, expect, it } from "vitest";
import { parseAmfiPortfolioCsv, parseNseInstitutionalCsv, parseNsdlSectorHtml } from "../server/official-file-parsers";
import { extractFilingEvidence } from "../server/filing-evidence";

describe("official file parsers", () => {
  it("parses an NSE institutional CSV only when required columns exist", () => {
    const result = parseNseInstitutionalCsv("Participant,Buy Value,Sell Value,Net Value\nFII/FPI,100,60,40\nDII,80,50,30", "https://www.nseindia.com/reports/fii-dii", "2026-08-18");
    expect(result.status).toBe("parsed");
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].netValue).toBe(40);
  });

  it("rejects an NSE schema that cannot prove participant and buy/sell fields", () => {
    const result = parseNseInstitutionalCsv("foo,bar\na,b", "https://www.nseindia.com/reports/fii-dii");
    expect(result.status).toBe("schema-mismatch");
    expect(result.rows).toHaveLength(0);
  });

  it("parses NSDL sector rows with period and AUC context", () => {
    const html = `<table><tr><th>Sr. No.</th><th>Sectors</th><th>AUC as on prior</th><th>Net Investment</th><th>AUC current</th></tr><tr><td>1</td><td>Power</td><td>1000</td><td>25</td><td>1025</td></tr></table>`;
    const result = parseNsdlSectorHtml(html, "https://www.fpi.nsdl.co.in/web/StaticReports/example.html", "2026-07-31", "JUL 31, 2026");
    expect(result.status).toBe("parsed");
    expect(result.rows[0]).toMatchObject({ sector: "Power", aucPreviousInrCr: 1000, netInvestmentPeriodInrCr: 25, aucCurrentInrCr: 1025, reportDate: "2026-07-31" });
  });

  it("parses AMFI portfolio rows and keeps disclosure cadence explicit", () => {
    const result = parseAmfiPortfolioCsv("Scheme,Security,ISIN,Units,Market Value,Weight %\nFund A,Company X,INE000A01000,100,250000,2.5", "https://www.amfiindia.com/online-center/portfolio-disclosure", "monthly", "2026-07");
    expect(result.status).toBe("parsed");
    expect(result.rows[0]).toMatchObject({ scheme: "Fund A", security: "Company X", marketValueInr: 250000, weightPct: 2.5, disclosureType: "monthly" });
  });
});

describe("filing evidence", () => {
  it("extracts only source-backed passages and otherwise remains unavailable", () => {
    const evidence = extractFilingEvidence({ sourceText: "Management guidance expects revenue growth of 15% and the top three customers represent 42% of sales. The addressable market is estimated at INR 1,000 crore.", sourceUrl: "https://example.com/filing", period: "FY2026" });
    expect(evidence.managementGuidance.status).toBe("partial");
    expect(evidence.customerConcentration.status).toBe("partial");
    expect(evidence.tam.status).toBe("partial");
    expect(extractFilingEvidence({}).tam.status).toBe("unavailable");
  });
});
