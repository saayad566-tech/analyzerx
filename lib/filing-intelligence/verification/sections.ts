/**
 * The eleven-section contract (Prompt 3, section 4).
 *
 * The names are the PRD's own, taken verbatim and not invented: filing
 * identity, one-minute summary, what the company disclosed, financial
 * comparison, positive factors, negative factors and risks, potential stock
 * implications, research view, what to monitor next, sources and methodology,
 * and disclaimer and limitations.
 *
 * For each section the contract states what it needs, what evidence it
 * requires, which calculations are permitted, what happens when data is
 * missing, how it is validated, whether its absence blocks publication, and how
 * it is displayed. The gate reads this contract rather than hard-coding rules,
 * so the two cannot drift apart.
 */

export type SectionId =
  | "filing_identity"
  | "one_minute_summary"
  | "what_the_company_disclosed"
  | "financial_comparison"
  | "positive_factors"
  | "negative_factors_and_risks"
  | "potential_stock_implications"
  | "research_view"
  | "what_to_monitor_next"
  | "sources_and_methodology"
  | "disclaimer_and_limitations";

export type EvidenceRequirement =
  | "none" // the section carries no claims
  | "identity" // the section is about the filing itself
  | "at_least_one_direct" // at least one direct-source citation
  | "every_claim"; // every claim in the section must be cited

export type MissingDataBehaviour =
  | "block" // publication is blocked
  | "partial_with_disclosure" // allowed, but the gap must be shown
  | "omit_section"; // the section may be omitted

export type SectionContract = {
  id: SectionId;
  number: number;
  /** The PRD's exact section name. */
  name: string;
  requiredInputs: string[];
  evidenceRequirement: EvidenceRequirement;
  /** Calculation keys permitted here, or a blanket rule. */
  permittedCalculations: string[] | "any" | "none";
  missingDataBehaviour: MissingDataBehaviour;
  validationRules: string[];
  /** True when the section's absence blocks publication. */
  publicationBlocking: boolean;
  displayFormat: string;
};

export const SECTION_CONTRACTS: SectionContract[] = [
  {
    id: "filing_identity",
    number: 1,
    name: "Filing identity",
    requiredInputs: ["companyName", "market", "filingTitle", "filingCategory", "officialUrl", "timestamps"],
    evidenceRequirement: "identity",
    permittedCalculations: "none",
    missingDataBehaviour: "block",
    validationRules: [
      "The document identity must be resolved: the filing must be traceable to an official source URL.",
      "Every timestamp that is unknown must be shown as unknown rather than substituted.",
    ],
    publicationBlocking: true,
    displayFormat: "Label and value rows, with the verification summary beneath.",
  },
  {
    id: "one_minute_summary",
    number: 2,
    name: "One-minute summary",
    requiredInputs: ["summaryBullets"],
    evidenceRequirement: "none",
    permittedCalculations: "none",
    missingDataBehaviour: "block",
    validationRules: ["Five to seven plain-language bullets, as the PRD requires.", "A bullet must not assert a figure that no other section evidences."],
    publicationBlocking: true,
    displayFormat: "A bulleted list.",
  },
  {
    id: "what_the_company_disclosed",
    number: 3,
    name: "What the company disclosed",
    requiredInputs: ["facts"],
    evidenceRequirement: "every_claim",
    permittedCalculations: "none",
    missingDataBehaviour: "partial_with_disclosure",
    validationRules: [
      "Facts are separated from management statements.",
      "Each fact carries a locator and its accounting basis.",
    ],
    publicationBlocking: false,
    displayFormat: "Fact rows with value, unit, basis and locator.",
  },
  {
    id: "financial_comparison",
    number: 4,
    name: "Financial comparison",
    requiredInputs: ["calculations"],
    evidenceRequirement: "every_claim",
    permittedCalculations: "any",
    missingDataBehaviour: "partial_with_disclosure",
    validationRules: [
      "A comparison across differing bases or period types is blocked, not caveated.",
      "A percentage against a zero denominator is reported as undefined.",
      "Cross-currency comparison requires a rate, timestamp, source and method.",
    ],
    publicationBlocking: false,
    displayFormat: "Calculation rows with formula, result, unit and rounding rule.",
  },
  {
    id: "positive_factors",
    number: 5,
    name: "Positive factors",
    requiredInputs: ["positiveFactors"],
    evidenceRequirement: "every_claim",
    permittedCalculations: "any",
    missingDataBehaviour: "partial_with_disclosure",
    validationRules: ["Each factor must be supported by evidence, or stated as absent."],
    publicationBlocking: false,
    displayFormat: "Bulleted list.",
  },
  {
    id: "negative_factors_and_risks",
    number: 6,
    name: "Negative factors and risks",
    requiredInputs: ["negativeFactors", "uncertainties"],
    evidenceRequirement: "every_claim",
    permittedCalculations: "any",
    missingDataBehaviour: "partial_with_disclosure",
    validationRules: ["Contradicting evidence must be recorded rather than omitted."],
    publicationBlocking: false,
    displayFormat: "Bulleted list, with uncertainties in a distinct tone.",
  },
  {
    id: "potential_stock_implications",
    number: 7,
    name: "Potential stock implications",
    requiredInputs: ["stockImplications"],
    evidenceRequirement: "at_least_one_direct",
    permittedCalculations: "any",
    missingDataBehaviour: "partial_with_disclosure",
    validationRules: [
      "A stance must be positive, negative, mixed, neutral or uncertain.",
      "No guaranteed outcome may be stated, and no trade may be recommended.",
    ],
    publicationBlocking: false,
    displayFormat: "A stance badge with its rationale.",
  },
  {
    id: "research_view",
    number: 8,
    name: "Research view",
    requiredInputs: ["researchView"],
    evidenceRequirement: "every_claim",
    permittedCalculations: "any",
    missingDataBehaviour: "partial_with_disclosure",
    validationRules: [
      "A conclusion must be accompanied by supporting and opposing evidence, a horizon, assumptions, risks and confidence rationale.",
      "Insufficient evidence must yield an explicit insufficient-evidence statement rather than a conclusion.",
    ],
    publicationBlocking: false,
    displayFormat: "A structured view, or an insufficient-evidence notice.",
  },
  {
    id: "what_to_monitor_next",
    number: 9,
    name: "What to monitor next",
    requiredInputs: ["monitoringItems"],
    evidenceRequirement: "none",
    permittedCalculations: "none",
    missingDataBehaviour: "omit_section",
    validationRules: ["A confirmed event and an unconfirmed possibility must be labelled differently."],
    publicationBlocking: false,
    displayFormat: "Bulleted list with a confirmed or unconfirmed marker.",
  },
  {
    id: "sources_and_methodology",
    number: 10,
    name: "Sources and methodology",
    requiredInputs: ["sources", "documentVersionId", "analysisUtc"],
    evidenceRequirement: "identity",
    permittedCalculations: "none",
    missingDataBehaviour: "block",
    validationRules: [
      "At least one source must be listed.",
      "The calculation method and the analysis timestamp must be stated.",
    ],
    publicationBlocking: true,
    displayFormat: "Source list with document versions, then the method note.",
  },
  {
    id: "disclaimer_and_limitations",
    number: 11,
    name: "Disclaimer and limitations",
    requiredInputs: ["limitations"],
    evidenceRequirement: "none",
    permittedCalculations: "none",
    missingDataBehaviour: "block",
    validationRules: [
      "The informational-only statement is always present.",
      "Every limitation recorded during analysis must be listed.",
    ],
    publicationBlocking: true,
    displayFormat: "A fixed disclaimer paragraph followed by the limitation list.",
  },
];

export function sectionContract(id: SectionId): SectionContract {
  const contract = SECTION_CONTRACTS.find((entry) => entry.id === id);
  if (!contract) throw new Error(`No contract is defined for section "${id}".`);
  return contract;
}

/** The sections whose absence blocks publication. */
export function blockingSections(): SectionContract[] {
  return SECTION_CONTRACTS.filter((contract) => contract.publicationBlocking);
}

/** A claim counts as material when it carries a figure or a stance. */
export function isMaterialClaim(claim: { asserted?: { value: number | null } | null; claimType: string }): boolean {
  if (claim.asserted && claim.asserted.value !== null) return true;
  return claim.claimType === "CALCULATION" || claim.claimType === "FORECAST";
}
