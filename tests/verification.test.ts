import { describe, expect, it } from "vitest";

import {
  addDecimals,
  buildEvidenceAudit,
  buildEvidenceFactIndex,
  currentRatio,
  debtToEquity,
  decimal,
  describeGate,
  divideDecimals,
  earningsPerShare,
  evaluatePublicationGate,
  extractInvariants,
  grossMargin,
  growth,
  interestCoverage,
  isLocatorValidForFormat,
  netMargin,
  operatingMargin,
  parseLocator,
  quickRatio,
  renderEvidenceAudit,
  resolveTranslation,
  restatementCheck,
  roundWithRule,
  safePercent,
  SECTION_CONTRACTS,
  sectionContract,
  summariseMetrics,
  supportsClaim,
  toNumber,
  validateClaimCitations,
  validateTranslation,
  validateTypedClaim,
  validateTypedClaims,
  convertCurrencyChecked,
  comparePeriodsChecked,
  bookValuePerShare,
  type AssertedFact,
  type CitationContext,
  type EvidenceFact,
  type SectionState,
  type TypedClaim,
} from "../lib/filing-intelligence";

const NOW = new Date("2026-10-12T12:00:00.000Z");
const DOC = "filing_1";
const VER = "filing_1::v1";

const context: CitationContext = { documentId: DOC, documentVersionId: VER, format: "pdf", material: true, now: NOW };

function evidence(overrides: Partial<EvidenceFact> = {}): EvidenceFact {
  return {
    evidenceId: "ev_1",
    documentId: DOC,
    documentVersionId: VER,
    format: "pdf",
    locator: "page:12",
    kind: "direct_source",
    excerpt: "Revenue from operations increased to 1,200 crore.",
    value: 1200,
    unit: "crore",
    currency: "INR",
    period: "FY27",
    scale: "crore",
    sign: "positive",
    capturedUtc: "2026-10-11T00:00:00.000Z",
    ...overrides,
  };
}

function claim(overrides: Partial<TypedClaim> = {}): TypedClaim {
  return {
    claimId: "c1",
    text: "Revenue from operations was 1,200 crore.",
    claimType: "FACT",
    evidenceIds: ["ev_1"],
    asserted: { value: 1200, unit: "crore", currency: "INR", period: "FY27", scale: "crore" },
    calculation: null,
    observedFacts: [],
    reasoning: null,
    assumptions: [],
    method: null,
    uncertainty: null,
    limitations: [],
    confidenceRationale: "Read directly from the results table on page 12.",
    ...overrides,
  };
}

/* ------------------------------------------------------------------ *
 * Decimal-safe arithmetic
 * ------------------------------------------------------------------ */

describe("decimal-safe arithmetic and rounding rules", () => {
  it("does not drift the way binary floating point does", () => {
    // 1.1 + 2.2 is 3.3000000000000003 in binary floating point.
    const sum = addDecimals(decimal(1.1), decimal(2.2));
    expect(toNumber(sum, 2).value).toBe(3.3);
    expect(toNumber(sum, 10).value).toBe(3.3);
  });

  it("adds a chain of figures without accumulating error", () => {
    let total = decimal(0);
    for (let i = 0; i < 10; i += 1) total = addDecimals(total, decimal(0.1));
    expect(toNumber(total, 2).value).toBe(1);
  });

  it("applies half-up rounding by convention", () => {
    expect(roundWithRule(2.345, 2, "half_up").value).toBe(2.35);
    expect(roundWithRule(-2.345, 2, "half_up").value).toBe(-2.35);
  });

  it("applies banker's rounding where a bias would accumulate", () => {
    expect(roundWithRule(2.345, 2, "half_even").value).toBe(2.34);
    expect(roundWithRule(2.355, 2, "half_even").value).toBe(2.36);
  });

  it("truncates toward zero on request", () => {
    expect(roundWithRule(2.349, 2, "truncate").value).toBe(2.34);
    expect(roundWithRule(-2.349, 2, "truncate").value).toBe(-2.34);
  });

  it("names the rounding rule that was actually applied", () => {
    expect(roundWithRule(2.5, 0, "half_up").rule).toBe("half_up");
    expect(toNumber(decimal(2), 2).rule).toBe("exact");
  });

  it("returns null from a zero-denominator division instead of Infinity", () => {
    expect(divideDecimals(decimal(5), decimal(0))).toBeNull();
  });

  it("reports a percentage against a zero denominator as undefined", () => {
    const result = safePercent(decimal(50), decimal(0));
    expect(result.percent).toBeNull();
    expect(result.undefinedReason).toMatch(/zero/i);
  });
});

/* ------------------------------------------------------------------ *
 * Locators
 * ------------------------------------------------------------------ */

describe("format-specific locator validation", () => {
  it("accepts a page locator for a PDF and rejects it for JSON", () => {
    expect(isLocatorValidForFormat("page:12", "pdf").valid).toBe(true);
    expect(isLocatorValidForFormat("page:12", "json").valid).toBe(false);
  });

  it("accepts an HTML section locator only for HTML", () => {
    expect(isLocatorValidForFormat("html:section:Results", "html").valid).toBe(true);
    expect(isLocatorValidForFormat("section:Results", "html").valid).toBe(true);
    expect(isLocatorValidForFormat("section:Results", "json").valid).toBe(false);
  });

  it("requires an XBRL fact to identify its context, unit and period", () => {
    const incomplete = isLocatorValidForFormat("xbrl:us-gaap:Revenues", "xbrl");
    expect(incomplete.valid).toBe(false);
    expect(incomplete.reason).toMatch(/context, unit, period/);

    const complete = isLocatorValidForFormat("xbrl:us-gaap:Revenues#context=c1&unit=INR&period=FY27&dim=segment:Retail", "xbrl");
    expect(complete.valid).toBe(true);
    expect(complete.parsed?.xbrl?.dimensions).toEqual(["segment:Retail"]);
  });

  it("parses a JSON path and a CSV row", () => {
    expect(parseLocator("json:revenue.fy27")?.jsonPath).toBe("revenue.fy27");
    expect(isLocatorValidForFormat("row:14", "csv").valid).toBe(true);
  });

  it("rejects an unrecognised locator", () => {
    expect(isLocatorValidForFormat("somewhere over there", "pdf").valid).toBe(false);
    expect(isLocatorValidForFormat(null, "pdf").valid).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * Metrics
 * ------------------------------------------------------------------ */

describe("deterministic financial metrics", () => {
  const value = (v: number | null) => ({ value: v });

  it("computes growth, and marks a zero prior value undefined rather than infinite", () => {
    const ok = growth("g", "Growth", value(120), value(100));
    expect(ok.value).toBe(20);
    expect(ok.status).toBe("ok");

    const zero = growth("g", "Growth", value(50), value(0));
    expect(zero.value).toBeNull();
    expect(zero.status).toBe("undefined");
    expect(zero.note).toMatch(/zero/i);
  });

  it("documents the convention for a negative denominator", () => {
    const metric = growth("g", "Growth", value(-50), value(-100));
    expect(metric.value).toBe(50);
    expect(metric.caveats.join(" ")).toMatch(/negative/i);
  });

  it("never fabricates a missing input", () => {
    const metric = growth("g", "Growth", value(null), value(100));
    expect(metric.value).toBeNull();
    expect(metric.status).toBe("insufficient_inputs");
    expect(metric.note).toMatch(/no value is fabricated/i);
  });

  it("computes the margins and guards a zero revenue", () => {
    expect(grossMargin(value(400), value(1000)).value).toBe(40);
    expect(operatingMargin(value(200), value(1000)).value).toBe(20);
    expect(netMargin(value(120), value(1000)).value).toBe(12);
    expect(netMargin(value(120), value(0)).status).toBe("undefined");
  });

  it("computes liquidity and leverage ratios", () => {
    expect(currentRatio(value(200), value(100)).value).toBe(2);
    expect(quickRatio(value(200), value(50), value(100)).value).toBe(1.5);
    expect(debtToEquity(value(300), value(100)).value).toBe(3);
    expect(interestCoverage(value(500), value(100)).value).toBe(5);
  });

  it("blocks an interest-coverage ratio when interest is negative", () => {
    const metric = interestCoverage(value(500), value(-100));
    expect(metric.status).toBe("blocked");
    expect(metric.value).toBeNull();
  });

  it("computes per-share metrics and blocks an invalid share count", () => {
    expect(earningsPerShare(value(1200), value(100)).value).toBe(12);
    expect(bookValuePerShare(value(5000), value(100)).value).toBe(50);
    expect(earningsPerShare(value(1200), value(0)).status).toBe("undefined");
    expect(earningsPerShare(value(1200), value(-5)).status).toBe("blocked");
  });

  it("blocks a comparison across differing bases or period types", () => {
    const bases = comparePeriodsChecked(value(120), value(100), { currentPeriod: "annual", priorPeriod: "annual", currentBasis: "consolidated", priorBasis: "standalone" });
    expect(bases.status).toBe("blocked");
    expect(bases.note).toMatch(/consolidated.*standalone/i);

    const periods = comparePeriodsChecked(value(120), value(100), { currentPeriod: "quarterly", priorPeriod: "trailing_twelve_months", currentBasis: "consolidated", priorBasis: "consolidated" });
    expect(periods.status).toBe("blocked");
    expect(periods.note).toMatch(/not comparable/i);
  });

  it("permits a like-for-like comparison", () => {
    const metric = comparePeriodsChecked(value(120), value(100), { currentPeriod: "annual", priorPeriod: "annual", currentBasis: "consolidated", priorBasis: "consolidated" });
    expect(metric.status).toBe("ok");
    expect(metric.value).toBe(20);
  });

  it("detects a restatement and refuses to treat the two values as interchangeable", () => {
    const changed = restatementCheck(value(100), value(95), "Revenue");
    expect(changed.consistent).toBe(false);
    expect(changed.difference).toBe(-5);
    expect(changed.note).toMatch(/not interchangeable/i);
    expect(restatementCheck(value(100), value(100), "Revenue").consistent).toBe(true);
  });

  it("blocks a cross-currency comparison without a complete conversion", () => {
    const blocked = convertCurrencyChecked(value(100), "INR", "USD", null);
    expect(blocked.status).toBe("blocked");
    expect(blocked.note).toMatch(/rate, its timestamp, its source and its method/i);

    const partial = convertCurrencyChecked(value(100), "INR", "USD", { rate: 0.012, rateTimestampUtc: "", rateSource: "x", method: "y" });
    expect(partial.status).toBe("blocked");

    const complete = convertCurrencyChecked(value(100), "INR", "USD", { rate: 0.012, rateTimestampUtc: "2026-10-01T00:00:00Z", rateSource: "Example Bank", method: "closing mid-rate" });
    expect(complete.status).toBe("ok");
    expect(complete.value).toBeCloseTo(1.2, 2);
  });

  it("summarises how many metrics were computable", () => {
    const metrics = [growth("a", "A", value(120), value(100)), growth("b", "B", value(1), value(0)), currentRatio(value(null), value(1))];
    const summary = summariseMetrics(metrics);
    expect(summary.total).toBe(3);
    expect(summary.ok).toBe(1);
    expect(summary.undefined).toBe(1);
    expect(summary.insufficient).toBe(1);
  });
});

/* ------------------------------------------------------------------ *
 * Deep citation validation
 * ------------------------------------------------------------------ */

describe("deep citation validation", () => {
  const index = buildEvidenceFactIndex([evidence()]);

  it("accepts a claim whose value and attributes agree with the evidence", () => {
    const result = validateClaimCitations({ text: "Revenue from operations was 1,200 crore.", evidenceIds: ["ev_1"] }, { value: 1200, unit: "crore", currency: "INR", period: "FY27", scale: "crore" }, index, context);
    expect(result.valid).toBe(true);
    expect(result.problems).toEqual([]);
  });

  it("rejects a missing evidence identifier", () => {
    const result = validateClaimCitations({ text: "x", evidenceIds: ["nope"] }, null, index, context);
    expect(result.problems.some((problem) => problem.code === "missing_evidence")).toBe(true);
  });

  it("rejects evidence from a different document version", () => {
    const other = buildEvidenceFactIndex([evidence({ documentVersionId: "filing_1::v2" })]);
    const result = validateClaimCitations({ text: "Revenue from operations was 1,200 crore.", evidenceIds: ["ev_1"] }, null, other, context);
    expect(result.problems.some((problem) => problem.code === "wrong_version")).toBe(true);
  });

  it("flags a material claim resting on an unrelated document", () => {
    const other = buildEvidenceFactIndex([evidence({ documentId: "filing_9" })]);
    const result = validateClaimCitations({ text: "Revenue from operations was 1,200 crore.", evidenceIds: ["ev_1"] }, null, other, { ...context, material: true });
    expect(result.problems.some((problem) => problem.code === "unrelated_document")).toBe(true);
  });

  it("catches a value that does not match the cited evidence", () => {
    const result = validateClaimCitations({ text: "Revenue from operations was 9,999 crore.", evidenceIds: ["ev_1"] }, { value: 9999, unit: "crore", currency: "INR", period: "FY27", scale: "crore" }, index, context);
    expect(result.problems.some((problem) => problem.code === "value_mismatch")).toBe(true);
  });

  it("catches a misleading unit, currency, period and scale", () => {
    const asserted: AssertedFact = { value: 1200, unit: "lakh", currency: "USD", period: "FY26", scale: "lakh" };
    const result = validateClaimCitations({ text: "Revenue from operations was 1,200.", evidenceIds: ["ev_1"] }, asserted, index, context);
    const codes = result.problems.map((problem) => problem.code);
    expect(codes).toContain("unit_mismatch");
    expect(codes).toContain("currency_mismatch");
    expect(codes).toContain("period_mismatch");
    expect(codes).toContain("scale_mismatch");
  });

  it("catches a sign that contradicts the evidence", () => {
    const negative = buildEvidenceFactIndex([evidence({ value: -340, sign: "negative", excerpt: "Operating loss of 340 crore." })]);
    const result = validateClaimCitations({ text: "Operating loss of 340 crore.", evidenceIds: ["ev_1"] }, { value: 340, unit: "crore", currency: "INR", period: "FY27", scale: "crore" }, negative, context);
    expect(result.problems.some((problem) => problem.code === "sign_mismatch")).toBe(true);
  });

  it("rejects an invalid locator for the document format", () => {
    // A page locator is meaningless for a JSON document, which is what makes it invalid.
    const wrong = buildEvidenceFactIndex([evidence({ locator: "page:12", format: "json" })]);
    const result = validateClaimCitations({ text: "Revenue from operations was 1,200 crore.", evidenceIds: ["ev_1"] }, null, wrong, context);
    expect(result.problems.some((problem) => problem.code === "invalid_locator")).toBe(true);
  });

  it("flags stale evidence", () => {
    const stale = buildEvidenceFactIndex([evidence({ capturedUtc: "2025-01-01T00:00:00.000Z" })]);
    const result = validateClaimCitations({ text: "Revenue from operations was 1,200 crore.", evidenceIds: ["ev_1"] }, null, stale, context);
    expect(result.problems.some((problem) => problem.code === "stale_evidence")).toBe(true);
  });

  it("rejects a claim whose wording the cited evidence does not support", () => {
    const result = validateClaimCitations({ text: "The company announced a share buyback programme.", evidenceIds: ["ev_1"] }, null, index, context);
    expect(result.problems.some((problem) => problem.code === "unsupported_claim")).toBe(true);
  });

  it("measures support by token overlap", () => {
    expect(supportsClaim("Revenue from operations was 1,200 crore.", ["Revenue from operations increased to 1,200 crore."]).supported).toBe(true);
    expect(supportsClaim("A dividend was declared.", ["Revenue from operations increased to 1,200 crore."]).supported).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * Claim taxonomy
 * ------------------------------------------------------------------ */

describe("claim taxonomy enforcement", () => {
  const index = buildEvidenceFactIndex([evidence()]);

  it("accepts a well-formed FACT", () => {
    const result = validateTypedClaim(claim(), index, context);
    expect(result.valid).toBe(true);
    expect(result.publishable).toBe(true);
  });

  it("rejects a FACT resting only on secondary context", () => {
    const secondary = buildEvidenceFactIndex([evidence({ kind: "secondary_context" })]);
    const result = validateTypedClaim(claim(), secondary, context);
    expect(result.taxonomyProblems.some((problem) => problem.code === "fact_without_direct_evidence")).toBe(true);
  });

  it("refuses to publish an analyst interpretation as a company fact", () => {
    const result = validateTypedClaim(claim({ text: "We believe revenue is likely to accelerate, and this indicates strong demand." }), index, context);
    expect(result.taxonomyProblems.some((problem) => problem.code === "interpretation_as_fact")).toBe(true);
    expect(result.publishable).toBe(false);
  });

  it("requires a CALCULATION to reference a successful calculation and its inputs", () => {
    const missing = validateTypedClaim(claim({ claimType: "CALCULATION", calculation: null }), index, context);
    expect(missing.taxonomyProblems.some((problem) => problem.code === "calculation_missing")).toBe(true);

    const failed = validateTypedClaim(
      claim({ claimType: "CALCULATION", calculation: { method: "growth", formula: "x", inputFactIds: ["fact_1"], result: null, status: "undefined", rounding: "exact", unit: "%" } }),
      index,
      context,
    );
    expect(failed.taxonomyProblems.some((problem) => problem.code === "calculation_not_ok")).toBe(true);

    const undeclared = validateTypedClaim(
      claim({ claimType: "CALCULATION", calculation: { method: "growth", formula: "x", inputFactIds: [], result: 20, status: "ok", rounding: "half_up", unit: "%" } }),
      index,
      context,
    );
    expect(undeclared.taxonomyProblems.some((problem) => problem.code === "calculation_inputs_undeclared")).toBe(true);
  });

  it("requires an INTERPRETATION to separate observation from reasoning and record limitations", () => {
    const undivided = validateTypedClaim(claim({ claimType: "INTERPRETATION", limitations: ["limited"] }), index, context);
    expect(undivided.taxonomyProblems.some((problem) => problem.code === "interpretation_undivided")).toBe(true);

    const unlimited = validateTypedClaim(claim({ claimType: "INTERPRETATION", observedFacts: ["Revenue rose"], reasoning: "This suggests demand.", limitations: [] }), index, context);
    expect(unlimited.taxonomyProblems.some((problem) => problem.code === "interpretation_without_limitations")).toBe(true);
  });

  it("requires a FORECAST to state assumptions, method, uncertainty, limitations and evidence", () => {
    const result = validateTypedClaim(claim({ claimType: "FORECAST", assumptions: [], method: null, uncertainty: null, limitations: [] }), index, context);
    const detail = result.taxonomyProblems.find((problem) => problem.code === "forecast_incomplete")!.detail;
    expect(detail).toMatch(/assumptions/);
    expect(detail).toMatch(/method/);
    expect(detail).toMatch(/uncertainty/);
  });

  it("rejects a fabricated confidence probability", () => {
    const result = validateTypedClaim(claim({ confidenceRationale: "90% confidence" }), index, context);
    expect(result.taxonomyProblems.some((problem) => problem.code === "confidence_is_probability")).toBe(true);
  });

  it("withholds failed claims with their reasons rather than discarding them silently", () => {
    const good = claim();
    const bad = claim({ claimId: "c2", evidenceIds: ["missing"] });
    const outcome = validateTypedClaims([good, bad], index, context);
    expect(outcome.publishable.map((entry) => entry.claimId)).toEqual(["c1"]);
    expect(outcome.withheld).toHaveLength(1);
    expect(outcome.withheld[0].reasons.join(" ")).toMatch(/missing_evidence/);
  });
});

/* ------------------------------------------------------------------ *
 * Section contract
 * ------------------------------------------------------------------ */

describe("the eleven-section contract", () => {
  it("defines exactly eleven sections with the PRD's names", () => {
    expect(SECTION_CONTRACTS).toHaveLength(11);
    const names = SECTION_CONTRACTS.map((contract) => contract.name);
    expect(names).toEqual([
      "Filing identity",
      "One-minute summary",
      "What the company disclosed",
      "Financial comparison",
      "Positive factors",
      "Negative factors and risks",
      "Potential stock implications",
      "Research view",
      "What to monitor next",
      "Sources and methodology",
      "Disclaimer and limitations",
    ]);
  });

  it("states a full contract for every section", () => {
    for (const contract of SECTION_CONTRACTS) {
      expect(contract.requiredInputs.length).toBeGreaterThan(0);
      expect(contract.validationRules.length).toBeGreaterThan(0);
      expect(contract.displayFormat.length).toBeGreaterThan(5);
      expect(["none", "identity", "at_least_one_direct", "every_claim"]).toContain(contract.evidenceRequirement);
      expect(["block", "partial_with_disclosure", "omit_section"]).toContain(contract.missingDataBehaviour);
    }
  });

  it("blocks on the four sections that must always be present", () => {
    const blocking = SECTION_CONTRACTS.filter((contract) => contract.publicationBlocking).map((contract) => contract.id);
    expect(blocking).toEqual(["filing_identity", "one_minute_summary", "sources_and_methodology", "disclaimer_and_limitations"]);
  });

  it("resolves a contract by id and rejects an unknown one", () => {
    expect(sectionContract("research_view").number).toBe(8);
    expect(() => sectionContract("not_a_section" as never)).toThrow();
  });
});

/* ------------------------------------------------------------------ *
 * Publication gate
 * ------------------------------------------------------------------ */

describe("publication gate", () => {
  const allSections = (overrides: Partial<SectionState>[] = []): SectionState[] =>
    SECTION_CONTRACTS.map((contract, index) => ({ id: contract.id, populated: true, evidenceSatisfied: true, problem: null, ...(overrides[index] ?? {}) }));

  it("publishes a complete report when everything passes", () => {
    const decision = evaluatePublicationGate({ sections: allSections(), identityResolved: true, metrics: [], withheld: [], materialSectionUnreadable: false });
    expect(decision.publish).toBe(true);
    expect(decision.status).toBe("complete");
  });

  it("blocks publication when a required section is missing", () => {
    const sections = allSections().map((state) => (state.id === "disclaimer_and_limitations" ? { ...state, populated: false } : state));
    const decision = evaluatePublicationGate({ sections, identityResolved: true, metrics: [], withheld: [], materialSectionUnreadable: false });
    expect(decision.publish).toBe(false);
    expect(decision.blocks.some((block) => block.code === "missing_section")).toBe(true);
    expect(decision.status).toBe("blocked");
  });

  it("blocks publication when the document identity is unresolved", () => {
    const decision = evaluatePublicationGate({ sections: allSections(), identityResolved: false, metrics: [], withheld: [], materialSectionUnreadable: false });
    expect(decision.publish).toBe(false);
    expect(decision.blocks.some((block) => block.code === "identity_unresolved")).toBe(true);
  });

  it("blocks publication when a required calculation failed", () => {
    const failed = [growth("g", "Growth", { value: 1 }, { value: 0 })];
    const withBlocked = [{ ...failed[0], status: "blocked" as const, note: "bases differ" }];
    const decision = evaluatePublicationGate({ sections: allSections(), identityResolved: true, metrics: withBlocked, withheld: [], materialSectionUnreadable: false });
    expect(decision.publish).toBe(false);
    expect(decision.blocks.some((block) => block.code === "calculation_failed")).toBe(true);
  });

  it("blocks publication when a material section could not be read", () => {
    const decision = evaluatePublicationGate({ sections: allSections(), identityResolved: true, metrics: [], withheld: [], materialSectionUnreadable: true });
    expect(decision.publish).toBe(false);
    expect(decision.blocks.some((block) => block.code === "material_unreadable")).toBe(true);
  });

  it("permits a partial report with disclosed gaps and a withheld summary", () => {
    const sections = allSections().map((state) => (state.id === "positive_factors" ? { ...state, populated: false, problem: "no positive factors were evidenced" } : state));
    const withheld = [{ claim: claim({ claimId: "c9", evidenceIds: ["missing"] }), reasons: ["missing_evidence: unknown id"] }];
    const decision = evaluatePublicationGate({ sections, identityResolved: true, metrics: [], withheld, materialSectionUnreadable: false });
    expect(decision.publish).toBe(true);
    expect(decision.status).toBe("partial");
    expect(decision.disclosures.join(" ")).toMatch(/positive factors/i);
    expect(decision.withheldSummary.count).toBe(1);
    expect(decision.withheldSummary.byReason[0].reason).toBe("missing_evidence");
    expect(describeGate(decision)).toMatch(/partial report/i);
  });

  it("omits a section whose contract permits omission", () => {
    const sections = allSections().map((state) => (state.id === "what_to_monitor_next" ? { ...state, populated: false } : state));
    const decision = evaluatePublicationGate({ sections, identityResolved: true, metrics: [], withheld: [], materialSectionUnreadable: false });
    expect(decision.omittedSections).toContain("what_to_monitor_next");
    expect(decision.publish).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * Translation consistency
 * ------------------------------------------------------------------ */

describe("translation consistency", () => {
  const english = [
    "1. FILING IDENTITY",
    "  Revenue: 1,200 crore (INR)",
    "  Operating loss: -340 crore",
    "2. ONE-MINUTE SUMMARY",
    "  - Revenue rose 20% year on year.",
    "  - A caveat applies. [ev_1]",
    "  FACT: revenue was 1,200 crore.",
  ].join("\n");

  it("extracts the invariants that must survive translation", () => {
    const invariants = extractInvariants(english);
    expect(invariants.numbers).toContain("1200");
    expect(invariants.numbers).toContain("20%");
    expect(invariants.currencyCodes).toContain("INR");
    expect(invariants.evidenceIds).toContain("ev_1");
    expect(invariants.classifications).toContain("FACT");
    expect(invariants.negativeCount).toBeGreaterThan(0);
  });

  it("passes a faithful translation", () => {
    const translation = english.replace("FILING IDENTITY", "पहचान").replace("ONE-MINUTE SUMMARY", "सारांश");
    const result = validateTranslation(english, translation);
    expect(result.passed).toBe(true);
  });

  it("catches a changed figure", () => {
    const translation = english.replaceAll("1,200", "1,500");
    const result = validateTranslation(english, translation);
    expect(result.passed).toBe(false);
    expect(result.problems.some((problem) => problem.code === "number_missing")).toBe(true);
    expect(result.problems.some((problem) => problem.code === "number_changed")).toBe(true);
  });

  it("catches a dropped currency, evidence id and classification", () => {
    const translation = english.replace("INR", "").replace("[ev_1]", "").replace("FACT:", "");
    const result = validateTranslation(english, translation);
    const codes = result.problems.map((problem) => problem.code);
    expect(codes).toContain("currency_changed");
    expect(codes).toContain("evidence_id_missing");
    expect(codes).toContain("classification_changed");
  });

  it("catches a lost negative sign", () => {
    const translation = english.replace("-340", "340");
    const result = validateTranslation(english, translation);
    expect(result.problems.some((problem) => problem.code === "sign_changed")).toBe(true);
  });

  it("catches an omitted section", () => {
    const translation = english.split("\n").filter((line) => !line.startsWith("2. ONE-MINUTE SUMMARY")).join("\n");
    const result = validateTranslation(english, translation);
    expect(result.problems.some((problem) => problem.code === "section_omitted")).toBe(true);
  });

  it("suppresses a failed translation and retains the authoritative report", () => {
    const resolved = resolveTranslation(english, english.replace("1,200", "1,500"));
    expect(resolved.translatedReport).toBeNull();
    expect(resolved.englishReport).toBe(english);
    expect(resolved.validation?.passed).toBe(false);
  });

  it("keeps a passing translation", () => {
    const translation = english.replace("FILING IDENTITY", "पहचान");
    const resolved = resolveTranslation(english, translation);
    expect(resolved.translatedReport).toBe(translation);
  });
});

/* ------------------------------------------------------------------ *
 * Evidence audit
 * ------------------------------------------------------------------ */

describe("evidence audit report", () => {
  const index = buildEvidenceFactIndex([evidence()]);
  const claims = [claim(), claim({ claimId: "c2", evidenceIds: ["missing"] })];
  const validations = claims.map((entry) => validateTypedClaim(entry, index, context));
  const gate = evaluatePublicationGate({ sections: SECTION_CONTRACTS.map((c) => ({ id: c.id, populated: true, evidenceSatisfied: true, problem: null })), identityResolved: true, metrics: [], withheld: [], materialSectionUnreadable: false });

  it("counts claims, citations and coverage", () => {
    const audit = buildEvidenceAudit({ documentId: DOC, documentVersionId: VER, claims, validations, evidence: [evidence()], gate, now: NOW });
    expect(audit.totals.claims).toBe(2);
    expect(audit.totals.published).toBe(1);
    expect(audit.totals.withheld).toBe(1);
    expect(audit.totals.citations).toBe(2);
    expect(audit.totals.resolvedCitations).toBe(1);
    expect(audit.totals.citationCoveragePercent).toBe(50);
  });

  it("lists the withheld claims with their reasons", () => {
    const audit = buildEvidenceAudit({ documentId: DOC, documentVersionId: VER, claims, validations, evidence: [evidence()], gate, now: NOW });
    expect(audit.withheldClaims).toHaveLength(1);
    expect(audit.withheldClaims[0].claimId).toBe("c2");
    expect(audit.withheldClaims[0].reasons.join(" ")).toMatch(/missing_evidence/);
  });

  it("states plainly that a rendered report is not proof of complete analysis", () => {
    const audit = buildEvidenceAudit({ documentId: DOC, documentVersionId: VER, claims, validations, evidence: [evidence()], gate, now: NOW });
    expect(audit.statement).toMatch(/not evidence that the financial analysis is complete/i);
    expect(renderEvidenceAudit(audit)).toContain("EVIDENCE AUDIT");
  });

  it("records each citation's resolution and location", () => {
    const audit = buildEvidenceAudit({ documentId: DOC, documentVersionId: VER, claims, validations, evidence: [evidence()], gate, now: NOW });
    const entry = audit.entries.find((row) => row.claimId === "c1")!;
    expect(entry.citations[0].resolved).toBe(true);
    expect(entry.citations[0].locator).toBe("page:12");
    const missing = audit.entries.find((row) => row.claimId === "c2")!;
    expect(missing.citations[0].resolved).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * Adversarial fixtures
 * ------------------------------------------------------------------ */

describe("adversarial fixtures", () => {
  it("rejects a claim carrying misleading units against the evidence", () => {
    const index = buildEvidenceFactIndex([evidence()]);
    const result = validateClaimCitations(
      { text: "Revenue from operations was 1,200 million.", evidenceIds: ["ev_1"] },
      { value: 1200, unit: "million", currency: "INR", period: "FY27", scale: "million" },
      index,
      context,
    );
    expect(result.valid).toBe(false);
    expect(result.problems.map((problem) => problem.code)).toContain("unit_mismatch");
  });

  it("rejects a claim citing the wrong period", () => {
    const index = buildEvidenceFactIndex([evidence()]);
    const result = validateClaimCitations(
      { text: "Revenue from operations was 1,200 crore in FY26.", evidenceIds: ["ev_1"] },
      { value: 1200, unit: "crore", currency: "INR", period: "FY26", scale: "crore" },
      index,
      context,
    );
    expect(result.problems.map((problem) => problem.code)).toContain("period_mismatch");
  });

  it("rejects a malformed citation outright", () => {
    const index = buildEvidenceFactIndex([evidence()]);
    const result = validateClaimCitations({ text: "Revenue was 1,200 crore.", evidenceIds: ["ev_1", "ev_999", ""] }, null, index, context);
    expect(result.valid).toBe(false);
    expect(result.problems.filter((problem) => problem.code === "missing_evidence").length).toBeGreaterThanOrEqual(2);
  });

  it("rejects an unsupported forecast and an incorrect document version together", () => {
    const index = buildEvidenceFactIndex([evidence({ documentVersionId: "filing_1::v9" })]);
    const forecast = claim({
      claimType: "FORECAST",
      text: "Revenue will double next year.",
      assumptions: [],
      method: null,
      uncertainty: null,
      limitations: [],
    });
    const result = validateTypedClaim(forecast, index, context);
    expect(result.publishable).toBe(false);
    expect(result.taxonomyProblems.some((problem) => problem.code === "forecast_incomplete")).toBe(true);
    expect(result.citationProblems.some((problem) => problem.code === "wrong_version")).toBe(true);
  });

  it("never publishes a claim whose arithmetic did not validate", () => {
    const index = buildEvidenceFactIndex([evidence()]);
    const bad = claim({
      claimType: "CALCULATION",
      calculation: { method: "growth", formula: "((c-p)/abs(p))*100", inputFactIds: ["f1", "f2"], result: null, status: "undefined", rounding: "exact", unit: "%" },
    });
    expect(validateTypedClaim(bad, index, context).publishable).toBe(false);
  });
});
