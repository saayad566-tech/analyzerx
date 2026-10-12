/**
 * Evidence model, citation validation and claim classification (PRD sec 10, 18).
 *
 * PRD 10 requires every material claim to reference one or more evidence IDs,
 * each evidence item to reference a document version and a valid locator, and
 * a citation validator that rejects nonexistent evidence IDs and invalid
 * document locations. PRD 18 requires structured output to be validated
 * against a schema, with malformed or unsupported claims rejected rather than
 * published.
 *
 * PRD 10 also requires claims to be classified as FACT, CALCULATION,
 * COMPANY_GUIDANCE, INTERPRETATION or FORECAST, and confidence to be an
 * explained qualitative assessment rather than a fabricated probability. The
 * validator enforces the rules that follow from that: a CALCULATION must carry
 * a passing calculation, a FACT must carry source evidence, and confidence
 * must be explained.
 */

import type { Claim, ClaimType, ClaimValidation, EvidenceRecord } from "./types";

export const CLAIM_TYPES: ClaimType[] = ["FACT", "CALCULATION", "COMPANY_GUIDANCE", "INTERPRETATION", "FORECAST"];

/** A locator must point at a real position: a page, section, table or XBRL tag. */
const LOCATOR_PATTERN = /^(page:\d+|section:.+|table:.+|xbrl:.+|note:\d+|para:\d+)$/i;

export function isValidLocator(locator: string | null | undefined): boolean {
  return typeof locator === "string" && LOCATOR_PATTERN.test(locator.trim());
}

export type EvidenceIndex = Map<string, EvidenceRecord>;

export function buildEvidenceIndex(records: EvidenceRecord[]): EvidenceIndex {
  const index: EvidenceIndex = new Map();
  for (const record of records) index.set(record.evidenceId, record);
  return index;
}

export type CitationResult = {
  valid: boolean;
  /** Evidence IDs the claim referenced that do not exist. */
  missingEvidenceIds: string[];
  /** Evidence IDs that exist but carry no valid document locator. */
  invalidLocators: { evidenceId: string; locator: string }[];
  /** Evidence IDs that belong to a different document version than the claim. */
  versionMismatches: { evidenceId: string; documentVersionId: string }[];
};

/**
 * Citation validator. Rejects nonexistent evidence IDs and invalid document
 * locations, and additionally flags evidence pointing at a different document
 * version than the one the claim belongs to.
 */
export function validateCitations(claim: Claim, index: EvidenceIndex, documentVersionId: string): CitationResult {
  const missingEvidenceIds: string[] = [];
  const invalidLocators: { evidenceId: string; locator: string }[] = [];
  const versionMismatches: { evidenceId: string; documentVersionId: string }[] = [];

  for (const id of claim.evidenceIds) {
    const record = index.get(id);
    if (!record) {
      missingEvidenceIds.push(id);
      continue;
    }
    if (!isValidLocator(record.locator)) invalidLocators.push({ evidenceId: id, locator: record.locator });
    if (record.documentVersionId !== documentVersionId) {
      versionMismatches.push({ evidenceId: id, documentVersionId: record.documentVersionId });
    }
  }

  return {
    valid: missingEvidenceIds.length === 0 && invalidLocators.length === 0 && versionMismatches.length === 0,
    missingEvidenceIds,
    invalidLocators,
    versionMismatches,
  };
}

/** Vague confidence wording the PRD forbids (a fabricated probability). */
const FABRICATED_PROBABILITY = /\b\d{1,3}\s*%\s*(confiden|sure|certain)|confidence\s*(of|:)?\s*\d{1,3}\s*%/i;

/**
 * Validate one claim against the PRD's rules. Returns every problem found
 * rather than stopping at the first, so the report can disclose them all.
 */
export function validateClaim(claim: Claim, index: EvidenceIndex, documentVersionId: string): ClaimValidation {
  const errors: string[] = [];

  if (!claim.claimId?.trim()) errors.push("Claim has no claim_id.");
  if (!claim.text?.trim()) errors.push("Claim has no text.");
  if (!CLAIM_TYPES.includes(claim.claimType)) errors.push(`Unrecognized claim_type "${claim.claimType}".`);

  // PRD 10: every material claim must reference one or more evidence IDs.
  if (claim.evidenceIds.length === 0) {
    errors.push("Claim references no evidence. Unsupported claims are not published.");
  } else {
    const citations = validateCitations(claim, index, documentVersionId);
    if (citations.missingEvidenceIds.length) {
      errors.push(`Unknown evidence id(s): ${citations.missingEvidenceIds.join(", ")}.`);
    }
    if (citations.invalidLocators.length) {
      errors.push(
        `Evidence with an invalid locator: ${citations.invalidLocators
          .map((entry) => `${entry.evidenceId} ("${entry.locator}")`)
          .join(", ")}.`,
      );
    }
    if (citations.versionMismatches.length) {
      errors.push(
        `Evidence from a different document version: ${citations.versionMismatches
          .map((entry) => `${entry.evidenceId} -> ${entry.documentVersionId}`)
          .join(", ")}.`,
      );
    }
  }

  // PRD 9/10: a CALCULATION must carry a deterministic calculation that passed.
  if (claim.claimType === "CALCULATION") {
    if (!claim.calculation) {
      errors.push("A CALCULATION claim must include its calculation details.");
    } else if (claim.calculation.status !== "passed") {
      errors.push(
        `A CALCULATION claim must be backed by a passing calculation (status "${claim.calculation.status}"${
          claim.calculation.note ? `: ${claim.calculation.note}` : ""
        }).`,
      );
    }
  }

  // PRD 10: a FACT must be supported by direct source evidence, not interpretation.
  if (claim.claimType === "FACT") {
    const hasDirectSource = claim.evidenceIds.some((id) => index.get(id)?.kind === "direct_source");
    if (!hasDirectSource) {
      errors.push("A FACT must be supported by direct source evidence, not only secondary or interpreted context.");
    }
  }

  // PRD 10/18: confidence is an explained qualitative assessment, never a probability.
  if (!claim.confidenceRationale?.trim()) {
    errors.push("Claim has no confidence_rationale; confidence must be explained.");
  } else if (FABRICATED_PROBABILITY.test(claim.confidenceRationale)) {
    errors.push("Confidence must be a qualitative rationale, not a fabricated probability.");
  }

  // PRD 10: limitations must be recorded for interpreted and forward-looking claims.
  if ((claim.claimType === "INTERPRETATION" || claim.claimType === "FORECAST") && claim.limitations.length === 0) {
    errors.push(`A ${claim.claimType} claim must record its limitations.`);
  }

  // PRD 10: a FORECAST requires explicit methodology, assumptions and uncertainty.
  if (claim.claimType === "FORECAST" && claim.confidenceRationale.trim().length < 40) {
    errors.push("A FORECAST must state its methodology, assumptions and uncertainty.");
  }

  return { claimId: claim.claimId, valid: errors.length === 0, errors };
}

/** Validate a whole set of claims. */
export function validateClaims(claims: Claim[], records: EvidenceRecord[], documentVersionId: string): ClaimValidation[] {
  const index = buildEvidenceIndex(records);
  return claims.map((claim) => validateClaim(claim, index, documentVersionId));
}

/**
 * PRD 18: validate the structured output shape before anything is rendered.
 * Missing required keys are reported by name so the gap is visible.
 */
export function validateReportSchema(candidate: unknown): { valid: boolean; missing: string[]; errors: string[] } {
  const required = [
    "filingId",
    "documentVersionId",
    "reportStatus",
    "summaryBullets",
    "facts",
    "calculations",
    "positiveFactors",
    "negativeFactors",
    "uncertainties",
    "stockImplications",
    "monitoringItems",
    "limitations",
    "sources",
    "claims",
    "englishReport",
    "validationResults",
  ];
  if (typeof candidate !== "object" || candidate === null) {
    return { valid: false, missing: required, errors: ["Structured output is not an object."] };
  }
  const record = candidate as Record<string, unknown>;
  const missing = required.filter((key) => !(key in record));
  const errors: string[] = [];
  if (missing.length) errors.push(`Missing required field(s): ${missing.join(", ")}.`);
  if (Array.isArray(record.summaryBullets) && (record.summaryBullets.length < 5 || record.summaryBullets.length > 7)) {
    errors.push("summary_bullets must contain five to seven bullets.");
  }
  return { valid: errors.length === 0, missing, errors };
}
