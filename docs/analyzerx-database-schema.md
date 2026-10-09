# AnalyzerX Backend Database Schema

## Schema conventions

The current project uses MySQL/TiDB with Drizzle ORM and camelCase application fields mapped to database columns. All timestamps are UTC. Provider payloads are retained as text/JSON-compatible strings for provenance, while normalized fields support indexed queries. Market data is append-only or versioned where auditability matters. User-owned records carry `userId` and are never exposed through public procedures.

## Current tables

### `users`

| Field | Type | Constraints | Purpose |
| --- | --- | --- | --- |
| `id` | INT | PK, auto-increment | Internal user ID |
| `openId` | VARCHAR(64) | UNIQUE, NOT NULL | Manus OAuth identity |
| `name` | TEXT | nullable | Display name |
| `email` | VARCHAR(320) | nullable | Account email |
| `loginMethod` | VARCHAR(64) | nullable | Auth method |
| `role` | ENUM(user, admin) | NOT NULL, default user | Authorization |
| `createdAt` | TIMESTAMP | NOT NULL | Creation time |
| `updatedAt` | TIMESTAMP | NOT NULL | Last profile update |
| `lastSignedIn` | TIMESTAMP | NOT NULL | Last login |

### `news_events`

| Field | Type | Constraints | Purpose |
| --- | --- | --- | --- |
| `id` | VARCHAR(64) | PK | Canonical article/event ID |
| `symbol` | VARCHAR(32) | NOT NULL, index | Primary linked symbol |
| `headline` | TEXT | NOT NULL | Headline |
| `category` | ENUM | NOT NULL | Tech, Finance, Markets, Crypto, General |
| `summary` | TEXT | NOT NULL | Concise summary |
| `keyEntities` | TEXT | NOT NULL | Serialized entity list |
| `sentiment` | ENUM | NOT NULL | Positive, Neutral, Negative |
| `actionableImpact` | TEXT | NOT NULL | Catalyst and impact explanation |
| `url` | TEXT | NOT NULL | Original source URL |
| `source` | VARCHAR(128) | NOT NULL | Provider or publisher |
| `publishedAt` | TIMESTAMP | NOT NULL, index | Publication time |
| `impactScore` | INT | NOT NULL | 0–100 impact score |
| `highImpact` | BOOLEAN | NOT NULL | Alert eligibility |
| `createdAt` | TIMESTAMP | NOT NULL | Ingestion time |

### `push_tokens`

| Field | Type | Constraints | Purpose |
| --- | --- | --- | --- |
| `token` | VARCHAR(512) | PK | Expo push token |
| `platform` | VARCHAR(32) | NOT NULL | iOS or Android |
| `enabled` | BOOLEAN | NOT NULL | Delivery opt-in |
| `lastSeenAt` | TIMESTAMP | NOT NULL | Token health |

### `source_records`

| Field | Type | Constraints | Purpose |
| --- | --- | --- | --- |
| `id` | VARCHAR(96) | PK | Provenance record |
| `sourceKey` | VARCHAR(64) | NOT NULL, index | Catalog source |
| `sourceUrl` | TEXT | NOT NULL | Retrieval URL |
| `documentName` | VARCHAR(255) | nullable | Source document |
| `recordType` | VARCHAR(64) | NOT NULL | Dataset type |
| `externalId` | VARCHAR(255) | nullable | Provider record ID |
| `symbol` | VARCHAR(32) | nullable, index | Linked symbol |
| `title` | TEXT | nullable | Record title |
| `reportDate` | TIMESTAMP | nullable | Period/report date |
| `publishedAt` | TIMESTAMP | nullable | Publication time |
| `retrievedAt` | TIMESTAMP | NOT NULL, index | Retrieval time |
| `freshnessStatus` | ENUM | NOT NULL | fresh, stale, unavailable, error |
| `rawPayload` | TEXT | NOT NULL | Original payload |
| `normalizedPayload` | TEXT | nullable | Normalized record |
| `errorMessage` | TEXT | nullable | Failure detail |
| `dataHash` | VARCHAR(128) | NOT NULL | Dedup/checksum |
| `parserVersion` | VARCHAR(64) | NOT NULL | Parser audit |
| `supersedesId` | VARCHAR(96) | nullable | Revision chain |
| `createdAt` | TIMESTAMP | NOT NULL | Storage time |

## Production extensions

### `user_preferences`

`id INT PK`, `userId INT FK users.id`, `themeMode ENUM(system, dark, light)`, `defaultMarket VARCHAR(32)`, `defaultSymbol VARCHAR(32)`, `language VARCHAR(16)`, `notificationsEnabled BOOLEAN`, `sourcePreferences TEXT`, `createdAt TIMESTAMP`, `updatedAt TIMESTAMP`. Unique index on `userId`.

### `watchlists`

`id BIGINT PK`, `userId INT FK`, `name VARCHAR(120)`, `description TEXT`, `isDefault BOOLEAN`, `createdAt TIMESTAMP`, `updatedAt TIMESTAMP`. Index on `userId`.

### `watchlist_items`

`id BIGINT PK`, `watchlistId BIGINT FK`, `symbol VARCHAR(32)`, `displayName VARCHAR(255)`, `exchange VARCHAR(64)`, `addedAt TIMESTAMP`, `sortOrder INT`. Unique index on `(watchlistId, symbol)`.

### `saved_screens`

`id BIGINT PK`, `userId INT FK`, `name VARCHAR(120)`, `strategyId VARCHAR(64)`, `criteriaJson TEXT`, `lastRunAt TIMESTAMP nullable`, `createdAt TIMESTAMP`, `updatedAt TIMESTAMP`. Index on `(userId, strategyId)`.

### `research_runs`

`id VARCHAR(96) PK`, `userId INT nullable FK`, `symbol VARCHAR(32)`, `entityName VARCHAR(255)`, `exchange VARCHAR(64)`, `runType ENUM(snapshot, full, export, signal)`, `status ENUM(running, complete, partial, failed)`, `score INT nullable`, `verdict VARCHAR(64) nullable`, `coveragePct INT`, `startedAt TIMESTAMP`, `completedAt TIMESTAMP nullable`, `errorMessage TEXT nullable`. Index on `(symbol, completedAt)` and `(userId, completedAt)`.

### `research_metrics`

`id BIGINT PK`, `researchRunId VARCHAR(96) FK`, `metricKey VARCHAR(96)`, `valueDecimal DECIMAL(24,8) nullable`, `valueText TEXT nullable`, `unit VARCHAR(32)`, `periodLabel VARCHAR(64) nullable`, `basis ENUM(reported, derived, estimated, unavailable)`, `sourceRecordId VARCHAR(96) nullable FK`, `confidence ENUM(high, medium, low)`, `createdAt TIMESTAMP`. Unique index on `(researchRunId, metricKey, periodLabel)`.

### `strategy_definitions`

`id VARCHAR(64) PK`, `name VARCHAR(120)`, `shortDescription TEXT`, `philosophy TEXT`, `criteriaJson TEXT`, `weightsJson TEXT`, `disqualifiersJson TEXT`, `version VARCHAR(32)`, `enabled BOOLEAN`, `createdAt TIMESTAMP`, `updatedAt TIMESTAMP`.

### `strategy_rankings`

`id BIGINT PK`, `strategyId VARCHAR(64) FK`, `symbol VARCHAR(32)`, `researchRunId VARCHAR(96) FK`, `totalScore INT`, `criteriaPassed INT`, `criteriaTotal INT`, `coveragePct INT`, `riskLevel ENUM(low, medium, high, unknown)`, `evidenceJson TEXT`, `rankedAt TIMESTAMP`. Unique index on `(strategyId, symbol, rankedAt)` and index on `(strategyId, totalScore)`.

### `flow_records`

`id VARCHAR(96) PK`, `symbol VARCHAR(32) nullable`, `entityName VARCHAR(255)`, `category ENUM(FII, DII, ProTraders, MutualFunds, StockBuying, Options, BulkDeal, BlockDeal)`, `valueDecimal DECIMAL(24,8) nullable`, `currency VARCHAR(16)`, `action VARCHAR(64)`, `periodStart TIMESTAMP`, `periodEnd TIMESTAMP`, `reportDate TIMESTAMP`, `sourceRecordId VARCHAR(96) FK`, `freshnessStatus ENUM(fresh, stale, unavailable, error)`, `confidence ENUM(high, medium, low)`, `createdAt TIMESTAMP`. Index on `(category, reportDate)`, `(symbol, reportDate)`, and `(entityName, reportDate)`.

### `provider_health_snapshots`

`id BIGINT PK`, `providerId VARCHAR(64)`, `capability VARCHAR(96)`, `status ENUM(configured, needs_secret, fresh, stale, cooldown, rejected, unavailable)`, `latencyMs INT nullable`, `lastSuccessAt TIMESTAMP nullable`, `lastErrorAt TIMESTAMP nullable`, `lastError TEXT nullable`, `cooldownUntil TIMESTAMP nullable`, `payloadPreview TEXT nullable`, `recordCount INT`, `createdAt TIMESTAMP`. Index on `(providerId, createdAt)`.

### `alerts`

`id BIGINT PK`, `userId INT FK`, `name VARCHAR(120)`, `alertType ENUM(news, price, flow, derivatives, score, event)`, `symbol VARCHAR(32) nullable`, `ruleJson TEXT`, `enabled BOOLEAN`, `lastTriggeredAt TIMESTAMP nullable`, `createdAt TIMESTAMP`, `updatedAt TIMESTAMP`.

### `alert_deliveries`

`id BIGINT PK`, `alertId BIGINT FK`, `channel ENUM(push, email, telegram, discord)`, `dedupeKey VARCHAR(160)`, `status ENUM(queued, sent, failed, suppressed)`, `providerResponse TEXT nullable`, `createdAt TIMESTAMP`, `sentAt TIMESTAMP nullable`. Unique index on `(dedupeKey, channel)`.

### `chat_conversations` and `chat_messages`

`chat_conversations`: `id VARCHAR(96) PK`, `userId INT FK`, `title VARCHAR(160)`, `symbol VARCHAR(32) nullable`, `createdAt TIMESTAMP`, `updatedAt TIMESTAMP`.  
`chat_messages`: `id BIGINT PK`, `conversationId VARCHAR(96) FK`, `role ENUM(user, assistant, system)`, `content TEXT`, `evidenceJson TEXT`, `limitations TEXT nullable`, `confidence ENUM(high, medium, low, unknown)`, `createdAt TIMESTAMP`. Index on `(conversationId, createdAt)`.

### `report_exports`

`id VARCHAR(96) PK`, `userId INT nullable FK`, `researchRunId VARCHAR(96) FK`, `format ENUM(markdown, pdf)`, `storageKey TEXT`, `fileName VARCHAR(255)`, `checksum VARCHAR(128)`, `status ENUM(generating, ready, failed)`, `createdAt TIMESTAMP`, `completedAt TIMESTAMP nullable`, `errorMessage TEXT nullable`.

## Relationship summary

`users` owns preferences, watchlists, saved screens, research runs, alerts, conversations, and exports. `research_runs` owns metrics and can support strategy rankings. `source_records` is the provenance backbone for news, financial metrics, filings, flows, and derivatives. `provider_health_snapshots` is independent telemetry and must not be used as a market-data substitute. `news_events`, `flow_records`, and analysis metrics link to symbols but remain append-only to preserve history.

## Indexing, retention, and privacy

Use indexes on user ownership, symbol plus event/report date, provider plus creation time, and strategy plus score. Retain raw provider payloads according to source terms and redact secrets before logging. User chat history, watchlists, alerts, and exports are private. Public aggregate market data may be cached, but user-specific research context requires authenticated access.

## Migration approach

Add extension tables through Drizzle migrations. Deploy additive schema changes first, then server writes, then client reads. Backfill only from existing source records; never fabricate historical values. Each migration has a reversible application-level fallback and a data-integrity test.
