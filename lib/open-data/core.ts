/**
 * AnalyzerX on-device open-data core.
 *
 * Everything here runs inside the app: no backend, no server, no credentials.
 * It fetches free/open sources directly from the device, records provenance for
 * every value, caches aggressively, and degrades honestly (it never invents a
 * number — an unavailable field stays unavailable).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

export type SourceStatus =
  | "live"
  | "delayed"
  | "stale"
  | "unavailable"
  | "auth_required"
  | "rate_limited"
  | "error";

export type ValueBasis = "reported" | "derived" | "estimated" | "unavailable";

export type SourceType =
  | "exchange"
  | "regulator"
  | "issuer"
  | "market-data"
  | "news"
  | "macro"
  | "crypto"
  | "open-web";

export type Provenance = {
  sourceKey: string;
  sourceName: string;
  sourceType: SourceType;
  url: string;
  retrievedAt: string;
  asOf: string | null;
  status: SourceStatus;
  latencyMs: number;
  basis: ValueBasis;
  note?: string;
};

export type Sourced<T> = { value: T | null; provenance: Provenance };

const UA = "AnalyzerX/1.4 (Android; open-data; +https://analyzerx.app)";
export const CACHE_PREFIX = "analyzerx.od.v1.";

export function nowIso() {
  return new Date().toISOString();
}

function isoOrNull(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    // Yahoo and NSE sometimes return epoch seconds.
    const ms = value > 1e12 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  }
  return null;
}

export function provenance(input: {
  sourceKey: string;
  sourceName: string;
  sourceType: SourceType;
  url: string;
  asOf?: unknown;
  status?: SourceStatus;
  latencyMs?: number;
  basis?: ValueBasis;
  note?: string;
}): Provenance {
  return {
    sourceKey: input.sourceKey,
    sourceName: input.sourceName,
    sourceType: input.sourceType,
    url: input.url,
    retrievedAt: nowIso(),
    asOf: isoOrNull(input.asOf),
    status: input.status ?? "live",
    latencyMs: Math.max(0, Math.round(input.latencyMs ?? 0)),
    basis: input.basis ?? "reported",
    ...(input.note ? { note: input.note } : {}),
  };
}

export function unavailableProvenance(
  sourceKey: string,
  sourceName: string,
  sourceType: SourceType,
  url: string,
  note: string,
  status: SourceStatus = "unavailable",
): Provenance {
  return provenance({ sourceKey, sourceName, sourceType, url, status, note, basis: "unavailable" });
}

/* ------------------------------------------------------------------ *
 * HTTP
 * ------------------------------------------------------------------ */

export type FetchOptions = {
  timeoutMs?: number;
  headers?: Record<string, string>;
  retries?: number;
};

export class SourceError extends Error {
  readonly status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "SourceError";
    this.status = status;
  }
}

async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchRaw(
  url: string,
  options: FetchOptions = {},
): Promise<{ body: string; status: number; latencyMs: number }> {
  // One bounded attempt by default: retrying a timeout doubles the wait a user
  // sees, and the cache already covers transient blips by serving the last good
  // value. Screens degrade fast instead of hanging.
  const { timeoutMs = 9_000, headers = {}, retries = 0 } = options;
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const started = Date.now();
    try {
      const response = await withTimeout(timeoutMs, (signal) =>
        fetch(url, {
          signal,
          headers: {
            "User-Agent": UA,
            Accept: "*/*",
            "Accept-Language": "en-IN,en;q=0.9",
            ...headers,
          },
        }),
      );
      const latencyMs = Date.now() - started;
      if (!response.ok) {
        throw new SourceError(`HTTP ${response.status} for ${url}`, response.status);
      }
      const body = await response.text();
      return { body, status: response.status, latencyMs };
    } catch (error) {
      lastError = error;
      // Do not retry a definitive HTTP rejection.
      if (error instanceof SourceError && error.status >= 400 && error.status < 500) break;
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new SourceError(String(lastError));
}

export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<{ data: T; latencyMs: number }> {
  const { body, latencyMs } = await fetchRaw(url, options);
  try {
    return { data: JSON.parse(body) as T, latencyMs };
  } catch {
    throw new SourceError(`Malformed JSON from ${url}`);
  }
}

export async function fetchText(url: string, options: FetchOptions = {}): Promise<{ text: string; latencyMs: number }> {
  const { body, latencyMs } = await fetchRaw(url, options);
  return { text: body, latencyMs };
}

/* ------------------------------------------------------------------ *
 * Cache (stale-tolerant: a failed refresh keeps the last good value)
 * ------------------------------------------------------------------ */

type CacheEnvelope<T> = { storedAt: number; payload: T };

export async function readCache<T>(key: string): Promise<CacheEnvelope<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed || typeof parsed.storedAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeCache<T>(key: string, payload: T): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ storedAt: Date.now(), payload }));
  } catch {
    // Cache failures must never break a read path.
  }
}

export type CachedResult<T> = { value: T; fromCache: boolean; ageMs: number };

/**
 * Loader-first, cache-backed fetch. If the loader fails and a cached value
 * exists, the cached value is returned (flagged stale) rather than throwing —
 * this is the "graceful degradation" contract the product requires.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
  options: { allowStale?: boolean } = {},
): Promise<CachedResult<T>> {
  const allowStale = options.allowStale ?? true;
  const hit = await readCache<T>(key);
  const fresh = hit && Date.now() - hit.storedAt < ttlMs;
  if (fresh && hit) return { value: hit.payload, fromCache: true, ageMs: Date.now() - hit.storedAt };
  try {
    const value = await loader();
    await writeCache(key, value);
    return { value, fromCache: false, ageMs: 0 };
  } catch (error) {
    if (allowStale && hit) return { value: hit.payload, fromCache: true, ageMs: Date.now() - hit.storedAt };
    throw error;
  }
}

export async function clearCache(prefix?: string): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const target = keys.filter((k) => k.startsWith(CACHE_PREFIX) && (!prefix || k.includes(prefix)));
    if (target.length) await AsyncStorage.multiRemove(target);
  } catch {
    // ignore
  }
}

/* ------------------------------------------------------------------ *
 * Parsers
 * ------------------------------------------------------------------ */

/** RFC4180-ish CSV parser (handles quoted fields and embedded commas). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

export function csvToObjects(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    header.forEach((key, index) => {
      record[key] = (cells[index] ?? "").trim();
    });
    return record;
  });
}

const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&nbsp;": " ",
};

export function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
    .replace(/&[a-z#0-9]+;/gi, (entity) => XML_ENTITIES[entity.toLowerCase()] ?? entity)
    .trim();
}

export function stripHtml(value: string): string {
  return decodeXml(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

export type RssItem = {
  title: string;
  link: string;
  description: string;
  pubDate: string | null;
  source: string | null;
  guid: string | null;
};

/** Minimal, dependency-free RSS/Atom reader good enough for news feeds. */
export function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) ?? [];
  for (const block of blocks) {
    const pick = (tag: string): string | null => {
      const match = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
      return match ? decodeXml(match[1]) : null;
    };
    const linkTag = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i);
    const title = pick("title") ?? "";
    const link = linkTag ? decodeXml(linkTag[1]) : (pick("link") ?? "");
    if (!title && !link) continue;
    items.push({
      title,
      link,
      description: stripHtml(pick("description") ?? pick("summary") ?? pick("content") ?? ""),
      pubDate: pick("pubDate") ?? pick("published") ?? pick("updated"),
      source: pick("source"),
      guid: pick("guid") ?? pick("id"),
    });
  }
  return items;
}

/* ------------------------------------------------------------------ *
 * Symbol helpers
 * ------------------------------------------------------------------ */

export type MarketId = "IN" | "US" | "UK" | "JP" | "EU" | "GLOBAL";

export function isIndexSymbol(symbol: string) {
  return /^\^/.test(symbol);
}

/** Map an app symbol to the Yahoo Finance ticker for a given market. */
export function toYahooSymbol(symbol: string, marketId: MarketId = "IN"): string {
  const clean = symbol.trim().toUpperCase();
  if (!clean) return clean;
  if (isIndexSymbol(clean)) return clean;
  if (/\.(NS|BO|L|T|DE|PA|AS|MI|HK|SI|AX)$/.test(clean)) return clean;
  if (/-(USD|INR|EUR|GBP)$/.test(clean)) return clean;
  switch (marketId) {
    case "IN":
      return `${clean}.NS`;
    case "UK":
      return `${clean}.L`;
    case "JP":
      return `${clean}.T`;
    case "EU":
      return `${clean}.DE`;
    default:
      return clean;
  }
}

export function toDisplaySymbol(yahooSymbol: string): string {
  return yahooSymbol.replace(/\.(NS|BO|L|T|DE|PA|AS|MI|HK|SI|AX)$/, "");
}

export function currencyForMarket(marketId: MarketId): string {
  switch (marketId) {
    case "IN":
      return "INR";
    case "UK":
      return "GBP";
    case "JP":
      return "JPY";
    case "EU":
      return "EUR";
    default:
      return "USD";
  }
}

export function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

export function safeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[,%\s]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
