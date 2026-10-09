import { createHash } from "node:crypto";

export type NseUniverseSecurity = {
  symbol: string;
  name: string;
  series: string;
  listingDate: string | null;
  isin: string | null;
  exchange: "NSE";
  sourceUrl: string;
};

export type NseUniverseSnapshot = {
  asOf: string;
  sourceUrls: string[];
  checksum: string;
  securities: NseUniverseSecurity[];
  errors: string[];
};

const DEFAULT_UNIVERSE_URLS = [
  "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv",
  "https://nsearchives.nseindia.com/emerge/corporates/content/SME_EQUITY_L.csv",
];

function parseCsvRow(line: string) {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      fields.push(field.trim());
      field = "";
    } else {
      field += char;
    }
  }
  fields.push(field.trim());
  return fields;
}

function normalizeDate(value: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString().slice(0, 10);
}

export function parseNseUniverseCsv(csv: string, sourceUrl: string): NseUniverseSecurity[] {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const headers = parseCsvRow(lines[0]).map((header) => header.toUpperCase());
  const indexOf = (...names: string[]) => names.map((name) => headers.indexOf(name)).find((index) => index >= 0) ?? -1;
  const symbolIndex = indexOf("SYMBOL");
  const nameIndex = indexOf("NAME OF COMPANY", "COMPANY NAME");
  const seriesIndex = indexOf("SERIES");
  const listingDateIndex = indexOf("DATE OF LISTING");
  const isinIndex = indexOf("ISIN NUMBER", "ISIN");
  if (symbolIndex < 0 || nameIndex < 0) return [];
  return lines.slice(1).flatMap((line) => {
    const fields = parseCsvRow(line);
    const symbol = fields[symbolIndex]?.trim().toUpperCase();
    const name = fields[nameIndex]?.trim();
    if (!symbol || !name) return [];
    return [{ symbol, name, series: seriesIndex >= 0 ? fields[seriesIndex] ?? "" : "", listingDate: listingDateIndex >= 0 ? normalizeDate(fields[listingDateIndex] ?? "") : null, isin: isinIndex >= 0 ? fields[isinIndex]?.trim() || null : null, exchange: "NSE" as const, sourceUrl }];
  });
}

let cachedSnapshot: NseUniverseSnapshot | null = null;
let cachedAt = 0;

export async function fetchNseUniverse(urls: string[] = (process.env.NSE_UNIVERSE_URLS ?? DEFAULT_UNIVERSE_URLS.join(",")).split(",").map((url: string) => url.trim()).filter((url: string) => Boolean(url))): Promise<NseUniverseSnapshot> {
  const cacheTtlMs = Math.max(60_000, Number(process.env.NSE_UNIVERSE_CACHE_MS ?? 3_600_000));
  if (cachedSnapshot && Date.now() - cachedAt < cacheTtlMs) return cachedSnapshot;
  const fetched = await Promise.allSettled(urls.map(async (sourceUrl: string) => {
    const response = await fetch(sourceUrl, { headers: { Accept: "text/csv, application/octet-stream", "User-Agent": "MarketEventIntelligence/1.0" }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`${sourceUrl} returned HTTP ${response.status}`);
    const body = await response.text();
    return { sourceUrl, body };
  }));
  const securities = fetched.flatMap((result) => result.status === "fulfilled" ? parseNseUniverseCsv(result.value.body, result.value.sourceUrl) : []);
  const errors = fetched.flatMap((result) => result.status === "rejected" ? [String(result.reason)] : []);
  const deduped = new Map<string, NseUniverseSecurity>();
  for (const security of securities) deduped.set(`${security.symbol}:${security.isin ?? security.name}`, security);
  const payload = JSON.stringify([...deduped.values()]);
  cachedSnapshot = { asOf: new Date().toISOString(), sourceUrls: urls, checksum: createHash("sha256").update(payload).digest("hex"), securities: [...deduped.values()].sort((left, right) => left.symbol.localeCompare(right.symbol)), errors };
  cachedAt = Date.now();
  return cachedSnapshot;
}
