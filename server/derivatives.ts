import { markProviderHealthy, markProviderRejected } from "./provider-health";
import { fetchAngelOneSnapshot, getAngelOneSourceCatalog } from "./angelone";

export type DerivativesStatus = "fresh" | "stale" | "unavailable" | "auth_required" | "error";
export type OptionSide = "CE" | "PE";

export type OptionContract = {
  strike: number;
  side: OptionSide;
  expiry: string;
  securityId: number | null;
  lastPrice: number | null;
  volume: number | null;
  openInterest: number | null;
  previousOpenInterest: number | null;
  changeInOpenInterest: number | null;
  impliedVolatility: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  bid: number | null;
  ask: number | null;
};

export type DerivativesSnapshot = {
  symbol: string;
  underlyingPrice: number | null;
  expiry: string | null;
  contracts: OptionContract[];
  pcr: number | null;
  maxPain: number | null;
  atmIv: number | null;
  status: DerivativesStatus;
  source: string;
  sourceUrl: string;
  fetchedAt: string;
  freshness: string;
  error: string | null;
  nextStep: string;
};

type DhanOptionData = {
  average_price?: unknown;
  greeks?: { delta?: unknown; gamma?: unknown; theta?: unknown; vega?: unknown };
  implied_volatility?: unknown;
  last_price?: unknown;
  oi?: unknown;
  previous_oi?: unknown;
  security_id?: unknown;
  top_ask_price?: unknown;
  top_bid_price?: unknown;
  volume?: unknown;
};

type DhanOptionResponse = {
  data?: { last_price?: unknown; oc?: Record<string, { ce?: DhanOptionData; pe?: DhanOptionData }> };
  status?: string;
  errorCode?: string;
  remarks?: string;
};

type NseOptionLeg = {
  strikePrice?: unknown;
  expiryDate?: unknown;
  underlyingValue?: unknown;
  lastPrice?: unknown;
  totalTradedVolume?: unknown;
  openInterest?: unknown;
  changeinOpenInterest?: unknown;
  impliedVolatility?: unknown;
  delta?: unknown;
  gamma?: unknown;
  theta?: unknown;
  vega?: unknown;
  bidprice?: unknown;
  askPrice?: unknown;
};

type NseOptionRow = { strikePrice?: unknown; expiryDate?: unknown; underlyingValue?: unknown; CE?: NseOptionLeg; PE?: NseOptionLeg };

type NseOptionResponse = { records?: { data?: NseOptionRow[] }; filtered?: { data?: NseOptionRow[] } };

const NSE_OPTION_API_BASE = "https://www.nseindia.com";
const FREE_REFERENCE_TIMEOUT_MS = 1_500;
const NSE_PUBLIC_HEADERS = {
  accept: "application/json,text/plain,*/*",
  "accept-language": "en-IN,en;q=0.9",
  "user-agent": "Mozilla/5.0 (compatible; AnalyzerX/1.0; +https://marketevent-i4bj664j.manus.space)",
};

function nseOptionUrl(symbol: string) {
  const indexSymbols = new Set(["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "NIFTYNXT50"]);
  const path = indexSymbols.has(symbol) ? "/api/option-chain-indices" : "/api/option-chain-equities";
  return `${NSE_OPTION_API_BASE}${path}?symbol=${encodeURIComponent(symbol)}`;
}

function cookieHeader(response: Response) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie().map((item) => item.split(";", 1)[0]).join("; ");
  return response.headers.get("set-cookie")?.split(",").map((item) => item.split(";", 1)[0]).join("; ") ?? "";
}

function normalizeNseLeg(strike: number, side: OptionSide, expiry: string, leg: NseOptionLeg): OptionContract {
  const openInterest = finiteNumber(leg.openInterest);
  const previousOpenInterest = openInterest !== null && finiteNumber(leg.changeinOpenInterest) !== null ? openInterest - (finiteNumber(leg.changeinOpenInterest) as number) : null;
  return { strike, side, expiry, securityId: null, lastPrice: finiteNumber(leg.lastPrice), volume: finiteNumber(leg.totalTradedVolume), openInterest, previousOpenInterest, changeInOpenInterest: finiteNumber(leg.changeinOpenInterest), impliedVolatility: finiteNumber(leg.impliedVolatility), delta: finiteNumber(leg.delta), gamma: finiteNumber(leg.gamma), theta: finiteNumber(leg.theta), vega: finiteNumber(leg.vega), bid: finiteNumber(leg.bidprice), ask: finiteNumber(leg.askPrice) };
}

async function fetchNseReferenceSnapshot(symbol: string): Promise<DerivativesSnapshot> {
  const startedAt = Date.now();
  const home = await fetch(`${NSE_OPTION_API_BASE}/option-chain`, { headers: NSE_PUBLIC_HEADERS, signal: AbortSignal.timeout(FREE_REFERENCE_TIMEOUT_MS) });
  if (!home.ok) throw new Error(`NSE public reference returned HTTP ${home.status}`);
  const cookies = cookieHeader(home);
  const response = await fetch(nseOptionUrl(symbol), { headers: { ...NSE_PUBLIC_HEADERS, ...(cookies ? { cookie: cookies } : {}) }, signal: AbortSignal.timeout(FREE_REFERENCE_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`NSE public option reference returned HTTP ${response.status}`);
  const payload = await response.json() as NseOptionResponse;
  const rows = payload.records?.data ?? payload.filtered?.data ?? [];
  const contracts = rows.flatMap((row) => {
    const strike = finiteNumber(row.strikePrice);
    const expiry = typeof row.expiryDate === "string" ? row.expiryDate : "";
    if (strike === null || !expiry) return [];
    return [row.CE ? normalizeNseLeg(strike, "CE", expiry, row.CE) : null, row.PE ? normalizeNseLeg(strike, "PE", expiry, row.PE) : null].filter((item): item is OptionContract => item !== null);
  });
  const expiry = contracts[0]?.expiry ?? null;
  const underlyingPrice = finiteNumber(rows[0]?.underlyingValue);
  if (!contracts.length) throw new Error("NSE public reference returned no normalized option contracts");
  const ivValues = contracts.filter((item) => underlyingPrice !== null && Math.abs(item.strike - underlyingPrice) <= Math.max(50, underlyingPrice * 0.02)).map((item) => item.impliedVolatility).filter((item): item is number => item !== null);
  markProviderHealthy("nse-free-reference", Date.now() - startedAt, { symbol, contractCount: contracts.length });
  return { symbol, underlyingPrice, expiry, contracts, pcr: calculatePcr(contracts), maxPain: calculateMaxPain(contracts), atmIv: ivValues.length ? ivValues.reduce((sum, value) => sum + value, 0) / ivValues.length : null, status: "fresh", source: "NSE public option-chain reference", sourceUrl: NSE_OPTION_CHAIN_URL, fetchedAt: new Date().toISOString(), freshness: "Fetched during this request; public reference feed", error: null, nextStep: "Public NSE reference data is rate-limited and may become stale or unavailable; verify the timestamp before acting." };
}

async function fetchWithFreeFallback(symbol: string, primaryError: unknown): Promise<DerivativesSnapshot> {
  let angelOneError: unknown = null;
  try {
    const snapshot = await fetchAngelOneSnapshot(symbol);
    return { ...snapshot, symbol, status: "fresh", fetchedAt: new Date().toISOString(), freshness: "Fetched during this request", error: null, nextStep: "Use the Angel One response timestamp and provider status when interpreting OI, IV, and Greeks." };
  } catch (error) {
    angelOneError = error;
  }
  try { return await fetchNseReferenceSnapshot(symbol); } catch (fallbackError) {
    return buildUnavailable(symbol, /credentials|Unauthorized|401|403/i.test(String(primaryError)) ? "auth_required" : "error", `Dhan failed: ${String(primaryError)}; Angel One failed: ${String(angelOneError)}; NSE free reference failed: ${String(fallbackError)}`, "Configure Dhan or Angel One SmartAPI for authenticated data; the free NSE reference remains bounded and may be unavailable.");
  }
}

function getDhanApiBaseUrl() {
  return (process.env.DHAN_API_BASE_URL || "https://api.dhan.co/v2").replace(/\/+$/, "");
}

function getDhanOptionChainUrl() {
  return `${getDhanApiBaseUrl()}/optionchain`;
}

function getDhanExpiryUrl() {
  return `${getDhanApiBaseUrl()}/optionchain/expirylist`;
}
const DHAN_DOCS_URL = "https://dhanhq.co/docs/v2/option-chain/";
const NSE_OPTION_CHAIN_URL = "https://www.nseindia.com/option-chain";

const underlyingMap: Record<string, { securityId: number; segment: "NSE_EQ" }> = {
  ADANIENT: { securityId: 25, segment: "NSE_EQ" },
  ADANIPORTS: { securityId: 15083, segment: "NSE_EQ" },
  RELIANCE: { securityId: 2885, segment: "NSE_EQ" },
  TCS: { securityId: 11536, segment: "NSE_EQ" },
  INFY: { securityId: 1594, segment: "NSE_EQ" },
  LT: { securityId: 11483, segment: "NSE_EQ" },
};

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/[^0-9.+-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSymbol(symbol: string) {
  return symbol.trim().toUpperCase().replace(/\.(NS|BO)$/, "");
}

function calculatePcr(contracts: OptionContract[]) {
  const puts = contracts.filter((item) => item.side === "PE").reduce((sum, item) => sum + (item.openInterest ?? 0), 0);
  const calls = contracts.filter((item) => item.side === "CE").reduce((sum, item) => sum + (item.openInterest ?? 0), 0);
  return calls > 0 ? puts / calls : null;
}

function calculateMaxPain(contracts: OptionContract[]) {
  const strikes = [...new Set(contracts.map((item) => item.strike))].sort((a, b) => a - b);
  if (!strikes.length) return null;
  const calls = contracts.filter((item) => item.side === "CE");
  const puts = contracts.filter((item) => item.side === "PE");
  const losses = strikes.map((settlement) => {
    const callLoss = calls.reduce((sum, item) => sum + Math.max(settlement - item.strike, 0) * (item.openInterest ?? 0), 0);
    const putLoss = puts.reduce((sum, item) => sum + Math.max(item.strike - settlement, 0) * (item.openInterest ?? 0), 0);
    return { settlement, loss: callLoss + putLoss };
  });
  return losses.sort((a, b) => a.loss - b.loss)[0]?.settlement ?? null;
}

function normalizeContract(strikeText: string, side: OptionSide, expiry: string, raw: DhanOptionData): OptionContract | null {
  const strike = finiteNumber(strikeText);
  if (strike === null) return null;
  const previousOpenInterest = finiteNumber(raw.previous_oi);
  const openInterest = finiteNumber(raw.oi);
  const greeks = raw.greeks ?? {};
  return {
    strike,
    side,
    expiry,
    securityId: finiteNumber(raw.security_id),
    lastPrice: finiteNumber(raw.last_price),
    volume: finiteNumber(raw.volume),
    openInterest,
    previousOpenInterest,
    changeInOpenInterest: openInterest !== null && previousOpenInterest !== null ? openInterest - previousOpenInterest : null,
    impliedVolatility: finiteNumber(raw.implied_volatility),
    delta: finiteNumber(greeks.delta),
    gamma: finiteNumber(greeks.gamma),
    theta: finiteNumber(greeks.theta),
    vega: finiteNumber(greeks.vega),
    bid: finiteNumber(raw.top_bid_price),
    ask: finiteNumber(raw.top_ask_price),
  };
}

function buildUnavailable(symbol: string, status: DerivativesStatus, error: string, nextStep: string): DerivativesSnapshot {
  return {
    symbol,
    underlyingPrice: null,
    expiry: null,
    contracts: [],
    pcr: null,
    maxPain: null,
    atmIv: null,
    status,
    source: "No verified live derivatives provider",
    sourceUrl: DHAN_DOCS_URL,
    fetchedAt: new Date().toISOString(),
    freshness: "No verified option-chain timestamp",
    error,
    nextStep,
  };
}

async function dhanRequest<T>(url: string, payload: Record<string, unknown>): Promise<T> {
  const token = process.env.DHAN_ACCESS_TOKEN;
  const clientId = process.env.DHAN_CLIENT_ID;
  if (!token || !clientId) throw new Error("Dhan read-only credentials are not configured");
  const response = await fetch(url, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "access-token": token, "client-id": clientId },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Dhan option-chain returned HTTP ${response.status}`);
  return await response.json() as T;
}

async function chooseExpiry(underlying: { securityId: number; segment: string }) {
  const response = await dhanRequest<{ data?: unknown }>(getDhanExpiryUrl(), { UnderlyingScrip: underlying.securityId, UnderlyingSeg: underlying.segment });
  const expiries = Array.isArray(response.data) ? response.data.filter((item): item is string => typeof item === "string") : [];
  return expiries.sort()[0] ?? null;
}

export async function fetchDerivativesSnapshot(requestedSymbol: string, marketId: MarketId): Promise<DerivativesSnapshot> {
  const symbol = normalizeSymbol(requestedSymbol);
  const underlying = underlyingMap[symbol];
  if (!underlying) return buildUnavailable(symbol, "unavailable", "No validated Dhan or NSE underlying mapping is configured for this symbol.", "Add a validated exchange symbol mapping before enabling option-chain retrieval.");
  const startedAt = Date.now();
  try {
    const expiry = await chooseExpiry(underlying);
    if (!expiry) return await fetchWithFreeFallback(symbol, "Dhan returned no active expiry for this underlying");
    const response = await dhanRequest<DhanOptionResponse>(getDhanOptionChainUrl(), { UnderlyingScrip: underlying.securityId, UnderlyingSeg: underlying.segment, Expiry: expiry });
    const rows = response.data?.oc ?? {};
    const contracts = Object.entries(rows).flatMap(([strike, pair]) => [
      pair.ce ? normalizeContract(strike, "CE", expiry, pair.ce) : null,
      pair.pe ? normalizeContract(strike, "PE", expiry, pair.pe) : null,
    ].filter((item): item is OptionContract => item !== null));
    if (!contracts.length) return await fetchWithFreeFallback(symbol, "Dhan returned an empty option chain");
    const underlyingPrice = finiteNumber(response.data?.last_price);
    const atTheMoney = contracts.filter((item) => underlyingPrice !== null && Math.abs(item.strike - underlyingPrice) <= Math.max(50, underlyingPrice * 0.02));
    const ivValues = atTheMoney.map((item) => item.impliedVolatility).filter((item): item is number => item !== null);
    markProviderHealthy("dhan-mcp", Date.now() - startedAt, { symbol, expiry, contractCount: contracts.length });
    return {
      symbol,
      underlyingPrice,
      expiry,
      contracts,
      pcr: calculatePcr(contracts),
      maxPain: calculateMaxPain(contracts),
      atmIv: ivValues.length ? ivValues.reduce((sum, value) => sum + value, 0) / ivValues.length : null,
      status: "fresh",
      source: getDhanApiBaseUrl().includes("sandbox.dhan.co") ? "DhanHQ Sandbox Option Chain API" : "DhanHQ Option Chain API",
      sourceUrl: DHAN_DOCS_URL,
      fetchedAt: new Date().toISOString(),
      freshness: "Fetched during this request",
      error: null,
      nextStep: "Use the expiry timestamp and provider response time when interpreting OI, IV, and Greeks.",
    };
  } catch (error) {
    const message = String(error);
    markProviderRejected("dhan-mcp", error, Date.now() - startedAt);
    const status: DerivativesStatus = /credentials|Unauthorized|401|403/i.test(message) ? "auth_required" : "error";
    return await fetchWithFreeFallback(symbol, error);
  }
}

export function getDerivativesSourceCatalog() {
  return {
    primary: { name: "DhanHQ Option Chain API", url: DHAN_DOCS_URL, mode: "authenticated read-only", baseUrl: getDhanApiBaseUrl() },
    fallback: getAngelOneSourceCatalog(),
    reference: { name: "NSE official option chain", url: NSE_OPTION_CHAIN_URL, mode: "public delayed/manual verification subject to NSE terms" },
    fields: ["expiry", "strike", "option type", "last price", "volume", "open interest", "change in OI", "IV", "delta", "gamma", "theta", "vega", "PCR", "max pain", "timestamp"],
  } as const;
}
