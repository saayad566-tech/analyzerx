/**
 * Format detection and file-type validation (Prompt 2, section 3).
 *
 * The declared content type is not trusted on its own: the magic bytes are
 * checked too, and a disagreement is reported rather than silently resolved in
 * favour of whichever is more convenient. A file that cannot be identified is
 * marked unknown, and the caller decides whether to attempt extraction.
 */

import type { DocumentFormat } from "../types";

export type Detection = {
  format: DocumentFormat;
  /** What the declared content type suggested, when it suggested anything. */
  fromContentType: DocumentFormat | null;
  /** What the bytes suggested. */
  fromBytes: DocumentFormat | null;
  /** True when the declaration and the bytes disagree. */
  mismatch: boolean;
  note: string;
};

function fromContentType(contentType: string | null): DocumentFormat | null {
  if (!contentType) return null;
  const value = contentType.toLowerCase();
  if (value.includes("pdf")) return "pdf";
  if (value.includes("html")) return "html";
  if (value.includes("xhtml")) return "html";
  if (value.includes("csv")) return "csv";
  if (value.includes("json")) return "json";
  if (value.includes("xbrl")) return "xbrl";
  if (value.includes("xml")) return "xml";
  if (value.startsWith("text/plain")) return "text";
  return null;
}

/** Inspect the leading bytes for a recognisable signature. */
function fromBytes(head: string): DocumentFormat | null {
  const trimmed = head.replace(/^\uFEFF/, "").trimStart();
  if (trimmed.startsWith("%PDF-")) return "pdf";
  // Inline XBRL is an XHTML wrapper, so the ix: tags must be checked before the
  // generic html signature, or every iXBRL document would be misread as html.
  if (/ix:header|ix:nonfraction|ix:nonnumeric/i.test(head)) return "inline_xbrl";
  if (/^<!doctype html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) return "html";
  if (/^<\?xml/i.test(trimmed) || /^<[a-z]/i.test(trimmed)) {
    if (/<xbrl[\s>]|xbrli:/i.test(head)) return "xbrl";
    return "xml";
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "json";
  // A CSV has at least one delimiter and more than one line in the head.
  const lines = trimmed.split(/\r?\n/).slice(0, 3);
  if (lines.length > 1 && lines[0].includes(",")) return "csv";
  return null;
}

/**
 * Detect the format. When the two signals disagree, the bytes win for the
 * purposes of parsing but the mismatch is recorded, because a mislabelled
 * response is worth surfacing.
 */
export function detectFormat(contentType: string | null, head: string): Detection {
  const declared = fromContentType(contentType);
  const actual = fromBytes(head);

  if (actual && declared && actual !== declared) {
    return { format: actual, fromContentType: declared, fromBytes: actual, mismatch: true, note: `The declared content type suggested ${declared} but the bytes are ${actual}. Parsing as ${actual}.` };
  }
  if (actual) return { format: actual, fromContentType: declared, fromBytes: actual, mismatch: false, note: `Identified as ${actual} from the file signature.` };
  if (declared) return { format: declared, fromContentType: declared, fromBytes: null, mismatch: false, note: `Identified as ${declared} from the declared content type only; the bytes carried no signature.` };
  return { format: "unknown", fromContentType: null, fromBytes: null, mismatch: false, note: "The format could not be identified from the content type or the file signature." };
}

/** Formats this pipeline has a parser for. */
export const SUPPORTED_FORMATS: DocumentFormat[] = ["pdf", "html", "text", "xml", "xbrl", "inline_xbrl", "json", "csv"];

export function isSupportedFormat(format: DocumentFormat): boolean {
  return SUPPORTED_FORMATS.includes(format);
}
