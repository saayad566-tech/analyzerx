export type SecurityWiseFlow = {
  symbol: string;
  reportDate: string | null;
  fiiBuy: number | null;
  fiiSell: number | null;
  fiiNet: number | null;
  diiBuy: number | null;
  diiSell: number | null;
  diiNet: number | null;
  source: string;
};

function numberFrom(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/[₹,\s]/g, "").replace(/[()]/g, "-"));
  return Number.isFinite(parsed) ? parsed : null;
}

function dateFrom(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function recordList(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  for (const key of ["data", "rows", "records", "items", "results"]) if (Array.isArray(root[key])) return recordList(root[key]);
  return [root];
}

function first(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) if (record[key] !== undefined && record[key] !== null) return record[key];
  return null;
}

function normalize(record: Record<string, unknown>, source: string): SecurityWiseFlow | null {
  const rawSymbol = first(record, ["symbol", "ticker", "security", "security_code", "scrip", "scrip_code"]);
  const symbol = typeof rawSymbol === "string" ? rawSymbol.trim().toUpperCase() : String(rawSymbol ?? "").trim().toUpperCase();
  if (!symbol) return null;
  const fiiBuy = numberFrom(first(record, ["fii_buy", "fpi_buy", "foreign_buy", "fiiPurchase"]));
  const fiiSell = numberFrom(first(record, ["fii_sell", "fpi_sell", "foreign_sell", "fiiSale"]));
  const fiiNetValue = numberFrom(first(record, ["fii_net", "fpi_net", "foreign_net", "fiiNet"]));
  const diiBuy = numberFrom(first(record, ["dii_buy", "domestic_buy", "diiPurchase"]));
  const diiSell = numberFrom(first(record, ["dii_sell", "domestic_sell", "diiSale"]));
  const diiNetValue = numberFrom(first(record, ["dii_net", "domestic_net", "diiNet"]));
  const fiiNet = fiiNetValue ?? (fiiBuy !== null && fiiSell !== null ? Number((fiiBuy - fiiSell).toFixed(2)) : null);
  const diiNet = diiNetValue ?? (diiBuy !== null && diiSell !== null ? Number((diiBuy - diiSell).toFixed(2)) : null);
  if (fiiBuy === null && fiiSell === null && fiiNet === null && diiBuy === null && diiSell === null && diiNet === null) return null;
  return { symbol, reportDate: dateFrom(first(record, ["date", "report_date", "reportDate", "trade_date"])), fiiBuy, fiiSell, fiiNet, diiBuy, diiSell, diiNet, source };
}

export async function fetchSecurityWiseFlows(options: { timeoutMs?: number; sourceUrl?: string } = {}): Promise<{ available: boolean; source: string | null; reportDate: string | null; rows: SecurityWiseFlow[]; error: string | null }> {
  const sourceUrl = options.sourceUrl ?? process.env.NSE_SECURITYWISE_FLOW_URL ?? process.env.SECURITYWISE_FLOW_URL;
  if (!sourceUrl) return { available: false, source: null, reportDate: null, rows: [], error: "No authorized security-wise institutional-flow source is configured." };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8_000);
  try {
    const response = await fetch(sourceUrl, { headers: { Accept: "application/json,text/csv" }, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.text();
    const payload = JSON.parse(body) as unknown;
    const rows = recordList(payload).map((record) => normalize(record, sourceUrl)).filter((row): row is SecurityWiseFlow => Boolean(row));
    const reportDate = rows.map((row) => row.reportDate).find((value): value is string => Boolean(value)) ?? null;
    if (!rows.length) throw new Error("Source returned no validated security-wise FII/DII rows");
    return { available: true, source: sourceUrl, reportDate, rows, error: null };
  } catch (error) {
    return { available: false, source: sourceUrl, reportDate: null, rows: [], error: String(error) };
  } finally {
    clearTimeout(timer);
  }
}

export function parseSecurityWiseRows(payload: unknown, source: string): SecurityWiseFlow[] {
  return recordList(payload).map((record) => normalize(record, source)).filter((row): row is SecurityWiseFlow => Boolean(row));
}

export function securityWiseFlowForSymbol(rows: SecurityWiseFlow[], symbol: string) {
  return rows.find((row) => row.symbol === symbol.trim().toUpperCase()) ?? null;
}

export function rankSecurityWiseFlows(rows: SecurityWiseFlow[], key: "fiiNet" | "diiNet") {
  return [...rows].filter((row) => row[key] !== null).sort((a, b) => (b[key] as number) - (a[key] as number));
}
