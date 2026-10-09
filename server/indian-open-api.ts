export type IndianOpenStock = {
  status?: string;
  symbol?: string;
  exchange?: string;
  ticker?: string;
  data?: Record<string, unknown>;
};

export type IndianOpenSearch = {
  status?: string;
  query?: string;
  results?: Array<Record<string, unknown>>;
};

const defaultBaseUrl = "http://65.0.104.9";

async function request<T>(path: string, params: Record<string, string>, timeoutMs = 6_000): Promise<T> {
  const baseUrl = process.env.INDIAN_OPEN_API_BASE_URL ?? defaultBaseUrl;
  const url = new URL(path, baseUrl);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "MarketEventIntelligence/1.0" }, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`Indian Stock Market API returned HTTP ${response.status}`);
  const text = await response.text();
  if (!text.trim()) throw new Error("Indian Stock Market API returned an empty response");
  try { return JSON.parse(text) as T; } catch { throw new Error("Indian Stock Market API returned invalid JSON"); }
}

export function fetchIndianOpenStock(symbol: string) {
  return request<IndianOpenStock>("/stock", { symbol: symbol.trim().toUpperCase(), res: "num" });
}

export function fetchIndianOpenSearch(query: string) {
  return request<IndianOpenSearch>("/search", { q: query.trim() }, 5_000);
}

export function normalizeIndianOpenQuote(payload: IndianOpenStock) {
  const data = payload.data ?? {};
  const numeric = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
  return {
    symbol: payload.ticker ?? payload.symbol ?? null,
    exchange: payload.exchange ?? null,
    source: "Indian Stock Market API (0xramm)",
    quote: {
      current: numeric(data.last_price),
      change: numeric(data.change),
      changePercent: numeric(data.percent_change),
      high: numeric(data.day_high),
      low: numeric(data.day_low),
      open: numeric(data.open),
      previousClose: numeric(data.previous_close),
      yearHigh: numeric(data.year_high),
      yearLow: numeric(data.year_low),
      volume: numeric(data.volume),
      marketCap: numeric(data.market_cap),
    },
    fundamentals: {
      pe: numeric(data.pe_ratio),
      dividendYield: numeric(data.dividend_yield),
      bookValue: numeric(data.book_value),
      earningsPerShare: numeric(data.earnings_per_share),
      companyName: typeof data.company_name === "string" ? data.company_name : null,
      sector: typeof data.sector === "string" ? data.sector : null,
      industry: typeof data.industry === "string" ? data.industry : null,
      currency: typeof data.currency === "string" ? data.currency : "INR",
    },
    asOf: typeof data.timestamp === "string" ? data.timestamp : typeof data.last_update === "string" ? data.last_update : null,
  };
}

export function normalizeIndianOpenSearch(payload: IndianOpenSearch) {
  return (payload.results ?? []).map((item) => ({
    symbol: typeof item.symbol === "string" ? item.symbol.replace(/\.(NS|BO)$/i, "").toUpperCase() : "",
    name: typeof item.company_name === "string" ? item.company_name : "",
    exchange: "NSE/BSE",
    source: "Indian Stock Market API (0xramm)",
  })).filter((item) => item.symbol && item.name);
}
