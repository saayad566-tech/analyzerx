import mysql from "mysql2";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/mysql2";
import { and, asc, desc, eq, gt, gte, inArray, like, lt, or, sql } from "drizzle-orm";
import { AutonomousRecommendation, Entity, EventProjection, InsertAutonomousRecommendation, InsertEntity, InsertEventProjection, InsertFundamentalObservation, InsertMarketObservation, InsertNewsEvent, InsertPushToken, InsertSmartAlertResult, InsertSourceRecord, InsertUser, InsertUserAlertResult, InsertUserNotificationPreferences, InsertUserSavedResearch, autonomousRecommendations, entities, eventProjections, fundamentalObservations, heldNewsArticles, marketObservations, newsEvents, newsRelevanceFeedback, pushTokens, smartAlertResults, sourceRecords, providerHealthHistory, users, userAlertResults, userAlertRules, userNotificationPreferences, userPushTokens, userSavedResearch, userSavedScreens, userWatchlistItems, userMarketPreferences, researchRuns, researchAgentRuns, type UserMarketPreference, type InsertResearchRun, type InsertResearchAgentRun, type InsertProviderHealthHistory, type InsertNewsRelevanceFeedback, type InsertHeldNewsArticle, type UserNotification, type InsertUserNotification, type PushToken, userNotifications } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { normalizePushTokenPage } from "./push-batching";

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: mysql.Pool | null = null;

// Lazily create a real mysql2 pool so the health check and queries use an actual connection.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _pool = mysql.createPool({ uri: process.env.DATABASE_URL, connectionLimit: 4, enableKeepAlive: true });
      _db = drizzle(_pool);
    } catch (error) {
      console.warn("[Database] Failed to initialize:", error);
      _pool = null;
      _db = null;
    }
  }
  return _db;
}

export async function isDatabaseQueryable() {
  const db = await getDb();
  if (!db) return false;
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch (error) {
    console.warn("[Database] Queryability check failed:", error);
    return false;
  }
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function recordProviderHealthSnapshot(snapshot: Omit<InsertProviderHealthHistory, "id" | "createdAt">) {
  const db = await getDb();
  if (!db) return false;
  try {
    await db.insert(providerHealthHistory).values({ ...snapshot, id: `${snapshot.providerId}:${snapshot.checkedAt.getTime()}:${randomUUID()}` });
    await db.execute(sql`DELETE FROM provider_health_history WHERE providerId = ${snapshot.providerId} AND createdAt < (NOW() - INTERVAL 30 DAY)`);
    return true;
  } catch (error) {
    console.warn("[Database] Failed to record provider health snapshot:", error);
    return false;
  }
}

export async function listProviderHealthHistory(providerId?: string, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  const safeLimit = Math.max(1, Math.min(200, limit));
  const query = db.select().from(providerHealthHistory).orderBy(desc(providerHealthHistory.checkedAt)).limit(safeLimit);
  return providerId ? query.where(eq(providerHealthHistory.providerId, providerId)) : query;
}

export async function saveNewsEvent(event: InsertNewsEvent): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.insert(newsEvents).values(event).onDuplicateKeyUpdate({
    set: {
      headline: event.headline,
      summary: event.summary,
      keyEntities: event.keyEntities,
      sentiment: event.sentiment,
      actionableImpact: event.actionableImpact,
      impactScore: event.impactScore,
      highImpact: event.highImpact,
    },
  });
  return true;
}

export async function getLatestNewsEvents(limit: number, marketId?: string) {
  const db = await getDb();
  if (!db) return [];
  const query = db.select().from(newsEvents).orderBy(desc(newsEvents.publishedAt)).limit(limit);
  return marketId ? query.where(eq(newsEvents.marketId, marketId)) : query;
}

export async function getImpactRankedNewsEvents(symbol: string | undefined, limit: number, marketId?: string) {
  const db = await getDb();
  if (!db) return [];
  const filters = [];
  if (symbol) filters.push(eq(newsEvents.symbol, symbol));
  if (marketId) filters.push(eq(newsEvents.marketId, marketId));
  const query = db.select().from(newsEvents).orderBy(desc(newsEvents.impactScore), desc(newsEvents.publishedAt)).limit(limit);
  return filters.length ? query.where(and(...filters)) : query;
}

export async function getNewsArchiveEvents({ marketId, symbol, from, to, limit = 100, offset = 0 }: { marketId: string; symbol?: string; from: Date; to?: Date; limit?: number; offset?: number }) {
  const db = await getDb();
  if (!db) return [];
  const filters = [eq(newsEvents.marketId, marketId), gte(newsEvents.publishedAt, from)];
  if (to) filters.push(lt(newsEvents.publishedAt, to));
  if (symbol) filters.push(eq(newsEvents.symbol, symbol));
  return db.select().from(newsEvents).where(and(...filters)).orderBy(desc(newsEvents.publishedAt)).limit(Math.max(1, Math.min(5000, limit))).offset(Math.max(0, Math.min(10000, offset)));
}

export async function saveNewsRelevanceFeedback(feedback: InsertNewsRelevanceFeedback) {
  const db = await getDb();
  if (!db) return false;
  await db.insert(newsRelevanceFeedback).values(feedback).onDuplicateKeyUpdate({
    set: { status: feedback.status ?? "active", reason: feedback.reason ?? "not_about_company", updatedAt: new Date() },
  });
  return true;
}

export async function undoNewsRelevanceFeedback(userId: number, articleId: string, marketId: string) {
  const db = await getDb();
  if (!db) return false;
  await db.update(newsRelevanceFeedback).set({ status: "undone", updatedAt: new Date() }).where(and(eq(newsRelevanceFeedback.userId, userId), eq(newsRelevanceFeedback.articleId, articleId), eq(newsRelevanceFeedback.marketId, marketId)));
  return true;
}

export async function listUserNewsRelevanceFeedback(userId: number, marketId: string, articleIds?: string[]) {
  const db = await getDb();
  if (!db) return [];
  const filters = [eq(newsRelevanceFeedback.userId, userId), eq(newsRelevanceFeedback.marketId, marketId), eq(newsRelevanceFeedback.status, "active")];
  if (articleIds?.length) filters.push(or(...articleIds.slice(0, 500).map((articleId) => eq(newsRelevanceFeedback.articleId, articleId))) as never);
  return db.select().from(newsRelevanceFeedback).where(and(...filters)).orderBy(desc(newsRelevanceFeedback.updatedAt));
}

export async function getNewsRelevanceFeedbackSignal(marketId: string, symbol: string, articleHash: string) {
  const db = await getDb();
  if (!db) return { activeFlags: 0 };
  const rows = await db.select({ id: newsRelevanceFeedback.id }).from(newsRelevanceFeedback).where(and(eq(newsRelevanceFeedback.marketId, marketId), eq(newsRelevanceFeedback.symbol, symbol), eq(newsRelevanceFeedback.articleHash, articleHash), eq(newsRelevanceFeedback.status, "active"))).limit(25);
  return { activeFlags: rows.length };
}

export async function saveHeldNewsArticle(article: InsertHeldNewsArticle): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.insert(heldNewsArticles).values(article).onDuplicateKeyUpdate({
    set: {
      headline: article.headline,
      summary: article.summary,
      holdReason: article.holdReason,
      classification: article.classification,
      confidence: article.confidence,
      score: article.score,
      matchedSymbolsJson: article.matchedSymbolsJson,
      matchedThemesJson: article.matchedThemesJson,
      reasonsJson: article.reasonsJson,
      updatedAt: new Date(),
    },
  });
  return true;
}

export async function listHeldNewsArticles(marketId: string, status: "held" | "approved" | "dismissed" = "held", limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(heldNewsArticles).where(and(eq(heldNewsArticles.marketId, marketId), eq(heldNewsArticles.status, status))).orderBy(desc(heldNewsArticles.createdAt)).limit(Math.max(1, Math.min(200, limit)));
}

export async function getHeldNewsArticle(id: string, marketId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(heldNewsArticles).where(and(eq(heldNewsArticles.id, id), eq(heldNewsArticles.marketId, marketId))).limit(1);
  return rows[0] ?? null;
}

export async function reviewHeldNewsArticle(id: string, marketId: string, reviewerId: number, status: "approved" | "dismissed", reviewNote?: string | null) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.update(heldNewsArticles).set({ status, reviewedBy: reviewerId, reviewedAt: new Date(), reviewNote: reviewNote ?? null, updatedAt: new Date() }).where(and(eq(heldNewsArticles.id, id), eq(heldNewsArticles.marketId, marketId), eq(heldNewsArticles.status, "held")));
  if (Number(result[0]?.affectedRows ?? 0) === 0) return null;
  return getHeldNewsArticle(id, marketId);
}

export async function saveSourceRecord(record: InsertSourceRecord): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.insert(sourceRecords).values(record).onDuplicateKeyUpdate({
    set: {
      sourceUrl: record.sourceUrl,
      documentName: record.documentName ?? null,
      title: record.title ?? null,
      reportDate: record.reportDate ?? null,
      publishedAt: record.publishedAt ?? null,
      retrievedAt: record.retrievedAt ?? new Date(),
      freshnessStatus: record.freshnessStatus,
      normalizedPayload: record.normalizedPayload ?? null,
      errorMessage: record.errorMessage ?? null,
      dataHash: record.dataHash,
      parserVersion: record.parserVersion,
      supersedesId: record.supersedesId ?? null,
    },
  });
  return true;
}

export async function getLatestSourceRecords(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(sourceRecords).orderBy(desc(sourceRecords.retrievedAt)).limit(limit);
}

export async function getSourceRecordsForSymbol(symbol: string, limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(sourceRecords).where(eq(sourceRecords.symbol, symbol.toUpperCase())).orderBy(desc(sourceRecords.retrievedAt)).limit(limit);
}

export async function upsertPushToken(token: InsertPushToken): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.insert(pushTokens).values(token).onDuplicateKeyUpdate({ set: { platform: token.platform, enabled: true, lastSeenAt: new Date() } });
  return true;
}

/**
 * One cursor page of enabled push tokens, ordered ascending by the token primary key.
 *
 * Cursor (keyset) pagination rather than OFFSET: the delivery loop deactivates dead tokens as it
 * goes, and an OFFSET page would then skip live devices because the filtered set shrank. A cursor
 * on the last token seen is unaffected by rows disappearing behind it.
 */
export async function getEnabledPushTokenPage(options: { after?: string | null; limit?: number } = {}): Promise<PushToken[]> {
  const db = await getDb();
  if (!db) return [];
  const { limit } = normalizePushTokenPage({ limit: options.limit });
  const after = typeof options.after === "string" && options.after.length > 0 ? options.after : null;
  const where = after ? and(eq(pushTokens.enabled, true), gt(pushTokens.token, after)) : eq(pushTokens.enabled, true);
  return db.select().from(pushTokens).where(where).orderBy(asc(pushTokens.token)).limit(limit);
}

/**
 * Mark tokens as no longer enabled — used when the push service reports a device as unregistered.
 * Bounded so a single call can never issue an unbounded IN clause. Returns how many rows changed.
 */
export async function deactivatePushTokens(tokens: string[]): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const unique = [...new Set(tokens.filter((token): token is string => typeof token === "string" && token.length > 0))].slice(0, 1_000);
  if (unique.length === 0) return 0;
  const result = await db.update(pushTokens).set({ enabled: false }).where(inArray(pushTokens.token, unique));
  const header = Array.isArray(result) ? (result[0] as { affectedRows?: number }) : (result as unknown as { affectedRows?: number });
  return typeof header?.affectedRows === "number" ? header.affectedRows : unique.length;
}

export async function upsertSmartAlertResult(result: InsertSmartAlertResult): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.insert(smartAlertResults).values(result).onDuplicateKeyUpdate({
    set: {
      ruleTitle: result.ruleTitle,
      symbol: result.symbol,
      status: result.status,
      matchScore: result.matchScore,
      eventJson: result.eventJson,
      evidenceJson: result.evidenceJson,
      reason: result.reason,
      dataTimestamp: result.dataTimestamp,
      updatedAt: new Date(),
    },
  });
  return true;
}

export async function getSmartAlertResult(id: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(smartAlertResults).where(eq(smartAlertResults.id, id)).limit(1);
  return result[0];
}

export async function getSmartAlertHistory(ruleId: string, limit = 100, marketId?: string) {
  const db = await getDb();
  if (!db) return [];
  const scoped = marketId && marketId !== "ALL"
    ? and(eq(smartAlertResults.ruleId, ruleId), like(smartAlertResults.ruleId, `${marketId}-%`))
    : eq(smartAlertResults.ruleId, ruleId);
  return db.select().from(smartAlertResults).where(scoped).orderBy(desc(smartAlertResults.updatedAt)).limit(limit);
}

export async function markSmartAlertNotified(id: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.update(smartAlertResults).set({ lastNotifiedAt: new Date(), updatedAt: new Date() }).where(eq(smartAlertResults.id, id));
  return true;
}

export async function getEntityBySymbol(symbol: string): Promise<Entity | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(entities).where(eq(entities.canonicalSymbol, symbol.toUpperCase())).limit(1);
  return result[0];
}

export async function getEntityByAlias(alias: string): Promise<Entity | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(entities).limit(500);
  return rows.find((row) => { try { return (JSON.parse(row.aliasesJson) as string[]).includes(alias.toUpperCase()); } catch { return false; } });
}

export async function upsertEntity(entity: InsertEntity): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.insert(entities).values(entity).onDuplicateKeyUpdate({ set: { canonicalName: entity.canonicalName, entityType: entity.entityType, exchange: entity.exchange, country: entity.country, sector: entity.sector, resolutionStatus: entity.resolutionStatus, aliasesJson: entity.aliasesJson, identifiersJson: entity.identifiersJson, sourceRecordId: entity.sourceRecordId, sourceUrl: entity.sourceUrl, confidenceScore: entity.confidenceScore, lastVerifiedAt: entity.lastVerifiedAt, updatedAt: new Date() } });
  return true;
}

export async function upsertMarketObservation(observation: InsertMarketObservation): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.insert(marketObservations).values(observation).onDuplicateKeyUpdate({ set: { observedAt: observation.observedAt, period: observation.period, openValue: observation.openValue, highValue: observation.highValue, lowValue: observation.lowValue, closeValue: observation.closeValue, volumeValue: observation.volumeValue, changePercent: observation.changePercent, currency: observation.currency, sourceKey: observation.sourceKey, sourceUrl: observation.sourceUrl, sourceRecordId: observation.sourceRecordId, freshnessStatus: observation.freshnessStatus, confidenceScore: observation.confidenceScore, dataHash: observation.dataHash } });
  return true;
}

export async function upsertFundamentalObservation(observation: InsertFundamentalObservation): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.insert(fundamentalObservations).values(observation).onDuplicateKeyUpdate({ set: { metricValue: observation.metricValue, unit: observation.unit, period: observation.period, periodEnd: observation.periodEnd, observedAt: observation.observedAt, sourceKey: observation.sourceKey, sourceUrl: observation.sourceUrl, sourceRecordId: observation.sourceRecordId, freshnessStatus: observation.freshnessStatus, confidenceScore: observation.confidenceScore, derivationStatus: observation.derivationStatus, dataHash: observation.dataHash } });
  return true;
}

export async function getMarketObservationsForSymbol(symbol: string, limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(marketObservations).where(eq(marketObservations.symbol, symbol.toUpperCase())).orderBy(desc(marketObservations.observedAt)).limit(Math.min(500, Math.max(1, limit)));
}

export async function getFundamentalObservationsForSymbol(symbol: string, limit = 200) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(fundamentalObservations).where(eq(fundamentalObservations.symbol, symbol.toUpperCase())).orderBy(desc(fundamentalObservations.observedAt)).limit(Math.min(500, Math.max(1, limit)));
}

export async function upsertEventProjection(projection: InsertEventProjection): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.insert(eventProjections).values(projection).onDuplicateKeyUpdate({ set: { entityId: projection.entityId, symbol: projection.symbol, storylineKey: projection.storylineKey, eventType: projection.eventType, title: projection.title, summary: projection.summary, relationshipJson: projection.relationshipJson, sentiment: projection.sentiment, impactScore: projection.impactScore, confidenceScore: projection.confidenceScore, status: projection.status, sourceRecordId: projection.sourceRecordId, sourceUrl: projection.sourceUrl, sourceKey: projection.sourceKey, marketId: projection.marketId, eventAt: projection.eventAt, detectedAt: projection.detectedAt, staleAt: projection.staleAt, evidenceJson: projection.evidenceJson, parserVersion: projection.parserVersion, updatedAt: new Date() } });
  return true;
}

export async function getEventProjectionsForSymbol(symbol: string, limit = 100, lookbackDays = 365): Promise<EventProjection[]> {
  const db = await getDb();
  if (!db) return [];
  const cutoff = new Date(Date.now() - Math.min(730, Math.max(1, lookbackDays)) * 24 * 60 * 60 * 1000);
  return db.select().from(eventProjections).where(and(eq(eventProjections.symbol, symbol.toUpperCase()), gte(eventProjections.eventAt, cutoff))).orderBy(desc(eventProjections.eventAt)).limit(Math.min(500, Math.max(1, limit)));
}

export async function getEventProjectionsForStoryline(storylineKey: string, limit = 100): Promise<EventProjection[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(eventProjections).where(eq(eventProjections.storylineKey, storylineKey)).orderBy(desc(eventProjections.eventAt)).limit(Math.min(500, Math.max(1, limit)));
}

export async function getLatestEventProjections(limit = 200, lookbackDays = 365, marketId?: string): Promise<EventProjection[]> {
  const db = await getDb();
  if (!db) return [];
  const cutoff = new Date(Date.now() - Math.min(730, Math.max(1, lookbackDays)) * 24 * 60 * 60 * 1000);
  const base = and(eq(eventProjections.status, "active"), gte(eventProjections.eventAt, cutoff));
  // Market isolation: when a market is requested, return only that market's projections. Legacy
  // rows written before marketId existed are treated as India (the only source historically
  // connected); every new write carries an explicit marketId.
  const marketFilter = marketId
    ? marketId === "IN"
      ? or(eq(eventProjections.marketId, "IN"), sql`${eventProjections.marketId} IS NULL`)
      : eq(eventProjections.marketId, marketId)
    : undefined;
  return db.select().from(eventProjections).where(marketFilter ? and(base, marketFilter) : base).orderBy(desc(eventProjections.eventAt)).limit(Math.min(500, Math.max(1, limit)));
}

export async function getAutonomousRecommendation(id: string): Promise<AutonomousRecommendation | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(autonomousRecommendations).where(eq(autonomousRecommendations.id, id)).limit(1);
  return result[0];
}

export async function upsertAutonomousRecommendation(recommendation: {
  id: string;
  eventKey: string;
  symbol: string;
  companyName: string;
  headline: string;
  eventType: string;
  relationship: string;
  direction: string;
  impactScore: number;
  confidenceScore: number;
  impactLevel: string;
  status: string;
  reason: string;
  factors: unknown;
  evidence: unknown;
  sourceTimestamp: string;
  eventTimestamp: string;
  detectedAt: string;
  staleAt: string | null;
  scoreVersion: string;
  routeTarget: string;
}, previous?: AutonomousRecommendation): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const now = new Date();
  const values: InsertAutonomousRecommendation = {
    id: recommendation.id,
    eventKey: recommendation.eventKey,
    symbol: recommendation.symbol,
    companyName: recommendation.companyName,
    headline: recommendation.headline,
    eventType: recommendation.eventType,
    relationship: recommendation.relationship,
    direction: recommendation.direction,
    impactScore: recommendation.impactScore,
    confidenceScore: recommendation.confidenceScore,
    impactLevel: recommendation.impactLevel,
    status: recommendation.status,
    reason: recommendation.reason,
    factorsJson: JSON.stringify(recommendation.factors),
    evidenceJson: JSON.stringify(recommendation.evidence),
    sourceTimestamp: new Date(recommendation.sourceTimestamp),
    eventTimestamp: new Date(recommendation.eventTimestamp),
    detectedAt: new Date(recommendation.detectedAt),
    lastSeenAt: now,
    staleAt: recommendation.staleAt ? new Date(recommendation.staleAt) : null,
    invalidatedAt: null,
    lastNotifiedAt: previous?.lastNotifiedAt ?? null,
    scoreVersion: recommendation.scoreVersion,
    routeTarget: recommendation.routeTarget,
  };
  await db.insert(autonomousRecommendations).values(values).onDuplicateKeyUpdate({
    set: {
      companyName: values.companyName,
      headline: values.headline,
      eventType: values.eventType,
      relationship: values.relationship,
      direction: values.direction,
      impactScore: values.impactScore,
      confidenceScore: values.confidenceScore,
      impactLevel: values.impactLevel,
      status: values.status,
      reason: values.reason,
      factorsJson: values.factorsJson,
      evidenceJson: values.evidenceJson,
      sourceTimestamp: values.sourceTimestamp,
      eventTimestamp: values.eventTimestamp,
      detectedAt: values.detectedAt,
      lastSeenAt: values.lastSeenAt,
      staleAt: values.staleAt,
      scoreVersion: values.scoreVersion,
      routeTarget: values.routeTarget,
      updatedAt: now,
    },
  });
  return true;
}

export async function markAutonomousRecommendationNotified(id: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.update(autonomousRecommendations).set({ lastNotifiedAt: new Date(), updatedAt: new Date() }).where(eq(autonomousRecommendations.id, id));
  return true;
}

export async function getAutonomousRecommendations(lookbackDays = 30, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  const cutoff = new Date(Date.now() - Math.min(180, Math.max(1, lookbackDays)) * 86_400_000);
  return db.select().from(autonomousRecommendations).where(sql`${autonomousRecommendations.eventTimestamp} >= ${cutoff}`).orderBy(desc(autonomousRecommendations.impactScore), desc(autonomousRecommendations.eventTimestamp)).limit(Math.min(100, Math.max(1, limit)));
}


export async function getUserMarketPreference(userId: number): Promise<UserMarketPreference | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(userMarketPreferences).where(eq(userMarketPreferences.userId, userId)).limit(1);
  return result[0];
}

export async function upsertUserMarketPreference(userId: number, input: { marketId: string; clientUpdatedAt: Date; clientRevision?: number; clientWriter?: "device" | "server" }) {
  const db = await getDb();
  if (!db) return { persisted: false, conflict: false, preference: undefined } as const;
  const existing = await getUserMarketPreference(userId);
  const incomingRevision = Math.max(1, input.clientRevision ?? 1);
  const incomingWriter = input.clientWriter ?? "device";
  if (!existing) {
    await db.insert(userMarketPreferences).values({ userId, marketId: input.marketId, revision: incomingRevision, clientUpdatedAt: input.clientUpdatedAt, lastWriter: incomingWriter, conflictCount: 0, conflictJson: null });
    return { persisted: true, conflict: false, preference: await getUserMarketPreference(userId) } as const;
  }
  const incomingWins = input.clientUpdatedAt.getTime() > existing.clientUpdatedAt.getTime() || (input.clientUpdatedAt.getTime() === existing.clientUpdatedAt.getTime() && incomingRevision > existing.revision);
  const conflict = existing.marketId !== input.marketId && (input.clientUpdatedAt.getTime() !== existing.clientUpdatedAt.getTime() || incomingRevision !== existing.revision);
  if (incomingWins) {
    await db.update(userMarketPreferences).set({ marketId: input.marketId, revision: Math.max(existing.revision + 1, incomingRevision), clientUpdatedAt: input.clientUpdatedAt, serverUpdatedAt: new Date(), lastWriter: incomingWriter, conflictCount: existing.conflictCount + (conflict ? 1 : 0), conflictJson: conflict ? JSON.stringify({ previousMarketId: existing.marketId, incomingMarketId: input.marketId, resolvedAt: new Date().toISOString(), resolution: "incoming-newer" }) : existing.conflictJson }).where(eq(userMarketPreferences.userId, userId));
  } else if (conflict) {
    await db.update(userMarketPreferences).set({ conflictCount: existing.conflictCount + 1, conflictJson: JSON.stringify({ previousMarketId: existing.marketId, rejectedMarketId: input.marketId, resolvedAt: new Date().toISOString(), resolution: "server-newer" }), serverUpdatedAt: new Date() }).where(eq(userMarketPreferences.userId, userId));
  }
  return { persisted: true, conflict, preference: await getUserMarketPreference(userId) } as const;
}

export async function listUserWatchlistItems(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(userWatchlistItems).where(sql`${userWatchlistItems.userId} = ${userId} AND ${userWatchlistItems.enabled} = true`).orderBy(desc(userWatchlistItems.updatedAt));
}

export async function upsertUserWatchlistItem(userId: number, symbol: string, entityId?: string | null) {
  const db = await getDb();
  if (!db) return false;
  const existing = await db.select().from(userWatchlistItems).where(sql`${userWatchlistItems.userId} = ${userId} AND ${userWatchlistItems.symbol} = ${symbol}`).limit(1);
  if (existing[0]) {
    await db.update(userWatchlistItems).set({ enabled: true, entityId: entityId ?? existing[0].entityId, updatedAt: new Date() }).where(eq(userWatchlistItems.id, existing[0].id));
  } else {
    await db.insert(userWatchlistItems).values({ userId, symbol, entityId: entityId ?? null, enabled: true });
  }
  return true;
}

export async function revokeUserWatchlistItem(userId: number, symbol: string) {
  const db = await getDb();
  if (!db) return false;
  await db.update(userWatchlistItems).set({ enabled: false, updatedAt: new Date() }).where(sql`${userWatchlistItems.userId} = ${userId} AND ${userWatchlistItems.symbol} = ${symbol}`);
  return true;
}

export async function listUserSavedScreens(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(userSavedScreens).where(sql`${userSavedScreens.userId} = ${userId} AND ${userSavedScreens.revokedAt} IS NULL`).orderBy(desc(userSavedScreens.updatedAt));
}

export async function upsertUserSavedScreen(userId: number, input: { name: string; filtersJson: string }) {
  const db = await getDb();
  if (!db) return false;
  const existing = await db.select().from(userSavedScreens).where(sql`${userSavedScreens.userId} = ${userId} AND ${userSavedScreens.name} = ${input.name} AND ${userSavedScreens.revokedAt} IS NULL`).limit(1);
  if (existing[0]) await db.update(userSavedScreens).set({ filtersJson: input.filtersJson, updatedAt: new Date() }).where(eq(userSavedScreens.id, existing[0].id));
  else await db.insert(userSavedScreens).values({ userId, name: input.name, filtersJson: input.filtersJson });
  return true;
}

export async function revokeUserSavedScreen(userId: number, id: number) {
  const db = await getDb();
  if (!db) return false;
  await db.update(userSavedScreens).set({ revokedAt: new Date(), updatedAt: new Date() }).where(sql`${userSavedScreens.userId} = ${userId} AND ${userSavedScreens.id} = ${id}`);
  return true;
}

export async function listUserAlertRules(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(userAlertRules).where(sql`${userAlertRules.userId} = ${userId} AND ${userAlertRules.revokedAt} IS NULL`).orderBy(desc(userAlertRules.updatedAt));
}

export async function upsertUserAlertRule(userId: number, input: { id: string; title: string; query: string; enabled?: boolean }) {
  const db = await getDb();
  if (!db) return false;
  const values = { id: input.id, userId, title: input.title, query: input.query, enabled: input.enabled ?? true, revokedAt: null };
  await db.insert(userAlertRules).values(values).onDuplicateKeyUpdate({ set: { title: values.title, query: values.query, enabled: values.enabled, revokedAt: null, updatedAt: new Date() } });
  return true;
}

export async function revokeUserAlertRule(userId: number, id: string) {
  const db = await getDb();
  if (!db) return false;
  await db.update(userAlertRules).set({ enabled: false, revokedAt: new Date(), updatedAt: new Date() }).where(sql`${userAlertRules.userId} = ${userId} AND ${userAlertRules.id} = ${id}`);
  return true;
}

type UserAlertHistoryCursor = { updatedAt: string; id: string };
const encodeUserAlertHistoryCursor = (cursor: UserAlertHistoryCursor) => Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
const decodeUserAlertHistoryCursor = (value?: string | null): UserAlertHistoryCursor | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<UserAlertHistoryCursor>;
    return typeof parsed.updatedAt === "string" && typeof parsed.id === "string" ? parsed as UserAlertHistoryCursor : null;
  } catch { return null; }
};

export async function listUserAlertResults(userId: number, limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(userAlertResults).where(sql`${userAlertResults.userId} = ${userId} AND ${userAlertResults.revokedAt} IS NULL`).orderBy(desc(userAlertResults.updatedAt)).limit(Math.min(200, Math.max(1, limit)));
}

export async function getUserAlertResult(userId: number, id: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(userAlertResults).where(sql`${userAlertResults.userId} = ${userId} AND ${userAlertResults.id} = ${id} AND ${userAlertResults.revokedAt} IS NULL`).limit(1);
  return rows[0];
}

export async function listUserAlertResultsPage(userId: number, input: { limit?: number; cursor?: string | null; marketId?: string; ruleId?: string }) {
  const db = await getDb();
  const limit = Math.min(100, Math.max(1, input.limit ?? 25));
  if (!db) return { items: [], nextCursor: null, hasMore: false };
  const filters = [eq(userAlertResults.userId, userId), sql`${userAlertResults.revokedAt} IS NULL`];
  if (input.marketId && input.marketId !== "ALL") filters.push(eq(userAlertResults.marketId, input.marketId));
  if (input.ruleId && input.ruleId !== "ALL") filters.push(eq(userAlertResults.ruleId, input.ruleId));
  const cursor = decodeUserAlertHistoryCursor(input.cursor);
  if (cursor) {
    const cursorDate = new Date(cursor.updatedAt);
    if (!Number.isNaN(cursorDate.getTime())) filters.push(or(lt(userAlertResults.updatedAt, cursorDate), and(eq(userAlertResults.updatedAt, cursorDate), lt(userAlertResults.id, cursor.id)))!);
  }
  const rows = await db.select().from(userAlertResults).where(and(...filters)).orderBy(desc(userAlertResults.updatedAt), desc(userAlertResults.id)).limit(limit + 1);
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return { items, hasMore, nextCursor: hasMore && last ? encodeUserAlertHistoryCursor({ updatedAt: last.updatedAt.toISOString(), id: last.id }) : null };
}

export async function upsertUserAlertResult(userId: number, result: InsertUserAlertResult) {
  const db = await getDb();
  if (!db) return false;
  await db.insert(userAlertResults).values({ ...result, userId, marketId: result.marketId ?? "IN" }).onDuplicateKeyUpdate({ set: { status: result.status, evidenceJson: result.evidenceJson, marketId: result.marketId ?? "IN", updatedAt: new Date(), revokedAt: null } });
  return true;
}

export async function listUserNotifications(userId: number, input: { limit: number; cursor?: string; marketId?: string; unreadOnly?: boolean }) {
  const db = await getDb();
  if (!db) return { items: [] as UserNotification[], nextCursor: null, unreadCount: 0 };
  const filters = [eq(userNotifications.userId, userId), sql`${userNotifications.revokedAt} IS NULL`];
  if (input.marketId) filters.push(eq(userNotifications.marketId, input.marketId));
  if (input.unreadOnly) filters.push(sql`${userNotifications.readAt} IS NULL`);
  if (input.cursor) filters.push(lt(userNotifications.createdAt, new Date(input.cursor)));
  const items = await db.select().from(userNotifications).where(and(...filters)).orderBy(desc(userNotifications.createdAt)).limit(input.limit + 1);
  const hasMore = items.length > input.limit;
  const visible = hasMore ? items.slice(0, input.limit) : items;
  const unread = await db.select({ count: sql<number>`count(*)` }).from(userNotifications).where(and(eq(userNotifications.userId, userId), sql`${userNotifications.revokedAt} IS NULL`, sql`${userNotifications.readAt} IS NULL`));
  return { items: visible, nextCursor: hasMore && visible.length ? visible[visible.length - 1].createdAt.toISOString() : null, unreadCount: Number(unread[0]?.count ?? 0) };
}

export async function markUserNotificationRead(userId: number, id: string) {
  const db = await getDb();
  if (!db) return false;
  const result = await db.update(userNotifications).set({ readAt: new Date() }).where(and(eq(userNotifications.id, id), eq(userNotifications.userId, userId), sql`${userNotifications.revokedAt} IS NULL`));
  return Number((result as { affectedRows?: number }).affectedRows ?? 0) > 0;
}

export async function markAllUserNotificationsRead(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.update(userNotifications).set({ readAt: new Date() }).where(and(eq(userNotifications.userId, userId), sql`${userNotifications.revokedAt} IS NULL`, sql`${userNotifications.readAt} IS NULL`));
  return Number((result as { affectedRows?: number }).affectedRows ?? 0);
}

export async function createUserNotification(input: InsertUserNotification) {
  const db = await getDb();
  if (!db) return null;
  await db.insert(userNotifications).values(input).onDuplicateKeyUpdate({ set: { updatedAt: new Date() } });
  const [item] = await db.select().from(userNotifications).where(eq(userNotifications.dedupeKey, input.dedupeKey)).limit(1);
  return item ?? null;
}

export async function getUserNotificationPreferences(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(userNotificationPreferences).where(eq(userNotificationPreferences.userId, userId)).limit(1);
  return result[0];
}

export async function upsertUserNotificationPreferences(userId: number, input: Omit<InsertUserNotificationPreferences, "userId">) {
  const db = await getDb();
  if (!db) return false;
  await db.insert(userNotificationPreferences).values({ ...input, userId }).onDuplicateKeyUpdate({ set: { ...input, updatedAt: new Date() } });
  return true;
}

export async function upsertUserPushToken(userId: number, input: { token: string; platform: string }) {
  const db = await getDb();
  if (!db) return false;
  await db.insert(userPushTokens).values({ userId, token: input.token, platform: input.platform, enabled: true, revokedAt: null }).onDuplicateKeyUpdate({ set: { userId, platform: input.platform, enabled: true, revokedAt: null, lastSeenAt: new Date() } });
  return true;
}

export async function revokeUserPushToken(userId: number, token: string) {
  const db = await getDb();
  if (!db) return false;
  await db.update(userPushTokens).set({ enabled: false, revokedAt: new Date() }).where(sql`${userPushTokens.userId} = ${userId} AND ${userPushTokens.token} = ${token}`);
  return true;
}

export async function getEnabledUserPushTokens(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(userPushTokens).where(sql`${userPushTokens.userId} = ${userId} AND ${userPushTokens.enabled} = true AND ${userPushTokens.revokedAt} IS NULL`);
}

export async function listUserSavedResearch(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(userSavedResearch).where(sql`${userSavedResearch.userId} = ${userId} AND ${userSavedResearch.revokedAt} IS NULL`).orderBy(desc(userSavedResearch.updatedAt));
}

export async function upsertUserSavedResearch(userId: number, input: Omit<InsertUserSavedResearch, "userId">) {
  const db = await getDb();
  if (!db) return false;
  await db.insert(userSavedResearch).values({ ...input, userId }).onDuplicateKeyUpdate({ set: { title: input.title, reportType: input.reportType, storageKey: input.storageKey ?? null, sourceJson: input.sourceJson, revokedAt: null, updatedAt: new Date() } });
  return true;
}

export async function revokeUserSavedResearch(userId: number, id: string) {
  const db = await getDb();
  if (!db) return false;
  await db.update(userSavedResearch).set({ revokedAt: new Date(), updatedAt: new Date() }).where(sql`${userSavedResearch.userId} = ${userId} AND ${userSavedResearch.id} = ${id}`);
  return true;
}


export async function createResearchRun(userId: number, input: Omit<InsertResearchRun, "userId">) {
  const db = await getDb();
  if (!db) return null;
  await db.insert(researchRuns).values({ ...input, userId });
  return getResearchRun(userId, input.id);
}

export async function getResearchRun(userId: number, id: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(researchRuns).where(and(eq(researchRuns.userId, userId), eq(researchRuns.id, id))).limit(1);
  return rows[0];
}

export async function listResearchRuns(userId: number, input: { limit?: number; marketId?: string } = {}) {
  const db = await getDb();
  if (!db) return [];
  const limit = Math.min(100, Math.max(1, input.limit ?? 30));
  const filters = [eq(researchRuns.userId, userId)];
  if (input.marketId && input.marketId !== "ALL") filters.push(eq(researchRuns.marketId, input.marketId));
  return db.select().from(researchRuns).where(and(...filters)).orderBy(desc(researchRuns.updatedAt)).limit(limit);
}

export async function updateResearchRun(userId: number, id: string, patch: Partial<Pick<InsertResearchRun, "status" | "resultJson" | "errorMessage" | "attemptCount" | "startedAt" | "completedAt" | "runtimePolicyJson">>) {
  const db = await getDb();
  if (!db) return false;
  const result = await db.update(researchRuns).set({ ...patch, updatedAt: new Date() }).where(and(eq(researchRuns.userId, userId), eq(researchRuns.id, id)));
  return Number(result[0]?.affectedRows ?? 0) > 0;
}

export async function addResearchAgentRun(userId: number, input: Omit<InsertResearchAgentRun, "userId">) {
  const db = await getDb();
  if (!db) return false;
  await db.insert(researchAgentRuns).values({ ...input, userId });
  return true;
}

export async function listResearchAgentRuns(userId: number, runId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(researchAgentRuns).where(and(eq(researchAgentRuns.userId, userId), eq(researchAgentRuns.runId, runId))).orderBy(desc(researchAgentRuns.updatedAt));
}


export async function cancelResearchRun(userId: number, id: string) {
  const db = await getDb();
  if (!db) return false;
  const result = await db.update(researchRuns).set({ status: "cancelled", completedAt: new Date(), updatedAt: new Date() }).where(and(eq(researchRuns.userId, userId), eq(researchRuns.id, id), or(eq(researchRuns.status, "queued"), eq(researchRuns.status, "running"))));
  return Number(result[0]?.affectedRows ?? 0) > 0;
}
