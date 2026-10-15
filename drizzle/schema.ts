import { boolean, index, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const userMarketPreferences = mysqlTable("user_market_preferences", {
  userId: int("userId").primaryKey(),
  marketId: varchar("marketId", { length: 8 }).notNull().default("IN"),
  revision: int("revision").notNull().default(1),
  clientUpdatedAt: timestamp("clientUpdatedAt").notNull(),
  serverUpdatedAt: timestamp("serverUpdatedAt").defaultNow().onUpdateNow().notNull(),
  lastWriter: varchar("lastWriter", { length: 32 }).notNull().default("server"),
  conflictCount: int("conflictCount").notNull().default(0),
  conflictJson: text("conflictJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type UserMarketPreference = typeof userMarketPreferences.$inferSelect;
export type InsertUserMarketPreference = typeof userMarketPreferences.$inferInsert;

export const newsEvents = mysqlTable("news_events", {
  id: varchar("id", { length: 64 }).primaryKey(),
  marketId: varchar("marketId", { length: 8 }).notNull().default("IN"),
  symbol: varchar("symbol", { length: 32 }).notNull(),
  headline: text("headline").notNull(),
  category: mysqlEnum("category", ["Tech", "Finance", "Markets", "Crypto", "General"]).notNull(),
  summary: text("summary").notNull(),
  keyEntities: text("keyEntities").notNull(),
  sentiment: mysqlEnum("sentiment", ["Positive", "Neutral", "Negative"]).notNull(),
  actionableImpact: text("actionableImpact").notNull(),
  url: text("url").notNull(),
  source: varchar("source", { length: 128 }).notNull(),
  publishedAt: timestamp("publishedAt").notNull(),
  impactScore: int("impactScore").notNull(),
  highImpact: boolean("highImpact").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type NewsEvent = typeof newsEvents.$inferSelect;
export type InsertNewsEvent = typeof newsEvents.$inferInsert;

export const heldNewsArticles = mysqlTable("held_news_articles", {
  id: varchar("id", { length: 160 }).primaryKey(),
  marketId: varchar("marketId", { length: 8 }).notNull(),
  symbol: varchar("symbol", { length: 32 }),
  articleId: varchar("articleId", { length: 128 }).notNull(),
  articleHash: varchar("articleHash", { length: 128 }).notNull(),
  headline: text("headline").notNull(),
  summary: text("summary").notNull(),
  url: text("url").notNull(),
  source: varchar("source", { length: 128 }).notNull(),
  publishedAt: timestamp("publishedAt").notNull(),
  holdReason: varchar("holdReason", { length: 64 }).notNull(),
  classification: varchar("classification", { length: 64 }).notNull(),
  confidence: varchar("confidence", { length: 16 }).notNull(),
  score: int("score").notNull(),
  matchedSymbolsJson: text("matchedSymbolsJson").notNull(),
  matchedThemesJson: text("matchedThemesJson").notNull(),
  reasonsJson: text("reasonsJson").notNull(),
  status: mysqlEnum("status", ["held", "approved", "dismissed"]).notNull().default("held"),
  reviewedBy: int("reviewedBy"),
  reviewedAt: timestamp("reviewedAt"),
  reviewNote: text("reviewNote"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  reviewQueue: index("held_news_articles_review_queue_idx").on(table.marketId, table.status, table.createdAt),
  articleDedup: index("held_news_articles_article_idx").on(table.marketId, table.articleHash),
}));
export type HeldNewsArticle = typeof heldNewsArticles.$inferSelect;
export type InsertHeldNewsArticle = typeof heldNewsArticles.$inferInsert;

export const newsRelevanceFeedback = mysqlTable("news_relevance_feedback", {
  id: varchar("id", { length: 160 }).primaryKey(),
  userId: int("userId").notNull(),
  marketId: varchar("marketId", { length: 8 }).notNull(),
  symbol: varchar("symbol", { length: 32 }).notNull(),
  articleId: varchar("articleId", { length: 128 }).notNull(),
  articleHash: varchar("articleHash", { length: 128 }).notNull(),
  headline: text("headline").notNull(),
  url: text("url").notNull(),
  reason: mysqlEnum("reason", ["not_about_company", "wrong_market", "duplicate", "low_quality", "other"]).notNull().default("not_about_company"),
  status: mysqlEnum("status", ["active", "undone"]).notNull().default("active"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userArticleUnique: index("news_relevance_feedback_user_article_idx").on(table.userId, table.articleId, table.marketId),
  aggregateSignal: index("news_relevance_feedback_aggregate_idx").on(table.marketId, table.symbol, table.articleHash, table.status),
}));
export type NewsRelevanceFeedback = typeof newsRelevanceFeedback.$inferSelect;
export type InsertNewsRelevanceFeedback = typeof newsRelevanceFeedback.$inferInsert;

export const pushTokens = mysqlTable("push_tokens", {
  token: varchar("token", { length: 512 }).primaryKey(),
  platform: varchar("platform", { length: 32 }).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
});

export type PushToken = typeof pushTokens.$inferSelect;
export type InsertPushToken = typeof pushTokens.$inferInsert;

export const sourceRecords = mysqlTable("source_records", {
  id: varchar("id", { length: 96 }).primaryKey(),
  sourceKey: varchar("sourceKey", { length: 64 }).notNull(),
  sourceUrl: text("sourceUrl").notNull(),
  documentName: varchar("documentName", { length: 255 }),
  recordType: varchar("recordType", { length: 64 }).notNull(),
  externalId: varchar("externalId", { length: 255 }),
  symbol: varchar("symbol", { length: 32 }),
  title: text("title"),
  reportDate: timestamp("reportDate"),
  publishedAt: timestamp("publishedAt"),
  retrievedAt: timestamp("retrievedAt").defaultNow().notNull(),
  freshnessStatus: mysqlEnum("freshnessStatus", ["fresh", "stale", "unavailable", "error"]).notNull(),
  rawPayload: text("rawPayload").notNull(),
  normalizedPayload: text("normalizedPayload"),
  errorMessage: text("errorMessage"),
  dataHash: varchar("dataHash", { length: 128 }).notNull(),
  parserVersion: varchar("parserVersion", { length: 64 }).notNull(),
  supersedesId: varchar("supersedesId", { length: 96 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SourceRecord = typeof sourceRecords.$inferSelect;
export type InsertSourceRecord = typeof sourceRecords.$inferInsert;

export const providerHealthHistory = mysqlTable("provider_health_history", {
  id: varchar("id", { length: 128 }).primaryKey(),
  providerId: varchar("providerId", { length: 64 }).notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  circuitState: varchar("circuitState", { length: 32 }).notNull(),
  failureClass: varchar("failureClass", { length: 32 }),
  latencyMs: int("latencyMs"),
  checkedAt: timestamp("checkedAt").notNull(),
  successAt: timestamp("successAt"),
  payloadPreview: text("payloadPreview"),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ProviderHealthHistory = typeof providerHealthHistory.$inferSelect;
export type InsertProviderHealthHistory = typeof providerHealthHistory.$inferInsert;


export const smartAlertResults = mysqlTable("smart_alert_results", {
  id: varchar("id", { length: 160 }).primaryKey(),
  ruleId: varchar("ruleId", { length: 96 }).notNull(),
  ruleTitle: varchar("ruleTitle", { length: 255 }).notNull(),
  symbol: varchar("symbol", { length: 32 }).notNull(),
  status: mysqlEnum("status", ["eligible", "potential", "no-longer-eligible"]).notNull(),
  matchScore: int("matchScore").notNull(),
  eventJson: text("eventJson").notNull(),
  evidenceJson: text("evidenceJson").notNull(),
  reason: text("reason").notNull(),
  dataTimestamp: timestamp("dataTimestamp").notNull(),
  lastNotifiedAt: timestamp("lastNotifiedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SmartAlertResult = typeof smartAlertResults.$inferSelect;
export type InsertSmartAlertResult = typeof smartAlertResults.$inferInsert;

export const autonomousRecommendations = mysqlTable("autonomous_recommendations", {
  id: varchar("id", { length: 160 }).primaryKey(),
  eventKey: varchar("eventKey", { length: 160 }).notNull().unique(),
  symbol: varchar("symbol", { length: 32 }).notNull(),
  companyName: varchar("companyName", { length: 255 }).notNull(),
  headline: text("headline").notNull(),
  eventType: varchar("eventType", { length: 64 }).notNull(),
  relationship: varchar("relationship", { length: 64 }).notNull(),
  direction: varchar("direction", { length: 32 }).notNull(),
  impactScore: int("impactScore").notNull(),
  confidenceScore: int("confidenceScore").notNull(),
  impactLevel: varchar("impactLevel", { length: 32 }).notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  reason: text("reason").notNull(),
  factorsJson: text("factorsJson").notNull(),
  evidenceJson: text("evidenceJson").notNull(),
  sourceTimestamp: timestamp("sourceTimestamp").notNull(),
  eventTimestamp: timestamp("eventTimestamp").notNull(),
  detectedAt: timestamp("detectedAt").notNull(),
  lastSeenAt: timestamp("lastSeenAt").notNull(),
  staleAt: timestamp("staleAt"),
  invalidatedAt: timestamp("invalidatedAt"),
  lastNotifiedAt: timestamp("lastNotifiedAt"),
  scoreVersion: varchar("scoreVersion", { length: 32 }).notNull(),
  routeTarget: varchar("routeTarget", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AutonomousRecommendation = typeof autonomousRecommendations.$inferSelect;
export type InsertAutonomousRecommendation = typeof autonomousRecommendations.$inferInsert;

export const entities = mysqlTable("entities", {
  id: varchar("id", { length: 96 }).primaryKey(),
  canonicalSymbol: varchar("canonicalSymbol", { length: 32 }).notNull().unique(),
  canonicalName: varchar("canonicalName", { length: 255 }).notNull(),
  entityType: mysqlEnum("entityType", ["company", "index", "fund", "crypto", "commodity", "currency", "unknown"]).notNull(),
  exchange: varchar("exchange", { length: 32 }),
  country: varchar("country", { length: 64 }),
  sector: varchar("sector", { length: 128 }),
  resolutionStatus: mysqlEnum("resolutionStatus", ["verified", "partial", "unresolved", "inactive"]).notNull(),
  aliasesJson: text("aliasesJson").notNull(),
  identifiersJson: text("identifiersJson").notNull(),
  sourceRecordId: varchar("sourceRecordId", { length: 96 }),
  sourceUrl: text("sourceUrl"),
  confidenceScore: int("confidenceScore").notNull(),
  lastVerifiedAt: timestamp("lastVerifiedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Entity = typeof entities.$inferSelect;
export type InsertEntity = typeof entities.$inferInsert;

export const marketObservations = mysqlTable("market_observations", {
  id: varchar("id", { length: 128 }).primaryKey(),
  entityId: varchar("entityId", { length: 96 }).notNull(),
  symbol: varchar("symbol", { length: 32 }).notNull(),
  observationType: varchar("observationType", { length: 64 }).notNull(),
  observedAt: timestamp("observedAt").notNull(),
  period: varchar("period", { length: 32 }),
  openValue: varchar("openValue", { length: 64 }),
  highValue: varchar("highValue", { length: 64 }),
  lowValue: varchar("lowValue", { length: 64 }),
  closeValue: varchar("closeValue", { length: 64 }),
  volumeValue: varchar("volumeValue", { length: 64 }),
  changePercent: varchar("changePercent", { length: 64 }),
  currency: varchar("currency", { length: 16 }),
  sourceKey: varchar("sourceKey", { length: 64 }).notNull(),
  sourceUrl: text("sourceUrl").notNull(),
  sourceRecordId: varchar("sourceRecordId", { length: 96 }),
  freshnessStatus: mysqlEnum("freshnessStatus", ["fresh", "stale", "unavailable", "error"]).notNull(),
  confidenceScore: int("confidenceScore").notNull(),
  dataHash: varchar("dataHash", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MarketObservation = typeof marketObservations.$inferSelect;
export type InsertMarketObservation = typeof marketObservations.$inferInsert;

export const fundamentalObservations = mysqlTable("fundamental_observations", {
  id: varchar("id", { length: 128 }).primaryKey(),
  entityId: varchar("entityId", { length: 96 }).notNull(),
  symbol: varchar("symbol", { length: 32 }).notNull(),
  metricKey: varchar("metricKey", { length: 96 }).notNull(),
  metricValue: varchar("metricValue", { length: 96 }).notNull(),
  unit: varchar("unit", { length: 32 }),
  period: varchar("period", { length: 32 }).notNull(),
  periodEnd: timestamp("periodEnd"),
  observedAt: timestamp("observedAt").notNull(),
  sourceKey: varchar("sourceKey", { length: 64 }).notNull(),
  sourceUrl: text("sourceUrl").notNull(),
  sourceRecordId: varchar("sourceRecordId", { length: 96 }),
  freshnessStatus: mysqlEnum("freshnessStatus", ["fresh", "stale", "unavailable", "error"]).notNull(),
  confidenceScore: int("confidenceScore").notNull(),
  derivationStatus: mysqlEnum("derivationStatus", ["reported", "derived", "estimated", "unavailable"]).notNull(),
  dataHash: varchar("dataHash", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FundamentalObservation = typeof fundamentalObservations.$inferSelect;
export type InsertFundamentalObservation = typeof fundamentalObservations.$inferInsert;

export const eventProjections = mysqlTable("event_projections", {
  id: varchar("id", { length: 160 }).primaryKey(),
  eventKey: varchar("eventKey", { length: 160 }).notNull().unique(),
  entityId: varchar("entityId", { length: 96 }),
  symbol: varchar("symbol", { length: 32 }),
  storylineKey: varchar("storylineKey", { length: 160 }),
  eventType: varchar("eventType", { length: 64 }).notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  relationshipJson: text("relationshipJson").notNull(),
  sentiment: mysqlEnum("sentiment", ["positive", "neutral", "negative", "mixed"]).notNull(),
  impactScore: int("impactScore").notNull(),
  confidenceScore: int("confidenceScore").notNull(),
  status: mysqlEnum("status", ["active", "stale", "invalidated"]).notNull(),
  sourceRecordId: varchar("sourceRecordId", { length: 96 }),
  sourceUrl: text("sourceUrl").notNull(),
  sourceKey: varchar("sourceKey", { length: 64 }).notNull(),
  /** Market scope for the event. Enforces that markets never mix; null on legacy rows. */
  marketId: varchar("marketId", { length: 8 }),
  eventAt: timestamp("eventAt").notNull(),
  detectedAt: timestamp("detectedAt").notNull(),
  staleAt: timestamp("staleAt"),
  evidenceJson: text("evidenceJson").notNull(),
  parserVersion: varchar("parserVersion", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EventProjection = typeof eventProjections.$inferSelect;
export type InsertEventProjection = typeof eventProjections.$inferInsert;


export const userWatchlistItems = mysqlTable("user_watchlist_items", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  symbol: varchar("symbol", { length: 32 }).notNull(),
  entityId: varchar("entityId", { length: 96 }),
  enabled: boolean("enabled").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type UserWatchlistItem = typeof userWatchlistItems.$inferSelect;
export type InsertUserWatchlistItem = typeof userWatchlistItems.$inferInsert;

export const userSavedScreens = mysqlTable("user_saved_screens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  filtersJson: text("filtersJson").notNull(),
  revokedAt: timestamp("revokedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type UserSavedScreen = typeof userSavedScreens.$inferSelect;
export type InsertUserSavedScreen = typeof userSavedScreens.$inferInsert;

export const userAlertRules = mysqlTable("user_alert_rules", {
  id: varchar("id", { length: 96 }).primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  query: text("query").notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  revokedAt: timestamp("revokedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type UserAlertRule = typeof userAlertRules.$inferSelect;
export type InsertUserAlertRule = typeof userAlertRules.$inferInsert;

export const userAlertResults = mysqlTable("user_alert_results", {
  id: varchar("id", { length: 160 }).primaryKey(),
  userId: int("userId").notNull(),
  ruleId: varchar("ruleId", { length: 96 }).notNull(),
  marketId: varchar("marketId", { length: 8 }).notNull().default("IN"),
  autonomousRecommendationId: varchar("autonomousRecommendationId", { length: 160 }),
  symbol: varchar("symbol", { length: 32 }).notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  evidenceJson: text("evidenceJson").notNull(),
  revokedAt: timestamp("revokedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userMarketUpdatedAtIdx: index("user_alert_results_user_market_updated_idx").on(table.userId, table.marketId, table.updatedAt),
  userRuleUpdatedAtIdx: index("user_alert_results_user_rule_updated_idx").on(table.userId, table.ruleId, table.updatedAt),
}));
export type UserAlertResult = typeof userAlertResults.$inferSelect;
export type InsertUserAlertResult = typeof userAlertResults.$inferInsert;

export const userNotificationPreferences = mysqlTable("user_notification_preferences", {
  userId: int("userId").primaryKey(),
  enabled: boolean("enabled").default(true).notNull(),
  minimumScore: int("minimumScore").default(70).notNull(),
  channelsJson: text("channelsJson").notNull(),
  quietHoursEnabled: boolean("quietHoursEnabled").default(false).notNull(),
  quietStart: varchar("quietStart", { length: 5 }).notNull(),
  quietEnd: varchar("quietEnd", { length: 5 }).notNull(),
  timezone: varchar("timezone", { length: 64 }).notNull(),
  quietHoursOverrideForCritical: boolean("quietHoursOverrideForCritical").default(false).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type UserNotificationPreferences = typeof userNotificationPreferences.$inferSelect;
export type InsertUserNotificationPreferences = typeof userNotificationPreferences.$inferInsert;

export const userNotifications = mysqlTable("user_notifications", {
  id: varchar("id", { length: 160 }).primaryKey(),
  userId: int("userId").notNull(),
  marketId: varchar("marketId", { length: 8 }).notNull().default("IN"),
  symbol: varchar("symbol", { length: 32 }),
  notificationType: varchar("notificationType", { length: 64 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body").notNull(),
  evidenceJson: text("evidenceJson").notNull(),
  deepLinkPath: varchar("deepLinkPath", { length: 255 }),
  deepLinkParamsJson: text("deepLinkParamsJson"),
  dedupeKey: varchar("dedupeKey", { length: 255 }).notNull().unique(),
  sourcePublishedAt: timestamp("sourcePublishedAt"),
  readAt: timestamp("readAt"),
  revokedAt: timestamp("revokedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userReadCreatedIdx: index("user_notifications_user_read_created_idx").on(table.userId, table.readAt, table.createdAt),
  userMarketCreatedIdx: index("user_notifications_user_market_created_idx").on(table.userId, table.marketId, table.createdAt),
}));
export type UserNotification = typeof userNotifications.$inferSelect;
export type InsertUserNotification = typeof userNotifications.$inferInsert;

export const userPushTokens = mysqlTable("user_push_tokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  token: varchar("token", { length: 512 }).notNull().unique(),
  platform: varchar("platform", { length: 32 }).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  revokedAt: timestamp("revokedAt"),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type UserPushToken = typeof userPushTokens.$inferSelect;
export type InsertUserPushToken = typeof userPushTokens.$inferInsert;

export const userSavedResearch = mysqlTable("user_saved_research", {
  id: varchar("id", { length: 128 }).primaryKey(),
  userId: int("userId").notNull(),
  symbol: varchar("symbol", { length: 32 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  reportType: varchar("reportType", { length: 64 }).notNull(),
  storageKey: varchar("storageKey", { length: 512 }),
  sourceJson: text("sourceJson").notNull(),
  revokedAt: timestamp("revokedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type UserSavedResearch = typeof userSavedResearch.$inferSelect;
export type InsertUserSavedResearch = typeof userSavedResearch.$inferInsert;

export const researchRuns = mysqlTable("research_runs", {
  id: varchar("id", { length: 160 }).primaryKey(),
  userId: int("userId").notNull(),
  marketId: varchar("marketId", { length: 8 }).notNull(),
  symbol: varchar("symbol", { length: 32 }),
  requestJson: text("requestJson").notNull(),
  runtimePolicyJson: text("runtimePolicyJson").notNull(),
  status: mysqlEnum("status", ["queued", "running", "completed", "degraded", "failed", "cancelled"]).notNull().default("queued"),
  resultJson: text("resultJson"),
  errorMessage: text("errorMessage"),
  attemptCount: int("attemptCount").notNull().default(0),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userUpdatedAtIdx: index("research_runs_user_updated_idx").on(table.userId, table.updatedAt),
  userMarketIdx: index("research_runs_user_market_idx").on(table.userId, table.marketId, table.updatedAt),
}));
export type ResearchRun = typeof researchRuns.$inferSelect;
export type InsertResearchRun = typeof researchRuns.$inferInsert;

export const researchAgentRuns = mysqlTable("research_agent_runs", {
  id: varchar("id", { length: 160 }).primaryKey(),
  runId: varchar("runId", { length: 160 }).notNull(),
  userId: int("userId").notNull(),
  agentType: varchar("agentType", { length: 32 }).notNull(),
  runtime: varchar("runtime", { length: 32 }).notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  confidence: varchar("confidence", { length: 16 }).notNull(),
  evidenceIdsJson: text("evidenceIdsJson").notNull(),
  outputJson: text("outputJson").notNull(),
  latencyMs: int("latencyMs").notNull().default(0),
  errorCode: varchar("errorCode", { length: 64 }),
  attemptCount: int("attemptCount").notNull().default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  runAgentIdx: index("research_agent_runs_run_agent_idx").on(table.runId, table.agentType),
  userUpdatedAtIdx: index("research_agent_runs_user_updated_idx").on(table.userId, table.updatedAt),
}));
export type ResearchAgentRun = typeof researchAgentRuns.$inferSelect;
export type InsertResearchAgentRun = typeof researchAgentRuns.$inferInsert;
