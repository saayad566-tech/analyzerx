import { describe, expect, it } from "vitest";
import { buildInstitutionalReportModules } from "../server/institutional-report-modules";
import type { FundamentalAnalysis } from "../server/fundamental-analysis";
import type { ExtractedNews } from "../server/news-tracker";
import { INSTITUTIONAL_REPORT_SYSTEM_PROMPT, INSTITUTIONAL_REPORT_PROMPT_VERSION } from "../server/institutional-report-prompt";

const report = { companyName: "Adani Enterprises Ltd", requestedSymbol: "ADANIENT", resolvedSymbol: "ADANIENT", asOf: "2026-08-21T00:00:00.000Z", stockAnalysis: { profile: { sector: "Diversified", businessSummary: "", currentScope: "", futurePlans: "", exchange: "NSE", country: "India", website: "", employees: null, employeesSource: "Unavailable", basis: "unavailable" }, ownership: { promoterHolding: 71.97, promoterPledge: null, status: "partial", basis: "reported", note: "" } }, market: { country: "India", exchange: "NSE", currency: "INR", primaryFocus: true } } as unknown as FundamentalAnalysis;
const article = (headline: string, summary = "Sourced summary") => ({ id: headline, marketId: "IN", symbol: "MARKET", headline, category: "Markets", summary, key_entities: [], sentiment: "Neutral", actionable_impact: "Verify against the underlying disclosure.", url: "https://example.com/source", source: "Test Source", published_at: "2026-08-21T00:00:00.000Z", impact_score: 50, high_impact: false }) as ExtractedNews;

describe("institutional report modules", () => {
  it("keeps issuer-matched news separate from index-only backdrop", () => {
    const modules = buildInstitutionalReportModules(report, [article("Adani Enterprises announces a new project"), article("Nifty rises as crude oil falls")]);
    expect(modules.companyNews.items).toHaveLength(1);
    expect(modules.companyNews.items[0]?.tag).toBe("Investor Relations");
    expect(modules.marketBackdrop.items).toHaveLength(1);
  });

  it("marks unavailable modules and states the required source instead of inferring facts", () => {
    const modules = buildInstitutionalReportModules(report, []);
    expect(modules.earningsCall.status).toBe("unavailable");
    expect(modules.earningsCall.limitations[0]).toContain("transcript");
    expect(modules.corporateActions.status).toBe("unavailable");
    expect(modules.regulatory.proceedings[0]?.status).toBe("Unavailable");
    expect(modules.ownershipTrend.latest.find((item) => item.holder === "FII")?.value).toBe("Unavailable");
  });
});


describe("institutional report prompt contract", () => {
  it("keeps the required safety and evidence rules explicit", () => {
    expect(INSTITUTIONAL_REPORT_PROMPT_VERSION).toContain("upgraded");
    expect(INSTITUTIONAL_REPORT_SYSTEM_PROMPT).toContain("Never fabricate");
    expect(INSTITUTIONAL_REPORT_SYSTEM_PROMPT).toContain("Company-specific news");
    expect(INSTITUTIONAL_REPORT_SYSTEM_PROMPT).toContain("Local AI may only paraphrase");
    expect(INSTITUTIONAL_REPORT_SYSTEM_PROMPT).toContain("Regulatory and legal proceedings");
  });
});
