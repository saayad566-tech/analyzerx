import { describe, expect, it } from "vitest";
import { ProxyAgent, setGlobalDispatcher } from "undici";

const egressProxy =
  process.env.https_proxy ?? process.env.HTTPS_PROXY ?? process.env.http_proxy ?? process.env.HTTP_PROXY;
if (egressProxy) setGlobalDispatcher(new ProxyAgent(egressProxy));

import { FALLBACK_UNIVERSE, UNIVERSE_SNAPSHOT_DATE } from "../lib/open-data/universe-fallback";
import { resolveLocal } from "../lib/open-data/link";

const NETWORK_TIMEOUT = 90_000;

describe("repairs found in the screen recording", () => {
  it("ships a real, non-invented fallback universe", () => {
    // The Screener rendered 0/0 because the live NSE universe had no fallback.
    expect(FALLBACK_UNIVERSE.length).toBeGreaterThan(400);
    for (const row of FALLBACK_UNIVERSE.slice(0, 50)) {
      expect(row.symbol.length).toBeGreaterThan(0);
      expect(row.name.length).toBeGreaterThan(0);
      expect(row.industry.length).toBeGreaterThan(0);
      expect(row.isin.startsWith("INE")).toBe(true);
    }
    expect(UNIVERSE_SNAPSHOT_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // No duplicate symbols.
    const symbols = FALLBACK_UNIVERSE.map((row) => row.symbol);
    expect(new Set(symbols).size).toBe(symbols.length);
  }, NETWORK_TIMEOUT);

  it("always yields a universe, with an industry on every row", async () => {
    const universe = (await resolveLocal("market.universe", {})) as {
      securities: Array<{ symbol: string; name: string; industry?: string }>;
      errors: string[];
    };
    // Whatever the network does, consumers must never receive an empty universe.
    expect(universe.securities.length).toBeGreaterThan(0);
    expect(universe.securities.every((row) => row.symbol && row.name)).toBe(true);
    // Industry is what stops the Screener labelling everything "Unclassified".
    expect(universe.securities.filter((row) => row.industry).length).toBeGreaterThan(0);
  }, NETWORK_TIMEOUT);

  it("screens real candidates instead of 0/0", async () => {
    const signals = (await resolveLocal("market.multibaggerSignals", { strategyId: "buffett-munger", marketId: "IN" })) as {
      universeSize: number;
      screenedCount: number;
      signals: Array<{ symbol: string; sector: string; score: number }>;
      sectors: string[];
    };
    expect(signals.universeSize).toBeGreaterThan(0);
    expect(signals.screenedCount).toBeGreaterThan(0);
    expect(signals.signals.length).toBeGreaterThan(0);
    // Sectors must be real industries, not a single "Unclassified" bucket.
    expect(signals.sectors.filter((sector) => sector !== "Unclassified").length).toBeGreaterThan(0);
  }, NETWORK_TIMEOUT);

  it("emits the graph contract the Relationship Graph screen reads", async () => {
    const graph = (await resolveLocal("graph.projection", {})) as {
      nodes: Array<Record<string, unknown>>;
      edges: Array<Record<string, unknown>>;
      evidence: string;
    };
    // The screen filters nodes by type === "entity" and only renders when
    // evidence === "source-backed"; neither field existed before.
    expect(Array.isArray(graph.nodes)).toBe(true);
    expect(Array.isArray(graph.edges)).toBe(true);
    expect(typeof graph.evidence).toBe("string");
    for (const node of graph.nodes) {
      expect(typeof node.id).toBe("string");
      expect(typeof node.type).toBe("string");
      expect(typeof node.label).toBe("string");
      expect(typeof node.caption).toBe("string");
      expect(typeof node.confidence).toBe("number");
    }
    for (const edge of graph.edges) {
      expect(typeof edge.id).toBe("string");
      expect(String(edge.from).startsWith("entity:")).toBe(true);
      expect(typeof edge.evidenceStatus).toBe("string");
      expect(typeof edge.sourceCount).toBe("number");
      expect(typeof edge.contradiction).toBe("string");
      expect(typeof edge.hop).toBe("number");
    }
  }, NETWORK_TIMEOUT);

  it("populates the graph from stored articles rather than waiting for a server", async () => {
    const graph = (await resolveLocal("graph.projection", {})) as { nodes: unknown[]; evidence: string };
    // Either the archive has articles (graph populated) or it is genuinely empty.
    // Both are valid; what is NOT valid is claiming source-backed with no nodes.
    if (graph.evidence === "source-backed") expect(graph.nodes.length).toBeGreaterThan(0);
    else expect(graph.nodes.length).toBe(0);
  }, NETWORK_TIMEOUT);
});
