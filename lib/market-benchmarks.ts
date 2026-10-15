/**
 * Per-market benchmark registry.
 *
 * The defect this fixes: the "Sector & multi-asset watch" panel on the Screener built
 * its asset list from a hardcoded array — NIFTY 50, SENSEX, BANK NIFTY, S&P 500, BTC,
 * Gold, Brent and USD/INR — and only used the selected market for the cache key. So a
 * user on Australia, Japan or Germany still saw Indian indices at the top of the panel,
 * and the currency row was always the rupee.
 *
 * Every market now declares its own headline indices and its own currency pair. Only the
 * three genuinely global assets (Bitcoin, gold, Brent crude) are shared, because they
 * are quoted in USD worldwide and are not a property of any one market.
 *
 * Pure module: no imports beyond the market id type, so it is unit-testable and cannot
 * pull a database or a network client into a test run.
 */
import { resolveMarketId, type MarketId } from "./market-regions";

export type BenchmarkAssetType = "technical" | "macro";

export type BenchmarkAsset = {
  /** Stable key for React lists and caches. */
  key: string;
  /** Display name shown in the panel. */
  name: string;
  /** Yahoo Finance symbol. */
  symbol: string;
  type: BenchmarkAssetType;
};

export type MarketBenchmarkSet = {
  /** The market's own headline indices, most prominent first. */
  indices: BenchmarkAsset[];
  /** The market's own currency pair. */
  currency: BenchmarkAsset;
};

/**
 * Headline indices and the currency pair for each supported market.
 *
 * Symbols are Yahoo Finance tickers. Each market's own index leads its list.
 */
export const MARKET_BENCHMARKS: Record<MarketId, MarketBenchmarkSet> = {
  IN: {
    indices: [
      { key: "NIFTY", name: "NIFTY 50", symbol: "^NSEI", type: "technical" },
      { key: "SENSEX", name: "SENSEX", symbol: "^BSESN", type: "technical" },
      { key: "BANKNIFTY", name: "BANK NIFTY", symbol: "^NSEBANK", type: "technical" },
    ],
    currency: { key: "USDINR", name: "USD/INR", symbol: "INR=X", type: "macro" },
  },
  US: {
    indices: [
      { key: "SPX", name: "S&P 500", symbol: "^GSPC", type: "technical" },
      { key: "NDX", name: "Nasdaq Composite", symbol: "^IXIC", type: "technical" },
      { key: "DJI", name: "Dow Jones Industrial", symbol: "^DJI", type: "technical" },
    ],
    currency: { key: "DXY", name: "US Dollar index", symbol: "DX-Y.NYB", type: "macro" },
  },
  GB: {
    indices: [
      { key: "FTSE", name: "FTSE 100", symbol: "^FTSE", type: "technical" },
      { key: "FTMC", name: "FTSE 250", symbol: "^FTMC", type: "technical" },
    ],
    currency: { key: "GBPUSD", name: "GBP/USD", symbol: "GBPUSD=X", type: "macro" },
  },
  CA: {
    indices: [
      { key: "TSX", name: "S&P/TSX Composite", symbol: "^GSPTSE", type: "technical" },
      { key: "TSXV", name: "TSX Venture Composite", symbol: "^SPCDNX", type: "technical" },
    ],
    currency: { key: "USDCAD", name: "USD/CAD", symbol: "CAD=X", type: "macro" },
  },
  AU: {
    indices: [
      { key: "ASX200", name: "S&P/ASX 200", symbol: "^AXJO", type: "technical" },
      { key: "AORD", name: "All Ordinaries", symbol: "^AORD", type: "technical" },
    ],
    currency: { key: "AUDUSD", name: "AUD/USD", symbol: "AUDUSD=X", type: "macro" },
  },
  JP: {
    indices: [
      { key: "N225", name: "Nikkei 225", symbol: "^N225", type: "technical" },
      { key: "TOPX", name: "TOPIX", symbol: "^TOPX", type: "technical" },
    ],
    currency: { key: "USDJPY", name: "USD/JPY", symbol: "JPY=X", type: "macro" },
  },
  SG: {
    indices: [
      { key: "STI", name: "Straits Times Index", symbol: "^STI", type: "technical" },
    ],
    currency: { key: "USDSGD", name: "USD/SGD", symbol: "SGD=X", type: "macro" },
  },
  HK: {
    indices: [
      { key: "HSI", name: "Hang Seng", symbol: "^HSI", type: "technical" },
      { key: "HSCEI", name: "Hang Seng China Enterprises", symbol: "^HSCE", type: "technical" },
    ],
    currency: { key: "USDHKD", name: "USD/HKD", symbol: "HKD=X", type: "macro" },
  },
  DE: {
    indices: [
      { key: "DAX", name: "DAX", symbol: "^GDAXI", type: "technical" },
      { key: "MDAX", name: "MDAX", symbol: "^MDAXI", type: "technical" },
    ],
    currency: { key: "EURUSD", name: "EUR/USD", symbol: "EURUSD=X", type: "macro" },
  },
  FR: {
    indices: [
      { key: "CAC", name: "CAC 40", symbol: "^FCHI", type: "technical" },
      { key: "SBF120", name: "SBF 120", symbol: "^SBF120", type: "technical" },
    ],
    currency: { key: "EURUSD", name: "EUR/USD", symbol: "EURUSD=X", type: "macro" },
  },
};

/**
 * Assets that are genuinely global and quoted in USD everywhere. They are shown for
 * every market and are not attributed to any single one.
 */
export const GLOBAL_BENCHMARK_ASSETS: readonly BenchmarkAsset[] = [
  { key: "BTC", name: "Bitcoin", symbol: "BTC-USD", type: "macro" },
  { key: "GOLD", name: "Gold", symbol: "GC=F", type: "macro" },
  { key: "BRENT", name: "Brent crude", symbol: "BZ=F", type: "macro" },
];

/**
 * The full asset list for a market: its own indices, its own currency pair, then the
 * global assets.
 *
 * An unknown or missing market returns ONLY the global assets. It never falls back to
 * India's benchmarks, because showing NIFTY 50 to a user who selected France is exactly
 * the cross-market substitution this module exists to prevent.
 */
export function benchmarksForMarket(marketId: string | null | undefined): BenchmarkAsset[] {
  const resolved = resolveMarketId(marketId);
  const set = resolved === "UNKNOWN" ? undefined : MARKET_BENCHMARKS[resolved as MarketId];
  if (!set) return [...GLOBAL_BENCHMARK_ASSETS];
  return [...set.indices, set.currency, ...GLOBAL_BENCHMARK_ASSETS];
}

/** True when the market has its own benchmark set (i.e. it is one of the ten supported). */
export function hasMarketBenchmarks(marketId: string | null | undefined): boolean {
  const resolved = resolveMarketId(marketId);
  return resolved !== "UNKNOWN" && Boolean(MARKET_BENCHMARKS[resolved as MarketId]);
}
