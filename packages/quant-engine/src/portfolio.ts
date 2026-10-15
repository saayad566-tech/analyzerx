/**
 * Portfolio construction, factor models and cointegration.
 *
 * The solvers are written out rather than pulled from a library, so the mathematics is readable and
 * testable. Where a model has a restricted form, the restriction is stated: `johansenTrace` implements
 * the **bivariate** case (which is the pair-trading use), not the general n-variate VECM.
 */
import { solveLeastSquares } from "./risk";

// --- linear algebra ---------------------------------------------------------------------------

/** Invert a square matrix by Gauss-Jordan elimination. Returns null when singular. */
export function invertMatrix(matrix: number[][]): number[][] | null {
  const n = matrix.length;
  if (n === 0 || matrix.some((row) => row.length !== n)) return null;
  const augmented = matrix.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) if (Math.abs(augmented[r][col]) > Math.abs(augmented[pivot][col])) pivot = r;
    if (Math.abs(augmented[pivot][col]) < 1e-12) return null;
    [augmented[col], augmented[pivot]] = [augmented[pivot], augmented[col]];
    const divisor = augmented[col][col];
    for (let c = 0; c < 2 * n; c += 1) augmented[col][c] /= divisor;
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const factor = augmented[r][col];
      if (factor === 0) continue;
      for (let c = 0; c < 2 * n; c += 1) augmented[r][c] -= factor * augmented[col][c];
    }
  }
  return augmented.map((row) => row.slice(n));
}

export function multiplyMatrices(a: number[][], b: number[][]): number[][] | null {
  if (a.length === 0 || b.length === 0 || a[0].length !== b.length) return null;
  return a.map((row) => b[0].map((_, j) => row.reduce((sum, value, k) => sum + value * b[k][j], 0)));
}

/**
 * Eigenvalues of a real 2×2 matrix, in descending order.
 * Closed form: λ = (tr ± √(tr² − 4·det)) / 2. Complex eigenvalues are reported as null.
 */
export function eigen2x2(matrix: number[][]): [number, number] | null {
  const [[a, b], [c, d]] = matrix;
  const trace = a + d;
  const determinant = a * d - b * c;
  const discriminant = trace * trace - 4 * determinant;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const first = (trace + root) / 2;
  const second = (trace - root) / 2;
  return first >= second ? [first, second] : [second, first];
}

/** Sample covariance matrix of asset return series (series[i] = asset i's returns). */
export function covarianceMatrix(series: number[][]): number[][] | null {
  const n = series.length;
  if (n === 0) return null;
  const length = Math.min(...series.map((row) => row.length));
  if (length < 2) return null;
  const means = series.map((row) => row.slice(0, length).reduce((sum, value) => sum + value, 0) / length);
  const out: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i += 1) {
    for (let j = i; j < n; j += 1) {
      let covariance = 0;
      for (let t = 0; t < length; t += 1) covariance += (series[i][t] - means[i]) * (series[j][t] - means[j]);
      covariance /= length - 1;
      out[i][j] = covariance;
      out[j][i] = covariance;
    }
  }
  return out;
}

// --- Markowitz mean-variance ------------------------------------------------------------------

export type MeanVarianceResult = {
  weights: number[];
  expectedReturn: number;
  volatility: number;
  sharpe: number;
  /** True when any weight came out negative (a short position). */
  hasShortPositions: boolean;
};

/**
 * Unconstrained mean-variance (tangency) portfolio: w ∝ Σ⁻¹(μ − r_f·1), normalised to sum to 1.
 * No weight cap is applied, so short positions can appear; the caller is told when they do.
 */
export function markowitzWeights(series: number[][], riskFreeRate = 0): MeanVarianceResult | null {
  const n = series.length;
  if (n < 2) return null;
  const covariance = covarianceMatrix(series);
  if (!covariance) return null;
  const inverse = invertMatrix(covariance);
  if (!inverse) return null;

  const length = Math.min(...series.map((row) => row.length));
  const means = series.map((row) => row.slice(0, length).reduce((sum, value) => sum + value, 0) / length);
  const excess = means.map((mean) => mean - riskFreeRate);

  const raw = inverse.map((row) => row.reduce((sum, value, j) => sum + value * excess[j], 0));
  const total = raw.reduce((sum, value) => sum + value, 0);
  if (Math.abs(total) < 1e-12) return null;
  const weights = raw.map((value) => value / total);

  const expectedReturn = weights.reduce((sum, value, i) => sum + value * means[i], 0);
  let variance = 0;
  for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) variance += weights[i] * weights[j] * covariance[i][j];
  const volatility = Math.sqrt(Math.max(variance, 0));
  return {
    weights,
    expectedReturn,
    volatility,
    sharpe: volatility > 0 ? (expectedReturn - riskFreeRate) / volatility : 0,
    hasShortPositions: weights.some((weight) => weight < 0),
  };
}

// --- Fama-French five-factor construction -----------------------------------------------------

export type FamaFrenchFactor = "MKT" | "SMB" | "HML" | "RMW" | "CMA";

export type FactorAsset = {
  symbol: string;
  returns: number[];
  /** Size — market capitalisation. */
  marketCap: number;
  /** Value — book value of equity over market value. */
  bookToMarket: number;
  /** Profitability — operating profitability over book equity. */
  profitability: number;
  /** Investment — growth in total assets. */
  investment: number;
};

export type FamaFrenchResult = {
  factors: Record<FamaFrenchFactor, number[]>;
  observations: number;
  /** Sizes of the long and short legs used for each factor. */
  legSizes: Record<Exclude<FamaFrenchFactor, "MKT">, number>;
};

/**
 * Build the Fama-French five factors from a universe of asset returns.
 *
 * SMB, HML, RMW and CMA are long-minus-short spreads across the universe sorted on the relevant
 * characteristic; the market factor is the equal-weighted universe mean. This is the standard
 * 2×3-style construction simplified to a single break, which the `legSizes` field makes explicit.
 */
export function buildFamaFrenchFactors(assets: FactorAsset[]): FamaFrenchResult | null {
  if (assets.length < 4) return null;
  const observations = Math.min(...assets.map((asset) => asset.returns.length));
  if (observations < 2) return null;

  const meanReturns = assets.map((asset) => asset.returns.slice(0, observations).reduce((sum, value) => sum + value, 0) / observations);
  const market = Array.from({ length: observations }, () => meanReturns.reduce((sum, mean) => sum + mean, 0) / assets.length);

  const spread = (characteristic: (asset: FactorAsset) => number): { values: number[]; long: number; short: number } => {
    const sorted = [...assets].sort((a, b) => characteristic(b) - characteristic(a));
    const legSize = Math.max(1, Math.floor(sorted.length / 3));
    const long = sorted.slice(0, legSize);
    const short = sorted.slice(-legSize);
    const values = Array.from({ length: observations }, (_, t) => {
      const longMean = long.reduce((sum, asset) => sum + asset.returns[t], 0) / long.length;
      const shortMean = short.reduce((sum, asset) => sum + asset.returns[t], 0) / short.length;
      return longMean - shortMean;
    });
    return { values, long: long.length, short: short.length };
  };

  const smb = spread((asset) => -asset.marketCap); // small minus big
  const hml = spread((asset) => asset.bookToMarket); // high minus low
  const rmw = spread((asset) => asset.profitability); // robust minus weak
  const cma = spread((asset) => -asset.investment); // conservative minus aggressive

  return {
    factors: { MKT: market, SMB: smb.values, HML: hml.values, RMW: rmw.values, CMA: cma.values },
    observations,
    legSizes: { SMB: smb.long, HML: hml.long, RMW: rmw.long, CMA: cma.long },
  };
}

export type FactorRegression = {
  alpha: number;
  /** Factor loadings, in the order MKT, SMB, HML, RMW, CMA. */
  loadings: number[];
  observations: number;
};

/** Regress an asset's excess returns on the five factors. */
export function regressOnFactors(excessReturns: number[], factors: Record<FamaFrenchFactor, number[]>): FactorRegression | null {
  const names: FamaFrenchFactor[] = ["MKT", "SMB", "HML", "RMW", "CMA"];
  const observations = Math.min(excessReturns.length, ...names.map((name) => factors[name].length));
  if (observations < names.length + 2) return null;
  const design = Array.from({ length: observations }, (_, t) => [1, ...names.map((name) => factors[name][t])]);
  const coefficients = solveLeastSquares(design, excessReturns.slice(0, observations));
  if (!coefficients) return null;
  return { alpha: coefficients[0], loadings: coefficients.slice(1), observations };
}

// --- Johansen cointegration (bivariate) --------------------------------------------------------

export type JohansenResult = {
  /** Eigenvalues of the reduced-rank matrix, descending. */
  eigenvalues: number[];
  traceStatistic: number;
  /** 5% critical value for the trace test with two variables and r = 0. */
  criticalValue: number;
  cointegrated: boolean;
  observations: number;
};

/** Johansen 5% critical values for the trace test, r = 0, by number of variables. */
export const JOHANSEN_CRITICAL_5: Record<number, number> = { 1: 3.84, 2: 15.41, 3: 29.68 };

/**
 * Johansen trace test for cointegration between two series.
 *
 * Implemented for the **bivariate** case, which is what pair trading needs: the reduced-rank matrix is
 * 2×2 and its eigenvalues have a closed form. The general n-variate VECM is not implemented, and the
 * function says so rather than pretending.
 */
export function johansenTrace(y: number[], x: number[], lags = 1): JohansenResult | null {
  const usable = Math.min(y.length, x.length);
  const p = Math.max(1, Math.floor(lags));
  if (usable < p + 8) return null;

  const level = (t: number): [number, number] => [y[t], x[t]];
  const difference = (t: number): [number, number] => [y[t] - y[t - 1], x[t] - x[t - 1]];

  const delta: number[][] = [];
  const laggedLevel: number[][] = [];
  for (let t = p; t < usable; t += 1) {
    delta.push(difference(t));
    laggedLevel.push(level(t - 1));
  }
  const T = delta.length;
  if (T < 8) return null;

  // Concentrate out the constant by demeaning both residual sets.
  const demean = (rows: number[][]): number[][] => {
    const means = [0, 1].map((c) => rows.reduce((sum, row) => sum + row[c], 0) / rows.length);
    return rows.map((row) => [row[0] - means[0], row[1] - means[1]]);
  };
  const r0 = demean(delta);
  const r1 = demean(laggedLevel);

  const moment = (a: number[][], b: number[][]): number[][] => {
    const out = [[0, 0], [0, 0]];
    for (let i = 0; i < 2; i += 1) for (let j = 0; j < 2; j += 1) out[i][j] = a.reduce((sum, row, t) => sum + row[i] * b[t][j], 0) / T;
    return out;
  };
  const s00 = moment(r0, r0);
  const s01 = moment(r0, r1);
  const s10 = moment(r1, r0);
  const s11 = moment(r1, r1);

  const s11Inverse = invertMatrix(s11);
  const s00Inverse = invertMatrix(s00);
  if (!s11Inverse || !s00Inverse) return null;

  const left = multiplyMatrices(s11Inverse, s10);
  const right = multiplyMatrices(s00Inverse, s01);
  if (!left || !right) return null;
  const reducedRank = multiplyMatrices(left, right);
  if (!reducedRank) return null;

  const eigenvalues = eigen2x2(reducedRank);
  if (!eigenvalues) return null;
  // A canonical correlation must lie in [0, 1); clamp out numerical noise.
  const clamped = eigenvalues.map((value) => Math.max(0, Math.min(value, 1 - 1e-12)));

  const traceStatistic = -T * clamped.reduce((sum, value) => sum + Math.log(1 - value), 0);
  const criticalValue = JOHANSEN_CRITICAL_5[2];
  return { eigenvalues: clamped, traceStatistic, criticalValue, cointegrated: traceStatistic > criticalValue, observations: T };
}

// --- cross-validation for financial series -----------------------------------------------------

export type Fold = { train: number[]; test: number[] };

/**
 * Purged, embargoed k-fold cross-validation (Lopez de Prado).
 *
 * Standard k-fold leaks in a time series: observations adjacent to the test fold share information
 * with it. Purging removes training points that overlap the test label's horizon, and the embargo
 * additionally drops a span of training points immediately after each test fold.
 */
export function purgedKFold(observations: number, k: number, labelHorizon = 1, embargoPct = 0.01): Fold[] | null {
  if (!Number.isInteger(observations) || observations < 4) return null;
  if (!Number.isInteger(k) || k < 2 || k > observations) return null;
  const horizon = Math.max(1, Math.floor(labelHorizon));
  const embargo = Math.max(0, Math.floor(observations * Math.max(0, Math.min(0.5, embargoPct))));
  const foldSize = Math.floor(observations / k);
  const folds: Fold[] = [];

  for (let f = 0; f < k; f += 1) {
    const testStart = f * foldSize;
    const testEnd = f === k - 1 ? observations : testStart + foldSize;
    const test: number[] = [];
    for (let i = testStart; i < testEnd; i += 1) test.push(i);

    const train: number[] = [];
    for (let i = 0; i < observations; i += 1) {
      const inTest = i >= testStart && i < testEnd;
      if (inTest) continue;
      // Purge: drop training points whose label horizon overlaps the test window.
      const labelEnd = i + horizon;
      const overlaps = labelEnd >= testStart && i <= testEnd - 1;
      if (overlaps) continue;
      // Embargo: drop a span immediately after the test window.
      const inEmbargo = i >= testEnd && i < testEnd + embargo;
      if (inEmbargo) continue;
      train.push(i);
    }
    folds.push({ train, test });
  }
  return folds;
}
