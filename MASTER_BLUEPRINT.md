# MASTER_BLUEPRINT.md — architecture for this change

## A. Resource-pack architecture (split repos + chunk + runtime download)
Separation of concerns: **code repo** (`saayad566-tech/analyzerx`) vs **asset repo**
(`saayad566-tech/analyzerx-assets`).

    analyzerx-assets/
      manifests/
        index.json          <- the "main file": lists every market pack + versions + URLs
        IN.json             <- India pack manifest (chunk list + checksums)
        US.json
      packs/
        IN/000.bin 001.bin ...   <- chunked data (<= CHUNK_BYTES each)
        US/000.bin ...

App runtime flow (`lib/resource-packs`):
1. `fetchIndex()` reads `manifests/index.json` (the main file) over HTTPS (raw.githubusercontent).
2. `resolvePack(index, marketId)` picks the pack for the selected market. Exactly one market.
3. `planDownload(manifest)` produces the ordered chunk list to fetch.
4. `installPack()` downloads chunks with resume + retry/backoff, verifies each chunk's SHA-256 and
   the assembled pack's SHA-256, then **atomically activates** it (temp -> final). A partial or
   corrupt pack is never activated.
5. `readPackDataset(marketId, name)` returns verified data, or the bundled offline seed.

Pure core (`core.ts`) holds types, zod validation, chunk planning, integrity math and pack
resolution — no React Native imports, so it is unit-testable in plain Node.
Platform adapters: `transport.ts` (global fetch) and `fs.ts` (expo-file-system).

## B. Market dataset isolation
`lib/market-dataset.ts` is the single source of truth for demo/seed content per market.
It exposes `datasetForMarket(marketId)` returning `{ marketId, supported, events, storylines,
sectors, flows, notice }`. India and USA have real, distinct datasets. Markets without a verified
dataset return `supported: false` and **empty** collections plus an honest notice — never another
market's rows. `lib/market-data.ts` becomes the India dataset (kept for back-compat) re-exported
through the resolver.

Server: `market.institutionalFlows` and `graph.projection` gain a `marketId`; institutional flows
are returned only for `IN` (their real source), otherwise an explicit empty/unsupported result.

## C. Build tooling
`scripts/build-resource-pack.mjs` — deterministic chunker: reads a market data dir, splits each
file at N bytes, writes `packs/<MKT>/NNN.bin`, computes per-chunk and per-file SHA-256, and emits
`manifests/<MKT>.json` + refreshes `manifests/index.json`.

## Data flow (market selection)
market-context (persisted, synced) -> screens read `datasetForMarket(marketId)` + tRPC queries
carrying `marketId` -> server scopes to that market -> resource-pack installer ensures the market's
pack is present and verified.
