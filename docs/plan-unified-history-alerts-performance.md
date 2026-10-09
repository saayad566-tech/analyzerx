# AnalyzerX Unified History, Alert Preferences, Source Validation, and Performance Plan

## Goal

Extend AnalyzerX with a dedicated in-app history experience covering news reads, recommendations, alerts, searches, analyses, reports, and watchlist activity; add per-alert notification preferences and quiet hours; validate additional machine-readable BSE and company-investor-relations filing paths; and improve perceived and measured responsiveness without claiming unsupported real-time guarantees.

The implementation must preserve the existing **Institutional Five-Pillar Score as the primary score**, keep the Multibagger Thesis as a separate secondary lens, preserve all current provider-isolation and source-provenance rules, and keep unavailable or stale data visibly truthful.

## Existing constraints and assumptions

| Area | Current state | Planning assumption |
|---|---|---|
| Local history | `lib/research-analytics.ts` already records session, search, news-open, analysis-open, export, and watchlist events; `lib/local-preferences.ts` stores recent searches and alert enablement | Use the existing event taxonomy as the local-first source and add a normalized timeline projection rather than creating parallel incompatible logs |
| Server history | Smart Alert results are persisted in `smart_alert_results`; news/source records are persisted in MySQL when available | Use authenticated server persistence for cross-device history, with a local AsyncStorage fallback when signed out or offline |
| Alert notifications | Newly eligible results pass through the existing notification-service boundary; channel availability is already explicit | Add per-alert preference metadata and quiet-hours suppression before dispatch; do not silently claim Telegram, WhatsApp, email, or device push delivery unless that channel is configured and verified |
| Official filings | NSE RSS and page snapshots exist; BSE and company-IR catalog entries are placeholders pending endpoint/schema validation | Validate public machine-readable endpoints or downloadable files read-only first. Add a parser only after schema, cadence, URL stability, and legal/access boundaries are confirmed |
| Performance | The app uses tRPC/TanStack Query, server provider cooldowns, and periodic polling | Improve latency through bounded concurrency, request deduplication, query caching, selective refresh, pagination/virtualized lists, and cached projections; measure p50/p95 rather than promising a universal fixed latency |
| Authentication | User accounts and protected procedures are available | User-specific history, notification settings, quiet hours, and cross-device synchronization should use protected procedures. Signed-out users retain local-only history and receive a clear sync limitation |

## Phase 1 — Unified history model and audit trail

First, audit `lib/research-analytics.ts`, `lib/local-preferences.ts`, existing alert-result persistence, news archive records, report/export routes, recommendation/screener outputs, and navigation routes. Define one normalized `HistoryEntry` contract with an immutable event ID, user/device scope, event type, timestamp, symbol/entity, title, summary, source/provenance, route/deep link, score/status when applicable, and retention metadata.

Keep raw source records and analytical results separate from the user-facing timeline. Build a projection layer that can combine local analytics events with server records without duplicating entries. Deduplicate by stable event ID first and by a conservative `(type, symbol, source, timestamp, title)` fingerprint only when the source is identical. Preserve original timestamps and source links.

Add event types for recommendation viewed, alert created/updated/triggered, search submitted/selected, news opened, analysis opened, report generated/exported, watchlist change, and provider/source status viewed. Emit events at the existing action boundaries rather than from render functions. Add retention controls and pagination so the timeline does not load the entire history into memory.

## Phase 2 — Dedicated history screen and navigation

Create a dedicated History screen reachable from the account/workspace area and from relevant empty states. Organize entries by date with filters for All, News, Searches, Recommendations, Alerts, Analyses, Reports, and Watchlist. Add symbol search, date range, source, and status filters. Each row should show the action, entity, timestamp, source/freshness status, and a direct navigation action.

Use `FlatList` with stable keys, pagination/infinite loading, memoized row components, and a compact detail sheet for evidence and source links. Add loading, empty, offline, stale, unauthorized, and retry states. Allow clearing local history and, when authenticated, deleting or clearing server history with confirmation. Ensure the history screen does not expose private alert or analysis data across users.

## Phase 3 — Per-alert notification settings and quiet hours

Extend the saved-alert model with per-alert preferences: enabled, severity threshold, in-app, device push, email, Telegram, WhatsApp, digest mode, and quiet-hours override. Add a user-level default preference object and per-alert overrides. Store times in the user’s selected timezone and normalize server comparisons to UTC.

Implement quiet-hours behavior as a deterministic dispatch gate. During quiet hours, eligible events are persisted immediately but notifications are suppressed or queued according to the alert’s digest setting. On quiet-hours exit, deliver a deduplicated digest with event IDs and evidence links. Critical alerts may optionally bypass quiet hours only when the user explicitly enables that override.

Expose preference controls in an Alert Settings screen or expandable alert detail panel. Show channel state as Configured, Pending setup, Cooldown, Failed, or Unavailable. Never display a successful delivery state until the channel provider returns an accepted response. Add notification idempotency using `(user, alert, event, channel)` keys and record delivery attempts, suppression reasons, and provider response status.

## Phase 4 — BSE and company-IR machine-readable source validation

Perform read-only validation of candidate BSE and company-IR endpoints. For each candidate, record the URL, access status, response content type, schema shape, publication-date field, symbol/company identifier, pagination or date parameters, rate limits, authentication requirements, robots/WAF/CAPTCHA behavior, license/terms notes, and a sample checksum. Do not bypass CAPTCHA, WAF, authentication, or access controls.

Promote a source from catalog placeholder to `validated-machine-readable` only when the endpoint is stable, its fields are understood, the access method is compliant, and the parser can reject malformed responses. Otherwise keep it as `page-snapshot`, `transport-limited`, or `unavailable` with the reason.

Implement parsers only for validated schemas. Normalize filings into the existing `source_records` contract with source key, original URL, document/external ID, symbol, title, publication time, report date, raw payload checksum, parser version, normalized event fields, and freshness state. Reuse existing deduplication and supersession semantics. Add company-IR URL discovery only from verified company domains or catalogued investor-relations pages; do not infer an IR URL from an unverified search result.

Merge validated filing records into Smart Event Alerts as an additional evidence stream. Filing events should outrank secondary news evidence only when the filing itself is verified and current. Conflicting records should remain visible with both sources and a conflict state rather than being silently merged.

## Phase 5 — Performance and responsiveness hardening

Measure before changing behavior. Add client and server telemetry for request duration, cache hit/miss, provider latency, render duration, list item count, and error/cooldown state. Report p50 and p95 by route and provider.

Apply bounded parallelism to provider fan-out, shared in-flight request deduplication, TanStack Query stale times based on data cadence, server-side normalized cache projections for history and alert discovery, and incremental source ingestion rather than full scans. Avoid performing expensive fundamental analysis for every symbol on every UI request; queue or cache symbol profiles and invalidate them only when relevant source data changes.

Use paginated queries for history and eligible-stock results. Replace large mapped scroll views with `FlatList` where a list can grow. Memoize filters, rows, and derived score calculations. Keep refresh controls non-blocking and show last-known data with freshness labels while a new request runs. Preserve provider circuit breakers and ensure a slow or failed provider cannot delay successful providers beyond the configured aggregation deadline.

Define latency targets as engineering goals rather than guarantees: cached local history reads under 100 ms p95, cached server history under 300 ms p95, normal alert discovery under 1.5 s p95 with bounded source fan-out, and refresh completion reported separately from first usable data. Revisit targets after live measurements.

## Phase 6 — Verification and acceptance tests

Add deterministic unit tests for unified event normalization, deduplication, retention, filtering, pagination cursors, timezone-aware quiet hours including midnight crossing and DST boundary cases, severity/channel preferences, notification idempotency, suppression/digest behavior, and score/status preservation.

Add parser fixtures for every validated BSE and company-IR schema, malformed payloads, missing identifiers, stale documents, duplicate documents, superseding filings, conflicting sources, HTTP 401/403/404/429/5xx, invalid content types, and transport timeouts. Tests must confirm that protected or unvalidated endpoints never become verified evidence.

Add tRPC integration tests for authenticated history isolation, offline/local fallback, alert preference updates, history pagination, source health, and Smart Event Alerts result history. Add UI tests for navigation, filters, direct links, notification preference changes, quiet-hours display, and every loading/empty/error state.

Run TypeScript, lint, production build, full regression, source smoke probes, database migration review, and responsive visual QA on narrow and wide viewports. Capture p50/p95 performance summaries and confirm no provider failure blocks unrelated data. Verify the primary Institutional Five-Pillar Score remains the report’s primary score and the Multibagger Thesis remains secondary.

## Deliverables

The implementation should produce a dedicated History screen, unified history API and local projection, alert preference and quiet-hours controls, validated BSE/IR source catalog entries and parsers where supported, source-aware Smart Event Alerts enrichment, performance telemetry, regression coverage, and a reviewable checkpoint. The final report must distinguish verified additions from endpoints that remain protected, unavailable, delayed, or awaiting schema validation.

## Risks and open decisions

The largest risks are unstable exchange endpoints, company-specific IR formats, notification-provider credentials, cross-device identity requirements, and the difference between first usable data and complete multi-provider refresh. If no compliant machine-readable BSE or company-IR endpoint can be validated, the plan will retain page snapshots and clearly document the limitation rather than scraping around access controls. If the user wants anonymous cross-device history, an explicit identity mechanism is required; otherwise history remains device-local until login.
