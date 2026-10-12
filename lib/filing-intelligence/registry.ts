/**
 * Source registry and verification panel (PRD sec 5, 7, Appendix B).
 *
 * PRD 5: maintain a registry of sources with coverage status, and never label a
 * source live or fully supported until its integration is implemented, tested,
 * monitored and documented. The presence of a country in a dropdown does not
 * mean its filings are connected.
 *
 * PRD 7: show exactly which checks succeeded and which did not, and never use a
 * single vague "verified" badge when key checks failed. A cryptographic hash
 * proves matching bytes, not issuer authenticity.
 */

import type { CheckOutcome, CoverageStatus, FilingIdentity, SourceStatus, VerificationCheck, VerificationReport } from "./types";

export const LATEST_FILING_UNCONFIRMED = "Latest filing status could not be independently verified.";

/**
 * The registry reflects what this build actually integrates. A source is only
 * marked beyond "planned" once its adapter exists in the codebase; it is only
 * "tested" once a genuine document has been retrieved through it.
 *
 * In AnalyzerX, the NSE public endpoints are the integrated Indian source. The
 * SEC and other markets are declared here as registry entries with an honest
 * "planned" status so the coverage matrix does not overstate support.
 */
export const SOURCE_REGISTRY: SourceStatus[] = [
  {
    sourceId: "nse_equity_master",
    market: "India",
    status: "connected",
    lastSuccessfulCheckUtc: null,
    lastError: null,
    supportedFilingTypes: ["equity_listing", "index_constituents"],
    coverageNotes: "NSE index and equity master CSVs. Health is populated from actual fetch results at runtime.",
    credentialsStatus: "not_required",
    healthCheckVersion: "analyzerx-nse-1",
  },
  {
    sourceId: "nse_corporate_announcements",
    market: "India",
    status: "connected",
    lastSuccessfulCheckUtc: null,
    lastError: null,
    supportedFilingTypes: ["corporate_announcement", "board_meeting", "financial_results"],
    coverageNotes: "NSE corporate announcements. Coverage is limited to what the endpoint actually returns for the queried symbol or index.",
    credentialsStatus: "not_required",
    healthCheckVersion: "analyzerx-nse-1",
  },
  {
    sourceId: "nse_fii_dii_flows",
    market: "India",
    status: "connected",
    lastSuccessfulCheckUtc: null,
    lastError: null,
    supportedFilingTypes: ["participant_flows"],
    coverageNotes: "NSE FII/DII participant-wise activity. History depends on a multi-request backfill that can be slow on a poor connection.",
    credentialsStatus: "not_required",
    healthCheckVersion: "analyzerx-nse-1",
  },
  {
    sourceId: "sec_edgar_submissions",
    market: "United States",
    status: "planned",
    lastSuccessfulCheckUtc: null,
    lastError: null,
    supportedFilingTypes: [],
    coverageNotes: "SEC EDGAR company submissions and XBRL company facts. Adapter boundary reserved; not integrated in this build, so the source is not labelled live.",
    credentialsStatus: "not_required",
    healthCheckVersion: "analyzerx-sec-0",
  },
  {
    sourceId: "fca_nsm",
    market: "United Kingdom",
    status: "planned",
    lastSuccessfulCheckUtc: null,
    lastError: null,
    supportedFilingTypes: [],
    coverageNotes: "FCA National Storage Mechanism and LSE disclosures. Not integrated; listed for the coverage matrix only.",
    credentialsStatus: "not_required",
    healthCheckVersion: "analyzerx-uk-0",
  },
  {
    sourceId: "esma_esap",
    market: "Europe",
    status: "unsupported",
    lastSuccessfulCheckUtc: null,
    lastError: null,
    supportedFilingTypes: [],
    coverageNotes: "ESMA ESAP services. Marked unsupported rather than planned until an official interface is confirmed and tested.",
    credentialsStatus: "not_required",
    healthCheckVersion: "analyzerx-eu-0",
  },
];

/** Coverage states where a source may be presented as usable to the user. */
const LIVE_STATES: CoverageStatus[] = ["connected", "tested", "production_ready"];

export function isLiveSource(status: CoverageStatus): boolean {
  return LIVE_STATES.includes(status);
}

/** Short, honest label for a coverage status. */
export function coverageLabel(status: CoverageStatus): string {
  switch (status) {
    case "planned":
      return "Planned";
    case "in_development":
      return "In development";
    case "connected":
      return "Connected";
    case "tested":
      return "Tested";
    case "degraded":
      return "Degraded";
    case "stale":
      return "Stale";
    case "unsupported":
      return "Unsupported";
    case "production_ready":
      return "Production-ready";
  }
}

/** A runtime health record for one source, from an actual fetch attempt. */
export type SourceHealthRecord = {
  sourceId: string;
  lastSuccessfulCheckUtc: string | null;
  lastError: string | null;
  checkedUtc: string | null;
};

/**
 * Build the Appendix B status object from real runtime state.
 *
 * PRD Appendix B is explicit that these fields must be populated from actual
 * runtime state and that an example timestamp must never be hardcoded as if it
 * were a real successful check. So a source with no recorded success reports
 * null and is downgraded to "stale" rather than claiming health.
 */
export function buildSourceStatus(entry: SourceStatus, health: SourceHealthRecord | undefined): SourceStatus {
  if (!health) {
    // No check has run. A connected source with no evidence of a successful
    // check is not healthy - it is stale until proven otherwise.
    return {
      ...entry,
      status: isLiveSource(entry.status) ? "stale" : entry.status,
      lastSuccessfulCheckUtc: null,
      lastError: null,
    };
  }
  const base: SourceStatus = {
    ...entry,
    lastSuccessfulCheckUtc: health.lastSuccessfulCheckUtc,
    lastError: health.lastError,
  };
  if (!isLiveSource(entry.status)) return base;
  if (health.lastError) return { ...base, status: "degraded" };
  if (!health.lastSuccessfulCheckUtc) return { ...base, status: "stale" };
  return base;
}

export function buildRegistry(health: SourceHealthRecord[]): SourceStatus[] {
  const byId = new Map(health.map((record) => [record.sourceId, record]));
  return SOURCE_REGISTRY.map((entry) => buildSourceStatus(entry, byId.get(entry.sourceId)));
}

/* ------------------------------------------------------------------ *
 * Verification panel (PRD sec 7)
 * ------------------------------------------------------------------ */

export type ExtractionSummary = {
  /** Did extraction complete without a material gap? */
  complete: boolean;
  pagesExpected: number | null;
  pagesExtracted: number | null;
  warnings: string[];
};

export type RetrievalSummary = {
  httpStatus: number | null;
  contentType: string | null;
  /** Did the final URL stay on an approved source domain? */
  finalUrlApproved: boolean;
  /** Did the byte count match what the source advertised, when known? */
  byteCountMatched: boolean | null;
  /** Result of the SHA-256 comparison, when a hash was available. */
  hashMatched: boolean | null;
};

export type IdentitySummary = {
  /** Did the issuer/external id on the document match the registry entry? */
  issuerMatched: boolean | null;
  externalIdMatched: boolean | null;
  publicationDateMatched: boolean | null;
};

function check(key: VerificationCheck["key"], label: string, outcome: CheckOutcome, detail: string): VerificationCheck {
  return { key, label, outcome, detail };
}

/**
 * Compose the verification report from the individual signals.
 *
 * Each concept is kept separate, exactly as PRD 7 requires: source authority,
 * transport integrity, document identity, extraction completeness and latest
 * filing status are five distinct checks with five distinct outcomes.
 */
export function buildVerificationReport(input: {
  identity: FilingIdentity;
  retrieval: RetrievalSummary | null;
  extraction: ExtractionSummary | null;
  identityChecks: IdentitySummary | null;
  latestFilingConfirmed: boolean;
}): VerificationReport {
  const checks: VerificationCheck[] = [];

  // 1. Source authority
  const registryEntry = SOURCE_REGISTRY.find((entry) => entry.market === input.identity.market);
  if (!registryEntry) {
    checks.push(check("source_authority", "Source authority", "not_checked", `No registry entry for market "${input.identity.market}".`));
  } else if (!isLiveSource(registryEntry.status)) {
    checks.push(
      check("source_authority", "Source authority", "failed", `Source "${registryEntry.sourceId}" is ${coverageLabel(registryEntry.status)}, not a live approved source.`),
    );
  } else {
    checks.push(check("source_authority", "Source authority", "passed", `Retrieved from approved source "${registryEntry.sourceId}".`));
  }

  // 2. Transport integrity
  if (!input.retrieval) {
    checks.push(check("transport_integrity", "Transport integrity", "not_checked", "No retrieval record for this document."));
  } else {
    const r = input.retrieval;
    const problems: string[] = [];
    if (r.httpStatus === null) problems.push("no HTTP status recorded");
    else if (r.httpStatus < 200 || r.httpStatus >= 300) problems.push(`HTTP ${r.httpStatus}`);
    if (!r.finalUrlApproved) problems.push("final URL left the approved source domain");
    if (r.byteCountMatched === false) problems.push("byte count did not match the source");
    if (r.hashMatched === false) problems.push("content hash did not match");
    checks.push(
      problems.length
        ? check("transport_integrity", "Transport integrity", "failed", problems.join("; ") + ".")
        : check(
            "transport_integrity",
            "Transport integrity",
            "passed",
            `HTTP ${r.httpStatus}, ${r.contentType ?? "content type unknown"}; final URL on the approved domain.`,
          ),
    );
  }

  // 3. Document identity
  if (!input.identityChecks) {
    checks.push(check("document_identity", "Document identity", "not_checked", "No identity cross-check was performed."));
  } else {
    const i = input.identityChecks;
    const problems: string[] = [];
    if (i.issuerMatched === false) problems.push("issuer did not match the registry");
    if (i.externalIdMatched === false) problems.push("external id did not match");
    if (i.publicationDateMatched === false) problems.push("publication date did not match");
    const inconclusive = [i.issuerMatched, i.externalIdMatched, i.publicationDateMatched].some((value) => value === null);
    if (problems.length) {
      checks.push(check("document_identity", "Document identity", "failed", problems.join("; ") + "."));
    } else if (inconclusive) {
      checks.push(check("document_identity", "Document identity", "not_checked", "Some identity fields could not be cross-checked against the official listing."));
    } else {
      checks.push(check("document_identity", "Document identity", "passed", "Issuer, external id and publication date matched the official listing."));
    }
  }

  // 4. Extraction completeness
  if (!input.extraction) {
    checks.push(check("extraction_completeness", "Extraction completeness", "not_checked", "No extraction record for this document."));
  } else {
    const e = input.extraction;
    if (!e.complete) {
      checks.push(
        check(
          "extraction_completeness",
          "Extraction completeness",
          "failed",
          e.warnings.length ? e.warnings.join("; ") : "Extraction did not complete.",
        ),
      );
    } else if (e.pagesExpected !== null && e.pagesExtracted !== null && e.pagesExtracted < e.pagesExpected) {
      checks.push(
        check("extraction_completeness", "Extraction completeness", "failed", `Extracted ${e.pagesExtracted} of ${e.pagesExpected} pages.`),
      );
    } else {
      checks.push(check("extraction_completeness", "Extraction completeness", "passed", "Extraction completed with no material gap."));
    }
  }

  // 5. Latest filing status
  checks.push(
    input.latestFilingConfirmed
      ? check("latest_filing", "Latest filing status", "passed", "The relevant official source was checked and this is the newest matching filing.")
      : check("latest_filing", "Latest filing status", "failed", LATEST_FILING_UNCONFIRMED),
  );

  const fullyVerified = checks.every((entry) => entry.outcome === "passed");
  const passed = checks.filter((entry) => entry.outcome === "passed").length;
  const failed = checks.filter((entry) => entry.outcome === "failed").length;

  // PRD 7: never a single vague "verified" badge when key checks failed.
  const summaryLabel = fullyVerified
    ? "All checks passed"
    : failed > 0
      ? `Partially verified - ${passed} of ${checks.length} checks passed, ${failed} failed`
      : `Partly checked - ${passed} of ${checks.length} checks passed, ${checks.length - passed} not checked`;

  return {
    checks,
    latestFilingStatement: input.latestFilingConfirmed ? "Latest filing status confirmed." : LATEST_FILING_UNCONFIRMED,
    fullyVerified,
    summaryLabel,
  };
}
