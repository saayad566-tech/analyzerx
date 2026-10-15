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
