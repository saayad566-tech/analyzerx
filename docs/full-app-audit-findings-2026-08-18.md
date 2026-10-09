# AnalyzerX Full Application Audit Findings — 2026-08-18

## Review scope

The workspace contains 20 application routes, 34 server modules outside framework internals, 6 database migrations, 54 test files, native Local AI plugins, Android smoke scripts, report-generation scripts, source/provenance collectors, provider health modules, and 36 public/protected tRPC procedure references. This is an initial evidence record; the final audit will add workflow, security, performance, and release conclusions.

## Initial route inventory

The application includes Live Events, Alerts, Assistant, Market Flows, Relationship Graph, Screener, Sectors, Storylines, Account, Admin, Appearance, Company Detail, History, Local AI, Local AI Telemetry, Market Chat, Research Workspace, Support, OAuth callback, and theme-lab routes. The bottom navigation currently exposes the core market surfaces; Account/History/Support are routed screens rather than all being bottom tabs.

## Initial backend findings

The server has explicit public and admin procedure boundaries. Provider health, source ingestion, and NSE collector operations are admin-gated, while many market reads, chat, fundamentals, reports, derivatives, Smart Event Alerts discovery/history, and source catalog reads are public. This may be intentional for a research demo, but the final audit must verify whether public report generation, Smart Alert persistence, push-token registration, and history access can expose user-specific or costly data.

The router validates symbols with bounded alphanumeric/dot/hyphen schemas and bounds most list/report inputs. It uses `Promise.allSettled` for several provider fan-outs, preserving successful providers when others fail. Direct fetches use explicit timeouts in the inspected routes. Potential follow-up review areas are public `chat.ask`/`chat.ground`, public `smartAlerts.discover`/`history`, public `news.registerPushToken`, public report generation, and any external URL/file fetch that accepts user-controlled input.

## Source and native boundaries observed

The source catalog and adapters include official NSE/BSE/SEBI/NSDL/AMFI boundaries and public SEC/FRED/ECB/World Bank/CoinGecko/OpenFIGI/GDELT coverage. Existing project evidence records Indian API HTTP 429, TinyFish HTTP 403, and GNews HTTP 403 as cooldown/provider states rather than successful data. The latest test suite treats documented provider cooldown responses as explicit tolerated states while still failing transport/server failures.

Android Local AI remains a release gate requiring authenticated EAS, Android SDK/NDK/CMake, adb, and a connected arm64 device. The presence of Kotlin bridge files and smoke scripts does not constitute successful native inference.

## Current verification evidence

The latest completed checkpoint reported TypeScript, lint, production build, 184 passing tests, 2 skipped, and mobile visual QA for History and Alerts. The full audit must rerun these checks after any applied fixes and capture exact results. The dev log has repeated `.expo/types/router.d.ts` ENOENT messages despite TypeScript passing; this should be verified as tooling noise or repaired before release.

## Review principles

Do not fabricate live values, bypass CAPTCHA/WAF/robots/authentication, or mark unvalidated dynamic pages as machine-readable evidence. Preserve the legacy Institutional Five-Pillar Score as the primary score and keep the Multibagger Thesis secondary. Classify every finding as confirmed, probable, environment-gated, provider-gated, or not reproducible.

## Visual QA checkpoint

The representative mobile capture rendered Live Events, Market Flows, Multibagger/Screener, Smart Alerts, Assistant, Local AI, Appearance, and History without a web-preview crash. The visual system is coherent: dark navy surfaces, gold accents, compact cards, visible tab navigation, and readable loading/unavailable states.

The screens correctly disclose unavailable data rather than displaying fabricated values. Market Flows shows an unavailable aggregate report and no verified stock-level flow signals; Local AI shows that the native bridge is not included in the web build and that no downloaded model is available; Assistant states that current-news answers require verified connected evidence; Live Events shows provider-checking/no-news states. These are truthful, but they also confirm that a default fresh session can appear data-sparse when providers are unavailable.

The mobile capture surfaced no obvious dead-end or clipped control in these routes. Follow-up interaction audit must still validate taps, filter state changes, search response, navigation parameters, and report/export actions because screenshots alone cannot prove behavior. The History screen currently displays many local activity entries and is scrollable; ownership and retention behavior require code-level verification.

Recent dev logs additionally show repeated `.expo/types/router.d.ts` ENOENT, deprecated `pointerEvents` prop warnings, and LLM extraction cooldown after a usage-exhausted response. These are categorized as release-quality issues rather than evidence of a data-source failure.

## Baseline verification and applied safe fixes

The baseline deterministic checks passed: TypeScript had zero errors, the server bundle built successfully, the full Vitest suite passed with 184 tests and 2 skipped, and Expo web export completed with 30 static routes. Lint had zero errors and one fixable `Array<T>` style warning in `app/history.tsx`; that warning was corrected without changing behavior.

The web build script previously deleted `.expo` while the managed dev server was running. This created the repeated `.expo/types/router.d.ts` ENOENT condition. The script was changed to remove only the CSS interop cache and `web-dist`, then the managed services were restarted. After restart, `.expo/types/router.d.ts` is present and the latest runtime log shows Metro startup without a new ENOENT. A stale earlier error remains in the historical log, so release monitoring should confirm it does not recur during future builds.

An explicit `eas.json` was added with development, preview, and production profiles. This improves repeatability but does not authenticate EAS or prove an Android build. The global smoke workflow passed for AAPL, SAP.DE, and 7203.T, returning source-aware fundamental summaries and warnings rather than fabricated blanks. It confirms global fallback coverage but also shows that non-Indian symbols may rely on Yahoo/profile/sector derivation when primary metrics are absent.

The project environment policy prevented direct creation of `.env.example`; the environment template should therefore remain documented through the project’s managed secret/configuration interface rather than by writing a secret-bearing file.

## Native Local AI and release-gate results

Expo prebuild completed successfully and generated valid native projects. The Android Local AI verification script passed static plugin/Kotlin/Gradle/ABI checks but exited with a blocked status because Android SDK configuration and the connected arm64 device gates are unavailable. The llama.cpp build gate also exited blocked: `ANDROID_NDK_HOME/ANDROID_NDK_ROOT` is unset, CMake is not installed, and the pinned source tree is absent. No native `.so` library or real-device inference is claimed.

## Confirmed risks and release findings

| Severity | Finding | Status | Required action |
|---|---|---|---|
| Critical | No evidence of successful arm64 Gemma/LiteRT-LM or llama.cpp inference in this environment | Environment-gated | Run the smoke script on an authenticated EAS/SDK-equipped machine with a real arm64 device; retain logs and model checksums |
| High | Several data and alert read/write operations are public procedures, including chat, Smart Alert persistence through discovery, report generation, and push-token registration | Confirmed design risk; exploitability depends on deployment/auth policy | Decide whether the deployed product is anonymous-read by design. If not, move user-specific history, push-token management, alert preferences, and report quotas to protected procedures with ownership fields |
| High | Indian API, TinyFish, and GNews are not currently healthy live sources in the observed environment (429/403 cooldown states); NewsData returned 422 during preview activity | Provider-gated | Keep circuit breakers and fallback states; remediate credentials/provider requests independently and do not treat cooldown as live coverage |
| High | The project cannot truthfully guarantee 24x7/real-time worldwide news or exchange options coverage using the currently available free/public sources | Product/coverage boundary | Present freshness and coverage status in the UI; use an always-on hosted collector only when its hosting and provider terms are accepted |
| Medium | LLM extraction logs show usage-exhausted cooldown; deterministic extraction fallback is active | Account/provider-gated and handled | Keep the 15-minute cooldown and deterministic fallback; monitor fallback rate and avoid implying local LLM inference when unavailable |
| Medium | Public push-token table has no user ownership or revocation relationship | Confirmed schema limitation | Add authenticated ownership and token disable/delete flows before enabling account-scoped notification management |
| Medium | Dev logs contain deprecated `pointerEvents` warnings from a dependency or generated layer | Non-blocking warning; source usage not found | Recheck after dependency upgrades; do not alter unrelated code based on a warning with no local source match |
| Low | ESLint emitted a Node `MODULE_TYPELESS_PACKAGE_JSON` warning for `eslint.config.js` | Non-blocking tooling warning | Add an explicit module-type decision only if it is compatible with the existing package/toolchain |
| Low | Browserslist data is stale during web export | Non-blocking build warning | Update the database in a maintenance change, then rerun export |

## Security review conclusion

The inspected router uses bounded Zod schemas for symbols, queries, attachments, list limits, and provider actions. Admin-only provider-health, source-ingestion, and NSE-collector operations are present. No hardcoded provider API keys were found in the inspected client files. The main security gap is not an observed injection vulnerability; it is the mismatch between public procedures and user-specific persistence/notification concepts. The schema lacks user IDs for push tokens and smart-alert results, so account-level isolation cannot be enforced for those records. This is a release hardening item, not a claim that current anonymous-read behavior is automatically exploitable.

External source fetches use fixed or catalog-controlled URLs in the inspected adapters. Any future user-supplied URL ingestion must remain allowlisted and must not become a general server-side fetch endpoint. Report/source links should continue to be displayed as evidence links and opened with safe external-link handling.

## Performance and resilience conclusion

The codebase already uses bounded input sizes, explicit timeouts in inspected fetch paths, `Promise.allSettled` provider fan-out in market/search routes, provider cooldowns, and deterministic fallbacks. The audit did not establish production p50/p95 values because representative traffic and an instrumented deployment were not available. A future release should measure provider latency and complete-query latency separately, add in-flight deduplication where absent, and cap refresh concurrency. The mobile screens are visually compact and responsive in the captured 390x844 viewport; interaction and device performance still require physical-device validation.

## Final verification

After the safe fixes, TypeScript passed with zero errors, lint passed with zero errors, the server bundle built successfully, the full suite passed with 184 tests and 2 skipped, and Expo web export passed with 30 static routes. The global smoke workflow passed for AAPL, SAP.DE, and 7203.T. Android prebuild passed. Native Local AI and llama.cpp gates remained blocked for the explicit environment reasons above. Provider probes remain truthful: Finnhub and several configured providers accepted their credentials; Indian API, TinyFish, and GNews returned documented cooldown states rather than being reported as healthy live sources.

## Release decision

**Web preview and backend: release-candidate conditionally ready.** Core routes, provider isolation, truthful unavailable states, primary/secondary scoring labels, reports, alerts, history, and theme surfaces are present and regression-tested. **Android Local AI: not release-verified.** Do not publish an APK as if native inference were proven until the arm64/EAS gate passes. **Account-scoped notifications and persistent user data: hardening required** if the product is intended for authenticated multi-user production rather than anonymous research use.

## Safe changes applied in this audit

The audit corrected the History `Array<T>` lint warning, changed `build:web` so it no longer explicitly deletes `.expo` while the dev server is running, restarted the managed services to regenerate router metadata, and added explicit `eas.json` development/preview/production profiles. No provider source, credential, scoring formula, report data semantics, or database rows were replaced or deleted.

## Central data-layer extension in progress

The first vertical slice of the approved extension is now implemented. A typed `data-capability-registry` defines dataset scope, cadence, access mode, parser/freshness/confidence policy, stored record type, intelligence consumers, UI screens, route/query, status, and limitations. It also provides a canonical lineage mapper for source records and a required imported/stored/intelligence/UI capability matrix.

The registry is exposed through read-only `capabilities.list` and `capabilities.matrix` queries. The Admin operations screen now renders the matrix alongside collector/provider telemetry, making it visible when a dataset is mapped to UI and when it is blocked/partial. Deterministic registry tests pass, TypeScript passes, and the Admin route rendered in the mobile visual check. The unauthenticated preview correctly shows loading/operations access states because admin telemetry is protected; the capability matrix remains part of the same screen and must be checked with an authenticated admin session for populated rows.

## Central data layer vertical-slice verification

Implemented the first approved vertical slice of the central data-layer extension. The typed capability registry now maps canonical datasets to storage, intelligence consumers, UI screens, route/query contracts, freshness SLAs, confidence policy, access mode, parser version, status, and limitations. A canonical lineage mapper preserves source ID/name/URL, original document, publication/detection/ingestion/data/retrieval times, freshness, confidence, parser version, hash, evidence kind, and evidence status.

Added read-only `capabilities.list` and `capabilities.matrix` queries. The Admin operations dashboard now displays the capability matrix beside collector and provider operations, making the imported/stored/intelligence/UI mapping visible. Added symbol-scoped source-record access and a unified filings query with official filing entry links. Added a source-backed `market.profile` aggregation that runs the existing market snapshot, fundamental analysis, news, filings, and derivatives paths in parallel with isolated error results. The Company Detail screen now shows a live evidence summary with verified/unavailable state, latest quote when available, news count, filing count, freshness timestamp, and no-demo-value messaging.

Verification after implementation: TypeScript passed; Expo lint passed; production backend build passed; full regression passed with 53 test files, 187 tests passed, and 2 skipped; focused capability/source/admin tests passed with 9 tests. Expo web export completed with the Company route included. Visual QA confirmed the Admin route renders the new capability-matrix section and the managed development server remains healthy. The existing log still contains a non-fatal NewsTracker notice that built-in LLM extraction is temporarily disabled due to account usage exhaustion; deterministic extraction fallback remains active. This limitation does not alter provider/source truthfulness or crash the app.

The required dataset capability matrix is saved separately at `docs/data-capability-matrix-2026-08-18.md`. Remaining plan items are intentionally not marked complete: entity master persistence, durable normalized observation tables, broader validated filing adapters, full cross-feature post-ingestion projections, unified News/Filings UI, authenticated watchlist ownership, and real provider-dependent coverage.


## Autonomous event-driven recommendation vertical slice

Implemented an additive autonomous recommendation engine that runs independently of user-created monitoring rules. It consumes the existing tracked-news and official-record boundaries, reuses the live Smart Event extraction path, deduplicates equivalent event chains, and persists user-independent recommendations in `autonomous_recommendations` with lifecycle timestamps, score-version metadata, evidence JSON, and idempotent notification state.

The engine separates Impact Score from Evidence Confidence, exposes factor-level explanations, applies freshness and contradiction gates, and labels beneficiary, negative-impact, or mixed-uncertain directions. It does not promote events without usable evidence and does not fabricate a replacement symbol when source resolution fails. The existing NewsTracker invokes a bounded autonomous evaluation after ingestion through a dynamic import, preserving the existing scheduler and provider isolation. Newly active recommendations use the existing owner-notification boundary and are de-duplicated through `lastNotifiedAt`.

Alerts is now autonomous-first while preserving the custom natural-language monitoring templates and their status history. Recommendation cards expose impact, confidence, relationship, evidence count, timestamp, and an evidence-detail route. The new recommendation detail screen presents the score factors, relationship chain, source lineage, original URLs, and a full-company-analysis action. Visual QA confirmed the Alerts layout and truthful unavailable/loading behavior on mobile web. The placeholder detail route correctly shows an unavailable/loading state when no persisted record exists.

Verification: TypeScript passed; lint passed; production server build passed; Expo web export passed with 31 routes, including `/recommendation/[id]`; the full suite passed with 54 test files, 191 tests passed, and 2 skipped; focused autonomous, live Smart Alerts, and Smart Event tests passed 12/12. Provider cooldowns remain isolated: NewsData 422, GNews 403, and MarketAux 402 were recorded without blocking the build. The embedded LLM extraction path remains in deterministic fallback during its documented usage-exhausted cooldown and does not affect autonomous source-backed scoring.

Remaining scope: indirect relationship resolution beyond the existing direct customer/supplier chain and recommendation-aware Relationship Graph rendering remain intentionally open for the next slice. The current recommendation route and persisted schema are designed to support those additions without replacing existing providers or event history.

## Durable data layer and filing-unification extension

Implemented an additive durable entity master with exact alias resolution and explicit unresolved states. Added normalized market observations and fundamental observations with source keys, source URLs, timestamps, freshness, confidence, derivation status, and hashes. Existing provider adapters remain unchanged; profile reads now asynchronously persist only numeric provider-backed observations.

Added durable event projections for tracked news and validated official source records. Projections contain entity/symbol links, deterministic storyline keys, event type, sentiment, impact score, confidence score, lifecycle status, source lineage, evidence JSON, and parser version. The existing NewsTracker now evaluates projections after the autonomous recommendation cycle, without adding a second scheduler.

Replaced fixture-backed Storylines and Company Timeline event reads with persisted projection queries. Empty states are truthful when no verified events have been projected. Research Workspace watchlist chips now show persisted event counts through a bounded evidence query. Unified search returns matching persisted event projections alongside provider search results.

Added validated filing normalization with explicit NSE, BSE, and company-investor-relations entry points. Official filing records preserve title, symbol, filing type, source key, source URL, publication/report dates, retrieval timestamp, freshness, parser version, evidence state, summary, and raw normalized payload. Company profiles and Filings now use symbol-filtered unified filings; Smart Alerts and event projections continue to consume the same official source-record boundary.

Verification: TypeScript passed, production build passed, web export passed with 31 routes, full regression passed with 195 tests and 2 skipped, focused data-layer tests passed with 21 tests, and mobile visual QA passed for Storylines, Company Timeline, and Research Workspace. The visual screens correctly show truthful empty/loading states in the absence of persisted verified source events. Known non-blocking runtime condition: built-in LLM extraction remains temporarily disabled by an account usage-exhausted response, with deterministic extraction fallback active; this does not block projection persistence or provider isolation.


## Ownership, multi-hop graph, and filing collector extension — 2026-08-18

AnalyzerX now includes additive user-owned tables for watchlist items, saved screens, alert rules/results, notification preferences, push tokens, and saved research. Protected tRPC procedures scope reads and writes by authenticated user ID, and revocation is represented with disabled or revoked timestamps rather than destructive deletion. Native push registration now waits for authenticated account state and uses the protected token-upsert boundary. Research Workspace consumes server-owned watchlists and saved screens when authenticated while retaining local guest data separately.

The Relationship Graph now consumes persisted event projections through a bounded one- or two-hop projection query. Nodes and edges preserve source URLs, confidence, evidence status, hop count, and explicit inferred labeling. A direct local tRPC probe returned source-backed nodes successfully. The visual preview also showed a truthful unavailable state during one client refresh, so the UI does not fabricate graph content when the query is temporarily unavailable.

Filing adapters now expose strict machine-readable validation and preserve existing NSE, BSE, and company-IR normalization boundaries. The official BSE announcements page was inspected as an interactive page; no stable public machine-readable contract was visible in the retrieved response, so no hidden endpoint or access-control bypass was introduced. Company-IR records require an explicit issuer URL, structured payload, and valid publication/report date before receiving verified status. Unresolved page snapshots remain partial rather than verified machine-readable evidence.

Verification passed TypeScript, lint, production server build, Expo web export with 31 routes, focused ownership/graph/filing tests, and the complete suite: 198 passed, 2 skipped. Existing external provider cooldown states remain isolated, including GNews HTTP 403, MarketAux HTTP 402, NewsData HTTP 422, and exhausted hosted-LLM fallback to deterministic extraction.


## BSE validation, ownership sync, and graph evidence clustering — 2026-08-18

The official BSE Market Data Products page was validated as an authorization and product-information page. It describes Corporate Data products and lists BSE business/datafeed contacts plus SEBI data-sharing references, but it does not publish a free public machine-readable endpoint, schema, or token in the retrieved content. AnalyzerX therefore keeps the BSE collector disabled and authorization-gated rather than guessing an internal endpoint or bypassing controls.

A one-time authenticated WorkspaceSync component now migrates local watchlist symbols, saved screens, notification preferences, and legacy local alert toggles into protected account procedures. The migration is idempotent per authenticated user session, keeps guest local data separate, and treats server rejection as a recoverable sync failure rather than deleting local data.

Relationship Graph projections now cluster edges by source-backed relationship key, retain source counts and URLs, and mark mixed positive/negative or conflicting-source evidence. The Graph UI shows source count and contradiction overlays while preserving bounded one/two-hop traversal and truthful unavailable/empty states. Direct endpoint probing returned source-backed graph data even though one visual refresh rendered the unavailable state during client refresh; no fabricated graph content is shown.

Focused tests passed 9/9. Full verification passed TypeScript, lint, production build, 31-route Expo web export, and 199 tests with 2 skipped. External provider cooldowns remain isolated: GNews HTTP 403, MarketAux HTTP 402, NewsData HTTP 422, and hosted-LLM usage exhaustion with deterministic fallback.


## BSE gating, Account sync controls, and Graph filters — 2026-08-18

The BSE adapter remains authorization-gated. No endpoint, schema, or credentials were supplied after the previous validation, so enabling live collection would violate the platform’s evidence policy. The official BSE product page remains recorded as the correct route for obtaining an authorized feed.

Account now exposes authenticated workspace sync state, last-success metadata, failure messaging, retry control, conflict counts, and Local/Server/Merge resolution actions. WorkspaceSync persists lifecycle state locally and retries idempotently per account. Guest users continue to see local-only mode and are not prompted with server conflict controls.

Relationship Graph now provides contradiction filtering (All or Only conflicts) and minimum-source filtering (1+ or 2+), alongside the existing one/two-hop traversal. Visual QA at 390x844 confirmed that the filter controls are visible and readable and that the Account guest state remains coherent. The Graph unavailable state remains truthful when the client query is temporarily unavailable.

Final verification passed TypeScript, lint with only the existing Node module-type warning, production build, focused tests 7/7, and the full suite: 200 passed, 2 skipped. Provider cooldowns remain isolated and documented.


## Sector constituent drill-down and sortable stock intelligence — 2026-08-18

Sector cards now navigate to a dedicated `/sector/[name]` detail route. The route aggregates the accepted AnalyzerX verified research universe, per-symbol Indian quote data and fundamental reports in parallel, and aggregate NSE FII/FPI and DII context. It displays per-stock score, verdict, confidence, price, daily change, market cap, P/E, ROE, revenue growth, free cash flow, freshness, source coverage, and direct Company navigation.

The detail view supports Score, FII high-to-low, DII high-to-low, market-cap, daily-change, and P/E sorting with ascending/descending toggles. Because the connected NSE institutional report is aggregate-only, stock-level FII/DII values remain null and are explicitly labeled unavailable; no per-stock buying or selling is inferred. The API and UI also disclose that the displayed list is the verified AnalyzerX research universe rather than a claim of complete exchange-wide sector membership.

The Sectors screen now opens the detail route instead of only changing the radar ranking. Visual QA confirmed the new route, sorting controls, loading state, and limitation messaging. TypeScript and focused sector tests passed. Full verification passed lint, production build, 32-route Expo web export, and 202 tests with 2 skipped. The full unfiltered suite had one unrelated Telegram provider timeout; an isolated rerun excluding that external probe passed.
