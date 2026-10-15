import { getLatestEventProjections } from "./db";

export type GraphNode = { id: string; label: string; type: "entity" | "event" | "storyline"; symbol?: string | null; caption: string; confidence: number; sourceUrl?: string | null };
export type GraphEdge = { id: string; from: string; to: string; label: string; hop: number; confidence: number; evidenceStatus: "confirmed" | "partial" | "inferred"; sourceUrl: string; eventId: string; sourceCount: number; sourceUrls: string[]; contradiction: "none" | "mixed-direction" | "conflicting-sources"; clusterKey: string };

function clamp(value: number) { return Math.max(0, Math.min(100, Math.round(value))); }
function direction(sentiment: string | null | undefined) { return sentiment === "negative" ? "negative" : sentiment === "positive" ? "positive" : "neutral"; }

export async function getRelationshipGraph(symbol?: string, maxHops = 2, limit = 80, marketId?: string) {
  // Market isolation: rows are scoped to the selected market so a relationship graph never mixes
  // entities from different markets.
  const rows = await getLatestEventProjections(500, 365, marketId);
  const selected = symbol ? rows.filter((row) => row.symbol === symbol.toUpperCase()) : rows;
  const nodes = new Map<string, GraphNode>();
  const clusters = new Map<string, { from: string; to: string; label: string; hop: number; confidence: number; sourceUrls: Set<string>; eventIds: Set<string>; directions: Set<string>; latest: string }>();
  for (const row of selected.slice(0, Math.min(200, limit * 3))) {
    const rootId = `entity:${row.symbol ?? row.id}`;
    nodes.set(rootId, { id: rootId, label: row.symbol ?? "Unknown entity", type: "entity", symbol: row.symbol, caption: row.eventType, confidence: row.confidenceScore, sourceUrl: row.sourceUrl });
    const relationship = (() => { try { return JSON.parse(row.relationshipJson) as { entities?: unknown[]; relationship?: string }; } catch { return {}; } })();
    const linked = Array.isArray(relationship.entities) ? relationship.entities.filter((item): item is string => typeof item === "string").slice(0, 8) : [];
    const label = typeof relationship.relationship === "string" ? relationship.relationship : row.eventType;
    const addCluster = (from: string, to: string, edgeLabel: string, hop: number, confidence: number) => {
      const clusterKey = `${from}|${to}|${edgeLabel}`;
      const current = clusters.get(clusterKey) ?? { from, to, label: edgeLabel, hop, confidence: 0, sourceUrls: new Set<string>(), eventIds: new Set<string>(), directions: new Set<string>(), latest: row.sourceUrl };
      current.confidence = Math.max(current.confidence, confidence);
      if (row.sourceUrl) current.sourceUrls.add(row.sourceUrl);
      current.eventIds.add(row.id);
      current.directions.add(direction(row.sentiment));
      current.latest = row.sourceUrl;
      clusters.set(clusterKey, current);
    };
    for (const entity of linked) {
      const normalized = entity.trim();
      if (!normalized || normalized.toUpperCase() === (row.symbol ?? "").toUpperCase()) continue;
      const targetId = `entity:${normalized.toUpperCase()}`;
      nodes.set(targetId, { id: targetId, label: normalized, type: "entity", caption: "Source-linked entity", confidence: row.confidenceScore, sourceUrl: row.sourceUrl });
      addCluster(rootId, targetId, label, 1, row.confidenceScore);
      if (maxHops >= 2 && linked.length > 1) {
        for (const second of linked) {
          if (second === normalized) continue;
          const secondId = `entity:${second.toUpperCase()}`;
          addCluster(targetId, secondId, `indirect ${label}`, 2, clamp(row.confidenceScore - 15));
        }
      }
    }
  }
  const edges: GraphEdge[] = [...clusters.values()].map((cluster) => {
    const contradiction = cluster.directions.has("positive") && cluster.directions.has("negative") ? "mixed-direction" : cluster.sourceUrls.size > 1 && cluster.directions.has("neutral") ? "conflicting-sources" : "none";
    return { id: clusterKeyToId(cluster), from: cluster.from, to: cluster.to, label: cluster.label, hop: cluster.hop, confidence: cluster.confidence, evidenceStatus: (cluster.confidence >= 80 ? "confirmed" : cluster.confidence >= 55 ? "partial" : "inferred") as GraphEdge["evidenceStatus"], sourceUrl: cluster.latest, eventId: [...cluster.eventIds][0] ?? "", sourceCount: cluster.sourceUrls.size, sourceUrls: [...cluster.sourceUrls].slice(0, 8), contradiction: contradiction as GraphEdge["contradiction"], clusterKey: clusterKeyToId(cluster) };
  }).sort((a, b) => b.sourceCount - a.sourceCount || b.confidence - a.confidence).slice(0, limit);
  return { symbol: symbol?.toUpperCase() ?? null, maxHops, marketId: marketId ?? null, nodes: [...nodes.values()].slice(0, limit), edges, asOf: new Date().toISOString(), evidence: selected.length ? "source-backed" : "unavailable" as const };
}

function clusterKeyToId(cluster: { from: string; to: string; label: string }) { return `cluster:${cluster.from}:${cluster.to}:${cluster.label}`; }
