/**
 * Indian identifiers and accounting conventions (Prompt 4, section 3).
 *
 * Two rules from the prompt are enforced here. First, a company name is never
 * relied on when a reliable identifier exists, so the identity resolver returns
 * whichever of the NSE symbol, BSE scrip code, ISIN and CIN are actually known
 * and leaves the rest explicitly null. Second, the original reported values and
 * units are kept alongside the normalised ones, so an Indian figure in lakhs is
 * never silently turned into a bare number.
 */

export type IndianIdentifiers = {
  nseSymbol: string | null;
  bseScripCode: string | null;
  isin: string | null;
  /** Corporate Identity Number, where available. */
  cin: string | null;
  companyName: string | null;
  aliases: string[];
};

/** An ISIN issued in India begins IN followed by nine alphanumerics and a check digit. */
export function isValidIndianIsin(value: string | null | undefined): boolean {
  return typeof value === "string" && /^IN[A-Z0-9]{9}[0-9]$/.test(value.trim().toUpperCase());
}

/** A CIN is a letter, five digits, two state letters, four digits, three letters, six digits. */
export function isValidCin(value: string | null | undefined): boolean {
  return typeof value === "string" && /^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/i.test(value.trim());
}

/** A BSE scrip code is a five or six digit number. */
export function isValidBseScripCode(value: string | null | undefined): boolean {
  return typeof value === "string" && /^\d{5,6}$/.test(value.trim());
}

/** An NSE symbol is alphanumeric, typically with an ampersand for some series. */
export function isValidNseSymbol(value: string | null | undefined): boolean {
  return typeof value === "string" && /^[A-Z0-9&-]{1,20}$/i.test(value.trim());
}

/**
 * Resolve the identifiers that are actually known.
 *
 * A name is recorded but never used as the key, and an alias list is kept so a
 * search can match a former name without that becoming an identifier.
 */
export function resolveIndianIdentifiers(input: {
  nseSymbol?: string | null;
  bseScripCode?: string | null;
  isin?: string | null;
  cin?: string | null;
  companyName?: string | null;
  aliases?: string[];
}): IndianIdentifiers {
  const isin = input.isin?.trim().toUpperCase() ?? null;
  const cin = input.cin?.trim().toUpperCase() ?? null;
  return {
    nseSymbol: isValidNseSymbol(input.nseSymbol) ? input.nseSymbol!.trim().toUpperCase() : null,
    bseScripCode: isValidBseScripCode(input.bseScripCode) ? input.bseScripCode!.trim() : null,
    isin: isin && isValidIndianIsin(isin) ? isin : null,
    cin: cin && isValidCin(cin) ? cin : null,
    companyName: input.companyName?.trim() || null,
    aliases: (input.aliases ?? []).map((alias) => alias.trim()).filter(Boolean),
  };
}

/** True when at least one reliable identifier is present. */
export function hasReliableIdentifier(identifiers: IndianIdentifiers): boolean {
  return Boolean(identifiers.nseSymbol || identifiers.bseScripCode || identifiers.isin || identifiers.cin);
}

/* ------------------------------------------------------------------ *
 * Indian number formatting
 * ------------------------------------------------------------------ */

/**
 * Parse a figure written in Indian grouping, where the first group after the
 * separator has three digits and later groups have two: 1,20,000 is 120000.
 * International grouping also parses, so both forms are accepted.
 */
export function parseIndianNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const cleaned = trimmed.replace(/[₹\s]/g, "").replace(/[()]/g, "");
  if (!/^-?[\d,]+(\.\d+)?$/.test(cleaned)) return null;
  const digits = cleaned.replace(/,/g, "");
  const numeric = Number(digits);
  if (!Number.isFinite(numeric)) return null;
  return /^\(.*\)$/.test(trimmed) ? -Math.abs(numeric) : numeric;
}

/** Format a number using the Indian grouping convention. */
export function formatIndianNumber(value: number, decimals = 0): string {
  const negative = value < 0;
  const fixed = Math.abs(value).toFixed(decimals);
  const [whole, fraction] = fixed.split(".");
  let grouped: string;
  if (whole.length <= 3) {
    grouped = whole;
  } else {
    const last3 = whole.slice(-3);
    const rest = whole.slice(0, -3);
    grouped = `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}`;
  }
  return `${negative ? "-" : ""}${grouped}${fraction ? `.${fraction}` : ""}`;
}

/** A value in lakhs, with the original figure retained. */
export function toLakh(value: number): { value: number; note: string } {
  return { value: value / 1e5, note: `${value} is ${value / 1e5} lakh; the original figure is retained.` };
}

/** A value in crores, with the original figure retained. */
export function toCrore(value: number): { value: number; note: string } {
  return { value: value / 1e7, note: `${value} is ${value / 1e7} crore; the original figure is retained.` };
}

/* ------------------------------------------------------------------ *
 * Reporting conventions
 * ------------------------------------------------------------------ */

export type IndianReportingPeriod = {
  /** The fiscal year label, e.g. "FY27". */
  fiscalYear: string | null;
  /** The quarter within the fiscal year, e.g. "Q2". */
  quarter: string | null;
  /** True when the period is a full year rather than an interim one. */
  annual: boolean;
};

/**
 * Parse an Indian reporting period.
 *
 * The Indian fiscal year runs from 1 April to 31 March, so FY27 is the year
 * ending 31 March 2027. The convention is stated rather than assumed silently.
 */
export function parseIndianPeriod(text: string): IndianReportingPeriod {
  const value = text.trim();
  const fy = value.match(/\bFY\s*(\d{2,4})\b/i);
  const quarter = value.match(/\bQ([1-4])\b/i);
  let fiscalYear: string | null = null;
  if (fy) {
    const raw = fy[1];
    fiscalYear = raw.length === 2 ? `FY${raw}` : `FY${raw.slice(-2)}`;
  }
  return {
    fiscalYear,
    quarter: quarter ? `Q${quarter[1]}` : null,
    annual: Boolean(fiscalYear) && !quarter,
  };
}

/** The Indian fiscal year a date falls in, given the 1 April boundary. */
export function fiscalYearForDate(date: Date): string {
  const year = date.getUTCMonth() >= 3 ? date.getUTCFullYear() + 1 : date.getUTCFullYear();
  return `FY${String(year).slice(-2)}`;
}

/** Reporting terminology, explained without changing its meaning. */
export const INDIAN_TERMINOLOGY: Array<{ term: string; meaning: string }> = [
  { term: "Standalone", meaning: "The parent company's own accounts, excluding its subsidiaries." },
  { term: "Consolidated", meaning: "The parent and its subsidiaries reported as one entity." },
  { term: "Lakh", meaning: "One hundred thousand (100,000)." },
  { term: "Crore", meaning: "Ten million (10,000,000), or one hundred lakh." },
  { term: "FY27", meaning: "The fiscal year ending 31 March 2027, the Indian reporting year." },
  { term: "Result", meaning: "A quarterly or annual financial statement filed with the exchange." },
  { term: "Outcome of board meeting", meaning: "The decisions taken at a board meeting, often including results or a dividend." },
  { term: "Prior intimation", meaning: "Advance notice to the exchange that a board meeting will be held." },
  { term: "Shareholding pattern", meaning: "The quarterly breakdown of who owns the company's shares." },
];

export function explainTerm(term: string): string | null {
  const match = INDIAN_TERMINOLOGY.find((entry) => entry.term.toLowerCase() === term.trim().toLowerCase());
  return match?.meaning ?? null;
}
