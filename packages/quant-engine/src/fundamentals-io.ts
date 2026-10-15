/**
 * Fundamentals ingestion.
 *
 * Same discipline as the OHLCV parser: strict, explicit about what it dropped, and never coercing a
 * missing value into a zero. A screen run on invented inputs would produce confident nonsense.
 */
import type { Fundamentals } from "./fundamentals";

export type FundamentalsIssue = { index: number; reason: string };
export type FundamentalsParseResult =
  | { status: "ok"; companies: Fundamentals[]; dropped: number; issues: FundamentalsIssue[]; notes: string[] }
  | { status: "error"; reason: string };

const NUMERIC_FIELDS: (keyof Fundamentals)[] = [
  "price", "sharesOutstanding", "marketCap", "revenue", "netIncome", "eps", "bookValuePerShare", "equity",
  "totalAssets", "currentAssets", "currentLiabilities", "totalLiabilities", "totalDebt", "cash", "inventory",
  "receivables", "ebit", "ebitda", "operatingCashFlow", "freeCashFlow", "revenueGrowth", "epsGrowth",
  "dividendYield", "peRatio", "pbRatio", "psRatio", "pegRatio", "roe", "roic", "relativeStrength",
];

function coerce(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(String(value).replace(/[,\s$₹€£%]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

/** Percentage inputs ("15%", 15) are converted to fractions; already-fractional inputs pass through. */
function coerceRate(value: unknown): number | null {
  if (typeof value === "string" && value.trim().endsWith("%")) {
    const numeric = coerce(value.replace("%", ""));
    return numeric === null ? null : numeric / 100;
  }
  return coerce(value);
}

const RATE_FIELDS: (keyof Fundamentals)[] = ["revenueGrowth", "epsGrowth", "dividendYield", "roe", "roic", "relativeStrength"];

/**
 * Parse an array of fundamental records. Accepts a JSON array, or an object with a
 * `companies` / `fundamentals` / `data` array.
 */
export function parseFundamentals(text: string): FundamentalsParseResult {
  const trimmed = text.trim();
  if (!trimmed) return { status: "error", reason: "The input is empty." };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    return { status: "error", reason: `The JSON could not be parsed: ${error instanceof Error ? error.message : String(error)}` };
  }
  let rows: unknown;
  if (Array.isArray(parsed)) rows = parsed;
  else if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    rows = record.companies ?? record.fundamentals ?? record.data ?? null;
  }
  if (!Array.isArray(rows)) return { status: "error", reason: "Expected a JSON array of companies (or an object with a companies/fundamentals/data array)." };

  const companies: Fundamentals[] = [];
  const issues: FundamentalsIssue[] = [];
  rows.forEach((row, index) => {
    if (!row || typeof row !== "object") {
      issues.push({ index, reason: "row is not an object" });
      return;
    }
    const record = row as Record<string, unknown>;
    const symbolRaw = record.symbol ?? record.ticker ?? record.code;
    const symbol = typeof symbolRaw === "string" ? symbolRaw.trim().toUpperCase() : "";
    if (!symbol) {
      issues.push({ index, reason: "missing symbol" });
      return;
    }
    const company: Fundamentals = { symbol };
    if (typeof record.name === "string") company.name = record.name;
    if (typeof record.sector === "string") company.sector = record.sector;
    if (typeof record.industry === "string" && !company.sector) company.sector = record.industry;
    if (typeof record.description === "string") company.description = record.description;
    for (const field of NUMERIC_FIELDS) {
      const raw = record[field];
      if (raw === undefined) continue;
      const value = RATE_FIELDS.includes(field) ? coerceRate(raw) : coerce(raw);
      // An explicitly present but unparsable value is recorded as null, never as 0.
      (company as Record<string, unknown>)[field] = value;
    }
    companies.push(company);
  });

  if (companies.length === 0) return { status: "error", reason: "No company records with a symbol were found." };
  const notes: string[] = [];
  const sparse = companies.filter((company) => company.revenue === undefined && company.ebit === undefined && company.netIncome === undefined).length;
  if (sparse > 0) notes.push(`${sparse} record(s) carry no revenue, EBIT or net income, so fundamental screens will report those criteria as not evaluable.`);
  return { status: "ok", companies, dropped: issues.length, issues, notes };
}
