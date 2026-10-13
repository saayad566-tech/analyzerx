import { percentChangeConvention } from "../lib/flows-semantics";

export type InstitutionalParticipant = "FII/FPI" | "DII";
export type FlowRange = "TODAY" | "THREE_DAYS" | "ONE_WEEK" | "ONE_MONTH" | "QTD";

export type InstitutionalFlowRow = {
  participant: InstitutionalParticipant;
  buy: number | null;
  sell: number | null;
  net: number | null;
};

export type InstitutionalHistoryRecord = {
  reportDate: string;
  rows: InstitutionalFlowRow[];
};

export type InstitutionalFlowComparison = {
  participant: InstitutionalParticipant;
  currentNet: number | null;
  previousNet: number | null;
  changePct: number | null;
};

export type NseInstitutionalFlows = {
  status: NseFlowStatus;
  source: string;
  upstream: "NSE" | "NSE via intermediary";
  reportDate: string | null;
  fetchedAt: string;
  freshnessLabel: string;
  freshnessBusinessDays: number | null;
  rows: InstitutionalFlowRow[];
  history: InstitutionalHistoryRecord[];
  range: FlowRange;
  rangeLabel: string;
  comparison: InstitutionalFlowComparison[];
  error: string | null;
};

const DEFAULT_UPSTREAM_URL = "https://fii-diidata.mrchartist.com/api/data";
const DEFAULT_HISTORY_URL = "https://fii-diidata.mrchartist.com/api/history";
const DEFAULT_TIMEOUT_MS = 8_000;

export const flowRangeMeta: Record<FlowRange, { label: string; description: string }> = {
  TODAY: { label: "Today", description: "Latest available session" },
  THREE_DAYS: { label: "Last 3 days", description: "Latest three available sessions" },
  ONE_WEEK: { label: "Last 1 week", description: "Latest five available sessions" },
  ONE_MONTH: { label: "Last 1 month", description: "Latest twenty-two available sessions" },
  QTD: { label: "Quarter to date", description: "Available sessions since the current quarter began" },
};

function numberFrom(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[,₹\s]/g, "").replace(/[()]/g, "-");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstNumber(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = numberFrom(source[key]);
    if (value !== null) return value;
  }
  return null;
}

function normalizeDate(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value > 10_000_000_000 ? value : value * 1000);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }
  if (typeof value !== "string") return null;
  const match = value.match(/(\d{4})[-/]([01]?\d)[-/]([0-3]?\d)/);
  if (match) return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  const dayFirst = value.match(/([0-3]?\d)[-/]([01]?\d)[-/](\d{4})/);
  if (dayFirst) return `${dayFirst[3]}-${dayFirst[2].padStart(2, "0")}-${dayFirst[1].padStart(2, "0")}`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function getRecord(payload: unknown): Record<string, unknown> {
  if (Array.isArray(payload)) {
    const first = payload.find((item) => item && typeof item === "object" && !Array.isArray(item));
    return first as Record<string, unknown> ?? {};
  }
  if (!payload || typeof payload !== "object") return {};
  const root = payload as Record<string, unknown>;
  for (const key of ["data", "result", "latest"]) {
    if (root[key] && typeof root[key] === "object" && !Array.isArray(root[key])) return root[key] as Record<string, unknown>;
    if (Array.isArray(root[key])) return getRecord(root[key]);
  }
  return root;
}

function getHistoryRecords(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  for (const key of ["history", "data", "result", "records", "items"]) {
    if (Array.isArray(root[key])) return root[key] as unknown[];
  }
  return [payload];
}

function participantRow(source: Record<string, unknown>, participant: InstitutionalParticipant): InstitutionalFlowRow {
  const prefix = participant === "FII/FPI" ? ["fii", "fpi", "foreign"] : ["dii", "domestic"];
  const keys = (suffix: string) => prefix.flatMap((prefixKey) => [`${prefixKey}_${suffix}`, `${prefixKey}${suffix}`, `${prefixKey}${suffix[0].toUpperCase()}${suffix.slice(1)}`]);
  const buy = firstNumber(source, keys("buy").concat(keys("purchase")));
  const sell = firstNumber(source, keys("sell").concat(keys("sale")));
  const net = firstNumber(source, keys("net"));
  return { participant, buy, sell, net: net ?? (buy !== null && sell !== null ? Number((buy - sell).toFixed(2)) : null) };
}

export function parseNseJson(payload: unknown): { reportDate: string | null; rows: InstitutionalFlowRow[] } {
  const source = getRecord(payload);
  const reportDate = normalizeDate(source.date ?? source.report_date ?? source.reportDate ?? source.d ?? source.timestamp ?? source.updated_at);
  const fii = { ...source, fii_buy: source.fii_buy ?? source.fb, fii_sell: source.fii_sell ?? source.fs, fii_net: source.fii_net ?? source.fn };
  const dii = { ...source, dii_buy: source.dii_buy ?? source.db, dii_sell: source.dii_sell ?? source.ds, dii_net: source.dii_net ?? source.dn };
  return { reportDate, rows: [participantRow(fii, "FII/FPI"), participantRow(dii, "DII")] };
}

export function parseNseHistory(payload: unknown): InstitutionalHistoryRecord[] {
  const records = getHistoryRecords(payload);
  const normalized = records.flatMap((record) => {
    const parsed = parseNseJson(record);
    return parsed.reportDate ? [{ reportDate: parsed.reportDate, rows: parsed.rows }] : [];
  });
  const byDate = new Map<string, InstitutionalHistoryRecord>();
  for (const record of normalized) byDate.set(record.reportDate, record);
  return [...byDate.values()].sort((a, b) => b.reportDate.localeCompare(a.reportDate));
}

function splitCsvLine(line: string) {
  return line.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).map((cell) => cell.trim().replace(/^\"|\"$/g, ""));
}

export function parseNseCsv(csv: string): { reportDate: string | null; rows: InstitutionalFlowRow[] } {
  const lines = csv.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return { reportDate: null, rows: [] };
  const headers = splitCsvLine(lines[0]).map((header) => header.toLowerCase().replace(/[^a-z0-9]+/g, "_"));
  const records = lines.slice(1).map((line) => Object.fromEntries(splitCsvLine(line).map((value, index) => [headers[index], value])));
  const reportDate = normalizeDate(records[0]?.date ?? records[0]?.report_date ?? records[0]?.trade_date);
  const findRow = (names: string[]) => records.find((record) => names.some((name) => String(record.participant ?? record.category ?? record.client_type ?? "").toLowerCase().includes(name)));
  const toRow = (record: Record<string, string> | undefined, participant: InstitutionalParticipant): InstitutionalFlowRow => {
    if (!record) return { participant, buy: null, sell: null, net: null };
    const buy = numberFrom(record.buy_value ?? record.buy ?? record.purchase_value);
    const sell = numberFrom(record.sell_value ?? record.sell ?? record.sale_value);
    const net = numberFrom(record.net_value ?? record.net);
    return { participant, buy, sell, net: net ?? (buy !== null && sell !== null ? Number((buy - sell).toFixed(2)) : null) };
  };
  return { reportDate, rows: [toRow(findRow(["fii", "fpi", "foreign"]), "FII/FPI"), toRow(findRow(["dii", "domestic"]), "DII")] };
}

function isWeekday(date: Date) {
  const day = date.getUTCDay();
  return day !== 0 && day !== 6;
}

export function businessDayDistance(reportDate: string, now = new Date()) {
  const start = new Date(`${reportDate}T00:00:00.000Z`);
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (Number.isNaN(start.getTime()) || start > end) return null;
  let count = 0;
  for (const cursor = new Date(start); cursor < end; cursor.setUTCDate(cursor.getUTCDate() + 1)) if (isWeekday(cursor)) count += 1;
  return count;
}

export function classifyNseFreshness(reportDate: string | null, now = new Date()): { status: NseFlowStatus; label: string; businessDays: number | null } {
  if (!reportDate) return { status: "unavailable", label: "Report date unavailable", businessDays: null };
  const businessDays = businessDayDistance(reportDate, now);
  if (businessDays === null) return { status: "unavailable", label: "Report date invalid", businessDays: null };
  if (businessDays <= 1) return { status: "fresh", label: "Latest available NSE report", businessDays };
  return { status: "stale", label: `${businessDays} business days old · latest available report shown`, businessDays };
}

function rangeRecords(history: InstitutionalHistoryRecord[], range: FlowRange): { current: InstitutionalHistoryRecord[]; previous: InstitutionalHistoryRecord[] } {
  if (!history.length) return { current: [], previous: [] };
  if (range === "TODAY") return { current: history.slice(0, 1), previous: history.slice(1, 2) };
  if (range === "QTD") {
    const anchor = new Date(`${history[0].reportDate}T00:00:00.000Z`);
    const quarterStartMonth = Math.floor(anchor.getUTCMonth() / 3) * 3;
    const quarterStart = new Date(Date.UTC(anchor.getUTCFullYear(), quarterStartMonth, 1));
    const current = history.filter((item) => new Date(`${item.reportDate}T00:00:00.000Z`) >= quarterStart);
    return { current, previous: history.slice(current.length, current.length * 2) };
  }
  const size = range === "THREE_DAYS" ? 3 : range === "ONE_WEEK" ? 5 : 22;
  return { current: history.slice(0, size), previous: history.slice(size, size * 2) };
}

function aggregate(records: InstitutionalHistoryRecord[]): InstitutionalFlowRow[] {
  return (["FII/FPI", "DII"] as InstitutionalParticipant[]).map((participant) => {
    const rows = records.map((record) => record.rows.find((row) => row.participant === participant)).filter((row): row is InstitutionalFlowRow => Boolean(row));
    const add = (key: "buy" | "sell" | "net") => {
      const values = rows.map((row) => row[key]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      return values.length ? Number(values.reduce((sum, value) => sum + value, 0).toFixed(2)) : null;
    };
    return { participant, buy: add("buy"), sell: add("sell"), net: add("net") };
  });
}

function percentChange(current: number | null, previous: number | null) {
  // Documented convention (FIX 06): a signed net-flow quantity has no meaningful
  // percentage change when the prior period was zero, or when the sign flipped
  // between periods. Those cases return null rather than a misleading figure.
  return percentChangeConvention(current, previous).pct;
}

function buildRangeResult(base: { status: NseFlowStatus; source: string; upstream: "NSE" | "NSE via intermediary"; reportDate: string | null; fetchedAt: string; freshnessLabel: string; freshnessBusinessDays: number | null; error: string | null }, history: InstitutionalHistoryRecord[], range: FlowRange) {
  const windows = rangeRecords(history, range);
  const rows = aggregate(windows.current);
  const previousRows = aggregate(windows.previous);
  const comparison = rows.map((row) => ({ participant: row.participant, currentNet: row.net, previousNet: previousRows.find((item) => item.participant === row.participant)?.net ?? null, changePct: percentChange(row.net, previousRows.find((item) => item.participant === row.participant)?.net ?? null) }));
  const actualRangeLabel = `${flowRangeMeta[range].label} · ${windows.current.length} session${windows.current.length === 1 ? "" : "s"} available`;
  return { ...base, rows, history, range, rangeLabel: actualRangeLabel, comparison };
}

export async function fetchNseInstitutionalFlows(options: { now?: Date; timeoutMs?: number; range?: FlowRange } = {}): Promise<NseInstitutionalFlows> {
  const fetchedAt = new Date().toISOString();
  const range = options.range ?? "TODAY";
  const directUrl = process.env.NSE_FII_DII_DIRECT_DATA_URL || process.env.NSE_FII_DII_REPORT_URL;
  const configuredApiUrl = process.env.NSE_FII_DII_API_URL;
  const isConfiguredReferencePage = Boolean(directUrl && /nseindia\.com\/reports\/fii-dii\/?$/i.test(directUrl));
  const candidates = [...new Set((isConfiguredReferencePage ? [configuredApiUrl, DEFAULT_HISTORY_URL, DEFAULT_UPSTREAM_URL] : [directUrl, configuredApiUrl, DEFAULT_UPSTREAM_URL, DEFAULT_HISTORY_URL]).filter((value): value is string => Boolean(value)))];
  const failures: string[] = [];
  let latestFallback: NseInstitutionalFlows | null = null;
  for (const url of candidates) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const isDirectNse = url === directUrl;
    try {
      const response = await fetch(url, { headers: { Accept: isDirectNse ? "text/csv,text/plain" : "application/json" }, signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentType = response.headers.get("content-type") ?? "";
      const body = await response.text();
      const parsedHistory = isDirectNse || contentType.includes("csv") || body.trimStart().startsWith("Date,") ? (() => { const parsed = parseNseCsv(body); return parsed.reportDate ? [{ reportDate: parsed.reportDate, rows: parsed.rows }] : []; })() : parseNseHistory(JSON.parse(body));
      if (!parsedHistory.length) { failures.push(`${url}: no usable FII/DII values`); continue; }
      const latest = parsedHistory[0];
      const hasData = latest.rows.some((row) => row.net !== null || row.buy !== null || row.sell !== null);
      if (!hasData) { failures.push(`${url}: no usable FII/DII values`); continue; }
      const freshness = classifyNseFreshness(latest.reportDate, options.now);
      const base = { status: freshness.status, source: url, upstream: isDirectNse ? "NSE" as const : "NSE via intermediary" as const, reportDate: latest.reportDate, fetchedAt, freshnessLabel: freshness.label, freshnessBusinessDays: freshness.businessDays, error: isDirectNse ? null : directUrl ? `Official NSE source unavailable; intermediary fallback used. ${failures.join("; ")}` : null };
      const result = buildRangeResult(base, parsedHistory, range);
      if (range === "TODAY" || parsedHistory.length > 1 || url === DEFAULT_HISTORY_URL) return result;
      latestFallback = result;
    } catch (error) {
      failures.push(`${url}: ${String(error)}`);
    } finally { clearTimeout(timeout); }
  }
  if (latestFallback) return { ...latestFallback, error: latestFallback.error ? `${latestFallback.error} Historical range unavailable; latest session shown.` : `Historical range unavailable; latest session shown. ${failures.join("; ")}` };
  const source = candidates[0] ?? DEFAULT_UPSTREAM_URL;
  return { status: "error", source, upstream: source === directUrl && !isConfiguredReferencePage ? "NSE" : "NSE via intermediary", reportDate: null, fetchedAt, freshnessLabel: "All configured flow providers unavailable", freshnessBusinessDays: null, rows: [], history: [], range, rangeLabel: `${flowRangeMeta[range].label} · unavailable`, comparison: [], error: failures.join("; ") || "No institutional-flow provider is configured." };
}

type NseFlowStatus = "fresh" | "stale" | "unavailable" | "error";
