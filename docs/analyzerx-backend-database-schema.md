# AnalyzerX Backend Database Schema

**Version:** 2.0

**Database:** MySQL-compatible database through Drizzle ORM

**Identity:** Numeric user IDs for current schema; stable string IDs for external entities, sources, events, and research runs

## 1. Schema conventions

All tables use explicit `createdAt` and, where mutable, `updatedAt`. User-owned tables include `userId`, revocation/deletion fields where applicable, and server-side ownership checks. Market-dependent tables include `marketId` and usually `exchange` or `entityId`. Source-backed records include provider/source key, source URL, retrieval time, as-of/report period, freshness, confidence, parser/version, checksum or deduplication hash, and raw evidence reference.

JSON-shaped fields remain text in the current Drizzle schema for compatibility, but their payloads are validated by Zod contracts before persistence. Monetary and ratio observations are stored as normalized strings or decimal-compatible values with explicit unit and currency rather than floating-point display assumptions.

## 2. Identity and access

| Table | Fields and types | Keys and rules |
| --- | --- | --- |
| `users` | `id int`, `openId varchar(64)`, `name text`, `email varchar(320)`, `loginMethod varchar(64)`, `role enum(user,admin)`, `createdAt timestamp`, `updatedAt timestamp`, `lastSignedIn timestamp` | PK `id`; unique `openId`; admin role is server-enforced |
| `sessions` | `id varchar(128)`, `userId int`, `provider varchar(64)`, `expiresAt timestamp`, `revokedAt timestamp nullable`, `createdAt timestamp`, `lastSeenAt timestamp` | PK `id`; index `(userId, expiresAt)`; never log token material |
| `user_market_preferences` | `userId int`, `marketId varchar(8)`, `revision int`, `clientUpdatedAt timestamp`, `serverUpdatedAt timestamp`, `lastWriter varchar(32)`, `conflictCount int`, `conflictJson text nullable`, `createdAt timestamp` | PK `userId`; revision-based conflict handling |
| `user_preferences` | `userId int`, `assistantMode enum(auto,connected,local)`, `themeId varchar(64)`, `colorMode enum(light,dark,system)`, `locale varchar(16)`, `retentionDays int`, `updatedAt timestamp` | PK `userId`; explicit preferences are never overwritten by first-run defaults |
| `market_preference_conflicts` | `id varchar(96)`, `userId int`, `localMarketId varchar(8)`, `serverMarketId varchar(8)`, `localRevision int`, `serverRevision int`, `resolvedBy varchar(32)`, `resolvedAt timestamp nullable`, `createdAt timestamp` | Index `(userId, createdAt)` |
| `audit_events` | `id varchar(128)`, `userId int nullable`, `actorRole varchar(32)`, `action varchar(96)`, `resourceType varchar(64)`, `resourceId varchar(160)`, `metadataJson text`, `createdAt timestamp` | Append-only; redact secrets and private prompt content |

## 3. Market master

| Table | Fields and types | Keys and rules |
| --- | --- | --- |
| `markets` | `id varchar(8)`, `name varchar(128)`, `country varchar(64)`, `currency varchar(16)`, `timezone varchar(64)`, `status enum(live,delayed,catalog-validated,unavailable)`, `createdAt timestamp`, `updatedAt timestamp` | PK `id`; unique country/market code |
| `exchanges` | `id varchar(32)`, `marketId varchar(8)`, `name varchar(128)`, `mic varchar(8) nullable`, `status varchar(32)`, `sourceUrl text nullable` | PK `id`; index `(marketId, status)` |
| `entities` | `id varchar(96)`, `canonicalSymbol varchar(32)`, `canonicalName varchar(255)`, `entityType enum(company,index,fund,crypto,commodity,currency,unknown)`, `exchange varchar(32) nullable`, `country varchar(64) nullable`, `sector varchar(128) nullable`, `resolutionStatus enum(verified,partial,unresolved,inactive)`, `aliasesJson text`, `identifiersJson text`, `sourceRecordId varchar(96) nullable`, `sourceUrl text nullable`, `confidenceScore int`, `lastVerifiedAt timestamp nullable`, `createdAt timestamp`, `updatedAt timestamp` | PK `id`; unique canonical symbol within exchange/market; index `(country, sector, resolutionStatus)` |
| `instrument_aliases` | `id varchar(128)`, `entityId varchar(96)`, `alias varchar(255)`, `aliasType enum(strong,weak,ticker,legal,ir-domain)`, `marketId varchar(8)`, `exchange varchar(32) nullable`, `isCommonWord boolean`, `evidenceJson text`, `createdAt timestamp` | Index `(marketId, alias)`; weak/common aliases require corroboration |
| `sector_taxonomy` | `id varchar(96)`, `marketId varchar(8)`, `parentId varchar(96) nullable`, `name varchar(128)`, `level enum(sector,subsector,industry)`, `sourceKey varchar(64)`, `updatedAt timestamp` | Index `(marketId, parentId)` |
| `entity_relationships` | `id varchar(160)`, `fromEntityId varchar(96)`, `toEntityId varchar(96)`, `relationshipType varchar(64)`, `status enum(confirmed,inferred,contradicted)`, `evidenceJson text`, `sourceRecordId varchar(96) nullable`, `createdAt timestamp`, `updatedAt timestamp` | Index `(fromEntityId, relationshipType)` and `(toEntityId, relationshipType)` |

## 4. Sources and provider health

| Table | Fields and types | Keys and rules |
| --- | --- | --- |
| `providers` | `id varchar(64)`, `name varchar(128)`, `capabilitiesJson text`, `marketsJson text`, `credentialState varchar(32)`, `licenseState varchar(32)`, `enabled boolean`, `createdAt timestamp`, `updatedAt timestamp` | Unique provider ID |
| `provider_health` | `providerId varchar(64)`, `status enum(live,delayed,unavailable,cooldown)`, `circuitState varchar(32)`, `failureClass varchar(32) nullable`, `latencyMs int nullable`, `lastSuccessAt timestamp nullable`, `lastCheckedAt timestamp`, `payloadPreview text nullable`, `errorMessage text nullable` | PK `providerId` |
| `provider_health_history` | `id varchar(128)`, `providerId varchar(64)`, `status varchar(32)`, `circuitState varchar(32)`, `failureClass varchar(32) nullable`, `latencyMs int nullable`, `checkedAt timestamp`, `successAt timestamp nullable`, `payloadPreview text nullable`, `errorMessage text nullable`, `createdAt timestamp` | Index `(providerId, checkedAt)`; retain 30 days by policy |
| `provider_budgets` | `providerId varchar(64)`, `windowStart timestamp`, `windowEnd timestamp`, `requests int`, `failures int`, `cooldownUntil timestamp nullable`, `updatedAt timestamp` | PK `(providerId, windowStart)` |
| `source_records` | `id varchar(96)`, `sourceKey varchar(64)`, `sourceUrl text`, `documentName varchar(255) nullable`, `recordType varchar(64)`, `externalId varchar(255) nullable`, `marketId varchar(8) nullable`, `symbol varchar(32) nullable`, `title text nullable`, `reportDate timestamp nullable`, `publishedAt timestamp nullable`, `retrievedAt timestamp`, `freshnessStatus enum(fresh,stale,unavailable,error)`, `rawPayload text`, `normalizedPayload text nullable`, `errorMessage text nullable`, `dataHash varchar(128)`, `parserVersion varchar(64)`, `supersedesId varchar(96) nullable`, `createdAt timestamp` | Index `(sourceKey, retrievedAt)`, `(marketId, reportDate)`, unique deduplication hash where appropriate |
| `source_payloads` | `id varchar(128)`, `sourceRecordId varchar(96)`, `contentType varchar(96)`, `storageUri text nullable`, `payloadHash varchar(128)`, `sizeBytes int nullable`, `encrypted boolean`, `createdAt timestamp` | Raw large payloads may move to object storage |

## 5. Market observations

| Table | Fields and types | Keys and rules |
| --- | --- | --- |
| `market_observations` | Existing fields include `id`, `entityId`, `symbol`, `observationType`, `observedAt`, `period`, OHLCV values, `currency`, `sourceKey`, `sourceUrl`, `sourceRecordId`, `freshnessStatus`, `confidenceScore`, `dataHash`, `createdAt` | Index `(entityId, observedAt)`, `(symbol, observationType, observedAt)` |
| `fundamental_observations` | `id`, `entityId`, `symbol`, `metricKey`, `metricValue`, `unit`, `period`, `periodEnd`, `observedAt`, `sourceKey`, `sourceUrl`, `sourceRecordId`, `freshnessStatus`, `confidenceScore`, `derivationStatus enum(reported,derived,estimated,unavailable)`, `dataHash`, `createdAt` | Index `(entityId, metricKey, periodEnd)` |
| `financial_statements` | `id varchar(128)`, `entityId varchar(96)`, `statementType enum(income,balance,cashflow)`, `period varchar(32)`, `periodEnd timestamp`, `currency varchar(16)`, `lineItemsJson text`, `sourceRecordId varchar(96)`, `freshnessStatus varchar(32)`, `createdAt timestamp` | Unique `(entityId, statementType, periodEnd, sourceRecordId)` |
| `cash_flow_observations` | `id varchar(128)`, `entityId varchar(96)`, `periodEnd timestamp`, `operatingCashFlow varchar(96)`, `capex varchar(96)`, `freeCashFlow varchar(96)`, `netIncome varchar(96)`, `conversionRatio varchar(96) nullable`, `currency varchar(16)`, `derivationStatus varchar(32)`, `sourceRecordId varchar(96)`, `createdAt timestamp` | Index `(entityId, periodEnd)` |
| `valuation_observations` | `id varchar(128)`, `entityId varchar(96)`, `observedAt timestamp`, `pe varchar(96) nullable`, `pb varchar(96) nullable`, `peg varchar(96) nullable`, `evEbitda varchar(96) nullable`, `fairValueLow varchar(96) nullable`, `fairValueBase varchar(96) nullable`, `fairValueHigh varchar(96) nullable`, `assumptionsJson text`, `sourceRecordId varchar(96) nullable`, `createdAt timestamp` | Explicit scenario assumptions required |
| `ownership_observations` | `id varchar(128)`, `entityId varchar(96)`, `periodEnd timestamp`, `promoterPct varchar(96) nullable`, `pledgedPct varchar(96) nullable`, `institutionalPct varchar(96) nullable`, `mutualFundPct varchar(96) nullable`, `sourceRecordId varchar(96)`, `freshnessStatus varchar(32)`, `createdAt timestamp` | Index `(entityId, periodEnd)` |
| `institutional_flows` | `id varchar(128)`, `marketId varchar(8)`, `entityId varchar(96) nullable`, `symbol varchar(32) nullable`, `participantType enum(fii,dii,mutual-fund,proprietary,unknown)`, `periodStart timestamp`, `periodEnd timestamp`, `buyValue varchar(96) nullable`, `sellValue varchar(96) nullable`, `netValue varchar(96) nullable`, `sector varchar(128) nullable`, `subsector varchar(128) nullable`, `sourceRecordId varchar(96)`, `freshnessStatus varchar(32)`, `createdAt timestamp` | Index `(marketId, participantType, periodEnd)`, `(entityId, periodEnd)` |
| `options_observations` | `id varchar(128)`, `marketId varchar(8)`, `entityId varchar(96)`, `expiryDate timestamp`, `strike varchar(64)`, `optionType enum(call,put)`, `openInterest varchar(96)`, `changeInOi varchar(96)`, `volume varchar(96)`, `iv varchar(96) nullable`, `pcr varchar(96) nullable`, `maxPain varchar(96) nullable`, `sourceRecordId varchar(96)`, `freshnessStatus varchar(32)`, `createdAt timestamp` | Index `(entityId, expiryDate)` |
| `macro_observations` | `id varchar(128)`, `sourceKey varchar(64)`, `marketId varchar(8) nullable`, `indicatorKey varchar(128)`, `geography varchar(64)`, `period varchar(32)`, `frequency varchar(32)`, `value varchar(96) nullable`, `unit varchar(64)`, `dimensionsJson text`, `retrievedAt timestamp`, `latencyMs int nullable`, `freshnessStatus varchar(32)`, `sourceRecordId varchar(96)`, `createdAt timestamp` | Index `(sourceKey, indicatorKey, period)` |

## 6. Intelligence and projections

| Table | Fields and types | Keys and rules |
| --- | --- | --- |
| `news_events` | Existing fields include `id`, `marketId`, `symbol`, headline, category, summary, entities, sentiment, action impact, URL, source, publication time, impact score, high-impact flag, and created time | Add relevance score/status, evidence JSON, provider/source record ID, ambiguity reason, and deduplication hash in the next additive migration |
| `news_evidence` | `id varchar(160)`, `newsId varchar(64)`, `evidenceType varchar(64)`, `matchedText text`, `sourceUrl text`, `sourceRecordId varchar(96) nullable`, `strength enum(strong,medium,weak)`, `createdAt timestamp` | Index `(newsId, strength)` |
| `filings` | `id varchar(128)`, `marketId varchar(8)`, `entityId varchar(96)`, `filingType varchar(64)`, `accession varchar(128) nullable`, `filedAt timestamp`, `periodEnd timestamp nullable`, `sourceUrl text`, `rawSourceRecordId varchar(96)`, `freshnessStatus varchar(32)`, `createdAt timestamp` | Unique `(marketId, accession)` where accession exists |
| `filing_metrics` | `id varchar(160)`, `filingId varchar(128)`, `metricKey varchar(128)`, `value varchar(96)`, `unit varchar(64)`, `contextJson text`, `createdAt timestamp` | Index `(filingId, metricKey)` |
| `event_projections` | Existing event projection fields include entity, symbol, storyline, event type, title, summary, relationship, sentiment, impact, confidence, status, source, event time, evidence, parser version, and timestamps | Unique `eventKey`; index `(entityId, eventAt)` |
| `storylines` | `id varchar(160)`, `marketId varchar(8)`, `title varchar(255)`, `entityIdsJson text`, `eventIdsJson text`, `windowStart timestamp`, `windowEnd timestamp`, `status varchar(32)`, `createdAt timestamp`, `updatedAt timestamp` | Index `(marketId, updatedAt)` |
| `graph_nodes` | `id varchar(128)`, `marketId varchar(8)`, `entityId varchar(96)`, `nodeType varchar(64)`, `label varchar(255)`, `status varchar(32)`, `createdAt timestamp` | Unique `(marketId, entityId, nodeType)` |
| `graph_edges` | `id varchar(160)`, `marketId varchar(8)`, `fromNodeId varchar(128)`, `toNodeId varchar(128)`, `relationshipType varchar(64)`, `confidenceScore int`, `contradictionSeverity varchar(32)`, `sourceCount int`, `evidenceJson text`, `createdAt timestamp` | Index `(marketId, contradictionSeverity, sourceCount)` |
| `contradictions` | `id varchar(160)`, `marketId varchar(8)`, `subjectId varchar(96)`, `claimAJson text`, `claimBJson text`, `severity varchar(32)`, `sourceCount int`, `status varchar(32)`, `createdAt timestamp` | Filterable by market and severity |
| `research_runs` | `id varchar(160)`, `userId int nullable`, `marketId varchar(8)`, `entityIdsJson text`, `question text`, `status enum(queued,running,partial,completed,failed,cancelled)`, `runtime varchar(32)`, `startedAt timestamp`, `completedAt timestamp nullable`, `errorMessage text nullable`, `createdAt timestamp`, `updatedAt timestamp` | Index `(userId, marketId, updatedAt)` |
| `research_packets` | `id varchar(160)`, `runId varchar(160)`, `lane varchar(64)`, `status varchar(32)`, `summary text`, `evidenceJson text`, `limitationsJson text`, `confidenceScore int`, `retryCount int`, `createdAt timestamp`, `updatedAt timestamp` | Unique `(runId, lane)` |
| `recommendations` | `id varchar(160)`, `marketId varchar(8)`, `entityId varchar(96)`, `strategyId varchar(96) nullable`, `score int`, `direction varchar(32)`, `thesis text`, `risks text`, `evidenceJson text`, `status varchar(32)`, `asOf timestamp`, `createdAt timestamp` | Never represent as guaranteed outcome |

## 7. User workflows and notifications

| Table | Fields and types | Keys and rules |
| --- | --- | --- |
| `user_watchlist_items` | Existing `id`, `userId`, `symbol`, `entityId`, `enabled`, timestamps; add `marketId` and `revokedAt` | Index `(userId, marketId, updatedAt)`; ownership required |
| `user_saved_screens` | Existing `id`, `userId`, `name`, `filtersJson`, `revokedAt`, timestamps; add `marketId` | Index `(userId, marketId, updatedAt)` |
| `user_alert_rules` | Existing `id`, `userId`, title, query, enabled, revokedAt, timestamps; add `marketId`, `ruleType`, `quietHoursJson`, `notificationPrefsJson` | Index `(userId, marketId, updatedAt)` |
| `smart_alert_results` | Existing result fields; add `userId`, `marketId`, `ruleId`, evidence, status, data timestamp, notification timestamps | Index `(userId, marketId, updatedAt)`, `(userId, ruleId, updatedAt)` |
| `alert_status_transitions` | `id varchar(160)`, `alertResultId varchar(160)`, `fromStatus varchar(32)`, `toStatus varchar(32)`, `reason text`, `createdAt timestamp` | Index `(alertResultId, createdAt)` |
| `notification_preferences` | `userId int`, `channel varchar(32)`, `enabled boolean`, `quietHoursJson text`, `updatedAt timestamp` | Unique `(userId, channel)` |
| `push_tokens` | Current token/platform/enabled/lastSeen fields; add `userId`, `revokedAt`, `createdAt` | Index `(userId, enabled)`; tokens are revocable |
| `recent_searches` | `id varchar(128)`, `userId int nullable`, `marketId varchar(8)`, `query varchar(255)`, `entityId varchar(96) nullable`, `lastUsedAt timestamp`, `createdAt timestamp` | Index `(userId, marketId, lastUsedAt)` |
| `saved_research` | `id varchar(160)`, `userId int`, `marketId varchar(8)`, `entityId varchar(96) nullable`, `runId varchar(160) nullable`, `title varchar(255)`, `contentUri text nullable`, `revokedAt timestamp nullable`, `createdAt timestamp`, `updatedAt timestamp` | Ownership and retention enforced |
| `report_exports` | `id varchar(160)`, `userId int nullable`, `marketId varchar(8)`, `reportType varchar(64)`, `entityIdsJson text`, `format varchar(16)`, `status enum(queued,running,completed,failed,cancelled)`, `storageUri text nullable`, `checksum varchar(128) nullable`, `errorMessage text nullable`, `createdAt timestamp`, `completedAt timestamp nullable` | Index `(userId, marketId, createdAt)` |

## 8. AI and ForgeShelf

| Table | Fields and types | Keys and rules |
| --- | --- | --- |
| `assistant_conversations` | `id varchar(160)`, `userId int nullable`, `marketId varchar(8)`, `engine varchar(32)`, `title varchar(255) nullable`, `createdAt timestamp`, `updatedAt timestamp` | Index `(userId, updatedAt)` |
| `assistant_messages` | `id varchar(160)`, `conversationId varchar(160)`, `role enum(user,assistant,system)`, `content text`, `evidenceJson text`, `limitationsJson text`, `createdAt timestamp` | Index `(conversationId, createdAt)`; redact sensitive content under retention policy |
| `local_models` | `id varchar(128)`, `displayName varchar(255)`, `engine varchar(64)`, `artifactUri text`, `version varchar(64)`, `sha256 varchar(128)`, `sizeBytes int nullable`, `capabilitiesJson text`, `hardwareRequirementsJson text`, `license varchar(255)`, `status varchar(32)`, `createdAt timestamp`, `updatedAt timestamp` | Unique `(id, version)` |
| `local_model_installs` | `id varchar(160)`, `userId int`, `modelId varchar(128)`, `version varchar(64)`, `state varchar(32)`, `artifactUri text nullable`, `verifiedSha256 varchar(128) nullable`, `progress int`, `errorMessage text nullable`, `installedAt timestamp nullable`, `updatedAt timestamp` | Unique `(userId, modelId, version)` |
| `local_ai_telemetry` | `id varchar(160)`, `userId int nullable`, `modelId varchar(128)`, `engine varchar(64)`, `platform varchar(32)`, `latencyMs int nullable`, `tokensPerSecond varchar(64) nullable`, `memoryBytes varchar(64) nullable`, `batteryPct varchar(32) nullable`, `thermalState varchar(32) nullable`, `status varchar(32)`, `capturedAt timestamp` | Index `(userId, capturedAt)`; retention configurable |
| `forge_tools` | `id varchar(128)`, `name varchar(255)`, `publisher varchar(255)`, `category varchar(64)`, `version varchar(64)`, `artifactJson text`, `dependencyJson text`, `platformsJson text`, `license varchar(255)`, `releaseChannel varchar(32)`, `status varchar(32)`, `updatedAt timestamp` | Unique `(id, version)` |
| `forge_install_records` | `id varchar(160)`, `userId int`, `toolId varchar(128)`, `state varchar(32)`, `stage varchar(32)`, `progress int`, `installedVersion varchar(64) nullable`, `artifactUri text nullable`, `verifiedSha256 varchar(128) nullable`, `errorMessage text nullable`, `createdAt timestamp`, `updatedAt timestamp` | Index `(userId, updatedAt)`; atomic active pointer |
| `forge_dependencies` | `toolId varchar(128)`, `dependencyId varchar(128)`, `versionRange varchar(64)`, `required boolean`, `createdAt timestamp` | PK `(toolId, dependencyId)` |

## 9. Relationships and indexes

`users` owns preferences, watchlists, saved screens, alerts, research runs, reports, conversations, model installs, ForgeShelf installs, telemetry, and push tokens. `markets` scope exchanges, entities, source records, observations, intelligence projections, alerts, research, and reports. `entities` connect to aliases, observations, filings, flows, options, events, graph nodes, recommendations, and saved research. `source_records` anchor raw payloads and evidence for observations, filings, news, and events.

High-volume indexes must include `(userId, marketId, updatedAt)` for alert/result and saved workflow history, `(userId, ruleId, updatedAt)` for alert result history, `(entityId, observedAt)` for observations, `(marketId, publishedAt)` for news, `(providerId, checkedAt)` for health, and `(sourceKey, reportDate)` for source records. Deduplication keys must be deterministic and idempotent.

## 10. Retention, encryption, and migration

Provider health history defaults to thirty days. Raw payloads, telemetry, Assistant history, recent searches, and report artifacts have configurable retention with explicit deletion controls. User-owned artifacts are revocable and deletion jobs remove database references and object-storage files. Sensitive tokens use secure storage and are never persisted in plain logs. New fields such as market scope, relevance evidence, ownership, and user IDs are added through non-destructive migrations with backfill defaults and an explicit rollback note; existing provider records are not deleted.
