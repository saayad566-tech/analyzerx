import { createHash } from "node:crypto";
import { type MarketId } from "../lib/market-regions";
import { analyzeFundamentals, type FundamentalAnalysis } from "./fundamental-analysis";
import { getLatestSourceRecords, getAutonomousRecommendation, getAutonomousRecommendations, markAutonomousRecommendationNotified, upsertAutonomousRecommendation } from "./db";
import { notifyOwner } from "./_core/notification";
import { getLatestTrackedNews, type ExtractedNews } from "./news-tracker";
import { extractLiveEventChain, officialRecordToArticle } from "./live-smart-alerts";
import { deduplicateEventChains, scoreSmartEvent, type EventEvidence, type SmartEventChain, type SmartEventType } from "./smart-event-alerts";

export type RecommendationRelationship = "direct-beneficiary" | "indirect-beneficiary" | "affected-company" | "mixed-uncertain";
export type RecommendationDirection = "beneficiary" | "negative-impact" | "mixed-uncertain";
export type RecommendationStatus = "new" | "active" | "stale" | "invalidated" | "mixed" | "no-longer-eligible";

export interface AutonomousRecommendationFactor {
  label: string;
  points: number;
  reason: string;
}

export interface AutonomousRecommendation {
  id: string;
  eventKey: string;
  symbol: string;
  companyName: string;
  headline: string;
  eventType: SmartEventType;
  relationship: RecommendationRelationship;
  direction: RecommendationDirection;
  impactScore: number;
  confidenceScore: number;
  impactLevel: "very-high" | "high" | "medium" | "low";
  status: RecommendationStatus;
  reason: string;
  factors: AutonomousRecommendationFactor[];
  evidence: EventEvidence[];
  sourceTimestamp: string;
  eventTimestamp: string;
  detectedAt: string;
  staleAt: string | null;
  scoreVersion: string;
  routeTarget: string;
}

export interface AutonomousRecommendationDiscovery {
  recommendations: AutonomousRecommendation[];
  generatedAt: string;
  lookbackDays: number;
  sourceCount: number;
  eventCount: number;
  rejectedCount: number;
  coverage: { trackedNews: number; officialRecords: number; providerFailures: string[] };
}

const SCORE_VERSION = "autonomous-v1";
const NEGATIVE_TERMS = /cancel(?:led|lation)?|terminated|withdrawn|lost contract|regulatory setback|penalty|investigation|downgrade|default|fraud|delay|rejected|decline|falls? sharply|missed/i;
const POSITIVE_TERMS = /award(?:ed)?|won|partnership|approval|commissioned|expansion|investment|funding|acquisition|launch|tender|capacity|export|upgrade/i;
const HIGH_CONFIDENCE_MIN = 70;

function clamp(value: number, min = 0, max = 100) { return Math.max(min, Math.min(max, Math.round(value))); }
function textOf(article: ExtractedNews) { return `${article.headline} ${article.summary} ${article.actionable_impact} ${article.key_entities.join(" ")}`; }
function hash(value: string) { return createHash("sha256").update(value).digest("hex").slice(0, 40); }
function safeDate(value: string | null | undefined) { const parsed = value ? Date.parse(value) : NaN; return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString(); }
function directionFor(article: ExtractedNews): RecommendationDirection {
  const text = textOf(article);
  const negative = NEGATIVE_TERMS.test(text);
  const positive = POSITIVE_TERMS.test(text);
  return negative && positive ? "mixed-uncertain" : negative ? "negative-impact" : "beneficiary";
}
function sourceQuality(evidence: EventEvidence[]) {
  if (evidence.some((item) => item.status === "verified" && /nse|bse|sebi|official|company.?ir|investor/i.test(`${item.source} ${item.url}`))) return 28;
  if (evidence.some((item) => item.status === "verified")) return 20;
  if (evidence.length > 1) return 12;
  return 0;
}
function eventKey(event: SmartEventChain, direction: RecommendationDirection) {
  return hash([event.eventType, event.customerSymbol ?? "", event.supplierSymbol ?? "", event.orderValueInrCr ?? "", event.capacityMw ?? "", direction, (event.purpose ?? event.rawHeadline ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 100)].join("|"));
}
function relationshipFor(direction: RecommendationDirection, event: SmartEventChain): RecommendationRelationship {
  if (direction === "negative-impact") return "affected-company";
  if (direction === "mixed-uncertain") return "mixed-uncertain";
  return event.supplierSymbol ? "direct-beneficiary" : "indirect-beneficiary";
}
function impactLevel(score: number): AutonomousRecommendation["impactLevel"] { return score >= 85 ? "very-high" : score >= 70 ? "high" : score >= 45 ? "medium" : "low"; }
function companyNameFor(event: SmartEventChain, direction: RecommendationDirection) {
  if (direction === "negative-impact") return event.supplierName ?? event.supplierSymbol ?? "Unknown company";
  return event.supplierName ?? event.supplierSymbol ?? event.customerName ?? event.customerSymbol ?? "Unknown company";
}
function scoreRecommendation(event: SmartEventChain, direction: RecommendationDirection): { impactScore: number; confidenceScore: number; factors: AutonomousRecommendationFactor[] } {
  const base = scoreSmartEvent(event);
  const factors: AutonomousRecommendationFactor[] = base.factors.map((factor) => ({ label: factor.label, points: factor.points, reason: factor.reason }));
  const quality = sourceQuality(event.evidence);
  if (quality > 0) factors.push({ label: "Source hierarchy", points: quality, reason: quality >= 28 ? "An official exchange, regulator, or company source supports the event." : "Verified or corroborating source evidence supports the event." });
  if (event.executionPeriod) factors.push({ label: "Execution visibility", points: 8, reason: `The source includes an execution period: ${event.executionPeriod}.` });
  if (event.historicalRelationship === "repeat") factors.push({ label: "Repeat-business context", points: 7, reason: "A source-backed repeat relationship is attached." });
  if (direction === "negative-impact") factors.push({ label: "Negative event direction", points: 10, reason: "The source text contains a material adverse event signal." });
  if (direction === "mixed-uncertain") factors.push({ label: "Mixed evidence", points: -12, reason: "Positive and adverse signals appear together; interpretation remains uncertain." });
  const numericConfidence = event.orderValueInrCr !== null && event.orderValueInrCr !== undefined ? 10 : 0;
  const evidenceConfidence = Math.min(25, quality + Math.max(0, event.evidence.length - 1) * 5);
  const relationshipConfidence = event.customerSymbol && event.supplierSymbol ? 25 : 0;
  const freshnessConfidence = event.evidence.some((item) => item.status === "stale") ? 0 : 15;
  const directionConfidence = direction === "mixed-uncertain" ? 5 : 15;
  const confidenceScore = clamp(evidenceConfidence + relationshipConfidence + numericConfidence + freshnessConfidence + directionConfidence);
  return { impactScore: clamp(factors.reduce((sum, factor) => sum + factor.points, 0)), confidenceScore, factors };
}
function explain(event: SmartEventChain, direction: RecommendationDirection, relationship: RecommendationRelationship, impactScore: number, confidenceScore: number) {
  const subject = companyNameFor(event, direction);
  const counterparty = event.customerName ?? event.customerSymbol ?? "an identified counterparty";
  const eventText = event.eventType.replace(/-/g, " ");
  const directionText = direction === "negative-impact" ? "potentially affected" : direction === "mixed-uncertain" ? "requires review because the evidence is mixed" : "highlighted";
  const materiality = event.orderToRevenuePct !== null && event.orderToRevenuePct !== undefined ? ` The disclosed value is ${event.orderToRevenuePct.toFixed(1)}% of reported revenue.` : " Materiality is shown only where valid source values are available.";
  return `${subject} is ${directionText} because ${counterparty} is connected through a source-backed ${eventText} relationship. The relationship is classified as ${relationship.replace(/-/g, " ")} and supported by ${event.evidence.length} evidence source(s).${materiality} Impact ${impactScore}/100; confidence ${confidenceScore}/100.`;
}

export function buildAutonomousRecommendation(event: SmartEventChain): AutonomousRecommendation | null {
  if (!event.supplierSymbol || !event.evidence.length || event.evidence.every((item) => item.status === "unavailable")) return null;
  const direction = directionFor({ headline: event.rawHeadline ?? "", summary: event.purpose ?? "", actionable_impact: "", key_entities: [event.supplierSymbol], id: event.id, symbol: event.supplierSymbol, category: "Markets", sentiment: "Neutral", published_at: event.detectedAt, url: event.evidence[0]?.url ?? "", source: event.evidence[0]?.source ?? "", impact_score: 0, high_impact: false });
  const relationship = relationshipFor(direction, event);
  const { impactScore, confidenceScore } = scoreRecommendation(event, direction);
  const eventTimestamp = safeDate(event.detectedAt);
  const id = `auto-${eventKey(event, direction)}`;
  const key = eventKey(event, direction);
  const staleAt = event.evidence.some((item) => item.status === "stale") ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null;
  const status: RecommendationStatus = direction === "mixed-uncertain" ? "mixed" : confidenceScore >= HIGH_CONFIDENCE_MIN ? "active" : "new";
  return { id, eventKey: key, symbol: event.supplierSymbol, companyName: companyNameFor(event, direction), headline: event.rawHeadline ?? event.purpose ?? `${event.eventType.replace(/-/g, " ")} detected`, eventType: event.eventType, relationship, direction, impactScore, confidenceScore, impactLevel: impactLevel(impactScore), status, reason: explain(event, direction, relationship, impactScore, confidenceScore), factors: scoreRecommendation(event, direction).factors, evidence: event.evidence, sourceTimestamp: safeDate(event.evidence[0]?.retrievedAt), eventTimestamp, detectedAt: new Date().toISOString(), staleAt, scoreVersion: SCORE_VERSION, routeTarget: `/company/${encodeURIComponent(event.supplierSymbol)}` };
}

export function discoverAutonomousRecommendationsFromChains(events: SmartEventChain[], lookbackDays = 30): AutonomousRecommendationDiscovery {
  const cutoff = Date.now() - Math.min(180, Math.max(1, lookbackDays)) * 86_400_000;
  const recommendations = deduplicateEventChains(events).map(buildAutonomousRecommendation).filter((item): item is AutonomousRecommendation => Boolean(item)).filter((item) => Date.parse(item.eventTimestamp) >= cutoff && item.confidenceScore >= HIGH_CONFIDENCE_MIN).sort((a, b) => b.impactScore - a.impactScore || b.confidenceScore - a.confidenceScore || b.eventTimestamp.localeCompare(a.eventTimestamp));
  return { recommendations, generatedAt: new Date().toISOString(), lookbackDays, sourceCount: events.reduce((sum, event) => sum + event.evidence.length, 0), eventCount: events.length, rejectedCount: Math.max(0, events.length - recommendations.length), coverage: { trackedNews: 0, officialRecords: 0, providerFailures: [] } };
}

export async function discoverAutonomousRecommendations(marketId: MarketId, lookbackDays = 30, limit = 50): Promise<AutonomousRecommendationDiscovery> {
  const [trackedNews, records] = await Promise.all([getLatestTrackedNews(300, undefined, marketId), getLatestSourceRecords(marketId, 500)]);
  const officialArticles = records.map((record) => officialRecordToArticle(record, marketId)).filter((item): item is ExtractedNews => Boolean(item));
  const articles = [...trackedNews, ...officialArticles].filter((article) => Date.parse(article.published_at) >= Date.now() - Math.min(180, Math.max(1, lookbackDays)) * 86_400_000);
  const symbols = [...new Set(articles.map((article) => article.symbol).filter(Boolean))].slice(0, 40);
  const profiles: Record<string, FundamentalAnalysis> = {};
  const providerFailures: string[] = [];
  await Promise.all(symbols.map(async (symbol) => { try { profiles[symbol] = await analyzeFundamentals(symbol, marketId); } catch (error) { providerFailures.push(`${symbol}: ${String(error)}`); } }));
  const chains = articles.map((article) => extractLiveEventChain(article, profiles)).filter((event): event is SmartEventChain => Boolean(event));
  const result = discoverAutonomousRecommendationsFromChains(chains, lookbackDays);
  for (const recommendation of result.recommendations.slice(0, Math.min(100, limit))) {
    const existing = await getAutonomousRecommendation(recommendation.id);
    await upsertAutonomousRecommendation(recommendation, existing);
    const notificationsEnabled = process.env.AUTONOMOUS_RECOMMENDATION_NOTIFICATIONS_ENABLED !== "false";
    const newlyActive = recommendation.status === "active" && existing?.status !== "active" && !existing?.lastNotifiedAt;
    if (notificationsEnabled && newlyActive) {
      try {
        const delivered = await notifyOwner({ title: `Event opportunity: ${recommendation.symbol}`, content: `${recommendation.headline} Impact ${recommendation.impactScore}/100 · confidence ${recommendation.confidenceScore}/100. ${recommendation.evidence[0]?.url ?? "Evidence link unavailable"}` });
        if (delivered) await markAutonomousRecommendationNotified(recommendation.id);
      } catch (error) {
        console.warn("[AutonomousRecommendations] notification delivery unavailable:", error);
      }
    }
  }
  return { ...result, recommendations: result.recommendations.slice(0, limit), coverage: { trackedNews: trackedNews.length, officialRecords: officialArticles.length, providerFailures } };
}

export async function getPersistedAutonomousRecommendations(options: { marketId: MarketId; lookbackDays?: number; limit?: number; sort?: "impact" | "confidence" | "latest" }) {
  const rows = await getAutonomousRecommendations(options.marketId, options.lookbackDays ?? 30, options.limit ?? 50);
  return [...rows].sort((a, b) => options.sort === "confidence" ? b.confidenceScore - a.confidenceScore : options.sort === "latest" ? b.eventTimestamp.getTime() - a.eventTimestamp.getTime() : b.impactScore - a.impactScore);
}
