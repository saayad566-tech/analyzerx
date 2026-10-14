/**
 * Per-market seed universe.
 *
 * The defect this fixes: the news tracker's symbol coverage came from a hardcoded
 * Indian list (RELIANCE, TCS, INFY, HDFCBANK, ICICIBANK, ADANIENT, TATAMOTORS) and, when
 * that was empty, from the NSE universe. So the tracker only ever collected news for
 * Indian symbols, and every other market had nothing to show.
 *
 * These are seed lists of well-known, liquid constituents per market. They are a
 * starting universe, not a claim of completeness: the tracker rotates through them and
 * an operator can extend any market through NEWS_TRACKER_SYMBOLS. Symbols are written
 * the way each exchange quotes them, so they resolve correctly downstream.
 *
 * Pure module: no I/O, no server imports, so it is unit-testable.
 */
import { resolveMarketId, type MarketId } from "./market-regions";

export const MARKET_SEED_UNIVERSE: Record<MarketId, readonly string[]> = {
  IN: ["RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK", "ADANIENT", "TATAMOTORS", "SBIN", "BHARTIARTL", "LT"],
  US: ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "JPM", "XOM", "UNH"],
  GB: ["SHEL.L", "HSBA.L", "AZN.L", "ULVR.L", "BP.L", "GSK.L", "RIO.L", "BATS.L", "LLOY.L", "BARC.L"],
  CA: ["RY.TO", "SHOP.TO", "TD.TO", "ENB.TO", "CNR.TO", "BMO.TO", "BNS.TO", "CP.TO", "SU.TO", "MFC.TO"],
  AU: ["BHP.AX", "CBA.AX", "CSL.AX", "NAB.AX", "WBC.AX", "ANZ.AX", "WES.AX", "FMG.AX", "WOW.AX", "TLS.AX"],
  JP: ["7203.T", "6758.T", "9984.T", "6861.T", "8306.T", "6098.T", "9432.T", "7974.T", "4063.T", "8035.T"],
  SG: ["D05.SI", "O39.SI", "C6L.SI", "U11.SI", "Z74.SI", "A17U.SI", "S68.SI", "Y92.SI", "G13.SI", "H78.SI"],
  HK: ["0700.HK", "9988.HK", "0005.HK", "1299.HK", "0388.HK", "3690.HK", "2318.HK", "1810.HK", "0941.HK", "0016.HK"],
  DE: ["SAP.DE", "SIE.DE", "ALV.DE", "DTE.DE", "BAS.DE", "BAYN.DE", "BMW.DE", "MBG.DE", "MUV2.DE", "RWE.DE"],
  FR: ["MC.PA", "OR.PA", "TTE.PA", "SAN.PA", "AIR.PA", "BNP.PA", "SU.PA", "AI.PA", "CS.PA", "DG.PA"],
};

/**
 * The seed symbols for a market.
 *
 * An unknown or missing market returns an empty list. It never falls back to the Indian
 * seed list, because collecting Indian symbols for a French market is precisely the
 * substitution this module exists to prevent.
 */
export function seedUniverseForMarket(marketId: string | null | undefined): readonly string[] {
  const resolved = resolveMarketId(marketId);
  if (resolved === "UNKNOWN") return [];
  return MARKET_SEED_UNIVERSE[resolved as MarketId] ?? [];
}

/** Every market that has a seed universe, in a stable order. */
export function seededMarketIds(): MarketId[] {
  return Object.keys(MARKET_SEED_UNIVERSE) as MarketId[];
}
