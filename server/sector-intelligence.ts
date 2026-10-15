import { analyzeFundamentals } from "./fundamental-analysis";
import { fetchIndianOpenStock, normalizeIndianOpenQuote } from "./indian-open-api";
import { fetchNseInstitutionalFlows, unavailableInstitutionalFlows, type FlowRange } from "./nse-flows";
import { sectorUniverseForMarket, sectorNamesForMarket, sectorCandidatesForMarket } from "../lib/market-sector-universe";
import { type MarketId } from "../lib/market-regions";
import { fetchSecurityWiseFlows, securityWiseFlowForSymbol } from "./security-wise-flows";
import { percentOf } from "../lib/precision";
import { resolveSector } from "../lib/sector-registry";

export type SectorSort = "score" | "fii" | "dii" | "marketCap" | "changePercent" | "pe";

export type SectorConstituent = {
  symbol: string;
  name: string;
  sector: string;
  score: number | null;
  verdict: string | null;
  confidence: number | null;
  price: number | null;
  changePercent: number | null;
  marketCap: number | null;
  pe: number | null;
  roe: number | null;
  revenueGrowth: number | null;
  freeCashFlow: number | null;
  fiiNet: number | null;
  diiNet: number | null;
  sectorFiiNet: number | null;
  sectorDiiNet: number | null;
  metricCoverage: "source-backed" | "partial" | "unavailable";
  source: string;
  freshness: string;
  limitations: string[];
};

function clamp(value: number) { return Math.max(0, Math.min(100, Math.round(value))); }
function numeric(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function scoreFor(report: Awaited<ReturnType<typeof analyzeFundamentals>>) { return numeric(report.score); }
function categoryMetric(report: Awaited<ReturnType<typeof analyzeFundamentals>>, pattern: RegExp) {
  const category = report.categories.find((item) => pattern.test(`${item.key} ${item.label}`));
  return category ? clamp(percentOf(category.score, Math.max(category.max, 1)) ?? 0) : null;
}

/**
 * Sector constituents for ONE market.
 *
 * Previously filtered a hardcoded Indian symbol list for every market and always called the
 * NSE flow feeds and the Indian quote provider, so opening Sectors on the US market returned
 * Indian companies with Indian prices and Indian flows. The router accepted a `marketId` and
 * never passed it here.
 *
 * A market with no verified constituent list returns `unsupported` with a reason rather than
 * another country's companies, and the NSE feeds are only contacted for India.
 */
export async function getSectorConstituents(sector: string, marketId: MarketId, options: { sort?: SectorSort; direction?: "asc" | "desc"; range?: FlowRange; limit?: number } = {}) {
  const universe = sectorUniverseForMarket(marketId);
  const candidates = sectorCandidatesForMarket(marketId, sector);
  const isIndia = marketId === "IN";
  const flow = isIndia
    ? await fetchNseInstitutionalFlows({ range: options.range ?? "TODAY" })
    : unavailableInstitutionalFlows(options.range ?? "TODAY", "The NSE FII/DII report is an Indian source and is not requested for this market.");
  const securityWise = isIndia
    ? await fetchSecurityWiseFlows()
    : { available: false, source: null, reportDate: null, error: "Institutional flows are not available for this market.", rows: [] };
  const sectorRows = await Promise.allSettled(candidates.map(async (candidate): Promise<SectorConstituent> => {
    const [quoteResult, reportResult] = await Promise.allSettled([
      isIndia ? fetchIndianOpenStock(candidate.symbol) : Promise.resolve(null),
      analyzeFundamentals(candidate.symbol, marketId),
    ]);
    const quote = quoteResult.status === "fulfilled" && quoteResult.value ? normalizeIndianOpenQuote(quoteResult.value) : null;
    const report = reportResult.status === "fulfilled" ? reportResult.value : null;
    const score = report ? scoreFor(report) : null;
    const securityFlow = securityWiseFlowForSymbol(securityWise.rows, candidate.symbol);
    const metricValues = [quote?.quote.current, quote?.quote.marketCap, report ? score : null].filter((value): value is number => value !== null);
    return {
      symbol: candidate.symbol,
      name: quote?.fundamentals.companyName ?? candidate.name,
      sector: candidate.sector,
      score,
      verdict: report?.verdict ?? null,
      confidence: report?.coverage?.score ?? null,
      price: quote?.quote.current ?? null,
      changePercent: quote?.quote.changePercent ?? null,
      marketCap: quote?.quote.marketCap ?? null,
      pe: quote?.fundamentals.pe ?? (report?.metrics?.pe?.value ?? null),
      roe: report?.metrics?.roe?.value ?? null,
      revenueGrowth: report?.metrics?.revenueGrowth?.value ?? null,
      freeCashFlow: report?.metrics?.freeCashFlow?.value ?? null,
      fiiNet: securityFlow?.fiiNet ?? null,
      diiNet: securityFlow?.diiNet ?? null,
      sectorFiiNet: flow.rows.find((row) => row.participant === "FII/FPI")?.net ?? null,
      sectorDiiNet: flow.rows.find((row) => row.participant === "DII")?.net ?? null,
      metricCoverage: metricValues.length >= 3 ? "source-backed" : metricValues.length ? "partial" : "unavailable",
      source: [quote?.source, securityFlow ? securityFlow.source : null].filter(Boolean).join(" · ") || "Verified research universe; quote provider unavailable",
      freshness: securityFlow?.reportDate ?? quote?.asOf ?? flow.freshnessLabel ?? "Unavailable",
      limitations: [securityFlow ? "Security-wise institutional flow is source-backed." : securityWise.error ?? "Security-wise institutional flow unavailable; aggregate NSE flow is not security attribution.", ...(quoteResult.status === "rejected" ? ["Live quote provider unavailable for this symbol."] : []), ...(reportResult.status === "rejected" ? ["Fundamental report unavailable for this symbol."] : [])],
    };
  }));
  const rows = sectorRows.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  const sort = options.sort ?? "score";
  const direction = options.direction === "asc" ? 1 : -1;
  const value = (row: SectorConstituent) => ({ score: row.score, fii: row.fiiNet, dii: row.diiNet, marketCap: row.marketCap, changePercent: row.changePercent, pe: row.pe }[sort] ?? null) ?? Number.NEGATIVE_INFINITY;
  rows.sort((left, right) => (value(left) - value(right)) * direction || left.symbol.localeCompare(right.symbol));
  // Coverage status is stated explicitly so the UI can distinguish "this sector
  // has no official index / no mapped constituents" from a failed request,
  // instead of inferring it from an error string (FIX 05).
  const resolution = resolveSector(sector);
  const status: "supported" | "unsupported" | "error" = rows.length > 0 ? "supported" : "unsupported";
  const reason = rows.length > 0
    ? null
    : !universe.available
      ? universe.reason
      : resolution.status === "unsupported"
        ? resolution.reason
        : `${sector} is not covered by ${marketId}'s verified constituent universe, and no constituent list is mapped to it.`;
  return {
    sector,
    asOf: new Date().toISOString(),
    status,
    reason,
    availableUniverse: universe.available,
    coverageLabel: `Verified AnalyzerX research universe · ${rows.length} mapped constituent${rows.length === 1 ? "" : "s"}`,
    totalMapped: rows.length,
    sort,
    direction: options.direction ?? "desc",
    flow: { status: flow.status, reportDate: flow.reportDate, freshnessLabel: flow.freshnessLabel, range: flow.range, fiiNet: flow.rows.find((row) => row.participant === "FII/FPI")?.net ?? null, diiNet: flow.rows.find((row) => row.participant === "DII")?.net ?? null, source: flow.source, history: flow.history.map((record) => ({ reportDate: record.reportDate, fiiNet: record.rows.find((row) => row.participant === "FII/FPI")?.net ?? null, diiNet: record.rows.find((row) => row.participant === "DII")?.net ?? null })) },
    limitations: ["This is the verified AnalyzerX research universe, not a claim of complete exchange-wide sector membership.", ...(securityWise.available ? ["Security-wise FII/DII ranking is sourced from the configured validated feed."] : [securityWise.error ?? "No validated security-wise FII/DII feed is configured; aggregate NSE totals are shown separately and are not assigned to stocks."])],
    securityWiseFlow: { available: securityWise.available, source: securityWise.source, reportDate: securityWise.reportDate, topFii: [...rows].filter((row) => row.fiiNet !== null).sort((a, b) => (b.fiiNet as number) - (a.fiiNet as number)).slice(0, 5).map((row) => ({ symbol: row.symbol, value: row.fiiNet })), topDii: [...rows].filter((row) => row.diiNet !== null).sort((a, b) => (b.diiNet as number) - (a.diiNet as number)).slice(0, 5).map((row) => ({ symbol: row.symbol, value: row.diiNet })) },
    rows: rows.slice(0, options.limit ?? 100),
  };
}

/** Sector names for ONE market. Was previously the Indian list for every market. */
export function getAvailableSectorNames(marketId: MarketId) { return sectorNamesForMarket(marketId); }
