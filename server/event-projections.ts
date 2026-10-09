import { createHash } from "node:crypto";
import { getLatestSourceRecords, upsertEventProjection } from "./db";
import { resolveEntity } from "./entities";
import { officialRecordToArticle } from "./live-smart-alerts";
import { getLatestTrackedNews, type ExtractedNews } from "./news-tracker";

function eventType(article: ExtractedNews) {
  const text = `${article.headline} ${article.summary} ${article.actionable_impact}`.toLowerCase();
  if (/earnings|profit|revenue|guidance/.test(text)) return "financial-result";
  if (/order|contract|award|purchase/.test(text)) return "order";
  if (/partnership|mou|joint venture|collaboration/.test(text)) return "partnership";
  if (/acquisition|merger|takeover/.test(text)) return "corporate-action";
  if (/approval|regulatory|government|policy/.test(text)) return "regulatory";
  if (/capacity|expansion|plant|commission/.test(text)) return "capacity-expansion";
  return "market-news";
}
function sentiment(value: ExtractedNews["sentiment"]): "positive" | "neutral" | "negative" | "mixed" { return value === "Positive" ? "positive" : value === "Negative" ? "negative" : "neutral"; }
function storylineKey(symbol: string, type: string) { return `storyline:${symbol.toUpperCase()}:${type}`; }
function stableId(article: ExtractedNews) { return `projection-${createHash("sha256").update(`${article.symbol}:${article.url}:${article.headline}`).digest("hex").slice(0, 120)}`; }

export async function projectArticle(article: ExtractedNews, sourceRecordId?: string | null) {
  const entity = await resolveEntity(article.symbol);
  const eventAt = new Date(article.published_at);
  const safeEventAt = Number.isNaN(eventAt.getTime()) ? new Date() : eventAt;
  const detectedAt = new Date();
  const projection = {
    id: stableId(article),
    eventKey: `${article.symbol}:${article.url}`.slice(0, 160),
    entityId: entity.entity?.id ?? null,
    symbol: article.symbol.toUpperCase(),
    storylineKey: storylineKey(article.symbol, eventType(article)),
    eventType: eventType(article),
    title: article.headline.slice(0, 500),
    summary: article.summary.slice(0, 2_000),
    relationshipJson: JSON.stringify({ entities: article.key_entities, relationship: "reported-by-source" }),
    sentiment: sentiment(article.sentiment),
    impactScore: Math.max(0, Math.min(100, article.impact_score)),
    confidenceScore: entity.entity?.resolutionStatus === "verified" ? 90 : entity.entity ? 70 : 45,
    status: "active" as const,
    sourceRecordId: sourceRecordId ?? null,
    sourceUrl: article.url,
    sourceKey: article.source.slice(0, 64),
    eventAt: safeEventAt,
    detectedAt,
    staleAt: new Date(safeEventAt.getTime() + 30 * 86_400_000),
    evidenceJson: JSON.stringify({ headline: article.headline, summary: article.summary, source: article.source, url: article.url, publishedAt: article.published_at, entityResolution: entity.reason }),
    parserVersion: "event-projection-v1",
    createdAt: detectedAt,
    updatedAt: detectedAt,
  };
  const stored = await upsertEventProjection(projection);
  return { stored, projection, entityResolution: entity };
}

export async function projectLatestEvidence(limit = 250) {
  const [news, records] = await Promise.all([getLatestTrackedNews(limit), getLatestSourceRecords(limit)]);
  const official = records.map((record) => ({ article: officialRecordToArticle(record), recordId: record.id })).filter((item: { article: ExtractedNews | null; recordId: string }): item is { article: ExtractedNews; recordId: string } => Boolean(item.article));
  const deduped = new Map<string, { article: ExtractedNews; recordId?: string }>();
  for (const article of news) deduped.set(`${article.symbol}:${article.url}`, { article });
  for (const item of official) deduped.set(`${item.article.symbol}:${item.article.url}`, item);
  let stored = 0;
  for (const item of [...deduped.values()].slice(0, limit)) { const result = await projectArticle(item.article, item.recordId); stored += Number(result.stored); }
  return { discovered: deduped.size, stored };
}
