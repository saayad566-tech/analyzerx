export type FilingEvidenceStatus = "verified" | "partial" | "unavailable";
export type FilingEvidenceItem = { status: FilingEvidenceStatus; value: string | null; sourceUrl: string | null; period: string | null; evidence: string[]; note: string };
export type FilingEvidence = { tam: FilingEvidenceItem; customerConcentration: FilingEvidenceItem; managementGuidance: FilingEvidenceItem; sourcePolicy: string };

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
function extract(label: string, sourceText: string | undefined, sourceUrl: string | undefined, period: string | undefined, patterns: RegExp[]): FilingEvidenceItem {
  if (!sourceText) return { status: "unavailable", value: null, sourceUrl: sourceUrl ?? null, period: period ?? null, evidence: [], note: `${label} was not present in the connected filing/profile text.` };
  const text = normalize(sourceText);
  const matches = patterns.map((pattern) => text.match(pattern)?.[0]).filter((match): match is string => Boolean(match));
  if (!matches.length) return { status: "unavailable", value: null, sourceUrl: sourceUrl ?? null, period: period ?? null, evidence: [], note: `${label} requires a source-backed filing passage; no matching passage was found.` };
  return { status: "partial", value: matches.slice(0, 2).join(" … "), sourceUrl: sourceUrl ?? null, period: period ?? null, evidence: matches.slice(0, 3), note: `${label} was extracted from source text but requires document-level cross-checking before it can be treated as verified.` };
}

export function extractFilingEvidence(input: { sourceText?: string; sourceUrl?: string; period?: string; futurePlans?: string }): FilingEvidence {
  const sourceText = [input.sourceText, input.futurePlans].filter(Boolean).join(" ");
  return {
    tam: extract("TAM / addressable market", sourceText, input.sourceUrl, input.period, [/\b(?:TAM|total addressable market|addressable market|market opportunity|market size)\b[^.]{0,240}/i]),
    customerConcentration: extract("Customer concentration", sourceText, input.sourceUrl, input.period, [/\b(?:top\s+(?:one|two|three|5|10)|largest)\s+customers?\b[^.]{0,240}/i, /\bcustomer concentration\b[^.]{0,240}/i, /\b(?:single|one)\s+customer\b[^.]{0,180}/i]),
    managementGuidance: extract("Management guidance", sourceText, input.sourceUrl, input.period, [/\b(?:guidance|outlook|expects?|target(?:s|ed)?|forecast|management commentary)\b[^.]{0,260}/i]),
    sourcePolicy: "Only dated official filings, annual reports, investor presentations, exchange disclosures, and explicitly resolved company-IR documents can upgrade these items from partial to verified. No missing TAM, customer, or guidance value is estimated from sector baselines.",
  };
}
