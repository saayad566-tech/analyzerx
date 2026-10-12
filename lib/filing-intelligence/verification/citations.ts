/**
 * Deep citation validation (Prompt 3, section 2).
 *
 * The basic validator checks that an evidence id exists and points at a real
 * location. This one goes further, because those two checks alone let a wrong
 * number through: the evidence can exist, the locator can be valid, and the
 * figure still not be the one the claim asserts.
 *
 * So seven further things are checked, all deterministically:
 *   - the evidence belongs to the intended document and the intended version;
 *   - the locator is valid for the document's actual format;
 *   - the asserted value agrees with the cited evidence;
 *   - unit, currency, period, scale and sign all agree;
 *   - the cited excerpt actually supports the claim's wording;
 *   - a material claim does not rest on an unrelated document;
 *   - the evidence is not stale.
 *
 * Nothing here calls a model. Arithmetic and citation validity are decided by
 * code, as the prompt requires.
 */

import { isLocatorValidForFormat } from "./locators";
import type { DocumentFormat } from "../ingestion/types";

export type CitationEvidenceKind = "direct_source" | "secondary_context" | "platform_interpretation";

export type EvidenceFact = {
  evidenceId: string;
  /** The filing the evidence belongs to. */
  documentId: string;
  /** The exact version of that filing. */
  documentVersionId: string;
  format: DocumentFormat;
  locator: string;
  kind: CitationEvidenceKind;
  /** The supporting text, verbatim where possible. */
  excerpt: string;
  /** Financial attributes, when the evidence is a figure. */
  value: number | null;
  unit: string | null;
  currency: string | null;
  period: string | null;
  scale: string | null;
  sign: "positive" | "negative" | null;
  /** When the evidence was captured, for the staleness check. */
  capturedUtc: string | null;
};

/** What the claim asserts, so it can be compared with the evidence. */
export type AssertedFact = {
  value: number | null;
  unit: string | null;
  currency: string | null;
  period: string | null;
  scale: string | null;
};

export type CitationProblemCode =
  | "missing_evidence"
  | "wrong_document"
  | "wrong_version"
  | "invalid_locator"
  | "value_mismatch"
  | "unit_mismatch"
  | "currency_mismatch"
  | "period_mismatch"
  | "scale_mismatch"
  | "sign_mismatch"
  | "unsupported_claim"
  | "stale_evidence"
  | "unrelated_document";

export type CitationProblem = {
  code: CitationProblemCode;
  detail: string;
  evidenceId?: string;
};

export type DeepCitationResult = {
  valid: boolean;
  problems: CitationProblem[];
  /** The evidence records that were actually resolved. */
  resolved: EvidenceFact[];
};

export type CitationContext = {
  documentId: string;
  documentVersionId: string;
  format: DocumentFormat;
  /** A material claim must not rest on an unrelated document. */
  material: boolean;
  now?: Date;
  /** How long evidence stays fresh. */
  maxAgeHours?: number;
  /** Relative tolerance for a value comparison, e.g. 0.005 for half a percent. */
  valueTolerance?: number;
};

export type EvidenceFactIndex = Map<string, EvidenceFact>;

export function buildEvidenceFactIndex(records: EvidenceFact[]): EvidenceFactIndex {
  const index: EvidenceFactIndex = new Map();
  for (const record of records) index.set(record.evidenceId, record);
  return index;
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "for", "on", "at", "by", "with", "from", "as", "is", "was", "were",
  "are", "be", "been", "this", "that", "these", "those", "it", "its", "has", "have", "had", "than", "then", "which",
  "compared", "versus", "vs", "during", "over", "under", "up", "down", "increase", "increased", "decrease", "decreased",
]);

/** Significant tokens from a piece of text, for the support check. */
export function significantTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9%.\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/^[-.]+|[-.]+$/g, ""))
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

/**
 * Whether the cited excerpts support the claim's wording.
 *
 * Deterministic and deliberately generous: it asks that a reasonable share of
 * the claim's significant tokens appear somewhere in the cited evidence. A
 * claim whose wording shares nothing with its citations is not supported by
 * them, whatever else is true.
 */
export function supportsClaim(claimText: string, excerpts: string[], minimumRatio = 0.4): { supported: boolean; ratio: number; missing: string[] } {
  const claimTokens = significantTokens(claimText);
  if (claimTokens.length === 0) return { supported: true, ratio: 1, missing: [] };
  const haystack = excerpts.join(" ").toLowerCase();
  const missing = claimTokens.filter((token) => !haystack.includes(token));
  const ratio = (claimTokens.length - missing.length) / claimTokens.length;
  return { supported: ratio >= minimumRatio, ratio, missing };
}

function numbersAgree(asserted: number, evidence: number, tolerance: number): boolean {
  if (asserted === evidence) return true;
  const scale = Math.max(Math.abs(asserted), Math.abs(evidence));
  if (scale === 0) return true;
  return Math.abs(asserted - evidence) / scale <= tolerance;
}

function normalise(value: string | null): string | null {
  return value === null ? null : value.trim().toLowerCase();
}

/**
 * Validate every citation on a claim, deeply.
 *
 * An attribute is only compared when the claim asserts it. A claim that does
 * not assert a currency is not failed for the evidence carrying one, but a
 * claim that asserts a currency different from the evidence is.
 */
export function validateClaimCitations(
  claim: { text: string; evidenceIds: string[] },
  asserted: AssertedFact | null,
  index: EvidenceFactIndex,
  context: CitationContext,
): DeepCitationResult {
  const problems: CitationProblem[] = [];
  const resolved: EvidenceFact[] = [];
  const now = context.now ?? new Date();
  const maxAgeHours = context.maxAgeHours ?? 24 * 30;
  const tolerance = context.valueTolerance ?? 0.005;

  if (claim.evidenceIds.length === 0) {
    problems.push({ code: "missing_evidence", detail: "The claim cites no evidence, so it cannot be verified." });
    return { valid: false, problems, resolved };
  }

  for (const id of claim.evidenceIds) {
    const record = index.get(id);
    if (!record) {
      problems.push({ code: "missing_evidence", detail: `Evidence "${id}" does not exist.`, evidenceId: id });
      continue;
    }
    resolved.push(record);

    if (record.documentId !== context.documentId) {
      problems.push({
        code: context.material ? "unrelated_document" : "wrong_document",
        detail: `Evidence "${id}" belongs to document "${record.documentId}", not the intended "${context.documentId}".`,
        evidenceId: id,
      });
    }
    if (record.documentVersionId !== context.documentVersionId) {
      problems.push({
        code: "wrong_version",
        detail: `Evidence "${id}" belongs to version "${record.documentVersionId}", not the intended "${context.documentVersionId}".`,
        evidenceId: id,
      });
    }

    const locator = isLocatorValidForFormat(record.locator, record.format);
    if (!locator.valid) {
      problems.push({ code: "invalid_locator", detail: `Evidence "${id}": ${locator.reason}`, evidenceId: id });
    }

    // Staleness: an old capture is not rejected outright, but a claim resting
    // only on stale evidence is reported as such.
    if (record.capturedUtc) {
      const captured = new Date(record.capturedUtc);
      if (!Number.isNaN(captured.getTime())) {
        const ageHours = (now.getTime() - captured.getTime()) / 3_600_000;
        if (ageHours > maxAgeHours) {
          problems.push({ code: "stale_evidence", detail: `Evidence "${id}" was captured ${Math.round(ageHours)} hours ago, beyond the ${maxAgeHours}-hour freshness window.`, evidenceId: id });
        }
      }
    }
  }

  // Attribute agreement, checked against the first resolved figure-bearing record.
  if (asserted) {
    const figure = resolved.find((record) => record.value !== null || record.unit !== null || record.currency !== null);
    if (figure) {
      if (asserted.value !== null && figure.value !== null && !numbersAgree(asserted.value, figure.value, tolerance)) {
        problems.push({
          code: "value_mismatch",
          detail: `The claim asserts ${asserted.value} but the cited evidence states ${figure.value}.`,
          evidenceId: figure.evidenceId,
        });
      }
      const pairs: [keyof AssertedFact, CitationProblemCode][] = [
        ["unit", "unit_mismatch"],
        ["currency", "currency_mismatch"],
        ["period", "period_mismatch"],
        ["scale", "scale_mismatch"],
      ];
      for (const [attribute, code] of pairs) {
        const assertedValue = normalise(asserted[attribute] as string | null);
        const evidenceValue = normalise(figure[attribute] as string | null);
        if (assertedValue && evidenceValue && assertedValue !== evidenceValue) {
          problems.push({ code, detail: `The claim asserts ${attribute} "${assertedValue}" but the cited evidence states "${evidenceValue}".`, evidenceId: figure.evidenceId });
        }
      }
      if (asserted.value !== null && figure.sign) {
        const assertedSign = asserted.value < 0 ? "negative" : "positive";
        if (assertedSign !== figure.sign) {
          problems.push({ code: "sign_mismatch", detail: `The claim's value reads as ${assertedSign} but the cited evidence is marked ${figure.sign}.`, evidenceId: figure.evidenceId });
        }
      }
    }
  }

  // Does the wording of the claim actually appear in what it cites?
  const direct = resolved.filter((record) => record.kind === "direct_source");
  if (direct.length > 0) {
    const support = supportsClaim(claim.text, direct.map((record) => record.excerpt));
    if (!support.supported) {
      problems.push({
        code: "unsupported_claim",
        detail: `The cited evidence does not support the claim's wording. Unmatched terms: ${support.missing.slice(0, 6).join(", ")}.`,
      });
    }
  }

  return { valid: problems.length === 0, problems, resolved };
}

/** Render a problem set for the report's withheld-claim list. */
export function describeProblems(problems: CitationProblem[]): string {
  return problems.map((problem) => `${problem.code}: ${problem.detail}`).join(" | ");
}
