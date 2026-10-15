/**
 * Per-market sector universe.
 *
 * The gap this closes: `server/sector-intelligence.ts` filtered a single hardcoded list of
 * Indian NSE symbols for EVERY market, so opening Sectors on the United States showed
 * Indian constituents priced with Indian quotes and Indian institutional flows. The router
 * even accepted a `marketId` and then discarded it, so the screen believed it was scoped
 * while the implementation ignored the market entirely.
 *
 * A market with no verified universe returns an empty list and an explicit reason, so the
 * caller shows nothing rather than substituting another country's companies.
 */
import { type MarketId, MARKET_IDS } from "./market-regions";

export type SectorCandidate = { symbol: string; name: string; sector: string };

/** India is the only market with a verified, source-backed constituent list here. */
const INDIA_UNIVERSE: readonly SectorCandidate[] = [
  { symbol: "ADANIENT", name: "Adani Enterprises", sector: "Diversified" },
  { symbol: "ADANIPORTS", name: "Adani Ports & SEZ", sector: "Infrastructure" },
  { symbol: "APOLLOHOSP", name: "Apollo Hospitals", sector: "Healthcare" },
  { symbol: "ASIANPAINT", name: "Asian Paints", sector: "Consumer" },
  { symbol: "AXISBANK", name: "Axis Bank", sector: "Financials" },
  { symbol: "BAJFINANCE", name: "Bajaj Finance", sector: "Financials" },
  { symbol: "BEL", name: "Bharat Electronics", sector: "Defence" },
  { symbol: "BHARTIARTL", name: "Bharti Airtel", sector: "Telecom" },
  { symbol: "COALINDIA", name: "Coal India", sector: "Energy" },
  { symbol: "GRASIM", name: "Grasim Industries", sector: "Materials" },
  { symbol: "HCLTECH", name: "HCL Technologies", sector: "IT services" },
  { symbol: "HDFCBANK", name: "HDFC Bank", sector: "Financials" },
  { symbol: "ICICIBANK", name: "ICICI Bank", sector: "Financials" },
  { symbol: "INFY", name: "Infosys", sector: "IT services" },
  { symbol: "ITC", name: "ITC", sector: "Consumer" },
  { symbol: "JSWSTEEL", name: "JSW Steel", sector: "Metals" },
  { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank", sector: "Financials" },
  { symbol: "LT", name: "Larsen & Toubro", sector: "Capital goods" },
  { symbol: "MARUTI", name: "Maruti Suzuki", sector: "Automobiles" },
  { symbol: "NTPC", name: "NTPC", sector: "Utilities" },
  { symbol: "ONGC", name: "Oil & Natural Gas Corp", sector: "Energy" },
  { symbol: "POWERGRID", name: "Power Grid Corp", sector: "Utilities" },
  { symbol: "RELIANCE", name: "Reliance Industries", sector: "Diversified" },
  { symbol: "SBIN", name: "State Bank of India", sector: "Financials" },
  { symbol: "SUNPHARMA", name: "Sun Pharmaceutical", sector: "Healthcare" },
  { symbol: "TATAMOTORS", name: "Tata Motors", sector: "Automobiles" },
  { symbol: "TATASTEEL", name: "Tata Steel", sector: "Metals" },
  { symbol: "TCS", name: "Tata Consultancy Services", sector: "IT services" },
  { symbol: "ULTRACEMCO", name: "UltraTech Cement", sector: "Materials" },
  { symbol: "WIPRO", name: "Wipro", sector: "IT services" },
];

const UNIVERSES: Partial<Record<MarketId, readonly SectorCandidate[]>> = { IN: INDIA_UNIVERSE };

export type SectorUniverseStatus = {
  marketId: string;
  candidates: readonly SectorCandidate[];
  available: boolean;
  reason: string | null;
};

/** The sector universe for one market. An unknown market returns unavailable, not India. */
export function sectorUniverseForMarket(marketId: string | null | undefined): SectorUniverseStatus {
  const key = (marketId ?? "").trim().toUpperCase();
  if (!key || !(MARKET_IDS as readonly string[]).includes(key)) {
    return { marketId: key || "UNKNOWN", candidates: [], available: false, reason: "No market was resolved, so no constituent universe can be selected." };
  }
  const candidates = UNIVERSES[key as MarketId];
  if (!candidates || !candidates.length) {
    return { marketId: key, candidates: [], available: false, reason: `No verified sector constituent list is wired for ${key}. AnalyzerX does not substitute another market's companies.` };
  }
  return { marketId: key, candidates, available: true, reason: null };
}

export function sectorNamesForMarket(marketId: string | null | undefined): string[] {
  return [...new Set(sectorUniverseForMarket(marketId).candidates.map((candidate) => candidate.sector))].sort();
}

export function sectorCandidatesForMarket(marketId: string | null | undefined, sector: string): readonly SectorCandidate[] {
  const normalized = (sector ?? "").trim().toLowerCase();
  if (!normalized) return [];
  return sectorUniverseForMarket(marketId).candidates.filter((candidate) => candidate.sector.toLowerCase() === normalized);
}

export function marketHasSectorUniverse(marketId: string | null | undefined): boolean {
  return sectorUniverseForMarket(marketId).available;
}

export function marketsWithSectorUniverse(): MarketId[] {
  return MARKET_IDS.filter((id) => marketHasSectorUniverse(id));
}
