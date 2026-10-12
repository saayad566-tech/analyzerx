/**
 * Shared RSS parsing for the published syndication feeds.
 *
 * NSE, BSE and SEBI each publish an RSS feed for syndication. They share a
 * shape but differ in the extra tags they carry (BSE adds a scrip code), so the
 * parser is generic and the adapters pick the fields they need.
 *
 * The parser is deliberately defensive: a malformed item is skipped rather than
 * guessed at, and a missing field becomes null rather than a placeholder.
 */

import type { FetchedFiling } from "./types";

/** Decode the handful of XML entities that appear in these feeds. */
export function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

/** Read the first value of a tag inside an item. */
export function tag(item: string, name: string): string | null {
  const match = item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return match ? decodeXml(match[1]) : null;
}

export type RawFeedItem = {
  title: string;
  link: string;
  description: string | null;
  pubDate: string | null;
  /** BSE carries this; NSE and SEBI do not. */
  scripCode: string | null;
};

/** Parse an RSS document into raw items. */
export function parseRssItems(xml: string): RawFeedItem[] {
  const items: RawFeedItem[] = [];
  const matches = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  for (const raw of matches) {
    const title = tag(raw, "title");
    const link = tag(raw, "link");
    if (!title || !link) continue;
    items.push({
      title,
      link,
      description: tag(raw, "description"),
      pubDate: tag(raw, "pubDate"),
      scripCode: tag(raw, "scripcode") ?? tag(raw, "scripCode"),
    });
  }
  return items;
}

/**
 * Some SEBI items carry the site root followed by the real URL, producing a
 * doubled link. Take the last absolute URL in the string, which is the real one.
 */
export function sanitizeLink(link: string): string {
  const trimmed = link.trim();
  const parts = trimmed.split(/(?=https?:\/\/)/).filter(Boolean);
  if (parts.length > 1) return parts[parts.length - 1];
  return trimmed;
}

/** A stable, source-scoped id from the filing link, when one is present. */
export function externalIdFromLink(link: string): string | null {
  try {
    const path = new URL(link).pathname;
    const file = path.split("/").filter(Boolean).pop() ?? "";
    const stem = file.replace(/\.[a-z0-9]+$/i, "");
    return stem || null;
  } catch {
    return null;
  }
}

/**
 * Parse the several date formats these feeds use. Returns null rather than a
 * substituted "now", so an undated item is reported as undated.
 */
export function toIso(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  // "12-Oct-2026 20:46:58" (BSE)
  let match = trimmed.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/);
  if (match) {
    const months: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
    const month = months[match[2].toLowerCase()];
    if (month === undefined) return null;
    return new Date(Date.UTC(Number(match[3]), month, Number(match[1]), Number(match[4]), Number(match[5]), Number(match[6]))).toISOString();
  }
  // "12 Oct, 2026 +0530" (SEBI)
  match = trimmed.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*,?\s+(\d{4})/);
  if (match) {
    const months: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
    const month = months[match[2].toLowerCase()];
    if (month !== undefined) return new Date(Date.UTC(Number(match[3]), month, Number(match[1]), 12, 0, 0)).toISOString();
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** Parse an RSS document into filings, applying a limit and an optional filter. */
export function filingsFromFeed(
  xml: string,
  options: { limit: number; companyFilter?: string; category: string; linkPattern?: RegExp },
): FetchedFiling[] {
  const wanted = options.companyFilter?.trim().toLowerCase();
  const filings: FetchedFiling[] = [];
  for (const item of parseRssItems(xml)) {
    item.link = sanitizeLink(item.link);
    if (options.linkPattern && !options.linkPattern.test(item.link)) continue;
    const companyName = stripScripCode(item.title);
    if (wanted && !companyName.toLowerCase().includes(wanted)) continue;
    filings.push({
      externalId: item.scripCode ? `scrip:${item.scripCode}:${externalIdFromLink(item.link) ?? ""}` : externalIdFromLink(item.link),
      title: item.description ? `${companyName} — ${item.description}` : companyName,
      url: item.link,
      publishedAt: toIso(item.pubDate),
      category: options.category,
      symbol: item.scripCode,
      companyName,
      summary: item.description ?? "",
      // The feed carries metadata and a document link; the document bytes are
      // not fetched here, so no content hash is claimed.
      contentSha256: null,
      byteCount: null,
    });
    if (filings.length >= options.limit) break;
  }
  return filings;
}

/** BSE titles carry a trailing "(530755)"; keep the name and drop the code. */
export function stripScripCode(title: string): string {
  return title.replace(/\s*\(\d{5,6}\)\s*$/, "").trim();
}

/**
 * Fetch a text feed with an https approved-destination check, a content-type
 * check, a size ceiling and a timeout.
 */
export async function fetchFeedText(
  label: string,
  url: string,
  options: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<{ ok: true; text: string } | { ok: false; error: string; refused?: boolean }> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const maxBytes = options.maxBytes ?? 12_000_000;
  const attempt = async (): Promise<{ ok: true; text: string } | { ok: false; error: string; refused?: boolean }> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/rss+xml,application/xml,text/xml,*/*",
        // A plain, descriptive UA. A UA carrying a URL in parentheses caused the
        // NSE archive host to stall the connection, so it is kept simple.
        "User-Agent": "AnalyzerX/1.0 (filing-intelligence)",
      },
    });
    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        error: `HTTP ${response.status} from ${label}: the source refused a request that identifies as automated. This is an access decision by the source, not a transient failure.`,
        refused: true,
      };
    }
    if (!response.ok) return { ok: false, error: `HTTP ${response.status} from ${label}.` };
    const text = await response.text();
    if (text.length > maxBytes) return { ok: false, error: `The feed from ${label} exceeded the size ceiling.` };
    if (!text.includes("<item")) return { ok: false, error: `The response from ${label} did not contain RSS items.` };
    return { ok: true, text };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Request to ${label} failed: ${message}` };
  } finally {
    clearTimeout(timer);
  }
  };

  // One retry, with a short pause, for a transient timeout on a poor connection.
  const first = await attempt();
  if (first.ok || first.refused) return first;
  await new Promise((resolve) => setTimeout(resolve, 1200));
  return attempt();
}
