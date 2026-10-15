/**
 * Per-market news edition for the Google News RSS surface.
 *
 * The defect this fixes: every market used the India edition (gl=IN, ceid=IN:en) via an
 * environment-variable fallback to India, so a French or US query returned
 * Indian-edition results.
 *
 * Pure module: no server imports, no I/O, so it is unit-testable and cannot drag a
 * database connection into a test run.
 */
import { resolveMarketId } from "./market-regions";

export type NewsEdition = { hl: string; gl: string; ceid: string };

export const NEWS_EDITION: Record<string, NewsEdition> = {
  IN: { hl: "en-IN", gl: "IN", ceid: "IN:en" },
  US: { hl: "en-US", gl: "US", ceid: "US:en" },
  GB: { hl: "en-GB", gl: "GB", ceid: "GB:en" },
  CA: { hl: "en-CA", gl: "CA", ceid: "CA:en" },
  AU: { hl: "en-AU", gl: "AU", ceid: "AU:en" },
  JP: { hl: "ja-JP", gl: "JP", ceid: "JP:ja" },
  SG: { hl: "en-SG", gl: "SG", ceid: "SG:en" },
  HK: { hl: "en-HK", gl: "HK", ceid: "HK:en" },
  DE: { hl: "de-DE", gl: "DE", ceid: "DE:de" },
  FR: { hl: "fr-FR", gl: "FR", ceid: "FR:fr" },
};

/**
 * The news edition for a market, or null.
 *
 * A missing or unknown market returns null — it never falls back to the India edition.
 */
export function newsEditionFor(marketId: string | null | undefined): NewsEdition | null {
  return NEWS_EDITION[resolveMarketId(marketId)] ?? null;
}
