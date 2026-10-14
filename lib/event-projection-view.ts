/**
 * Maps a persisted, market-scoped event projection onto the shape the Live screen's
 * event card renders.
 *
 * The defect this fixes: the Live tab rendered `events` from `lib/market-data.ts` — a
 * hardcoded demo array of Indian companies (Larsen & Toubro, Waaree Energies), rupee
 * values and Gujarat locations. It had no market scoping at all, so every market showed
 * those same Indian events. Real, market-scoped projections from `events.latest` are now
 * the only source, and an empty result is shown as an honest empty state.
 *
 * Pure module: it takes a plain row and returns a plain object, so it is unit-testable
 * and imports nothing from React Native.
 */
import type { MarketEvent, EventKind, Confidence, FactStatus } from "./market-data";

/** The subset of the `event_projections` row this mapper reads. */
export type EventProjectionRow = {
  id: string;
  marketId: string;
  symbol: string | null;
  eventType: string;
  title: string;
  summary: string;
  relationshipJson: string;
  sentiment: "positive" | "neutral" | "negative" | "mixed";
  impactScore: number;
  confidenceScore: number;
  status: "active" | "stale" | "invalidated";
  sourceUrl: string;
  sourceKey: string;
  eventAt: Date | string;
};

const EVENT_KIND_BY_TYPE: Record<string, EventKind> = {
  order: "Large order",
  partnership: "Partnership",
  "capacity-expansion": "Capacity expansion",
  "corporate-action": "Regulatory action",
  "financial-result": "Results / guidance",
  regulatory: "Regulatory action",
  "market-news": "Partnership",
};

function toKind(eventType: string): EventKind {
  return EVENT_KIND_BY_TYPE[eventType] ?? "Partnership";
}

function toConfidence(score: number): Confidence {
  if (score >= 80) return "High";
  if (score >= 55) return "Medium";
  return "Low";
}

function toSentiment(value: EventProjectionRow["sentiment"]): MarketEvent["sentiment"] {
  if (value === "positive") return "Positive";
  if (value === "negative") return "Negative";
  return "Neutral";
}

/** Facts written by the source are Confirmed; anything else is labelled as inference. */
function toFactStatus(row: EventProjectionRow): FactStatus {
  return row.sourceKey && !/inferred|model|ai/i.test(row.sourceKey) ? "Confirmed" : "AI inference";
}

function readRelationship(row: EventProjectionRow): { entities: string[]; relationship: string } {
  try {
    const parsed = JSON.parse(row.relationshipJson) as { entities?: unknown; relationship?: unknown };
    const entities = Array.isArray(parsed.entities) ? parsed.entities.filter((item): item is string => typeof item === "string") : [];
    const relationship = typeof parsed.relationship === "string" ? parsed.relationship : "reported by source";
    return { entities, relationship };
  } catch {
    return { entities: [], relationship: "reported by source" };
  }
}

function timeLabel(value: Date | string): { time: string; dateLabel: string } {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return { time: "—", dateLabel: "Time unavailable" };
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const sameDay = new Date().toDateString() === date.toDateString();
  return { time: `${hh}:${mm}`, dateLabel: sameDay ? `Today, ${hh}:${mm}` : date.toLocaleDateString() };
}

/**
 * Convert one projection row into a renderable event.
 *
 * The primary symbol comes from the row. Any additional entities come from the stored
 * relationship payload; they are only ever shown as the second party when the row
 * actually carries them, never invented.
 */
export function eventProjectionToMarketEvent(row: EventProjectionRow): MarketEvent {
  const { entities, relationship } = readRelationship(row);
  const primary = (row.symbol ?? entities[0] ?? "").toUpperCase();
  const secondary = entities.find((entity) => entity.toUpperCase() !== primary)?.toUpperCase();
  const { time, dateLabel } = timeLabel(row.eventAt);
  return {
    id: row.id,
    time,
    dateLabel,
    kind: toKind(row.eventType),
    title: row.title,
    companyA: primary,
    symbolA: primary,
    companyB: secondary,
    symbolB: secondary,
    relationship,
    sector: row.eventType.replace(/-/g, " "),
    source: row.sourceKey,
    sourceUrl: row.sourceUrl,
    sentiment: toSentiment(row.sentiment),
    relevance: row.summary,
    confidence: toConfidence(row.confidenceScore),
    score: row.impactScore,
    status: toFactStatus(row),
    storylineId: `storyline:${primary}`,
    tags: [row.eventType, row.sentiment].filter(Boolean),
  };
}

/** Map a batch of rows, preserving order. */
export function eventProjectionsToMarketEvents(rows: readonly EventProjectionRow[]): MarketEvent[] {
  return rows.map(eventProjectionToMarketEvent);
}
