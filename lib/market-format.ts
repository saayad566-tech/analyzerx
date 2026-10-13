/**
 * Per-market formatting: currency, number grouping and date/time.
 *
 * The defect this fixes: a US stock showing "₹" or an Indian figure rendered as
 * "1,234,567" instead of "12,34,567". Both are wrong, and both come from using one
 * global formatter regardless of the active market.
 *
 * Everything here takes the market id explicitly. There is no default market and no
 * module-level "current market", so a formatter cannot silently use the wrong one.
 */

import { getMarketProfile } from "./market-regions";

export type CurrencyStyle = "symbol" | "code";

export type MarketFormat = {
  marketId: string;
  currencyCode: string;
  currencySymbol: string;
  /** How this market groups digits. */
  grouping: "indian" | "international";
  /** Words for large magnitudes. */
  scale: readonly ["thousand", "million", "billion"] | readonly ["thousand", "lakh", "crore"];
  /** Locale used for dates. */
  locale: string;
  timeZone: string;
  datePattern: string;
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: "\u20b9",
  USD: "$",
  GBP: "\u00a3",
  CAD: "C$",
  AUD: "A$",
  JPY: "\u00a5",
  SGD: "S$",
  HKD: "HK$",
  EUR: "\u20ac",
};

const FORMAT_BY_MARKET: Record<string, Partial<MarketFormat>> = {
  IN: { grouping: "indian", scale: ["thousand", "lakh", "crore"], locale: "en-IN", datePattern: "DD/MM/YYYY" },
};

/** Resolve the format rules for a market, falling back to international conventions. */
export function formatForMarket(marketId: string): MarketFormat {
  const profile = getMarketProfile(marketId);
  const id = profile.id;
  const override = FORMAT_BY_MARKET[id] ?? {};
  return {
    marketId: id,
    currencyCode: profile.currency,
    currencySymbol: CURRENCY_SYMBOLS[profile.currency] ?? profile.currency,
    grouping: override.grouping ?? "international",
    scale: override.scale ?? ["thousand", "million", "billion"],
    locale: override.locale ?? "en-US",
    timeZone: profile.timezone,
    datePattern: override.datePattern ?? "MM/DD/YYYY",
  };
}

/** Group an integer string using the Indian 2-2-3 convention: 12,34,567. */
function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const head = digits.slice(0, -3);
  const tail = digits.slice(-3);
  return `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${tail}`;
}

/** Group an integer string using the international 3-3-3 convention: 1,234,567. */
function groupInternational(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export type FormatNumberOptions = {
  /** Decimal places. Default 2. */
  decimals?: number;
  /** Include the grouping separators. Default true. */
  grouped?: boolean;
};

/**
 * Format a plain number using the market's grouping convention.
 *
 *   formatMarketNumber(1234567, "IN") -> "12,34,567.00"
 *   formatMarketNumber(1234567, "US") -> "1,234,567.00"
 */
export function formatMarketNumber(value: number | null | undefined, marketId: string, options: FormatNumberOptions = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "\u2014";
  const { decimals = 2, grouped = true } = options;
  const negative = value < 0;
  const fixed = Math.abs(value).toFixed(Math.max(0, decimals));
  const [intPart, fracPart] = fixed.split(".");
  const format = formatForMarket(marketId);
  const groupedInt = grouped
    ? (format.grouping === "indian" ? groupIndian(intPart) : groupInternational(intPart))
    : intPart;
  const body = fracPart ? `${groupedInt}.${fracPart}` : groupedInt;
  return negative ? `-${body}` : body;
}

export type FormatCurrencyOptions = FormatNumberOptions & {
  /** "symbol" (default) prefixes the currency symbol; "code" appends the ISO code. */
  style?: CurrencyStyle;
};

/**
 * Format a monetary amount for a market.
 *
 *   formatMarketCurrency(1234.5, "IN") -> "₹1,234.50"
 *   formatMarketCurrency(1234.5, "US") -> "$1,234.50"
 */
export function formatMarketCurrency(
  value: number | null | undefined,
  marketId: string,
  options: FormatCurrencyOptions = {},
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "\u2014";
  const format = formatForMarket(marketId);
  const style = options.style ?? "symbol";
  const magnitude = formatMarketNumber(Math.abs(value), marketId, options);
  const negative = value < 0;
  const body = style === "code" ? `${magnitude} ${format.currencyCode}` : `${format.currencySymbol}${magnitude}`;
  return negative ? `-${body}` : body;
}

/**
 * Compress a large amount into the market's own scale word.
 *
 *   formatMarketCompact(25000000, "IN") -> "₹2.50 Cr"
 *   formatMarketCompact(25000000, "US") -> "$25.00 M"
 *
 * Indian markets use lakh (10^5) and crore (10^7); others use million and billion.
 */
export function formatMarketCompact(value: number | null | undefined, marketId: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "\u2014";
  const format = formatForMarket(marketId);
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const symbol = format.currencySymbol;

  if (format.grouping === "indian") {
    if (abs >= 1e7) return `${sign}${symbol}${(abs / 1e7).toFixed(2)} Cr`;
    if (abs >= 1e5) return `${sign}${symbol}${(abs / 1e5).toFixed(2)} L`;
    return `${sign}${formatMarketCurrency(abs, marketId, { decimals: 2 })}`;
  }
  if (abs >= 1e9) return `${sign}${symbol}${(abs / 1e9).toFixed(2)} B`;
  if (abs >= 1e6) return `${sign}${symbol}${(abs / 1e6).toFixed(2)} M`;
  if (abs >= 1e3) return `${sign}${symbol}${(abs / 1e3).toFixed(2)} K`;
  return `${sign}${formatMarketCurrency(abs, marketId, { decimals: 2 })}`;
}

/**
 * Format a date for a market as YYYY-MM-DD from an explicit parts object.
 *
 * Deliberately takes parts rather than a Date, so it is deterministic and does not
 * depend on the device's locale or timezone. The caller supplies the market-local
 * calendar date (see `exchangeLocalParts` in market-session.ts).
 */
export function formatMarketDate(
  parts: { year: number; month: number; day: number },
  marketId: string,
): string {
  const format = formatForMarket(marketId);
  const dd = `${parts.day}`.padStart(2, "0");
  const mm = `${parts.month}`.padStart(2, "0");
  const yyyy = `${parts.year}`;
  if (format.datePattern === "DD/MM/YYYY") return `${dd}/${mm}/${yyyy}`;
  return `${mm}/${dd}/${yyyy}`;
}

/** Format a market-local wall-clock time as HH:MM (24-hour), market convention. */
export function formatMarketTime(hour: number, minute: number): string {
  const hh = `${Math.max(0, Math.min(23, Math.floor(hour)))}`.padStart(2, "0");
  const mi = `${Math.max(0, Math.min(59, Math.floor(minute)))}`.padStart(2, "0");
  return `${hh}:${mi}`;
}

/** True when the market uses Indian digit grouping (lakh/crore). */
export function usesIndianGrouping(marketId: string): boolean {
  return formatForMarket(marketId).grouping === "indian";
}
