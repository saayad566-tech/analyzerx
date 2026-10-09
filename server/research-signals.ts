import { analyzeFundamentals } from "./fundamental-analysis";

export type SignalAction = "RESEARCH_BUY_WINDOW" | "RESEARCH_SELL_RISK" | "NO_CONFIRMED_SIGNAL" | "UNAVAILABLE";

export type MultibaggerStrategyId = "buffett-munger" | "peter-lynch" | "canslim" | "greenblatt" | "fisher" | "small-cap-compounder";
type Candidate = { symbol: string; name: string; sector: string };

// This is the verified research universe currently supported by AnalyzerX. It is intentionally labelled as an available universe rather than the entire exchange universe until a complete licensed security-master is connected.
export const verifiedResearchUniverse: readonly Candidate[] = [
  { symbol: "ADANIENT", name: "Adani Enterprises", sector: "Diversified" },
  { symbol: "ADANIPORTS", name: "Adani Ports & SEZ", sector: "Infrastructure" },
  { symbol: "APOLLOHOSP", name: "Apollo Hospitals", sector: "Healthcare" },
  { symbol: "ASIANPAINT", name: "Asian Paints", sector: "Consumer" },
  { symbol: "AXISBANK", name: "Axis Bank", sector: "Financials" },
  { symbol: "BAJFINANCE", name: "Bajaj Finance", sector: "Financials" },
  { symbol: "BEL", name: "Bharat Electronics", sector: "Defence" },
  { symbol: "HDFCBANK", name: "HDFC Bank", sector: "Financials" },
  { symbol: "ICICIBANK", name: "ICICI Bank", sector: "Financials" },
  { symbol: "INFY", name: "Infosys", sector: "IT services" },
  { symbol: "LT", name: "Larsen & Toubro", sector: "Capital goods" },
  { symbol: "RELIANCE", name: "Reliance Industries", sector: "Diversified" },
  { symbol: "TATAMOTORS", name: "Tata Motors", sector: "Automobiles" },
  { symbol: "TCS", name: "Tata Consultancy Services", sector: "IT services" },
  { symbol: "TITAGARH", name: "Titagarh Rail Systems", sector: "Railways" },
  { symbol: "WAAREEENER", name: "Waaree Energies", sector: "Renewable energy" },
];

const strategyWeights: Record<MultibaggerStrategyId, { name: string; weights: Record<string, number> }> = {
  "buffett-munger": { name: "Buffett / Munger Quality", weights: { quality: 35, cashFlow: 25, growth: 15, valuation: 15, coverage: 10 } },
  "peter-lynch": { name: "Peter Lynch GARP", weights: { growth: 30, valuation: 25, quality: 15, catalysts: 15, coverage: 15 } },
  canslim: { name: "CANSLIM", weights: { growth: 25, momentum: 25, catalysts: 20, coverage: 15, quality: 15 } },
  greenblatt: { name: "Greenblatt Quality / Value", weights: { quality: 30, valuation: 35, cashFlow: 15, growth: 10, coverage: 10 } },
  fisher: { name: "Fisher Scuttlebutt", weights: { growth: 25, quality: 25, catalysts: 20, coverage: 15, cashFlow: 15 } },
  "small-cap-compounder": { name: "Small-Cap Compounder", weights: { growth: 25, cashFlow: 20, catalysts: 20, valuation: 15, quality: 10, coverage: 10 } },
};

function clamp(value: number, min = 0, max = 100) { return Math.max(min, Math.min(max, Math.round(value))); }
function trendScore(trend: string) { return /up|positive|bull/i.test(trend) ? 85 : /down|negative|bear/i.test(trend) ? 25 : 50; }
function actionFor(score: number, confidence: number): SignalAction {
  if (confidence < 55) return "NO_CONFIRMED_SIGNAL";
  if (score >= 78) return "RESEARCH_BUY_WINDOW";
  if (score <= 32) return "RESEARCH_SELL_RISK";
  return "NO_CONFIRMED_SIGNAL";
}

export function scoreMultibaggerStrategy(strategyId: MultibaggerStrategyId, metrics: Record<string, number>) {
  const weights = strategyWeights[strategyId]?.weights ?? strategyWeights["buffett-munger"].weights;
  const score = clamp(Object.entries(weights).reduce((total, [key, weight]) => total + (metrics[key] ?? 0) * weight / 100, 0));
  const matchedCriteria = Object.entries(metrics).filter(([key, value]) => (weights[key] ?? 0) > 0 && value >= 60).map(([key]) => key);
  const failedCriteria = Object.entries(metrics).filter(([key, value]) => (weights[key] ?? 0) > 0 && value < 60).map(([key]) => key);
  return { score, matchedCriteria, failedCriteria };
}

export async function getMultibaggerSignals(strategyId: MultibaggerStrategyId = "buffett-munger") {
  const strategy = strategyWeights[strategyId] ?? strategyWeights["buffett-munger"];
  const results = await Promise.allSettled(verifiedResearchUniverse.map(async (candidate) => {
    const report = await analyzeFundamentals(candidate.symbol);
    const institutional = report.institutionalReport;
    const technical = report.stockAnalysis.technical;
    const coverage = clamp(report.coverage.score);
    const categoryScore = (pattern: RegExp, fallback = 0) => { const item = report.categories.find((entry) => pattern.test(entry.key + entry.label)); return item ? clamp(item.score / Math.max(item.max, 1) * 100) : fallback; };
    const growth = categoryScore(/growth/i);
    const cashFlow = categoryScore(/cash|flow/i);
    const quality = clamp(report.categories.filter((item) => /profit|solvency|moat|management/i.test(item.key + item.label)).reduce((sum, item) => sum + item.score, 0) / Math.max(report.categories.filter((item) => /profit|solvency|moat|management/i.test(item.key + item.label)).reduce((sum, item) => sum + item.max, 0), 1) * 100);
    const momentum = trendScore(technical.trend);
    const upside = institutional.upsideDownsidePct;
    const valuation = upside !== null ? clamp(50 + upside / 2) : 40;
    const catalysts = clamp(Math.min(institutional.catalysts.length * 25, 100));
    const metrics = { growth, cashFlow, quality, momentum, valuation, catalysts, coverage };
    const scored = scoreMultibaggerStrategy(strategyId, metrics);
    const confidence = clamp(Math.min(coverage, institutional.confidenceScore ?? coverage));
    const action = actionFor(scored.score, confidence);
    const label = (key: string) => ({ growth: "Growth evidence", cashFlow: "Cash-flow quality", quality: "Quality / moat evidence", momentum: "Relative momentum", valuation: "Valuation discipline", catalysts: "Catalyst evidence", coverage: "Source coverage" }[key] ?? key);
    return { symbol: candidate.symbol, name: candidate.name, sector: candidate.sector, score: scored.score, action, confidence, freshness: institutional.freshness, strategyId, strategyName: strategy.name, matchedCriteria: scored.matchedCriteria.map(label), failedCriteria: scored.failedCriteria.map(label), framework: metrics, thesis: institutional.investmentView, catalysts: institutional.catalysts.slice(0, 3), risks: [...institutional.redFlags, ...report.risks].slice(0, 3), sources: report.sources.filter((source) => source.status === "used").map((source) => source.name), disclaimer: "Research signal only; not personalized investment advice or a guaranteed return forecast." };
  }));
  const signals = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  const sectorMap = new Map<string, typeof signals>();
  for (const signal of signals) sectorMap.set(signal.sector, [...(sectorMap.get(signal.sector) ?? []), signal]);
  const sectors = [...sectorMap.entries()].map(([sector, items]) => ({ sector, score: clamp(items.reduce((sum, item) => sum + item.score, 0) / items.length), confidence: clamp(items.reduce((sum, item) => sum + item.confidence, 0) / items.length), companies: items.map((item) => item.symbol), interpretation: `Strategy-weighted research score for ${strategy.name}; not a claim of future sector returns.` })).sort((a, b) => b.score - a.score);
  return { generatedAt: new Date().toISOString(), strategyId, strategyName: strategy.name, universeSize: verifiedResearchUniverse.length, screenedCount: signals.length, methodology: Object.entries(strategy.weights).map(([key, weight]) => `${key} ${weight}%`).join(" · "), signals: signals.sort((a, b) => b.score - a.score), sectors };
}

async function fetchYahooChart(symbol: string) {
  const url = new URL("https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(symbol));
  url.searchParams.set("range", "6mo"); url.searchParams.set("interval", "1d");
  const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "AnalyzerX/1.0" }, signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`Yahoo chart returned HTTP ${response.status}`);
  const payload = await response.json() as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number }; indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> } };
  const result = payload.chart?.result?.[0]; const closes = result?.indicators?.quote?.[0]?.close?.filter((value): value is number => typeof value === "number" && Number.isFinite(value)) ?? [];
  const current = typeof result?.meta?.regularMarketPrice === "number" ? result.meta.regularMarketPrice : closes.at(-1) ?? null;
  const start = closes[0] ?? null; const changePct = current !== null && start ? (current / start - 1) * 100 : null;
  return { symbol, current, changePct, points: closes.length, source: "Yahoo Finance chart fallback", fetchedAt: new Date().toISOString() };
}

export async function getMultiAssetTimingSignals() {
  const assets = [
    { key: "NIFTY", symbol: "^NSEI", name: "Nifty 50", type: "index" },
    { key: "GOLD", symbol: "GC=F", name: "Gold futures proxy", type: "commodity" },
    { key: "BTC", symbol: "BTC-USD", name: "Bitcoin", type: "crypto" },
  ];
  const results = await Promise.allSettled(assets.map(async (asset) => {
    const chart = await fetchYahooChart(asset.symbol);
    const change = chart.changePct ?? 0;
    const score = clamp(50 + change * 1.5);
    const action: SignalAction = score >= 70 ? "RESEARCH_BUY_WINDOW" : score <= 30 ? "RESEARCH_SELL_RISK" : "NO_CONFIRMED_SIGNAL";
    return { ...asset, score, action, confidence: chart.points >= 60 ? 60 : 35, price: chart.current, changePct: chart.changePct, freshness: chart.fetchedAt, source: chart.source, risk: "Trend-only public chart context; no personalized position size or execution instruction." };
  }));
  return { generatedAt: new Date().toISOString(), signals: results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []), unavailable: results.flatMap((result, index) => result.status === "rejected" ? [{ asset: assets[index].key, error: String(result.reason) }] : []) };
}
