/**
 * The quantitative model catalogue.
 *
 * The directive asks for a catalogue of frameworks across five categories. This is that catalogue —
 * and it is deliberately honest about status: a model is marked `implemented: true` only when real,
 * tested code exists in this package and the `source` field names where that code lives.
 *
 * The `formula` field carries the actual mathematics, not a description of it. A catalogue entry
 * whose maths is unavailable is marked `implemented: false` with the reason, rather than being given
 * a plausible-looking formula.
 */

export type ModelCategory = "I" | "II" | "III" | "IV" | "V";

export const MODEL_CATEGORIES: Record<ModelCategory, string> = {
  I: "Value, financial integrity & special situations",
  II: "Growth, momentum, breakouts & CANSLIM",
  III: "Sector, supply-chain & industrial logic",
  IV: "Quantitative, factor & algorithmic models",
  V: "Behavioural finance, macro & economic cycles",
};

export type ModelInput = "fundamentals" | "fundamentals-pair" | "ohlcv" | "returns" | "macro" | "price-pair" | "none";

export type QuantitativeModel = {
  id: string;
  name: string;
  /** Where the model comes from, and — when implemented — the module that implements it. */
  source: string;
  category: ModelCategory;
  /** The actual mathematics. */
  formula: string;
  implemented: boolean;
  input: ModelInput;
  /** Why it is not implemented, when it is not. */
  note?: string;
};

export const MODEL_CATALOGUE: QuantitativeModel[] = [
  // --- Category I ------------------------------------------------------------------------------
  { id: "graham-defensive", name: "Graham defensive-investor criteria", source: "The Intelligent Investor — src/fundamentals.ts", category: "I", formula: "P/E < 15 AND P/B < 1.5 AND current ratio > 2 AND D/E < 1 AND EBIT/EV > 6.7%", implemented: true, input: "fundamentals" },
  { id: "graham-ncav", name: "Net current asset value / net-net", source: "Security Analysis — src/fundamentals.ts", category: "I", formula: "NCAV = current assets − total liabilities; NCAV/share = NCAV / shares; buy when price ≤ (2/3)·NCAV/share", implemented: true, input: "fundamentals" },
  { id: "piotroski-f", name: "Piotroski F-Score", source: "Piotroski (2000) — src/scores.ts", category: "I", formula: "Nine binary signals: ROA>0; CFO>0; ΔROA>0; CFO>NI; ΔLTD/TA<0; Δcurrent ratio>0; no share issuance; Δgross margin>0; Δasset turnover>0. F ≥ 7 is strong.", implemented: true, input: "fundamentals-pair" },
  { id: "beneish-m", name: "Beneish M-Score", source: "Beneish (1999) — src/scores.ts", category: "I", formula: "M = −4.84 + 0.920·DSRI + 0.528·GMI + 0.404·AQI + 0.892·SGI + 0.115·DEPI − 0.172·SGAI + 4.679·TATA − 0.327·LVGI; M > −1.78 flags likely manipulation", implemented: true, input: "fundamentals-pair" },
  { id: "altman-z", name: "Altman Z-Score", source: "Altman (1968) — src/scores.ts", category: "I", formula: "Z = 1.2·(WC/TA) + 1.4·(RE/TA) + 3.3·(EBIT/TA) + 0.6·(MVE/TL) + 1.0·(Sales/TA); safe > 2.99, grey 1.81–2.99, distress < 1.81. Z″ = 6.56·X1 + 3.26·X2 + 6.72·X3 + 1.05·X4", implemented: true, input: "fundamentals" },
  { id: "magic-formula", name: "Greenblatt Magic Formula", source: "The Little Book That Still Beats the Market — src/fundamentals.ts", category: "I", formula: "Rank the universe by ROIC and by earnings yield (EBIT/EV); combined rank = ROIC rank + yield rank; buy the lowest combined ranks", implemented: true, input: "fundamentals" },
  { id: "ev-ebit", name: "Acquirer's multiple (EV/EBIT)", source: "The Acquirer's Multiple — src/fundamentals.ts", category: "I", formula: "EV = market cap + total debt − cash; EV/EBIT < 8 and EV/EBITDA < 6", implemented: true, input: "fundamentals" },
  { id: "accruals-sloan", name: "Accruals ratio (Sloan)", source: "Financial Shenanigans — src/fundamentals.ts", category: "I", formula: "accruals = (net income − operating cash flow) / total assets; a persistently high ratio is a red flag", implemented: true, input: "fundamentals" },
  { id: "dso", name: "Days sales outstanding", source: "Financial Shenanigans — src/fundamentals.ts", category: "I", formula: "DSO = (receivables / revenue) · 365; a rising DSO can indicate channel stuffing", implemented: true, input: "fundamentals" },
  { id: "buffett-quality", name: "Buffett quality compounder", source: "The Essays of Warren Buffett — src/fundamentals.ts", category: "I", formula: "ROE > 15% AND ROIC > 12% AND net margin > 10% AND D/E < 0.5 AND accruals < 0.05", implemented: true, input: "fundamentals" },
  { id: "peg-slater", name: "PEG below one", source: "Growth Stock Market Strategies — src/fundamentals.ts", category: "I", formula: "PEG = (P/E) / (EPS growth in percentage points) < 1.0", implemented: true, input: "fundamentals" },
  { id: "buffett-dcf", name: "Discounted cash flow / owner earnings", source: "Valuation (McKinsey); Damodaran — src/valuation.ts", category: "I", formula: "V = Σ FCF_t / (1+WACC)^t + Gordon terminal value; equity = EV − net debt; the result reports what share of value sits in the terminal value", implemented: true, input: "fundamentals" },

  // --- Category II -----------------------------------------------------------------------------
  { id: "canslim-breakout", name: "CANSLIM breakout", source: "How to Make Money in Stocks — src/strategy-library.ts", category: "II", formula: "Buy a close above the 50-bar high while price > EMA(50); exit below EMA(50); stop −7%; target +20%", implemented: true, input: "ohlcv" },
  { id: "minervini-trend-template", name: "Minervini trend template", source: "Trade Like a Stock Market Wizard — src/strategy-library.ts", category: "II", formula: "price > EMA(50) AND price > EMA(200); exit below EMA(50); stop −6%", implemented: true, input: "ohlcv" },
  { id: "vcp-pattern", name: "Volatility Contraction Pattern", source: "Minervini — src/patterns.ts", category: "II", formula: "Locate fractal swing highs and lows; require ≥2 successive contractions, each shallower than the last, a final contraction within 12%, volume drying up, inside an uptrend", implemented: true, input: "ohlcv" },
  { id: "weinstein-stage-two", name: "Weinstein stage-2 markup", source: "Secrets for Profiting in Bull and Bear Markets — src/strategy-library.ts", category: "II", formula: "Require relative strength > 0 and positive revenue growth; avoid stages 3 and 4", implemented: true, input: "fundamentals" },
  { id: "dual-momentum-12-1", name: "12-1 dual momentum", source: "Dual Momentum Investing; Momentum Investing — src/risk.ts", category: "II", formula: "momentum = close[t − skip] / close[t − lookback] − 1, with lookback 252 and skip 21; require positive absolute momentum before ranking", implemented: true, input: "ohlcv" },
  { id: "donchian-breakout", name: "Donchian channel breakout (Turtle)", source: "The Complete TurtleTrader — src/strategy-library.ts", category: "II", formula: "Enter on a close above the 55-bar high; exit on a close below the 20-bar low", implemented: true, input: "ohlcv" },
  { id: "darvas-box", name: "Darvas box breakout", source: "How I Made $2,000,000 in the Stock Market — src/strategy-library.ts", category: "II", formula: "Enter above the 20-bar high; exit below the 10-bar low; stop −8%", implemented: true, input: "ohlcv" },
  { id: "trend-following-ema", name: "Long-horizon trend following", source: "Trend Following — src/strategy-library.ts", category: "II", formula: "EMA(50) crossing above EMA(200) enters; crossing below exits; stop −15%", implemented: true, input: "ohlcv" },
  { id: "clenow-momentum", name: "Exponential-regression momentum", source: "Stocks on the Move", category: "II", formula: "Rank on the slope of an exponential regression of log price; size by ATR", implemented: false, input: "ohlcv", note: "EMA(50/100) crossover momentum is implemented; the exponential-regression slope ranking and ATR sizing are not." },
  { id: "high-tight-flag", name: "High tight flag", source: "O'Neil — src/patterns.ts", category: "II", formula: "Search every advance window of ≤40 bars for a ≥100% move, then require a retracement of ≤25% on falling volume", implemented: true, input: "ohlcv" },

  // --- Category III ----------------------------------------------------------------------------
  { id: "supply-chain-layered", name: "Layered picks-and-shovels screening", source: "The Supply Chain Revolution — src/supply-chain.ts", category: "III", formula: "Classify each candidate by keyword role into primary (front line), secondary (equipment choke-points) and tertiary (power, grid, raw materials); report unmatched rather than force-fitting", implemented: true, input: "none" },
  { id: "capital-cycle", name: "Capital-cycle underinvestment recovery", source: "Capital Returns — src/valuation.ts", category: "III", formula: "Compare capex growth against depreciation growth and demand growth; capital leaving the industry into rising demand is the favourable setup, heavy capex into weak demand the opposite", implemented: true, input: "fundamentals" },
  { id: "semi-chokepoint", name: "Semiconductor choke-point mapping", source: "Chip War — src/supply-chain.ts", category: "III", formula: "Map the chain: design → foundry → lithography/deposition/etch → wafers and chemicals; weight the layers that gate output", implemented: true, input: "none" },
  { id: "commodity-cost-curve", name: "Commodity cost-curve positioning", source: "Hot Commodities; Mining and Energy Valuation — src/valuation.ts", category: "III", formula: "Rank producers by all-in sustaining cost, accumulate production to the 90th percentile for the marginal cost, and flag producers at or below it", implemented: true, input: "fundamentals" },

  // --- Category IV -----------------------------------------------------------------------------
  { id: "kelly", name: "Kelly criterion", source: "Kelly (1956) — src/risk.ts", category: "IV", formula: "f* = W − (1 − W)/R, where W is the win rate and R the win/loss payoff ratio; floored at 0, capped at 1", implemented: true, input: "returns" },
  { id: "fractional-kelly", name: "Fractional Kelly sizing", source: "Systematic Trading — src/risk.ts", category: "IV", formula: "f = scale · f*, with scale typically 0.25–0.5", implemented: true, input: "returns" },
  { id: "garch11", name: "GARCH(1,1) volatility forecast", source: "Quantitative Risk Management — src/risk.ts", category: "IV", formula: "σ²_t = ω + α·ε²_{t−1} + β·σ²_{t−1}, fitted by Gaussian maximum likelihood with variance targeting ω = Var(ε)(1 − α − β)", implemented: true, input: "returns" },
  { id: "hrp", name: "Hierarchical Risk Parity", source: "Lopez de Prado — src/risk.ts", category: "IV", formula: "d = √(0.5(1 − ρ)) → single-linkage quasi-diagonalisation → recursive bisection with inverse-variance weights", implemented: true, input: "returns" },
  { id: "correlation-matrix", name: "Correlation matrix", source: "src/risk.ts", category: "IV", formula: "ρ_ij = cov(i,j) / (σ_i·σ_j)", implemented: true, input: "returns" },
  { id: "engle-granger", name: "Engle-Granger cointegration test", source: "Engle & Granger (1987) — src/risk.ts", category: "IV", formula: "Regress y on x by OLS; run an ADF test on the residuals: Δe_t = γ·e_{t−1} + Σφ_i·Δe_{t−i} + u_t; reject no-cointegration when the γ t-stat < −3.34 (two variables, 5%)", implemented: true, input: "price-pair" },
  { id: "adf", name: "Augmented Dickey-Fuller test", source: "src/risk.ts", category: "IV", formula: "t-ratio of γ in Δe_t = γ·e_{t−1} + Σφ_i·Δe_{t−i} + u_t", implemented: true, input: "returns" },
  { id: "ols", name: "Ordinary least squares", source: "src/risk.ts", category: "IV", formula: "β = (XᵀX)⁻¹Xᵀy, solved by Gaussian elimination on the normal equations", implemented: true, input: "returns" },
  { id: "johansen", name: "Johansen cointegration / VECM", source: "Johansen (1991) — src/portfolio.ts", category: "IV", formula: "Trace test on the reduced-rank matrix: eigenvalues of S11⁻¹·S10·S00⁻¹·S01, statistic −T·Σln(1−λ_i), against the 15.41 critical value for two variables at 5%", implemented: true, input: "price-pair", note: "Implemented for the bivariate case, which is the pair-trading use. The general n-variate VECM is not implemented." },
  { id: "fama-french-5", name: "Fama-French five-factor model", source: "Fama & French (2015) — src/portfolio.ts", category: "IV", formula: "R_i − R_f = α + β(R_m − R_f) + s·SMB + h·HML + r·RMW + c·CMA; the factors are long-minus-short spreads sorted on size, book-to-market, profitability and investment", implemented: true, input: "returns", note: "Uses a single break per characteristic rather than the 2×3 sorts; the leg sizes are reported so the simplification is visible." },
  { id: "markowitz-mvo", name: "Mean-variance optimisation", source: "Portfolio Selection — src/portfolio.ts", category: "IV", formula: "Unconstrained tangency portfolio: w ∝ Σ⁻¹(μ − r_f·1), normalised to sum to 1", implemented: true, input: "returns", note: "Unconstrained, so short positions can appear; the result reports when they do." },
  { id: "random-forest", name: "Random-forest feature importance", source: "Advances in Financial Machine Learning", category: "IV", formula: "Ensemble of decision trees; importance by mean decrease in impurity", implemented: false, input: "returns", note: "The prerequisite is now in place — purged and embargoed cross-validation is implemented (purged-cv) — but the forest itself is not." },
  { id: "sharpe", name: "Sharpe ratio", source: "src/metrics.ts", category: "IV", formula: "(annualised return − risk-free) / annualised volatility", implemented: true, input: "returns" },
  { id: "sortino", name: "Sortino ratio", source: "src/metrics.ts", category: "IV", formula: "(annualised return − target) / downside deviation", implemented: true, input: "returns" },
  { id: "profit-factor", name: "Profit factor", source: "src/metrics.ts", category: "IV", formula: "gross profit / gross loss", implemented: true, input: "returns" },
  { id: "expectancy", name: "Expectancy per trade", source: "src/metrics.ts", category: "IV", formula: "(win rate · average win) − (loss rate · average loss)", implemented: true, input: "returns" },
  { id: "max-drawdown", name: "Maximum drawdown", source: "src/metrics.ts", category: "IV", formula: "max over t of (peak equity − equity_t) / peak equity", implemented: true, input: "returns" },
  { id: "cagr", name: "Compound annual growth rate", source: "src/metrics.ts", category: "IV", formula: "(ending / starting)^(1/years) − 1", implemented: true, input: "returns" },

  // --- Category V ------------------------------------------------------------------------------
  { id: "shiller-cape", name: "Shiller CAPE", source: "Irrational Exuberance — src/risk.ts", category: "V", formula: "CAPE = real price / ten-year average of real earnings", implemented: true, input: "macro" },
  { id: "cape-percentile", name: "CAPE percentile", source: "Irrational Exuberance — src/risk.ts", category: "V", formula: "share of historical observations at or below the current CAPE", implemented: true, input: "macro" },
  { id: "yield-curve", name: "Yield-curve inversion regime", source: "Principles for Navigating Big Debt Crises — src/risk.ts", category: "V", formula: "spread = long yield − short yield; inverted < 0, flat 0–0.5, normal 0.5–1.5, steep > 1.5", implemented: true, input: "macro" },
  { id: "trailing-stop-ladder", name: "Dynamic trailing stop-loss ladder", source: "Master directive — src/tracker.ts", category: "V", formula: "−10% floor; at +10% move to break-even; +15% → +5%; +20% → +10%; trail 10% to +50%, then 5%; the stop ratchets upward only", implemented: true, input: "ohlcv" },
  { id: "reflexivity", name: "Reflexivity feedback loop", source: "The Alchemy of Finance", category: "V", formula: "Prices influence the fundamentals they are meant to reflect, producing boom–bust feedback", implemented: false, input: "none", note: "Not implemented. It is a qualitative framework; encoding it as a signal would be inventing a formula the book does not give." },
  { id: "deleveraging-regime", name: "Deleveraging regime classifier", source: "Principles for Navigating Big Debt Crises — src/valuation.ts", category: "V", formula: "Classify on the debt/GDP trajectory against whether nominal growth exceeds the interest rate: falling with growth above the rate is orderly, falling with growth below it is deflationary", implemented: true, input: "macro" },
  { id: "pre-mortem", name: "Pre-mortem bias checklist", source: "Thinking, Fast and Slow; Behavioural Investing", category: "V", formula: "Enumerate the ways the thesis fails before acting on it", implemented: false, input: "none", note: "A process discipline, not a computable signal." },
  { id: "purged-cv", name: "Purged and embargoed cross-validation", source: "Lopez de Prado — src/portfolio.ts", category: "IV", formula: "k-fold where any training point whose label horizon overlaps the test window is purged, plus an embargo span immediately after each test fold", implemented: true, input: "returns" },
  { id: "performance-ledger", name: "Cross-strategy performance ledger", source: "Master directive — src/ledger.ts", category: "V", formula: "Record each tracked position under strategy + market + symbol + entry time; aggregate win rate, average and median return, profit factor, MAE/MFE and exit mix per strategy and overall", implemented: true, input: "none" },
];

export function modelsByCategory(): { category: ModelCategory; label: string; models: QuantitativeModel[] }[] {
  const order: ModelCategory[] = ["I", "II", "III", "IV", "V"];
  return order.map((category) => ({ category, label: MODEL_CATEGORIES[category], models: MODEL_CATALOGUE.filter((model) => model.category === category) }));
}

export function findModel(id: string): QuantitativeModel | null {
  return MODEL_CATALOGUE.find((model) => model.id === id) ?? null;
}

export function implementedModels(): QuantitativeModel[] {
  return MODEL_CATALOGUE.filter((model) => model.implemented);
}

export function catalogueStats(): { total: number; implemented: number; notImplemented: number; byCategory: { category: ModelCategory; label: string; total: number; implemented: number }[] } {
  const byCategory = modelsByCategory().map((group) => ({
    category: group.category,
    label: group.label,
    total: group.models.length,
    implemented: group.models.filter((model) => model.implemented).length,
  }));
  const implemented = implementedModels().length;
  return { total: MODEL_CATALOGUE.length, implemented, notImplemented: MODEL_CATALOGUE.length - implemented, byCategory };
}
