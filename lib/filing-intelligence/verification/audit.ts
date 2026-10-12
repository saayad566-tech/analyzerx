/**
 * Evidence audit report (Prompt 3, acceptance criteria).
 *
 * The prompt asks for an evidence audit report, the test results, the known
 * limitations, and the list of claims intentionally withheld. This module
 * produces the audit: for every claim, what it cited, whether each citation
 * resolved, and the reason for anything withheld.
 *
 * It also states plainly that a rendered report is not proof of complete
 * financial analysis, which is the one thing the prompt insists must never be
 * asserted.
 */

import type { EvidenceFact } from "./citations";
import type { TypedClaimValidation, TypedClaim } from "./taxonomy";
import type { GateDecision } from "./gate";

export type AuditEntry = {
  claimId: string;
  claimType: string;
  text: string;
  evidenceIds: string[];
  /** Each citation and whether it resolved to a real evidence record. */
  citations: { evidenceId: string; resolved: boolean; documentId: string | null; locator: string | null; kind: string | null }[];
  published: boolean;
  problems: string[];
};

export type EvidenceAudit = {
  generatedUtc: string;
  documentId: string;
  documentVersionId: string;
  totals: {
    claims: number;
    published: number;
    withheld: number;
    citations: number;
    resolvedCitations: number;
    /** Share of citations that resolved, as a percentage. */
    citationCoveragePercent: number;
  };
  entries: AuditEntry[];
  /** The withheld claims, listed explicitly as the prompt requires. */
  withheldClaims: { claimId: string; claimType: string; text: string; reasons: string[] }[];
  gate: { publish: boolean; status: string; blocks: string[]; disclosures: string[] };
  /** Stated plainly, so no reader mistakes a rendered report for a finished analysis. */
  statement: string;
};

export function buildEvidenceAudit(input: {
  documentId: string;
  documentVersionId: string;
  claims: TypedClaim[];
  validations: TypedClaimValidation[];
  evidence: EvidenceFact[];
  gate: GateDecision;
  now?: Date;
}): EvidenceAudit {
  const now = input.now ?? new Date();
  const evidenceIndex = new Map(input.evidence.map((record) => [record.evidenceId, record]));
  const validationById = new Map(input.validations.map((validation) => [validation.claimId, validation]));

  const entries: AuditEntry[] = [];
  let citations = 0;
  let resolvedCitations = 0;

  for (const claim of input.claims) {
    const validation = validationById.get(claim.claimId);
    const citationsForClaim = claim.evidenceIds.map((evidenceId) => {
      const record = evidenceIndex.get(evidenceId);
      citations += 1;
      if (record) resolvedCitations += 1;
      return {
        evidenceId,
        resolved: Boolean(record),
        documentId: record?.documentId ?? null,
        locator: record?.locator ?? null,
        kind: record?.kind ?? null,
      };
    });
    entries.push({
      claimId: claim.claimId,
      claimType: claim.claimType,
      text: claim.text,
      evidenceIds: claim.evidenceIds,
      citations: citationsForClaim,
      published: Boolean(validation?.publishable),
      problems: [
        ...(validation?.taxonomyProblems.map((problem) => `${problem.code}: ${problem.detail}`) ?? []),
        ...(validation?.citationProblems.map((problem) => `${problem.code}: ${problem.detail}`) ?? []),
      ],
    });
  }

  const published = entries.filter((entry) => entry.published).length;

  return {
    generatedUtc: now.toISOString(),
    documentId: input.documentId,
    documentVersionId: input.documentVersionId,
    totals: {
      claims: entries.length,
      published,
      withheld: entries.length - published,
      citations,
      resolvedCitations,
      citationCoveragePercent: citations === 0 ? 0 : Math.round((resolvedCitations / citations) * 1000) / 10,
    },
    entries,
    withheldClaims: entries
      .filter((entry) => !entry.published)
      .map((entry) => ({ claimId: entry.claimId, claimType: entry.claimType, text: entry.text, reasons: entry.problems })),
    gate: {
      publish: input.gate.publish,
      status: input.gate.status,
      blocks: input.gate.blocks.map((block) => block.detail),
      disclosures: input.gate.disclosures,
    },
    statement:
      "A rendered report is not evidence that the financial analysis is complete. Claims are limited to what the cited evidence supports, and anything that failed validation was withheld and is listed above.",
  };
}

/** Render the audit as plain text, for the report's methodology section. */
export function renderEvidenceAudit(audit: EvidenceAudit): string {
  const lines: string[] = [];
  lines.push("EVIDENCE AUDIT");
  lines.push(`  Document: ${audit.documentId} (version ${audit.documentVersionId})`);
  lines.push(`  Generated: ${audit.generatedUtc}`);
  lines.push(`  Claims: ${audit.totals.claims} total, ${audit.totals.published} published, ${audit.totals.withheld} withheld`);
  lines.push(`  Citations: ${audit.totals.resolvedCitations} of ${audit.totals.citations} resolved (${audit.totals.citationCoveragePercent}%)`);
  lines.push(`  Gate: ${audit.gate.status}${audit.gate.publish ? "" : " (publication blocked)"}`);
  for (const block of audit.gate.blocks) lines.push(`    blocked: ${block}`);
  for (const disclosure of audit.gate.disclosures) lines.push(`    disclosed: ${disclosure}`);
  if (audit.withheldClaims.length) {
    lines.push("  Withheld claims:");
    for (const entry of audit.withheldClaims) {
      lines.push(`    - ${entry.claimId} (${entry.claimType}): ${entry.text}`);
      for (const reason of entry.reasons) lines.push(`        ${reason}`);
    }
  } else {
    lines.push("  No claims were withheld.");
  }
  lines.push(`  ${audit.statement}`);
  return lines.join("\n");
}
