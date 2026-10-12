/**
 * Structured-format extraction: JSON, CSV, XML and XBRL / Inline XBRL
 * (Prompt 2, sections 3 and 5).
 *
 * XBRL is the format that matters most here, because a fact carries its own
 * scale, sign, unit and context rather than leaving them to be inferred from a
 * nearby number. The parser keeps those attributes with the value instead of
 * flattening them away.
 */

import type { ExtractedSection, ExtractionResult, ExtractionWarning } from "../types";

export const STRUCTURED_PARSER = "analyzerx-structured";
export const STRUCTURED_PARSER_VERSION = "1.0.0";

/* ------------------------------------------------------------------ *
 * CSV
 * ------------------------------------------------------------------ */

/** Parse CSV honouring quoted fields and escaped quotes. */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const text = input.replace(/^\uFEFF/, "");

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    if (char === "\r") continue;
    field += char;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((entry) => entry.some((cell) => cell.trim().length > 0));
}

export function extractCsv(input: string, extractedUtc: string): ExtractionResult {
  const warnings: ExtractionWarning[] = [];
  const rows = parseCsv(input);
  if (rows.length === 0) {
    return { format: "csv", quality: "unextractable", sections: [], warnings, parser: STRUCTURED_PARSER, parserVersion: STRUCTURED_PARSER_VERSION, extractedUtc, note: "The CSV contained no rows." };
  }
  const header = rows[0];
  const width = header.length;
  // A row with a different width suggests a malformed or truncated table.
  const ragged = rows.slice(1).filter((row) => row.length !== width);
  if (ragged.length) warnings.push("incomplete_table");

  const sections: ExtractedSection[] = rows.slice(1).map((row, index) => ({
    locator: `row:${index + 2}`,
    heading: row[0] ?? null,
    text: row.map((cell, column) => `${header[column] ?? `column${column + 1}`}=${cell}`).join("; "),
  }));

  return {
    format: "csv",
    quality: warnings.length ? "partial" : "clean",
    sections,
    warnings,
    parser: STRUCTURED_PARSER,
    parserVersion: STRUCTURED_PARSER_VERSION,
    extractedUtc,
    note: warnings.length ? `${ragged.length} row(s) had a different number of columns than the header.` : null,
  };
}

/* ------------------------------------------------------------------ *
 * JSON
 * ------------------------------------------------------------------ */

export function extractJson(input: string, extractedUtc: string): ExtractionResult {
  const warnings: ExtractionWarning[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (error) {
    return {
      format: "json",
      quality: "unextractable",
      sections: [],
      warnings: ["parser_failure"],
      parser: STRUCTURED_PARSER,
      parserVersion: STRUCTURED_PARSER_VERSION,
      extractedUtc,
      note: `The document was not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const sections: ExtractedSection[] = [];
  const walk = (value: unknown, path: string, depth: number) => {
    if (depth > 8) return; // bounded, so a deeply nested document cannot stall
    if (value === null) {
      sections.push({ locator: `json:${path}`, heading: path, text: "(null)" });
      return;
    }
    if (typeof value !== "object") {
      sections.push({ locator: `json:${path}`, heading: path, text: String(value) });
      return;
    }
    if (Array.isArray(value)) {
      value.slice(0, 500).forEach((entry, index) => walk(entry, `${path}[${index}]`, depth + 1));
      if (value.length > 500) warnings.push("truncated");
      return;
    }
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      walk(entry, path ? `${path}.${key}` : key, depth + 1);
    }
  };
  walk(parsed, "", 0);

  return {
    format: "json",
    quality: warnings.length ? "partial" : "clean",
    sections,
    warnings,
    parser: STRUCTURED_PARSER,
    parserVersion: STRUCTURED_PARSER_VERSION,
    extractedUtc,
    note: warnings.length ? "The document was larger than the extraction limit and was truncated." : null,
  };
}

/* ------------------------------------------------------------------ *
 * XBRL and Inline XBRL
 * ------------------------------------------------------------------ */

export type XbrlFact = {
  /** The concept, e.g. "us-gaap:Revenues". */
  concept: string;
  /** The value exactly as printed, with any sign already applied. */
  raw: string;
  value: number | null;
  unitRef: string | null;
  contextRef: string | null;
  decimals: string | null;
  /** The scale attribute, when present: the value is multiplied by 10^scale. */
  scale: number | null;
  sign: "-" | null;
  /** True when the element carried nil, meaning the value is explicitly absent. */
  nil: boolean;
};

function attribute(tagText: string, name: string): string | null {
  const match = tagText.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i")) ?? tagText.match(new RegExp(`${name}\\s*=\\s*'([^']*)'`, "i"));
  return match ? match[1] : null;
}

function decodeXmlEntities(value: string): string {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&").trim();
}

/**
 * Extract XBRL facts from either a native XBRL document or an Inline XBRL
 * document. The scale and sign attributes are applied to produce the value,
 * while the raw printed form is retained.
 */
export function parseXbrlFacts(input: string): XbrlFact[] {
  const facts: XbrlFact[] = [];
  // Inline XBRL uses ix:nonFraction / ix:nonNumeric; native XBRL uses the
  // taxonomy prefix directly. Both are matched by a generic element scan.
  const elementPattern = /<([a-zA-Z][\w.-]*:[\w.-]+)((?:\s+[^>]*?)?)(\/>|>([\s\S]*?)<\/\1>)/g;
  let match: RegExpExecArray | null;
  while ((match = elementPattern.exec(input)) !== null) {
    const concept = match[1];
    const attrs = match[2] ?? "";
    const inner = match[4] ?? "";
    if (!/^(ix:|us-gaap:|ifrs-|dei:|xbrli:)/i.test(concept)) continue;
    if (/^xbrli:/i.test(concept)) continue; // structural, not a financial fact

    const nil = /xsi:nil\s*=\s*"true"/i.test(attrs);
    const scaleRaw = attribute(attrs, "scale");
    const scale = scaleRaw !== null && scaleRaw !== "" && Number.isFinite(Number(scaleRaw)) ? Number(scaleRaw) : null;
    const sign = attribute(attrs, "sign") === "-" ? "-" : null;
    const rawText = decodeXmlEntities(inner.replace(/<[^>]*>/g, "")).trim();

    let value: number | null = null;
    if (!nil && rawText) {
      const cleaned = rawText.replace(/[,\s]/g, "").replace(/[()]/g, "");
      const numeric = Number(cleaned);
      if (Number.isFinite(numeric)) {
        let resolved = numeric;
        if (scale !== null) resolved *= 10 ** scale;
        if (sign === "-") resolved = -resolved;
        value = resolved;
      }
    }

    facts.push({
      concept,
      raw: sign === "-" ? `-${rawText}` : rawText,
      value,
      unitRef: attribute(attrs, "unitRef"),
      contextRef: attribute(attrs, "contextRef"),
      decimals: attribute(attrs, "decimals"),
      scale,
      sign,
      nil,
    });
  }
  return facts;
}

export function extractXbrl(input: string, format: "xbrl" | "inline_xbrl" | "xml", extractedUtc: string): ExtractionResult {
  const warnings: ExtractionWarning[] = [];
  const facts = parseXbrlFacts(input);
  if (facts.length === 0) {
    return {
      format,
      quality: "unextractable",
      sections: [],
      warnings: ["parser_failure"],
      parser: STRUCTURED_PARSER,
      parserVersion: STRUCTURED_PARSER_VERSION,
      extractedUtc,
      note: "No XBRL facts were found in the document.",
    };
  }
  const sections: ExtractedSection[] = facts.map((fact, index) => ({
    locator: `xbrl:${fact.concept}:${index}`,
    heading: fact.concept,
    text: `${fact.concept} = ${fact.value ?? fact.raw}${fact.unitRef ? ` [${fact.unitRef}]` : ""}${fact.scale !== null ? ` (scale ${fact.scale})` : ""}${fact.nil ? " (nil)" : ""}`,
  }));
  const nils = facts.filter((fact) => fact.nil).length;
  if (nils) warnings.push("incomplete_table");
  return {
    format,
    quality: warnings.length ? "partial" : "clean",
    sections,
    warnings,
    parser: STRUCTURED_PARSER,
    parserVersion: STRUCTURED_PARSER_VERSION,
    extractedUtc,
    note: nils ? `${nils} fact(s) were reported as nil, meaning the value is explicitly absent.` : null,
  };
}
