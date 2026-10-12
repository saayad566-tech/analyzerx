/**
 * Publication gate (Prompt 3, section 5).
 *
 * Publication is blocked when a material required section is missing, critical
 * evidence is invalid, the document identity is unresolved, or a required
 * calculation failed validation.
 *
 * Failed claims are withheld and reported with their count and reasons. They are
 * never silently discarded, because a reader is entitled to know what the
 * system declined to say and why.
 */

import { SECTION_CONTRACTS, type SectionId } from "./sections";
import type { Metric } from "./ratios";
import type { TypedClaim } from "./taxonomy";

export type SectionState = {
  id: SectionId;
  /** Whether the section has the content it requires. */
  populated: boolean;
  /** Whether every claim in it is validly cited. */
  evidenceSatisfied: boolean;
  /** A specific problem, when there is one. */
  problem: string | null;
};

export type GateInput = {
  sections: SectionState[];
  /** Whether the filing could be traced to an official source. */
  identityResolved: boolean;
  metrics: Metric[];
  /** Claims withheld by the taxonomy and citation validators. */
  withheld: { claim: TypedClaim; reasons: string[] }[];
  /** True when a material section could not be read from the document. */
  materialSectionUnreadable: boolean;
};

export type GateBlock = {
  code: "missing_section" | "unsatisfied_evidence" | "identity_unresolved" | "calculation_failed" | "material_unreadable";
  section: SectionId | null;
  detail: string;
};

export type GateDecision = {
  publish: boolean;
  status: "complete" | "partial" | "blocked";
  blocks: GateBlock[];
  /** Disclosed gaps that do not block publication. */
  disclosures: string[];
  withheldSummary: {
    count: number;
    byReason: { reason: string; count: number }[];
  };
  /** Sections permitted to be absent, for the reader's benefit. */
  omittedSections: SectionId[];
};

/**
 * Evaluate the gate.
 *
 * A blocking section that is missing blocks publication outright. A
 * non-blocking section that is missing is disclosed and the report is partial.
 * A failed required calculation blocks, because a report built on arithmetic
 * that did not validate is not evidence.
 */
export function evaluatePublicationGate(input: GateInput): GateDecision {
  const blocks: GateBlock[] = [];
  const disclosures: string[] = [];
  const omittedSections: SectionId[] = [];

  if (!input.identityResolved) {
    blocks.push({ code: "identity_unresolved", section: "filing_identity", detail: "The filing could not be traced to an official source, so its identity is unresolved." });
  }

  if (input.materialSectionUnreadable) {
    blocks.push({ code: "material_unreadable", section: null, detail: "A material section of the document could not be read, so any claim depending on it is withheld." });
  }

  const byId = new Map(input.sections.map((state) => [state.id, state]));
  for (const contract of SECTION_CONTRACTS) {
    const state = byId.get(contract.id);
    if (!state || !state.populated) {
      if (contract.publicationBlocking) {
        blocks.push({ code: "missing_section", section: contract.id, detail: `Section ${contract.number} (${contract.name}) is required and is missing.` });
      } else if (contract.missingDataBehaviour === "omit_section") {
        omittedSections.push(contract.id);
      } else {
        disclosures.push(`Section ${contract.number} (${contract.name}) is not populated; ${state?.problem ?? "the underlying data was unavailable"}.`);
      }
      continue;
    }
    if (!state.evidenceSatisfied) {
      const detail = `Section ${contract.number} (${contract.name}) does not satisfy its evidence requirement: ${state.problem ?? "an evidence check failed"}.`;
      if (contract.publicationBlocking) blocks.push({ code: "unsatisfied_evidence", section: contract.id, detail });
      else disclosures.push(detail);
    }
  }

  // A required calculation that failed validation blocks publication.
  const failed = input.metrics.filter((metric) => metric.status === "blocked");
  for (const metric of failed) {
    blocks.push({ code: "calculation_failed", section: "financial_comparison", detail: `The calculation "${metric.label}" could not be validated: ${metric.note ?? "no reason recorded"}.` });
  }

  // Withheld claims, summarised by reason so the pattern is visible.
  const reasonCounts = new Map<string, number>();
  for (const entry of input.withheld) {
    for (const reason of entry.reasons) {
      const code = reason.split(":")[0].trim();
      reasonCounts.set(code, (reasonCounts.get(code) ?? 0) + 1);
    }
  }

  const publish = blocks.length === 0;
  const status: GateDecision["status"] = !publish ? "blocked" : disclosures.length > 0 || input.withheld.length > 0 ? "partial" : "complete";

  return {
    publish,
    status,
    blocks,
    disclosures,
    withheldSummary: {
      count: input.withheld.length,
      byReason: [...reasonCounts.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    },
    omittedSections,
  };
}

/** A one-line statement of the decision, for the report header. */
export function describeGate(decision: GateDecision): string {
  if (!decision.publish) {
    return `Publication blocked: ${decision.blocks.length} blocking condition(s). ${decision.blocks.map((block) => block.detail).join(" ")}`;
  }
  if (decision.status === "partial") {
    return `Published as a partial report with ${decision.disclosures.length} disclosed gap(s) and ${decision.withheldSummary.count} withheld claim(s).`;
  }
  return "Published as a complete report; every required section and every claim passed validation.";
}

/** The withheld-claim list, ready for the audit report. */
export function withheldList(withheld: { claim: TypedClaim; reasons: string[] }[]): { claimId: string; claimType: string; text: string; reasons: string[] }[] {
  return withheld.map((entry) => ({ claimId: entry.claim.claimId, claimType: entry.claim.claimType, text: entry.claim.text, reasons: entry.reasons }));
}

