# AnalyzerX Ownership, Multi-Hop Graph, and Validated Filing Collectors Plan

## Goal

Extend AnalyzerX with authenticated ownership and revocation for user-specific data, replace the fixture-driven Relationship Graph with evidence-backed multi-hop projections, and add source-specific BSE and company-investor-relations collectors only after endpoint and schema validation. Existing provider boundaries, public market reads, source provenance, autonomous recommendations, and truthful unavailable states must remain intact.

## Current-state grounding

The current database has a shared `users` table, but `push_tokens`, `smart_alert_results`, autonomous recommendations, and local watchlists/saved screens do not have user ownership. Push registration currently occurs automatically at the root app layer without an authentication gate. Watchlists and saved screener configurations are stored in AsyncStorage through `local-preferences.ts`. The Relationship Graph is still fully fixture-driven and renders fixed nodes and edges. Source ingestion has validated source-specific branches for NSE announcements RSS and NSE FII/DII; other official sources currently fall through to generic HTML snapshots. BSE and company-IR machine-readable collection is therefore not yet implemented.

## Implementation phases

### 1. Define ownership, migration, and compatibility contracts

Create a data-ownership matrix for watchlist symbols, saved screener views, alert rules/results, push tokens, notification preferences, and saved research/report history. Define whether each record is owned by a numeric `users.id`, whether anonymous local state is supported during migration, and how local records merge after login. Use additive nullable/owned fields only at first, with explicit migration and backfill behavior. Define revocation semantics: deleting a watchlist item removes server ownership of that item; disabling a token prevents delivery immediately; deleting an alert or saved research record marks or removes only the requesting user’s records; shared autonomous recommendations remain global source-backed intelligence and are not duplicated per user.

### 2. Add authenticated ownership tables and protected procedures

Extend the schema with user-owned watchlist rows, saved-screen rows, alert-rule rows or an ownership bridge for existing alert records, push-token ownership and revocation fields, notification-preference rows, and saved-research/report metadata. Add unique constraints that prevent duplicates per user, indexes for user lookups, timestamps, enabled/revoked state, and safe cascade or soft-delete behavior. Keep global `autonomous_recommendations`, source records, entities, observations, and event projections unowned unless they are explicitly user annotations.

Add database helpers that always require `ctx.user.id`, filter by owner, and implement create/update/list/delete/revoke operations. Convert the user-specific tRPC procedures from public to protected procedures. Add strict Zod validation for symbols, saved-screen names, report identifiers, push-token format, notification channels, quiet hours, and pagination. Preserve read-only public market intelligence where it does not contain user-specific data.

### 3. Migrate local state without data loss

Add an authenticated sync bootstrap flow. Before login, the app continues to support local watchlists and saved screens. After login, it uploads validated local records using idempotency keys, merges them with server records using deterministic conflict rules, then marks the local copy as synchronized. On logout, clear or retain only device-local state according to a visible user setting; never display another user’s server state. Add a migration version and failure recovery so a failed sync does not delete local data. Update Screener, Research Workspace, Account, Alerts, and notification settings to use protected server queries when authenticated and show clear login/sync/unavailable states otherwise.

### 4. Harden push-token registration and revocation

Change automatic root-level push registration so the token is registered only for an authenticated user, or is stored as an explicitly device-scoped anonymous token that cannot receive account-specific alerts. Prefer the authenticated path. Add token ownership, platform/device metadata, last-seen time, enabled/revoked timestamps, and an idempotent unique token constraint. Add protected enable/disable/delete procedures and an Account/Notifications management surface. Update notification delivery to select only active tokens owned by the intended user, skip quiet hours according to server-stored preferences, and record truthful delivery state without exposing token values in UI or logs.

### 5. Build a normalized multi-hop relationship projection

Define a graph contract with nodes, directed edges, hop depth, relationship type, evidence status, confidence, impact, timestamps, source lineage, and invalidation/staleness fields. Project graph facts from persisted `event_projections`, official filing records, entity master records, and autonomous recommendation relationship evidence. Support direct and indirect chains such as company → order/customer, company → project, project → supplier, supplier → sector/theme, and company → regulatory/capital event. Limit traversal depth and fan-out to prevent graph explosion; do not infer a relationship without a source-backed edge or an explicitly labeled low-confidence inference.

Persist or cache graph projections with deterministic edge IDs, evidence JSON, source record IDs/URLs, parser/version metadata, and refresh timestamps. Define merge and deduplication rules so repeated filings/news produce one edge with combined evidence. Mark contradictory evidence as mixed rather than silently choosing a side. Provide separate confirmed and inferred edge styles and a reason/explanation for each edge.

### 6. Replace the fixture Graph screen

Replace hard-coded nodes, edges, chain text, and company routes in `app/(tabs)/graph.tsx` with a tRPC graph query. Add symbol/entity selection, hop-depth controls, loading, empty, stale, unavailable, and partial-evidence states. Preserve zoom and node interaction, but route entity nodes to the canonical Company Timeline and event nodes to evidence detail. Add a graph legend for confirmed, partial, and inferred relationships, plus a bottom-sheet detail view listing the relationship, hop path, confidence, score, timestamps, and original sources. Keep the existing premium navy/gold visual language and ensure the graph remains usable on narrow screens.

### 7. Validate and implement BSE and company-IR collectors

First validate candidate endpoints read-only. For each source, confirm whether it exposes a stable machine-readable RSS, JSON, XML, CSV, or downloadable document endpoint; confirm response schema, symbol/company identifiers, publication timestamps, rate limits, access terms, and whether authentication or anti-bot controls apply. Do not bypass CAPTCHA, WAF, robots, login, or access restrictions. If no stable machine-readable endpoint is validated, keep the source in a documented page-snapshot or unavailable state.

When validated, add source-specific branches to `server/source-ingestion.ts` following the existing NSE announcements and FII/DII pattern. Add dedicated parsers with strict schemas, stable external IDs, symbol/entity resolution, source-specific parser versions, raw payload hashes, normalized filing payloads, freshness/error states, and supersession handling. Add catalog descriptors and collector status entries for BSE announcements/actions/results and company-IR filings, but only enable a descriptor when its endpoint is verified. Keep generic HTML snapshots as a fallback, never as an equivalent to machine-readable filing evidence.

### 8. Connect filings to all consumers

Route normalized BSE and company-IR filings through the existing unified filing adapter. Project them into News only when a title, source URL, timestamp, and evidence status meet the minimum contract. Project validated filing events into Company Timeline, Storylines, Search, Smart Alerts, autonomous recommendations, graph edges, and authenticated Watchlist evidence. Preserve source lineage in every consumer and show unavailable/partial status when symbol resolution or payload validation fails. Add watchlist-specific material-change summaries without duplicating global event records.

### 9. Test strategy

Add deterministic schema and migration tests for ownership constraints, duplicate prevention, soft deletion, revocation, and local-to-server merge behavior. Add protected-route tests proving one user cannot read, update, revoke, or delete another user’s watchlist, alert, token, saved screen, or report metadata. Add push-delivery tests for enabled/revoked tokens and quiet hours. Add graph tests for direct edges, multi-hop depth limits, deduplication, contradiction handling, stale evidence, and no-fabrication gates. Add collector parser tests for valid, malformed, stale, superseded, symbol-unresolved, and non-machine-readable BSE/IR payloads. Add cross-feature tests proving one validated filing appears consistently in Filings, News, Search, Alerts, Company Timeline, Storylines, Graph, and Watchlist evidence.

### 10. Verification and release gates

Run additive migrations and inspect all generated SQL before applying them. Run TypeScript, lint, backend build, Expo export, full regression, focused ownership/graph/collector tests, provider probes, and visual QA for Account, Screener, Alerts, Research Workspace, Company Timeline, Storylines, Graph, and notification settings. Verify that anonymous users receive no protected data, authenticated users see only their own records, revocation takes effect immediately, and global source-backed intelligence remains available. Record any provider cooldowns or endpoint validation failures as truthful limitations. Native Android Local AI remains a separate environment-gated release item and is not reclassified by this work.

## Key assumptions

| Decision | Assumption |
|---|---|
| Authentication | Manus OAuth remains the sole account identity source and `users.id` is the ownership key. |
| Anonymous mode | Local watchlists/saved screens remain usable before login; server sync begins only after authentication. |
| Global intelligence | Entities, source records, observations, event projections, and autonomous recommendations remain shared, source-backed data. |
| Graph inference | Indirect edges are allowed only with explicit confidence/evidence labels and bounded hop depth. |
| Filing endpoints | No BSE or company-IR endpoint will be enabled until its machine-readable schema and access behavior are validated. |
| Notifications | User-specific push delivery requires authenticated ownership; revoked tokens are never selected. |
| Compatibility | Existing public market reads and current provider adapters are preserved unless a protected route is strictly user-specific. |

## Open risks

The principal risks are the shape and licensing of BSE/company-IR endpoints, migration behavior for existing device-local data, and the possibility that legacy public alert procedures are used by anonymous clients. The implementation must provide compatibility responses and visible authentication prompts rather than silently dropping data. Multi-hop graph quality will depend on entity resolution and filing completeness; low-confidence chains must remain clearly labeled and must not be presented as confirmed facts.


## Endpoint validation finding

The official BSE corporate-announcements page was inspected on 2026-08-18. It exposes interactive date/category/security filters and a loading results region, but the retrieved page did not reveal a stable public JSON/XML/CSV/RSS contract or documented machine-readable download endpoint. Therefore, BSE remains page-snapshot/unresolved for live structured collection; no collector should bypass the page’s access controls or infer a hidden endpoint. Company-IR sources remain company-specific and likewise require explicit endpoint validation before enabling a machine-readable collector.


## BSE validation update — 2026-08-18

The official [BSE Market Data Products](https://www.bseindia.com/marketdata-products) page states that BSE offers Corporate Data products, including Corporate Announcements, to data vendors, charting software vendors, websites, mobile app developers, and other customers. It provides business-enquiry and datafeed-operations contacts, and links to SEBI policies and a data-seeking request form. The page does not publish a free public JSON/CSV/RSS endpoint or an authorization token in the retrieved content. Therefore, AnalyzerX must not enable a live BSE collector from this page alone. The correct next state is a documented, authorization-gated adapter awaiting a BSE data subscription or an explicitly published machine-readable endpoint and schema.
