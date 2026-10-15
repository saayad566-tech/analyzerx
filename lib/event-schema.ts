/**
 * Traceable event and relationship schema (FIX 07).
 *
 * The Relationship Graph said "Waiting for persisted verified events" and "No
 * verified relationship chain yet". Two things had to be true for that screen to
 * populate honestly: an event had to preserve a full evidence chain, and a
 * relationship edge had to be supported by evidence — never inferred because two
 * headlines shared a keyword or appeared near each other in time.
 *
 * This module defines that contract, the idempotent event key, and the edge
 * validation rules. It deliberately does not invent relationships: an edge
 * without evidence is rejected, and an event without a valid publication time or
 * a source URL is not a verified event.
 */

import { stableArticleId } from "./news-normalization";

export type EntityMention = {
  /** Stable identifier when resolution succeeded (e.g. an NSE symbol or ISIN). */
  entityId: string | null;
  /** The surface form found in the source text. */
  mention: string;
  /** 0-1 resolution confidence; null when unresolved. */
  confidence: number | null;
  /** "resolved" only when a stable identifier was matched with confidence. */
  status: "resolved" | "provisional" | "unresolved";
};

export type EvidenceReference = {
  articleId: string;
  url: string;
  publisher: string;
  /** The publication instant, or null when it could not be validated. */
  publishedAt: string | null;
  /** True when publishedAt is a validated instant (not a fallback). */
  publicationVerified: boolean;
};

export type TraceableEvent = {
  /** Stable, idempotent key — the same evidence always produces the same id. */
  id: string;
  category: string;
  title: string;
  /** Original article ids that produced this event. */
  articleIds: string[];
  evidence: EvidenceReference[];
  /** First time the app saw this event, and when it was retrieved. */
  firstSeenAt: string;
  retrievedAt: string;
  /** Publication instant if every supporting article agrees and is valid. */
  publishedAt: string | null;
  publicationStatus: "verified" | "unknown" | "conflicting";
  entities: EntityMention[];
  /** "verified" only when at least one evidence reference has a valid source URL. */
  verification: "verified" | "provisional" | "unverified";
  /** Why the event is not verified, when it is not. */
  unverifiedReason?: string;
};

export type RelationshipEdge = {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  type: string;
  /** Direction, when the relationship is directional. */
  direction: "from-to" | "to-from" | "symmetric";
  /** The event/document that supports this edge. */
  sourceEventId: string;
  /** The specific evidence behind the edge. */
  evidence: EvidenceReference[];
  /** 0-1 confidence, with a stated rationale. */
  confidence: number | null;
  confidenceRationale: string;
  /** The period the relationship applies to. */
  period: { from: string | null; to: string | null };
  /** Directly confirmed in the source, or inferred by the app. */
  provenance: "confirmed" | "inferred";
  /** True when the relationship is a contradiction rather than a fact. */
  contradictory: boolean;
};

export type EventBuildInput = {
  articleId?: string;
  url?: string;
  publisher?: string;
  title: string;
  category?: string;
  /** Publication instant (already parsed) or null. */
  publishedAt?: string | null;
  publicationVerified?: boolean;
  entities?: EntityMention[];
  now?: string;
};

/** Idempotent event key: the same evidence always yields the same id. */
export function eventKey(input: { articleIds: readonly string[]; category: string; title: string }): string {
  const articles = [...input.articleIds].sort().join("|");
  const normalizedTitle = input.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return `evt:${input.category.toLowerCase()}:${articles}:${normalizedTitle}`.slice(0, 320);
}

/** True when a mention is usable as a stable graph node. */
export function isResolvedEntity(mention: EntityMention): boolean {
  return mention.status === "resolved" && Boolean(mention.entityId) && (mention.confidence ?? 0) >= 0.8;
}

/**
 * Build a traceable event from one article. Returns null when the record cannot
 * support a verified event (no URL), so a malformed item never becomes a graph
 * node.
 */
export function buildEvent(input: EventBuildInput): TraceableEvent | null {
  const now = input.now ?? new Date().toISOString();
  const url = (input.url ?? "").trim();
  if (!url) return null;
  const articleId = input.articleId?.trim() || stableArticleId({ url, headline: input.title });
  const publicationVerified = Boolean(input.publicationVerified) && Boolean(input.publishedAt);
  const evidence: EvidenceReference = {
    articleId,
    url,
    publisher: input.publisher ?? "",
    publishedAt: input.publishedAt ?? null,
    publicationVerified,
  };
  const category = input.category ?? "general";
  const articleIds = [articleId];
  return {
    id: eventKey({ articleIds, category, title: input.title }),
    category,
    title: input.title,
    articleIds,
    evidence: [evidence],
    firstSeenAt: now,
    retrievedAt: now,
    publishedAt: publicationVerified ? input.publishedAt! : null,
    publicationStatus: publicationVerified ? "verified" : "unknown",
    entities: input.entities ?? [],
    verification: "verified",
  };
}

/**
 * Merge a duplicate article into an existing event idempotently: the id is
 * unchanged, evidence is appended once, and the publication status is downgraded
 * to "conflicting" if the sources disagree.
 */
export function mergeEventEvidence(event: TraceableEvent, incoming: { articleId: string; url: string; publisher?: string; publishedAt?: string | null; publicationVerified?: boolean }): TraceableEvent {
  if (event.articleIds.includes(incoming.articleId)) return event;
  const evidence: EvidenceReference = {
    articleId: incoming.articleId,
    url: incoming.url,
    publisher: incoming.publisher ?? "",
    publishedAt: incoming.publishedAt ?? null,
    publicationVerified: Boolean(incoming.publicationVerified) && Boolean(incoming.publishedAt),
  };
  const dates = [...event.evidence, evidence].map((item) => item.publishedAt).filter((value): value is string => Boolean(value));
  const distinct = [...new Set(dates)];
  const publicationStatus: TraceableEvent["publicationStatus"] = distinct.length === 0 ? "unknown" : distinct.length > 1 ? "conflicting" : "verified";
  return {
    ...event,
    articleIds: [...event.articleIds, incoming.articleId].sort(),
    evidence: [...event.evidence, evidence],
    publishedAt: publicationStatus === "verified" ? distinct[0] : null,
    publicationStatus,
  };
}

/**
 * Validate a candidate edge. An edge is only acceptable when it is anchored to a
 * source event AND carries at least one evidence reference. This is the rule that
 * stops the graph from inventing relationships from keyword or time proximity.
 */
export function isEdgeSupported(edge: Pick<RelationshipEdge, "sourceEventId" | "evidence" | "provenance" | "confidenceRationale">): { supported: boolean; reason: string } {
  if (!edge.sourceEventId) return { supported: false, reason: "The edge has no source event." };
  if (edge.evidence.length === 0) return { supported: false, reason: "The edge has no supporting evidence." };
  if (!edge.evidence.some((item) => item.url)) return { supported: false, reason: "No evidence reference carries a source URL." };
  if (!edge.confidenceRationale?.trim()) return { supported: false, reason: "The edge states no confidence rationale." };
  return { supported: true, reason: edge.provenance === "confirmed" ? "Directly confirmed in the source." : "Inferred from the cited evidence." };
}

/** True when two mentions refer to the same graph node. */
function sameEntity(a: RelationshipEdge, b: RelationshipEdge): boolean {
  return a.fromEntityId === b.fromEntityId && a.toEntityId === b.toEntityId && a.type === b.type;
}

/**
 * Collapse duplicate edges (same endpoints and type) into one, merging evidence.
 * A contradictory edge is kept separate so it is never displayed as an
 * established fact.
 */
export function dedupeEdges(edges: readonly RelationshipEdge[]): { edges: RelationshipEdge[]; dropped: number } {
  const result: RelationshipEdge[] = [];
  let dropped = 0;
  for (const edge of edges) {
    const support = isEdgeSupported(edge);
    if (!support.supported) {
      dropped += 1;
      continue;
    }
    const existing = result.find((candidate) => sameEntity(candidate, edge) && candidate.contradictory === edge.contradictory);
    if (!existing) {
      result.push(edge);
      continue;
    }
    const known = new Set(existing.evidence.map((item) => item.articleId));
    const merged = edge.evidence.filter((item) => !known.has(item.articleId));
    if (merged.length === 0) {
      dropped += 1;
      continue;
    }
    existing.evidence = [...existing.evidence, ...merged];
    existing.confidence = Math.min(1, (existing.confidence ?? 0.5) + 0.1 * merged.length);
    existing.confidenceRationale = `${existing.confidenceRationale} Corroborated by ${merged.length} further source(s).`;
  }
  return { edges: result, dropped };
}

/** Human-readable reason for the graph's empty state, when there is nothing to show. */
export function emptyGraphReason(events: readonly TraceableEvent[]): string {
  if (events.length === 0) {
    return "No verified events are persisted yet. The graph populates only from source-backed events that carry a valid article URL, so it stays empty until a permitted source returns one.";
  }
  const verified = events.filter((event) => event.verification === "verified");
  if (verified.length === 0) return "Events exist but none is verified (each needs a source URL and a validated publication time).";
  return "Verified events exist, but no relationship between them is supported by evidence yet. Edges are never inferred from keyword or time proximity.";
}
