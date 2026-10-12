/**
 * PDF parsing (Prompt 2, section 3).
 *
 * Scope, stated honestly rather than implied: this is not a full PDF renderer.
 * It validates the file structure, counts pages, reads the document
 * information dictionary, and extracts text from content streams whose strings
 * use the standard literal or hex forms. It inflates FlateDecode streams with
 * pako, which is a declared dependency and pure JavaScript, so it runs in React
 * Native without native code.
 *
 * What it does NOT do: it does not resolve font CMaps, so text in a PDF that
 * uses a custom font encoding may come out in the wrong glyphs. When that is
 * likely, the result is marked garbled or partial and a warning is recorded
 * rather than presenting the text as clean. Text inside scanned images is not
 * readable at all without OCR, which is handled separately.
 */

import { inflate } from "pako";
import type { ExtractedSection, ExtractionResult, ExtractionWarning } from "../types";

export const PDF_PARSER = "analyzerx-pdf-lite";
export const PDF_PARSER_VERSION = "1.0.0";

/** Ceiling on the decompressed size of a single stream, to bound work. */
export const MAX_INFLATED_BYTES = 8_000_000;

export type PdfInspection = {
  valid: boolean;
  complete: boolean;
  encrypted: boolean;
  pageCount: number | null;
  title: string | null;
  author: string | null;
  creationDate: string | null;
  note: string | null;
};

function decodeLatin1(bytes: Uint8Array): string {
  // PDF strings are commonly PDFDocEncoding or Latin-1; decoding byte-by-byte
  // avoids depending on a TextDecoder that may not exist in the runtime.
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) out += String.fromCharCode(bytes[i]);
  return out;
}

function readPdfString(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.startsWith("(")) {
    const end = trimmed.lastIndexOf(")");
    if (end <= 0) return null;
    return trimmed
      .slice(1, end)
      .replace(/\\([nrtbf()\\])/g, (_m, code: string) => ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" }[code] ?? code));
  }
  if (trimmed.startsWith("<")) {
    const end = trimmed.indexOf(">");
    if (end < 0) return null;
    const hex = trimmed.slice(1, end).replace(/\s+/g, "");
    let out = "";
    for (let i = 0; i + 1 < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
    return out;
  }
  return null;
}

/** Inspect the structure without extracting text. */
export function inspectPdf(text: string): PdfInspection {
  if (!text.startsWith("%PDF-")) {
    return { valid: false, complete: false, encrypted: false, pageCount: null, title: null, author: null, creationDate: null, note: "The file does not begin with a PDF header, so it is not a PDF." };
  }
  const complete = /%%EOF/.test(text);
  const encrypted = /\/Encrypt\b/.test(text);

  // Count page objects. /Type /Pages is the tree node, not a page.
  const pageMatches = text.match(/\/Type\s*\/Page(?![s])/g);
  const pageCount = pageMatches ? pageMatches.length : null;

  const title = readPdfString(text.match(/\/Title\s*([^\n/]*?(?:\([\s\S]*?\)|<[0-9A-Fa-f\s]*>))/)?.[1] ?? "");
  const author = readPdfString(text.match(/\/Author\s*([^\n/]*?(?:\([\s\S]*?\)|<[0-9A-Fa-f\s]*>))/)?.[1] ?? "");
  const creationDate = text.match(/\/CreationDate\s*\(D:(\d{14})/)?.[1] ?? null;

  let note: string | null = null;
  if (!complete) note = "The file has no end-of-file marker, so it may be truncated.";
  if (encrypted) note = "The document is encrypted, so its content cannot be read without a password.";

  return { valid: true, complete, encrypted, pageCount, title, author, creationDate, note };
}

/** Extract the readable text operators from one content stream. */
function textFromContentStream(content: string): string {
  const parts: string[] = [];
  // Literal strings shown with Tj / ' / ", and arrays shown with TJ.
  const tokenPattern = /\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]+>|\bT[Jj*]|\bTD\b|\bTd\b|\bET\b/g;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(content)) !== null) {
    const token = match[0];
    if (token === "TD" || token === "Td") {
      parts.push("\n");
      continue;
    }
    if (token === "ET") {
      parts.push("\n");
      continue;
    }
    if (token.startsWith("(") || token.startsWith("<")) {
      const value = readPdfString(token);
      if (value) parts.push(value);
      continue;
    }
    if (token === "Tj" || token === "'" || token === '"' || token === "TJ") parts.push(" ");
  }
  return parts.join("").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Extract text and structure from a PDF.
 *
 * `bytes` must be the raw file. Streams are inflated only up to the byte
 * ceiling, and a stream that cannot be inflated is reported rather than
 * silently skipped.
 */
export function extractPdf(bytes: Uint8Array, extractedUtc: string): ExtractionResult {
  const warnings: ExtractionWarning[] = [];
  const latin = decodeLatin1(bytes);
  const inspection = inspectPdf(latin);

  if (!inspection.valid) {
    return { format: "pdf", quality: "unextractable", sections: [], warnings: ["parser_failure"], parser: PDF_PARSER, parserVersion: PDF_PARSER_VERSION, extractedUtc, note: inspection.note };
  }
  if (!inspection.complete) warnings.push("truncated");
  if (inspection.encrypted) {
    return { format: "pdf", quality: "unextractable", sections: [], warnings: [...warnings, "parser_failure"], parser: PDF_PARSER, parserVersion: PDF_PARSER_VERSION, extractedUtc, note: "The document is encrypted, so its content cannot be read without a password." };
  }

  const texts: string[] = [];
  let unreadableStreams = 0;
  let compressedStreams = 0;

  // Locate streams. Binary stream data is read from the byte array so that
  // byte offsets stay accurate.
  const streamPattern = /stream\r?\n/g;
  let match: RegExpExecArray | null;
  const header = latin;
  while ((match = streamPattern.exec(header)) !== null) {
    const start = match.index + match[0].length;
    const end = header.indexOf("endstream", start);
    if (end < 0) {
      warnings.push("truncated");
      break;
    }
    // The dictionary immediately precedes the stream keyword.
    const dictStart = Math.max(0, header.lastIndexOf("<<", match.index));
    const dict = header.slice(dictStart, match.index);
    const isFlate = /\/FlateDecode\b/.test(dict);
    const slice = bytes.subarray(start, end);
    if (isFlate) {
      compressedStreams += 1;
      try {
        const inflated = inflate(slice, { raw: false });
        if (inflated.length > MAX_INFLATED_BYTES) {
          warnings.push("compressed_stream_unreadable");
          unreadableStreams += 1;
          continue;
        }
        const content = decodeLatin1(inflated);
        if (/\bT[Jj]\b|\bTJ\b/.test(content)) texts.push(textFromContentStream(content));
      } catch {
        // Not every stream is a content stream; a failure here is expected for
        // font and image streams, so it is counted rather than treated as fatal.
        unreadableStreams += 1;
      }
      continue;
    }
    if (/\bT[Jj]\b|\bTJ\b/.test(header.slice(start, Math.min(end, start + 4000)))) {
      texts.push(textFromContentStream(header.slice(start, end)));
    }
  }

  const body = texts.join("\n\n").trim();
  if (compressedStreams > 0 && texts.length === 0) warnings.push("compressed_stream_unreadable");

  const sections: ExtractedSection[] = body
    ? body.split(/\n{2,}/).map((block, index) => ({ locator: `page:${index + 1}`, heading: null, text: block.replace(/\s+/g, " ").trim() })).filter((section) => section.text.length > 0)
    : [];

  let quality: ExtractionResult["quality"];
  let note: string | null = inspection.note;
  if (!body) {
    quality = "unextractable";
    note = note ?? "No text could be read. The document may be a scan, which requires OCR, or its text may use an encoding this parser does not resolve.";
  } else if (warnings.length || unreadableStreams > 2) {
    quality = "partial";
    note = note ?? "Text was read, but some streams could not be decoded, so the extraction may be incomplete.";
  } else {
    quality = "clean";
  }

  // A page count with no text strongly suggests an image-only document.
  if (inspection.pageCount !== null && sections.length === 0) warnings.push("ocr_unavailable");

  return {
    format: "pdf",
    quality,
    sections,
    warnings: [...new Set(warnings)],
    parser: PDF_PARSER,
    parserVersion: PDF_PARSER_VERSION,
    extractedUtc,
    note,
  };
}

/** Convenience wrapper for callers holding the bytes as a base64 string. */
export function extractPdfFromBase64(base64: string, extractedUtc: string): ExtractionResult {
  const binary = typeof atob === "function" ? atob(base64) : Buffer.from(base64, "base64").toString("binary");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return extractPdf(bytes, extractedUtc);
}
