# CHECKLIST.md

## Phase 1 — Memory + audit
- [x] Read the full repo, CI workflow, market infra, existing tests
- [x] Identify the real cross-contamination defects (see PROJECT_SPEC)
- [x] Write the 7 memory files

## Phase 2 — Resource-pack core (pure, tested)
- [x] lib/resource-packs/types.ts (types + zod schemas)
- [x] lib/resource-packs/core.ts (validate, plan chunks, integrity, resolve pack)
- [x] lib/resource-packs/hash.ts (dependency-free SHA-256)
- [x] lib/resource-packs/bytes.ts
- [x] lib/resource-packs/registry.ts (remote repo config)

## Phase 3 — Resource-pack runtime
- [x] lib/resource-packs/transport.ts (fetch, timeout, retry/backoff, Retry-After)
- [x] lib/resource-packs/fs.ts (expo-file-system/legacy adapter)
- [x] lib/resource-packs/installer.ts (resume, integrity, atomic activation)
- [x] lib/resource-packs/index.ts (public API + local store)
- [x] lib/resource-packs/fallback.ts (bundled offline seed per market)

## Phase 4 — Market isolation
- [x] lib/market-dataset.ts (IN + US datasets, honest unsupported states)
- [x] lib/market-data.ts widened (FlowCategory, marketId on flows, SectorSummary)
- [x] app/(tabs)/index.tsx (Live) uses the market dataset
- [x] app/(tabs)/sectors.tsx uses the market dataset (opportunities moved into it)
- [x] app/(tabs)/flows.tsx market-scoped query + market seed fallback
- [x] app/(tabs)/screener.tsx market-scoped candidates, no IN fallback
- [x] app/(tabs)/graph.tsx passes marketId
- [x] server: market.institutionalFlows + graph.projection take marketId
- [x] server: event_projections.marketId column + write + scoped read

## Phase 5 — Tooling + assets repo
- [x] scripts/build-resource-pack.mjs + scripts/resource-pack-format.mjs
- [x] Built IN + US packs (22 chunks), published analyzerx-assets

## Phase 6 — Verify
- [x] tests/resource-packs.test.ts (22 tests)
- [x] tests/market-dataset-isolation.test.ts (12 tests)
- [x] `tsc --noEmit`: 0 errors
- [x] Regression: market-data 8, market-regions 4, market-isolation 32, sector-intelligence 4,
      archive-exports-market-cap 4, news-market-isolation-dedup 3, indian-news-relevance 10,
      regional-collectors 3 — all pass
- [x] Published assets verified byte-for-byte and re-parsed by the app runtime

## Phase 7 — Deliver
- [x] docs/RESOURCE_PACKS.md + assets-repo README
- [x] Committed to the analyzerx repository
- [x] Final self-audit

## Phase 8 — A-to-Z audit pass (session 2)
- [x] Lazy/placeholder scan across the whole app: 0 findings
- [x] Safe-area/layout scan across every screen: no defects
- [x] Error containment verified (ErrorBoundary wired in the root layout)
- [x] Hardcoded-secret scan: 0 findings
- [x] Fixed: session-token prefix logged in `lib/_core/auth.ts`
- [x] Fixed: user object (email/PII) logged in `lib/_core/auth.ts`
- [x] Fixed: broken "review in Diagnostics" promise — built `app/diagnostics.tsx` + Account entry
- [x] Added: plain-English activity log (`lib/activity-log-core.ts`, `lib/activity-log.ts`,
      `AI_RND_Activity_Log.txt`) wired into the ErrorBoundary
- [x] Tests: `tests/activity-log.test.ts` (15) + full regression (100 total)
- [x] `tsc --noEmit`: 0 errors

## Phase 9 — CI verification + lint gate (session 26)
- [x] Read CI runs directly (GitHub Actions API) — APK + bundle verification **green** on HEAD `1c7c6c8d`
- [x] K29 / K34 / K51 resolved against that evidence
- [x] `eslint .`: 6 errors → 0 (Node globals for scripts, Babel env-inliner refactor, MCP-SDK resolver scope)
- [x] `package.json` `main` corrected from `expo-router/entry` to `index.js`
- [x] Sectors "Updated 2m ago" replaced with the truthful market-scoped seed label
- [x] `tsc --noEmit`: 0 errors · `release:verify`: passes · full suite: 1,189 passed, 6 skipped, 0 failed
