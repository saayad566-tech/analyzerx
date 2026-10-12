/**
 * Ingestion pipeline - core types (Prompt 2).
 *
 * The pipeline discovers permitted filings, retrieves documents, extracts
 * content, preserves provenance and hands the result to Filing Intelligence.
 * It reuses the connectors and the source registry from Prompt 1 rather than
 * introducing a second, incompatible system.
 *
 * Two rules shape every type here:
 *   - a missing value is represented explicitly, never as a plausible default;
 *   - provenance is recorded alongside the value, not reconstructed later.
 */

import type { AccountingBasis } from "../types";

/** A value that is either known or explicitly unknown. */
export type Known<T> = { known: true; value: T } | { known: false; reason: string };

export function known<T>(value: T): Known<T> {
  return { known: true, value };
}

export function unknown<T>(reason: string): Known<T> {
  return { known: false, reason };
}

/**
 * The five PRD timestamps. Each is independent: a filing that the source
 * published last week but this device first saw today must show both, and a
 * publication date the source does not state stays unknown rather than being
 * replaced by the current time.
 */
export type IngestionTimestamps = {
  publication: Known<string>;
  firstSeen: Known<string>;
  retrieval: Known<string>;
  analysis: Known<string>;
  sourceCheck: Known<string>;
};

export function emptyTimestamps(): IngestionTimestamps {
  return {
    publication: unknown("The source did not state a publication time."),
    firstSeen: unknown("This device has not observed the filing yet."),
    retrieval: unknown("The document has not been retrieved yet."),
    analysis: unknown("Analysis has not run."),
    sourceCheck: unknown("The source has not been checked."),
  };
}

/**
 * Stable identifiers. A ticker is not assumed to be globally unique, so it is
 * carried as one identifier among several rather than as the key.
 */
export type FilingIdentifiers = {
  /** Source-scoped identifier, e.g. an SEC accession number. */
  sourceId: string | null;
  /** The source's own company identifier, e.g. an SEC CIK. */
  companyId: string | null;
  isin: string | null;
  /** Exchange-issued code, e.g. a BSE scrip code or an NSE symbol. */
  exchangeCode: string | null;
  ticker: string | null;
  /** The stable key this pipeline uses: source + source-scoped id. */
  stableKey: string;
};

export type FilingCategory =
  | "annual_report"
  | "quarterly_report"
  | "current_report"
  | "corporate_announcement"
  | "regulatory_filing"
  | "ownership"
  | "other";

export type DiscoveredFiling = {
  stableKey: string;
  sourceId: string;
  identifiers: FilingIdentifiers;
  companyName: string | null;
  title: string;
  category: FilingCategory;
  /** The form or filing type as the source names it, e.g. "10-K". */
  filingType: string | null;
  /** Reporting period the filing covers, when the source states it. */
  period: string | null;
  officialUrl: string;
  /** Links an amendment to the filing it amends, when the source says so. */
  amends: string | null;
  /** True when the source marks this as an amendment or correction. */
  isAmendment: boolean;
  timestamps: IngestionTimestamps;
};

/* ------------------------------------------------------------------ *
 * Documents
 * ------------------------------------------------------------------ */

export type DocumentFormat = "pdf" | "html" | "text" | "xml" | "xbrl" | "inline_xbrl" | "json" | "csv" | "unknown";

export type DocumentEnvelope = {
  /** The URL the bytes actually came from, after any redirects. */
  finalUrl: string;
  requestedUrl: string;
  contentType: string | null;
  byteLength: number;
  /** SHA-256 of the retrieved bytes, when it could be computed. */
  sha256: string | null;
  format: DocumentFormat;
  retrievedUtc: string;
};

/* ------------------------------------------------------------------ *
 * Extraction
 * ------------------------------------------------------------------ */

export type ExtractionQuality = "clean" | "partial" | "garbled" | "unextractable";

export type ExtractionWarning =
  | "missing_pages"
  | "incomplete_table"
  | "encoding_problem"
  | "parser_failure"
  | "truncated"
  | "ocr_used"
  | "ocr_unavailable"
  | "font_encoding_unknown"
  | "compressed_stream_unreadable";

export type ExtractedSection = {
  /** Page, section or heading locator, e.g. "page:3" or "section:MD&A". */
  locator: string;
  heading: string | null;
  text: string;
};

export type ExtractionResult = {
  format: DocumentFormat;
  quality: ExtractionQuality;
  sections: ExtractedSection[];
  warnings: ExtractionWarning[];
  /** Parser identity, so a result can be traced to the code that produced it. */
  parser: string;
  parserVersion: string;
  extractedUtc: string;
  /** Plain-language note about what could not be read. */
  note: string | null;
};

/* ------------------------------------------------------------------ *
 * Financial tables
 * ------------------------------------------------------------------ */

export type AuditStatus = "audited" | "unaudited" | "unknown";

export type TableCell = {
  rowLabel: string;
  columnLabel: string;
  /** The value exactly as printed. */
  raw: string;
  value: number | null;
  /** True when the source printed the figure in parentheses. */
  parenthesised: boolean;
  /** True when the cell was empty in the source. */
  missing: boolean;
};

export type FinancialTable = {
  locator: string;
  title: string | null;
  currency: string | null;
  /** The scale the table declares, e.g. "crore", "million", "thousands". */
  scale: string | null;
  period: string | null;
  basis: AccountingBasis;
  auditStatus: AuditStatus;
  /** Column headings in order. */
  columns: string[];
  cells: TableCell[];
  warnings: ExtractionWarning[];
};
