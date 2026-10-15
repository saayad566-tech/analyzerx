import { fetchNseInstitutionalFlows } from "./nse-flows";
import { type MarketId } from "../lib/market-regions";

export type PositioningCoverage = {
  symbol: string;
  asOf: string;
  securityLevelAvailable: false;
  evidence: {
    aggregateInstitutionalFlows: Awaited<ReturnType<typeof fetchNseInstitutionalFlows>>;
    stockLevel: null;
  };
  missingInputs: string[];
  explanation: string;
};

export async function getPositioningCoverage(symbol: string, marketId: MarketId): Promise<PositioningCoverage> {
  // The NSE FII/DII report is India-only; requesting it elsewhere would attach Indian
  // participant flows to a non-Indian security.
  const aggregateInstitutionalFlows = marketId === "IN"
    ? await fetchNseInstitutionalFlows()
    : { status: "unavailable" as const, reportDate: null, freshnessLabel: null, range: "TODAY" as const, rows: [], source: null, history: [], upstream: null };
  return {
    symbol: symbol.trim().toUpperCase(),
    asOf: new Date().toISOString(),
    securityLevelAvailable: false,
    evidence: { aggregateInstitutionalFlows, stockLevel: null },
    missingInputs: [
      "Verified security-level bulk and block deal records",
      "Mutual-fund portfolio and holding-change disclosures",
      "Promoter pledge and shareholding history",
      "Licensed stock-level options and open-interest history",
    ],
    explanation: "Aggregate FII/FPI and DII totals describe market-level activity and do not prove that this security was bought or sold. Stock-level positioning will be enabled only after the corresponding verified datasets are connected.",
  };
}
