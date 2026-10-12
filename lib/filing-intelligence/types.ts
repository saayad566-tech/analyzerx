/**
 * Filing Intelligence - data contracts.
 *
 * These types implement the Global AI Financial Filing Intelligence Platform
 * PRD v1.0 on-device: the sections on required filing metadata (6), the
 * financial fact schema (9), claim classification and the evidence model (10),
 * the required report structure (11), the structured output schema (18), and
 * the database entities that matter for a single-device client (15).
 *
 * The PRD's primary rule governs every field here: never invent a source,
 * filing, timestamp, figure, citation, connection status or recommendation. So
 * the shapes below prefer an explicit "unknown" state over a fabricated
 * default, and every time marker is a distinct field rather than one blurred
 * "updated" value.
 */

/* ------------------------------------------------------------------ *
 * Coverage and source registry (PRD sec 5, Appendix B)
 * ------------------------------------------------------------------ */

/**
 * The PRD's coverage ladder. A market is only "production_ready" after
 * documented acceptance tests; the presence of a country in a list never
 * implies its filings are connected.
 */
export type CoverageStatus =
  | "planned"
  | "in_development"
  | "connected"
  | "tested"
  | "degraded"
  | "stale"
  | "blocked"
  | "unsupported"
  | "production_ready";

/** Appendix B: a source status object, populated from runtime state only. */
export type SourceStatus = {
  sourceId: string;
  market: string;
  status: CoverageStatus;
  /** ISO-8601, from an actual successful check. Null when none has happened. */
  lastSuccessfulCheckUtc: string | null;
  lastError: string | null;
  supportedFilingTypes: string[];
  coverageNotes: string;
  credentialsStatus: "not_required" | "configured" | "missing";
  healthCheckVersion: string;
};

/* ------------------------------------------------------------------ *
 * Filing identity (PRD sec 6, 11.1)
 * ------------------------------------------------------------------ */

/**
 * PRD 2: show original publication time, first-seen time, retrieval time,
 * analysis time and source-check time as distinct fields. They are never
 * collapsed, and a missing one is null rather than copied from another.
 */
export type FilingTimestamps = {
  /** When the source says it was published. Null when the source omits it. */
  publicationUtc: string | null;
  /** When this device first observed it. */
  firstSeenUtc: string | null;
  /** When the bytes were retrieved. */
  retrievalUtc: string | null;
  /** When analysis ran. */
  analysisUtc: string | null;
  /** When the source was last checked for a newer filing. */
  sourceCheckedUtc: string | null;
};

export type FilingIdentity = {
  filingId: string;
  documentVersionId: string;
  companyName: string;
  ticker: string | null;
  market: string;
  exchange: string | null;
  regulator: string | null;
  filingTitle: string;
  filingCategory: string;
  reportingPeriod: string | null;
  /** Source-scoped external id. Company name alone is never the unique key. */
  externalId: string | null;
  officialUrl: string;
  /** SHA-256 of the retrieved bytes. Identifies bytes, not authenticity. */
  contentSha256: string | null;
  byteCount: number | null;
  language: string;
  /** Links an amendment/correction to the version it supersedes. */
  supersedesVersionId: string | null;
  timestamps: FilingTimestamps;
};

/* ------------------------------------------------------------------ *
 * Verification (PRD sec 7)
 * ------------------------------------------------------------------ */

export type CheckOutcome = "passed" | "failed" | "not_checked";

/**
 * PRD 7: separate source authority, transport integrity, document identity,
 * extraction completeness and latest-filing status as distinct concepts, and
 * show exactly which checks succeeded. A single vague "verified" badge is
 * explicitly disallowed when key checks failed.
 */
export type VerificationCheck = {
  key:
    | "source_authority"
    | "transport_integrity"
    | "document_identity"
    | "extraction_completeness"
    | "latest_filing";
  label: string;
  outcome: CheckOutcome;
  detail: string;
};

export type VerificationReport = {
  checks: VerificationCheck[];
  /** PRD 7 wording, shown verbatim when the latest filing cannot be confirmed. */
  latestFilingStatement: string;
  /** True only when every check passed. Drives the publication gate. */
  fullyVerified: boolean;
  /** Human label that never overstates: never just "Verified". */
  summaryLabel: string;
};

/* ------------------------------------------------------------------ *
 * Financial facts (PRD sec 9)
 * ------------------------------------------------------------------ */

export type AccountingBasis = "consolidated" | "standalone" | "unknown";
export type FactValueKind = "reported" | "restated" | "estimated" | "company_guidance" | "platform_calculated";

export type FinancialFact = {
  factId: string;
  issuerId: string;
  metric: string;
  /** Normalized value, when a deterministic conversion was applied. */
  normalizedValue: number | null;
  /** The value exactly as printed in the source. */
  reportedValue: number | null;
  unit: string | null;
  currency: string | null;
  scale: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  valueKind: FactValueKind;
  accountingBasis: AccountingBasis;
  documentVersionId: string;
  /** Page/table/XBRL locator. Null when the parser could not locate it. */
  locator: string | null;
  extractionMethod: string;
  validationStatus: "passed" | "failed" | "not_checked";
};

/* ------------------------------------------------------------------ *
 * Calculations (PRD sec 9, Appendix A)
 * ------------------------------------------------------------------ */

export type CalculationStatus = "passed" | "failed" | "not_applicable";

export type Calculation = {
  method: string;
  inputs: string[];
  formula: string;
  /** Null when the calculation is not valid (e.g. non-positive denominator). */
  result: number | null;
  unit: string;
  status: CalculationStatus;
  /** Why the result is null or caveated, in plain language. */
  note: string | null;
};

/* ------------------------------------------------------------------ *
 * Evidence and claims (PRD sec 10, 18)
 * ------------------------------------------------------------------ */

export type EvidenceKind = "direct_source" | "secondary_context" | "platform_interpretation";

export type EvidenceRecord = {
  evidenceId: string;
  documentVersionId: string;
  /** Page, section, table or structured-data locator. */
  locator: string;
  kind: EvidenceKind;
  /** The supporting text, verbatim where possible. */
  excerpt: string;
};

export type ClaimType = "FACT" | "CALCULATION" | "COMPANY_GUIDANCE" | "INTERPRETATION" | "FORECAST";

export type Claim = {
  claimId: string;
  text: string;
  claimType: ClaimType;
  evidenceIds: string[];
  /** Qualitative and explained. Never a fabricated probability. */
  confidenceRationale: string;
  limitations: string[];
  calculation: Calculation | null;
};

export type ClaimValidation = {
  claimId: string;
  valid: boolean;
  errors: string[];
};

/* ------------------------------------------------------------------ *
 * Report (PRD sec 11, 18)
 * ------------------------------------------------------------------ */

export type ReportStatus = "complete" | "incomplete" | "blocked" | "failed";

export type StockImplication = "positive" | "negative" | "mixed" | "neutral" | "uncertain";

export type MonitoringItem = {
  text: string;
  /** Confirmed events vs unconfirmed possibilities, labelled distinctly. */
  confirmed: boolean;
};

export type ResearchView = {
  conclusion: string;
  evidence: string[];
  opposingEvidence: string[];
  horizon: string;
  assumptions: string[];
  risks: string[];
  confidenceRationale: string;
  /** Conditions that would change the view. */
  changeConditions: string[];
};

export type FilingReport = {
  filingId: string;
  documentVersionId: string;
  reportStatus: ReportStatus;
  /** 5-7 plain-language bullets. */
  summaryBullets: string[];
  filingIdentity: FilingIdentity;
  verification: VerificationReport;
  facts: FinancialFact[];
  calculations: Calculation[];
  positiveFactors: string[];
  negativeFactors: string[];
  uncertainties: string[];
  stockImplications: { stance: StockImplication; rationale: string };
  researchView: ResearchView | null;
  monitoringItems: MonitoringItem[];
  limitations: string[];
  sources: { label: string; url: string; documentVersionId: string }[];
  claims: Claim[];
  englishReport: string;
  secondaryLanguage: string | null;
  translatedReport: string | null;
  validationResults: ClaimValidation[];
};
