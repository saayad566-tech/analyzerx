/**
 * Report assembly and safe fallback (PRD sec 11, 18).
 *
 * PRD 11 lists the eleven required report sections. PRD 18 defines the safe
 * fallback behaviour: if retrieval fails, no analysis based on a supposed live
 * document; if extraction is incomplete, limit analysis and disclose it; if
 * evidence validation fails, do not publish unsupported claims; if translation
 * validation fails, keep English and mark the translation unavailable; if the
 * model is unavailable, show a failure rather than a fabricated result.
 *
 * The publication gate lives here: claims that fail validation are dropped from
 * the published report and counted, so the report can never carry an
 * unsupported claim.
 */

import { validateReportSchema, validateClaims } from "./evidence";
import type {
  Calculation,
  Claim,
  EvidenceRecord,
  FilingIdentity,
  FilingReport,
  MonitoringItem,
  ReportStatus,
  ResearchView,
  StockImplication,
  VerificationReport,
} from "./types";

export type ReportInput = {
  identity: FilingIdentity;
  verification: VerificationReport;
  facts: FilingReport["facts"];
  calculations: Calculation[];
  claims: Claim[];
  evidence: EvidenceRecord[];
  summaryBullets: string[];
  positiveFactors: string[];
  negativeFactors: string[];
  uncertainties: string[];
  stockImplications: { stance: StockImplication; rationale: string };
  researchView: ResearchView | null;
  monitoringItems: MonitoringItem[];
  limitations: string[];
  sources: { label: string; url: string; documentVersionId: string }[];
  secondaryLanguage: string | null;
  translatedReport: string | null;
  /** Result of the cross-language structural/numeric check, when run. */
  translationValidation: { passed: boolean; problems: string[] } | null;
  /** True when a material section could not be read. */
  materialSectionMissing?: boolean;
};

/**
 * Assemble the report, apply the publication gate, and set an honest status.
 */
export function buildFilingReport(input: ReportInput): FilingReport {
  const validationResults = validateClaims(input.claims, input.evidence, input.identity.documentVersionId);
  const validIds = new Set(validationResults.filter((result) => result.valid).map((result) => result.claimId));
  // PRD 18: unsupported claims are not published.
  const publishedClaims = input.claims.filter((claim) => validIds.has(claim.claimId));
  const rejectedCount = input.claims.length - publishedClaims.length;

  const limitations = [...input.limitations];
  if (rejectedCount > 0) {
    limitations.push(
      `${rejectedCount} claim${rejectedCount === 1 ? "" : "s"} failed evidence or schema validation and ${
        rejectedCount === 1 ? "was" : "were"
      } withheld from this report.`,
    );
  }

  // PRD 18: if a material section is unreadable, publication is blocked.
  let reportStatus: ReportStatus;
  if (input.materialSectionMissing) {
    reportStatus = "blocked";
  } else if (!input.verification.fullyVerified || rejectedCount > 0 || !input.verification.checks.every((c) => c.outcome !== "not_checked")) {
    reportStatus = "incomplete";
  } else {
    reportStatus = "complete";
  }

  // PRD 12/18: a failed translation check keeps English and marks the other
  // language unavailable rather than shipping a changed figure.
  let secondaryLanguage = input.secondaryLanguage;
  let translatedReport = input.translatedReport;
  if (secondaryLanguage && input.translationValidation && !input.translationValidation.passed) {
    limitations.push(
      `The ${secondaryLanguage} version failed consistency checks (${input.translationValidation.problems.join("; ")}) and is withheld; the English report is authoritative.`,
    );
    translatedReport = null;
  }

  const report: FilingReport = {
    filingId: input.identity.filingId,
    documentVersionId: input.identity.documentVersionId,
    reportStatus,
    summaryBullets: input.summaryBullets.slice(0, 7),
    filingIdentity: input.identity,
    verification: input.verification,
    facts: input.facts,
    calculations: input.calculations,
    positiveFactors: input.positiveFactors,
    negativeFactors: input.negativeFactors,
    uncertainties: input.uncertainties,
    stockImplications: input.stockImplications,
    researchView: input.researchView,
    monitoringItems: input.monitoringItems,
    limitations,
    sources: input.sources,
    claims: publishedClaims,
    englishReport: "",
    secondaryLanguage,
    translatedReport,
    validationResults,
  };

  // PRD 18: validate the assembled structured output before it is rendered.
  const schema = validateReportSchema(report);
  if (!schema.valid) {
    report.reportStatus = "incomplete";
    report.limitations.push(`Structured output failed schema validation: ${schema.errors.join(" ")}`);
  }

  report.englishReport = renderEnglishReport(report);
  return report;
}

/** Plain-text English report covering the eleven required sections. */
export function renderEnglishReport(report: FilingReport): string {
  const lines: string[] = [];
  const id = report.filingIdentity;
  const t = id.timestamps;

  lines.push(`FILING INTELLIGENCE REPORT`);
  lines.push(`Status: ${report.reportStatus.toUpperCase()}`);
  lines.push("");

  lines.push("1. FILING IDENTITY");
  lines.push(`  Company: ${id.companyName}${id.ticker ? ` (${id.ticker})` : ""}`);
  lines.push(`  Market: ${id.market}${id.exchange ? ` | Exchange: ${id.exchange}` : ""}${id.regulator ? ` | Regulator: ${id.regulator}` : ""}`);
  lines.push(`  Filing: ${id.filingTitle} (${id.filingCategory})`);
  lines.push(`  Reporting period: ${id.reportingPeriod ?? "not stated"}`);
  lines.push(`  Published: ${t.publicationUtc ?? "not stated by the source"}`);
  lines.push(`  First seen: ${t.firstSeenUtc ?? "unknown"} | Retrieved: ${t.retrievalUtc ?? "unknown"} | Analysed: ${t.analysisUtc ?? "unknown"}`);
  lines.push(`  Source checked: ${t.sourceCheckedUtc ?? "not checked"}`);
  lines.push(`  Source: ${id.officialUrl}`);
  lines.push(`  Verification: ${report.verification.summaryLabel}`);
  lines.push("");

  lines.push("2. ONE-MINUTE SUMMARY");
  report.summaryBullets.forEach((bullet) => lines.push(`  - ${bullet}`));
  lines.push("");

  lines.push("3. WHAT THE COMPANY DISCLOSED");
  if (report.facts.length === 0) lines.push("  No structured facts were extracted.");
  for (const fact of report.facts) {
    const value = fact.reportedValue ?? "unavailable";
    lines.push(`  - ${fact.metric}: ${value}${fact.unit ? ` ${fact.unit}` : ""} [${fact.valueKind}, ${fact.accountingBasis}] @ ${fact.locator ?? "no locator"}`);
  }
  lines.push("");

  lines.push("4. FINANCIAL COMPARISON");
  if (report.calculations.length === 0) lines.push("  No calculations were produced.");
  for (const calc of report.calculations) {
    lines.push(`  - ${calc.method}: ${calc.result ?? "not applicable"} ${calc.unit} (${calc.formula})${calc.note ? ` -- ${calc.note}` : ""}`);
  }
  lines.push("");

  lines.push("5. POSITIVE FACTORS");
  if (!report.positiveFactors.length) lines.push("  None identified from the available evidence.");
  report.positiveFactors.forEach((factor) => lines.push(`  - ${factor}`));
  lines.push("");

  lines.push("6. NEGATIVE FACTORS AND RISKS");
  if (!report.negativeFactors.length) lines.push("  None identified from the available evidence.");
  report.negativeFactors.forEach((factor) => lines.push(`  - ${factor}`));
  if (report.uncertainties.length) {
    lines.push("  Uncertainties:");
    report.uncertainties.forEach((item) => lines.push(`    - ${item}`));
  }
  lines.push("");

  lines.push("7. POTENTIAL STOCK IMPLICATIONS");
  lines.push(`  Stance: ${report.stockImplications.stance}`);
  lines.push(`  ${report.stockImplications.rationale}`);
  lines.push("");

  lines.push("8. RESEARCH VIEW");
  if (!report.researchView) {
    lines.push("  Insufficient evidence for a research view.");
  } else {
    const view = report.researchView;
    lines.push(`  Conclusion: ${view.conclusion}`);
    lines.push(`  Horizon: ${view.horizon}`);
    if (view.evidence.length) { lines.push("  Supporting evidence:"); view.evidence.forEach((e) => lines.push(`    - ${e}`)); }
    if (view.opposingEvidence.length) { lines.push("  Opposing evidence:"); view.opposingEvidence.forEach((e) => lines.push(`    - ${e}`)); }
    if (view.assumptions.length) { lines.push("  Assumptions:"); view.assumptions.forEach((a) => lines.push(`    - ${a}`)); }
    if (view.risks.length) { lines.push("  Risks:"); view.risks.forEach((r) => lines.push(`    - ${r}`)); }
    lines.push(`  Confidence: ${view.confidenceRationale}`);
    if (view.changeConditions.length) { lines.push("  What would change this view:"); view.changeConditions.forEach((c) => lines.push(`    - ${c}`)); }
  }
  lines.push("");

  lines.push("9. WHAT TO MONITOR NEXT");
  if (!report.monitoringItems.length) lines.push("  Nothing specific identified.");
  for (const item of report.monitoringItems) {
    lines.push(`  - ${item.confirmed ? "[confirmed]" : "[unconfirmed possibility]"} ${item.text}`);
  }
  lines.push("");

  lines.push("10. SOURCES AND METHODOLOGY");
  for (const source of report.sources) {
    lines.push(`  - ${source.label}: ${source.url} (document version ${source.documentVersionId})`);
  }
  lines.push(`  Calculations are deterministic and carry their formula and inputs.`);
  lines.push(`  Analysis time: ${report.filingIdentity.timestamps.analysisUtc ?? "unknown"}`);
  lines.push("");

  lines.push("11. DISCLAIMER AND LIMITATIONS");
  lines.push("  Informational only, not investment advice. It does not execute trades and does not provide");
  lines.push("  individualized portfolio advice. Model and source limitations apply, and uncertainty is retained.");
  for (const limitation of report.limitations) lines.push(`  - ${limitation}`);

  return lines.join("\n");
}

/* ------------------------------------------------------------------ *
 * Safe fallback (PRD sec 18)
 * ------------------------------------------------------------------ */

export type FallbackReason = "retrieval_failed" | "extraction_incomplete" | "evidence_validation_failed" | "translation_validation_failed" | "model_unavailable";

export type FallbackOutcome = {
  reason: FallbackReason;
  /** Whether an English report may still be produced. */
  publishEnglish: boolean;
  /** What the user is shown instead of a fabricated result. */
  message: string;
};

/**
 * PRD 18 safe fallback. None of these paths fabricate a result.
 */
export function resolveFallback(reason: FallbackReason, detail?: string): FallbackOutcome {
  const suffix = detail ? ` (${detail})` : "";
  switch (reason) {
    case "retrieval_failed":
      return {
        reason,
        publishEnglish: false,
        message: `The document could not be retrieved, so no analysis was performed on it${suffix}. Nothing is shown for a document that was not actually fetched.`,
      };
    case "extraction_incomplete":
      return {
        reason,
        publishEnglish: true,
        message: `Extraction was incomplete${suffix}. Analysis is limited to the readable portions and this incompleteness is disclosed.`,
      };
    case "evidence_validation_failed":
      return {
        reason,
        publishEnglish: true,
        message: `Some claims failed evidence validation${suffix} and were withheld. The report is marked incomplete.`,
      };
    case "translation_validation_failed":
      return {
        reason,
        publishEnglish: true,
        message: `The secondary-language version failed consistency checks${suffix}. The English report remains available and the translation is marked unavailable.`,
      };
    case "model_unavailable":
      return {
        reason,
        publishEnglish: false,
        message: `The analysis model is unavailable${suffix}. The job is queued or reported as failed; no completed result is fabricated.`,
      };
  }
}
