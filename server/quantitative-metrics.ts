export type QuantitativeBasis = "reported" | "derived" | "estimated" | "unavailable" | "not-applicable";

export type QuantitativeMetric = {
  key: string;
  label: string;
  value: number | null;
  unit: "multiple" | "percent" | "ratio" | "days" | "score" | "currency";
  basis: QuantitativeBasis;
  formula: string;
  source: string;
  period?: string;
  note?: string;
};

export type QuantitativeInput = {
  price?: number;
  marketCap?: number;
  revenue?: number;
  netIncome?: number;
  operatingCashFlow?: number;
  freeCashFlow?: number;
  netDebt?: number;
  pe?: number;
  priceToBook?: number;
  roe?: number;
  roce?: number;
  roic?: number;
  roa?: number;
  debtToEquity?: number;
  interestCoverage?: number;
  currentRatio?: number;
  quickRatio?: number;
  revenueGrowth?: number;
  earningsGrowth?: number;
  dividendYield?: number;
  payoutRatio?: number;
  promoterHolding?: number;
  promoterPledge?: number;
  priceSeries?: number[];
  history?: { revenue: Array<{ period: string; value: number }>; eps: Array<{ period: string; value: number }>; cashFlow: Array<{ period: string; value: number }> };
};

function metric(key: string, label: string, value: number | undefined, unit: QuantitativeMetric["unit"], formula: string, source: string, note?: string): QuantitativeMetric {
  return { key, label, value: value !== undefined && Number.isFinite(value) ? value : null, unit, basis: value !== undefined && Number.isFinite(value) ? "reported" : "unavailable", formula, source: value !== undefined && Number.isFinite(value) ? source : "No verified input available", note };
}

function derived(key: string, label: string, value: number | undefined, unit: QuantitativeMetric["unit"], formula: string, source: string, note?: string): QuantitativeMetric {
  return { key, label, value: value !== undefined && Number.isFinite(value) ? value : null, unit, basis: value !== undefined && Number.isFinite(value) ? "derived" : "unavailable", formula, source: value !== undefined && Number.isFinite(value) ? source : "Required inputs unavailable", note };
}

function cagr(points: Array<{ period: string; value: number }>, years: number): number | undefined {
  const usable = points.filter((point) => Number.isFinite(point.value) && point.value > 0);
  if (usable.length < 2) return undefined;
  const first = usable[0]?.value;
  const last = usable.at(-1)?.value;
  if (first === undefined || last === undefined || first <= 0 || last <= 0) return undefined;
  return (Math.pow(last / first, 1 / Math.max(1, Math.min(years, usable.length - 1))) - 1) * 100;
}

function score(points: Array<{ period: string; value: number }>): number | undefined {
  if (!points.length) return undefined;
  let positive = 0;
  for (const point of points) if (point.value > 0) positive += 1;
  return (positive / points.length) * 100;
}

export function calculateQuantitativeMetrics(input: QuantitativeInput): Record<string, QuantitativeMetric> {
  const enterpriseValue = input.marketCap !== undefined && input.netDebt !== undefined ? input.marketCap + input.netDebt : undefined;
  const metrics: Record<string, QuantitativeMetric> = {};
  metrics.marketCap = metric("marketCap", "Market capitalization", input.marketCap, "currency", "Provider-reported market capitalization", "Provider-reported market data");
  metrics.revenue = metric("revenue", "Latest revenue", input.revenue, "currency", "Latest reported or extracted revenue", "Provider-reported financial data");
  metrics.pe = metric("pe", "P/E", input.pe, "multiple", "Price / trailing or forward EPS", "Provider-reported valuation");
  metrics.pb = metric("pb", "P/B", input.priceToBook, "multiple", "Price / book value per share", "Provider-reported valuation");
  metrics.ps = derived("ps", "P/S", input.marketCap !== undefined && input.revenue ? input.marketCap / input.revenue : undefined, "multiple", "Market capitalization / revenue", "Market cap and revenue");
  metrics.pfcf = derived("pfcf", "P/FCF", input.marketCap !== undefined && input.freeCashFlow ? input.marketCap / input.freeCashFlow : undefined, "multiple", "Market capitalization / free cash flow", "Market cap and free cash flow");
  metrics.peg = derived("peg", "PEG", input.pe !== undefined && input.earningsGrowth && input.earningsGrowth > 0 ? input.pe / input.earningsGrowth : undefined, "multiple", "P/E / annual earnings growth percentage", "P/E and earnings growth");
  metrics.evSales = derived("evSales", "EV/Sales", enterpriseValue !== undefined && input.revenue ? enterpriseValue / input.revenue : undefined, "multiple", "Enterprise value / revenue", "Market cap, net debt, and revenue");
  metrics.evFcf = derived("evFcf", "EV/FCF", enterpriseValue !== undefined && input.freeCashFlow ? enterpriseValue / input.freeCashFlow : undefined, "multiple", "Enterprise value / free cash flow", "Market cap, net debt, and free cash flow");
  metrics.dividendYield = metric("dividendYield", "Dividend yield", input.dividendYield, "percent", "Annual dividend / share price", "Provider-reported distributions");
  metrics.payoutRatio = metric("payoutRatio", "Payout ratio", input.payoutRatio, "percent", "Dividends / net income or free cash flow", "Provider-reported distributions");
  metrics.roe = metric("roe", "ROE", input.roe, "percent", "Net income / shareholder equity", "Provider-reported profitability");
  metrics.roce = metric("roce", "ROCE", input.roce, "percent", "Operating profit / capital employed", "Provider-reported profitability");
  metrics.roic = metric("roic", "ROIC", input.roic, "percent", "NOPAT / invested capital", "Provider-reported profitability");
  metrics.roa = metric("roa", "ROA", input.roa, "percent", "Net income / total assets", "Provider-reported profitability");
  metrics.debtToEquity = metric("debtToEquity", "Debt / equity", input.debtToEquity, "ratio", "Total debt / shareholder equity", "Provider-reported balance sheet");
  metrics.interestCoverage = metric("interestCoverage", "Interest coverage", input.interestCoverage, "ratio", "EBIT / interest expense", "Provider-reported solvency");
  metrics.currentRatio = metric("currentRatio", "Current ratio", input.currentRatio, "ratio", "Current assets / current liabilities", "Provider-reported liquidity");
  metrics.quickRatio = metric("quickRatio", "Quick ratio", input.quickRatio, "ratio", "Quick assets / current liabilities", "Provider-reported liquidity");
  metrics.cfoNetIncome = derived("cfoNetIncome", "CFO / net income", input.operatingCashFlow !== undefined && input.netIncome ? input.operatingCashFlow / input.netIncome : undefined, "ratio", "Operating cash flow / net income", "Operating cash flow and net income");
  metrics.fcfYield = derived("fcfYield", "FCF yield", input.freeCashFlow !== undefined && input.marketCap ? (input.freeCashFlow / input.marketCap) * 100 : undefined, "percent", "Free cash flow / market capitalization", "Free cash flow and market cap");
  metrics.revenueCagr3 = derived("revenueCagr3", "Revenue CAGR", cagr(input.history?.revenue ?? [], 3), "percent", "Compound annual revenue growth over available history", "Historical revenue series");
  metrics.epsCagr3 = derived("epsCagr3", "EPS CAGR", cagr(input.history?.eps ?? [], 3), "percent", "Compound annual EPS growth over available history", "Historical EPS series");
  metrics.fcfPositivePeriods = derived("fcfPositivePeriods", "Positive cash-flow periods", score(input.history?.cashFlow ?? []), "score", "Positive cash-flow observations / available observations", "Historical cash-flow series");
  metrics.promoterHolding = metric("promoterHolding", "Promoter holding", input.promoterHolding, "percent", "Controlling-group ownership percentage", "Shareholding disclosure");
  metrics.promoterPledge = metric("promoterPledge", "Promoter pledge", input.promoterPledge, "percent", "Pledged promoter shares / promoter shares", "Shareholding disclosure");
  const prices = input.priceSeries?.filter((value) => Number.isFinite(value) && value > 0) ?? [];
  const latest = prices.at(-1);
  const sma = (window: number) => prices.length >= window ? prices.slice(-window).reduce((sum, value) => sum + value, 0) / window : undefined;
  metrics.sma20 = derived("sma20", "SMA 20", sma(20), "currency", "Mean closing price over the latest 20 observations", "Verified price history");
  metrics.sma50 = derived("sma50", "SMA 50", sma(50), "currency", "Mean closing price over the latest 50 observations", "Verified price history");
  metrics.oneYearChange = derived("oneYearChange", "One-year price change", latest !== undefined && prices[0] ? ((latest / prices[0]) - 1) * 100 : undefined, "percent", "Latest price / first available price minus one", "Verified price history");
  return metrics;
}
