import { analyzeFundamentals, type FundamentalAnalysis } from "./fundamental-analysis";
import { type MarketId } from "../lib/market-regions";
import { computeDeepScore, type DeepScoreInput, type DeepScoreResult, type SectorModel } from "../lib/scoring";

/**
 * Bridges the app's existing fundamental analysis into the institutional scoring
 * engine. The engine itself is a pure function; this adapter only maps data.
 *
 * Peer note: the app does not yet have the PRD's point-in-time peer store
 * (Phase 0), so no sector peer samples are supplied here and the engine uses its
 * clearly-labelled absolute-anchor fallback. The response states which source was
 * used (`peerSource`), so the UI never presents a baseline percentile as if it
 * were sector-relative.
 */

export type DeepScoreResponse = {
  symbol: string;
  resolvedSymbol: string;
  companyName: string;
  market: { exchange: string; currency: string; country: string };
  result: DeepScoreResult;
};

function metricValue(analysis: FundamentalAnalysis, key: string): number | null {
  const metric = analysis.metrics[key];
  if (!metric) return null;
  const value = metric.value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Map the analysis sector label onto a scoring sector model. */
export function mapSectorModel(label: string | null | undefined): SectorModel {
  const text = (label ?? "").toLowerCase();
  if (/bank/.test(text)) return "banks";
  if (/nbfc|non-?banking|finance|financial/.test(text)) return "nbfc";
  if (/insur/.test(text)) return "insurance";
  if (/\bit\b|software|information technology|technology services/.test(text)) return "it-services";
  if (/pharma|health|drug/.test(text)) return "pharma";
  if (/metal|commodit|cyclical|mining|steel|cement|chemical/.test(text)) return "cyclical";
  if (/real estate|realty|property/.test(text)) return "real-estate";
  if (/utilit|power|infra|energy|oil|gas/.test(text)) return "utilities";
  return "generic";
}

/** Build the engine input from a completed analysis. Pure and side-effect free. */
export function buildDeepScoreInput(analysis: FundamentalAnalysis): DeepScoreInput {
  const metrics: Record<string, number | null> = {
    roe: metricValue(analysis, "roe"),
    operatingMargin: metricValue(analysis, "operatingMargin"),
    grossMargin: metricValue(analysis, "grossMargin"),
    profitMargin: metricValue(analysis, "profitMargin"),
    pe: metricValue(analysis, "pe"),
    pb: metricValue(analysis, "priceToBook"),
    debtToEquity: metricValue(analysis, "debtToEquity"),
    interestCoverage: metricValue(analysis, "interestCoverage"),
    currentRatio: metricValue(analysis, "currentRatio"),
    quickRatio: metricValue(analysis, "quickRatio"),
    cfoToPat: metricValue(analysis, "cashConversion"),
    revenueCagr3y: metricValue(analysis, "revenueGrowth"),
    epsCagr3y: metricValue(analysis, "earningsGrowth"),
    promoterHolding: metricValue(analysis, "promoterHolding"),
    promoterPledge: metricValue(analysis, "promoterPledge"),
  };

  // Derived metrics.
  const freeCashFlow = metricValue(analysis, "freeCashFlow");
  const marketCap = analysis.marketCap.value;
  if (freeCashFlow !== null && marketCap !== null && marketCap > 0) metrics.fcfYield = (freeCashFlow / marketCap) * 100;

  const technical = analysis.stockAnalysis.technical;
  if (technical.rsi14 !== null) metrics.rsiRegime = technical.rsi14;
  if (technical.oneYearChangePct !== null) metrics.momentum12m1m = technical.oneYearChangePct;
  if (technical.currentPrice !== null && technical.high52 !== null && technical.high52 > 0) {
    metrics.drawdown = ((technical.currentPrice - technical.high52) / technical.high52) * 100;
  }

  const intrinsic = analysis.fairValue.dcf.valuePerShare ?? analysis.fairValue.baseValue;
  const price = technical.currentPrice ?? analysis.fairValue.currentPrice;
  if (intrinsic !== null && price !== null && intrinsic > 0) {
    metrics.marginOfSafety = ((intrinsic - price) / intrinsic) * 100;
  }

  return {
    symbol: analysis.resolvedSymbol,
    sector: mapSectorModel(analysis.stockAnalysis.profile.sector),
    metrics,
    peers: {},
    flags: {},
  };
}

export async function buildDeepScore(symbol: string, marketId: MarketId): Promise<DeepScoreResponse> {
  const analysis = await analyzeFundamentals(symbol, marketId);
  const result = computeDeepScore(buildDeepScoreInput(analysis));
  return {
    symbol: analysis.requestedSymbol,
    resolvedSymbol: analysis.resolvedSymbol,
    companyName: analysis.companyName,
    market: { exchange: analysis.market.exchange, currency: analysis.market.currency, country: analysis.market.country },
    result,
  };
}
