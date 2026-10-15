/**
 * Realistic test fixtures.
 *
 * Fixtures here exist to exercise the algorithms, not to flatter them. A perfectly linear price path
 * or a constant return series passes almost any model and proves almost nothing: a correlation of
 * exactly 1, a regression that fits without residual, a momentum figure with no noise to survive.
 * Everything below is deterministic (seeded) but noisy, non-linear, and where relevant
 * heteroskedastic — so a solver that is fragile will fail here rather than in production.
 */
import type { Candle } from "../../src/core-types";

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal draws (Box-Muller) from a uniform generator. */
export function gaussianFrom(random: () => number): () => number {
  return () => {
    const u = Math.max(random(), 1e-12);
    const v = random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

export type CandleOptions = {
  seed?: number;
  bars?: number;
  startPrice?: number;
  /** Per-bar log drift. */
  drift?: number;
  /** Per-bar baseline log volatility. */
  baseVol?: number;
  /** GARCH persistence — higher means shocks to volatility decay more slowly. */
  volPersistence?: number;
  /** Probability of a jump on any bar. */
  shockProbability?: number;
  /** Jump size, in units of current volatility. */
  shockScale?: number;
  /** Trend in volume: negative dries up over the series, positive expands. */
  volumeTrend?: number;
};

/**
 * A geometric random walk with volatility clustering, occasional jumps and intraday wicks.
 * Volatility follows a GARCH(1,1) recursion, so calm and turbulent stretches alternate the way real
 * price series do.
 */
export function realisticCandles(options: CandleOptions = {}): Candle[] {
  const seed = options.seed ?? 12_345;
  const bars = Math.max(2, Math.floor(options.bars ?? 300));
  const startPrice = options.startPrice ?? 100;
  const drift = options.drift ?? 0.0004;
  const baseVol = options.baseVol ?? 0.012;
  const persistence = Math.min(0.98, Math.max(0, options.volPersistence ?? 0.85));
  const alpha = Math.max(0.01, 1 - persistence - 0.05);
  const shockProbability = options.shockProbability ?? 0.015;
  const shockScale = options.shockScale ?? 4;
  const volumeTrend = options.volumeTrend ?? 0;

  const random = rng(seed);
  const gaussian = gaussianFrom(random);
  const longRunVariance = baseVol * baseVol;
  const omega = longRunVariance * (1 - alpha - persistence);

  const candles: Candle[] = [];
  let price = startPrice;
  let variance = longRunVariance;
  let previousShock = 0;
  const baseVolume = 1_000_000;

  for (let i = 0; i < bars; i += 1) {
    variance = omega + alpha * previousShock * previousShock + persistence * variance;
    const vol = Math.sqrt(Math.max(variance, 1e-12));
    const jump = random() < shockProbability ? gaussian() * shockScale * vol : 0;
    const shock = gaussian() * vol + jump;
    previousShock = shock;

    const open = price;
    const close = Math.max(0.01, open * Math.exp(drift + shock));
    // Wicks are asymmetric and scale with current volatility, so high/low are not mirror images.
    const upperWick = Math.abs(gaussian()) * vol * 0.9;
    const lowerWick = Math.abs(gaussian()) * vol * 0.7;
    const high = Math.max(open, close) * (1 + upperWick);
    const low = Math.min(open, close) * (1 - lowerWick);
    const volume = Math.max(1_000, Math.round(baseVolume * (1 + volumeTrend * (i / bars)) * Math.exp(gaussian() * 0.3)));

    candles.push({ time: i * 86_400_000, open, high, low, close, volume });
    price = close;
  }
  return candles;
}

/** Log returns of a candle series. */
export function returnsFrom(candles: Candle[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < candles.length; i += 1) out.push(Math.log(candles[i].close / candles[i - 1].close));
  return out;
}

/** A noisy return series with no trend — for correlation, covariance and portfolio tests. */
export function noisyReturns(seed: number, length = 250, vol = 0.02, drift = 0): number[] {
  const gaussian = gaussianFrom(rng(seed));
  return Array.from({ length }, () => drift + gaussian() * vol);
}

/** Two series sharing a noisy common factor, with the requested correlation. */
export function correlatedPair(seed: number, length = 250, correlation = 0.7): { first: number[]; second: number[] } {
  const gaussian = gaussianFrom(rng(seed));
  const orthogonal = Math.sqrt(Math.max(0, 1 - correlation * correlation));
  const first: number[] = [];
  const second: number[] = [];
  for (let i = 0; i < length; i += 1) {
    const common = gaussian();
    const idiosyncratic = gaussian();
    first.push(common * 0.02);
    second.push((correlation * common + orthogonal * idiosyncratic) * 0.02);
  }
  return { first, second };
}

export type FixtureAsset = {
  symbol: string;
  returns: number[];
  marketCap: number;
  bookToMarket: number;
  profitability: number;
  investment: number;
};

/**
 * A fundamentals universe whose characteristics are deliberately **not** aligned with one another and
 * **not** monotonic, so the four Fama-French sorts produce genuinely different portfolios. Returns
 * carry idiosyncratic noise.
 */
export function realisticUniverse(options: { seed?: number; size?: number; observations?: number; smallCapAdvantage?: number } = {}): FixtureAsset[] {
  const seed = options.seed ?? 999;
  // No minimum: callers must be able to request a deliberately undersized universe.
  const size = Math.max(1, Math.floor(options.size ?? 12));
  const observations = Math.max(4, Math.floor(options.observations ?? 120));
  const smallCapAdvantage = options.smallCapAdvantage ?? 0;
  const random = rng(seed);
  const gaussian = gaussianFrom(random);

  // Draw the characteristics first, so the size advantage can be tied to the *actual* size ranking
  // rather than to draw order — otherwise the small-cap leg would not be the small-cap leg.
  const raw = Array.from({ length: size }, (_, i) => ({
    symbol: `AST${String(i).padStart(2, "0")}`,
    marketCap: Math.round(200 * (1 + random() * 49)), // 200 – 10,000
    // Characteristics are independently drawn: no ordering relationship between them.
    bookToMarket: 0.1 + random() * 1.2,
    profitability: -0.1 + random() * 0.5,
    investment: -0.2 + random() * 0.6,
  }));
  const bySize = [...raw].sort((a, b) => a.marketCap - b.marketCap).map((asset) => asset.symbol);
  const sizeRank = new Map(bySize.map((symbol, index) => [symbol, index / Math.max(1, bySize.length - 1)])); // 0 = smallest

  return raw.map((asset) => {
    const rank = sizeRank.get(asset.symbol) ?? 0.5;
    const drift = smallCapAdvantage * (1 - rank) + (random() - 0.5) * 0.0004;
    const returns = Array.from({ length: observations }, () => drift + gaussian() * 0.018);
    return { ...asset, returns };
  });
}

/** A fundamentals record with plausible, non-round figures for the screening tests. */
export function realisticFundamentals(symbol: string, over: Partial<Record<string, number | string>> = {}): Record<string, unknown> {
  return {
    symbol,
    revenue: 4_820.5,
    costOfRevenue: 3_140.2,
    grossProfit: 1_680.3,
    netIncome: 412.7,
    operatingCashFlow: 508.1,
    totalAssets: 6_940.9,
    currentAssets: 2_310.4,
    currentLiabilities: 1_180.6,
    totalLiabilities: 3_050.2,
    totalDebt: 1_420.8,
    longTermDebt: 980.3,
    equity: 3_890.7,
    cash: 610.5,
    receivables: 742.9,
    inventory: 508.3,
    depreciation: 296.4,
    sellingGeneralAdmin: 610.7,
    propertyPlantEquipment: 2_880.6,
    retainedEarnings: 1_950.2,
    sharesOutstanding: 318.4,
    ebit: 690.1,
    ebitda: 986.5,
    price: 84.6,
    marketCap: 26_936.6,
    ...over,
  };
}
