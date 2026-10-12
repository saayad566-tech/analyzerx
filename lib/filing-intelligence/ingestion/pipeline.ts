/**
 * Ingestion pipeline orchestration (Prompt 2).
 *
 * One entry point that takes retrieved bytes and metadata and produces a
 * traceable extraction: the format is validated, the size is bounded, the hash
 * is computed, the right parser runs, OCR need is assessed, and the result
 * carries its parser version and extraction time so it can be reproduced.
 */

import { detectFormat, isSupportedFormat } from "./parsers/detect";
import { extractHtml, extractText } from "./parsers/text";
import { extractCsv, extractJson, extractXbrl } from "./parsers/structured";
import { extractPdf, inspectPdf } from "./parsers/pdf";
import { assessOcrNeed, unavailableOcrEngine, type OcrNeed } from "./ocr";
import { extractFinancialTable } from "./table";
import { sha256Bytes } from "./version";
import type { DocumentEnvelope, DocumentFormat, ExtractionResult, ExtractionWarning, FinancialTable } from "./types";

/** The ceiling on a document this pipeline will process. */
export const MAX_DOCUMENT_BYTES = 25_000_000;

/** The version stamped on every extraction this build produces. */
export const PIPELINE_VERSION = "2.0.0";

export type ParseOutcome = {
  envelope: DocumentEnvelope;
  extraction: ExtractionResult;
  tables: FinancialTable[];
  ocr: OcrNeed;
  /** True when the document was rejected before parsing. */
  rejected: boolean;
  note: string | null;
};

function decodeUtf8(bytes: Uint8Array): string {
  // Bounded manual decode; avoids depending on a TextDecoder that may not exist.
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) out += String.fromCharCode(bytes[i]);
  return out;
}

/** Extract tables from a CSV grid. */
function tablesFromCsv(rows: string[][], context: string): FinancialTable[] {
  if (rows.length < 2) return [];
  const header = rows[0].join(" ");
  return [extractFinancialTable(rows, { locator: "table:1", title: rows[0][0] ?? null, context: `${context} ${header}` })];
}

/**
 * Extract tables from text where lines look tabular: three or more columns
 * separated by runs of two or more spaces. This is the shape a PDF text dump
 * of a statement takes, and it is the only shape attempted.
 */
function tablesFromText(sections: ExtractionResult["sections"], context: string): FinancialTable[] {
  const tables: FinancialTable[] = [];
  for (const section of sections) {
    const lines = section.text.split(/\n/).filter((line) => line.trim().length > 0);
    const rows: string[][] = [];
    for (const line of lines) {
      const cells = line.split(/\s{2,}|\t/).map((cell) => cell.trim());
      if (cells.length >= 2) rows.push(cells);
    }
    if (rows.length >= 3) {
      tables.push(extractFinancialTable(rows, { locator: section.locator, title: section.heading, context }));
    }
  }
  return tables;
}

/**
 * Parse a retrieved document.
 *
 * The size ceiling is checked before any parsing, so an oversized document is
 * rejected rather than processed. A format with no parser is reported as
 * unsupported rather than passed to a parser that would misread it.
 */
export function parseDocument(
  bytes: Uint8Array,
  options: { contentType: string | null; requestedUrl: string; finalUrl: string; retrievedUtc: string; context?: string },
): ParseOutcome {
  const head = decodeUtf8(bytes.subarray(0, 4096));
  const detection = detectFormat(options.contentType, head);
  const envelope: DocumentEnvelope = {
    finalUrl: options.finalUrl,
    requestedUrl: options.requestedUrl,
    contentType: options.contentType,
    byteLength: bytes.length,
    sha256: null,
    format: detection.format,
    retrievedUtc: options.retrievedUtc,
  };

  if (bytes.length > MAX_DOCUMENT_BYTES) {
    return {
      envelope,
      extraction: {
        format: detection.format,
        quality: "unextractable",
        sections: [],
        warnings: ["truncated"],
        parser: "none",
        parserVersion: PIPELINE_VERSION,
        extractedUtc: options.retrievedUtc,
        note: `The document is ${bytes.length} bytes, which exceeds the ${MAX_DOCUMENT_BYTES}-byte processing ceiling, so it was not parsed.`,
      },
      tables: [],
      ocr: { needed: false, reason: "The document was rejected before parsing." },
      rejected: true,
      note: "Rejected for size.",
    };
  }

  envelope.sha256 = sha256Bytes(bytes);

  if (!isSupportedFormat(detection.format) || detection.format === "unknown") {
    return {
      envelope,
      extraction: {
        format: detection.format,
        quality: "unextractable",
        sections: [],
        warnings: ["parser_failure"],
        parser: "none",
        parserVersion: PIPELINE_VERSION,
        extractedUtc: options.retrievedUtc,
        note: `No parser is implemented for this format. ${detection.note}`,
      },
      tables: [],
      ocr: { needed: false, reason: "No parser exists for this format, so OCR would not help." },
      rejected: false,
      note: "Unsupported format.",
    };
  }

  const context = options.context ?? "";
  let extraction: ExtractionResult;
  let tables: FinancialTable[] = [];
  let pageCount: number | null = null;

  switch (detection.format) {
    case "pdf": {
      extraction = extractPdf(bytes, options.retrievedUtc);
      pageCount = inspectPdf(decodeUtf8(bytes)).pageCount;
      tables = tablesFromText(extraction.sections, context);
      break;
    }
    case "html": {
      extraction = extractHtml(decodeUtf8(bytes), options.retrievedUtc);
      tables = tablesFromText(extraction.sections, context);
      break;
    }
    case "text": {
      extraction = extractText(decodeUtf8(bytes), options.retrievedUtc);
      tables = tablesFromText(extraction.sections, context);
      break;
    }
    case "csv": {
      extraction = extractCsv(decodeUtf8(bytes), options.retrievedUtc);
      const rows = decodeUtf8(bytes)
        .split(/\r?\n/)
        .filter((line) => line.trim())
        .map((line) => line.split(","));
      tables = tablesFromCsv(rows, context);
      break;
    }
    case "json": {
      extraction = extractJson(decodeUtf8(bytes), options.retrievedUtc);
      break;
    }
    case "xbrl":
    case "inline_xbrl":
    case "xml": {
      extraction = extractXbrl(decodeUtf8(bytes), detection.format, options.retrievedUtc);
      break;
    }
    default: {
      extraction = extractText(decodeUtf8(bytes), options.retrievedUtc);
    }
  }

  // A content-type mismatch is surfaced, but only when the two signals belong
  // to genuinely different families. A declaration of xml against bytes that
  // are xbrl is a refinement, not a mislabelling, and flagging it as an
  // encoding problem would be a false alarm.
  const familyOf = (format: DocumentFormat): string =>
    format === "xbrl" || format === "inline_xbrl" || format === "xml" ? "markup" : format;
  const incompatible = detection.mismatch && detection.fromContentType !== null && familyOf(detection.fromContentType) !== familyOf(detection.format);
  if (incompatible) {
    const warnings: ExtractionWarning[] = [...extraction.warnings, "encoding_problem"];
    extraction = { ...extraction, warnings: [...new Set(warnings)], note: extraction.note ?? detection.note };
  } else if (detection.mismatch) {
    // Still recorded in the note, so nothing is hidden, but not raised as a defect.
    extraction = { ...extraction, note: extraction.note ?? detection.note };
  }

  const ocr = assessOcrNeed(extraction, pageCount);
  const ocrNote = ocr.needed && !unavailableOcrEngine.available ? ` ${unavailableOcrEngine.dependency}` : "";
  if (ocr.needed) {
    extraction = {
      ...extraction,
      warnings: [...new Set([...extraction.warnings, "ocr_unavailable" as ExtractionWarning])],
      note: (extraction.note ?? "") + ocr.reason + ocrNote,
    };
  }

  return { envelope, extraction, tables, ocr, rejected: false, note: detection.mismatch ? detection.note : null };
}

/** The full result of ingesting one filing, ready for Filing Intelligence. */
export type IngestionResult = {
  filingKey: string;
  envelope: DocumentEnvelope;
  extraction: ExtractionResult;
  tables: FinancialTable[];
  ocr: OcrNeed;
  /** Plain-language provenance, shown alongside the extracted content. */
  provenance: string;
};

export function buildProvenance(envelope: DocumentEnvelope, extraction: ExtractionResult): string {
  const hash = envelope.sha256 ? envelope.sha256.slice(0, 16) : "not computed";
  return [
    `Retrieved from ${envelope.finalUrl}`,
    `at ${envelope.retrievedUtc}`,
    `(${envelope.byteLength} bytes, ${envelope.format}${envelope.contentType ? `, ${envelope.contentType}` : ""})`,
    `sha256 ${hash}…`,
    `parsed by ${extraction.parser} v${extraction.parserVersion}`,
    `quality ${extraction.quality}`,
  ].join(" ");
}

export function ingestDocument(
  filingKey: string,
  bytes: Uint8Array,
  options: { contentType: string | null; requestedUrl: string; finalUrl: string; retrievedUtc: string; context?: string },
): IngestionResult {
  const outcome = parseDocument(bytes, options);
  return {
    filingKey,
    envelope: outcome.envelope,
    extraction: outcome.extraction,
    tables: outcome.tables,
    ocr: outcome.ocr,
    provenance: buildProvenance(outcome.envelope, outcome.extraction),
  };
}
