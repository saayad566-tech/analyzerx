/**
 * OHLCV ingestion.
 *
 * Users can bring their own history as CSV or JSON. Parsing is strict and reports what it dropped
 * and why, rather than silently coercing nonsense into candles — a backtest over a corrupted series
 * is worse than no backtest, because it looks like an answer.
 */
import type { Candle } from "./types";

export type OhlcvIssue = { line: number; reason: string };
export type ParseResult =
  | { status: "ok"; candles: Candle[]; dropped: number; issues: OhlcvIssue[]; notes: string[] }
  | { status: "error"; reason: string };

const DAY_MS = 86_400_000;

function toNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const cleaned = raw.trim().replace(/["']/g, "").replace(/[,\s]/g, "").replace(/^[$₹€£]/, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** Parse a timestamp cell into epoch milliseconds, or null when it is not a time. */
export function parseTimestamp(raw: string | number | undefined): number | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "number") return normalizeEpoch(raw);
  const trimmed = String(raw).trim().replace(/["']/g, "");
  if (!trimmed) return null;
  if (/^\d+(\.\d+)?$/.test(trimmed)) return normalizeEpoch(Number(trimmed));
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Epoch seconds vs milliseconds, and reject implausible values rather than mis-dating the series. */
function normalizeEpoch(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  if (value > 1e14) return null; // absurd
  if (value > 1e11) return value; // milliseconds
  if (value > 1e8) return value * 1_000; // seconds
  return null;
}

/** Check a candle's internal consistency. Returns a reason when it is not usable. */
export function candleProblem(candle: Candle): string | null {
  const values = [candle.open, candle.high, candle.low, candle.close, candle.volume];
  if (values.some((value) => !Number.isFinite(value))) return "non-finite value";
  if (!Number.isFinite(candle.time) || candle.time <= 0) return "invalid timestamp";
  if (candle.high < candle.low) return "high is below low";
  if (candle.high < Math.max(candle.open, candle.close)) return "high is below the open/close";
  if (candle.low > Math.min(candle.open, candle.close)) return "low is above the open/close";
  if (candle.volume < 0) return "negative volume";
  if (candle.open <= 0 || candle.close <= 0) return "non-positive price";
  return null;
}

/**
 * Normalise a raw series: drop unusable bars, sort by time ascending, and collapse duplicate
 * timestamps (keeping the last occurrence).
 */
export function validateCandles(input: Candle[], source: "csv" | "json" = "json"): { candles: Candle[]; dropped: number; issues: OhlcvIssue[] } {
  const issues: OhlcvIssue[] = [];
  const usable: Candle[] = [];
  input.forEach((candle, index) => {
    const problem = candleProblem(candle);
    if (problem) issues.push({ line: index + 1, reason: problem });
    else usable.push(candle);
  });
  usable.sort((a, b) => a.time - b.time);
  const deduped: Candle[] = [];
  for (const candle of usable) {
    if (deduped.length > 0 && deduped[deduped.length - 1].time === candle.time) {
      deduped[deduped.length - 1] = candle; // last occurrence wins
      issues.push({ line: 0, reason: `duplicate timestamp ${candle.time} — kept the last` });
      continue;
    }
    deduped.push(candle);
  }
  void source;
  return { candles: deduped, dropped: input.length - deduped.length, issues };
}

/** The column names we recognise, per field. */
const COLUMN_ALIASES: Record<keyof Candle, string[]> = {
  time: ["time", "timestamp", "date", "datetime", "ts", "open_time", "opentime"],
  open: ["open", "o"],
  high: ["high", "h"],
  low: ["low", "l"],
  close: ["close", "c", "last", "adj_close", "adjclose"],
  volume: ["volume", "vol", "v", "basevolume"],
};

/**
 * Split a delimited line, honouring double-quoted fields (including "" escapes).
 * Financial CSVs routinely quote thousands separators, so a naive split on the delimiter would
 * silently corrupt values like "1,000".
 */
export function splitDelimited(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const character = line[i];
    if (inQuotes) {
      if (character === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else inQuotes = false;
      } else current += character;
    } else if (character === '"') inQuotes = true;
    else if (character === delimiter) {
      cells.push(current);
      current = "";
    } else current += character;
  }
  cells.push(current);
  return cells;
}

function resolveColumns(header: string[]): Partial<Record<keyof Candle, number>> {
  const map: Partial<Record<keyof Candle, number>> = {};
  header.forEach((cell, index) => {
    const key = cell.trim().toLowerCase().replace(/^["']|["']$/g, "");
    (Object.keys(COLUMN_ALIASES) as (keyof Candle)[]).forEach((field) => {
      if (map[field] === undefined && COLUMN_ALIASES[field].includes(key)) map[field] = index;
    });
  });
  return map;
}

/** Parse a delimited OHLCV file. Comma, semicolon and tab are auto-detected from the header. */
export function parseCsv(text: string): ParseResult {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  if (lines.length < 2) return { status: "error", reason: "The file has no data rows." };
  const headerLine = lines.find((line) => /[a-z]/i.test(line));
  if (!headerLine) return { status: "error", reason: "No header row with column names was found." };
  const delimiter = headerLine.includes("\t") ? "\t" : headerLine.includes(";") ? ";" : ",";
  const header = splitDelimited(headerLine, delimiter);
  const columns = resolveColumns(header);
  for (const required of ["open", "high", "low", "close"] as const) {
    if (columns[required] === undefined) return { status: "error", reason: `The file is missing a "${required}" column.` };
  }

  const headerIndex = lines.indexOf(headerLine);
  const raw: Candle[] = [];
  const issues: OhlcvIssue[] = [];
  const notes: string[] = [];
  let syntheticTime = false;

  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const cells = splitDelimited(lines[i], delimiter);
    const open = toNumber(cells[columns.open!]);
    const high = toNumber(cells[columns.high!]);
    const low = toNumber(cells[columns.low!]);
    const close = toNumber(cells[columns.close!]);
    const volume = columns.volume !== undefined ? toNumber(cells[columns.volume]) ?? 0 : 0;
    if (open === null || high === null || low === null || close === null) {
      issues.push({ line: i + 1, reason: "missing or unparsable OHLC value" });
      continue;
    }
    let time = columns.time !== undefined ? parseTimestamp(cells[columns.time]) : null;
    if (time === null) {
      time = (i - headerIndex) * DAY_MS;
      syntheticTime = true;
    }
    raw.push({ time, open, high, low, close, volume });
  }

  if (raw.length === 0) return { status: "error", reason: "No valid OHLCV rows were found." };
  const validated = validateCandles(raw, "csv");
  if (syntheticTime) notes.push("No usable timestamp column was found, so bars were spaced one day apart. Annualised figures assume that spacing.");
  return { status: "ok", candles: validated.candles, dropped: validated.dropped + issues.length, issues: [...issues, ...validated.issues], notes };
}

/** Parse a JSON array (or an object with a `candles`/`data`/`bars` array) of OHLCV objects. */
export function parseJson(text: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { status: "error", reason: `The JSON could not be parsed: ${error instanceof Error ? error.message : String(error)}` };
  }
  let rows: unknown;
  if (Array.isArray(parsed)) rows = parsed;
  else if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    rows = record.candles ?? record.data ?? record.bars ?? null;
  }
  if (!Array.isArray(rows)) return { status: "error", reason: "Expected a JSON array of candles (or an object with a candles/data/bars array)." };

  const raw: Candle[] = [];
  const issues: OhlcvIssue[] = [];
  const notes: string[] = [];
  let syntheticTime = false;

  rows.forEach((row, index) => {
    if (!row || typeof row !== "object") {
      issues.push({ line: index + 1, reason: "row is not an object" });
      return;
    }
    const record = row as Record<string, unknown>;
    const pick = (...keys: string[]): unknown => {
      for (const key of keys) {
        const direct = record[key];
        if (direct !== undefined) return direct;
        const lower = record[key.toLowerCase()];
        if (lower !== undefined) return lower;
      }
      return undefined;
    };
    const asNumber = (value: unknown): number | null => (typeof value === "number" ? (Number.isFinite(value) ? value : null) : toNumber(value === undefined ? undefined : String(value)));
    const open = asNumber(pick("open", "o"));
    const high = asNumber(pick("high", "h"));
    const low = asNumber(pick("low", "l"));
    const close = asNumber(pick("close", "c"));
    const volume = asNumber(pick("volume", "vol", "v")) ?? 0;
    if (open === null || high === null || low === null || close === null) {
      issues.push({ line: index + 1, reason: "missing or unparsable OHLC value" });
      return;
    }
    const timeRaw = pick("time", "timestamp", "date", "datetime", "ts");
    let time = parseTimestamp(timeRaw as string | number | undefined);
    if (time === null) {
      time = (index + 1) * DAY_MS;
      syntheticTime = true;
    }
    raw.push({ time, open, high, low, close, volume });
  });

  if (raw.length === 0) return { status: "error", reason: "No valid OHLCV rows were found." };
  const validated = validateCandles(raw, "json");
  if (syntheticTime) notes.push("No usable timestamp field was found, so bars were spaced one day apart. Annualised figures assume that spacing.");
  return { status: "ok", candles: validated.candles, dropped: validated.dropped + issues.length, issues: [...issues, ...validated.issues], notes };
}

/** Parse either format, detecting which by the first non-whitespace character. */
export function parseOhlcv(text: string): ParseResult {
  const trimmed = text.trim();
  if (!trimmed) return { status: "error", reason: "The input is empty." };
  return trimmed.startsWith("[") || trimmed.startsWith("{") ? parseJson(trimmed) : parseCsv(trimmed);
}

/** A compact, honest description of a loaded series, for the UI. */
export function describeSeries(candles: Candle[]): { bars: number; from: string | null; to: string | null; spanDays: number | null } {
  if (candles.length === 0) return { bars: 0, from: null, to: null, spanDays: null };
  const from = candles[0].time;
  const to = candles[candles.length - 1].time;
  return { bars: candles.length, from: new Date(from).toISOString(), to: new Date(to).toISOString(), spanDays: (to - from) / DAY_MS };
}
