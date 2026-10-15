# DECISIONS.md

| # | Decision | Why | Alternatives rejected |
|---|---|---|---|
| 1 | Pure core + platform adapters for resource packs | Unit-testable in plain Node; no RN coupling in logic | Importing expo-file-system everywhere (untestable) |
| 2 | Asset packs shipped as **separate repo** `analyzerx-assets` | Keeps code repo small; user's explicit requirement | Bundling assets in code repo (size) |
| 3 | Chunk size 4 MiB | Well under GitHub's 100 MB/file and 25 MB web-upload limits; matches existing CI split | 100 MB single files |
| 4 | SHA-256 per chunk **and** per assembled file | Detects both transit corruption and ordering/mixing errors | Size-only checks |
| 5 | Atomic activation (temp dir -> final rename) | A partial/corrupt pack must never be readable | In-place writes |
| 6 | Unsupported markets return **empty** data + notice | Truthfulness; no cross-market rows ever | Falling back to India data (the defect) |
| 7 | Add `marketId` to flows + graph procedures | Server must scope like the client does | Client-side filtering only |
| 8 | Add **no** new dependencies | Keep install/CI stable; zod/expo-crypto/expo-file-system already present | New HTTP/zip libs |
| 9 | Publish via GitHub MCP to a branch + PR | Non-destructive; keeps history reviewable | Force-push to main |

## D-009 — Bundle verification moves to CI (not the local sandbox)
The directive states that bundle verification belongs in CI. A local Metro run cannot complete here:
`expo export` fails in the Expo CLI's HTTP layer (undici's WASM llhttp), and driving Metro directly
gets through resolution but dies at the transform stage on React Native's own polyfills. Added
`.github/workflows/bundle-verify.yml`, which runs `expo export --platform web` on push and asserts the
bundle produced output. Resolution is additionally proven locally by driving `metro`'s `runBuild`.

## D-010 — The app stays at the repository root
The directive names `apps/analyzerx`. The requirement it expresses — decoupling the quant engine from
the client app — is satisfied by `packages/quant-engine` with a one-way dependency and relative-path
shims. Renaming the app directory would touch tsconfig paths, babel config, metro config, app.json,
eas.json, the APK workflow and every shim, with zero behaviour change and a real chance of breaking
the bundle. Recorded, not executed.

## D-011 — The catalogue reports status honestly
`model-catalogue.ts` marks a model `implemented: true` only where tested code exists, and names the
module. Unimplemented models carry the reason. The catalogue is 100 book references plus 49 named
models (39 runnable). It is not padded to reach the directive's headline count.
