# PROGRESS_LOG.md

## 2026-10-15 — Session 1
- Fetched `saayad566-tech/analyzerx` @ bdcc93fd into the sandbox; read the full tree (667 files),
  package.json, app.config, CI workflow, market infra, and the existing market tests.
- **Audit result:** confirmed the cross-contamination defect — India-only fixtures wired into Live
  Events, Sectors, Flows; Screener IN fallback; unscoped institutional-flows and graph procedures.
- Wrote the 7 memory files.

## 2026-10-15 — Session 1 (build)
### Delivered
- **Resource-pack architecture** (`lib/resource-packs/*`, 10 modules): a separate assets repository,
  a main file (`manifests/index.json`), per-market manifests, 1 MiB-bounded chunks, resumable
  download with retry/backoff, SHA-256 verification per chunk and per dataset, and atomic activation.
- **Market isolation**: `lib/market-dataset.ts` is now the single source of truth; Live Events,
  Sectors, Market Flows and the Screener read only the selected market. `market.institutionalFlows`
  and `graph.projection` are market-scoped; `event_projections` gained a `marketId` column.
- **Build tooling**: `scripts/build-resource-pack.mjs` + `scripts/resource-pack-format.mjs`.
- **Assets published** to a new separate repo `saayad566-tech/analyzerx-assets` (37 files: index,
  2 manifests, 22 chunks, 10 auditable sources, SHA256SUMS, README).

### Verified (evidence)
- `tsc --noEmit`: **0 errors**.
- New tests: resource-packs **22/22**, market-dataset-isolation **12/12**.
- Regression: market-data 8/8, market-regions 4/4, market-isolation 32/32, sector-intelligence 4/4,
  archive-exports-market-cap 4/4, news-market-isolation-dedup 3/3, indian-news-relevance 10/10,
  regional-collectors 3/3.
- SHA-256 checked against FIPS vectors and node:crypto, including the `length ≡ 55 (mod 64)` padding
  boundary — **a real bug found and fixed** (the naive `>>6 + 1` padding added a spurious block).
- Build tool ↔ runtime: every manifest digest, chunk digest and dataset digest reproduces on both
  sides; datasets reassemble byte-identical to their sources.
- **Published assets re-downloaded and fully verified by the app runtime** (36/37 byte-identical on
  the first pass; README re-uploaded and confirmed at 1767 bytes via the API — the raw CDN was stale).

### Notes / environment limits
- `vitest` cannot run in this sandbox (2 GB RAM; vite needs WebAssembly, which the 1.5 GB address-space
  limit cannot host). The same test files were executed through Node with esbuild bundling and the
  real installed dependencies. `pnpm install` succeeded only under `NODE_OPTIONS=--jitless`.
- Android APK build/device QA and credentialed live providers remain environment-gated (K6–K8).

### Next
- On a device/CI: install the packs end-to-end, then run the market-switch smoke path
  (IN → US → GB) on Live, Sectors, Flows, Screener and Graph.
