/**
 * Risk, sizing and factor models (the directive's Category IV and V).
 *
 * Every routine here is self-contained: no linear-algebra dependency, no numerical library. The
 * solvers are small and explicit so the maths can be read and checked.
 */

// --- linear algebra ---------------------------------------------------------------------------

/**
 * Solve the normal equations for a least-squares fit.
 * Returns null when the system is singular, rather than returning a fabricated coefficient vector.
 */
export function solveLeastSquares(design: number[][], target: number[]): number[] | null {
  const rows = design.length;
  if (rows === 0 || target.length !== rows) return null;
  const cols = design[0].length;
  if (cols === 0) return null;

  const xtx: number[][] = Array.from({ length: cols }, () => new Array<number>(cols).fill(0));
  const xty: number[] = new Array<number>(cols).fill(0);
  for (let r = 0; r < rows; r += 1) {
    for (let i = 0; i < cols; i += 1) {
      xty[i] += design[r][i] * target[r];
      for (let j = 0; j < cols; j += 1) xtx[i][j] += design[r][i] * design[r][j];
    }
  }

  // Gaussian elimination with partial pivoting.
  const augmented = xtx.map((row, i) => [...row, xty[i]]);
  for (let col = 0; col < cols; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < cols; r += 1) if (Math.abs(augmented[r][col]) > Math.abs(augmented[pivot][col])) pivot = r;
    if (Math.abs(augmented[pivot][col]) < 1e-12) return null;
    [augmented[col], augmented[pivot]] = [augmented[pivot], augmented[col]];
    const divisor = augmented[col][col];
    for (let c = col; c <= cols; c += 1) augmented[col][c] /= divisor;
    for (let r = 0; r < cols; r += 1) {
      if (r === col) continue;
      const factor = augmented[r][col];
      if (factor === 0) continue;
      for (let c = col; c <= cols; c += 1) augmented[r][c] -= factor * augmented[col][c];
    }
  }
  return augmented.map((row) => row[cols]);
}

export type OlsFit = { intercept: number; slope: number; residuals: number[]; fitted: number[] };

/** Ordinary least squares of `y` on `x`, with an intercept. */
export function ols(y: number[], x: number[]): OlsFit | null {
  const n = Math.min(y.length, x.length);
  if (n < 3) return null;
  const design = Array.from({ length: n }, (_, i) => [1, x[i]]);
  const coefficients = solveLeastSquares(design, y.slice(0, n));
  if (!coefficients) return null;
  const [intercept, slope] = coefficients;
  const fitted = x.slice(0, n).map((value) => intercept + slope * value);
  const residuals = y.slice(0, n).map((value, i) => value - fitted[i]);
  return { intercept, slope, residuals, fitted };
}

export type AdfResult = { statistic: number; lags: number; observations: number };

/**
 * Augmented Dickey-Fuller t-statistic on a series.
 * Δe_t = γ·e_{t−1} + Σ φ_i Δe_{t−i} + u_t, and the statistic is the t-ratio of γ.
 * A strongly negative statistic is evidence against a unit root (i.e. for stationarity).
 */
export function adfStatistic(series: number[], lags = 0): AdfResult | null {
  const n = series.length;
  const usedLag = Math.max(0, Math.floor(lags));
  const start = usedLag + 1;
  if (n - start < 5) return null;

  const differences = series.slice(1).map((value, i) => value - series[i]);
  const rows: number[][] = [];
  const target: number[] = [];
  for (let t = start; t < n; t += 1) {
    const row = [series[t - 1]];
    for (let l = 1; l <= usedLag; l += 1) row.push(differences[t - 1 - l]);
    rows.push(row);
    target.push(differences[t - 1]);
  }
  const coefficients = solveLeastSquares(rows, target);
  if (!coefficients) return null;

  // Standard error of γ from the residual variance and the inverse of X'X.
  const fitted = rows.map((row) => row.reduce((sum, value, i) => sum + value * coefficients[i], 0));
  const residuals = target.map((value, i) => value - fitted[i]);
  const dof = rows.length - coefficients.length;
  if (dof <= 0) return null;
  const sigmaSquared = residuals.reduce((sum, value) => sum + value * value, 0) / dof;

  const cols = rows[0].length;
  const xtx: number[][] = Array.from({ length: cols }, () => new Array<number>(cols).fill(0));
  for (const row of rows) for (let i = 0; i < cols; i += 1) for (let j = 0; j < cols; j += 1) xtx[i][j] += row[i] * row[j];
  // Invert the 1x1 case directly; for larger systems use the identity trick via least squares.
  let varianceOfGamma: number;
  if (cols === 1) {
    varianceOfGamma = xtx[0][0] === 0 ? Number.POSITIVE_INFINITY : sigmaSquared / xtx[0][0];
  } else {
    const inverseColumn = solveLeastSquares(xtx, [1, ...new Array<number>(cols - 1).fill(0)]);
    if (!inverseColumn) return null;
    varianceOfGamma = sigmaSquared * inverseColumn[0];
  }
  if (!Number.isFinite(varianceOfGamma) || varianceOfGamma <= 0) return null;
  return { statistic: coefficients[0] / Math.sqrt(varianceOfGamma), lags: usedLag, observations: rows.length };
}

export type CointegrationResult = {
  slope: number;
  intercept: number;
  adf: AdfResult;
  /** Engle-Granger 5% critical value for a two-variable system. */
  criticalValue: number;
  cointegrated: boolean;
};

/**
 * Engle-Granger two-step cointegration test between two price series.
 *
 * This is the Engle-Granger test, not Johansen's VECM. Johansen's full maximum-likelihood procedure
 * is not implemented, and saying otherwise would be a claim I cannot support.
 */
export function engleGranger(y: number[], x: number[], lags = 0, criticalValue = -3.34): CointegrationResult | null {
  const fit = ols(y, x);
  if (!fit) return null;
  const adf = adfStatistic(fit.residuals, lags);
  if (!adf) return null;
  return { slope: fit.slope, intercept: fit.intercept, adf, criticalValue, cointegrated: adf.statistic < criticalValue };
}

// --- position sizing --------------------------------------------------------------------------

/** Kelly fraction for a binary bet: f* = W − (1−W)/R, floored at 0 and capped at 1. */
export function kellyFraction(winRate: number, payoffRatio: number): number {
  if (!Number.isFinite(winRate) || !Number.isFinite(payoffRatio) || payoffRatio <= 0) return 0;
  const raw = winRate - (1 - winRate) / payoffRatio;
  return Math.max(0, Math.min(1, raw));
}

export type KellyEstimate = { fraction: number; winRate: number; payoffRatio: number; samples: number };

/** Estimate the Kelly fraction from a realised return series. */
export function kellyFromReturns(returns: number[]): KellyEstimate | null {
  const usable = returns.filter((value) => Number.isFinite(value));
  if (usable.length < 4) return null;
  const wins = usable.filter((value) => value > 0);
  const losses = usable.filter((value) => value < 0);
  if (wins.length === 0 || losses.length === 0) return null;
  const winRate = wins.length / usable.length;
  const averageWin = wins.reduce((sum, value) => sum + value, 0) / wins.length;
  const averageLoss = Math.abs(losses.reduce((sum, value) => sum + value, 0) / losses.length);
  const payoffRatio = averageLoss === 0 ? Number.POSITIVE_INFINITY : averageWin / averageLoss;
  return { fraction: kellyFraction(winRate, payoffRatio), winRate, payoffRatio, samples: usable.length };
}

/** Fractional Kelly — the practitioner's discount on the full-Kelly bet. */
export function fractionalKelly(fraction: number, scale = 0.5): number {
  if (!Number.isFinite(fraction) || !Number.isFinite(scale)) return 0;
  return Math.max(0, Math.min(1, fraction * Math.max(0, Math.min(1, scale))));
}

// --- volatility -------------------------------------------------------------------------------

export type GarchFit = {
  omega: number;
  alpha: number;
  beta: number;
  logLikelihood: number;
  /** alpha + beta; close to 1 means shocks persist. */
  persistence: number;
  unconditionalVariance: number;
  conditionalVolatility: number[];
  nextVariance: number;
  nextVolatility: number;
  observations: number;
};

/**
 * GARCH(1,1) by Gaussian maximum likelihood: σ²_t = ω + α·ε²_{t−1} + β·σ²_{t−1}.
 * Variance targeting fixes ω = Var(ε)·(1 − α − β); α and β are found by a coarse-to-fine grid search,
 * which is deterministic and needs no optimiser dependency.
 */
export function fitGarch11(returns: number[], options: { refineSteps?: number } = {}): GarchFit | null {
  const eps = returns.filter((value) => Number.isFinite(value));
  const n = eps.length;
  if (n < 20) return null;
  const mean = eps.reduce((sum, value) => sum + value, 0) / n;
  const centred = eps.map((value) => value - mean);
  const variance = centred.reduce((sum, value) => sum + value * value, 0) / n;
  if (!(variance > 0)) return null;

  const logLikelihood = (alpha: number, beta: number): number => {
    if (alpha < 0 || beta < 0 || alpha + beta >= 1) return Number.NEGATIVE_INFINITY;
    const omega = variance * (1 - alpha - beta);
    let sigmaSquared = variance;
    let total = 0;
    for (let t = 1; t < n; t += 1) {
      sigmaSquared = omega + alpha * centred[t - 1] * centred[t - 1] + beta * sigmaSquared;
      if (!(sigmaSquared > 0)) return Number.NEGATIVE_INFINITY;
      total += Math.log(2 * Math.PI) + Math.log(sigmaSquared) + (centred[t] * centred[t]) / sigmaSquared;
    }
    return -0.5 * total;
  };

  const refineSteps = Math.max(1, Math.floor(options.refineSteps ?? 3));
  let best = { alpha: 0.05, beta: 0.9, ll: Number.NEGATIVE_INFINITY };
  let lowerAlpha = 0.0;
  let upperAlpha = 0.5;
  let lowerBeta = 0.3;
  let upperBeta = 0.99;
  for (let pass = 0; pass < refineSteps; pass += 1) {
    const stepA = (upperAlpha - lowerAlpha) / 12;
    const stepB = (upperBeta - lowerBeta) / 12;
    for (let i = 0; i <= 12; i += 1) {
      for (let j = 0; j <= 12; j += 1) {
        const alpha = lowerAlpha + i * stepA;
        const beta = lowerBeta + j * stepB;
        const ll = logLikelihood(alpha, beta);
        if (ll > best.ll) best = { alpha, beta, ll };
      }
    }
    const padA = Math.max(stepA, 0.005);
    const padB = Math.max(stepB, 0.005);
    lowerAlpha = Math.max(0, best.alpha - padA);
    upperAlpha = Math.min(0.98, best.alpha + padA);
    lowerBeta = Math.max(0, best.beta - padB);
    upperBeta = Math.min(0.999, best.beta + padB);
  }

  const { alpha, beta } = best;
  const omega = variance * (1 - alpha - beta);
  const conditionalVolatility: number[] = [];
  let sigmaSquared = variance;
  conditionalVolatility.push(Math.sqrt(sigmaSquared));
  for (let t = 1; t < n; t += 1) {
    sigmaSquared = omega + alpha * centred[t - 1] * centred[t - 1] + beta * sigmaSquared;
    conditionalVolatility.push(Math.sqrt(Math.max(sigmaSquared, 0)));
  }
  const nextVariance = omega + alpha * centred[n - 1] * centred[n - 1] + beta * sigmaSquared;
  return {
    omega, alpha, beta, logLikelihood: best.ll, persistence: alpha + beta,
    unconditionalVariance: variance, conditionalVolatility,
    nextVariance, nextVolatility: Math.sqrt(Math.max(nextVariance, 0)), observations: n,
  };
}

// --- portfolio construction -------------------------------------------------------------------

/** Pearson correlation matrix of asset return series (series[i] = asset i's returns). */
export function correlationMatrix(series: number[][]): number[][] | null {
  const n = series.length;
  if (n < 2) return null;
  const length = Math.min(...series.map((row) => row.length));
  if (length < 3) return null;
  const means = series.map((row) => row.slice(0, length).reduce((sum, value) => sum + value, 0) / length);
  const sd = series.map((row, i) => Math.sqrt(row.slice(0, length).reduce((sum, value) => sum + (value - means[i]) ** 2, 0) / length));
  const out: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i += 1) {
    out[i][i] = 1;
    for (let j = i + 1; j < n; j += 1) {
      if (sd[i] === 0 || sd[j] === 0) {
        out[i][j] = 0;
        out[j][i] = 0;
        continue;
      }
      let covariance = 0;
      for (let t = 0; t < length; t += 1) covariance += (series[i][t] - means[i]) * (series[j][t] - means[j]);
      covariance /= length;
      const correlation = covariance / (sd[i] * sd[j]);
      const bounded = Math.max(-1, Math.min(1, correlation));
      out[i][j] = bounded;
      out[j][i] = bounded;
    }
  }
  return out;
}

/** Single-linkage leaf ordering of a distance matrix — the quasi-diagonalisation HRP needs. */
function singleLinkageOrder(distance: number[][]): number[] {
  const n = distance.length;
  type Node = { left: Node | null; right: Node | null; leaf: number | null; members: number[] };
  let nodes: Node[] = Array.from({ length: n }, (_, i) => ({ left: null, right: null, leaf: i, members: [i] }));

  const clusterDistance = (a: Node, b: Node): number => {
    let min = Number.POSITIVE_INFINITY;
    for (const i of a.members) for (const j of b.members) min = Math.min(min, distance[i][j]);
    return min;
  };

  while (nodes.length > 1) {
    let bestI = 0;
    let bestJ = 1;
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const d = clusterDistance(nodes[i], nodes[j]);
        if (d < best) {
          best = d;
          bestI = i;
          bestJ = j;
        }
      }
    }
    const merged: Node = { left: nodes[bestI], right: nodes[bestJ], leaf: null, members: [...nodes[bestI].members, ...nodes[bestJ].members] };
    nodes = nodes.filter((_, index) => index !== bestI && index !== bestJ);
    nodes.push(merged);
  }

  const order: number[] = [];
  const walk = (node: Node) => {
    if (node.leaf !== null) {
      order.push(node.leaf);
      return;
    }
    if (node.left) walk(node.left);
    if (node.right) walk(node.right);
  };
  walk(nodes[0]);
  return order;
}

/**
 * Hierarchical Risk Parity weights (Lopez de Prado).
 * Correlation → distance → single-linkage quasi-diagonalisation → recursive bisection with
 * inverse-variance weights inside each cluster.
 */
export function hrpWeights(returns: number[][]): number[] | null {
  const correlation = correlationMatrix(returns);
  if (!correlation) return null;
  const n = correlation.length;
  const distance = correlation.map((row, i) => row.map((value, j) => (i === j ? 0 : Math.sqrt(Math.max(0, 0.5 * (1 - value))))));
  const order = singleLinkageOrder(distance);

  const variances = returns.map((row) => {
    const mean = row.reduce((sum, value) => sum + value, 0) / row.length;
    return row.reduce((sum, value) => sum + (value - mean) ** 2, 0) / row.length;
  });

  const weights = new Array<number>(n).fill(0);
  const clusterVariance = (members: number[]): number => {
    const inverse = members.map((index) => (variances[index] > 0 ? 1 / variances[index] : 0));
    const total = inverse.reduce((sum, value) => sum + value, 0);
    if (total === 0) return 0;
    const local = inverse.map((value) => value / total);
    let variance = 0;
    for (let a = 0; a < members.length; a += 1) {
      for (let b = 0; b < members.length; b += 1) {
        variance += local[a] * local[b] * correlation[members[a]][members[b]] * Math.sqrt(variances[members[a]]) * Math.sqrt(variances[members[b]]);
      }
    }
    return variance;
  };

  const bisect = (members: number[], allocation: number) => {
    if (members.length === 1) {
      weights[members[0]] = allocation;
      return;
    }
    const half = Math.floor(members.length / 2);
    const left = members.slice(0, half);
    const right = members.slice(half);
    const leftVariance = clusterVariance(left);
    const rightVariance = clusterVariance(right);
    const denominator = leftVariance + rightVariance;
    const leftWeight = denominator > 0 ? 1 - leftVariance / denominator : 0.5;
    bisect(left, allocation * leftWeight);
    bisect(right, allocation * (1 - leftWeight));
  };
  bisect(order, 1);

  const total = weights.reduce((sum, value) => sum + value, 0);
  return total > 0 ? weights.map((value) => value / total) : null;
}

// --- momentum, valuation and macro ------------------------------------------------------------

/**
 * 12-1 month momentum: the return from twelve months ago to one month ago, deliberately skipping the
 * most recent month so short-term reversal does not contaminate the signal.
 */
export function momentum12_1(closes: number[], periodsPerYear = 252, skipPeriods = 21): number | null {
  const n = closes.length;
  if (n < periodsPerYear + 1) return null;
  const endIndex = n - 1 - skipPeriods;
  const startIndex = n - 1 - periodsPerYear;
  if (startIndex < 0 || endIndex <= startIndex) return null;
  const start = closes[startIndex];
  const end = closes[endIndex];
  if (!(start > 0)) return null;
  return end / start - 1;
}

/** Shiller CAPE: real price divided by the ten-year average of real earnings. */
export function shillerCape(realPrice: number, realEarnings: number[]): number | null {
  if (!(realPrice > 0) || realEarnings.length === 0) return null;
  const usable = realEarnings.filter((value) => Number.isFinite(value));
  if (usable.length === 0) return null;
  const average = usable.reduce((sum, value) => sum + value, 0) / usable.length;
  if (!(average > 0)) return null;
  return realPrice / average;
}

/** Percentile of the current CAPE within its own history, 0–100. */
export function capePercentile(history: number[], current: number): number | null {
  const usable = history.filter((value) => Number.isFinite(value));
  if (usable.length === 0 || !Number.isFinite(current)) return null;
  const below = usable.filter((value) => value <= current).length;
  return (below / usable.length) * 100;
}

export type YieldCurveRegime = "inverted" | "flat" | "normal" | "steep";

export type YieldCurveReading = { spread: number; spreadBps: number; regime: YieldCurveRegime; inverted: boolean };

/**
 * Yield-curve reading from a short and a long rate (both in percent).
 * A negative spread is the classic inversion signal.
 */
export function yieldCurve(shortYield: number, longYield: number): YieldCurveReading | null {
  if (!Number.isFinite(shortYield) || !Number.isFinite(longYield)) return null;
  const spread = longYield - shortYield;
  const regime: YieldCurveRegime = spread < 0 ? "inverted" : spread < 0.5 ? "flat" : spread <= 1.5 ? "normal" : "steep";
  return { spread, spreadBps: spread * 100, regime, inverted: spread < 0 };
}

/** Fama-French style factor spread: the return of a long leg minus a short leg, period by period. */
export function factorSpread(longLeg: number[], shortLeg: number[]): number[] | null {
  const n = Math.min(longLeg.length, shortLeg.length);
  if (n === 0) return null;
  return Array.from({ length: n }, (_, i) => longLeg[i] - shortLeg[i]);
}

/** Cumulative return of a series of periodic returns. */
export function cumulativeReturn(returns: number[]): number {
  return returns.reduce((growth, value) => growth * (1 + value), 1) - 1;
}
