import { describe, expect, it, vi } from "vitest";
import { ProxyAgent, setGlobalDispatcher } from "undici";

const egressProxy =
  process.env.https_proxy ?? process.env.HTTPS_PROXY ?? process.env.http_proxy ?? process.env.HTTP_PROXY;
if (egressProxy) setGlobalDispatcher(new ProxyAgent(egressProxy));

vi.mock("@react-native-async-storage/async-storage", () => {
  const store = new Map<string, string>();
  return {
    default: {
      getItem: async (key: string) => store.get(key) ?? null,
      setItem: async (key: string, value: string) => void store.set(key, value),
      removeItem: async (key: string) => void store.delete(key),
      getAllKeys: async () => [...store.keys()],
      multiRemove: async (keys: string[]) => keys.forEach((key) => store.delete(key)),
    },
  };
});

import { buildCatalog, catalogStats, providerOf, CATALOG_TARGET } from "../lib/open-data/catalog";
import { appendArticles, queryArchive, storeStats, pruneStore, clearStore, type StoredArticle } from "../lib/open-data/store";
import { catalogSummary, collectorStats, runCollectionCycle } from "../lib/open-data/collector";

const NETWORK_TIMEOUT = 60_000;

function article(id: string, overrides: Partial<StoredArticle> = {}): StoredArticle {
  return {
    id,
    symbol: "RELIANCE",
    headline: `Headline ${id}`,
    summary: "",
    source: "Test Feed",
    url: `https://example.com/${id}`,
    publishedAt: new Date(Date.now() - 3_600_000).toISOString(),
    sentiment: "Neutral",
    impactScore: 50,
    keyEntities: ["RELIANCE"],
    collectedAt: new Date().toISOString(),
    sourceKey: "test-feed",
    sourceName: "Test Feed",
    kind: "news",
    ...overrides,
  };
}

describe("source catalog", () => {
  const catalog = buildCatalog();
  const stats = catalogStats(catalog);

  it("holds 800+ collection targets", () => {
    expect(stats.total).toBeGreaterThanOrEqual(800);
    expect(stats.total).toBeGreaterThanOrEqual(CATALOG_TARGET - 1);
  });

  it("has no duplicate source ids", () => {
    const ids = new Set(catalog.map((source) => source.id));
    expect(ids.size).toBe(catalog.length);
  });

  it("flags reachability honestly and never claims more than it can", () => {
    expect(stats.verified).toBeGreaterThan(0);
    expect(stats.verified + stats.device).toBe(stats.total);
    for (const source of catalog) {
      expect(["verified", "device"]).toContain(source.reachability);
      expect(source.url.startsWith("https://")).toBe(true);
      expect(source.credentialState).toBe("none-required");
    }
  });

  it("reports how many real providers back the catalog", () => {
    expect(stats.distinctProviders).toBeGreaterThanOrEqual(5);
    expect(Object.keys(stats.byProvider)).toContain("nse");
    expect(Object.keys(stats.byProvider)).toContain("sebi");
    expect(Object.keys(stats.byProvider)).toContain("google-news");
  });

  it("covers the disclosure classes the product needs", () => {
    for (const kind of ["news", "announcement", "corporate-action", "results", "insider", "regulatory", "deals", "flows", "index"]) {
      expect(stats.byKind[kind]).toBeGreaterThan(0);
    }
  });

  it("attributes query variants to their real provider", () => {
    const gnews = catalog.find((source) => source.id.startsWith("gnews-"));
    expect(gnews && providerOf(gnews)).toBe("google-news");
    const nse = catalog.find((source) => source.id.startsWith("nse-rss-"));
    expect(nse && providerOf(nse)).toBe("nse");
  });

  it("summarises the catalog for the ops screen", () => {
    const summary = catalogSummary();
    expect(summary.total).toBeGreaterThanOrEqual(800);
    expect(summary.collectable).toBeGreaterThan(0);
    expect(summary.byKind.news).toBeGreaterThan(0);
  });
});

describe("on-device history store", () => {
  it("appends, de-duplicates by id, and reports counts", async () => {
    await clearStore();
    const first = await appendArticles([article("a"), article("b"), article("a")]);
    expect(first.added).toBe(2);
    expect(first.duplicates).toBe(1);

    const second = await appendArticles([article("b"), article("c")]);
    expect(second.added).toBe(1);
    expect(second.total).toBe(3);
  });

  it("queries newest-first and oldest-first", async () => {
    await clearStore();
    const now = Date.now();
    await appendArticles([
      article("old", { publishedAt: new Date(now - 86_400_000 * 3).toISOString() }),
      article("mid", { publishedAt: new Date(now - 86_400_000).toISOString() }),
      article("new", { publishedAt: new Date(now).toISOString() }),
    ]);
    const newest = await queryArchive({ order: "newest" });
    expect(newest.articles.map((a) => a.id)).toEqual(["new", "mid", "old"]);
    const oldest = await queryArchive({ order: "oldest" });
    expect(oldest.articles.map((a) => a.id)).toEqual(["old", "mid", "new"]);
  });

  it("filters by symbol, sentiment and kind, and pages", async () => {
    await clearStore();
    await appendArticles([
      article("r1", { sentiment: "Positive" }),
      article("r2", { sentiment: "Negative" }),
      article("t1", { symbol: "TCS", headline: "TCS wins deal" }),
      article("k1", { kind: "circular" }),
    ]);
    expect((await queryArchive({ sentiment: "Positive" })).articles.map((a) => a.id)).toEqual(["r1"]);
    expect((await queryArchive({ symbol: "TCS" })).articles.map((a) => a.id)).toEqual(["t1"]);
    expect((await queryArchive({ kind: "circular" })).articles.map((a) => a.id)).toEqual(["k1"]);
    const page1 = await queryArchive({ limit: 2, offset: 0 });
    const page2 = await queryArchive({ limit: 2, offset: 2 });
    expect(page1.articles).toHaveLength(2);
    expect(page1.hasMore).toBe(true);
    expect(page2.articles).toHaveLength(2);
    expect(page2.hasMore).toBe(false);
  });

  it("reports coverage window and stats", async () => {
    await clearStore();
    await appendArticles([article("s1"), article("s2", { kind: "announcement", sourceName: "NSE" })]);
    const result = await queryArchive({});
    expect(result.coverage.from).toBeTruthy();
    expect(result.coverage.to).toBeTruthy();
    expect(result.sources.length).toBeGreaterThan(0);
    const stats = await storeStats();
    expect(stats.total).toBe(2);
    expect(stats.byKind.news).toBe(1);
    expect(stats.byKind.announcement).toBe(1);
    expect(stats.oldest).toBeTruthy();
  });

  it("prunes by age so history cannot grow without bound", async () => {
    await clearStore();
    await appendArticles([
      article("fresh"),
      article("ancient", { publishedAt: new Date(Date.now() - 400 * 86_400_000).toISOString(), collectedAt: new Date(Date.now() - 400 * 86_400_000).toISOString() }),
    ]);
    const pruned = await pruneStore({ maxItems: 20_000, maxDays: 180 });
    expect(pruned.removed).toBeGreaterThanOrEqual(1);
    const stats = await storeStats();
    expect(stats.total).toBe(1);
  });
});

describe("continuous collector", () => {
  it("starts idle with zeroed stats", async () => {
    const stats = await collectorStats();
    expect(typeof stats.cycles).toBe("number");
    expect(stats.running).toBe(false);
  });

  it("runs a bounded live cycle and records what it collected", async () => {
    await clearStore();
    const result = await runCollectionCycle({ batchSize: 2, budgetMs: 20_000, concurrency: 2, kinds: ["circular", "regulatory"], skipPrune: true });
    expect(result.cycles).toBeGreaterThanOrEqual(1);
    expect(result.sourcesTried).toBeGreaterThan(0);
    expect(result.lastRunAt).toBeTruthy();
    // NSE circulars and SEBI are official, reachable feeds — at least one must answer.
    expect(result.sourcesOk).toBeGreaterThanOrEqual(1);
    const stats = await storeStats();
    expect(stats.total).toBeGreaterThan(0);
    // Whichever official feed answered, its articles must be attributed a kind.
    expect(Object.keys(stats.byKind).length).toBeGreaterThan(0);
  }, NETWORK_TIMEOUT);
});
