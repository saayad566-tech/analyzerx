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

## D-012 — The ledger is bounded and validated on read
`LEDGER_CAP` bounds the store at 2,000 entries and entries de-duplicate on
strategy + market + symbol + entry time, so re-recording a position updates it instead of inflating
the win rate. Every record is shape-validated when read back: a corrupted or older payload is dropped
rather than silently becoming a metric.

## D-013 — The signal history is hash-chained, append-only and never trimmed
Each record carries SHA-256 of its own content plus the previous record's hash, so an edit, a deletion
or a rewritten-and-resealed record is detectable from that point onward. The chain is global rather
than per-market so the sequence and link checks remain meaningful; the UI filters for display. Records
are never trimmed: at the 2,000-record cap the append is refused and reported. Publishing refuses a
chain that does not verify. `evaluateRecord` produces a separate, later report and never writes back
into the original record, so a published suggestion stays exactly as published.

## D-014 — SHA-256 lives in the engine
Moved from `lib/resource-packs/hash.ts` to `packages/quant-engine/src/hash.ts` so the resource-pack
integrity path and the signal chain share one implementation, and so the dependency direction stays
one-way (app → packages). The old path is a shim; its tests passing is the proof the move is clean.

## D-015 — Expo removal is a migration, not a cleanup (scoped, not executed)
**Measured state.** 28 expo-family dependencies; 58 files importing expo/@expo; expo-router drives
navigation across 39 screens; expo-file-system backs the ledger, activity log, resource packs and
signal history; expo-secure-store backs auth; expo-notifications backs push.

**The cost premise does not hold.** No EAS command appears in any workflow or script. The APK is built
by `./gradlew assembleRelease` against the committed `android/` project — a bare Gradle build with no
Expo account and no paid service. `eas.json` is inert (referenced only by a config-validation script).
The expo npm packages are MIT-licensed libraries, not services.

**Why it was not executed.** Deleting these packages without bare replacements leaves a codebase that
cannot build. A partial removal is worse than either end state, so it is not performed.

**Migration outline if it is still wanted.** 1) Replace expo-router with React Navigation (every screen
and the file-based route tree). 2) Replace expo-file-system / expo-secure-store with react-native-fs /
MMKV or AsyncStorage + a keystore module. 3) Replace expo-notifications with a direct FCM client.
4) Swap metro.config.js off `expo/metro-config`, babel off `babel-preset-expo`, and nativewind off
`nativewind/metro`. 5) Replace `expo lint` with a plain ESLint config. 6) Re-point the build workflow
and remove app.config.ts/eas.json. This is a multi-session migration that must be verified on a runner
with an Android toolchain.
