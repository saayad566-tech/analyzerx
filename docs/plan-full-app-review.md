# AnalyzerX Full Application Review Plan

## Goal

Perform an exhaustive, evidence-based review of the complete AnalyzerX application as it exists in the workspace. The review will trace every major screen, button, navigation path, server route, data provider, persistence boundary, AI mode, report export, alert workflow, and native integration. It will distinguish verified working behavior from degraded, unavailable, credential-gated, device-gated, or unverified behavior. The review will produce an audit report, a prioritized defect list, applied safe fixes where defects are confirmed, and a release-readiness decision.

The review will **not** claim that every provider is live or that Android Local AI works on hardware unless a real test proves it. It will preserve the existing Institutional Five-Pillar Score as the primary score and keep the Multibagger Thesis secondary.

## Scope and review dimensions

| Dimension | Review coverage | Evidence to collect |
|---|---|---|
| Product flows | Onboarding/auth, Live Events, news search/detail, Storylines, Timeline, Graph, Sectors, Flows, Screener, Analysis, Reports/PDF, Alerts, Assistant, Local AI, Appearance, Account, Support, History | Route matrix, button/action inventory, navigation screenshots, dead-end findings |
| Data and providers | NSE/BSE/SEBI/NSDL/AMFI, Finnhub, Indian API, GNews, NewsData, MarketAux, Google News RSS, public SEC/FRED/ECB/World Bank/CoinGecko/OpenFIGI/GDELT, broker/derivatives boundaries | Capability matrix, source provenance, freshness, schema, cooldown, licensing/access notes, smoke-probe results |
| Backend | tRPC routes, validation, auth boundaries, database tables/migrations, scheduler/collector lifecycle, source-record persistence, alert history, notification delivery | Route inventory, auth isolation tests, migration review, error/timeout analysis |
| AI | Connected/Local/Auto routing, grounded context, selected model behavior, multimodal attachments, model catalog, LiteRT-LM/JNI boundary, telemetry, fallback behavior | Prompt/route tests, model-status report, native gate evidence, hallucination/grounding checks |
| Reports | Institutional primary score, secondary Multibagger Thesis, filing evidence, charts, PDF layout, batch exports, source disclosures | Markdown/PDF text checks, page rendering, score-label assertions, report integrity checks |
| Quality | TypeScript, lint, unit/regression, build/export, responsive visual QA, accessibility and interaction feedback | Command results, test counts, visual findings, performance measurements |
| Security and privacy | Secrets, auth/session, user-data isolation, provider URLs, SSRF/open redirects, input validation, file/upload handling, notification destinations, local storage | Static scan findings, route-level auth checks, red-team cases, severity classification |
| Performance | First usable data, query latency, cache behavior, provider fan-out, list rendering, refresh/polling, memory and error loops | p50/p95 route/provider timings, cache hit rates, render/list observations, bottleneck ranking |

## Phase 1 — Workspace and architecture inventory

Read the project structure, package scripts, Expo configuration, router layout, provider/context wiring, server entry points, database schema, migration history, source catalog, provider registry, scheduler/collector modules, report generator, native bridge/plugin, and existing audit reports. Build a dependency map from screen to tRPC route to server adapter to source record/database result to rendered state.

Check for duplicate implementations, dead code, unhandled asynchronous operations, unsafe casts, unstable React keys, route paths that do not exist, stale imports, missing error boundaries, and platform-specific code executed on web or native incorrectly. Verify every provider and context is mounted before its hooks are used.

## Phase 2 — Screen, navigation, and interaction audit

Enumerate every Expo route and every bottom-tab destination. For each screen, inspect loading, empty, stale, error, unauthorized, offline, and success states. Trace every `Pressable`, `TouchableOpacity`, link, form submission, switch, filter, picker, tab, back action, export action, and deep link.

Use responsive visual QA on mobile and desktop-sized viewports. Verify safe areas, bottom-tab overlap, keyboard behavior, scrolling, text clipping, contrast, theme switching, disabled/loading feedback, and whether long lists use `FlatList` or another virtualized strategy. Check that History, Alerts, Account, Assistant, Local AI, and Support are discoverable and that no route relies on a hidden or invalid path.

Record a route/action matrix with columns for entry point, action, expected destination/state, actual result, data dependency, and severity if broken.

## Phase 3 — Data-source and provider audit

Construct a capability matrix for every source. For each provider, verify the adapter’s request builder, authentication method, timeout, retry/backoff, circuit breaker, cooldown, response schema, normalization, source label, freshness calculation, error mapping, and fallback priority. Confirm one failing provider cannot erase valid results from other providers.

Run non-mutating smoke probes only. Treat HTTP 401/403/402/429, CAPTCHA, WAF, transport errors, dynamic-only pages, and missing schemas as explicit provider states. Do not bypass controls or infer hidden endpoints. Validate source precedence and ensure the UI never displays fixture numbers as live evidence.

Trace data end to end for representative entities: one Indian large-cap, one Indian small-cap, one global equity, one crypto asset, one FX/commodity instrument, and one symbol with incomplete data. Verify prices/OHLC, fundamentals, cash flow, derivatives, news, filings, FII/DII, mutual-fund, sector, relationship, and report fields all preserve provenance and stale/unavailable semantics.

## Phase 4 — Workflow and domain-logic verification

Test the following workflows as independent end-to-end paths: progressive symbol search; fundamental analysis; legacy five-pillar scoring; secondary Multibagger Thesis; options/derivatives; Market Flows date switching and comparisons; Sector Opportunity Radar; news refresh/filter/detail/source link; Storylines and Timeline; Relationship Graph navigation; Smart Event Alerts natural-language rules, historical windows, event-chain scoring, eligible-stock status, history persistence, deduplication, and notification boundaries; report generation/export; Assistant grounding and action routing; Local AI model selection and Auto/Local/Connected fallback; theme changes; and History filters/clear behavior.

For each workflow, verify calculations with deterministic fixtures and source-aware live probes. Verify primary/secondary score labels, no blank blocking scorecards, no fabricated financial metrics, exact route parameters, stable alert rule IDs, deduplicated events, and correct status transitions.

## Phase 5 — Backend, persistence, and security review

Review all public and protected tRPC procedures, Zod input schemas, error handling, database queries, joins, indexes, migrations, ownership checks, and no-database fallbacks. Test that one authenticated user cannot read or mutate another user’s history, alert settings, notification state, reports, or uploaded files. Verify local-only fallback behavior is clearly disclosed.

Inspect secrets for accidental exposure in source, logs, URLs, generated files, client bundles, and error messages. Check redirects, source URLs, external links, webhook/channel configuration, user-supplied symbols and natural-language rules, file MIME/size validation, SQL/command injection surfaces, SSRF risks in fetch adapters, CORS, rate limiting, and notification replay/idempotency.

Classify findings as Critical, High, Medium, Low, or Informational. Apply only safe, local fixes that do not alter provider contracts or data semantics without tests. For larger changes, create a patch proposal instead of silently changing behavior.

## Phase 6 — AI, native, and report review

For the Assistant, verify grounded context is required for current-market/current-news questions, Local mode is blocked when its runtime is unavailable, attachment capabilities match the selected model, and deterministic fallback responses do not imply unsupported live evidence. Run text, screenshot, and audio route tests where supported.

For Local AI, inspect checksum and artifact gating, model registry, model selection persistence, unload-before-load behavior, telemetry retention/export/encryption, Expo plugin output, Kotlin imports/dependencies, ABI configuration, and the `verify_android_local_ai.mjs` workflow. Run Android prebuild and EAS readiness checks. If the environment lacks authentication, Android SDK/NDK, adb, CMake, or an arm64 device, document the exact gate and do not claim native inference success.

For reports, generate individual reports for representative stocks and inspect Markdown/PDF output. Verify the legacy Institutional Five-Pillar Score is primary, the Multibagger Thesis is secondary, filing evidence has source/status labels, charts render, pagination is coherent, links are safe, and unavailable evidence is disclosed.

## Phase 7 — Performance and resilience review

Measure first usable data and complete refresh separately. Add or inspect timings for query start/end, provider latency, cache hit/miss, render duration, list size, and error/cooldown state. Use p50 and p95 values rather than an unsupported fixed “real-time” claim.

Stress search typing, filter switching, Alerts refresh, news refresh, History scrolling, report generation, provider fan-out, and repeated screen navigation. Look for request storms, duplicate in-flight calls, stale closures, unbounded arrays, excessive polling, unnecessary full analysis recomputation, UI thread blocking, and memory growth. Verify bounded concurrency, cache/in-flight deduplication, pagination, FlatList rendering, stale-while-refresh behavior, and provider deadline isolation where already implemented.

## Phase 8 — Automated and visual verification

Run TypeScript, lint, backend build, production build, Expo web export, focused unit suites, full regression, database migration checks, public-provider smoke probes, Android prebuild, and the native verification script. Capture exact exit codes and test counts.

Run visual QA for every major route at mobile and desktop widths, with light/dark/system/custom themes where applicable. Verify screenshots for the most important success, loading, empty, stale, error, and unavailable states. Check accessibility labels, contrast, focus/keyboard behavior, and touch target sizes.

## Deliverables

The review will produce an audit report grouped by Critical Bugs, Logic/Data Errors, Security Risks, Performance Risks, UX/Accessibility Issues, Missing Integrations, and Release Gates. It will include a route/action matrix, provider capability matrix, score/source truthfulness audit, native Local AI readiness report, test/build evidence, and a prioritized remediation backlog.

Confirmed safe defects will be patched and re-tested. Findings blocked by credentials, protected sources, missing hardware, or unavailable schemas will be documented with exact reproduction evidence and a concrete next action. A reviewable checkpoint will be saved only after the final verification pass.

## Assumptions and open risks

The review assumes the current workspace and its existing database are the source of truth. It will not replace configured providers, bypass provider access controls, introduce unlicensed scraping, or claim universal worldwide coverage where free sources are delayed or incomplete. Real Android inference remains hardware-dependent. Notification channels beyond configured in-app/device delivery require provider credentials and acceptance responses. Full p50/p95 performance targets require representative runtime traffic; static code review alone cannot prove production latency.
