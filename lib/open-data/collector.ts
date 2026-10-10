/**
 * Continuous on-device collector.
 *
 * Walks the 800+ entry source catalog on a rotating cursor, fetching a bounded
 * batch per cycle with limited concurrency and a hard time budget, de-duplicates
 * what it finds, and appends it to the on-device history store. Sources that keep
 * failing are skipped by the circuit breaker instead of costing every cycle a
 * timeout.
 *
 * Everything here is safe to call repeatedly: it never throws, and a failure in
 * one source never stops the cycle.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { buildCatalog, providerOf, type CatalogSource, type SourceKind } from "./catalog";
import { genericRssFeed } from "./sources";
import { appendArticles, pruneStore, STORE_LIMITS, type StoredArticle } from "./store";
import { linkHealth, recordLink } from "./chain";
import { nowIso } from "./core";

const CURSOR_KEY = "analyzerx.collector.v1.cursor";
const STATS_KEY = "analyzerx.collector.v1.stats";

export type CollectorStats = {
  running: boolean;
  cycles: number;
  lastRunAt: string | null;
  lastDurationMs: number;
  sourcesTried: number;
  sourcesOk: number;
  sourcesFailed: number;
  sourcesSkipped: number;
  articlesCollected: number;
  articlesStored: number;
  byKind: Record<string, number>;
  lastError: string | null;
};

const EMPTY_STATS: CollectorStats = {
  running: false,
  cycles: 0,
  lastRunAt: null,
  lastDurationMs: 0,
  sourcesTried: 0,
  sourcesOk: 0,
  sourcesFailed: 0,
  sourcesSkipped: 0,
  articlesCollected: 0,
  articlesStored: 0,
  byKind: {},
  lastError: null,
};

let inMemory: CollectorStats = { ...EMPTY_STATS };
let running = false;

async function loadStats(): Promise<CollectorStats> {
  try {
    const raw = await AsyncStorage.getItem(STATS_KEY);
    return raw ? { ...EMPTY_STATS, ...(JSON.parse(raw) as Partial<CollectorStats>) } : { ...EMPTY_STATS };
  } catch {
    return { ...EMPTY_STATS };
  }
}

async function saveStats(stats: CollectorStats): Promise<void> {
  inMemory = stats;
  try {
    await AsyncStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {
    // ignore
  }
}

export async function collectorStats(): Promise<CollectorStats> {
  const stored = await loadStats();
  return { ...stored, running };
}

async function readCursor(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(CURSOR_KEY);
    const parsed = raw ? Number(raw) : 0;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

async function writeCursor(value: number): Promise<void> {
  try {
    await AsyncStorage.setItem(CURSOR_KEY, String(value));
  } catch {
    // ignore
  }
}

/** Only feeds that yield articles are collected; data files are health-checked
 *  separately by their own capability paths. */
function isCollectable(source: CatalogSource): boolean {
  return source.format === "rss";
}

export type CollectOptions = {
  /** Hard time budget for the cycle. */
  budgetMs?: number;
  /** How many sources to attempt this cycle. */
  batchSize?: number;
  /** Parallel fetches. */
  concurrency?: number;
  /** Restrict to specific kinds (e.g. only announcements). */
  kinds?: SourceKind[];
  /** Skip the periodic prune. */
  skipPrune?: boolean;
  symbols?: string[];
};

export type CollectResult = CollectorStats & { sourcesTried: number; collectedThisCycle: number };

/**
 * Run one collection cycle. Safe to call on app open, on pull-to-refresh, or
 * from a timer.
 */
export async function runCollectionCycle(options: CollectOptions = {}): Promise<CollectResult> {
  const { budgetMs = 20_000, batchSize = 24, concurrency = 5, kinds, skipPrune = false, symbols = [] } = options;
  const started = Date.now();
  const deadline = started + budgetMs;

  const catalog = buildCatalog(symbols).filter((source) => isCollectable(source) && (!kinds || kinds.includes(source.kind)));
  const stats = await loadStats();
  const cycleStats: CollectorStats = { ...stats, byKind: { ...stats.byKind }, running: true };
  let cursor = catalog.length ? (await readCursor()) % catalog.length : 0;

  const picked: CatalogSource[] = [];
  let scanned = 0;
  while (picked.length < batchSize && scanned < catalog.length) {
    const source = catalog[(cursor + scanned) % catalog.length];
    scanned += 1;
    const health = linkHealth(source.id);
    // Circuit breaker: skip a source that keeps failing until it has had a rest.
    if (health.consecutiveFailures >= 3 && health.lastAttemptAt && Date.now() - health.lastAttemptAt < 60_000) {
      cycleStats.sourcesSkipped += 1;
      continue;
    }
    picked.push(source);
  }
  cursor = catalog.length ? (cursor + scanned) % catalog.length : 0;
  await writeCursor(cursor);

  let collected = 0;
  for (let i = 0; i < picked.length; i += concurrency) {
    if (Date.now() > deadline) break;
    const chunk = picked.slice(i, i + concurrency);
    const results = await Promise.all(
      chunk.map(async (source) => {
        const linkStarted = Date.now();
        try {
          const { articles, latencyMs } = await genericRssFeed(source.url, source.name, { symbol: source.symbol, kind: source.kind, limit: 40 });
          recordLink(source.id, true, latencyMs);
          return { source, articles, error: null as string | null };
        } catch (error) {
          recordLink(source.id, false, Date.now() - linkStarted, error);
          return { source, articles: [], error: String(error).slice(0, 200) };
        }
      }),
    );

    const batch: StoredArticle[] = [];
    for (const result of results) {
      cycleStats.sourcesTried += 1;
      if (result.error) {
        cycleStats.sourcesFailed += 1;
        cycleStats.lastError = `${result.source.id}: ${result.error}`;
        continue;
      }
      cycleStats.sourcesOk += 1;
      cycleStats.byKind[result.source.kind] = (cycleStats.byKind[result.source.kind] ?? 0) + result.articles.length;
      for (const article of result.articles) {
        batch.push({
          ...article,
          symbol: article.symbol || result.source.symbol || "",
          collectedAt: nowIso(),
          sourceKey: result.source.id,
          sourceName: result.source.name,
          kind: result.source.kind,
        });
      }
    }

    if (batch.length) {
      const appended = await appendArticles(batch);
      collected += appended.added;
      cycleStats.articlesCollected += batch.length;
      cycleStats.articlesStored += appended.added;
    }
  }

  if (!skipPrune && cycleStats.cycles % 5 === 0) {
    await pruneStore(STORE_LIMITS).catch(() => undefined);
  }

  cycleStats.cycles += 1;
  cycleStats.lastRunAt = nowIso();
  cycleStats.lastDurationMs = Date.now() - started;
  cycleStats.running = false;
  await saveStats(cycleStats);
  return { ...cycleStats, sourcesTried: cycleStats.sourcesTried, collectedThisCycle: collected };
}

/**
 * Start the background rotation. Returns a stop function. Uses a plain interval
 * rather than a background service so it works without extra permissions; the
 * app also calls `runCollectionCycle` directly on open and on refresh.
 */
export function startCollector(options: CollectOptions & { intervalMs?: number } = {}): () => void {
  const { intervalMs = 15 * 60_000, ...cycleOptions } = options;
  let stopped = false;
  running = true;
  void runCollectionCycle(cycleOptions).catch(() => undefined);
  const timer = setInterval(() => {
    if (stopped) return;
    void runCollectionCycle(cycleOptions).catch(() => undefined);
  }, intervalMs);
  return () => {
    stopped = true;
    running = false;
    clearInterval(timer);
  };
}

export function catalogSummary(symbols: string[] = []) {
  const catalog = buildCatalog(symbols);
  const byProvider: Record<string, number> = {};
  const byKind: Record<string, number> = {};
  for (const source of catalog) {
    const provider = providerOf(source);
    byProvider[provider] = (byProvider[provider] ?? 0) + 1;
    byKind[source.kind] = (byKind[source.kind] ?? 0) + 1;
  }
  return {
    total: catalog.length,
    collectable: catalog.filter(isCollectable).length,
    byProvider,
    byKind,
    verified: catalog.filter((source) => source.reachability === "verified").length,
    device: catalog.filter((source) => source.reachability === "device").length,
  };
}
