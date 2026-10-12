/**
 * Format-specific locator validation (Prompt 3, section 2).
 *
 * A locator is only meaningful against a format. A page number is valid for a
 * PDF and meaningless for a JSON document; an XBRL fact is identified by its
 * concept together with its context, unit, period and dimensions, and a
 * locator that drops those cannot be checked against the source.
 *
 * So a locator is parsed into a structured form, and validity is judged against
 * the document's actual format rather than by a single generic pattern.
 */

import type { DocumentFormat } from "../ingestion/types";

export type LocatorKind = "html_section" | "html_element" | "pdf_page" | "pdf_table" | "xbrl_fact" | "text_section" | "csv_row" | "json_path" | "unknown";

export type XbrlLocator = {
  concept: string;
  contextRef: string | null;
  unitRef: string | null;
  period: string | null;
  /** Explicit dimensions, e.g. "segment:ProductA". */
  dimensions: string[];
};

export type ParsedLocator = {
  kind: LocatorKind;
  raw: string;
  page: number | null;
  table: number | null;
  section: string | null;
  elementId: string | null;
  jsonPath: string | null;
  xbrl: XbrlLocator | null;
};

/** Which formats each locator kind is meaningful for. */
const KIND_FORMATS: Record<LocatorKind, DocumentFormat[]> = {
  html_section: ["html", "inline_xbrl"],
  html_element: ["html", "inline_xbrl"],
  pdf_page: ["pdf"],
  pdf_table: ["pdf"],
  xbrl_fact: ["xbrl", "inline_xbrl"],
  text_section: ["text", "csv", "pdf", "html", "inline_xbrl"],
  csv_row: ["csv"],
  json_path: ["json"],
  unknown: [],
};

export function parseLocator(raw: string | null | undefined): ParsedLocator | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return null;

  const empty: Omit<ParsedLocator, "kind" | "raw"> = { page: null, table: null, section: null, elementId: null, jsonPath: null, xbrl: null };

  // XBRL: concept plus its identifying attributes.
  if (value.startsWith("xbrl:")) {
    const body = value.slice(5);
    const [conceptPart, attributePart] = body.split("#");
    const attributes = new URLSearchParams(attributePart ?? "");
    const concept = conceptPart.trim();
    if (!concept) return null;
    return {
      ...empty,
      kind: "xbrl_fact",
      raw: value,
      xbrl: {
        concept,
        contextRef: attributes.get("context"),
        unitRef: attributes.get("unit"),
        period: attributes.get("period"),
        dimensions: attributes.getAll("dim"),
      },
    };
  }

  // PDF: page and optional table.
  const pdf = value.match(/^(?:pdf:)?page:(\d+)(?:\/table:(\d+))?$/i) ?? value.match(/^pdf:table:(\d+)$/i);
  if (pdf) {
    if (/table/i.test(value) && !/page/i.test(value)) {
      return { ...empty, kind: "pdf_table", raw: value, table: Number(pdf[1]) };
    }
    return { ...empty, kind: pdf[2] ? "pdf_table" : "pdf_page", raw: value, page: Number(pdf[1]), table: pdf[2] ? Number(pdf[2]) : null };
  }

  const tableOnly = value.match(/^table:(\d+)$/i);
  if (tableOnly) return { ...empty, kind: "pdf_table", raw: value, table: Number(tableOnly[1]) };

  const row = value.match(/^row:(\d+)$/i);
  if (row) return { ...empty, kind: "csv_row", raw: value, page: Number(row[1]) };

  const jsonPath = value.match(/^json:(.+)$/i);
  if (jsonPath) return { ...empty, kind: "json_path", raw: value, jsonPath: jsonPath[1] };

  const element = value.match(/^html:id:(.+)$/i);
  if (element) return { ...empty, kind: "html_element", raw: value, elementId: element[1] };

  const htmlSection = value.match(/^html:section:(.+)$/i);
  if (htmlSection) return { ...empty, kind: "html_section", raw: value, section: htmlSection[1] };

  const section = value.match(/^section:(.+)$/i);
  if (section) return { ...empty, kind: "text_section", raw: value, section: section[1] };

  const note = value.match(/^note:(\d+)$/i);
  if (note) return { ...empty, kind: "pdf_page", raw: value, page: Number(note[1]) };

  const para = value.match(/^para:(\d+)$/i);
  if (para) return { ...empty, kind: "text_section", raw: value, section: `paragraph ${para[1]}` };

  return { ...empty, kind: "unknown", raw: value };
}

export type LocatorCheck = {
  valid: boolean;
  reason: string;
  parsed: ParsedLocator | null;
};

/**
 * Judge a locator against the document's actual format.
 *
 * The check is deliberately strict about XBRL: a fact locator that carries only
 * a concept and omits the context, unit and period cannot be reconciled against
 * the source, so it is rejected rather than accepted as "close enough".
 */
export function isLocatorValidForFormat(raw: string | null | undefined, format: DocumentFormat): LocatorCheck {
  const parsed = parseLocator(raw);
  if (!parsed) return { valid: false, reason: "No locator was supplied, so the claim cannot be traced to a position in the document.", parsed: null };
  if (parsed.kind === "unknown") return { valid: false, reason: `"${parsed.raw}" is not a locator this pipeline recognises.`, parsed };

  const allowed = KIND_FORMATS[parsed.kind];
  if (!allowed.includes(format)) {
    return { valid: false, reason: `A ${parsed.kind} locator is not valid for a ${format} document.`, parsed };
  }

  if (parsed.kind === "xbrl_fact") {
    const missing: string[] = [];
    if (!parsed.xbrl?.contextRef) missing.push("context");
    if (!parsed.xbrl?.unitRef) missing.push("unit");
    if (!parsed.xbrl?.period) missing.push("period");
    if (missing.length) {
      return { valid: false, reason: `An XBRL fact locator must identify the ${missing.join(", ")} as well as the concept, or it cannot be reconciled against the source.`, parsed };
    }
  }

  if ((parsed.kind === "pdf_page" || parsed.kind === "pdf_table" || parsed.kind === "csv_row") && parsed.page !== null && parsed.page < 1) {
    return { valid: false, reason: "A page or row locator must be one or greater.", parsed };
  }

  return { valid: true, reason: `Valid ${parsed.kind} locator for a ${format} document.`, parsed };
}

/** Describe an XBRL fact's dimensions, so a claim can be scoped precisely. */
export function describeXbrlScope(locator: XbrlLocator): string {
  const parts = [`concept ${locator.concept}`];
  if (locator.contextRef) parts.push(`context ${locator.contextRef}`);
  if (locator.unitRef) parts.push(`unit ${locator.unitRef}`);
  if (locator.period) parts.push(`period ${locator.period}`);
  if (locator.dimensions.length) parts.push(`dimensions ${locator.dimensions.join(", ")}`);
  return parts.join(", ");
}
