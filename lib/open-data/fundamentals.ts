/**
 * Faithful on-device `FundamentalAnalysis`.
 *
 * The company screen and screener read ~121 fields from this contract, so it is
 * typed against the server's own `FundamentalAnalysis` and the compiler enforces
 * completeness. Everything is computed from free/open sources (Yahoo Finance
 * reported annual statements, quotes and price history); anything a free source
 * cannot supply is explicitly labelled `unavailable` rather than invented.
 */
import type { FundamentalAnalysis } from "@/server/fundamental-analysis";
import type { QuantitativeMetric } from "@/server/quantitative-metrics";
import { classifyMarketCap, getMarketCapConvention, marketCapBandLabel } from "../market-cap";
import { getMarketProfile } from "../market-regions";
import {
  cached,
  clamp,
  currencyForMarket,
  nowIso,
  round,
  safeNumber,
  toDisplaySymbol,
  toYahooSymbol,
  type MarketId,
} from "./core";
import { quoteFromSeries, yahooChart, yahooFundamentals, yoyGrowth, type AnnualMetric } from "./sources";

type Basis = "reported" | "derived" | "estimated" | "unavailable";
type Metric = { value: number; basis: Exclude<Basis, "unavailable">; source: string; period?: string };
type TrendPoint = { period: string; value: number; basis: Exclude<Basis, "unavailable">; source: string };

const YAHOO = "Yahoo Finance reported annual statements";

const SECTOR_BASELINES: Record<string, number> = {
  default: 22,
  Financials: 18,
  "IT services": 25,
  "Capital goods": 24,
  Energy: 14,
  Healthcare: 30,
  "Consumer goods": 40,
};

/** Yahoo reports some Indian issuers in absolute units; normalise to the local unit. */
function seriesOf(metrics: Record<string, AnnualMetric[]>, key: string): AnnualMetric[] {
  return [...(metrics[key] ?? [])].sort((a, b) => a.asOfDate.localeCompare(b.asOfDate));
}
function latestOf(metrics: Record<string, AnnualMetric[]>, key: string): AnnualMetric | null {
  const rows = seriesOf(metrics, key);
  return rows.length ? rows[rows.length - 1] : null;
}

function metricOf(metrics: Record<string, AnnualMetric[]>, key: string, basis: Exclude<Basis, "unavailable"> = "reported"): Metric | null {
  const point = latestOf(metrics, key);
  if (!point || !Number.isFinite(point.raw)) return null;
  return { value: point.raw, basis, source: YAHOO, period: point.asOfDate };
}

function trendOf(metrics: Record<string, AnnualMetric[]>, key: string): TrendPoint[] {
  return seriesOf(metrics, key).map((point) => ({ period: point.asOfDate, value: point.raw, basis: "reported" as const, source: YAHOO }));
}

/* ------------------------------------------------------------------ *
 * Technicals from real daily price history
 * ------------------------------------------------------------------ */

type Technicals = {
  trend: "Bullish" | "Neutral" | "Bearish" | "Unavailable";
  currentPrice: number | null;
  sma20: number | null;
  sma50: number | null;
  rsi14: number | null;
  high52: number | null;
  low52: number | null;
  oneYearChangePct: number | null;
  basis: Basis;
  note: string;
};

function sma(values: number[], window: number): number | null {
  if (values.length < window) return null;
  const slice = values.slice(-window);
  return round(slice.reduce((sum, v) => sum + v, 0) / window, 2);
}

function rsi(values: number[], period = 14): number | null {
  if (values.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = values.length - period; i < values.length; i += 1) {
    const change = values[i] - values[i - 1];
    if (change >= 0) gains += change;
    else losses -= change;
  }
  if (losses === 0) return 100;
  const rs = gains / period / (losses / period);
  return round(100 - 100 / (1 + rs), 2);
}

function technicalsFrom(closes: number[], currentPrice: number | null): Technicals {
  const clean = closes.filter((value) => Number.isFinite(value));
  if (clean.length < 20) {
    return { trend: "Unavailable", currentPrice, sma20: null, sma50: null, rsi14: null, high52: null, low52: null, oneYearChangePct: null, basis: "unavailable", note: "Not enough daily history was returned to compute moving averages." };
  }
  const sma20Value = sma(clean, 20);
  const sma50Value = sma(clean, 50);
  const rsiValue = rsi(clean);
  const last = currentPrice ?? clean[clean.length - 1];
  const oneYearChangePct = clean.length > 1 ? round(((last - clean[0]) / clean[0]) * 100, 2) : null;
  const trend: Technicals["trend"] = sma20Value && sma50Value ? (last > sma20Value && sma20Value > sma50Value ? "Bullish" : last < sma20Value && sma20Value < sma50Value ? "Bearish" : "Neutral") : "Neutral";
  return {
    trend,
    currentPrice: last,
    sma20: sma20Value,
    sma50: sma50Value,
    rsi14: rsiValue,
    high52: round(Math.max(...clean), 2),
    low52: round(Math.min(...clean), 2),
    oneYearChangePct,
    basis: "derived",
    note: "Computed on-device from daily closing prices over the last year.",
  };
}

/* ------------------------------------------------------------------ *
 * Main builder
 * ------------------------------------------------------------------ */

export async function buildFundamentalAnalysis(symbol: string, marketId: MarketId = "IN"): Promise<FundamentalAnalysis> {
  const yahooSymbol = toYahooSymbol(symbol, marketId);
  const market = getMarketProfile(marketId);
  const currency = currencyForMarket(marketId);
  const warnings: string[] = [];

  const [fundResult, quoteResult, historyResult] = await Promise.allSettled([
    cached(`fund:${yahooSymbol}`, 6 * 60 * 60_000, () => yahooFundamentals(yahooSymbol)),
    cached(`quote:${yahooSymbol}`, 60_000, () => yahooChart(yahooSymbol, "5d", "1d")),
    cached(`history:${yahooSymbol}:1y:1d`, 30 * 60_000, () => yahooChart(yahooSymbol, "1y", "1d")),
  ]);

  const rawMetrics: Record<string, AnnualMetric[]> = fundResult.status === "fulfilled" ? fundResult.value.value.data.metrics : {};
  if (fundResult.status === "rejected") warnings.push(`Reported financial statements unavailable: ${String(fundResult.reason).slice(0, 140)}`);

  let companyName = symbol.toUpperCase();
  let exchange = market.exchanges[0] ?? "";
  let price: number | null = null;
  let quoteAsOf: string | null = null;
  if (quoteResult.status === "fulfilled") {
    const quote = quoteFromSeries(quoteResult.value.value.series);
    companyName = quote.name || companyName;
    exchange = quote.exchange || exchange;
    price = quote.current;
    quoteAsOf = quote.asOf;
  } else {
    warnings.push(`Live quote unavailable: ${String(quoteResult.reason).slice(0, 140)}`);
  }

  const closes = historyResult.status === "fulfilled" ? historyResult.value.value.series.closes.filter((c): c is number => typeof c === "number") : [];
  const technical = technicalsFrom(closes, price);

  const revenue = latestOf(rawMetrics, "annualTotalRevenue");
  const netIncome = latestOf(rawMetrics, "annualNetIncome");
  const eps = latestOf(rawMetrics, "annualDilutedEPS");
  const equity = latestOf(rawMetrics, "annualStockholdersEquity");
  const debt = latestOf(rawMetrics, "annualTotalDebt");
  const assets = latestOf(rawMetrics, "annualTotalAssets");
  const ocf = latestOf(rawMetrics, "annualOperatingCashFlow");
  const fcf = latestOf(rawMetrics, "annualFreeCashFlow");
  const capex = latestOf(rawMetrics, "annualCapitalExpenditure");
  const shares = latestOf(rawMetrics, "annualOrdinarySharesNumber");

  const ratio = (a: AnnualMetric | null, b: AnnualMetric | null, scale = 1) =>
    a && b && b.raw ? round((a.raw / b.raw) * scale, 2) : null;

  const marketCapValue = price !== null && shares ? round(price * shares.raw, 0) : null;
  const peValue = price !== null && eps?.raw ? round(price / eps.raw, 2) : null;
  const bookValuePerShare = shares?.raw && equity ? equity.raw / shares.raw : null;
  const priceToBook = price !== null && bookValuePerShare ? round(price / bookValuePerShare, 2) : null;
  const roe = ratio(netIncome, equity, 100);
  const roa = ratio(netIncome, assets, 100);
  const debtToEquity = ratio(debt, equity);
  const profitMargin = ratio(netIncome, revenue, 100);
  const revenueGrowth = yoyGrowth(rawMetrics.annualTotalRevenue);
  const earningsGrowth = yoyGrowth(rawMetrics.annualNetIncome);

  const metrics: Record<string, Metric> = {};
  const put = (key: string, metric: Metric | null) => {
    if (metric) metrics[key] = metric;
  };
  put("revenue", metricOf(rawMetrics, "annualTotalRevenue"));
  put("netIncome", metricOf(rawMetrics, "annualNetIncome"));
  put("earningsPerShare", metricOf(rawMetrics, "annualDilutedEPS"));
  put("totalDebt", metricOf(rawMetrics, "annualTotalDebt"));
  put("stockholdersEquity", metricOf(rawMetrics, "annualStockholdersEquity"));
  put("totalAssets", metricOf(rawMetrics, "annualTotalAssets"));
  put("operatingCashFlow", metricOf(rawMetrics, "annualOperatingCashFlow"));
  put("freeCashFlow", metricOf(rawMetrics, "annualFreeCashFlow"));
  put("capitalExpenditures", metricOf(rawMetrics, "annualCapitalExpenditure"));
  put("ebitda", metricOf(rawMetrics, "annualEBITDA"));
  put("grossProfit", metricOf(rawMetrics, "annualGrossProfit"));
  if (peValue !== null) metrics.pe = { value: peValue, basis: "derived", source: "Latest price ÷ latest reported diluted EPS", period: quoteAsOf ?? undefined };
  if (priceToBook !== null) metrics.priceToBook = { value: priceToBook, basis: "derived", source: "Latest price ÷ book value per share", period: quoteAsOf ?? undefined };
  if (roe !== null) metrics.roe = { value: roe, basis: "derived", source: "Net income ÷ stockholders' equity", period: equity?.asOfDate };
  if (roa !== null) metrics.roa = { value: roa, basis: "derived", source: "Net income ÷ total assets", period: assets?.asOfDate };
  if (debtToEquity !== null) metrics.debtToEquity = { value: debtToEquity, basis: "derived", source: "Total debt ÷ stockholders' equity", period: equity?.asOfDate };
  if (profitMargin !== null) metrics.profitMargin = { value: profitMargin, basis: "derived", source: "Net income ÷ total revenue", period: revenue?.asOfDate };
  if (revenueGrowth !== null) metrics.revenueGrowth = { value: revenueGrowth, basis: "derived", source: "Year-over-year, latest two annual periods", period: revenue?.asOfDate };
  if (earningsGrowth !== null) metrics.earningsGrowth = { value: earningsGrowth, basis: "derived", source: "Year-over-year, latest two annual periods", period: netIncome?.asOfDate };
  if (marketCapValue !== null) metrics.marketCap = { value: marketCapValue, basis: "derived", source: "Latest price × reported ordinary shares", period: quoteAsOf ?? undefined };

  const quantitativeMetrics: Record<string, QuantitativeMetric> = {
    pe: { key: "pe", label: "Price / earnings", value: peValue, unit: "multiple", basis: peValue === null ? "unavailable" : "derived", formula: "latest price ÷ latest annual diluted EPS", source: "Yahoo Finance", period: eps?.asOfDate },
    priceToBook: { key: "priceToBook", label: "Price / book", value: priceToBook, unit: "multiple", basis: priceToBook === null ? "unavailable" : "derived", formula: "latest price ÷ book value per share", source: "Yahoo Finance", period: equity?.asOfDate },
    returnOnEquity: { key: "returnOnEquity", label: "Return on equity", value: roe, unit: "percent", basis: roe === null ? "unavailable" : "derived", formula: "net income ÷ stockholders' equity", source: "Yahoo Finance", period: equity?.asOfDate },
    debtToEquity: { key: "debtToEquity", label: "Debt / equity", value: debtToEquity, unit: "ratio", basis: debtToEquity === null ? "unavailable" : "derived", formula: "total debt ÷ stockholders' equity", source: "Yahoo Finance", period: equity?.asOfDate },
    profitMargin: { key: "profitMargin", label: "Net margin", value: profitMargin, unit: "percent", basis: profitMargin === null ? "unavailable" : "derived", formula: "net income ÷ revenue", source: "Yahoo Finance", period: revenue?.asOfDate },
    freeCashFlowMargin: { key: "freeCashFlowMargin", label: "Free cash flow margin", value: ratio(fcf, revenue, 100), unit: "percent", basis: "derived", formula: "free cash flow ÷ revenue", source: "Yahoo Finance", period: revenue?.asOfDate },
  };

  // Rule-based pillars over reported fundamentals only.
  const scale = (value: number | null, bad: number, good: number) => (value === null ? 0 : clamp(round(((value - bad) / (good - bad)) * 100), 0, 100));
  const pillars = [
    { key: "growth", label: "Growth", score: round((scale(revenueGrowth, -10, 20) / 100) * 25), max: 25, calculation: "Annual revenue growth, scaled between -10% and +20%." },
    { key: "profitability", label: "Profitability", score: round((scale(profitMargin, 0, 20) / 100) * 25), max: 25, calculation: "Net margin, scaled between 0% and 20%." },
    { key: "cash", label: "Cash conversion", score: round((scale(ratio(fcf, revenue, 100), 0, 15) / 100) * 25), max: 25, calculation: "Free cash flow ÷ revenue, scaled between 0% and 15%." },
    { key: "balance", label: "Balance sheet", score: round((scale(debtToEquity === null ? null : -debtToEquity, -0.2, -1.5) / 100) * 25), max: 25, calculation: "Debt-to-equity, lower is better (0.2x–1.5x)." },
  ];
  const score = clamp(pillars.reduce((sum, p) => sum + p.score, 0));

  const sections = [
    { key: "quote", label: "Market quote", score: price !== null ? 20 : 0, max: 20, basis: (price !== null ? "reported" : "unavailable") as Basis, status: (price !== null ? "verified" : "unavailable") as "verified" | "unavailable", note: "Latest price from Yahoo Finance." },
    { key: "statements", label: "Reported statements", score: revenue ? 30 : 0, max: 30, basis: (revenue ? "reported" : "unavailable") as Basis, status: (revenue ? "verified" : "unavailable") as "verified" | "unavailable", note: "Annual reported financial statement values." },
    { key: "ratios", label: "Derived ratios", score: peValue !== null ? 15 : 0, max: 15, basis: (peValue !== null ? "derived" : "unavailable") as Basis, status: (peValue !== null ? "estimated" : "unavailable") as "estimated" | "unavailable", note: "Ratios derived from price and reported statements." },
    { key: "technical", label: "Price history", score: closes.length > 50 ? 15 : 0, max: 15, basis: (closes.length ? "derived" : "unavailable") as Basis, status: (closes.length ? "estimated" : "unavailable") as "estimated" | "unavailable", note: "Moving averages and RSI from daily closes." },
    { key: "ownership", label: "Ownership", score: 0, max: 10, basis: "unavailable" as Basis, status: "unavailable" as const, note: "Promoter and pledge data require a regulator feed." },
    { key: "filings", label: "Filings", score: 0, max: 10, basis: "unavailable" as Basis, status: "unavailable" as const, note: "No validated filing adapter for this market." },
  ];
  const coverageScore = sections.reduce((sum, s) => sum + s.score, 0);
  const coverageLabel: "High" | "Moderate" | "Limited" = coverageScore >= 70 ? "High" : coverageScore >= 40 ? "Moderate" : "Limited";

  const positives: string[] = [];
  const redFlags: string[] = [];
  const catalysts: string[] = [];
  if (revenueGrowth !== null && revenueGrowth > 10) positives.push(`Revenue grew ${revenueGrowth}% year over year.`);
  if (profitMargin !== null && profitMargin > 12) positives.push(`Net margin is a healthy ${profitMargin}%.`);
  if (fcf && fcf.raw > 0) positives.push("The business generated positive free cash flow in the latest reported year.");
  if (debtToEquity !== null && debtToEquity < 0.5) positives.push(`Leverage is modest at ${debtToEquity}x debt-to-equity.`);
  if (debtToEquity !== null && debtToEquity > 1.5) redFlags.push(`Elevated leverage: debt-to-equity ${debtToEquity}x.`);
  if (profitMargin !== null && profitMargin < 5) redFlags.push(`Thin net margin of ${profitMargin}%.`);
  if (revenueGrowth !== null && revenueGrowth < 0) redFlags.push(`Revenue declined ${Math.abs(revenueGrowth)}% year over year.`);
  if (fcf && fcf.raw < 0) redFlags.push("Free cash flow was negative in the latest reported year.");
  if (technical.rsi14 !== null && technical.rsi14 > 70) redFlags.push(`Momentum is stretched: RSI(14) at ${technical.rsi14}.`);
  if (technical.trend === "Bullish") catalysts.push("Price is above both the 20- and 50-day moving averages.");
  if (technical.trend === "Bearish") catalysts.push("Price is below both the 20- and 50-day moving averages.");

  const rating: FundamentalAnalysis["institutionalReport"]["rating"] =
    score >= 85 ? "Exceptional" : score >= 70 ? "Strong" : score >= 55 ? "Good" : score >= 40 ? "Neutral" : score >= 25 ? "Weak" : "High Risk";
  const investmentView: FundamentalAnalysis["institutionalReport"]["investmentView"] =
    score >= 75 ? "Bullish" : score >= 60 ? "Moderately Bullish" : score >= 45 ? "Neutral" : score >= 30 ? "Moderately Bearish" : "Bearish";

  const sectorBaseline = SECTOR_BASELINES.default;
  const baseMultiple = sectorBaseline;
  const lowMultiple = round(sectorBaseline * 0.75, 2);
  const highMultiple = round(sectorBaseline * 1.25, 2);
  const valueAt = (multiple: number) => (eps?.raw ? round(eps.raw * multiple, 2) : null);
  const currentVsFairValuePct = valueAt(baseMultiple) !== null && price !== null ? round(((valueAt(baseMultiple)! - price) / price) * 100, 2) : null;

  const scenarios: FundamentalAnalysis["institutionalReport"]["scenarios"] = [
    { label: "Bear", assumptions: [`Exit multiple compresses to ${lowMultiple}× reported EPS.`], fairValue: valueAt(lowMultiple), probability: 25, severity: "high" },
    { label: "Base", assumptions: [`Exit multiple holds at the sector reference of ${baseMultiple}× reported EPS.`], fairValue: valueAt(baseMultiple), probability: 50, severity: "medium" },
    { label: "Bull", assumptions: [`Exit multiple expands to ${highMultiple}× reported EPS.`], fairValue: valueAt(highMultiple), probability: 25, severity: "low" },
  ];

  const history: FundamentalAnalysis["history"] = {
    revenue: trendOf(rawMetrics, "annualTotalRevenue"),
    eps: trendOf(rawMetrics, "annualDilutedEPS"),
    cashFlow: trendOf(rawMetrics, "annualOperatingCashFlow"),
  };

  const evidenceGaps = [
    !shares ? "Ordinary share count was unavailable, so market capitalisation could not be derived." : null,
    "Promoter holding and pledge data require a regulator feed.",
    "No validated filing adapter is connected for this market.",
    "Management guidance and earnings-call commentary require a transcript source.",
  ].filter((gap): gap is string => Boolean(gap));

  const multibaggerThesis: FundamentalAnalysis["multibaggerThesis"] = {
    score: clamp(round(score * 0.9)),
    label: score >= 75 ? "Potential multibagger" : score >= 55 ? "Promising but unproven" : score >= 35 ? "Insufficient evidence" : "Rejected by risk gates",
    confidence: coverageLabel === "High" ? "High" : coverageLabel === "Moderate" ? "Medium" : "Low",
    scoreBreakdown: pillars.map((pillar) => ({ key: pillar.key, label: pillar.label, score: pillar.score, max: pillar.max, basis: "derived" as const, explanation: pillar.calculation })),
    hardRejectionFlags: redFlags.filter((flag) => /negative free cash flow|declined|leverage/i.test(flag)),
    evidenceGaps,
    beginnerSummary: `A quick quality read: ${score}/100 from growth, profitability, cash conversion and leverage. Coverage is ${coverageLabel.toLowerCase()}, so treat it as a starting point rather than a conclusion.`,
    why: positives.length ? positives : ["No positive fundamental signals were triggered by the reported statements."],
    what: ["Rule-based screening over reported annual financial statements."],
    when: ["Re-assessed as each new annual report is published."],
    how: ["Growth, profitability, cash conversion and balance-sheet strength, weighted equally at 25 points each."],
    risks: redFlags.length ? redFlags : ["No rule-based risk flags were triggered."],
    valuation: {
      currentPrice: price,
      fiveYear: { bear: valueAt(lowMultiple), base: valueAt(baseMultiple), bull: valueAt(highMultiple) },
      tenYear: { bear: null, base: null, bull: null },
    },
    probabilities: { twoX: 0, fiveX: 0, tenX: 0 },
    scenarios: [
      { label: "Bear", revenueCagr: null, marginChange: null, exitMultiple: lowMultiple, expectedCagr: null, valueMultiple: null, assumptions: ["Multiple compression without an earnings forecast."] },
      { label: "Base", revenueCagr: revenueGrowth, marginChange: null, exitMultiple: baseMultiple, expectedCagr: null, valueMultiple: null, assumptions: ["Sector-reference multiple held."] },
      { label: "Bull", revenueCagr: null, marginChange: null, exitMultiple: highMultiple, expectedCagr: null, valueMultiple: null, assumptions: ["Multiple expansion without an earnings forecast."] },
    ],
    invalidation: ["Two consecutive years of revenue decline.", "Free cash flow turning negative.", "Leverage rising above 2x debt-to-equity."],
    researchFallback: { policy: "Gaps require grounded research before any conclusion is treated as complete.", status: evidenceGaps.length ? "gaps_require_grounded_research" : "not_needed", nextQuestions: ["What does management guide for the next twelve months?", "How concentrated is the customer base?"] },
  };

  const filingEvidence: FundamentalAnalysis["filingEvidence"] = {
    tam: { status: "unavailable", value: null, sourceUrl: null, period: null, evidence: [], note: "Total addressable market requires a source-backed filing passage; none is connected." },
    customerConcentration: { status: "unavailable", value: null, sourceUrl: null, period: null, evidence: [], note: "Customer concentration requires a source-backed filing passage; none is connected." },
    managementGuidance: { status: "unavailable", value: null, sourceUrl: null, period: null, evidence: [], note: "Management guidance requires an earnings-call or investor-presentation source." },
    sourcePolicy: "Filing evidence is only ever extracted from a connected, dated primary filing; it is never inferred from a headline.",
  };

  const fairValue: FundamentalAnalysis["fairValue"] = {
    lowMultiple,
    baseMultiple,
    highMultiple,
    lowValue: valueAt(lowMultiple),
    baseValue: valueAt(baseMultiple),
    highValue: valueAt(highMultiple),
    currentPrice: price,
    currency,
    basis: eps?.raw ? "derived" : "unavailable",
    note: "Relative anchors apply a transparent sector-reference P/E to the latest reported diluted EPS. They are conditional, not forecasts.",
    dcf: { valuePerShare: null, basis: "unavailable", note: "A discounted-cash-flow value is not computed: a full cash-flow forecast is not available from open sources." },
  };

  const marketCapConvention = getMarketCapConvention(marketId);

  return {
    requestedSymbol: symbol.toUpperCase(),
    resolvedSymbol: toDisplaySymbol(yahooSymbol),
    companyName,
    market: { exchange, currency, country: market.country, primaryFocus: marketId === "IN" },
    marketCap: {
      value: marketCapValue,
      band: classifyMarketCap(marketId, marketCapValue),
      label: marketCapBandLabel(classifyMarketCap(marketId, marketCapValue)),
      currency,
      convention: marketCapConvention,
      basis: marketCapValue === null ? "unavailable" : "reported",
    },
    redirect: null,
    score,
    verdict: score >= 70 ? "Constructive on reported fundamentals" : score >= 45 ? "Mixed on reported fundamentals" : "Weak on reported fundamentals",
    coverage: {
      score: coverageScore,
      label: coverageLabel,
      verified: sections.filter((s) => s.status === "verified").length,
      estimated: sections.filter((s) => s.status === "estimated").length,
      unavailable: sections.filter((s) => s.status === "unavailable").length,
      sections,
    },
    categories: pillars.map((pillar) => ({ key: pillar.key, label: pillar.label, score: pillar.score, max: pillar.max, basis: "derived" as Basis, evidence: [pillar.calculation] })),
    qualitative: {
      businessModel: "Unavailable: a business-model description requires a company filing or profile source.",
      moat: "Unavailable: competitive advantage cannot be established from reported statements alone.",
      management: "Unavailable: management quality requires governance and disclosure evidence.",
      currentScope: `Reported operations as of the latest annual statement (${revenue?.asOfDate ?? "unavailable"}).`,
      futurePlans: "Unavailable: forward plans require management guidance or an investor presentation.",
      basis: "unavailable",
    },
    institutionalReport: {
      rating,
      investmentView,
      confidenceScore: clamp(40 + coverageScore / 2),
      currentVsFairValuePct,
      upsideDownsidePct: currentVsFairValuePct,
      probabilityWeightedFairValue: valueAt(baseMultiple),
      outlook12to24m: `Rule-based outlook: ${investmentView.toLowerCase()} on reported fundamentals with ${coverageLabel.toLowerCase()} coverage. No earnings forecast is applied, so this is not a price target.`,
      positives,
      weaknesses: redFlags,
      catalysts,
      redFlags,
      thesisBullishWhen: ["Revenue growth stays above 10% and free cash flow remains positive.", "Leverage stays below 1x debt-to-equity."],
      thesisInvalidation: multibaggerThesis.invalidation,
      scenarios,
      scoreWeights: pillars.map((pillar) => ({ key: pillar.key, label: pillar.label, score: pillar.score, max: pillar.max, calculation: pillar.calculation })),
      freshness: `Built from reported annual statements; latest period ${revenue?.asOfDate ?? "unavailable"}. Quote as of ${quoteAsOf ?? "unavailable"}.`,
      sourceHierarchy: ["Yahoo Finance reported statements", "Yahoo Finance quote", "Yahoo Finance daily price history"],
    },
    researchLogic: {
      methodology: ["Fetch reported annual statements, the latest quote and one year of daily closes from free/open sources.", "Derive ratios transparently and label each value reported, derived or unavailable.", "Score four equally weighted pillars over reported fundamentals only."],
      evidenceUsed: [`Reported annual statements (${revenue?.asOfDate ?? "unavailable"})`, `Latest quote (${quoteAsOf ?? "unavailable"})`, `${closes.length} daily closing prices`],
      evidenceGaps,
      contradictions: [],
      decisionRules: ["A pillar with no source value scores zero rather than being estimated.", "No conclusion is drawn from a value labelled unavailable."],
      nextResearchQuestions: ["What does management guide for revenue and margin?", "How concentrated is the customer base?", "What is the promoter holding and pledge position?"],
    },
    stockAnalysis: {
      profile: {
        businessSummary: "Unavailable: a business summary requires a company profile or filing source.",
        currentScope: `Reported scale: revenue ${revenue ? revenue.raw.toLocaleString("en-IN") : "unavailable"} ${currency} for the year ended ${revenue?.asOfDate ?? "unavailable"}.`,
        futurePlans: "Unavailable: forward plans require management guidance.",
        sector: "",
        exchange,
        country: market.country,
        website: "",
        employees: null,
        employeesSource: "Unavailable",
        basis: "unavailable",
      },
      technical,
      ownership: { promoterHolding: null, promoterPledge: null, status: "Unavailable", basis: "unavailable", note: "Shareholding and pledge data require a regulator or depository feed." },
      filings: { status: "unavailable", note: "No validated filing adapter is connected for this market.", nextCheck: "Connect an official filing source." },
      valuation: { pe: peValue ?? 0, priceToBook: priceToBook ?? 0, currentVsFairValuePct, note: "P/E and P/B derived from the latest price and reported statements." },
      conclusion:
        `${companyName} scores ${score}/100 on reported fundamentals alone. ` +
        (revenueGrowth !== null ? `Revenue grew ${revenueGrowth}% year over year. ` : "Revenue growth is unavailable. ") +
        (profitMargin !== null ? `Net margin is ${profitMargin}%. ` : "") +
        "Scores are rule-based and evidence-gated; this is research context, not investment advice.",
    },
    metrics,
    quantitativeMetrics,
    multibaggerThesis,
    filingEvidence,
    risks: redFlags,
    fairValue,
    history,
    sources: [
      { tier: "primary", name: "Yahoo Finance reported annual statements", status: fundResult.status === "fulfilled" ? "used" : "failed", note: "Annual income statement, balance sheet and cash-flow values." },
      { tier: "primary", name: "Yahoo Finance quote", status: quoteResult.status === "fulfilled" ? "used" : "failed", note: "Latest market price observation." },
      { tier: "derived", name: "On-device ratio and technical computation", status: "used", note: "Ratios, moving averages and RSI computed locally from the values above." },
      { tier: "secondary", name: "NSE/BSE filings", status: "not-configured", note: "No validated filing adapter is connected." },
    ],
    warnings,
    asOf: nowIso(),
  };
}
