import { getMarketProfile, MARKET_PROFILES, type MarketId } from "../lib/market-regions";
import { ingestSecCompany } from "./sec-edgar-ingestion";
import { collectRegionalDisclosures, getRegionalDisclosureConfig } from "./regional-disclosure-collector";

export type RegionalCollectorState = "validated" | "catalog-validated" | "schema-pending" | "access-gated";
export type RegionalCollectorDescriptor = { marketId: MarketId; country: string; state: RegionalCollectorState; sourceKeys: string[]; liveDataScope: string[]; blockedScope: string[]; notes: string };

const SOURCE_KEYS: Record<MarketId, string[]> = {
  IN: ["nse-filings", "bse-public-info", "sebi-filings"],
  US: ["sec-edgar-tickers", "sec-edgar-submissions", "sec-company-facts"],
  GB: ["uk-fca-nsm"],
  CA: ["ca-sedar-plus"],
  AU: ["au-asx-announcements"],
  JP: ["jp-jpx-tdnet"],
  SG: ["sg-sgx-disclosures"],
  HK: ["hk-hkexnews"],
  DE: ["eu-esef"],
  FR: ["eu-esef", "fr-amf-disclosures"],
};

export function getRegionalCollectorRegistry(): RegionalCollectorDescriptor[] {
  return MARKET_PROFILES.map((profile) => ({
    marketId: profile.id,
    country: profile.country,
    state: profile.adapterState,
    sourceKeys: SOURCE_KEYS[profile.id],
    liveDataScope: profile.id === "US" ? ["SEC ticker/CIK resolution", "SEC submissions", "SEC XBRL company facts"] : profile.id === "IN" ? ["Existing India source adapters"] : ["Exact issuer resolution when configured", "Validated JSON disclosure ingestion when authorized endpoint is configured", "Source lineage, freshness, checksum, and parser health"],
    blockedScope: profile.id === "US" || ["CA", "AU", "JP", "SG", "HK", "DE", "FR"].includes(profile.id) ? ["quotes", "options", "intraday exchange tape", "institutional flows"] : ["runtime parser", "issuer resolution", "quotes", "options", "institutional flows"],
    notes: profile.notes,
  }));
}

export async function runRegionalCollector(marketId: MarketId, symbol?: string) {
  const profile = getMarketProfile(marketId);
  if (marketId === "US") {
    if (!symbol) return { marketId, status: "needs-symbol" as const, message: "Provide a U.S. ticker for SEC issuer resolution; no market-wide filing sweep is run from a user request." };
    return ingestSecCompany(symbol);
  }
  if (["CA", "AU", "JP", "SG", "HK", "DE", "FR"].includes(marketId)) {
    if (!symbol) return { marketId, status: "needs-symbol" as const, message: `Provide an exact ${profile.country} ticker, issuer name, LEI, or ISIN for issuer resolution.` };
    const result = await collectRegionalDisclosures(marketId, symbol);
    return { ...result, configuredAdapter: Boolean(getRegionalDisclosureConfig(marketId)) };
  }
  return { marketId, status: profile.adapterState as RegionalCollectorState, message: `${profile.country} source catalog is registered, but runtime collection is not promoted until the documented schema, access, and freshness gates pass.`, sourceKeys: SOURCE_KEYS[marketId] };
}
