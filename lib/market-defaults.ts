/**
 * Market-scoped defaults (master mandate Phase 3).
 *
 * The mandate names this defect explicitly: an Indian instrument must not be used
 * as a generic fallback for a US, UK, French, Japanese or other international
 * query. The codebase did exactly that — several screens and one server helper
 * fell back to the literal string "RELIANCE" regardless of the active market.
 *
 * These helpers replace that with the *active market's own* example instruments,
 * and refuse to substitute a different market's ticker when the active market has
 * no sensible default. Returning null (and letting the caller show an honest
 * empty state) is preferred over silently answering about the wrong company.
 */

import { MARKET_PROFILES, type MarketId } from "./market-regions";

/** Exchange suffix each market's instruments normally carry, for plausibility checks. */
export const MARKET_EXCHANGE_SUFFIXES: Record<string, string[]> = {
  IN: ["", ".NS", ".BO"],
  US: ["", ".US"],
  GB: [".L", ".IL", ".LON"],
  CA: [".TO", ".V", ".CN"],
  AU: [".AX", ".ASX"],
  JP: [".T", ".JP"],
  SG: [".SI", ".SG"],
  HK: [".HK"],
  DE: [".DE", ".F", ".XETRA", ".BE", ".MU", ".SG"],
  FR: [".PA", ".FR"],
};

/** The market's own example instruments, in declared order. */
export function marketExampleSymbols(marketId: string): string[] {
  const profile = MARKET_PROFILES.find((entry) => entry.id === marketId);
  if (!profile) return [];
  return profile.tickerExamples.filter((symbol) => typeof symbol === "string" && symbol.trim().length > 0);
}

/**
 * A default instrument for the active market, or null when the market is unknown
 * or declares no example. It never returns another market's instrument.
 */
export function defaultSymbolForMarket(marketId: string): string | null {
  return marketExampleSymbols(marketId)[0] ?? null;
}

/** Up to `count` example instruments for the active market. */
export function defaultSymbolsForMarket(marketId: string, count = 3): string[] {
  return marketExampleSymbols(marketId).slice(0, Math.max(0, count));
}

/**
 * Resolve a symbol for a request without crossing markets. Returns the trimmed
 * symbol when one was supplied; otherwise the active market's default; otherwise
 * null — never a ticker from a different market.
 */
export function resolveMarketScopedSymbol(symbol: string | null | undefined, marketId: string): string | null {
  const clean = (symbol ?? "").trim();
  if (clean) return clean.toUpperCase();
  return defaultSymbolForMarket(marketId);
}

/**
 * Whether a ticker is plausible for the given market, based on its exchange
 * suffix. A bare ticker is accepted for markets that use one (US, IN). A ticker
 * carrying another market's suffix is not plausible for this market — that is the
 * signal that would have caught "RELIANCE" being used for a French query.
 */
export function isSymbolPlausibleForMarket(symbol: string | null | undefined, marketId: string): boolean {
  const clean = (symbol ?? "").trim().toUpperCase();
  if (!clean) return false;
  const allowed = MARKET_EXCHANGE_SUFFIXES[marketId];
  if (!allowed) return false;

  const suffix = clean.includes(".") ? clean.slice(clean.indexOf(".")) : "";
  if (allowed.includes(suffix)) return true;

  // A suffix that belongs to a *different* market is a definite mismatch.
  const otherSuffixes = Object.entries(MARKET_EXCHANGE_SUFFIXES)
    .filter(([id]) => id !== marketId)
    .flatMap(([, suffixes]) => suffixes)
    .filter((value) => value.length > 0);
  if (suffix && otherSuffixes.includes(suffix)) return false;

  // Unknown suffix: do not claim it is fine, but do not reject an untagged ticker.
  return suffix === "";
}

/**
 * Peers for a market. Replaces the hardcoded Indian peer fallback: when the
 * market has no declared peers the caller gets an empty list and shows an honest
 * empty state rather than peers from the wrong market.
 */
export function marketScopedPeers(marketId: string, excludeSymbol: string | null, count = 3): string[] {
  const exclude = (excludeSymbol ?? "").trim().toUpperCase();
  return marketExampleSymbols(marketId)
    .map((symbol) => symbol.toUpperCase())
    .filter((symbol) => symbol !== exclude)
    .slice(0, Math.max(0, count));
}

/**
 * Starter prompts for the assistant, scoped to the active market.
 *
 * The assistant previously showed the same three Indian prompts ("Analyze TCS
 * fundamentals", "latest risks for RELIANCE", "FII vs DII") while the market scope
 * read United States. Prompts now use the active market's own instruments, and the
 * third prompt drops India-only terminology for other markets.
 */
export function starterPromptsForMarket(marketId: string): string[] {
  const symbols = marketExampleSymbols(marketId);
  const first = symbols[0];
  const second = symbols[1];
  if (!first) {
    return ["Ask about a company or market", "Explain what this app can do", "Show me where Market Flows is"];
  }
  const prompts = [`Analyze ${first} fundamentals`];
  if (second) prompts.push(`What are the latest risks for ${second}?`);
  prompts.push(marketId === "IN" ? "Show me where Market Flows is and explain FII vs DII" : "Show me where Market Flows is");
  return prompts;
}

/** Market ids this module knows about (declared profiles only). */
/**
 * The suffix a provider expects for each market's primary listing.
 *
 * This replaces the blanket `${symbol}.NS` that the home screen applied to every
 * search result: a US ticker must stay bare, a UK ticker takes `.L`, and so on.
 */
export const MARKET_PRIMARY_SUFFIX: Record<string, string> = {
  IN: ".NS",
  US: "",
  GB: ".L",
  CA: ".TO",
  AU: ".AX",
  JP: ".T",
  SG: ".SI",
  HK: ".HK",
  DE: ".DE",
  FR: ".PA",
};

/**
 * Convert a bare ticker into the symbol the active market's provider expects.
 * An already-suffixed symbol is returned unchanged (never double-suffixed), and an
 * unknown market is left alone rather than given a guessed suffix.
 */
export function providerSymbolForMarket(symbol: string | null | undefined, marketId: string): string | null {
  const clean = (symbol ?? "").trim().toUpperCase();
  if (!clean) return null;
  if (clean.includes(".")) return clean;
  if (!(marketId in MARKET_PRIMARY_SUFFIX)) return clean;
  return `${clean}${MARKET_PRIMARY_SUFFIX[marketId]}`;
}

/**
 * Infer the market an instrument belongs to from its exchange suffix.
 *
 * A bare ticker is genuinely ambiguous (both US and IN commonly use one), so the
 * tie-break deliberately favours US: defaulting an untagged ticker to India is
 * the exact behaviour the mandate forbids. An untagged ticker that is one of
 * India's declared examples still resolves to IN.
 */
export function inferMarketFromSymbol(symbol: string | null | undefined): MarketId | null {
  const clean = (symbol ?? "").trim().toUpperCase();
  if (!clean) return null;
  const suffix = clean.includes(".") ? clean.slice(clean.indexOf(".")) : "";
  if (suffix) {
    for (const [id, suffixes] of Object.entries(MARKET_EXCHANGE_SUFFIXES)) {
      if (suffixes.includes(suffix)) return id as MarketId;
    }
    return null;
  }
  const indianExamples = marketExampleSymbols("IN").map((entry) => entry.toUpperCase());
  if (indianExamples.includes(clean)) return "IN";
  return "US";
}

/** Market ids this module knows about (declared profiles only). */
export function knownMarketIds(): MarketId[] {
  return MARKET_PROFILES.map((profile) => profile.id) as MarketId[];
}
