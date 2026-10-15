/**
 * Verified sector → NSE index registry (FIX 05, Step 2).
 *
 * The sector screen previously built an index symbol by concatenating "NIFTY"
 * with the sector name, so "Renewable Energy" became "NIFTYRENEWABLEENERGY" and
 * the source layer threw a raw `SourceError`. Concatenation is not a mapping.
 *
 * This registry is the single source of truth. It lists only indices whose
 * constituent files are actually published by NSE, and it resolves a display
 * name to one of those — or returns an explicit `unsupported` result. It never
 * invents an index symbol.
 */

export type SectorCoverage = "index-backed" | "unsupported";

export type SectorEntry = {
  /** Canonical sector id used internally. */
  id: string;
  /** Display name shown in the UI. */
  displayName: string;
  /** Official NSE index key, or null when no official index exists. */
  indexKey: string | null;
  /** Human-readable provenance for the constituent list. */
  source: string;
  coverage: SectorCoverage;
  /** Alternate spellings that should resolve to this entry. */
  aliases: string[];
  /** Why the sector is unsupported, when it is. */
  note?: string;
};

/**
 * Only indices whose constituent CSV is published on NSE archives. Anything not
 * listed here is treated as unsupported rather than guessed.
 */
export const SECTOR_REGISTRY: SectorEntry[] = [
  { id: "nifty50", displayName: "Nifty 50", indexKey: "NIFTY50", source: "NSE ind_nifty50list.csv", coverage: "index-backed", aliases: ["nifty 50", "nifty50", "large cap", "largecap", "bluechip"] },
  { id: "niftybank", displayName: "Nifty Bank", indexKey: "NIFTYBANK", source: "NSE ind_niftybanklist.csv", coverage: "index-backed", aliases: ["bank", "banks", "banking", "nifty bank"] },
  { id: "niftyit", displayName: "Nifty IT", indexKey: "NIFTYIT", source: "NSE ind_niftyitlist.csv", coverage: "index-backed", aliases: ["it", "it services", "information technology", "technology", "software"] },
  { id: "niftyauto", displayName: "Nifty Auto", indexKey: "NIFTYAUTO", source: "NSE ind_niftyautolist.csv", coverage: "index-backed", aliases: ["auto", "automobile", "automotive", "autos"] },
  { id: "niftypharma", displayName: "Nifty Pharma", indexKey: "NIFTYPHARMA", source: "NSE ind_niftypharmalist.csv", coverage: "index-backed", aliases: ["pharma", "pharmaceutical", "pharmaceuticals", "healthcare"] },
  { id: "niftyfmcg", displayName: "Nifty FMCG", indexKey: "NIFTYFMCG", source: "NSE ind_niftyfmcglist.csv", coverage: "index-backed", aliases: ["fmcg", "consumer staples"] },
  { id: "niftymetal", displayName: "Nifty Metal", indexKey: "NIFTYMETAL", source: "NSE ind_niftymetallist.csv", coverage: "index-backed", aliases: ["metal", "metals", "mining", "steel"] },
  { id: "niftyenergy", displayName: "Nifty Energy", indexKey: "NIFTYENERGY", source: "NSE ind_niftyenergylist.csv", coverage: "index-backed", aliases: ["energy", "oil", "gas", "oil and gas", "power", "utilities"] },
  { id: "niftyrealty", displayName: "Nifty Realty", indexKey: "NIFTYREALTY", source: "NSE ind_niftyrealtylist.csv", coverage: "index-backed", aliases: ["realty", "real estate", "property"] },
  { id: "niftyfinservice", displayName: "Nifty Financial Services", indexKey: "NIFTYFINSERVICE", source: "NSE ind_niftyfinservicelist.csv", coverage: "index-backed", aliases: ["financial services", "financials", "finance", "nbfc", "insurance"] },
  { id: "niftymedia", displayName: "Nifty Media", indexKey: "NIFTYMEDIA", source: "NSE ind_niftymedialist.csv", coverage: "index-backed", aliases: ["media", "entertainment"] },
  { id: "niftypsubank", displayName: "Nifty PSU Bank", indexKey: "NIFTYPSUBANK", source: "NSE ind_niftypsubanklist.csv", coverage: "index-backed", aliases: ["psu bank", "psu banks", "public sector bank"] },
  { id: "niftyinfra", displayName: "Nifty Infrastructure", indexKey: "NIFTYINFRA", source: "NSE ind_niftyinfralist.csv", coverage: "index-backed", aliases: ["infrastructure", "infra"] },
  { id: "niftyconsumerdurables", displayName: "Nifty Consumer Durables", indexKey: "NIFTYCONSRDURBL", source: "NSE ind_niftyconsumerdurlist.csv", coverage: "index-backed", aliases: ["consumer durables", "durables"] },
  { id: "niftychemicals", displayName: "Nifty Chemicals", indexKey: "NIFTYCHEMICALS", source: "NSE ind_niftychemicalslist.csv", coverage: "index-backed", aliases: ["chemicals", "chemical"] },
];

/**
 * Thematic sectors the product surfaces but for which NSE publishes no matching
 * constituent index. They resolve to an explicit unsupported result instead of a
 * fabricated index symbol, and the UI must say so plainly.
 */
export const UNSUPPORTED_SECTORS: SectorEntry[] = [
  { id: "renewable-energy", displayName: "Renewable Energy", indexKey: null, source: "No NSE constituent index is published for this theme.", coverage: "unsupported", aliases: ["renewable energy", "renewables", "solar", "wind"], note: "NSE publishes a Nifty Energy index, but it covers oil, gas and power utilities — not the renewable theme. No verified constituent list is available." },
  { id: "capital-goods", displayName: "Capital Goods", indexKey: null, source: "No NSE constituent index is published for this theme.", coverage: "unsupported", aliases: ["capital goods", "industrials"], note: "No official NSE constituent index maps to this theme; Nifty Infrastructure is a different, broader basket." },
  { id: "defence", displayName: "Defence", indexKey: null, source: "No NSE constituent index is published for this theme.", coverage: "unsupported", aliases: ["defence", "defense", "aerospace"], note: "No verified NSE constituent file is available for this theme." },
  { id: "railways", displayName: "Railways", indexKey: null, source: "No NSE constituent index is published for this theme.", coverage: "unsupported", aliases: ["railways", "railway", "rail"], note: "No verified NSE constituent file is available for this theme." },
];

/** Normalise any sector spelling for lookup. */
export function normalizeSectorKey(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^nifty\s*/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type SectorResolution =
  | { status: "supported"; entry: SectorEntry; indexKey: string }
  | { status: "unsupported"; entry: SectorEntry | null; reason: string; displayName: string };

/**
 * Resolve a sector name to a verified index, or an explicit unsupported result.
 * Never throws — this is the replacement for blind `NIFTY${key}` concatenation.
 */
export function resolveSector(input: string): SectorResolution {
  const key = normalizeSectorKey(input ?? "");
  if (!key) return { status: "unsupported", entry: null, reason: "No sector was supplied.", displayName: input ?? "" };

  const all = [...SECTOR_REGISTRY, ...UNSUPPORTED_SECTORS];
  const match = all.find((entry) =>
    entry.id === key.replace(/\s+/g, "-") ||
    normalizeSectorKey(entry.displayName) === key ||
    entry.aliases.some((alias) => normalizeSectorKey(alias) === key),
  );

  if (!match) {
    return { status: "unsupported", entry: null, reason: `No verified NSE index is mapped to “${input}”.`, displayName: input };
  }
  if (match.coverage === "unsupported" || !match.indexKey) {
    return { status: "unsupported", entry: match, reason: match.note ?? match.source, displayName: match.displayName };
  }
  return { status: "supported", entry: match, indexKey: match.indexKey };
}

/** Display names for the sector list, derived from the registry. */
export function supportedSectorNames(): string[] {
  return SECTOR_REGISTRY.map((entry) => entry.displayName);
}
