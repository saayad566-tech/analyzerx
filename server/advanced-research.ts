import { analyzeFundamentals } from "./fundamental-analysis";
import { type MarketId } from "../lib/market-regions";
import { inferMarketFromSymbol, marketScopedPeers } from "../lib/market-defaults";

const peerMap: Record<string, string[]> = {
  RELIANCE: ["TCS", "INFY", "LT"],
  TCS: ["INFY", "WIPRO", "HCLTECH"],
  INFY: ["TCS", "WIPRO", "HCLTECH"],
  HDFCBANK: ["ICICIBANK", "AXISBANK", "KOTAKBANK"],
  ICICIBANK: ["HDFCBANK", "AXISBANK", "KOTAKBANK"],
  TATAMOTORS: ["MARUTI", "M&M", "EICHERMOT"],
  TATASTEEL: ["JSWSTEEL", "HINDALCO", "JINDALSTEL"],
};

export type PeerComparison = {
  symbol: string;
  peers: Array<{ symbol: string; companyName: string; score: number; verdict: string; dataQuality: "reported" | "mixed" | "estimated"; sourceCount: number }>;
  note: string;
};

export async function comparePeers(symbol: string, marketId: MarketId): Promise<PeerComparison> {
  const normalized = symbol.trim().toUpperCase();
  // Peers follow the instrument's own market. The previous fallback always used
  // Indian peers, which is the cross-market leak the mandate forbids.
  const peerSymbols = peerMap[normalized] ?? marketScopedPeers(inferMarketFromSymbol(normalized) ?? "US", normalized);
  const results = await Promise.all(peerSymbols.slice(0, 3).map(async (peer) => {
    try {
      const analysis = await analyzeFundamentals(peer, marketId);
      const estimated = Object.values(analysis.metrics).filter((metric) => metric.basis === "estimated").length;
      return { symbol: analysis.resolvedSymbol, companyName: analysis.companyName, score: analysis.score, verdict: analysis.verdict, dataQuality: estimated === 0 ? "reported" as const : estimated < 5 ? "mixed" as const : "estimated" as const, sourceCount: analysis.sources.filter((source) => source.status === "used").length };
    } catch {
      return { symbol: peer, companyName: peer, score: 0, verdict: "Unavailable", dataQuality: "estimated" as const, sourceCount: 0 };
    }
  }));
  return { symbol: normalized, peers: results.sort((a, b) => b.score - a.score), note: "Peer rows use the same multi-tier analysis and are not an investment recommendation." };
}

export function getOfficialFilingLinks(symbol: string) {
  const normalized = symbol.trim().toUpperCase();
  return {
    symbol: normalized,
    links: [
      { label: "NSE corporate announcements", url: "https://www.nseindia.com/companies-listing/corporate-filings-announcements", status: "official page" },
      { label: "NSE corporate actions", url: "https://www.nseindia.com/companies-listing/corporate-filings-actions", status: "official page" },
      { label: "NSE results and filings", url: "https://www.nseindia.com/companies-listing/corporate-filings-application", status: "official page" },
      { label: "BSE company announcements", url: "https://www.bseindia.com/corporates/ann.html", status: "official page" },
      { label: "SEBI filings search", url: "https://www.sebi.gov.in/filings.html", status: "official page" },
    ],
    note: "These are official entry points. A document is not claimed to be matched to the symbol until the exchange search returns it.",
  };
}
