/**
 * Claim taxonomy enforcement (Prompt 3, section 1).
 *
 * Four classifications are permitted, and each carries its own obligations:
 *
 *   FACT            direct supporting evidence, nothing inferred
 *   CALCULATION     a validated calculation, and the input facts it used
 *   INTERPRETATION  observed facts separated from reasoning, plus material
 *                   limitations
 *   FORECAST        assumptions, method, uncertainty, limitations and evidence
 *
 * One further rule is enforced in code because it is the easiest to break by
 * accident: an analyst's interpretation must never be published as a reported
 * company fact. A claim typed FACT whose own wording carries interpretive
 * markers is rejected, not relabelled silently.
 */

import { validateClaimCitations, type AssertedFact, type CitationContext, type CitationProblem, type EvidenceFactIndex } from "./citations";

export type TypedClaimType = "FACT" | "CALCULATION" | "INTERPRETATION" | "FORECAST";

export const TYPED_CLAIM_TYPES: TypedClaimType[] = ["FACT", "CALCULATION", "INTERPRETATION", "FORECAST"];

export type CalculationRef = {
  method: string;
  formula: string;
  /** The fact ids the calculation consumed. */
  inputFactIds: string[];
  result: number | null;
  status: "ok" | "undefined" | "insufficient_inputs" | "blocked";
  rounding: string;
  unit: string;
};

export type TypedClaim = {
  claimId: string;
  text: string;
  claimType: TypedClaimType;
  evidenceIds: string[];
  /** The figure the claim asserts, when it asserts one. */
  asserted: AssertedFact | null;
  calculation: CalculationRef | null;
  /** INTERPRETATION: what was observed in the source. */
  observedFacts: string[];
  /** INTERPRETATION: the reasoning that connects the observations. */
  reasoning: string | null;
  /** FORECAST: the assumptions the projection rests on. */
  assumptions: string[];
  /** FORECAST: the method used. */
  method: string | null;
  /** FORECAST: the uncertainty statement. */
  uncertainty: string | null;
  limitations: string[];
  confidenceRationale: string;
};

export type TaxonomyProblem = {
  code:
    | "unknown_type"
    | "fact_without_direct_evidence"
    | "interpretation_as_fact"
    | "calculation_missing"
    | "calculation_not_ok"
    | "calculation_inputs_undeclared"
    | "interpretation_undivided"
    | "interpretation_without_limitations"
    | "forecast_incomplete"
    | "confidence_missing"
    | "confidence_is_probability";
  detail: string;
};

export type TypedClaimValidation = {
  claimId: string;
  valid: boolean;
  taxonomyProblems: TaxonomyProblem[];
  citationProblems: CitationProblem[];
  /** True when every check passed and the claim may be published. */
  publishable: boolean;
};

/** Wording that marks a statement as reasoning rather than reported fact. */
const INTERPRETIVE_MARKERS = /\b(we (?:believe|think|expect|view)|in our (?:view|opinion)|likely|probably|suggests?|implies?|indicates? that|may (?:be|indicate)|appears to|our (?:view|assessment)|arguably|we see)\b/i;

const FABRICATED_PROBABILITY = /\b\d{1,3}\s*%\s*(?:confiden|sure|certain)|confidence\s*(?:of|:)?\s*\d{1,3}\s*%/i;

/**
 * Validate a claim's taxonomy obligations, then its citations.
 *
 * The taxonomy is checked first, because a claim that is mistyped cannot be
 * validated meaningfully against the wrong set of obligations.
 */
export function validateTypedClaim(claim: TypedClaim, index: EvidenceFactIndex, context: CitationContext): TypedClaimValidation {
  const taxonomyProblems: TaxonomyProblem[] = [];

  if (!TYPED_CLAIM_TYPES.includes(claim.claimType)) {
    taxonomyProblems.push({ code: "unknown_type", detail: `"${claim.claimType}" is not one of the four permitted classifications.` });
  }

  if (claim.claimType === "FACT") {
    const hasDirect = claim.evidenceIds.some((id) => index.get(id)?.kind === "direct_source");
    if (!hasDirect) {
      taxonomyProblems.push({ code: "fact_without_direct_evidence", detail: "A FACT must rest on direct source evidence, not on secondary or interpreted context." });
    }
    if (INTERPRETIVE_MARKERS.test(claim.text)) {
      taxonomyProblems.push({
        code: "interpretation_as_fact",
        detail: "The wording carries interpretive markers, so this is an analyst interpretation and must not be classified as a reported company fact.",
      });
    }
  }

  if (claim.claimType === "CALCULATION") {
    if (!claim.calculation) {
      taxonomyProblems.push({ code: "calculation_missing", detail: "A CALCULATION must reference the calculation that produced it." });
    } else {
      if (claim.calculation.status !== "ok") {
        taxonomyProblems.push({
          code: "calculation_not_ok",
          detail: `The referenced calculation did not succeed (status "${claim.calculation.status}"), so no value may be published from it.`,
        });
      }
      if (claim.calculation.inputFactIds.length === 0) {
        taxonomyProblems.push({ code: "calculation_inputs_undeclared", detail: "A CALCULATION must declare the input facts it consumed, so the arithmetic can be reproduced." });
      }
    }
  }

  if (claim.claimType === "INTERPRETATION") {
    if (claim.observedFacts.length === 0 || !claim.reasoning?.trim()) {
      taxonomyProblems.push({
        code: "interpretation_undivided",
        detail: "An INTERPRETATION must separate the observed facts from the reasoning; one of the two is missing.",
      });
    }
    if (claim.limitations.length === 0) {
      taxonomyProblems.push({ code: "interpretation_without_limitations", detail: "An INTERPRETATION must record its material limitations." });
    }
  }

  if (claim.claimType === "FORECAST") {
    const missing: string[] = [];
    if (claim.assumptions.length === 0) missing.push("assumptions");
    if (!claim.method?.trim()) missing.push("method");
    if (!claim.uncertainty?.trim()) missing.push("uncertainty");
    if (claim.limitations.length === 0) missing.push("limitations");
    if (claim.evidenceIds.length === 0) missing.push("supporting evidence");
    if (missing.length) {
      taxonomyProblems.push({ code: "forecast_incomplete", detail: `A FORECAST must state its ${missing.join(", ")}.` });
    }
  }

  if (!claim.confidenceRationale?.trim()) {
    taxonomyProblems.push({ code: "confidence_missing", detail: "The claim must explain its confidence." });
  } else if (FABRICATED_PROBABILITY.test(claim.confidenceRationale)) {
    taxonomyProblems.push({ code: "confidence_is_probability", detail: "Confidence must be an explained qualitative assessment, not a fabricated probability." });
  }

  const citation = validateClaimCitations({ text: claim.text, evidenceIds: claim.evidenceIds }, claim.asserted, index, context);

  return {
    claimId: claim.claimId,
    valid: taxonomyProblems.length === 0 && citation.problems.length === 0,
    taxonomyProblems,
    citationProblems: citation.problems,
    publishable: taxonomyProblems.length === 0 && citation.valid,
  };
}

/** Validate a batch, returning only the claims that may be published. */
export function validateTypedClaims(claims: TypedClaim[], index: EvidenceFactIndex, context: CitationContext): {
  results: TypedClaimValidation[];
  publishable: TypedClaim[];
  withheld: { claim: TypedClaim; reasons: string[] }[];
} {
  const results = claims.map((claim) => validateTypedClaim(claim, index, context));
  const byId = new Map(results.map((result) => [result.claimId, result]));
  const publishable: TypedClaim[] = [];
  const withheld: { claim: TypedClaim; reasons: string[] }[] = [];

  for (const claim of claims) {
    const result = byId.get(claim.claimId)!;
    if (result.publishable) {
      publishable.push(claim);
    } else {
      withheld.push({
        claim,
        reasons: [
          ...result.taxonomyProblems.map((problem) => `${problem.code}: ${problem.detail}`),
          ...result.citationProblems.map((problem) => `${problem.code}: ${problem.detail}`),
        ],
      });
    }
  }
  return { results, publishable, withheld };
}
