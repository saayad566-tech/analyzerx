import { describe, expect, it } from "vitest";

import {
  buildEvent,
  dedupeEdges,
  emptyGraphReason,
  eventKey,
  isEdgeSupported,
  isResolvedEntity,
  mergeEventEvidence,
  type RelationshipEdge,
} from "../lib/event-schema";

const NOW = "2026-10-12T12:00:00.000Z";
const evidence = [{ articleId: "a1", url: "https://ex.com/a1", publisher: "Ex", publishedAt: "2026-10-12T09:00:00.000Z", publicationVerified: true }];

function edge(overrides: Partial<RelationshipEdge> = {}): RelationshipEdge {
  return {
    id: "e1",
    fromEntityId: "RELIANCE",
    toEntityId: "NSE",
    type: "listed_on",
    direction: "from-to",
    sourceEventId: "evt:1",
    evidence,
    confidence: 0.9,
    confidenceRationale: "Disclosed in an exchange filing.",
    period: { from: null, to: null },
    provenance: "confirmed",
    contradictory: false,
    ...overrides,
  };
}

describe("event schema (FIX 07)", () => {
  it("produces a stable, idempotent event key", () => {
    const a = eventKey({ articleIds: ["b", "a"], category: "M&A", title: "Reliance acquires X!" });
    const b = eventKey({ articleIds: ["a", "b"], category: "M&A", title: "Reliance  acquires X" });
    expect(a).toBe(b);
    expect(eventKey({ articleIds: ["a"], category: "M&A", title: "Reliance acquires Y" })).not.toBe(a);
  });

  it("refuses to build an event without a source URL", () => {
    expect(buildEvent({ title: "Headline", url: "", now: NOW })).toBeNull();
    expect(buildEvent({ title: "Headline", now: NOW })).toBeNull();
  });

  it("preserves the full evidence chain", () => {
    const event = buildEvent({ title: "Reliance acquires X", url: "https://ex.com/a1", publisher: "Ex", category: "M&A", publishedAt: "2026-10-12T09:00:00.000Z", publicationVerified: true, now: NOW });
    expect(event).not.toBeNull();
    expect(event!.evidence[0].url).toBe("https://ex.com/a1");
    expect(event!.evidence[0].publicationVerified).toBe(true);
    expect(event!.firstSeenAt).toBe(NOW);
    expect(event!.retrievedAt).toBe(NOW);
    expect(event!.publicationStatus).toBe("verified");
  });

  it("marks an unvalidated publication time as unknown, never as verified", () => {
    const event = buildEvent({ title: "H", url: "https://ex.com/a", publishedAt: null, publicationVerified: true, now: NOW });
    expect(event!.publicationStatus).toBe("unknown");
    expect(event!.publishedAt).toBeNull();
  });

  it("keeps the event id unchanged when a duplicate article is merged", () => {
    const event = buildEvent({ title: "H", url: "https://ex.com/a", articleId: "a1", now: NOW })!;
    const merged = mergeEventEvidence(event, { articleId: "a1", url: "https://ex.com/a" });
    expect(merged).toBe(event);
    const merged2 = mergeEventEvidence(event, { articleId: "a2", url: "https://ex.com/b" });
    expect(merged2.id).toBe(event.id);
    expect(merged2.evidence).toHaveLength(2);
  });

  it("flags conflicting publication dates across sources", () => {
    const event = buildEvent({ title: "H", url: "https://ex.com/a", articleId: "a1", publishedAt: "2026-10-12T09:00:00.000Z", publicationVerified: true, now: NOW })!;
    const merged = mergeEventEvidence(event, { articleId: "a2", url: "https://ex.com/b", publishedAt: "2026-10-13T09:00:00.000Z", publicationVerified: true });
    expect(merged.publicationStatus).toBe("conflicting");
    expect(merged.publishedAt).toBeNull();
  });

  it("keeps uncertain entity matches provisional or unresolved", () => {
    expect(isResolvedEntity({ entityId: "RELIANCE", mention: "Reliance", confidence: 0.95, status: "resolved" })).toBe(true);
    expect(isResolvedEntity({ entityId: "RELIANCE", mention: "Reliance", confidence: 0.5, status: "provisional" })).toBe(false);
    expect(isResolvedEntity({ entityId: null, mention: "Reliance", confidence: null, status: "unresolved" })).toBe(false);
    expect(isResolvedEntity({ entityId: "RELIANCE", mention: "Reliance", confidence: 0.9, status: "provisional" })).toBe(false);
  });
});

describe("relationship edges (FIX 07)", () => {
  it("rejects an edge with no evidence", () => {
    const result = isEdgeSupported(edge({ evidence: [] }));
    expect(result.supported).toBe(false);
    expect(result.reason).toMatch(/no supporting evidence/i);
  });

  it("rejects an edge with no source event or no rationale", () => {
    expect(isEdgeSupported(edge({ sourceEventId: "" })).supported).toBe(false);
    expect(isEdgeSupported(edge({ confidenceRationale: "" })).supported).toBe(false);
    expect(isEdgeSupported(edge({ evidence: [{ ...evidence[0], url: "" }] })).supported).toBe(false);
  });

  it("accepts a supported edge and states its provenance", () => {
    expect(isEdgeSupported(edge()).supported).toBe(true);
    expect(isEdgeSupported(edge({ provenance: "inferred" })).reason).toMatch(/inferred/i);
  });

  it("drops unsupported edges and merges duplicates", () => {
    const result = dedupeEdges([
      edge({ id: "e1" }),
      edge({ id: "e2", evidence: [{ articleId: "a2", url: "https://ex.com/a2", publisher: "Ex2", publishedAt: "2026-10-12T09:00:00.000Z", publicationVerified: true }] }), // same endpoints + type, new evidence
      edge({ id: "e3", evidence: [] }), // unsupported
      edge({ id: "e4", fromEntityId: "TCS", toEntityId: "NSE" }),
    ]);
    expect(result.edges.map((item) => item.id)).toEqual(["e1", "e4"]);
    // Only the unsupported edge is dropped; the duplicate was merged into e1.
    expect(result.dropped).toBe(1);
    expect(result.edges[0].evidence.length).toBeGreaterThan(1);
  });

  it("keeps a contradictory edge separate from the confirmed one", () => {
    const result = dedupeEdges([edge({ id: "confirmed" }), edge({ id: "contradiction", contradictory: true })]);
    expect(result.edges).toHaveLength(2);
  });
});

describe("graph empty state (FIX 07)", () => {
  it("explains the honest empty state", () => {
    expect(emptyGraphReason([])).toMatch(/No verified events are persisted yet/i);
    const provisional = buildEvent({ title: "H", url: "https://ex.com/a", now: NOW })!;
    expect(emptyGraphReason([{ ...provisional, verification: "unverified" }])).toMatch(/none is verified/i);
    expect(emptyGraphReason([provisional])).toMatch(/no relationship .* is supported by evidence/i);
  });
});
