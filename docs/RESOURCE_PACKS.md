# Resource packs: separate repos, chunking, and runtime download

This document describes the architecture added to AnalyzerX so that market data lives in a
**separate repository**, is split into **size-bounded chunks**, and is fetched **at runtime through a
single main file** — with strict market isolation.

## Why

- The application repository must stay light; large market datasets should not bloat it.
- GitHub rejects single files above 100 MB (and the web uploader caps at 25 MB), so large assets must
  be chunked.
- The app must only ever load the **selected** market's data. Selecting the United States must never
  show Indian content, and vice versa.

## Repositories

| Repository | Contents |
|---|---|
| `saayad566-tech/analyzerx` | application code only |
| `saayad566-tech/analyzerx-assets` | `manifests/`, chunked `packs/`, auditable `source/`, `SHA256SUMS` |

## The main file and manifests

`manifests/index.json` is the **main file**. It lists, for every market, the pack version, the path
to that market's manifest, the total size, and the dataset names.

`manifests/<MARKET>.json` is a per-market manifest:

```jsonc
{
  "schemaVersion": 1,
  "marketId": "IN",
  "packVersion": "2026.10.15",
  "generatedAt": "...",
  "chunkBytes": 1024,
  "datasets": [
    { "name": "events", "bytes": 3940, "sha256": "…", "encoding": "json",
      "chunks": [ { "index": 0, "file": "packs/IN/events.000.bin", "bytes": 1024, "sha256": "…" }, … ] }
  ],
  "totalBytes": 9701,
  "sha256": "…"   // digest over the canonical manifest body
}
```

## Runtime flow

`lib/resource-packs/installer.ts`:

1. Fetch `manifests/index.json` and validate it (`zod`).
2. Resolve the entry for the **selected market only** — a missing market resolves to `null`, never to
   another market (`resolvePackEntry`).
3. Fetch that market's manifest, then `assertMarketScope` and verify the manifest's self-digest.
4. Download only the chunks whose digest does not already match locally (**resume**).
5. Verify every chunk, then every assembled dataset.
6. **Atomically activate**: chunks are written to `<pack>.partial/` and only renamed to the final
   directory after full verification. A partial or corrupt pack is never readable.

Failures are typed and honest: `unsupported` (no pack published / no writable storage),
`failed` (with the reason), `installed`, `up-to-date`.

## Modules

| File | Responsibility |
|---|---|
| `lib/resource-packs/types.ts` | contract + zod schemas |
| `lib/resource-packs/core.ts` | pure logic: validate, resolve, plan, verify, assemble |
| `lib/resource-packs/hash.ts` | dependency-free SHA-256 (identical on device and in the build tool) |
| `lib/resource-packs/bytes.ts` | base64 / utf8 helpers |
| `lib/resource-packs/registry.ts` | where the assets repository lives |
| `lib/resource-packs/transport.ts` | fetch with timeout, retry/backoff, `Retry-After` |
| `lib/resource-packs/fs.ts` | `expo-file-system/legacy` adapter |
| `lib/resource-packs/installer.ts` | orchestration, resume, atomic activation |
| `lib/resource-packs/fallback.ts` | bundled offline seed per market |
| `lib/resource-packs/index.ts` | public API |
| `scripts/build-resource-pack.mjs` | deterministic chunker + manifest generator |
| `scripts/resource-pack-format.mjs` | canonical byte format shared with `core.ts` |

## Building packs

```bash
node scripts/build-resource-pack.mjs --src resource-packs-src --out .assets-dist --version 2026.10.15
```

The build is deterministic; identical inputs produce byte-identical output. The format module and
`lib/resource-packs/core.ts` must agree byte-for-byte on `canonicalManifestBody`, or every pack would
look corrupt — this is covered by tests.

## Market isolation

- `lib/market-dataset.ts` is the single source of truth for per-market content. A market with no
  curated dataset returns `supported: false` with **empty** collections and a notice — never another
  market's rows.
- Live Events, Sectors, Market Flows and the Screener read from the selected market's dataset.
- `market.institutionalFlows` and `graph.projection` take a `marketId`; NSE participant flows are
  returned only for `IN`, and `event_projections.marketId` scopes the relationship graph.

## Verifying

```bash
pnpm check                     # tsc --noEmit
pnpm test                      # vitest (pure logic tests run anywhere)
```

The pure tests (`tests/resource-packs.test.ts`, `tests/market-dataset-isolation.test.ts`) import only
`lib/resource-packs/*` and `lib/market-dataset`, so they run without the native toolchain.
