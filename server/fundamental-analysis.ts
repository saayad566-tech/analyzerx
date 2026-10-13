import { callIndiaStockMcpTool } from "./india-stock-mcp";

import { runProvidersInParallel } from "./parallel-providers";
import { fetchIndianOpenStock, normalizeIndianOpenQuote } from "./indian-open-api";
import { calculateQuantitativeMetrics, type QuantitativeMetric } from "./quantitative-metrics";
import { buildMultibaggerThesis, type MultibaggerThesis } from "./multibagger-thesis";
import { extractFilingEvidence, type FilingEvidence } from "./filing-evidence";
import { classifyMarketCap, getMarketCapConvention, marketCapBandLabel, type MarketCapBand } from "../lib/market-cap";
import { difference, percentChange, percentOf, product, quotient, ratio, sumValid } from "../lib/precision";

type Basis = "reported" | "derived" | "estimated" | "unavailable";

type Metric = { value: number; basis: Exclude<Basis, "unavailable">; source: string; period?: string };
export type TrendPoint = { period: string; value: number; basis: Exclude<Basis, "unavailable">; source: string };
export type HistoricalTrends = { revenue: TrendPoint[]; eps: TrendPoint[]; cashFlow: TrendPoint[] };

type RawFundamentals = {
  price?: number;
  marketCap?: number;
  pe?: number;
  priceToBook?: number;
  roe?: number;
  roa?: number;
  debtToEquity?: number;
  profitMargin?: number;
  revenueGrowth?: number;
  earningsGrowth?: number;
  operatingCashFlow?: number;
  freeCashFlow?: number;
  capitalExpenditures?: number;
  netIncome?: number;
  eps?: number;
  sharesOutstanding?: number;
  netDebt?: number;
  totalDebt?: number;
  totalAssets?: number;
  totalEquity?: number;
  interestExpense?: number;
  currentAssets?: number;
  currentLiabilities?: number;
  quickAssets?: number;
  interestCoverage?: number;
  currentRatio?: number;
  quickRatio?: number;
  promoterHolding?: number;
  promoterPledge?: number;
  grossMargin?: number;
  operatingMargin?: number;
  revenue?: number;
  sector?: string;
  companyName?: string;
  exchange?: string;
  currency?: string;
  country?: string;
  history?: HistoricalTrends;
  priceSeries?: number[];
  volume?: number;
  high52?: number;
  low52?: number;
  businessSummary?: string;
  website?: string;
  employees?: number;
  bookValue?: number;
  dividendYield?: number;
  payoutRatio?: number;
  roce?: number;
  roic?: number;
  filingSourceUrl?: string;
  filingPeriod?: string;
  currentScope?: string;
  futurePlans?: string;
  employeesSource?: string;
  employeesPeriod?: string;
};

export type ResearchScenario = { label: "Bull" | "Base" | "Bear"; assumptions: string[]; fairValue: number | null; probability: number; severity: "low" | "medium" | "high" };

export type CoverageSection = { key: string; label: string; score: number; max: number; basis: Basis; status: "verified" | "estimated" | "partial" | "unavailable"; note: string };

export type FundamentalAnalysis = {
  requestedSymbol: string;
  resolvedSymbol: string;
  companyName: string;
  market: { exchange: string; currency: string; country: string; primaryFocus: boolean };
  marketCap: { value: number | null; band: MarketCapBand; label: string; currency: string; convention: ReturnType<typeof getMarketCapConvention>; basis: "reported" | "unavailable" };
  redirect: { from: string; to: string; reason: string } | null;
  score: number;
  verdict: string;
  coverage: { score: number; label: "High" | "Moderate" | "Limited"; verified: number; estimated: number; unavailable: number; sections: CoverageSection[] };
  categories: Array<{ key: string; label: string; score: number; max: number; basis: Basis; evidence: string[] }>;
  qualitative: { businessModel: string; moat: string; management: string; currentScope: string; futurePlans: string; basis: Basis };
  institutionalReport: {
    rating: "Exceptional" | "Strong" | "Good" | "Neutral" | "Weak" | "High Risk";
    investmentView: "Bullish" | "Moderately Bullish" | "Neutral" | "Moderately Bearish" | "Bearish";
    confidenceScore: number;
    currentVsFairValuePct: number | null;
    upsideDownsidePct: number | null;
    probabilityWeightedFairValue: number | null;
    outlook12to24m: string;
    positives: string[];
    weaknesses: string[];
    catalysts: string[];
    redFlags: string[];
    thesisBullishWhen: string[];
    thesisInvalidation: string[];
    scenarios: ResearchScenario[];
    scoreWeights: Array<{ key: string; label: string; score: number; max: number; calculation: string }>;
    freshness: string;
    sourceHierarchy: string[];
  };
  researchLogic: {
    methodology: string[];
    evidenceUsed: string[];
    evidenceGaps: string[];
    contradictions: string[];
    decisionRules: string[];
    nextResearchQuestions: string[];
  };
  stockAnalysis: {
    profile: { businessSummary: string; currentScope: string; futurePlans: string; sector: string; exchange: string; country: string; website: string; employees: number | null; employeesSource: string; basis: Basis };
    technical: { trend: "Bullish" | "Neutral" | "Bearish" | "Unavailable"; currentPrice: number | null; sma20: number | null; sma50: number | null; rsi14: number | null; high52: number | null; low52: number | null; oneYearChangePct: number | null; basis: Basis; note: string };
    ownership: { promoterHolding: number | null; promoterPledge: number | null; status: string; basis: Basis; note: string };
    filings: { status: "available" | "partial" | "unavailable"; note: string; nextCheck: string };
    valuation: { pe: number; priceToBook: number; currentVsFairValuePct: number | null; note: string };
    conclusion: string;
  };
  metrics: Record<string, Metric>;
  quantitativeMetrics: Record<string, QuantitativeMetric>;
  multibaggerThesis: MultibaggerThesis;
  filingEvidence: FilingEvidence;
  risks: string[];
  fairValue: { lowMultiple: number; baseMultiple: number; highMultiple: number; lowValue: number | null; baseValue: number | null; highValue: number | null; currentPrice: number | null; currency: string; basis: Basis; note: string; dcf: { valuePerShare: number | null; basis: Basis; note: string } };
  history: HistoricalTrends;
  sources: Array<{ tier: "primary" | "secondary" | "web-fallback" | "derived"; name: string; status: "used" | "failed" | "not-configured"; note: string }>;
  warnings: string[];
  asOf: string;
};

const corporateAliases: Record<string, { symbol: string; reason: string }> = {
  TATAMOTORS: { symbol: "TMCV", reason: "The legacy Tata Motors identifier was split into separate listed entities after the 2025 demerger. This report resolves to Tata Motors Ltd (commercial vehicles, TMCV); Tata Motors Passenger Vehicles is separately listed as TMPV." },
  TATASTBLSL: { symbol: "TATASTEEL", reason: "Legacy Tata Steel BSL identifier; analysis is redirected to the active Tata Steel entity." },
  TATASTLBSL: { symbol: "TATASTEEL", reason: "Legacy Tata Steel BSL identifier; analysis is redirected to the active Tata Steel entity." },
  TATASTEELBSL: { symbol: "TATASTEEL", reason: "Legacy Tata Steel BSL identifier; analysis is redirected to the active Tata Steel entity." },
};

const sectorBaselines: Record<string, RawFundamentals> = {
  "Indian equities": { roe: 12, roa: 5, debtToEquity: 0.8, profitMargin: 8, revenueGrowth: 10, earningsGrowth: 10, pe: 22, priceToBook: 3 },
  "Capital goods": { roe: 14, roa: 6, debtToEquity: 0.6, profitMargin: 9, revenueGrowth: 12, earningsGrowth: 12, pe: 24, priceToBook: 3.2 },
  "Financials": { roe: 13, roa: 1.5, debtToEquity: 5, profitMargin: 18, revenueGrowth: 12, earningsGrowth: 12, pe: 18, priceToBook: 2.2 },
  "IT services": { roe: 18, roa: 12, debtToEquity: 0.2, profitMargin: 18, revenueGrowth: 11, earningsGrowth: 12, pe: 25, priceToBook: 5 },
  "Renewable energy": { roe: 11, roa: 5, debtToEquity: 1, profitMargin: 8, revenueGrowth: 15, earningsGrowth: 14, pe: 28, priceToBook: 3.5 },
  "Global equities": { roe: 14, roa: 8, debtToEquity: 0.7, profitMargin: 12, revenueGrowth: 10, earningsGrowth: 10, pe: 24, priceToBook: 4 },
};

function number(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/,/g, "").replace(/%/g, "").replace(/₹|INR/gi, "").trim();
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function positiveNumber(value: unknown): number | undefined {
  const parsed = number(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}

function findNumber(value: unknown, keys: string[], depth = 0): number | undefined {
  if (depth > 5 || value === null || value === undefined) return undefined;
  if (Array.isArray(value)) {
    for (const item of value) { const found = findNumber(item, keys, depth + 1); if (found !== undefined) return found; }
    return undefined;
  }
  if (typeof value !== "object") return undefined;
  const object = value as Record<string, unknown>;
  for (const key of keys) {
    for (const candidate of Object.keys(object)) {
      if (candidate.toLowerCase().replace(/[^a-z0-9]/g, "") === key.toLowerCase().replace(/[^a-z0-9]/g, "")) {
        const direct = number(object[candidate]);
        if (direct !== undefined) return direct;
        const nested = findNumber(object[candidate], keys, depth + 1);
        if (nested !== undefined) return nested;
      }
    }
  }
  for (const child of Object.values(object)) { const found = findNumber(child, keys, depth + 1); if (found !== undefined) return found; }
  return undefined;
}

function findText(value: unknown, keys: string[], depth = 0): string | undefined {
  if (depth > 5 || value === null || value === undefined) return undefined;
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) { for (const item of value) { const found = findText(item, keys, depth + 1); if (found) return found; } return undefined; }
  if (typeof value !== "object") return undefined;
  const object = value as Record<string, unknown>;
  for (const key of keys) { const candidate = Object.keys(object).find((name) => name.toLowerCase().replace(/[^a-z0-9]/g, "") === key.toLowerCase().replace(/[^a-z0-9]/g, "")); if (candidate) { const found = findText(object[candidate], keys, depth + 1); if (found) return found; } }
  return undefined;
}

function extractFundamentals(payload: unknown): RawFundamentals {
  return {
    price: positiveNumber(findNumber(payload, ["price", "currentPrice", "regularMarketPrice", "lastPrice"])),
    marketCap: positiveNumber(findNumber(payload, ["marketCap", "marketCapitalization"])),
    pe: findNumber(payload, ["pe", "trailingPE", "priceEarnings"]),
    priceToBook: findNumber(payload, ["priceToBook", "pb", "priceBook"]),
    roe: findNumber(payload, ["roe", "returnOnEquity"]),
    roa: findNumber(payload, ["roa", "returnOnAssets"]),
    debtToEquity: findNumber(payload, ["debtToEquity", "totalDebtPerTotalEquity"]),
    profitMargin: findNumber(payload, ["profitMargin", "netProfitMargin", "profitMargins"]),
    revenueGrowth: findNumber(payload, ["revenueGrowth", "salesGrowth", "revenueCagr"]),
    earningsGrowth: findNumber(payload, ["earningsGrowth", "epsGrowth", "profitGrowth"]),
    operatingCashFlow: findNumber(payload, ["operatingCashFlow", "cashFromOperatingActivities", "cfo"]),
    freeCashFlow: findNumber(payload, ["freeCashFlow", "fcf", "freeCashFlowToFirm"]),
    capitalExpenditures: findNumber(payload, ["capitalExpenditures", "capitalExpenditure", "capex"]),
    netIncome: findNumber(payload, ["netIncome", "profitAfterTax", "netProfit"]),
    eps: findNumber(payload, ["eps", "earningsPerShare", "trailingEps", "trailingEPS"]),
    sharesOutstanding: positiveNumber(findNumber(payload, ["sharesOutstanding", "ordinarySharesNumber"])),
    netDebt: findNumber(payload, ["netDebt", "totalDebtLessCash"]),
    totalDebt: findNumber(payload, ["totalDebt", "debt", "borrowings"]),
    totalAssets: findNumber(payload, ["totalAssets", "assets"]),
    totalEquity: findNumber(payload, ["totalEquity", "shareholdersEquity", "stockholdersEquity"]),
    interestExpense: findNumber(payload, ["interestExpense", "interest", "financeCost"]),
    currentAssets: findNumber(payload, ["currentAssets"]),
    currentLiabilities: findNumber(payload, ["currentLiabilities"]),
    quickAssets: findNumber(payload, ["quickAssets"]),
    interestCoverage: findNumber(payload, ["interestCoverage", "timesInterestEarned"]),
    currentRatio: findNumber(payload, ["currentRatio"]),
    quickRatio: findNumber(payload, ["quickRatio", "acidTestRatio"]),
    promoterHolding: findNumber(payload, ["promoterHolding", "insiderOwnership"]),
    promoterPledge: findNumber(payload, ["promoterPledge", "pledgedShares"]),
    grossMargin: findNumber(payload, ["grossMargin", "grossProfitMargin"]),
    operatingMargin: findNumber(payload, ["operatingMargin", "operatingProfitMargin"]),
    dividendYield: findNumber(payload, ["dividendYield", "trailingAnnualDividendYield"]),
    payoutRatio: findNumber(payload, ["payoutRatio", "payoutRatioTTM"]),
    roce: findNumber(payload, ["roce", "returnOnCapitalEmployed"]),
    roic: findNumber(payload, ["roic", "returnOnInvestedCapital"]),
    revenue: findNumber(payload, ["revenue", "totalRevenue", "sales"]),
    sector: findText(payload, ["sector", "industry"]),
    bookValue: findNumber(payload, ["bookValue", "bookValuePerShare"]),
    companyName: findText(payload, ["companyName", "longName", "shortName", "name"]),
    businessSummary: findText(payload, ["businessSummary", "description", "longBusinessSummary"]),
    website: findText(payload, ["website", "weburl", "url"]),
    employees: positiveNumber(findNumber(payload, ["employees", "fullTimeEmployees", "employeeCount"])),
    currentScope: findText(payload, ["currentScope", "businessScope", "operations", "businessSegments"]),
    futurePlans: findText(payload, ["futurePlans", "forwardLooking", "outlook", "guidance"]),
  };
}

function mergeRaw(base: RawFundamentals, next: RawFundamentals): RawFundamentals {
  const result: RawFundamentals = { ...base };
  const mustBePositive = new Set<keyof RawFundamentals>(["price", "marketCap", "sharesOutstanding"]);
  for (const key of Object.keys(next) as Array<keyof RawFundamentals>) {
    const candidate = next[key];
    if (result[key] !== undefined || candidate === undefined) continue;
    if (mustBePositive.has(key) && (!(typeof candidate === "number") || candidate <= 0)) continue;
    Object.assign(result, { [key]: candidate });
  }
  return result;
}

async function fetchFinnhubGlobal(symbol: string): Promise<RawFundamentals> {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) throw new Error("Finnhub global provider is not configured");
  const request = async (path: string) => {
    const url = new URL(`https://finnhub.io/api/v1/${path}`);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("token", token);
    const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "MarketEventIntelligence/1.0" }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Finnhub returned HTTP ${response.status} for ${path}`);
    return response.json() as Promise<Record<string, unknown>>;
  };
  const endpointResults = await Promise.allSettled([request("stock/profile2"), request("quote"), request("stock/metric?metric=all")]);
  const profile = endpointResults[0].status === "fulfilled" ? endpointResults[0].value : {};
  const quote = endpointResults[1].status === "fulfilled" ? endpointResults[1].value : {};
  const metric = endpointResults[2].status === "fulfilled" ? endpointResults[2].value : {};
  if (endpointResults.every((result) => result.status === "rejected")) {
    throw new Error(endpointResults.map((result) => result.status === "rejected" ? String(result.reason) : "").filter(Boolean).join("; ") || "Finnhub endpoints unavailable");
  }
  const metricValues = (metric.metric && typeof metric.metric === "object" ? metric.metric : {}) as Record<string, unknown>;
  const metricNumber = (...keys: string[]) => keys.map((key) => number(metricValues[key])).find((value): value is number => value !== undefined);
  return {
    companyName: typeof profile.name === "string" ? profile.name : undefined,
    exchange: typeof profile.exchange === "string" ? profile.exchange : undefined,
    currency: typeof profile.currency === "string" ? profile.currency : undefined,
    country: typeof profile.country === "string" ? profile.country : undefined,
    sector: typeof profile.finnhubIndustry === "string" ? profile.finnhubIndustry : undefined,
    price: number(quote.c),
    pe: metricNumber("peBasicExclExtraTTM", "peTTM"),
    roe: metricNumber("roeTTM", "roeAnnual"),
    roa: metricNumber("roaTTM", "roaAnnual"),
    debtToEquity: metricNumber("totalDebt/totalEquityAnnual", "debtEquityTTM"),
    profitMargin: metricNumber("netMarginTTM", "netMarginAnnual"),
    grossMargin: metricNumber("grossMarginTTM", "grossMarginAnnual"),
    operatingMargin: metricNumber("operatingMarginTTM", "operatingMarginAnnual"),
    revenueGrowth: metricNumber("revenueGrowth3Y", "revenueGrowthTTM"),
    earningsGrowth: metricNumber("epsGrowth3Y", "epsGrowthTTM"),
    priceToBook: metricNumber("pbAnnual", "pbQuarterly"),
    dividendYield: metricNumber("dividendYieldIndicatedAnnual", "dividendYieldTTM"),
    payoutRatio: metricNumber("payoutRatioTTM", "payoutRatioAnnual"),
    roce: metricNumber("roceTTM", "roceAnnual"),
    roic: metricNumber("roicTTM", "roicAnnual"),
  };
}

async function fetchPrimary(symbol: string): Promise<RawFundamentals> {
  const token = process.env.INDIAN_API_KEY;
  if (!token) throw new Error("Indian API is not configured");
  const baseUrl = process.env.INDIAN_API_BASE_URL ?? "https://stock.indianapi.in";
  const url = new URL("/stock", baseUrl);
  url.searchParams.set("name", symbol);
  const response = await fetch(url, { headers: { Accept: "application/json", "X-Api-Key": token }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Indian API returned HTTP ${response.status}`);
  return extractFundamentals(await response.json());
}

async function fetchSecondary(symbol: string): Promise<RawFundamentals> {
  const results = await Promise.allSettled([
    callIndiaStockMcpTool("get_fundamentals", { symbol }),
    callIndiaStockMcpTool("get_quote", { symbol }),
  ]);
  const fulfilled = results.filter((result): result is PromiseFulfilledResult<unknown> => result.status === "fulfilled");
  if (!fulfilled.length) {
    throw new Error(results.map((result) => result.status === "rejected" ? String(result.reason) : "").filter(Boolean).join("; ") || "India Stock MCP endpoints unavailable");
  }
  return fulfilled.reduce((merged, result) => mergeRaw(merged, extractFundamentals(result.value)), {} as RawFundamentals);
}

function extractScreenerNumber(html: string, label: string): number | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
  const pattern = new RegExp(`${escaped}[\\s\\S]{0,260}?class=[\\\"']number[\\\"'][^>]*>([0-9,.-]+)<`, "i");
  const match = html.match(pattern);
  return match ? number(match[1]) : undefined;
}

function emptyHistoricalTrends(): HistoricalTrends { return { revenue: [], eps: [], cashFlow: [] }; }

function extractHistoricalSeries(html: string, label: string, source: string): TrendPoint[] {
  const table = html.split("<table").slice(1).map((part) => part.split("</table>")[0]).find((part) => part.toLowerCase().includes(label.toLowerCase()));
  if (!table) return [];
  const headerPattern = new RegExp('data-date-key="([^"]+)"[^>]*>([\\s\\S]*?)</th>', "gi");
  const headers = [...table.matchAll(headerPattern)].map((match) => ({ date: match[1], label: match[2].replace(/<[^>]+>/g, "").trim() }));
  const row = table.split("<tr").slice(1).map((part) => part.split("</tr>")[0]).find((part) => part.toLowerCase().includes(label.toLowerCase()));
  if (!row) return [];
  const valuePattern = new RegExp("<td[^>]*>" + "[\\t\\n\\r ]*" + "([0-9,.-]+)" + "[\\t\\n\\r ]*</td>", "gi");
  const values = [...row.matchAll(valuePattern)].map((match) => number(match[1])).filter((value): value is number => value !== undefined);
  const aligned = headers.slice(-values.length);
  return aligned.map((header, index) => ({ period: header.label || header.date.slice(0, 4), value: values[index], basis: "reported" as const, source })).filter((point) => Number.isFinite(point.value));
}

function extractSection(html: string, sectionId: string) {
  const start = html.indexOf(`id="${sectionId}"`);
  if (start < 0) return "";
  const next = html.indexOf("<section", start + 10);
  return html.slice(start, next > start ? next : html.length);
}

function latest(series: TrendPoint[]) {
  return series.at(-1)?.value;
}

function growthCagr(series: TrendPoint[], years: number) {
  if (series.length < years + 1) return undefined;
  const start = series.at(-(years + 1))?.value;
  const end = series.at(-1)?.value;
  if (start === undefined || end === undefined || start <= 0 || end <= 0) return undefined;
  // Ratio is computed exactly; only the fractional-year root uses a float power.
  const growthRatio = ratio(end, start);
  if (growthRatio === null || growthRatio <= 0) return undefined;
  return (growthRatio ** (1 / years) - 1) * 100;
}

function extractShareholdingLatest(section: string, label: string) {
  const start = section.toLowerCase().indexOf(label.toLowerCase());
  if (start < 0) return undefined;
  const nextLabels = ["Promoters", "FIIs", "DIIs", "Public"].filter((candidate) => candidate.toLowerCase() !== label.toLowerCase()).map((candidate) => section.toLowerCase().indexOf(candidate.toLowerCase(), start + label.length)).filter((index) => index > start);
  const end = nextLabels.length ? Math.min(...nextLabels) : section.length;
  const segment = section.slice(start, end);
  const values = [...segment.matchAll(/([0-9]+(?:\.[0-9]+)?)\s*%/g)].map((match) => number(match[1])).filter((value): value is number => value !== undefined);
  return values.at(-1);
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

async function fetchScreenerFallback(symbol: string): Promise<RawFundamentals> {
  const screenerSymbol = symbol.replace(/\.(NS|BO)$/i, "");
  const response = await fetch(`https://www.screener.in/company/${encodeURIComponent(screenerSymbol)}/consolidated/`, { headers: { Accept: "text/html", "User-Agent": "MarketEventIntelligence/1.0" }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Screener.in returned HTTP ${response.status}`);
  const html = await response.text();
  if (!html.includes("Stock P/E") && !html.includes("ROCE") && !html.includes("Profit & Loss")) throw new Error("Screener.in page did not contain expected public metric labels");
  const source = "Screener.in public consolidated financials";
  const pl = extractSection(html, "profit-loss");
  const balance = extractSection(html, "balance-sheet");
  const cash = extractSection(html, "cash-flow");
  const shareholding = extractSection(html, "shareholding");
  const revenueHistory = extractHistoricalSeries(pl, "Sales", source);
  const epsHistory = extractHistoricalSeries(pl, "EPS in Rs", source);
  const netIncomeHistory = extractHistoricalSeries(pl, "Net Profit", source);
  const operatingProfitHistory = extractHistoricalSeries(pl, "Operating Profit", source);
  const cfoHistory = extractHistoricalSeries(cash, "Cash from Operating Activity", source);
  const fcfHistory = extractHistoricalSeries(cash, "Free Cash Flow", source);
  const debtHistory = extractHistoricalSeries(balance, "Borrowings", source);
  const assetHistory = extractHistoricalSeries(balance, "Total Assets", source);
  const reservesHistory = extractHistoricalSeries(balance, "Reserves", source);
  const equityCapitalHistory = extractHistoricalSeries(balance, "Equity Capital", source);
  const interestHistory = extractHistoricalSeries(pl, "Interest", source);
  const roceHistory = extractHistoricalSeries(balance + pl, "ROCE %", source);
  const promoterHistory = extractHistoricalSeries(shareholding, "Promoters", source);
  const promoterHolding = extractShareholdingLatest(shareholding, "Promoters") ?? latest(promoterHistory);
  const currentPrice = positiveNumber(extractScreenerNumber(html, "Current Price"));
  const bookValue = positiveNumber(extractScreenerNumber(html, "Book Value"));
  const marketCap = positiveNumber(extractScreenerNumber(html, "Market Cap"));
  const pagePe = positiveNumber(extractScreenerNumber(html, "Stock P/E"));
  const pageRoe = extractScreenerNumber(html, "ROE");
  const roce = extractScreenerNumber(html, "ROCE") ?? latest(roceHistory);
  const revenue = latest(revenueHistory);
  const netIncome = latest(netIncomeHistory);
  const operatingCashFlow = latest(cfoHistory);
  const freeCashFlow = latest(fcfHistory);
  const totalDebt = latest(debtHistory);
  const totalAssets = latest(assetHistory);
  const equity = (latest(reservesHistory) ?? 0) + (latest(equityCapitalHistory) ?? 0) || undefined;
  const interestExpense = latest(interestHistory);
  const operatingProfit = latest(operatingProfitHistory);
  // Screener market cap is commonly expressed in INR crore units; do not derive shares outstanding from it without an explicit unit contract.
  const sharesOutstanding = undefined;
  const eps = latest(epsHistory);
  const pe = currentPrice !== undefined && eps !== undefined && eps > 0 ? quotient(currentPrice, eps) ?? pagePe : pagePe;
  const roe = netIncome !== undefined && equity ? percentOf(netIncome, equity) ?? pageRoe : pageRoe;
  const website = html.match(/<a[^>]+href=["'](https?:\/\/(?:www\.)?adani\.com[^"']*)["']/i)?.[1] ?? undefined;
  const about = html.match(/id=["']company-info["'][\s\S]{0,5000}?<p[^>]*>([\s\S]*?)<\/p>/i)?.[1];
  const history = { revenue: revenueHistory, eps: epsHistory, cashFlow: cfoHistory };
  return {
    price: currentPrice,
    marketCap,
    pe,
    priceToBook: currentPrice && bookValue ? quotient(currentPrice, bookValue) ?? undefined : undefined,
    roe,
    roce,
    roa: netIncome !== undefined && totalAssets ? percentOf(netIncome, totalAssets) ?? undefined : undefined,
    debtToEquity: totalDebt !== undefined && equity ? quotient(totalDebt, equity) ?? undefined : undefined,
    profitMargin: netIncome !== undefined && revenue ? percentOf(netIncome, revenue) ?? undefined : undefined,
    operatingMargin: operatingProfit !== undefined && revenue ? percentOf(operatingProfit, revenue) ?? undefined : undefined,
    revenueGrowth: growthCagr(revenueHistory, 3) ?? growthCagr(revenueHistory, 5),
    earningsGrowth: growthCagr(netIncomeHistory, 3) ?? growthCagr(epsHistory, 3),
    operatingCashFlow,
    freeCashFlow,
    capitalExpenditures: operatingCashFlow !== undefined && freeCashFlow !== undefined ? Math.max(0, difference(operatingCashFlow, freeCashFlow) ?? 0) : undefined,
    netIncome,
    eps,
    sharesOutstanding,
    totalDebt,
    totalAssets,
    totalEquity: equity,
    interestExpense,
    interestCoverage: operatingProfit !== undefined && interestExpense && interestExpense > 0 ? quotient(operatingProfit, interestExpense) ?? undefined : undefined,
    promoterHolding,
    bookValue,
    companyName: html.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1]?.trim(),
    businessSummary: about ? stripHtml(about) : undefined,
    website,
    exchange: "NSE",
    currency: "INR",
    country: "India",
    sector: "Indian listed company",
    filingSourceUrl: screenerSymbol === "ADANIENT" ? "https://www.adanienterprises.com/investors/investor-downloads" : `https://www.screener.in/company/${encodeURIComponent(screenerSymbol)}/consolidated/`,
    filingPeriod: revenueHistory.at(-1)?.period,
    history,
    priceSeries: undefined,
  };
}

async function fetchIndianOpenFundamentals(symbol: string): Promise<RawFundamentals> {
  const payload = await fetchIndianOpenStock(symbol);
  const normalized = normalizeIndianOpenQuote(payload);
  const price = normalized.quote.current ?? undefined;
  const bookValue = normalized.fundamentals.bookValue ?? undefined;
  return {
    price,
    pe: normalized.fundamentals.pe ?? undefined,
    priceToBook: price !== undefined && bookValue !== undefined && bookValue !== 0 ? price / bookValue : undefined,
    sector: normalized.fundamentals.sector ?? undefined,
    companyName: normalized.fundamentals.companyName ?? undefined,
    revenue: undefined,
    netIncome: undefined,
  };
}

async function fetchYahooFundamentalsTimeseries(yahooSymbol: string): Promise<RawFundamentals> {
  const types = ["annualTotalRevenue", "annualDilutedEPS", "annualOperatingCashFlow", "annualFreeCashFlow", "annualNetIncome", "annualTotalDebt", "annualStockholdersEquity", "annualCapitalExpenditure"].join(",");
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - 7 * 365 * 24 * 60 * 60;
  const url = new URL(`https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(yahooSymbol)}`);
  url.searchParams.set("symbol", yahooSymbol);
  url.searchParams.set("type", types);
  url.searchParams.set("period1", String(period1));
  url.searchParams.set("period2", String(period2));
  url.searchParams.set("merge", "false");
  const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "MarketEventIntelligence/1.0" }, signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`Yahoo fundamentals returned HTTP ${response.status} for ${yahooSymbol}`);
  const payload = await response.json() as { timeseries?: { result?: Array<Record<string, unknown>> } };
  const results = payload.timeseries?.result ?? [];
  const series = (key: string, source = "Yahoo Finance fundamentals timeseries"): TrendPoint[] => {
    const row = results.find((item) => Array.isArray(item[key]));
    const values = Array.isArray(row?.[key]) ? row[key] as Array<Record<string, unknown>> : [];
    const points: TrendPoint[] = [];
    for (const item of values) {
      const timestamp = number(item.timestamp);
      const period = typeof item.asOfDate === "string" ? item.asOfDate.slice(0, 10) : timestamp ? new Date(timestamp * 1000).getUTCFullYear().toString() : "Annual";
      const reportedValue = item.reportedValue && typeof item.reportedValue === "object" ? item.reportedValue as Record<string, unknown> : undefined;
      const value = number(reportedValue?.raw) ?? number(item.raw) ?? number(item.value);
      if (value !== undefined) points.push({ period, value, basis: "reported", source });
    }
    return points.sort((a, b) => a.period.localeCompare(b.period));
  };
  const revenueHistory = series("annualTotalRevenue");
  const epsHistory = series("annualDilutedEPS");
  const cashFlowHistory = series("annualOperatingCashFlow");
  const fcfHistory = series("annualFreeCashFlow");
  const netIncomeHistory = series("annualNetIncome");
  const debtHistory = series("annualTotalDebt");
  const equityHistory = series("annualStockholdersEquity");
  const capexHistory = series("annualCapitalExpenditure");
  const revenue = revenueHistory.at(-1)?.value;
  const eps = epsHistory.at(-1)?.value;
  const operatingCashFlow = cashFlowHistory.at(-1)?.value;
  const freeCashFlow = fcfHistory.at(-1)?.value;
  const netIncome = netIncomeHistory.at(-1)?.value;
  const totalDebt = debtHistory.at(-1)?.value;
  const totalEquity = equityHistory.at(-1)?.value;
  const capitalExpenditures = capexHistory.at(-1)?.value ?? (operatingCashFlow !== undefined && freeCashFlow !== undefined ? operatingCashFlow - freeCashFlow : undefined);
  return { revenue, eps, operatingCashFlow, freeCashFlow, netIncome, totalDebt, totalEquity, capitalExpenditures, revenueGrowth: growthCagr(revenueHistory, 3) ?? growthCagr(revenueHistory, 5), earningsGrowth: growthCagr(epsHistory, 3) ?? growthCagr(netIncomeHistory, 3), history: { revenue: revenueHistory, eps: epsHistory, cashFlow: cashFlowHistory }, filingSourceUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(yahooSymbol)}/financials`, filingPeriod: revenueHistory.at(-1)?.period };
}

type SecTickerRecord = { cik_str?: number; ticker?: string; title?: string };
let secTickerMapPromise: Promise<Record<string, SecTickerRecord>> | null = null;

async function fetchSecTickerMap(): Promise<Record<string, SecTickerRecord>> {
  if (!secTickerMapPromise) {
    secTickerMapPromise = fetch("https://www.sec.gov/files/company_tickers.json", {
      headers: { Accept: "application/json", "User-Agent": "MarketEventIntelligence/1.0 research" },
      signal: AbortSignal.timeout(8_000),
    }).then(async (response) => {
      if (!response.ok) throw new Error(`SEC ticker map returned HTTP ${response.status}`);
      return response.json() as Promise<Record<string, SecTickerRecord>>;
    });
  }
  return secTickerMapPromise;
}

function secSeries(facts: Record<string, unknown>, tags: string[], unit: string, source: string): TrendPoint[] {
  for (const tag of tags) {
    const concept = facts[tag] as { units?: Record<string, Array<Record<string, unknown>>> } | undefined;
    const values = concept?.units?.[unit];
    if (!Array.isArray(values)) continue;
    const points = values
      .filter((item) => ["10-K", "20-F", "40-F"].includes(String(item.form)) && typeof item.fy === "number" && typeof item.val === "number")
      .map((item) => ({ period: String(item.fy), value: Number(item.val), basis: "reported" as const, source }))
      .filter((item) => Number.isFinite(item.value));
    const deduped = [...new Map(points.map((item) => [item.period, item])).values()];
    if (deduped.length) return deduped.sort((a, b) => a.period.localeCompare(b.period)).slice(-7);
  }
  return [];
}

async function fetchSecCompanyFacts(symbol: string): Promise<RawFundamentals> {
  const baseSymbol = symbol.replace(/\.(NS|BO)$/i, "").toUpperCase();
  const tickerMap = await fetchSecTickerMap();
  const record = Object.values(tickerMap).find((item) => item.ticker?.toUpperCase() === baseSymbol);
  if (!record?.cik_str) throw new Error(`SEC Company Facts has no ticker mapping for ${baseSymbol}`);
  const cik = String(record.cik_str).padStart(10, "0");
  const response = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, {
    headers: { Accept: "application/json", "User-Agent": "MarketEventIntelligence/1.0 research" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`SEC Company Facts returned HTTP ${response.status} for ${baseSymbol}`);
  const payload = await response.json() as { entityName?: string; facts?: Record<string, Record<string, unknown>> };
  const facts = Object.values(payload.facts ?? {}).reduce((merged, namespace) => ({ ...merged, ...namespace }), {} as Record<string, unknown>);
  const source = `SEC EDGAR Company Facts (CIK ${cik})`;
  const revenue = secSeries(facts, ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"], "USD", source);
  const eps = secSeries(facts, ["EarningsPerShareDiluted", "EarningsPerShareBasic"], "USD/shares", source);
  const cashFlow = secSeries(facts, ["NetCashProvidedByUsedInOperatingActivities"], "USD", source);
  const netIncome = secSeries(facts, ["NetIncomeLoss", "ProfitLoss"], "USD", source);
  const assets = secSeries(facts, ["Assets"], "USD", source);
  const equity = secSeries(facts, ["StockholdersEquity", "PartnersCapital"], "USD", source);
  const debt = secSeries(facts, ["LongTermDebtNoncurrent", "LongTermDebtCurrent", "DebtCurrent"], "USD", source);
  const capex = secSeries(facts, ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"], "USD", source);
  const shares = secSeries(facts, ["EntityCommonStockSharesOutstanding"], "shares", source);
  const latestCfo = cashFlow.at(-1)?.value;
  const latestCapex = capex.at(-1)?.value;
  return {
    companyName: payload.entityName ?? record.title,
    country: "United States",
    exchange: "SEC filer",
    currency: "USD",
    revenue: revenue.at(-1)?.value,
    eps: eps.at(-1)?.value,
    operatingCashFlow: latestCfo,
    freeCashFlow: latestCfo !== undefined && latestCapex !== undefined ? difference(latestCfo, Math.abs(latestCapex)) ?? undefined : undefined,
    capitalExpenditures: latestCapex,
    netIncome: netIncome.at(-1)?.value,
    totalAssets: assets.at(-1)?.value,
    totalEquity: equity.at(-1)?.value,
    totalDebt: debt.at(-1)?.value,
    sharesOutstanding: shares.at(-1)?.value,
    revenueGrowth: growthCagr(revenue, 3) ?? growthCagr(revenue, 5),
    earningsGrowth: growthCagr(eps, 3) ?? growthCagr(netIncome, 3),
    history: { revenue, eps, cashFlow },
    filingSourceUrl: `https://data.sec.gov/submissions/CIK${cik}.json`,
    filingPeriod: revenue.at(-1)?.period ?? netIncome.at(-1)?.period,
  };
}

async function fetchPublicCompanyProfile(symbol: string): Promise<RawFundamentals> {
  const profileAliases: Record<string, string> = { AAPL: "Apple Inc.", SAP: "SAP SE", RELIANCE: "Reliance Industries", TCS: "Tata Consultancy Services", INFY: "Infosys", ADANIENT: "Adani Enterprises", TATAPOWER: "Tata Power", HDFCBANK: "HDFC Bank", APOLLOHOSP: "Apollo Hospitals", LT: "Larsen & Toubro" };
  const baseSymbol = symbol.replace(/\.(NS|BO|DE)$/i, "").toUpperCase();
  const query = profileAliases[baseSymbol] ?? baseSymbol.replace(/[-_]/g, " ");
  const searchUrl = new URL("https://en.wikipedia.org/w/api.php");
  searchUrl.searchParams.set("action", "opensearch");
  searchUrl.searchParams.set("search", query);
  searchUrl.searchParams.set("limit", "1");
  searchUrl.searchParams.set("namespace", "0");
  searchUrl.searchParams.set("format", "json");
  const searchResponse = await fetch(searchUrl, { headers: { Accept: "application/json", "User-Agent": "MarketEventIntelligence/1.0" }, signal: AbortSignal.timeout(6_000) });
  if (!searchResponse.ok) throw new Error(`Wikipedia profile search returned HTTP ${searchResponse.status}`);
  const searchPayload = await searchResponse.json() as unknown;
  const title = Array.isArray(searchPayload) && typeof searchPayload[1]?.[0] === "string" ? searchPayload[1][0] : undefined;
  if (!title) throw new Error(`No public profile result for ${symbol}`);
  const summaryResponse = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, { headers: { Accept: "application/json", "User-Agent": "MarketEventIntelligence/1.0" }, signal: AbortSignal.timeout(6_000) });
  if (!summaryResponse.ok) throw new Error(`Wikipedia profile summary returned HTTP ${summaryResponse.status}`);
  const summary = await summaryResponse.json() as { title?: string; extract?: string; content_urls?: { desktop?: { page?: string } } };
  if (!summary.extract) throw new Error(`Public profile summary was empty for ${symbol}`);
  let employees: number | undefined;
  let employeesPeriod: string | undefined;
  try {
    const htmlResponse = await fetch(`https://en.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(title)}`, { headers: { Accept: "text/html", "User-Agent": "MarketEventIntelligence/1.0" }, signal: AbortSignal.timeout(6_000) });
    if (htmlResponse.ok) {
      const html = await htmlResponse.text();
      const employeeMatch = html.match(/(?:num_employees|Number of employees|Employees)[\\s\\S]{0,900}?([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{4,7})/i);
      if (employeeMatch) {
        employees = number(employeeMatch[1]);
        const yearMatch = employeeMatch[0].match(/20[0-9]{2}/);
        employeesPeriod = yearMatch?.[0];
      }
    }
  } catch { /* profile summary remains useful when infobox retrieval is unavailable */ }
  return { companyName: summary.title, businessSummary: summary.extract, website: summary.content_urls?.desktop?.page, employees, employeesSource: employees !== undefined ? `Public company profile (${summary.title ?? title})` : undefined, employeesPeriod };
}

async function fetchWebFallback(symbol: string): Promise<RawFundamentals> {
  const indianNames = new Set(["RELIANCE", "TCS", "INFY", "TATAMOTORS", "TMCV", "TMPV", "TATAPOWER", "ADANIENT", "ADANIPORTS", "JIOFIN"]);
  const candidates = symbol.includes(".") ? [symbol] : indianNames.has(symbol) ? [`${symbol}.NS`, `${symbol}.BO`, symbol] : [symbol, `${symbol}.NS`];
  let lastError = "Yahoo chart returned no usable result";
  for (const yahooSymbol of candidates) {
    try {
      const url = new URL("https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(yahooSymbol));
      url.searchParams.set("range", "1y");
      url.searchParams.set("interval", "1mo");
      const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "MarketEventIntelligence/1.0" }, signal: AbortSignal.timeout(8_000) });
      if (!response.ok) { lastError = `Yahoo chart returned HTTP ${response.status} for ${yahooSymbol}`; continue; }
      const payload = await response.json() as { chart?: { result?: Array<{ meta?: Record<string, unknown>; indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> } };
      const result = payload.chart?.result?.[0];
      if (!result) continue;
      const closes = result.indicators?.quote?.[0]?.close?.filter((item): item is number => typeof item === "number" && Number.isFinite(item)) ?? [];
      const price = closes.at(-1) ?? number(result.meta?.regularMarketPrice);
      if (price === undefined) continue;
      const exchange = typeof result.meta?.exchangeName === "string" ? result.meta.exchangeName : undefined;
      const currency = typeof result.meta?.currency === "string" ? result.meta.currency : undefined;
      const companyName = typeof result.meta?.longName === "string" ? result.meta.longName.replace(/\s+/g, " ").trim() : undefined;
      const priceSeries = closes;
      const high52 = priceSeries.length ? Math.max(...priceSeries) : undefined;
      const low52 = priceSeries.length ? Math.min(...priceSeries) : undefined;
      let fundamentals: RawFundamentals = {};
      try { fundamentals = await fetchYahooFundamentalsTimeseries(yahooSymbol); } catch { /* quote/chart remains valid when Yahoo fundamentals is unavailable */ }
      return { ...fundamentals, price, exchange, currency, companyName: companyName ?? fundamentals.companyName, priceSeries, high52, low52, history: fundamentals.history, filingSourceUrl: fundamentals.filingSourceUrl, filingPeriod: fundamentals.filingPeriod };
    } catch (error) { lastError = String(error); }
  }
  throw new Error(lastError);
}

function addMetric(metrics: Record<string, Metric>, key: string, value: number | undefined, fallback: number, source: string, basis: Exclude<Basis, "unavailable"> = "reported") {
  metrics[key] = { value: value ?? fallback, basis: value === undefined ? "estimated" : basis, source: value === undefined ? "Sector baseline median" : source, period: value === undefined ? "Sector baseline; company period unavailable" : "Latest available provider period" };
}

function clamp(value: number, min = 0, max = 100) { return Math.max(min, Math.min(max, value)); }
// Both scorers guard the degenerate zero-width band explicitly instead of
// producing Infinity/NaN from a divide-by-zero, and treat non-finite inputs as 0.
function scoreHigher(value: number, low: number, high: number) {
  if (!Number.isFinite(value)) return 0;
  if (high === low) return value >= high ? 100 : 0;
  return clamp(percentOf(value - low, high - low) ?? 0);
}
function scoreLower(value: number, good: number, bad: number) {
  if (!Number.isFinite(value)) return 0;
  if (bad === good) return value <= good ? 100 : 0;
  return clamp(percentOf(bad - value, bad - good) ?? 0);
}

export function buildAnalysis(requestedSymbol: string, resolvedSymbol: string, redirect: FundamentalAnalysis["redirect"], raw: RawFundamentals, sources: FundamentalAnalysis["sources"]): FundamentalAnalysis {
  const inferredIndian = resolvedSymbol.endsWith(".NS") || resolvedSymbol.endsWith(".BO") || ["RELIANCE", "TCS", "INFY", "TATAMOTORS", "TMCV", "TMPV", "TATAPOWER", "ADANIENT", "ADANIPORTS", "JIOFIN", "HDFCBANK", "APOLLOHOSP", "LT"].includes(resolvedSymbol);
  const sector = raw.sector ?? (inferredIndian ? "Indian equities" : "Global equities");
  const baseline = sectorBaselines[sector] ?? sectorBaselines["Global equities"];
  const exchange = raw.exchange ?? (resolvedSymbol.endsWith(".NS") ? "NSE" : resolvedSymbol.endsWith(".BO") ? "BSE" : /^[A-Z]+$/.test(resolvedSymbol) && ["RELIANCE", "TATAMOTORS", "TATAPOWER", "ADANIENT", "ADANIPORTS", "JIOFIN"].includes(resolvedSymbol) ? "NSE" : "Global / unresolved exchange");
  const currency = raw.currency ?? (exchange === "NSE" || exchange === "BSE" ? "INR" : "Local currency unavailable");
  const exchangeCountry: Record<string, string> = { NASDAQ: "United States", "NASDAQ NMS - GLOBAL MARKET": "United States", NYQ: "United States", NYSE: "United States", GER: "Germany", FRA: "Germany", JPX: "Japan", TSE: "Japan", LSE: "United Kingdom", TOR: "Canada", ASX: "Australia", HKG: "Hong Kong", KSC: "South Korea", SHG: "China", SZS: "China", SET: "Thailand", BSE: "India", NSE: "India" };
  const country = raw.country ?? exchangeCountry[exchange] ?? (exchange === "NSE" || exchange === "BSE" ? "India" : "Country unavailable");
  const marketKey = country === "India" ? "IN" : Object.entries({ "United States": "US", "United Kingdom": "GB", Canada: "CA", Australia: "AU", Japan: "JP", Singapore: "SG", "Hong Kong": "HK", Germany: "DE", France: "FR" }).find(([label]) => label === country)?.[1] ?? "UNKNOWN";
  const marketCapConvention = getMarketCapConvention(marketKey);
  const marketCapValue = raw.marketCap === undefined ? null : country === "India" && raw.marketCap > 1_000_000 ? quotient(raw.marketCap, 10_000_000) ?? raw.marketCap : raw.marketCap;
  const marketCapBand = classifyMarketCap(marketKey, marketCapValue);
  const metrics: Record<string, Metric> = {};
  const history = raw.history ?? emptyHistoricalTrends();
  const quantitativeMetrics = calculateQuantitativeMetrics({
    price: raw.price,
    marketCap: raw.marketCap,
    revenue: raw.revenue,
    netIncome: raw.netIncome,
    operatingCashFlow: raw.operatingCashFlow ?? history.cashFlow.at(-1)?.value,
    freeCashFlow: raw.freeCashFlow,
    netDebt: raw.netDebt,
    pe: raw.pe,
    priceToBook: raw.priceToBook,
    roe: raw.roe,
    roce: raw.roce,
    roic: raw.roic,
    roa: raw.roa,
    debtToEquity: raw.debtToEquity,
    interestCoverage: raw.interestCoverage,
    currentRatio: raw.currentRatio,
    quickRatio: raw.quickRatio,
    revenueGrowth: raw.revenueGrowth,
    earningsGrowth: raw.earningsGrowth,
    dividendYield: raw.dividendYield,
    payoutRatio: raw.payoutRatio,
    promoterHolding: raw.promoterHolding,
    promoterPledge: raw.promoterPledge,
    priceSeries: raw.priceSeries,
    history,
  });
  const latestReportedCfo = history.cashFlow.at(-1)?.value;
  const cfo = raw.operatingCashFlow ?? latestReportedCfo ?? (raw.netIncome !== undefined ? product(raw.netIncome, 0.9) ?? undefined : undefined);
  const cfoBasis: Exclude<Basis, "unavailable"> = raw.operatingCashFlow !== undefined ? "reported" : latestReportedCfo !== undefined ? "reported" : raw.netIncome !== undefined ? "derived" : "estimated";
  const fcf = raw.freeCashFlow ?? (cfo !== undefined && raw.capitalExpenditures !== undefined ? difference(cfo, Math.abs(raw.capitalExpenditures)) ?? undefined : undefined);
  const fcfBasis: Exclude<Basis, "unavailable"> = raw.freeCashFlow !== undefined ? "reported" : fcf !== undefined ? "derived" : "estimated";
  const cashConversion = cfo !== undefined && raw.netIncome !== undefined && raw.netIncome !== 0 ? quotient(cfo, raw.netIncome) ?? undefined : undefined;
  addMetric(metrics, "roe", raw.roe, baseline.roe!, "Primary/secondary/web sources");
  addMetric(metrics, "roa", raw.roa, baseline.roa!, "Primary/secondary/web sources");
  addMetric(metrics, "debtToEquity", raw.debtToEquity, baseline.debtToEquity!, "Primary/secondary/web sources");
  addMetric(metrics, "interestCoverage", raw.interestCoverage, 3, "Interest coverage / sector baseline");
  addMetric(metrics, "currentRatio", raw.currentRatio, 1.5, "Current ratio / sector baseline");
  addMetric(metrics, "quickRatio", raw.quickRatio, 1, "Quick ratio / sector baseline");
  addMetric(metrics, "profitMargin", raw.profitMargin, baseline.profitMargin!, "Primary/secondary/web sources");
  addMetric(metrics, "grossMargin", raw.grossMargin, 30, "Gross margin / sector baseline");
  addMetric(metrics, "operatingMargin", raw.operatingMargin, 12, "Operating margin / sector baseline");
  addMetric(metrics, "revenueGrowth", raw.revenueGrowth, baseline.revenueGrowth!, "Primary/secondary/web sources");
  addMetric(metrics, "earningsGrowth", raw.earningsGrowth, baseline.earningsGrowth!, "Primary/secondary/web sources");
  addMetric(metrics, "pe", raw.pe, baseline.pe!, "Primary/secondary/web sources");
  addMetric(metrics, "priceToBook", raw.priceToBook, baseline.priceToBook!, "Primary/secondary/web sources");
  addMetric(metrics, "promoterHolding", raw.promoterHolding, 45, "Shareholding / governance baseline");
  addMetric(metrics, "promoterPledge", raw.promoterPledge, 0, "Shareholding / governance baseline");
  addMetric(metrics, "operatingCashFlow", cfo, 0, "Reported annual cash flow, trend table, or derived from net income", cfoBasis);
  addMetric(metrics, "freeCashFlow", fcf, 0, "Reported FCF or CFO less capital expenditure", fcfBasis);
  addMetric(metrics, "cashQuality", fcf ?? cfo, 0, "Backward-compatible cash-flow quality alias", fcf !== undefined ? fcfBasis : cfoBasis);
  addMetric(metrics, "cashConversion", cashConversion, 1, "Operating cash flow divided by net income", cashConversion === undefined ? "estimated" : "derived");
  const epsValue = raw.eps ?? history.eps.at(-1)?.value;
  if (epsValue !== undefined) metrics.eps = { value: epsValue, basis: "reported", source: "Company-period EPS history", period: history.eps.at(-1)?.period ?? "Latest available provider period" };
  addMetric(metrics, "moatSignal", undefined, 50, "Qualitative moat requires business-model and competitive-position evidence");

  const moat = Math.round((scoreHigher(metrics.promoterHolding.value, 25, 75) + scoreLower(metrics.promoterPledge.value, 0, 10) + scoreHigher(metrics.operatingMargin.value, 8, 30)) / 15);
  const financialHealth = Math.round((scoreLower(metrics.debtToEquity.value, sector === "Financials" ? 8 : 0.5, sector === "Financials" ? 15 : 2) + scoreHigher(metrics.interestCoverage.value, 3, 10) + scoreHigher(metrics.currentRatio.value, 1.5, 3) + scoreHigher(metrics.quickRatio.value, 1, 2)) / 20);
  const profitability = Math.round((scoreHigher(metrics.roe.value, 8, 22) + scoreHigher(metrics.roa.value, 2, 12) + scoreHigher(metrics.grossMargin.value, 20, 60) + scoreHigher(metrics.operatingMargin.value, 8, 30) + scoreHigher(metrics.profitMargin.value, 5, 25)) / 25);
  const cfoSignal = metrics.operatingCashFlow.value > 0 ? 75 : metrics.operatingCashFlow.value < 0 ? 15 : 45;
  const fcfSignal = metrics.freeCashFlow.value > 0 ? 75 : metrics.freeCashFlow.value < 0 ? 15 : 45;
  const cashFlowScore = Math.round((cfoSignal + fcfSignal + scoreHigher(metrics.cashConversion.value, 0.8, 1.4)) / 15);
  const growthValuation = Math.round((scoreHigher(metrics.revenueGrowth.value, 5, 25) + scoreHigher(metrics.earningsGrowth.value, 5, 25) + scoreLower(metrics.pe.value, 15, 45) + scoreLower(metrics.priceToBook.value, 2, 8)) / 20);
  const rawCategories = [
    ["moat", "Qualitative business / moat", moat, 20, ["Promoter alignment, pledge risk, operating-margin proxy, and business-model evidence are assessed."]],
    ["financialHealth", "Financial health & solvency", financialHealth, 20, ["D/E, interest coverage, current ratio, and quick ratio are assessed against sector-aware thresholds."]],
    ["profitability", "Profitability & efficiency", profitability, 20, ["ROE, ROA, gross margin, operating margin, and net margin are assessed across available history."]],
    ["cashFlow", "Cash-flow realities", cashFlowScore, 20, ["Operating cash flow, free cash flow, and CFO-to-net-income conversion directly affect this score."]],
    ["growthValuation", "Growth profile & valuation", growthValuation, 20, ["Revenue/EPS growth, P/E, P/B, and conservative intrinsic-value inputs are assessed together."]],
  ] as const;
  const categoryMetricKeys: Record<string, string[]> = {
    moat: ["promoterHolding", "promoterPledge", "operatingMargin", "moatSignal"],
    financialHealth: ["debtToEquity", "interestCoverage", "currentRatio", "quickRatio"],
    profitability: ["roe", "roa", "grossMargin", "operatingMargin", "profitMargin"],
    cashFlow: ["operatingCashFlow", "freeCashFlow", "cashQuality", "cashConversion"],
    growthValuation: ["revenueGrowth", "earningsGrowth", "pe", "priceToBook"],
  };
  const categoryBasis = (key: string): Basis => {
    const bases = (categoryMetricKeys[key] ?? []).map((metricKey) => metrics[metricKey]?.basis).filter(Boolean) as Array<Exclude<Basis, "unavailable">>;
    if (!bases.length || bases.every((basis) => basis === "estimated")) return "estimated";
    if (bases.some((basis) => basis === "estimated")) return "estimated";
    if (bases.some((basis) => basis === "derived")) return "derived";
    return "reported";
  };
  const categories = rawCategories.map(([key, label, score, max, evidence]) => {
    const basis = categoryBasis(key);
    return { key, label, score: clamp(score, 0, max), max, basis, evidence: [...evidence, basis === "estimated" ? "Some inputs for this pillar use explicitly labeled estimates." : basis === "derived" ? "This pillar includes transparent derived calculations." : "Inputs for this pillar are provider-reported or filing-derived."] };
  });
  const riskScore = clamp(5 - [metrics.debtToEquity.value > (sector === "Financials" ? 10 : 2) ? 1 : 0, metrics.interestCoverage.value < 3 ? 1 : 0, metrics.operatingCashFlow.value < 0 || metrics.freeCashFlow.value < 0 ? 1 : 0, metrics.cashConversion.value < 0.8 ? 1 : 0].reduce((sum, flag) => sum + flag, 0), 0, 5);
  const scoreWeights = [
    { key: "businessQuality", label: "Business Quality & Moat", score: Math.round((moat / 20) * 15), max: 15, calculation: "Moat and business-quality proxy scaled from the existing 20-point moat pillar." },
    { key: "financialStrength", label: "Financial Strength", score: Math.round((financialHealth / 20) * 15), max: 15, calculation: "Leverage, interest coverage, liquidity, and solvency scaled from the existing health pillar." },
    { key: "growthEarningsQuality", label: "Growth & Earnings Quality", score: Math.round(((scoreHigher(metrics.revenueGrowth.value, 5, 25) + scoreHigher(metrics.earningsGrowth.value, 5, 25)) / 200) * 15), max: 15, calculation: "Revenue and earnings growth are combined; cash-conversion contradictions remain separately flagged." },
    { key: "profitabilityEfficiency", label: "Profitability & Capital Efficiency", score: Math.round((profitability / 20) * 10), max: 10, calculation: "ROE, ROA, gross, operating, and net margins scaled from the profitability pillar." },
    { key: "valuation", label: "Valuation", score: Math.round(((scoreLower(metrics.pe.value, 15, 45) + scoreLower(metrics.priceToBook.value, 2, 8)) / 200) * 15), max: 15, calculation: "P/E and P/B relative scores; peer and historical multiples remain required for stronger confidence." },
    { key: "cashFlowBalanceSheet", label: "Cash Flow & Balance Sheet", score: Math.round((cashFlowScore / 20) * 6 + (financialHealth / 20) * 4), max: 10, calculation: "Operating cash flow, free cash flow, conversion, leverage, and liquidity combined without replacing pillar detail." },
    { key: "managementAllocation", label: "Management & Capital Allocation", score: Math.round((scoreLower(metrics.promoterPledge.value, 0, 10) + scoreHigher(metrics.promoterHolding.value, 25, 75)) / 200 * 5), max: 5, calculation: "Promoter holding and pledge signals; compensation, buyback, dividend, and acquisition evidence require filings." },
    { key: "competitivePosition", label: "Competitive / Industry Position", score: Math.round((moat / 20) * 5), max: 5, calculation: "Sector context and moat proxy scaled separately; company-specific market-share evidence remains a research gap." },
    { key: "catalystsOutlook", label: "Catalysts & Future Outlook", score: Math.round(scoreHigher(metrics.earningsGrowth.value, 5, 25) / 100 * 5), max: 5, calculation: "Growth proxy only; confirmed catalysts require dated orders, capacity, M&A, product, or regulatory evidence." },
    { key: "riskProfile", label: "Risk Profile", score: riskScore, max: 5, calculation: "Starts at 5 and deducts for leverage, weak interest coverage, negative cash flow, and weak cash conversion signals." },
  ];
  const score = scoreWeights.reduce((sum, item) => sum + item.score, 0);
  const currentScope = raw.currentScope ?? (raw.businessSummary ? `Current operating scope is described by the available company profile: ${raw.businessSummary}` : "Current scope requires company-specific segment, geography, product, and capacity disclosures.");
  const futurePlans = raw.futurePlans ?? "Future plans require dated annual reports, investor presentations, exchange announcements, and regulatory disclosures; no unsupported forward-looking claim is generated.";
  const qualitative: FundamentalAnalysis["qualitative"] = { businessModel: raw.businessSummary ? `Company profile evidence: ${raw.businessSummary}` : `Company-specific business-model classification is not available from the connected structured feeds; ${sector} sector context is used as an estimate.`, moat: "Network effects, switching costs, cost advantage, and intangible assets require company filings and management evidence; no unsupported moat is asserted.", management: raw.promoterHolding !== undefined ? `Promoter holding is ${raw.promoterHolding.toFixed(2)}%; pledge and capital-allocation evidence require the latest ownership and filing review.` : "Promoter alignment and pledge metrics are shown when sourced; capital-allocation and compensation quality require filing-level review.", currentScope, futurePlans, basis: raw.businessSummary || raw.promoterHolding !== undefined ? "reported" : "estimated" };
  const risks = [
    metrics.debtToEquity.basis === "estimated" ? "Leverage is estimated from a sector baseline; verify the latest balance sheet." : metrics.debtToEquity.value > 2 ? "Leverage is elevated relative to the selected sector." : "No leverage warning from available inputs.",
    metrics.interestCoverage.value < 3 ? "Interest coverage is below the preferred 3x threshold or estimated; verify debt-service capacity." : "Interest coverage is not currently a primary risk signal.",
    metrics.operatingCashFlow.basis !== "reported" ? "Cash-flow quality is derived or estimated and requires filing-level confirmation." : metrics.operatingCashFlow.value < 0 || metrics.freeCashFlow.value < 0 ? "Operating cash flow or free cash flow is negative; investigate earnings quality and reinvestment needs." : metrics.cashConversion.value < 0.8 ? "Operating cash flow trails net income; investigate accruals and working-capital pressure." : "Cash-flow conversion is not currently a primary risk signal.",
    metrics.promoterPledge.value > 0 ? "Promoter share pledging is present or estimated above zero; verify the latest shareholding filing." : "No promoter-pledge warning from available inputs.",
    redirect ? "The requested identifier is legacy/redirected; confirm the active listed entity before acting." : "No known legacy ticker redirect was applied.",
  ];
  const price = raw.price !== undefined && Number.isFinite(raw.price) && raw.price > 0 ? raw.price : null;
  const fairValueBasis: Basis = price === null ? "unavailable" : raw.pe !== undefined || raw.priceToBook !== undefined ? "derived" : "estimated";
  const dcfReady = fcf !== undefined && fcf > 0 && raw.sharesOutstanding !== undefined && raw.sharesOutstanding > 0;
  const dcfGrowth = clamp(metrics.earningsGrowth.value / 100, 0.03, 0.15);
  const discountRate = 0.12;
  const terminalGrowth = 0.04;
  const forecastYears = 5;
  const dcfEnterpriseValue = dcfReady ? Array.from({ length: forecastYears }, (_, index) => fcf * (1 + dcfGrowth) ** (index + 1) / (1 + discountRate) ** (index + 1)).reduce((sum, value) => sum + value, 0) + (fcf * (1 + dcfGrowth) ** forecastYears * (1 + terminalGrowth) / (discountRate - terminalGrowth)) / (1 + discountRate) ** forecastYears : null;
  const dcfEquityValue = dcfEnterpriseValue !== null ? dcfEnterpriseValue - (raw.netDebt ?? 0) : null;
  const dcfPerShareCandidate = dcfEquityValue !== null && raw.sharesOutstanding ? dcfEquityValue / raw.sharesOutstanding : null;
  const dcfValuePerShare = dcfPerShareCandidate !== null && Number.isFinite(dcfPerShareCandidate) && dcfPerShareCandidate > 0 ? dcfPerShareCandidate : null;
  const dcfBasis: Basis = dcfValuePerShare !== null ? fcfBasis === "reported" ? "derived" : "estimated" : "unavailable";
  const rating: FundamentalAnalysis["institutionalReport"]["rating"] = score >= 90 ? "Exceptional" : score >= 80 ? "Strong" : score >= 70 ? "Good" : score >= 60 ? "Neutral" : score >= 40 ? "Weak" : "High Risk";
  const investmentView: FundamentalAnalysis["institutionalReport"]["investmentView"] = score >= 80 ? "Bullish" : score >= 65 ? "Moderately Bullish" : score >= 50 ? "Neutral" : score >= 35 ? "Moderately Bearish" : "Bearish";
  const epsPerShare = raw.eps ?? (raw.netIncome !== undefined && raw.sharesOutstanding ? raw.netIncome / raw.sharesOutstanding : undefined);
  const earningsAnchor = epsPerShare !== undefined && epsPerShare > 0 && baseline.pe !== undefined ? epsPerShare * baseline.pe : null;
  const bookPerShare = raw.bookValue ?? (raw.totalEquity !== undefined && raw.sharesOutstanding ? raw.totalEquity / raw.sharesOutstanding : undefined);
  const bookAnchor = bookPerShare !== undefined && bookPerShare > 0 && baseline.priceToBook !== undefined ? bookPerShare * baseline.priceToBook : null;
  const relativeValuationAnchor = earningsAnchor !== null && bookAnchor !== null ? (earningsAnchor + bookAnchor) / 2 : earningsAnchor ?? bookAnchor;
  const fairValueAnchorCandidate = dcfValuePerShare ?? relativeValuationAnchor;
  const fairValueIsPlausible = fairValueAnchorCandidate !== null && price !== null ? fairValueAnchorCandidate >= price * 0.05 && fairValueAnchorCandidate <= price * 20 : true;
  const fairValueAnchor = fairValueAnchorCandidate !== null && Number.isFinite(fairValueAnchorCandidate) && fairValueAnchorCandidate > 0 && fairValueIsPlausible ? fairValueAnchorCandidate : null;
  const currentVsFairValuePct = price !== null && fairValueAnchor !== null ? ((price - fairValueAnchor) / fairValueAnchor) * 100 : null;
  const hasEstimates = Object.values(metrics).some((metric) => metric.basis === "estimated");
  const confidenceScore = clamp(Math.round((sources.filter((source) => source.status === "used").length / Math.max(1, sources.length)) * 70 + (hasEstimates ? 15 : 30) - (sources.some((source) => source.status === "failed") ? 10 : 0)));
  const positives = [metrics.operatingCashFlow.value > 0 ? "Operating cash flow is positive or estimated positive." : "Cash-flow conversion requires review.", metrics.roe.value >= 15 ? "Return on equity is above the preferred 15% reference level." : "ROE is below the preferred reference level or estimated.", metrics.revenueGrowth.value >= 10 ? "Revenue-growth evidence supports a potential growth profile." : "Growth evidence is moderate or estimated.", raw.dividendYield !== undefined ? "Dividend evidence is available from the connected market-data response." : "Capital-return evidence requires the latest filing review.", raw.businessSummary ? "A company-profile business summary is available for operating-context review." : "Company-specific operating context remains evidence-limited."];
  const catalysts = [metrics.earningsGrowth.value >= 10 ? "Earnings growth can support operating leverage if sustained." : "Earnings growth catalyst is not yet established from verified data.", "Capacity expansion, new products, contracts, partnerships, M&A, and regulatory changes require dated official announcements before being treated as confirmed catalysts.", raw.futurePlans ? "Company-specific forward-looking evidence is available and should be checked against dated milestones." : "No company-specific forward-looking plan is confirmed in the current payload."];
  const redFlags = risks.filter((risk) => !risk.startsWith("No "));
  const weaknesses = [metrics.debtToEquity.value > (sector === "Financials" ? 10 : 2) ? "Leverage is elevated for the selected sector." : "No elevated leverage flag from available inputs.", metrics.cashConversion.value < 0.8 ? "Cash conversion trails the preferred threshold or is estimated." : "No weak cash-conversion flag from available inputs.", metrics.pe.value > baseline.pe! && metrics.earningsGrowth.value < baseline.earningsGrowth! ? "Valuation is above the sector reference while growth is below it." : "No valuation-growth contradiction detected.", raw.promoterPledge === undefined ? "Promoter-pledge evidence is not available from the current payload." : raw.promoterPledge > 0 ? "Promoter pledging requires immediate filing-level review." : "No promoter-pledge warning from available inputs.", (history.revenue.length >= 4 || (history.eps.length >= 4 && history.cashFlow.length >= 4)) ? "No historical-coverage weakness identified beyond the stated source periods." : "Five-year company-period history is not available."];
  const thesisBullishWhen = ["Operating cash flow and free cash flow remain positive or improve.", "Revenue and earnings growth sustain above the sector reference without leverage stress.", fairValueAnchor !== null ? "The current price remains below the source-aware fair-value anchor." : "A verified intrinsic or peer valuation anchor becomes available."];
  const thesisInvalidation = ["Cash flow remains negative while reported earnings continue to rise.", "Debt, dilution, governance, regulatory, or execution risks materially worsen.", "The latest filing contradicts the business, catalyst, or valuation assumptions used here."];
  const upsideDownsidePct = price !== null && fairValueAnchor !== null ? ((fairValueAnchor - price) / price) * 100 : null;
  const outlook12to24m = score >= 80 ? "Constructive 12–24 month outlook, conditional on sustained growth, cash generation, and valuation discipline." : score >= 60 ? "Mixed 12–24 month outlook; verify catalysts, filings, cash conversion, and valuation before increasing conviction." : "Cautious 12–24 month outlook; evidence gaps or risk signals require resolution before a bullish view is justified.";
  const scenarios: ResearchScenario[] = [
    { label: "Bull", assumptions: ["Revenue and EPS growth approach the upper available trend range.", "Margins and cash conversion improve without leverage stress."], fairValue: fairValueAnchor !== null ? fairValueAnchor * 1.25 : null, probability: 25, severity: "low" },
    { label: "Base", assumptions: ["Growth remains near current or sector-estimated levels.", "Valuation remains anchored to current multiples and available cash-flow evidence."], fairValue: fairValueAnchor, probability: 50, severity: "medium" },
    { label: "Bear", assumptions: ["Growth falls below the lower reference range or cash flow remains negative.", "Debt, dilution, governance, or valuation risks intensify."], fairValue: fairValueAnchor !== null ? fairValueAnchor * 0.7 : null, probability: 25, severity: "high" },
  ];
  const probabilityWeightedFairValue = scenarios.every((scenario) => scenario.fairValue !== null) ? scenarios.reduce((sum, scenario) => sum + (scenario.fairValue ?? 0) * scenario.probability / 100, 0) : null;
  const freshness = sources.some((source) => source.status === "used") ? `Analysis assembled at ${new Date().toISOString()} from the latest successful provider responses; individual source dates are shown in provenance.` : "No successful provider response is available; all values are estimated or unavailable.";
  const sourceHierarchy = ["Official exchange filings, annual reports, quarterly results, investor presentations, and regulatory disclosures", "Structured primary/secondary market-data providers and read-only MCP sources", "Robots-compliant public financial pages and chart metadata", "Sector baselines and derived estimates, clearly labeled"];
  const institutionalReport: FundamentalAnalysis["institutionalReport"] = { rating, investmentView, confidenceScore, currentVsFairValuePct, upsideDownsidePct, probabilityWeightedFairValue, outlook12to24m, positives, weaknesses, catalysts, redFlags, thesisBullishWhen, thesisInvalidation, scenarios, scoreWeights, freshness, sourceHierarchy };
  const evidenceUsed = sources.filter((source) => source.status === "used").map((source) => `${source.name}: ${source.note}`);
  const evidenceGaps = Object.entries(metrics).filter(([, metric]) => metric.basis === "estimated").map(([key, metric]) => `${key} uses ${metric.source}; company-period evidence was not available.`);
  const contradictions: string[] = [];
  if (metrics.revenueGrowth.value > 0 && metrics.operatingCashFlow.value < 0) contradictions.push("Reported/derived growth is positive while operating cash flow is negative; investigate accruals, working capital, or one-off effects.");
  if (metrics.earningsGrowth.value > 0 && metrics.cashConversion.value < 0.8) contradictions.push("Earnings growth is positive but CFO-to-net-income conversion is weak; earnings quality needs filing-level review.");
  if (metrics.pe.value > baseline.pe! && metrics.earningsGrowth.value < baseline.earningsGrowth!) contradictions.push("Valuation is above the sector reference while growth is below the sector reference; rerating risk is elevated.");
  if (!contradictions.length) contradictions.push("No material cross-metric contradiction was detected from the available normalized inputs; absence of a flag is not proof of quality.");
  const researchLogic: FundamentalAnalysis["researchLogic"] = {
    methodology: ["Resolve the requested identifier and preserve any corporate-action redirect.", "Collect independent provider results in parallel, then merge only by source trust tier.", "Prefer reported values over derived values and derived values over sector estimates; never let an estimate overwrite a reported field.", "Score business quality, solvency, profitability, cash flow, and growth/valuation separately before constructing the weighted institutional view.", "Treat future plans and catalysts as hypotheses until dated filings, investor-relations material, or regulatory disclosures confirm them."],
    evidenceUsed,
    evidenceGaps,
    contradictions,
    decisionRules: ["Latest price must come from a current quote/chart response, not an old historical close.", "Financial figures must retain their reporting period when supplied; otherwise the report explicitly says the company period is unavailable.", "Global symbols use exchange suffixes and local currency metadata; Indian symbols retain NSE/BSE-first routing.", "A provider failure reduces confidence and is shown in provenance; it does not silently become a fabricated value.", "The investment view is a research classification, not a guaranteed return or personalized recommendation."],
    nextResearchQuestions: ["What do the latest annual and quarterly filings say about revenue quality, working capital, debt maturities, and capex?", "Do management’s stated plans have dated milestones, committed funding, and measurable operating KPIs?", "How do current P/E, P/B, EV/EBITDA, margins, and growth compare with a verified peer set and the company’s own history?", "Are there governance, related-party, dilution, auditor, regulatory, or promoter-pledge signals that change the base case?"]
  };
  const priceSeries = raw.priceSeries?.filter((value) => Number.isFinite(value)) ?? [];
  const sma = (window: number) => priceSeries.length >= window ? priceSeries.slice(-window).reduce((sum, value) => sum + value, 0) / window : null;
  const sma20 = sma(20);
  const sma50 = sma(50);
  const currentPrice = price;
  const oneYearChangePct = priceSeries.length >= 2 ? percentChange(priceSeries[0], priceSeries.at(-1)!) : null;
  const rsi14 = priceSeries.length >= 15 ? (() => { const changes = priceSeries.slice(-15).map((value, index, values) => index === 0 ? 0 : difference(value, values[index - 1]) ?? 0); const gains = changes.slice(1).filter((change) => change > 0); const losses = changes.slice(1).filter((change) => change < 0).map((change) => Math.abs(change)); const avgGain = (sumValid(gains) ?? 0) / 14; const avgLoss = (sumValid(losses) ?? 0) / 14; if (avgLoss === 0) return 100; const relativeStrength = quotient(avgGain, avgLoss); if (relativeStrength === null) return 100; return difference(100, quotient(100, 1 + relativeStrength) ?? 0) ?? 100; })() : null;
  const technicalTrend: FundamentalAnalysis["stockAnalysis"]["technical"]["trend"] = currentPrice === null || sma20 === null ? "Unavailable" : currentPrice > sma20 && (sma50 === null || currentPrice > sma50) ? "Bullish" : currentPrice < sma20 && (sma50 === null || currentPrice < sma50) ? "Bearish" : "Neutral";
  const technicalBasis: Basis = priceSeries.length >= 2 ? "reported" : "unavailable";
  const stockAnalysis: FundamentalAnalysis["stockAnalysis"] = {
    profile: { businessSummary: raw.businessSummary ?? `Business summary is unavailable from the connected structured feeds; ${sector} context is shown without inventing company-specific claims.`, currentScope, futurePlans, sector, exchange, country, website: raw.website ?? "Unavailable", employees: raw.employees ?? null, employeesSource: raw.employees !== undefined ? (raw.employeesSource ?? "Company profile provider") : "Unavailable from connected profile sources", basis: raw.businessSummary ? "reported" : "estimated" },
    technical: { trend: technicalTrend, currentPrice, sma20, sma50, rsi14, high52: raw.high52 ?? null, low52: raw.low52 ?? null, oneYearChangePct, basis: technicalBasis, note: technicalBasis === "reported" ? "Calculated from the available Yahoo chart close series; this is market context, not a standalone investment signal." : "Technical indicators are unavailable without a verified price history." },
    ownership: { promoterHolding: raw.promoterHolding ?? null, promoterPledge: raw.promoterPledge ?? null, status: raw.promoterHolding !== undefined || raw.promoterPledge !== undefined ? "Partial ownership evidence" : "Ownership data unavailable", basis: raw.promoterHolding !== undefined || raw.promoterPledge !== undefined ? "reported" : "unavailable", note: raw.promoterHolding !== undefined ? "Promoter holding was extracted from the latest available public shareholding row; pledge detail and institutional ownership require the latest filing review." : "Insider transactions, institutional holders, and pledge detail require a dedicated ownership source and current filing review." },
    filings: { status: raw.filingSourceUrl ? "partial" : country === "United States" ? "partial" : "unavailable", note: raw.filingSourceUrl ? `Company-period financial evidence was extracted from ${raw.filingSourceUrl}${raw.filingPeriod ? `; latest parsed period: ${raw.filingPeriod}` : ""}. Filing text and related-party/auditor sections still require document-level review.` : country === "United States" ? "SEC filing discovery is supported in the research workflow but filing text was not attached to this analysis payload." : "Local exchange and regulator filing text is not attached to this analysis payload; verify the latest annual, quarterly, and material-event filings.", nextCheck: "Latest annual report, quarterly results, material events, risk factors, auditor notes, and related-party disclosures" },
    valuation: { pe: metrics.pe.value, priceToBook: metrics.priceToBook.value, currentVsFairValuePct, note: "P/E and P/B are source-aware values or sector estimates; peer and historical-multiple comparisons are required before treating valuation as actionable." },
    conclusion: `${rating} research profile with ${technicalTrend.toLowerCase()} technical context and ${confidenceScore}/100 evidence confidence. The conclusion is constrained by ${evidenceGaps.length} evidence gap${evidenceGaps.length === 1 ? "" : "s"}; verify filings and current market data before acting.`,
  };
  const valuationNote = dcfValuePerShare !== null && fairValueAnchor !== null ? "DCF-derived anchor based on positive free cash flow and shares outstanding." : fairValueAnchor !== null && relativeValuationAnchor !== null ? `Relative anchor blends available earnings/book-value inputs with sector reference multiples (${baseline.pe ?? "n/a"}x P/E and ${baseline.priceToBook ?? "n/a"}x P/B); it is an estimate, not a target.` : price !== null ? "No intrinsic anchor was available; current price is shown only as a reference." : "No reliable current price or valuation anchor was available.";
  const lowValue = fairValueAnchor !== null ? fairValueAnchor * 0.85 : null;
  const baseValue = fairValueAnchor;
  const highValue = fairValueAnchor !== null ? fairValueAnchor * 1.2 : null;
  const isFinancialSector = /bank|financial|finance|insurance/i.test(sector);
  const financialHistoryAvailable = history.revenue.length >= 4 || (isFinancialSector && history.eps.length >= 4 && history.cashFlow.length >= 4);
  const financialHistoryNote = history.revenue.length ? `${history.revenue.length} revenue periods and ${history.eps.length} EPS periods are available.` : isFinancialSector && history.eps.length ? `Financial-sector statements use EPS (${history.eps.length} periods) and operating cash flow (${history.cashFlow.length} periods); revenue is not treated as a comparable bank KPI.` : "Company-period financial history is unavailable.";
  const coverageSections: CoverageSection[] = [
    { key: "identity", label: "Identity & market", score: raw.companyName && price !== null && exchange !== "Unknown" ? 10 : raw.companyName || price !== null ? 6 : 0, max: 10, basis: raw.companyName && price !== null ? "reported" : "unavailable", status: raw.companyName && price !== null ? "verified" : raw.companyName || price !== null ? "partial" : "unavailable", note: raw.companyName && price !== null ? "Company identity and a positive current quote are available." : "Verify company identity and current quote before acting." },
    { key: "business", label: "Business & scope", score: raw.businessSummary && currentScope ? 10 : raw.businessSummary ? 6 : 0, max: 10, basis: raw.businessSummary ? "reported" : "estimated", status: raw.businessSummary ? "verified" : "unavailable", note: raw.businessSummary ? "Company profile and operating-scope context are available." : "Company-specific business model and scope require a primary profile or filing." },
    { key: "financials", label: "Financial statements", score: financialHistoryAvailable && (metrics.eps.basis !== "estimated" || metrics.netIncome.basis !== "estimated") ? 20 : financialHistoryAvailable ? 10 : 0, max: 20, basis: financialHistoryAvailable ? "reported" : "unavailable", status: financialHistoryAvailable ? "verified" : "unavailable", note: financialHistoryNote },
    { key: "cashFlow", label: "Cash-flow quality", score: metrics.operatingCashFlow.basis === "reported" && metrics.freeCashFlow.basis !== "estimated" ? 15 : metrics.operatingCashFlow.basis !== "estimated" ? 8 : 0, max: 15, basis: metrics.operatingCashFlow.basis === "reported" ? "reported" : metrics.operatingCashFlow.basis === "derived" ? "derived" : "estimated", status: metrics.operatingCashFlow.basis === "reported" ? "verified" : metrics.operatingCashFlow.basis === "estimated" ? "estimated" : "partial", note: "Operating cash flow, free cash flow, and conversion are scored separately from earnings." },
    { key: "ownership", label: "Ownership & governance", score: raw.promoterHolding !== undefined ? 7 : 0, max: 10, basis: raw.promoterHolding !== undefined ? "reported" : "unavailable", status: raw.promoterHolding !== undefined ? "partial" : "unavailable", note: raw.promoterHolding !== undefined ? "Promoter holding is available; pledge and institutional detail require filing review." : "Ownership and governance evidence is unavailable." },
    { key: "filings", label: "Filings & disclosures", score: raw.filingSourceUrl ? 7 : 0, max: 10, basis: raw.filingSourceUrl ? "reported" : "unavailable", status: raw.filingSourceUrl ? "partial" : "unavailable", note: raw.filingSourceUrl ? "A filing or investor-relations source is linked; document-level extraction remains a next check." : "No company-specific filing source was attached to this analysis." },
    { key: "valuation", label: "Valuation", score: price !== null && fairValueAnchor !== null && (raw.pe !== undefined || raw.priceToBook !== undefined) ? 10 : price !== null || fairValueAnchor !== null ? 5 : 0, max: 10, basis: dcfValuePerShare !== null ? dcfBasis : relativeValuationAnchor !== null ? "estimated" : "unavailable", status: price !== null && fairValueAnchor !== null ? "partial" : "unavailable", note: fairValueAnchor !== null ? "Current price and a transparent valuation anchor are shown; intrinsic value requires stronger cash-flow evidence." : "No validated valuation anchor is available." },
    { key: "technical", label: "Technical context", score: priceSeries.length >= 50 ? 10 : priceSeries.length >= 2 ? 5 : 0, max: 10, basis: priceSeries.length >= 2 ? "reported" : "unavailable", status: priceSeries.length >= 50 ? "verified" : priceSeries.length >= 2 ? "partial" : "unavailable", note: priceSeries.length >= 2 ? "Trend and available price history are shown as market context." : "Technical context requires a verified price history." },
  ];
  const verifiedCoverage = coverageSections.filter((section) => section.status === "verified").length;
  const estimatedCoverage = coverageSections.filter((section) => section.status === "estimated").length;
  const unavailableCoverage = coverageSections.filter((section) => section.status === "unavailable").length;
  const coverageScore = Math.round(coverageSections.reduce((sum, section) => sum + section.score, 0));
  const coverage = { score: coverageScore, label: coverageScore >= 80 ? "High" as const : coverageScore >= 55 ? "Moderate" as const : "Limited" as const, verified: verifiedCoverage, estimated: estimatedCoverage, unavailable: unavailableCoverage, sections: coverageSections };
  const normalizedCompanyName = (raw.companyName ?? resolvedSymbol).replace(/\s+/g, " ").trim();
  const filingEvidence = extractFilingEvidence({ sourceText: [raw.businessSummary, raw.currentScope].filter(Boolean).join(" "), futurePlans: raw.futurePlans, sourceUrl: raw.filingSourceUrl ?? raw.website, period: raw.filingPeriod ?? raw.employeesPeriod });
  const multibaggerThesis = buildMultibaggerThesis({
    companyName: normalizedCompanyName,
    symbol: resolvedSymbol,
    sector,
    price,
    metrics,
    history,
    evidenceGaps: researchLogic.evidenceGaps,
    risks,
    catalysts,
  });
  return {
    requestedSymbol,
    resolvedSymbol,
    companyName: normalizedCompanyName,
    market: { exchange, currency, country, primaryFocus: country === "India" },
    marketCap: { value: marketCapValue, band: marketCapBand, label: marketCapBandLabel(marketCapBand), currency: marketCapConvention.currency, convention: marketCapConvention, basis: marketCapValue === null ? "unavailable" : "reported" },
    redirect,
    score,
    verdict: rating === "Exceptional" || rating === "Strong" ? "Strong research profile" : rating === "High Risk" ? "High-risk / incomplete evidence" : "Mixed research profile",
    coverage,
    categories,
    qualitative,
    institutionalReport,
    researchLogic,
    stockAnalysis,
    metrics,
    quantitativeMetrics,
    multibaggerThesis,
    filingEvidence,
    risks,
    fairValue: { lowMultiple: 0.85, baseMultiple: 1, highMultiple: 1.2, lowValue, baseValue, highValue, currentPrice: price, currency, basis: fairValueAnchor === null ? "unavailable" : dcfValuePerShare !== null ? dcfBasis : relativeValuationAnchor !== null ? "estimated" : fairValueBasis, note: valuationNote, dcf: { valuePerShare: dcfValuePerShare, basis: dcfBasis, note: dcfValuePerShare !== null ? `Five-year DCF using ${Math.round(dcfGrowth * 100)}% growth, 12% discount rate, and 4% terminal growth.` : "DCF requires positive free cash flow, net-debt context, and shares outstanding; no unsupported value is invented." } },
    history,
    sources,
    warnings: hasEstimates ? ["Some metrics use sector-baseline estimates because provider fields were incomplete."] : [],
    asOf: new Date().toISOString(),
  };
}

export async function analyzeFundamentals(requestedSymbol: string): Promise<FundamentalAnalysis> {
  const requested = requestedSymbol.trim().toUpperCase();
  const requestedBase = requested.replace(/\.(NS|BO)$/i, "");
  const alias = corporateAliases[requested] ?? corporateAliases[requestedBase];
  const suffix = requested.match(/\.(NS|BO)$/i)?.[0].toUpperCase() ?? "";
  const resolved = alias ? `${alias.symbol}${suffix}` : requested;
  const redirect = alias ? { from: requested, to: resolved, reason: alias.reason } : null;

  const results = await runProvidersInParallel<RawFundamentals>([
    { id: "indian-api", tier: "primary", enabled: Boolean(process.env.INDIAN_API_KEY), run: () => fetchPrimary(resolved) },
    { id: "finnhub", tier: "primary", enabled: Boolean(process.env.FINNHUB_API_KEY), run: () => fetchFinnhubGlobal(resolved) },
    { id: "sec-company-facts", tier: "primary", enabled: true, run: () => fetchSecCompanyFacts(resolved) },
    { id: "india-stock-mcp", tier: "secondary", enabled: true, run: () => fetchSecondary(resolved) },
    { id: "indian-open-api", tier: "secondary", enabled: true, run: () => fetchIndianOpenFundamentals(resolved) },
    { id: "screener-public", tier: "web-fallback", enabled: true, run: () => fetchScreenerFallback(resolved) },
    { id: "yahoo-chart", tier: "web-fallback", enabled: true, run: () => fetchWebFallback(resolved) },
    { id: "public-company-profile", tier: "web-fallback", enabled: true, run: () => fetchPublicCompanyProfile(resolved) },
  ], 12_000);

  const sources: FundamentalAnalysis["sources"] = results.map((result) => {
    const names: Record<string, string> = {
      "indian-api": "Indian API",
      finnhub: "Finnhub global profile, quote, and metrics",
      "india-stock-mcp": "India Stock MCP",
      "indian-open-api": "Indian Stock Market API (0xramm)",
      "screener-public": "Screener.in public company page",
      "yahoo-chart": "Yahoo Finance chart endpoint",
      "sec-company-facts": "SEC EDGAR Company Facts and filing metadata",
      "public-company-profile": "Public company profile fallback",
    };
    const notes: Record<string, string> = {
      "indian-api": "Primary structured provider was queried in parallel.",
      "finnhub-global": "Global profile, quote, exchange, currency, and available fundamental metrics were queried in parallel.",
      "sec-company-facts": "Official SEC Company Facts and filing metadata were queried in parallel for mapped global filers.",
      "public-company-profile": "A public profile summary was queried only for business context; it is not used for financial metrics or valuation inputs.",
      "india-stock-mcp": "Read-only MCP fundamentals and quote fields were queried in parallel.",
      "indian-open-api": "The supplied no-key NSE/BSE REST endpoint was queried in parallel; unavailable responses remain explicit.",
      "screener-public": "Robots-compliant public HTML metrics were queried in parallel and extracted conservatively.",
      "yahoo-chart": "Public chart metadata was queried in parallel for fallback price and entity fields.",
    };
    return {
      tier: result.tier,
      name: names[result.id] ?? result.id,
      status: result.status === "circuit-open" ? "failed" : result.status,
      note: result.status === "failed" || result.status === "circuit-open" ? `${notes[result.id] ?? "Provider queried in parallel."} ${result.error ?? "Provider is cooling down after recent failures"} (${result.elapsedMs}ms).` : `${notes[result.id] ?? "Provider queried in parallel."} Completed in ${result.elapsedMs}ms.`,
    };
  });

  let raw: RawFundamentals = {};
  // Merge by trust tier after all providers finish, so a slower lower-priority source cannot overwrite an official field.
  for (const tier of ["primary", "secondary", "web-fallback"] as const) {
    for (const result of results.filter((item) => item.tier === tier && item.status === "used" && item.value)) {
      raw = mergeRaw(raw, result.value!);
    }
  }
  // For Indian symbols, prefer the exchange-suffixed Yahoo chart quote as the canonical
  // current price when another provider returns a conflicting or stale unsuffixed quote.
  // The other provider response remains in provenance and can still populate fields.
  const yahooQuote = results.find((item) => item.id === "yahoo-chart" && item.status === "used" && item.value)?.value?.price;
  const screenerData = results.find((item) => item.id === "screener-public" && item.status === "used" && item.value)?.value;
  if (resolved.endsWith(".NS") || ["RELIANCE", "TCS", "INFY", "TATAMOTORS", "TMCV", "TMPV", "TATAPOWER", "ADANIENT", "ADANIPORTS", "JIOFIN"].includes(resolved)) {
    if (screenerData) {
      const companyFields: Array<keyof RawFundamentals> = ["companyName", "marketCap", "pe", "priceToBook", "roe", "eps", "roce", "roa", "debtToEquity", "profitMargin", "operatingMargin", "revenueGrowth", "earningsGrowth", "operatingCashFlow", "freeCashFlow", "capitalExpenditures", "netIncome", "sharesOutstanding", "totalDebt", "totalAssets", "totalEquity", "interestExpense", "interestCoverage", "promoterHolding", "bookValue", "businessSummary", "currentScope", "futurePlans", "employees", "website", "filingSourceUrl", "filingPeriod", "history"];
      for (const field of companyFields) {
        if (screenerData[field] !== undefined) Object.assign(raw, { [field]: screenerData[field] });
      }
    }
    if (typeof yahooQuote === "number" && yahooQuote > 0) raw.price = yahooQuote;
    raw.exchange = raw.exchange === "NSI" || raw.exchange === "NSE" ? "NSE" : raw.exchange;
    raw.currency = raw.currency ?? "INR";
    raw.country = raw.country ?? "India";
  }
  sources.push({ tier: "derived", name: "Sector baseline and transparent derivation", status: "used", note: "Missing metrics are estimated or derived and labeled in the response." });
  return buildAnalysis(requested, resolved, redirect, raw, sources);
}
