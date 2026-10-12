import { describe, expect, it } from "vitest";

import {
  absoluteChange,
  buildEvidenceIndex,
  buildFilingReport,
  buildReportFromAnnouncement,
  buildSourceStatus,
  buildVerificationReport,
  comparePeriods,
  convertCurrency,
  coverageLabel,
  isValidLocator,
  LATEST_FILING_UNCONFIRMED,
  multiple,
  normalizeScale,
  percentageChange,
  ratio,
  resolveFallback,
  SOURCE_REGISTRY,
  validateCitations,
  validateClaim,
  validateReportSchema,
} from "../lib/filing-intelligence";
import type { Claim, EvidenceRecord, FilingIdentity, SourceStatus } from "../lib/filing-intelligence";

const identity: FilingIdentity = {
  filingId: "f1",
  documentVersionId: "f1:v1",
  companyName: "Test Co",
  ticker: "TEST",
  market: "India",
  exchange: "NSE",
  regulator: "SEBI",
  filingTitle: "Quarterly results",
  filingCategory: "financial_results",
  reportingPeriod: "Q1 FY27",
  externalId: "NSE-123",
  officialUrl: "https://example.invalid/f1",
  contentSha256: null,
  byteCount: 1000,
  language: "en",
  supersedesVersionId: null,
  timestamps: {
    publicationUtc: "2026-10-01T00:00:00.000Z",
    firstSeenUtc: "2026-10-02T00:00:00.000Z",
    retrievalUtc: "2026-10-02T00:01:00.000Z",
    analysisUtc: "2026-10-02T00:02:00.000Z",
    sourceCheckedUtc: "2026-10-02T00:03:00.000Z",
  },
};

const evidence: EvidenceRecord[] = [
  { evidenceId: "e1", documentVersionId: "f1:v1", locator: "page:12", kind: "direct_source", excerpt: "Revenue 120 crore" },
  { evidenceId: "e2", documentVersionId: "f1:v1", locator: "table:3", kind: "secondary_context", excerpt: "Analysts noted growth" },
];

describe("PRD 9: deterministic calculations", () => {
  it("computes a normal percentage change", () => {
    const c = percentageChange(120, 100);
    expect(c.result).toBe(20);
    expect(c.status).toBe("passed");
    expect(c.formula).toBe("((current - prior) / abs(prior)) * 100");
  });

  it("refuses a percentage change against a zero denominator", () => {
    const c = percentageChange(50, 0);
    expect(c.result).toBeNull();
    expect(c.status).toBe("not_applicable");
    expect(c.note).toMatch(/zero/i);
  });

  it("handles a negative denominator without flipping the sign", () => {
    // From -100 to -50 is an improvement of 50%.
    const c = percentageChange(-50, -100);
    expect(c.result).toBe(50);
    expect(c.status).toBe("passed");
    expect(c.note).toMatch(/negative/i);
  });

  it("returns not_applicable when an input is missing", () => {
    expect(percentageChange(null, 100).status).toBe("not_applicable");
    expect(percentageChange(100, null).status).toBe("not_applicable");
  });

  it("computes absolute change and guards missing inputs", () => {
    expect(absoluteChange(120, 100).result).toBe(20);
    expect(absoluteChange(null, 100).status).toBe("not_applicable");
  });

  it("computes a margin and guards a non-positive base", () => {
    expect(ratio(25, 100).result).toBe(25);
    expect(ratio(25, 0).status).toBe("not_applicable");
    expect(ratio(25, -5).status).toBe("not_applicable");
  });

  it("computes a multiple and guards a zero denominator", () => {
    expect(multiple(200, 100).result).toBe(2);
    expect(multiple(200, 0).status).toBe("not_applicable");
  });

  it("caveats a period comparison across differing bases", () => {
    const c = comparePeriods(120, 100, {
      currentPeriod: "Q1 FY27",
      priorPeriod: "Q1 FY26",
      currentBasis: "consolidated",
      priorBasis: "standalone",
    });
    expect(c.note).toMatch(/bases differ/i);
    expect(c.note).toMatch(/periods are comparable/i);
  });

  it("normalizes a scale while retaining the original", () => {
    expect(normalizeScale(1, "crore").value).toBe(10000000);
    expect(normalizeScale(1, "crore").note).toMatch(/base unit retained/i);
    expect(normalizeScale(1, null).value).toBe(1);
    expect(normalizeScale(1, "widgets").note).toMatch(/unrecognized/i);
  });

  it("never converts currency silently", () => {
    const c = convertCurrency();
    expect(c.result).toBeNull();
    expect(c.note).toMatch(/rate source/i);
  });
});

describe("PRD 10: evidence, citations and claims", () => {
  it("accepts valid locators and rejects invalid ones", () => {
    expect(isValidLocator("page:12")).toBe(true);
    expect(isValidLocator("table:3")).toBe(true);
    expect(isValidLocator("xbrl:us-gaap:Revenues")).toBe(true);
    expect(isValidLocator("somewhere")).toBe(false);
    expect(isValidLocator("")).toBe(false);
  });

  it("rejects nonexistent evidence ids and version mismatches", () => {
    const index = buildEvidenceIndex(evidence);
    const claim: Claim = {
      claimId: "c1",
      text: "x",
      claimType: "FACT",
      evidenceIds: ["e1", "missing"],
      confidenceRationale: "Read directly from the filing.",
      limitations: [],
      calculation: null,
    };
    const result = validateCitations(claim, index, "f1:v1");
    expect(result.valid).toBe(false);
    expect(result.missingEvidenceIds).toEqual(["missing"]);
  });

  it("flags evidence carrying an invalid locator", () => {
    const index = buildEvidenceIndex([{ ...evidence[0], locator: "nowhere" }]);
    const claim: Claim = { claimId: "c", text: "x", claimType: "FACT", evidenceIds: ["e1"], confidenceRationale: "ok", limitations: [], calculation: null };
    expect(validateCitations(claim, index, "f1:v1").invalidLocators).toHaveLength(1);
  });

  it("rejects a claim with no evidence at all", () => {
    const claim: Claim = { claimId: "c", text: "x", claimType: "FACT", evidenceIds: [], confidenceRationale: "ok", limitations: [], calculation: null };
    const result = validateClaim(claim, buildEvidenceIndex(evidence), "f1:v1");
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/no evidence/i);
  });

  it("rejects a CALCULATION without a passing calculation", () => {
    const claim: Claim = {
      claimId: "c",
      text: "x",
      claimType: "CALCULATION",
      evidenceIds: ["e1"],
      confidenceRationale: "Computed deterministically.",
      limitations: [],
      calculation: percentageChange(1, 0),
    };
    expect(validateClaim(claim, buildEvidenceIndex(evidence), "f1:v1").errors.join(" ")).toMatch(/passing calculation/i);
  });

  it("rejects a FACT supported only by secondary context", () => {
    const claim: Claim = { claimId: "c", text: "x", claimType: "FACT", evidenceIds: ["e2"], confidenceRationale: "ok", limitations: [], calculation: null };
    expect(validateClaim(claim, buildEvidenceIndex(evidence), "f1:v1").errors.join(" ")).toMatch(/direct source evidence/i);
  });

  it("rejects a fabricated confidence probability", () => {
    const claim: Claim = { claimId: "c", text: "x", claimType: "FACT", evidenceIds: ["e1"], confidenceRationale: "90% confidence", limitations: [], calculation: null };
    expect(validateClaim(claim, buildEvidenceIndex(evidence), "f1:v1").errors.join(" ")).toMatch(/qualitative/i);
  });

  it("requires limitations on INTERPRETATION and FORECAST", () => {
    const claim: Claim = { claimId: "c", text: "x", claimType: "INTERPRETATION", evidenceIds: ["e1"], confidenceRationale: "Reasonable inference.", limitations: [], calculation: null };
    expect(validateClaim(claim, buildEvidenceIndex(evidence), "f1:v1").errors.join(" ")).toMatch(/limitations/i);
  });

  it("accepts a well-formed FACT claim", () => {
    const claim: Claim = { claimId: "c", text: "Revenue was 120 crore.", claimType: "FACT", evidenceIds: ["e1"], confidenceRationale: "Quoted directly from page 12 of the filing.", limitations: [], calculation: null };
    expect(validateClaim(claim, buildEvidenceIndex(evidence), "f1:v1").valid).toBe(true);
  });
});

describe("PRD 18: structured output validation", () => {
  it("names every missing required field", () => {
    const result = validateReportSchema({ filingId: "x" });
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("claims");
    expect(result.missing).toContain("englishReport");
  });

  it("rejects a bullet count outside five to seven", () => {
    const shape = {
      filingId: "x", documentVersionId: "v", reportStatus: "complete", summaryBullets: ["a"],
      facts: [], calculations: [], positiveFactors: [], negativeFactors: [], uncertainties: [],
      stockImplications: {}, monitoringItems: [], limitations: [], sources: [], claims: [],
      englishReport: "", validationResults: [],
    };
    expect(validateReportSchema(shape).valid).toBe(false);
  });
});

describe("PRD 5 / Appendix B: source registry honesty", () => {
  it("downgrades a connected source to stale when no check has run", () => {
    const entry = SOURCE_REGISTRY.find((s) => s.sourceId === "nse_corporate_announcements")!;
    const built = buildSourceStatus(entry, undefined);
    expect(built.status).toBe("stale");
    expect(built.lastSuccessfulCheckUtc).toBeNull();
  });

  it("marks a source degraded on a recorded error", () => {
    const entry: SourceStatus = { ...SOURCE_REGISTRY[0], status: "connected" };
    const built = buildSourceStatus(entry, { sourceId: entry.sourceId, lastSuccessfulCheckUtc: "2026-10-01T00:00:00.000Z", lastError: "HTTP 503", checkedUtc: "2026-10-02T00:00:00.000Z" });
    expect(built.status).toBe("degraded");
    expect(built.lastError).toBe("HTTP 503");
  });

  it("never labels an unintegrated market as live", () => {
    const sec = SOURCE_REGISTRY.find((s) => s.sourceId === "sec_edgar_submissions")!;
    expect(sec.status).toBe("planned");
    expect(coverageLabel(sec.status)).toBe("Planned");
  });
});

describe("PRD 7: verification panel", () => {
  it("uses the exact unconfirmed-latest wording and never a vague badge", () => {
    const report = buildVerificationReport({
      identity,
      retrieval: null,
      extraction: { complete: true, pagesExpected: 3, pagesExtracted: 3, warnings: [] },
      identityChecks: null,
      latestFilingConfirmed: false,
    });
    expect(report.latestFilingStatement).toBe(LATEST_FILING_UNCONFIRMED);
    expect(report.summaryLabel).not.toBe("Verified");
    expect(report.summaryLabel).toMatch(/not checked|failed|passed/i);
    expect(report.fullyVerified).toBe(false);
  });

  it("separates the five checks as distinct concepts", () => {
    const report = buildVerificationReport({ identity, retrieval: null, extraction: null, identityChecks: null, latestFilingConfirmed: false });
    expect(report.checks.map((c) => c.key)).toEqual([
      "source_authority",
      "transport_integrity",
      "document_identity",
      "extraction_completeness",
      "latest_filing",
    ]);
  });

  it("fails transport integrity on a bad status and a redirect off-domain", () => {
    const report = buildVerificationReport({
      identity,
      retrieval: { httpStatus: 404, contentType: "text/html", finalUrlApproved: false, byteCountMatched: false, hashMatched: null },
      extraction: null,
      identityChecks: null,
      latestFilingConfirmed: false,
    });
    const transport = report.checks.find((c) => c.key === "transport_integrity")!;
    expect(transport.outcome).toBe("failed");
    expect(transport.detail).toMatch(/HTTP 404/);
  });

  it("fails extraction completeness when pages are missing", () => {
    const report = buildVerificationReport({
      identity,
      retrieval: null,
      extraction: { complete: true, pagesExpected: 10, pagesExtracted: 7, warnings: [] },
      identityChecks: null,
      latestFilingConfirmed: true,
    });
    expect(report.checks.find((c) => c.key === "extraction_completeness")!.outcome).toBe("failed");
  });
});

describe("PRD 11 / 18: report assembly and safe fallback", () => {
  it("withholds claims that fail validation and marks the report incomplete", () => {
    const badClaim: Claim = { claimId: "bad", text: "x", claimType: "FACT", evidenceIds: ["missing"], confidenceRationale: "ok", limitations: [], calculation: null };
    const report = buildFilingReport({
      identity,
      verification: buildVerificationReport({ identity, retrieval: null, extraction: null, identityChecks: null, latestFilingConfirmed: false }),
      facts: [], calculations: [], claims: [badClaim], evidence,
      summaryBullets: ["a", "b", "c", "d", "e"],
      positiveFactors: [], negativeFactors: [], uncertainties: [],
      stockImplications: { stance: "uncertain", rationale: "No basis." },
      researchView: null, monitoringItems: [], limitations: [],
      sources: [], secondaryLanguage: null, translatedReport: null, translationValidation: null,
    });
    expect(report.claims).toHaveLength(0);
    expect(report.reportStatus).toBe("incomplete");
    expect(report.limitations.join(" ")).toMatch(/withheld/i);
    expect(report.englishReport).toMatch(/1\. FILING IDENTITY/);
    expect(report.englishReport).toMatch(/11\. DISCLAIMER AND LIMITATIONS/);
  });

  it("blocks publication when a material section is missing", () => {
    const report = buildFilingReport({
      identity,
      verification: buildVerificationReport({ identity, retrieval: null, extraction: null, identityChecks: null, latestFilingConfirmed: true }),
      facts: [], calculations: [], claims: [], evidence,
      summaryBullets: ["a", "b", "c", "d", "e"],
      positiveFactors: [], negativeFactors: [], uncertainties: [],
      stockImplications: { stance: "uncertain", rationale: "x" },
      researchView: null, monitoringItems: [], limitations: [], sources: [],
      secondaryLanguage: null, translatedReport: null, translationValidation: null,
      materialSectionMissing: true,
    });
    expect(report.reportStatus).toBe("blocked");
  });

  it("withholds a translation that failed consistency checks but keeps English", () => {
    const report = buildFilingReport({
      identity,
      verification: buildVerificationReport({ identity, retrieval: null, extraction: null, identityChecks: null, latestFilingConfirmed: true }),
      facts: [], calculations: [], claims: [], evidence,
      summaryBullets: ["a", "b", "c", "d", "e"],
      positiveFactors: [], negativeFactors: [], uncertainties: [],
      stockImplications: { stance: "uncertain", rationale: "x" },
      researchView: null, monitoringItems: [], limitations: [], sources: [],
      secondaryLanguage: "hi",
      translatedReport: "यह एक रिपोर्ट है",
      translationValidation: { passed: false, problems: ["figure changed in section 4"] },
    });
    expect(report.translatedReport).toBeNull();
    expect(report.englishReport.length).toBeGreaterThan(0);
    expect(report.limitations.join(" ")).toMatch(/failed consistency checks/i);
  });

  it("never fabricates a result for any fallback reason", () => {
    for (const reason of ["retrieval_failed", "extraction_incomplete", "evidence_validation_failed", "translation_validation_failed", "model_unavailable"] as const) {
      const outcome = resolveFallback(reason);
      expect(outcome.message.length).toBeGreaterThan(20);
      expect(outcome.message).not.toMatch(/fabricat(ed|ing) a (completed|successful)/i);
    }
    expect(resolveFallback("retrieval_failed").publishEnglish).toBe(false);
    expect(resolveFallback("model_unavailable").publishEnglish).toBe(false);
    expect(resolveFallback("extraction_incomplete").publishEnglish).toBe(true);
  });
});

describe("bridge: on-device announcement to report", () => {
  const base = {
    id: "a1",
    headline: "Test Co bags order worth 500 crore",
    summary: "The company announced a new order on October 5, 2026.",
    source: "Example News",
    url: "https://example.invalid/a1",
    publishedAt: "2026-10-05T00:00:00.000Z",
    symbol: "TEST",
    market: "India",
  };

  it("treats secondary reporting honestly: no FACT claim, uncertain stance", () => {
    const report = buildReportFromAnnouncement({ ...base, fromOfficialSource: false });
    expect(report.claims.every((c) => c.claimType !== "FACT")).toBe(true);
    expect(report.stockImplications.stance).toBe("uncertain");
    expect(report.reportStatus).toBe("incomplete");
    expect(report.uncertainties.join(" ")).toMatch(/secondary reporting/i);
  });

  it("classifies an official-source item as an official disclosure", () => {
    const report = buildReportFromAnnouncement({ ...base, fromOfficialSource: true });
    expect(report.filingIdentity.filingCategory).toBe("official_disclosure");
  });

  it("builds a CALCULATION claim from supplied metrics", () => {
    const report = buildReportFromAnnouncement({
      ...base,
      fromOfficialSource: true,
      metrics: [{ metric: "Revenue", reportedValue: 120, unit: "crore", priorValue: 100, locator: "table:1" }],
    });
    expect(report.claims).toHaveLength(1);
    expect(report.claims[0].claimType).toBe("CALCULATION");
    expect(report.claims[0].calculation?.result).toBe(20);
  });

  it("keeps every time marker distinct", () => {
    const report = buildReportFromAnnouncement({ ...base, fromOfficialSource: false });
    const t = report.filingIdentity.timestamps;
    expect(t.publicationUtc).toBe("2026-10-05T00:00:00.000Z");
    expect(t.analysisUtc).not.toBe(t.publicationUtc);
    expect(t.retrievalUtc).toBeNull();
  });
});
