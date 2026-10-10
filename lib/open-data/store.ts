/**
 * On-device history store.
 *
 * Everything the collector gathers is kept on the phone so the app has real
 * history from the day it was installed onward — not just a live window. Articles
 * are bucketed by month, de-duplicated by id, pruned by age and count, and
 * queried oldest-to-newest or newest-first for the archive screen.
 *
 * Storage is AsyncStorage-backed and chunked by month so no single key grows
 * unbounded. Every operation is failure-tolerant: a storage error degrades to an
 * empty result rather than crashing a screen.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { NewsArticle } from "./sources";

export type StoredArticle = NewsArticle & {
  collectedAt: string;
  sourceKey: string;
  sourceName: string;
  kind: string;
};

type Bucket = { month: string; items: StoredArticle[] };
type Manifest = { months: string[]; total: number; recentIds: string[]; updatedAt: string | null };

const PREFIX = "analyzerx.store.v1.";
const MANIFEST_KEY = `${PREFIX}manifest`;
const RECENT_ID_LIMIT = 8_000;

/** Defaults: keep six months, capped so the app stays well inside storage limits. */
export const STORE_LIMITS = { maxItems: 20_000, maxDays: 180 };

function monthOf(iso: string | null, fallback = new Date()): string {
  const date = iso && Number.isFinite(Date.parse(iso)) ? new Date(iso) : fallback;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage pressure must never break collection.
  }
}

async function readManifest(): Promise<Manifest> {
  return readJson<Manifest>(MANIFEST_KEY, { months: [], total: 0, recentIds: [], updatedAt: null });
}

async function readBucket(month: string): Promise<Bucket> {
  return readJson<Bucket>(`${PREFIX}${month}`, { month, items: [] });
}

export type AppendResult = { added: number; duplicates: number; total: number };

/** Append collected articles, de-duplicating by id across the recent index. */
export async function appendArticles(items: StoredArticle[]): Promise<AppendResult> {
  if (!items.length) return { added: 0, duplicates: 0, total: (await readManifest()).total };
  const manifest = await readManifest();
  const seen = new Set(manifest.recentIds);
  const byMonth = new Map<string, StoredArticle[]>();
  let duplicates = 0;

  for (const item of items) {
    const id = item.id || `${item.url}|${item.headline}`;
    if (seen.has(id)) {
      duplicates += 1;
      continue;
    }
    seen.add(id);
    const month = monthOf(item.publishedAt ?? item.collectedAt);
    const list = byMonth.get(month) ?? [];
    list.push({ ...item, id });
    byMonth.set(month, list);
  }

  let added = 0;
  for (const [month, list] of byMonth) {
    const bucket = await readBucket(month);
    const existing = new Set(bucket.items.map((entry) => entry.id));
    const merged = [...list.filter((entry) => !existing.has(entry.id)), ...bucket.items];
    // Newest first inside a bucket.
    merged.sort((a, b) => (Date.parse(b.publishedAt ?? b.collectedAt) || 0) - (Date.parse(a.publishedAt ?? a.collectedAt) || 0));
    added += merged.length - bucket.items.length;
    await writeJson(`${PREFIX}${month}`, { month, items: merged } satisfies Bucket);
    if (!manifest.months.includes(month)) manifest.months.push(month);
  }

  manifest.months.sort();
  manifest.total = manifest.total + added;
  manifest.recentIds = [...seen].slice(-RECENT_ID_LIMIT);
  manifest.updatedAt = new Date().toISOString();
  await writeJson(MANIFEST_KEY, manifest);
  return { added, duplicates, total: manifest.total };
}

export type ArchiveQuery = {
  symbol?: string;
  days?: number;
  sentiment?: "Positive" | "Neutral" | "Negative";
  kind?: string;
  order?: "newest" | "oldest" | "impact-high" | "impact-low";
  limit?: number;
  offset?: number;
};

export type ArchiveResult = {
  articles: StoredArticle[];
  total: number;
  returned: number;
  offset: number;
  hasMore: boolean;
  coverage: { from: string | null; to: string | null; months: number; stored: number };
  sources: Array<{ source: string; count: number }>;
};

/** Query stored history, oldest-to-newest or newest-first, with paging. */
export async function queryArchive(query: ArchiveQuery = {}): Promise<ArchiveResult> {
  const manifest = await readManifest();
  const limit = Math.max(1, Math.min(500, query.limit ?? 100));
  const offset = Math.max(0, query.offset ?? 0);
  const cutoff = query.days ? Date.now() - query.days * 86_400_000 : 0;

  const months = manifest.months.filter((month) => {
    if (!query.days) return true;
    const [year, mon] = month.split("-").map(Number);
    // Keep the month if its end is inside the window.
    return new Date(Date.UTC(year, mon, 1)).getTime() >= cutoff;
  });

  const buckets = await Promise.all(months.map(readBucket));
  let all = buckets.flatMap((bucket) => bucket.items);

  if (query.symbol) {
    const needle = query.symbol.toUpperCase();
    all = all.filter(
      (article) =>
        article.symbol?.toUpperCase() === needle ||
        article.headline.toUpperCase().includes(needle) ||
        article.keyEntities.some((entity) => entity.toUpperCase().includes(needle)),
    );
  }
  if (query.sentiment) all = all.filter((article) => article.sentiment === query.sentiment);
  if (query.kind) all = all.filter((article) => article.kind === query.kind);
  if (query.days) all = all.filter((article) => (Date.parse(article.publishedAt ?? article.collectedAt) || 0) >= cutoff);

  const order = query.order ?? "newest";
  all.sort((a, b) => {
    if (order === "oldest") return (Date.parse(a.publishedAt ?? a.collectedAt) || 0) - (Date.parse(b.publishedAt ?? b.collectedAt) || 0);
    if (order === "impact-high") return b.impactScore - a.impactScore;
    if (order === "impact-low") return a.impactScore - b.impactScore;
    return (Date.parse(b.publishedAt ?? b.collectedAt) || 0) - (Date.parse(a.publishedAt ?? a.collectedAt) || 0);
  });

  const page = all.slice(offset, offset + limit);
  const bySource = new Map<string, number>();
  for (const article of all) bySource.set(article.source, (bySource.get(article.source) ?? 0) + 1);
  const times = all.map((article) => Date.parse(article.publishedAt ?? article.collectedAt) || 0).filter(Boolean);

  return {
    articles: page,
    total: all.length,
    returned: page.length,
    offset,
    hasMore: offset + page.length < all.length,
    coverage: {
      from: times.length ? new Date(Math.min(...times)).toISOString() : null,
      to: times.length ? new Date(Math.max(...times)).toISOString() : null,
      months: months.length,
      stored: manifest.total,
    },
    sources: [...bySource.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count).slice(0, 40),
  };
}

export type StoreStats = {
  total: number;
  months: number;
  oldest: string | null;
  newest: string | null;
  byMonth: Record<string, number>;
  bySource: Record<string, number>;
  byKind: Record<string, number>;
  updatedAt: string | null;
};

export async function storeStats(): Promise<StoreStats> {
  const manifest = await readManifest();
  const buckets = await Promise.all(manifest.months.map(readBucket));
  const byMonth: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const byKind: Record<string, number> = {};
  let oldest: number | null = null;
  let newest: number | null = null;

  for (const bucket of buckets) {
    byMonth[bucket.month] = bucket.items.length;
    for (const article of bucket.items) {
      bySource[article.source] = (bySource[article.source] ?? 0) + 1;
      byKind[article.kind] = (byKind[article.kind] ?? 0) + 1;
      const time = Date.parse(article.publishedAt ?? article.collectedAt) || 0;
      if (time) {
        oldest = oldest === null ? time : Math.min(oldest, time);
        newest = newest === null ? time : Math.max(newest, time);
      }
    }
  }

  return {
    total: manifest.total,
    months: manifest.months.length,
    oldest: oldest ? new Date(oldest).toISOString() : null,
    newest: newest ? new Date(newest).toISOString() : null,
    byMonth,
    bySource,
    byKind,
    updatedAt: manifest.updatedAt,
  };
}

/** Prune by age and count so the store never grows without bound. */
export async function pruneStore(limits = STORE_LIMITS): Promise<{ removed: number; total: number }> {
  const manifest = await readManifest();
  const cutoff = Date.now() - limits.maxDays * 86_400_000;
  let removed = 0;
  let total = 0;
  const keep: string[] = [];

  const buckets = await Promise.all(manifest.months.map(async (month) => ({ month, bucket: await readBucket(month) })));
  buckets.sort((a, b) => a.month.localeCompare(b.month));

  for (const { month, bucket } of buckets) {
    const items = bucket.items.filter((article) => (Date.parse(article.publishedAt ?? article.collectedAt) || 0) >= cutoff);
    removed += bucket.items.length - items.length;
    if (items.length) {
      keep.push(month);
      total += items.length;
      if (items.length !== bucket.items.length) await writeJson(`${PREFIX}${month}`, { month, items } satisfies Bucket);
    } else {
      removed += bucket.items.length;
      try {
        await AsyncStorage.removeItem(`${PREFIX}${month}`);
      } catch {
        // ignore
      }
    }
  }

  // Enforce the item cap by trimming the oldest months.
  if (total > limits.maxItems) {
    const ordered = await Promise.all(keep.map(async (month) => ({ month, bucket: await readBucket(month) })));
    ordered.sort((a, b) => b.month.localeCompare(a.month));
    let running = 0;
    for (const { month, bucket } of ordered) {
      running += bucket.items.length;
      if (running > limits.maxItems) {
        removed += bucket.items.length;
        total -= bucket.items.length;
        try {
          await AsyncStorage.removeItem(`${PREFIX}${month}`);
        } catch {
          // ignore
        }
        keep.splice(keep.indexOf(month), 1);
      }
    }
  }

  manifest.months = keep.sort();
  manifest.total = total;
  manifest.updatedAt = new Date().toISOString();
  await writeJson(MANIFEST_KEY, manifest);
  return { removed, total };
}

export async function clearStore(): Promise<void> {
  const manifest = await readManifest();
  try {
    await AsyncStorage.multiRemove([MANIFEST_KEY, ...manifest.months.map((month) => `${PREFIX}${month}`)]);
  } catch {
    // ignore
  }
}
