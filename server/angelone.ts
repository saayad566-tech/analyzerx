import { markProviderHealthy, markProviderRejected } from "./provider-health";
import type { OptionContract, OptionSide } from "./derivatives";

const ANGELONE_API_BASE = "https://apiconnect.angelone.in";
const ANGELONE_DOCS_URL = "https://github.com/angel-one/smartapi-python";

type AngelOneSnapshot = {
  underlyingPrice: number | null;
  expiry: string | null;
  contracts: OptionContract[];
  pcr: number | null;
  maxPain: number | null;
  atmIv: number | null;
  source: string;
  sourceUrl: string;
};

type AngelOneConfig = {
  apiKey: string;
  clientId: string;
  accessToken: string;
  clientLocalIp: string;
  clientPublicIp: string;
  clientMacAddress: string;
};

function getConfig(): AngelOneConfig | null {
  const apiKey = process.env.ANGELONE_API_KEY?.trim();
  const clientId = process.env.ANGELONE_CLIENT_ID?.trim();
  const accessToken = (process.env.ANGELONE_ACCESS_TOKEN ?? process.env.ANGELONE_JWT_TOKEN)?.trim();
  const clientLocalIp = process.env.ANGELONE_CLIENT_LOCAL_IP?.trim();
  const clientPublicIp = process.env.ANGELONE_CLIENT_PUBLIC_IP?.trim();
  const clientMacAddress = process.env.ANGELONE_CLIENT_MAC_ADDRESS?.trim();
  if (!apiKey || !clientId || !accessToken || !clientLocalIp || !clientPublicIp || !clientMacAddress) return null;
  return { apiKey, clientId, accessToken, clientLocalIp, clientPublicIp, clientMacAddress };
}

function numberFrom(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/[^0-9.+-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
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
  return strikes.map((settlement) => ({
    settlement,
    loss: calls.reduce((sum, item) => sum + Math.max(settlement - item.strike, 0) * (item.openInterest ?? 0), 0) + puts.reduce((sum, item) => sum + Math.max(item.strike - settlement, 0) * (item.openInterest ?? 0), 0),
  })).sort((a, b) => a.loss - b.loss)[0]?.settlement ?? null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function first(value: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (value[key] !== undefined && value[key] !== null) return value[key];
  }
  return null;
}

function normalizeRows(payload: unknown): Array<Record<string, unknown>> {
  const root = asRecord(payload);
  const data = root.data ?? root.result ?? root.records ?? payload;
  if (Array.isArray(data)) return data.map(asRecord);
  const record = asRecord(data);
  for (const key of ["data", "records", "optionChain", "option_chain", "items", "list"]) {
    if (Array.isArray(record[key])) return (record[key] as unknown[]).map(asRecord);
  }
  return [];
}

function normalizeContract(row: Record<string, unknown>, fallbackSide?: OptionSide): OptionContract | null {
  const strike = numberFrom(first(row, ["strike", "strikePrice", "strike_price", "strikeprice"]));
  const sideValue = String(first(row, ["optionType", "option_type", "instrumentType", "side"]) ?? fallbackSide ?? "").toUpperCase();
  const side: OptionSide | null = sideValue.includes("PE") || sideValue.includes("PUT") ? "PE" : sideValue.includes("CE") || sideValue.includes("CALL") ? "CE" : fallbackSide ?? null;
  const expiry = String(first(row, ["expiry", "expiryDate", "expiry_date"]) ?? "");
  if (strike === null || !side || !expiry) return null;
  const greeks = asRecord(row.greeks);
  const openInterest = numberFrom(first(row, ["openInterest", "open_interest", "oi"]));
  const previousOpenInterest = numberFrom(first(row, ["previousOpenInterest", "previous_oi"]));
  return {
    strike,
    side,
    expiry,
    securityId: numberFrom(first(row, ["symboltoken", "symbolToken", "securityId", "security_id"])),
    lastPrice: numberFrom(first(row, ["lastPrice", "last_price", "ltp"])),
    volume: numberFrom(first(row, ["volume", "tradedVolume", "totalTradedVolume"])),
    openInterest,
    previousOpenInterest,
    changeInOpenInterest: numberFrom(first(row, ["changeInOpenInterest", "change_in_oi", "changeinOpenInterest"])) ?? (openInterest !== null && previousOpenInterest !== null ? openInterest - previousOpenInterest : null),
    impliedVolatility: numberFrom(first(row, ["impliedVolatility", "implied_volatility", "iv"])),
    delta: numberFrom(first(greeks, ["delta"])),
    gamma: numberFrom(first(greeks, ["gamma"])),
    theta: numberFrom(first(greeks, ["theta"])),
    vega: numberFrom(first(greeks, ["vega"])),
    bid: numberFrom(first(row, ["bid", "bidPrice", "bid_price"])),
    ask: numberFrom(first(row, ["ask", "askPrice", "ask_price"])),
  };
}

async function request(config: AngelOneConfig, path: string, method: "GET" | "POST", payload?: Record<string, unknown>) {
  const response = await fetch(`${ANGELONE_API_BASE}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.accessToken}`,
      "X-PrivateKey": config.apiKey,
      "X-UserType": "USER",
      "X-SourceID": "WEB",
      "X-ClientLocalIP": config.clientLocalIp,
      "X-ClientPublicIP": config.clientPublicIp,
      "X-MACAddress": config.clientMacAddress,
    },
    body: method === "POST" ? JSON.stringify(payload ?? {}) : undefined,
    signal: AbortSignal.timeout(8_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || (body && body.status === false)) {
    throw new Error(`Angel One SmartAPI ${path} returned HTTP ${response.status}${body?.message ? `: ${body.message}` : ""}`);
  }
  return body;
}

export async function fetchAngelOneSnapshot(symbol: string): Promise<AngelOneSnapshot> {
  const config = getConfig();
  if (!config) throw new Error("Angel One SmartAPI credentials are not configured");
  const startedAt = Date.now();
  try {
    const payloadText = process.env.ANGELONE_OPTION_GREEK_PAYLOAD_JSON;
    const payload = payloadText ? JSON.parse(payloadText) as Record<string, unknown> : { name: symbol, expirydate: process.env.ANGELONE_OPTION_EXPIRY ?? "" };
    const response = await request(config, "/rest/secure/angelbroking/marketData/v1/optionGreek", "POST", payload);
    const contracts = normalizeRows(response).map((row) => normalizeContract(row)).filter((row): row is OptionContract => row !== null);
    if (!contracts.length) {
      const pcrResponse = await request(config, "/rest/secure/angelbroking/marketData/v1/putCallRatio", "GET");
      const pcr = numberFrom(first(asRecord(pcrResponse.data), ["pcr", "putCallRatio", "put_call_ratio"]));
      throw new Error(`Angel One returned no normalized option contracts${pcr !== null ? `; PCR=${pcr} only` : ""}`);
    }
    const expiry = contracts[0]?.expiry ?? null;
    const underlyingPrice = numberFrom(first(asRecord(response.data), ["underlyingPrice", "underlying_price", "ltp", "lastPrice"]));
    const atm = contracts.filter((item) => underlyingPrice !== null && Math.abs(item.strike - underlyingPrice) <= Math.max(50, underlyingPrice * 0.02));
    const ivValues = atm.map((item) => item.impliedVolatility).filter((value): value is number => value !== null);
    markProviderHealthy("angelone-smartapi", Date.now() - startedAt, { symbol, contractCount: contracts.length });
    return { underlyingPrice, expiry, contracts, pcr: calculatePcr(contracts), maxPain: calculateMaxPain(contracts), atmIv: ivValues.length ? ivValues.reduce((sum, value) => sum + value, 0) / ivValues.length : null, source: "Angel One SmartAPI option Greek", sourceUrl: ANGELONE_DOCS_URL };
  } catch (error) {
    markProviderRejected("angelone-smartapi", error, Date.now() - startedAt);
    throw error;
  }
}

export function getAngelOneSourceCatalog() {
  return { name: "Angel One SmartAPI", url: ANGELONE_DOCS_URL, mode: "optional authenticated read-only fallback", configured: Boolean(getConfig()), endpoints: ["optionGreek", "putCallRatio", "OIBuildup"] } as const;
}
