/**
 * Financial-table extraction (Prompt 2, section 5).
 *
 * The point of this module is to preserve what a naive number-scrape throws
 * away: the unit, the currency, the scale, the period, whether the figures are
 * consolidated or standalone, whether they are audited, whether a figure was
 * printed in parentheses, and whether a cell was simply empty.
 *
 * It also refuses to treat every number in a document as a financial fact. A
 * number only becomes a cell when its row carries a recognisable financial
 * label; a page number or a footnote marker is not a fact.
 */

import type { AuditStatus, FinancialTable, TableCell, ExtractionWarning } from "./types";
import type { AccountingBasis } from "../types";

/** Scale words that appear in Indian and international filings. */
export function parseScale(text: string): string | null {
  const value = text.toLowerCase();
  if (/\bcrores?\b|\bcr\.?\b/.test(value)) return "crore";
  if (/\blakhs?\b|\blacs?\b/.test(value)) return "lakh";
  if (/\bmillions?\b|\bmn\b/.test(value)) return "million";
  if (/\bbillions?\b|\bbn\b/.test(value)) return "billion";
  if (/\bthousands?\b|\b'000\b|\b000s\b/.test(value)) return "thousand";
  if (/\brupees?\b|\brs\.?\b|\binr\b|₹/.test(value)) return "rupee";
  return null;
}

/** Currency symbols and codes seen in filings. */
export function parseCurrency(text: string): string | null {
  const value = text.toLowerCase();
  if (/₹|\brupees?\b|\binr\b|\brs\.?\b/.test(value)) return "INR";
  if (/\busd\b|\bus\$|\$\s|\bdollars?\b/.test(value)) return "USD";
  if (/€|\beur\b|\beuros?\b/.test(value)) return "EUR";
  if (/£|\bgbp\b|\bpounds?\b|\bsterling\b/.test(value)) return "GBP";
  if (/¥|\bjpy\b|\byen\b/.test(value)) return "JPY";
  return null;
}

/** Consolidated versus standalone. */
export function parseBasis(text: string): AccountingBasis {
  const value = text.toLowerCase();
  if (/\bconsolidated\b/.test(value)) return "consolidated";
  if (/\bstandalone\b|\bstand-alone\b|\bseparate\b/.test(value)) return "standalone";
  return "unknown";
}

/** Audited versus unaudited, including the "reviewed" middle ground. */
export function parseAuditStatus(text: string): AuditStatus {
  const value = text.toLowerCase();
  if (/\bun-?audited\b|\breviewed but not audited\b/.test(value)) return "unaudited";
  if (/\baudited\b/.test(value)) return "audited";
  return "unknown";
}

/** Reporting period, when the table states one. */
export function parsePeriod(text: string): string | null {
  const patterns = [
    /\b(?:year|period|quarter|half)[\s-]*(?:ended|ending)\s+([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})/i,
    /\b(?:year|period|quarter|half)[\s-]*(?:ended|ending)\s+(\d{1,2}\s+[A-Za-z]{3,9},?\s+\d{4})/i,
    /\b(Q[1-4])\s*(?:FY|of)?\s*(\d{2,4})\b/i,
    /\b(FY\s*\d{2,4})\b/i,
    /\b(as at|as of)\s+([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0].trim();
  }
  return null;
}

/**
 * Parse a printed figure.
 *
 * Parentheses mean negative in the accounting convention used here, and the
 * fact that the source printed them is retained so the rendering can match.
 * An empty cell is reported as missing rather than as zero, because zero and
 * "not stated" are different things.
 */
export function parseFigure(raw: string): { value: number | null; parenthesised: boolean; missing: boolean } {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "-" || trimmed === "–" || trimmed === "—" || /^n\/?a$/i.test(trimmed)) {
    return { value: null, parenthesised: false, missing: true };
  }
  const parenthesised = /^\(.*\)$/.test(trimmed);
  // A figure must *look* like a number: an optional sign, currency symbol and
  // parentheses around digits with thousands separators. A label such as
  // "FY27" contains digits but is not a figure, so it must not parse.
  const FIGURE = /^[-(]?\s*[₹$€£¥]?\s*[+-]?\s*[\d,]+(?:\.\d+)?\s*%?\s*[)]?$/;
  if (!FIGURE.test(trimmed)) return { value: null, parenthesised, missing: false };
  const cleaned = trimmed.replace(/[,\s₹$€£¥()%]/g, "");
  const numeric = Number(cleaned);
  if (!Number.isFinite(numeric)) return { value: null, parenthesised, missing: false };
  return { value: parenthesised ? -Math.abs(numeric) : numeric, parenthesised, missing: false };
}

/** Labels that mark a row as carrying a financial fact. */
const FACT_LABEL = /\b(revenue|income|turnover|sales|expense|expenditure|cost|costs|profit|loss|ebitda|ebit|margin|eps|earnings|assets?|liabilit|equity|debt|borrowing|cash|receivable|payable|inventor|capital|reserves|dividend|tax|depreciation|amortis|amortiz|interest|net worth|book value|capex|investment|provision|goodwill|intangible|retained)\b/i;

export function looksLikeFinancialLabel(label: string): boolean {
  return FACT_LABEL.test(label);
}

/**
 * Turn a parsed grid into a financial table.
 *
 * The first row is treated as the header when it carries no numbers, which is
 * the common shape. Every numeric cell whose row label looks financial becomes
 * a cell; other numbers are ignored rather than promoted to facts.
 */
export function extractFinancialTable(
  rows: string[][],
  options: { locator: string; title?: string | null; context?: string },
): FinancialTable {
  const warnings: ExtractionWarning[] = [];
  const context = options.context ?? "";
  const table: FinancialTable = {
    locator: options.locator,
    title: options.title ?? null,
    currency: parseCurrency(context),
    scale: parseScale(context),
    period: parsePeriod(context),
    basis: parseBasis(context),
    auditStatus: parseAuditStatus(context),
    columns: [],
    cells: [],
    warnings,
  };

  if (rows.length === 0) {
    warnings.push("incomplete_table");
    return table;
  }

  // A header row is one that carries no *numeric value*. A label such as
  // "FY27" contains digits but is not a figure, so the test is on the parsed
  // value rather than on the presence of a digit.
  const headerHasNumbers = rows[0].some((cell) => parseFigure(cell).value !== null);
  const headerRow = headerHasNumbers ? [] : rows[0];
  const bodyRows = headerHasNumbers ? rows : rows.slice(1);
  table.columns = headerRow.length ? headerRow.map((cell) => cell.trim()) : [];

  // A header that mentions a currency or scale refines the context.
  const headerText = headerRow.join(" ");
  table.currency = table.currency ?? parseCurrency(headerText);
  table.scale = table.scale ?? parseScale(headerText);

  if (bodyRows.length === 0) {
    warnings.push("incomplete_table");
    return table;
  }

  for (const [rowIndex, row] of bodyRows.entries()) {
    if (row.length === 0) continue;
    const rowLabel = (row[0] ?? "").trim();
    if (!rowLabel) continue;
    // Only a row whose label looks financial yields facts.
    if (!looksLikeFinancialLabel(rowLabel)) continue;

    for (let column = 1; column < row.length; column += 1) {
      const raw = row[column] ?? "";
      const columnLabel = table.columns[column] ?? `column ${column + 1}`;
      const parsed = parseFigure(raw);
      if (parsed.missing && raw.trim() === "") {
        table.cells.push({ rowLabel, columnLabel, raw, value: null, parenthesised: false, missing: true });
        continue;
      }
      if (parsed.value === null && !parsed.missing) {
        warnings.push("incomplete_table");
        continue;
      }
      table.cells.push({ rowLabel, columnLabel, raw, value: parsed.value, parenthesised: parsed.parenthesised, missing: parsed.missing });
    }
    if (rowIndex > 2000) {
      warnings.push("truncated");
      break;
    }
  }

  const anyMissing = table.cells.some((cell) => cell.missing);
  if (anyMissing) warnings.push("incomplete_table");
  table.warnings = [...new Set(warnings)];
  return table;
}

/** A table's cells that carry a real value, for downstream fact building. */
export function valuedCells(table: FinancialTable): TableCell[] {
  return table.cells.filter((cell) => !cell.missing && cell.value !== null);
}
