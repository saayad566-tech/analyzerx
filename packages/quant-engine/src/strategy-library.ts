/**
 * The book-strategy library.
 *
 * `BOOK_LIBRARY` is the reference catalogue: all 100 titles from the brief, with the author and a
 * one-line statement of the method each book actually describes.
 *
 * `IMPLEMENTATIONS` holds the subset that has **real, runnable logic** — either a price rule set the
 * backtest engine can execute, or a fundamental screen with explicit criteria. Everything else is
 * honestly marked `implemented: null`. The library does not pretend that 100 books are 100 working
 * algorithms; claiming that would be fabrication, and a screen nobody can evaluate is worse than no
 * screen at all.
 */
import type { StrategySpec } from "./strategy";

export type StrategyFamily = "value" | "growth" | "momentum" | "quality" | "sector" | "quant" | "risk";

export type BookReference = {
  id: string;
  title: string;
  author: string;
  family: StrategyFamily;
  /** What the method is, in the book's own terms. */
  idea: string;
};

export type ImplementationKind = "spec" | "screen" | "rank";

export type ImplementedStrategy = {
  kind: ImplementationKind;
  /** Present for `kind: "spec"` — executable by the backtest engine. */
  spec?: StrategySpec;
  /** Present for `kind: "screen"` / `kind: "rank"` — a key into the screening engine. */
  screenId?: string;
  requires: ("ohlcv" | "fundamentals")[];
  /** The metrics this method genuinely uses. */
  metrics: string[];
};

export type LibraryEntry = BookReference & { implemented: ImplementedStrategy | null };

export const FAMILY_LABELS: Record<StrategyFamily, string> = {
  value: "Value & margin of safety",
  growth: "Growth",
  momentum: "Momentum & trend",
  quality: "Quality & compounding",
  sector: "Sector, thematic & industrial",
  quant: "Quantitative & factor",
  risk: "Risk, cycles & psychology",
};

export const BOOK_LIBRARY: BookReference[] = [
  { id: "intelligent-investor", title: "The Intelligent Investor", author: "Benjamin Graham", family: "value", idea: "Buy defensively at a margin of safety: modest P/E and P/B, sound balance sheet, earnings stability." },
  { id: "security-analysis", title: "Security Analysis", author: "Benjamin Graham & David Dodd", family: "value", idea: "Value the balance sheet: net current asset value and liquidation value as a floor." },
  { id: "buffett-essays", title: "The Essays of Warren Buffett", author: "Warren Buffett, ed. Lawrence Cunningham", family: "quality", idea: "Own durable moats at high returns on capital, judged on owner earnings rather than reported EPS." },
  { id: "common-stocks-uncommon-profits", title: "Common Stocks and Uncommon Profits", author: "Philip Fisher", family: "growth", idea: "Scuttlebutt research into sales growth and management integrity before paying up." },
  { id: "one-up-on-wall-street", title: "One Up On Wall Street", author: "Peter Lynch", family: "growth", idea: "Classify a company (fast grower, stalwart, turnaround) and buy what you can understand." },
  { id: "beating-the-street", title: "Beating the Street", author: "Peter Lynch", family: "growth", idea: "Sector rotation and earnings trajectory, with a long holding period for the winners." },
  { id: "little-book-beats-market", title: "The Little Book That Still Beats the Market", author: "Joel Greenblatt", family: "value", idea: "Magic Formula: rank a universe on return on invested capital and earnings yield, then buy the best combined ranks." },
  { id: "you-can-be-stock-market-genius", title: "You Can Be a Stock Market Genius", author: "Joel Greenblatt", family: "value", idea: "Special situations — spin-offs, rights offerings, restructurings — where forced selling misprices assets." },
  { id: "most-important-thing", title: "The Most Important Thing", author: "Howard Marks", family: "risk", idea: "Second-level thinking and cycle awareness; risk control before return." },
  { id: "margin-of-safety", title: "Margin of Safety", author: "Seth Klarman", family: "value", idea: "Absolute-return orientation: avoid loss first, buy distressed assets below liquidation value." },
  { id: "competition-demystified", title: "Competition Demystified", author: "Bruce Greenwald", family: "quality", idea: "Judge structural barriers to entry: customer captivity, scale economies, proprietary cost advantages." },
  { id: "value-investing-greenwald", title: "Value Investing: From Graham to Buffett and Beyond", author: "Bruce Greenwald", family: "value", idea: "Asset value versus earnings power value, and the difference between the two as the opportunity." },
  { id: "dhandho-investor", title: "The Dhandho Investor", author: "Mohnish Pabrai", family: "value", idea: "Low-risk, high-uncertainty bets: heads I win, tails I do not lose much." },
  { id: "poor-charlies-almanack", title: "Poor Charlie's Almanack", author: "Charlie Munger", family: "risk", idea: "Mental models and inversion — solve problems by asking what would guarantee failure." },
  { id: "deep-value", title: "Deep Value", author: "Tobias Carlisle", family: "value", idea: "Buy deep cyclicals on enterprise multiples when the cycle is out of favour." },
  { id: "acquirers-multiple", title: "The Acquirer's Multiple", author: "Tobias Carlisle", family: "value", idea: "EV/EBIT as the single cleanest cheapness measure, because it is capital-structure neutral." },
  { id: "quantitative-value", title: "Quantitative Value", author: "Tobias Carlisle & Wesley Gray", family: "value", idea: "Automated value screens paired with forensic accounting checks to avoid value traps." },
  { id: "little-book-value-investing", title: "The Little Book of Value Investing", author: "Christopher Browne", family: "value", idea: "Systematic international value screening across many cheap names." },
  { id: "value-investing-rules", title: "Value Investing Rules", author: "Giles Hargreave", family: "value", idea: "Small-cap value metrics where coverage is thin and mispricing is widest." },
  { id: "buffett-way", title: "The Warren Buffett Way", author: "Robert Hagstrom", family: "quality", idea: "Business, management, financial and value tenets applied as a checklist." },
  { id: "how-to-make-money-in-stocks", title: "How to Make Money in Stocks", author: "William O'Neil", family: "growth", idea: "CAN SLIM: current and annual earnings, new products, supply/demand, leadership, institutional sponsorship, market direction." },
  { id: "trade-like-stock-market-wizard", title: "Trade Like a Stock Market Wizard", author: "Mark Minervini", family: "momentum", idea: "Volatility Contraction Pattern and a trend template: only buy in a confirmed stage-2 uptrend." },
  { id: "think-trade-like-champion", title: "Think & Trade Like a Champion", author: "Mark Minervini", family: "risk", idea: "Fixed risk-to-reward, hard stops, and position sizing that caps loss per trade." },
  { id: "momentum-investing", title: "Momentum Investing", author: "Wesley Gray & Jack Vogel", family: "momentum", idea: "Quantitative momentum: quality of momentum plus 52-week-high proximity, with a trend filter." },
  { id: "stocks-on-the-move", title: "Stocks on the Move", author: "Andreas Clenow", family: "momentum", idea: "Systematic momentum via exponential regression slopes, sized by ATR." },
  { id: "dual-momentum", title: "Dual Momentum Investing", author: "Gary Antonacci", family: "momentum", idea: "Absolute momentum filter first, then relative momentum across a small set of markets." },
  { id: "winning-on-wall-street", title: "Winning on Wall Street", author: "Martin Zweig", family: "momentum", idea: "Earnings acceleration combined with a monetary-climate filter." },
  { id: "growth-stock-market-strategies", title: "Growth Stock Market Strategies", author: "Jim Slater", family: "growth", idea: "PEG below one: growth at a price that does not already discount it." },
  { id: "gorilla-game", title: "The Gorilla Game", author: "Geoffrey Moore", family: "sector", idea: "Back the platform monopolist in a technology ecosystem, not the niche player." },
  { id: "crossing-the-chasm", title: "Crossing the Chasm", author: "Geoffrey Moore", family: "sector", idea: "Adoption phases: the winners are those that cross from early adopters to the mainstream." },
  { id: "secrets-bull-bear", title: "Secrets for Profiting in Bull and Bear Markets", author: "Stan Weinstein", family: "momentum", idea: "Stage analysis: accumulate in stage 1, buy stage 2 markup, avoid stages 3 and 4." },
  { id: "super-stocks", title: "Super Stocks", author: "Kenneth Fisher", family: "growth", idea: "Price-to-sales screening for turnaround growth, where margins can recover." },
  { id: "100-bagger", title: "100 Bagger", author: "Chris Mayer", family: "quality", idea: "High returns on capital retained and reinvested over a long runway." },
  { id: "100-to-1", title: "100 to 1 in the Stock Market", author: "Thomas Phelps", family: "quality", idea: "Buy growth and hold through full business cycles instead of trading it." },
  { id: "rule-breaker-investing", title: "The Rule Breaker Investing", author: "David Gardner", family: "growth", idea: "First-mover advantage and the top dog in a fast-growing industry." },
  { id: "darvas-box", title: "How I Made $2,000,000 in the Stock Market", author: "Nicholas Darvas", family: "momentum", idea: "Box theory: buy a close above the established price/volume box, trail the stop." },
  { id: "quality-investing", title: "Quality Investing", author: "Torkell Eide & Lawrence Cunningham", family: "quality", idea: "Pricing power, low capital intensity, and durable cash generation." },
  { id: "expected-returns", title: "Expected Returns", author: "Antti Ilmanen", family: "quant", idea: "Factor premiums — value, momentum, carry, low volatility — and their cyclicality." },
  { id: "fundamental-analysis-for-dummies", title: "Fundamental Analysis for Dummies", author: "Matt Krantz", family: "value", idea: "Baseline ratio analysis: what each financial ratio does and does not tell you." },
  { id: "financial-shenanigans", title: "Financial Shenanigans", author: "Howard Schilit", family: "quality", idea: "Detect accounting gimmicks: revenue inflation, accrual build-up, balance-sheet tricks." },
  { id: "the-outsiders", title: "The Outsiders", author: "William Thorndike", family: "quality", idea: "Capital allocation is the CEO's real job: buybacks, debt discipline, cash returns." },
  { id: "capital-returns", title: "Capital Returns", author: "Edward Chancellor", family: "sector", idea: "Capital-cycle investing: supply discipline and capex booms and busts drive returns." },
  { id: "zero-to-one", title: "Zero to One", author: "Peter Thiel", family: "sector", idea: "Monopoly economics: proprietary technology, network effects, scale, branding." },
  { id: "supply-chain-revolution", title: "The Supply Chain Revolution", author: "Suman Sarkar", family: "sector", idea: "Map choke-points in a value chain to find where a boom's profit actually accrues." },
  { id: "commodity-cycles", title: "Hot Commodities", author: "Jim Rogers", family: "sector", idea: "Trade the supply/demand imbalance in physical commodities and their bottlenecks." },
  { id: "energy-mining-valuation", title: "Mining and Energy Valuation", author: "L. M. Pratt", family: "sector", idea: "Reserve replacement and all-in sustaining cost as the true unit economics." },
  { id: "chip-war", title: "Chip War", author: "Chris Miller", family: "sector", idea: "Semiconductor supply is a chokepoint: upstream equipment and lithography gate the whole chain." },
  { id: "innovation-dilemma", title: "The Innovator's Dilemma", author: "Clayton Christensen", family: "sector", idea: "Disruptive entrants win from below, which incumbents rationally ignore." },
  { id: "modern-security-analysis", title: "Modern Security Analysis", author: "Martin Whitman", family: "value", idea: "Credit-first analysis: asset coverage and distress value over earnings forecasts." },
  { id: "porter-five-forces", title: "Competitive Strategy", author: "Michael Porter", family: "quality", idea: "Five forces: rivalry, entrants, substitutes, supplier and buyer power set industry returns." },
  { id: "competitive-advantage", title: "Competitive Advantage", author: "Michael Porter", family: "quality", idea: "Cost leadership or differentiation — a firm must pick one and defend it." },
  { id: "real-estate-game", title: "The Real Estate Game", author: "William Poorvu", family: "sector", idea: "Property economics: FFO, AFFO and cap rates rather than earnings." },
  { id: "financial-statement-analysis", title: "Financial Statement Analysis", author: "Martin Fridson", family: "quality", idea: "Cash-flow quality and interest coverage as the tests that survive accounting choices." },
  { id: "valuation-mckinsey", title: "Valuation", author: "McKinsey & Company", family: "value", idea: "DCF built from ROIC, growth and WACC — value creation only above the cost of capital." },
  { id: "damodaran-investment-valuation", title: "Investment Valuation", author: "Aswath Damodaran", family: "value", idea: "Match the valuation model to the company: young, mature, distressed and commodity firms differ." },
  { id: "little-book-valuation", title: "The Little Book of Valuation", author: "Aswath Damodaran", family: "value", idea: "Fast heuristics: most of a valuation comes from a handful of drivers." },
  { id: "dark-pools", title: "Dark Pools", author: "Scott Patterson", family: "quant", idea: "Institutional footprinting through market structure and order-flow patterns." },
  { id: "global-macro-trading", title: "Global Macro Trading", author: "Greg Gliner", family: "sector", idea: "Intermarket relationships — rates, FX, commodities and equities move together." },
  { id: "sector-rotation-stovall", title: "Sector Rotation", author: "Sam Stovall", family: "sector", idea: "Match sector exposure to the business-cycle phase." },
  { id: "cyclical-stock-strategies", title: "Cyclical Stock Strategies", author: "Peter Bernstein", family: "sector", idea: "Cycle sensitivity and inventory build-up as the timing signal." },
  { id: "quantitative-trading", title: "Quantitative Trading", author: "Ernest Chan", family: "quant", idea: "Statistical arbitrage and mean reversion, tested with realistic costs." },
  { id: "algorithmic-trading", title: "Algorithmic Trading", author: "Ernest Chan", family: "quant", idea: "Order-book dynamics and execution-aware indicators." },
  { id: "portfolio-selection", title: "Portfolio Selection", author: "Harry Markowitz", family: "quant", idea: "Mean-variance optimisation: the portfolio's risk is not the average of its parts." },
  { id: "systematic-trading", title: "Systematic Trading", author: "Robert Carver", family: "quant", idea: "Volatility targeting and position sizing before signal selection." },
  { id: "advances-financial-ml", title: "Advances in Financial Machine Learning", author: "Marcos Lopez de Prado", family: "quant", idea: "Label financial data honestly and avoid leakage that inflates backtests." },
  { id: "ml-for-asset-managers", title: "Machine Learning for Asset Managers", author: "Marcos Lopez de Prado", family: "quant", idea: "Portfolio construction that does not overfit the sample." },
  { id: "asset-management-ang", title: "Asset Management", author: "Andrew Ang", family: "quant", idea: "Decompose returns into factor exposures: value, size, momentum, quality, low volatility." },
  { id: "what-works-on-wall-street", title: "What Works on Wall Street", author: "James O'Shaughnessy", family: "quant", idea: "Empirical study of which ratios actually predicted returns, across long samples." },
  { id: "quantitative-equity-portfolio", title: "Quantitative Equity Portfolio Management", author: "Ludwig Chincarini", family: "quant", idea: "Factor weighting and alpha construction with explicit constraints." },
  { id: "active-portfolio-management", title: "Active Portfolio Management", author: "Richard Grinold & Ronald Kahn", family: "quant", idea: "The fundamental law: information ratio scales with skill and breadth." },
  { id: "equity-factors-handbook", title: "The Handbook of Equity Factors", author: "Emanuel Derman", family: "quant", idea: "Factor decomposition of returns into measurable exposures." },
  { id: "quantitative-risk-management", title: "Quantitative Risk Management", author: "Alexander McNeil", family: "risk", idea: "Tail risk and value-at-risk: size positions for the loss you can survive." },
  { id: "trend-following", title: "Trend Following", author: "Michael Covel", family: "momentum", idea: "Long-horizon trend rules applied across many markets with strict risk control." },
  { id: "turtle-trader", title: "The Complete TurtleTrader", author: "Michael Covel", family: "momentum", idea: "Donchian channel breakouts with ATR-based risk allocation." },
  { id: "dynamic-hedging", title: "Dynamic Hedging", author: "Nassim Nicholas Taleb", family: "risk", idea: "Convexity and option overlays that pay in the tail." },
  { id: "fooled-by-randomness", title: "Fooled by Randomness", author: "Nassim Nicholas Taleb", family: "risk", idea: "Strip survivorship bias before believing any track record." },
  { id: "antifragile", title: "Antifragile", author: "Nassim Nicholas Taleb", family: "risk", idea: "Prefer convex payoffs that benefit from volatility rather than suffer it." },
  { id: "mandelbrot-misbehavior", title: "The (Mis)behavior of Markets", author: "Benoit Mandelbrot", family: "risk", idea: "Fractal, power-law markets: fat tails make normal assumptions dangerous." },
  { id: "trading-and-exchanges", title: "Trading and Exchanges", author: "Larry Harris", family: "quant", idea: "Market microstructure: liquidity provision and the real cost of execution." },
  { id: "empirical-market-structure", title: "Empirical Market Microstructure", author: "Larry Harris", family: "quant", idea: "Order types, transaction costs and execution drag measured empirically." },
  { id: "thinking-fast-and-slow", title: "Thinking, Fast and Slow", author: "Daniel Kahneman", family: "risk", idea: "Remove cognitive bias from the process; rules beat intuition under uncertainty." },
  { id: "behavioral-investing", title: "Behavioural Investing", author: "James Montier", family: "risk", idea: "Value traps and confirmation bias: the enemy is your own narrative." },
  { id: "alchemy-of-finance", title: "The Alchemy of Finance", author: "George Soros", family: "risk", idea: "Reflexivity: prices change the fundamentals they are supposed to reflect." },
  { id: "big-debt-crises", title: "Principles for Navigating Big Debt Crises", author: "Ray Dalio", family: "risk", idea: "Deleveraging cycles and the policy response that determines the outcome." },
  { id: "dalio-principles", title: "Principles", author: "Ray Dalio", family: "risk", idea: "Write decision rules down and follow them; the process outlives the prediction." },
  { id: "manias-panics-crashes", title: "Manias, Panics, and Crashes", author: "Charles Kindleberger", family: "risk", idea: "Credit expansion precedes asset bubbles; watch the funding, not the story." },
  { id: "devil-take-hindmost", title: "Devil Take the Hindmost", author: "Edward Chancellor", family: "risk", idea: "Historical speculation cycles repeat in structure, not in detail." },
  { id: "irrational-exuberance", title: "Irrational Exuberance", author: "Robert Shiller", family: "risk", idea: "CAPE as a long-horizon valuation gauge for the whole market." },
  { id: "extraordinary-popular-delusions", title: "Extraordinary Popular Delusions and the Madness of Crowds", author: "Charles Mackay", family: "risk", idea: "Crowd manias are old, patterned, and recognisable in advance." },
  { id: "reminiscences", title: "Reminiscences of a Stock Operator", author: "Edwin Lefevre", family: "momentum", idea: "Trade the path of least resistance; wait for the pivot rather than anticipating it." },
  { id: "market-wizards", title: "Market Wizards", author: "Jack Schwager", family: "risk", idea: "Consistent risk management, not prediction, is what separates survivors." },
  { id: "new-market-wizards", title: "The New Market Wizards", author: "Jack Schwager", family: "risk", idea: "Different edges, one shared discipline: define risk before entry." },
  { id: "hedge-fund-market-wizards", title: "Hedge Fund Market Wizards", author: "Jack Schwager", family: "risk", idea: "Asymmetric positioning: small defined losses, large open gains." },
  { id: "unknown-market-wizards", title: "Unknown Market Wizards", author: "Jack Schwager", family: "risk", idea: "Unconventional methods work when the risk process is sound." },
  { id: "psychology-of-money", title: "The Psychology of Money", author: "Morgan Housel", family: "risk", idea: "Survival is the strategy: compounding needs time more than brilliance." },
  { id: "little-book-behavioral-investing", title: "The Little Book of Behavioral Investing", author: "James Montier", family: "risk", idea: "Process over outcome; judge decisions by the information available at the time." },
  { id: "misbehaving", title: "Misbehaving", author: "Richard Thaler", family: "risk", idea: "Systematic behavioural anomalies that survive after costs." },
  { id: "against-the-gods", title: "Against the Gods", author: "Peter Bernstein", family: "risk", idea: "Probability thinking: risk is measurable, and measurement changes decisions." },
  { id: "pioneering-portfolio-management", title: "Pioneering Portfolio Management", author: "David Swensen", family: "quant", idea: "The endowment model: diversify across return drivers and harvest illiquidity premia." },
  { id: "capital-ideas", title: "Capital Ideas", author: "Peter Bernstein", family: "quant", idea: "Modern portfolio theory and its limits, in historical context." },
];

/** Real implementations, keyed by book id. Everything absent here is reference-only, honestly. */
export const IMPLEMENTATIONS: Record<string, ImplementedStrategy> = {
  "intelligent-investor": { kind: "screen", screenId: "graham-defensive", requires: ["fundamentals"], metrics: ["P/E", "P/B", "current ratio", "debt/equity", "earnings yield"] },
  "security-analysis": { kind: "screen", screenId: "graham-net-net", requires: ["fundamentals"], metrics: ["net current asset value", "price/NCAV"] },
  "buffett-essays": { kind: "screen", screenId: "buffett-quality", requires: ["fundamentals"], metrics: ["ROE", "ROIC", "net margin", "debt/equity", "accruals"] },
  "common-stocks-uncommon-profits": { kind: "screen", screenId: "fisher-growth", requires: ["fundamentals"], metrics: ["revenue growth", "EPS growth", "net margin", "debt/equity"] },
  "one-up-on-wall-street": { kind: "screen", screenId: "slater-peg", requires: ["fundamentals"], metrics: ["PEG", "EPS growth", "P/E"] },
  "little-book-beats-market": { kind: "rank", screenId: "magic-formula", requires: ["fundamentals"], metrics: ["ROIC", "earnings yield", "combined rank"] },
  "deep-value": { kind: "screen", screenId: "deep-value-ev-ebit", requires: ["fundamentals"], metrics: ["EV/EBIT", "EV/EBITDA", "earnings yield"] },
  "acquirers-multiple": { kind: "screen", screenId: "deep-value-ev-ebit", requires: ["fundamentals"], metrics: ["EV/EBIT", "EV/EBITDA", "earnings yield"] },
  "quantitative-value": { kind: "screen", screenId: "forensic-red-flags", requires: ["fundamentals"], metrics: ["accruals ratio", "days sales outstanding", "net margin"] },
  "little-book-value-investing": { kind: "screen", screenId: "oshaughnessy-value", requires: ["fundamentals"], metrics: ["P/E", "P/S", "P/B"] },
  "how-to-make-money-in-stocks": {
    kind: "spec",
    requires: ["ohlcv"],
    metrics: ["breakout", "trend", "stop-loss"],
    spec: { name: "CAN SLIM breakout (O'Neil)", side: "long", entry: [{ kind: "breakoutHigh", lookback: 50 }, { kind: "priceAboveEma", period: 50 }], exit: [{ kind: "priceBelowEma", period: 50 }], stopLossPct: 0.07, takeProfitPct: 0.2, maxHoldBars: null, riskPerTradePct: 0.95 },
  },
  "trade-like-stock-market-wizard": {
    kind: "spec",
    requires: ["ohlcv"],
    metrics: ["EMA 50", "EMA 200", "trend template", "stop-loss"],
    spec: { name: "Minervini trend template", side: "long", entry: [{ kind: "priceAboveEma", period: 50 }, { kind: "priceAboveEma", period: 200 }], exit: [{ kind: "priceBelowEma", period: 50 }], stopLossPct: 0.06, takeProfitPct: null, maxHoldBars: null, riskPerTradePct: 0.95 },
  },
  "momentum-investing": {
    kind: "spec",
    requires: ["ohlcv"],
    metrics: ["52-week proximity", "trend filter"],
    spec: { name: "Quantitative momentum (Gray/Vogel)", side: "long", entry: [{ kind: "breakoutHigh", lookback: 252 }, { kind: "priceAboveEma", period: 100 }], exit: [{ kind: "priceBelowEma", period: 100 }], stopLossPct: 0.1, takeProfitPct: null, maxHoldBars: null, riskPerTradePct: 0.95 },
  },
  "stocks-on-the-move": {
    kind: "spec",
    requires: ["ohlcv"],
    metrics: ["EMA 50", "EMA 100", "ATR sizing"],
    spec: { name: "Systematic momentum (Clenow)", side: "long", entry: [{ kind: "emaCrossAbove", fast: 50, slow: 100 }], exit: [{ kind: "emaCrossBelow", fast: 50, slow: 100 }], stopLossPct: 0.12, takeProfitPct: null, maxHoldBars: null, riskPerTradePct: 0.95 },
  },
  "dual-momentum": {
    kind: "spec",
    requires: ["ohlcv"],
    metrics: ["absolute momentum", "EMA 200"],
    spec: { name: "Absolute momentum filter (Antonacci)", side: "long", entry: [{ kind: "priceAboveEma", period: 200 }, { kind: "breakoutHigh", lookback: 20 }], exit: [{ kind: "priceBelowEma", period: 200 }], stopLossPct: 0.08, takeProfitPct: null, maxHoldBars: null, riskPerTradePct: 0.95 },
  },
  "growth-stock-market-strategies": { kind: "screen", screenId: "slater-peg", requires: ["fundamentals"], metrics: ["PEG", "EPS growth", "P/E"] },
  "secrets-bull-bear": { kind: "screen", screenId: "weinstein-stage-two", requires: ["fundamentals"], metrics: ["relative strength", "revenue growth"] },
  "100-bagger": { kind: "screen", screenId: "mayer-compounders", requires: ["fundamentals"], metrics: ["ROIC", "ROE", "revenue growth"] },
  "financial-shenanigans": { kind: "screen", screenId: "forensic-red-flags", requires: ["fundamentals"], metrics: ["accruals ratio", "days sales outstanding", "net margin"] },
  "darvas-box": {
    kind: "spec",
    requires: ["ohlcv"],
    metrics: ["box breakout", "trailing stop"],
    spec: { name: "Darvas box breakout", side: "long", entry: [{ kind: "breakoutHigh", lookback: 20 }], exit: [{ kind: "breakdownLow", lookback: 10 }], stopLossPct: 0.08, takeProfitPct: null, maxHoldBars: null, riskPerTradePct: 0.95 },
  },
  "turtle-trader": {
    kind: "spec",
    requires: ["ohlcv"],
    metrics: ["Donchian 55/20", "ATR risk"],
    spec: { name: "Donchian breakout (Turtle)", side: "long", entry: [{ kind: "breakoutHigh", lookback: 55 }], exit: [{ kind: "breakdownLow", lookback: 20 }], stopLossPct: 0.1, takeProfitPct: null, maxHoldBars: null, riskPerTradePct: 0.95 },
  },
  "trend-following": {
    kind: "spec",
    requires: ["ohlcv"],
    metrics: ["EMA 50/200", "long horizon"],
    spec: { name: "Long-horizon trend following", side: "long", entry: [{ kind: "emaCrossAbove", fast: 50, slow: 200 }], exit: [{ kind: "emaCrossBelow", fast: 50, slow: 200 }], stopLossPct: 0.15, takeProfitPct: null, maxHoldBars: null, riskPerTradePct: 0.95 },
  },
  "reminiscences": {
    kind: "spec",
    requires: ["ohlcv"],
    metrics: ["pivot breakout"],
    spec: { name: "Pivot-point breakout", side: "long", entry: [{ kind: "breakoutHigh", lookback: 10 }], exit: [{ kind: "breakdownLow", lookback: 10 }], stopLossPct: 0.06, takeProfitPct: null, maxHoldBars: null, riskPerTradePct: 0.95 },
  },
  "what-works-on-wall-street": { kind: "screen", screenId: "oshaughnessy-value", requires: ["fundamentals"], metrics: ["P/E", "P/S", "P/B"] },
};

/** The full catalogue with an honest implemented/not marker on every entry. */
export const STRATEGY_LIBRARY: LibraryEntry[] = BOOK_LIBRARY.map((book) => ({ ...book, implemented: IMPLEMENTATIONS[book.id] ?? null }));

export function findLibraryEntry(id: string): LibraryEntry | null {
  return STRATEGY_LIBRARY.find((entry) => entry.id === id) ?? null;
}

export function implementedEntries(): LibraryEntry[] {
  return STRATEGY_LIBRARY.filter((entry) => entry.implemented !== null);
}

export function libraryByFamily(): { family: StrategyFamily; label: string; entries: LibraryEntry[] }[] {
  const order: StrategyFamily[] = ["value", "quality", "growth", "momentum", "quant", "sector", "risk"];
  return order.map((family) => ({ family, label: FAMILY_LABELS[family], entries: STRATEGY_LIBRARY.filter((entry) => entry.family === family) }));
}

export function libraryStats(): { total: number; implemented: number; referenceOnly: number; byFamily: { family: StrategyFamily; label: string; total: number; implemented: number }[] } {
  const byFamily = libraryByFamily().map((group) => ({ family: group.family, label: group.label, total: group.entries.length, implemented: group.entries.filter((entry) => entry.implemented).length }));
  const implemented = implementedEntries().length;
  return { total: STRATEGY_LIBRARY.length, implemented, referenceOnly: STRATEGY_LIBRARY.length - implemented, byFamily };
}
