/**
 * Turn an on-device announcement or news item into a filing-intelligence report.
 *
 * This is the bridge between what AnalyzerX actually collects and the PRD's
 * report structure. It is deliberately conservative: an item that is not an
 * official filing is never presented as one, and its classification reflects
 * what it actually is. A news article produces secondary-context evidence, not
 * direct source evidence, so no FACT claim is built from it.
 */

import { buildVerificationReport, type ExtractionSummary, type IdentitySummary, type RetrievalSummary } from "./registry";
import { buildFilingReport, type ReportInput } from "./report";
import { absoluteChange, percentageChange } from "./calculations";
import type { Claim, EvidenceRecord, FilingIdentity, FilingReport, MonitoringItem, StockImplication } from "./types";

export type AnnouncementInput = {
  id: string;
  headline: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
  symbol: string;
  /** True when the item came from an official exchange/regulator endpoint. */
  fromOfficialSource: boolean;
  market: string;
  /** Optional structured numbers, when the source provided them. */
  metrics?: { metric: string; reportedValue: number | null; unit: string | null; priorValue: number | null; locator: string | null }[];
};

/** Which registry source an item's market maps to for the authority check. */
function registryMarket(market: string): string {
  return market || "India";
}

export function buildIdentityFromAnnouncement(input: AnnouncementInput, now: Date): FilingIdentity {
  return {
    filingId: input.id,
    documentVersionId: `${input.id}:v1`,
    companyName: input.symbol || "Unknown issuer",
    ticker: input.symbol || null,
    market: registryMarket(input.market),
    exchange: null,
    regulator: null,
    filingTitle: input.headline,
    filingCategory: input.fromOfficialSource ? "official_disclosure" : "secondary_reporting",
    reportingPeriod: null,
    externalId: null,
    officialUrl: input.url,
    contentSha256: null,
    byteCount: null,
    language: "en",
    supersedesVersionId: null,
    timestamps: {
      publicationUtc: input.publishedAt || null,
      firstSeenUtc: now.toISOString(),
      retrievalUtc: null,
      analysisUtc: now.toISOString(),
      sourceCheckedUtc: now.toISOString(),
    },
  };
}

export function buildReportFromAnnouncement(input: AnnouncementInput, now = new Date()): FilingReport {
  const identity = buildIdentityFromAnnouncement(input, now);
  const evidence: EvidenceRecord[] = [];

  // The announcement text itself is the only evidence this device holds.
  evidence.push({
    evidenceId: "ev_headline",
    documentVersionId: identity.documentVersionId,
    locator: "section:headline",
    kind: input.fromOfficialSource ? "direct_source" : "secondary_context",
    excerpt: input.headline,
  });
  if (input.summary.trim()) {
    evidence.push({
      evidenceId: "ev_summary",
      documentVersionId: identity.documentVersionId,
      locator: "section:summary",
      kind: input.fromOfficialSource ? "direct_source" : "secondary_context",
      excerpt: input.summary.slice(0, 400),
    });
  }

  const retrieval: RetrievalSummary | null = null; // no bytes were fetched for a news item
  const extraction: ExtractionSummary | null = input.summary.trim()
    ? { complete: true, pagesExpected: null, pagesExtracted: null, warnings: [] }
    : { complete: false, pagesExpected: null, pagesExtracted: null, warnings: ["No body text was available for this item."] };
  const identityChecks: IdentitySummary | null = null; // never cross-checked against an official listing

  const verification = buildVerificationReport({
    identity,
    retrieval,
    extraction,
    identityChecks,
    // A news item is not the latest official filing, and the device cannot
    // confirm it is, so this is reported as unconfirmed rather than assumed.
    latestFilingConfirmed: false,
  });

  // Structured facts and deterministic calculations, when the source gave numbers.
  const facts: ReportInput["facts"] = [];
  const calculations = [];
  const claims: Claim[] = [];

  for (const [index, metric] of (input.metrics ?? []).entries()) {
    const factId = `fact_${index}_${metric.metric.replace(/\W+/g, "_").toLowerCase()}`;
    facts.push({
      factId,
      issuerId: identity.companyName,
      metric: metric.metric,
      normalizedValue: metric.reportedValue,
      reportedValue: metric.reportedValue,
      unit: metric.unit,
      currency: null,
      scale: null,
      periodStart: null,
      periodEnd: null,
      valueKind: input.fromOfficialSource ? "reported" : "estimated",
      accountingBasis: "unknown",
      documentVersionId: identity.documentVersionId,
      locator: metric.locator,
      extractionMethod: "source_structured_field",
      validationStatus: metric.reportedValue === null ? "not_checked" : "passed",
    });

    if (metric.priorValue !== null && metric.reportedValue !== null) {
      const pct = percentageChange(metric.reportedValue, metric.priorValue);
      const abs = absoluteChange(metric.reportedValue, metric.priorValue, metric.unit ?? "");
      calculations.push(pct, abs);

      const evId = `ev_metric_${index}`;
      evidence.push({
        evidenceId: evId,
        documentVersionId: identity.documentVersionId,
        locator: metric.locator ?? "section:results",
        kind: input.fromOfficialSource ? "direct_source" : "secondary_context",
        excerpt: `${metric.metric}: ${metric.reportedValue}${metric.unit ? ` ${metric.unit}` : ""} (prior ${metric.priorValue})`,
      });

      if (pct.status === "passed") {
        claims.push({
          claimId: `claim_calc_${index}`,
          text: `${metric.metric} changed by ${pct.result}% versus the prior value.`,
          claimType: "CALCULATION",
          evidenceIds: [evId],
          confidenceRationale:
            "Both values were read from the same source and the change was computed by deterministic code from those inputs.",
          limitations: pct.note ? [pct.note] : [],
          calculation: pct,
        });
      }
    }
  }

  const stance: StockImplication = "uncertain";
  const monitoringItems: MonitoringItem[] = [];

  const positiveFactors: string[] = [];
  const negativeFactors: string[] = [];
  const uncertainties: string[] = [];

  if (!input.fromOfficialSource) {
    uncertainties.push(
      "This item is secondary reporting, not an official filing. No claim here is classified as a FACT, and the primary document should be read before acting.",
    );
  }
  uncertainties.push("The latest official filing could not be independently verified from this device.");

  const summaryBullets = [
    `${identity.companyName}: ${input.headline}`,
    input.summary.trim() ? input.summary.trim().slice(0, 200) : "No body text was available for this item.",
    `Source: ${input.source}${input.fromOfficialSource ? " (official disclosure)" : " (secondary reporting)"}.`,
    `Report status: ${verification.fullyVerified ? "all checks passed" : "incomplete - see the verification panel"}.`,
    "No investment conclusion is drawn from a single item; this is context, not a recommendation.",
  ];

  return buildFilingReport({
    identity,
    verification,
    facts,
    calculations,
    claims,
    evidence,
    summaryBullets,
    positiveFactors,
    negativeFactors,
    uncertainties,
    stockImplications: {
      stance,
      rationale:
        "Stance is uncertain: a single disclosure cannot support a directional view, and no price or valuation evidence is held on this device.",
    },
    researchView: null,
    monitoringItems,
    limitations: [
      "No original document bytes were retrieved, so transport integrity, document identity and extraction completeness could not be checked.",
      "Only the announcement text held on this device was analysed; the full filing was not read.",
    ],
    sources: [{ label: input.source || "source", url: input.url, documentVersionId: identity.documentVersionId }],
    secondaryLanguage: null,
    translatedReport: null,
    translationValidation: null,
    materialSectionMissing: false,
  });
}
