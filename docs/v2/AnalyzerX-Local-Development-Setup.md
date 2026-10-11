# AnalyzerX — Local Development & Run Guide

**Audience:** anyone running or extending AnalyzerX locally. · **Version:** 1.4.0

Because AnalyzerX has no hosted backend, "run the platform locally" means running the mobile app in development against the on-device data layer, plus the test suite and the APK build. This guide covers all of it, including the persistence schema the brief asks for.

---

## 1. Prerequisites

| Requirement | Version / note |
| --- | --- |
| Node.js | 20 LTS |
| Package manager | pnpm 9.12.0 (`npm i -g pnpm@9.12.0`) |
| Java | JDK 17 (only needed for a local Android build) |
| Android SDK | platform 34, build-tools 34.0.0 (only for a local APK) |
| Expo Go | on a physical device, for the fastest dev loop |
| Memory | At least 2 GB free. On a constrained box, run `ulimit -v unlimited` before Node/tsx work — the default 1.5 GB virtual-memory cap breaks Node and V8 Wasm. |

No API keys are required. No database server is required. No OAuth credentials are required.

## 2. Install

```bash
git clone <repo-url> analyzerx && cd analyzerx
pnpm install --frozen-lockfile
```

## 3. Environment variables

The shipped app needs **none** to function — that is the point of the on-device design. The variables below exist only for optional or development use:

| Variable | Required | Purpose |
| --- | --- | --- |
| `EXPO_PORT` | no | Metro/web dev port (default 8081) |
| `NODE_ENV` | no | `development` locally |
| `EXPO_PUBLIC_*` | no | Any public runtime flag surfaced to the app |

If you were to reintroduce a hosted tier, its connection strings would live here — but nothing in the current build reads them. `docs/analyzerx-env-reference.md` documents the historical set.

## 4. Run the app

```bash
pnpm dev:metro        # Metro bundler; scan the QR with Expo Go, or press 'a' for Android
pnpm dev:web          # Expo Router web target at EXPO_PORT (default 8081)
```

`pnpm dev` (which starts a server *and* Metro) is a **stale script from the hosted era** — the server half no longer exists. Prefer `dev:metro` or `dev:web`. Fixing or removing that script is listed as technical debt.

To run on an Android emulator or device with a native build:

```bash
npx expo run:android
```

## 5. Local Android build (no CI)

```bash
cd android
./gradlew assembleDebug        # or assembleRelease with a signing config
```

If `gradlew` reports permission denied, run `chmod +x gradlew` — files pushed through the GitHub API land as 0644 and lose the executable bit. This bit CI once; expect it locally too if you clone from a pushed archive.

## 6. Tests

```bash
pnpm test -- --run             # full suite
npx vitest run tests/open-data.test.ts        # live source contracts (48 tests)
npx vitest run tests/open-data-chain.test.ts  # failover / circuit breaker (10)
npx vitest run tests/open-data-pipeline.test.ts # pipeline (14)
npx tsc --noEmit               # typecheck
```

The live-source tests hit real public endpoints. In a restricted network they must be given a proxy — set `http_proxy`/`https_proxy` and route Node's `fetch` through `undici`'s `ProxyAgent` with `setGlobalDispatcher`. The test files already do this; if you copy an adapter into a new test, carry the same setup across.

## 7. Persistence schema (device-local)

There is no MySQL. The schema that matters is the on-device archive, implemented in `lib/open-data/store.ts` over AsyncStorage. It is a document store keyed by article id, with the following logical record shape:

### `stored_article` (logical)

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Primary key — canonical article id. Dedup key on append. |
| `symbol` | string | Linked symbol; indexed for query. |
| `headline` | string | Headline text. |
| `summary` | string | Concise summary. |
| `category` | string enum | Tech, Finance, Markets, Crypto, General. |
| `sentiment` | string enum | Positive, Neutral, Negative. |
| `impactScore` | number | 0–100. |
| `highImpact` | boolean | Alert eligibility. |
| `source` | string | Publisher/provider. |
| `url` | string | Original source URL. |
| `publishedAt` | ISO string | Publication time; indexed. |
| `storedAt` | ISO string | Ingestion time; drives pruning. |
| `payload` | object | Full normalised article, for provenance. |

**Operations and their contracts**

| Operation | Signature | Behaviour |
| --- | --- | --- |
| Append | `appendArticles(items)` | Adds new records, counts duplicates, returns `{added, duplicates, total}`. Idempotent on `id`. |
| Query | `queryArchive({symbol?, category?, since?, until?, text?, limit?})` | Returns matching records plus a total; used by the history screen. |
| Stats | `storeStats()` | Counts, size, oldest/newest — used by the collector and admin. |
| Prune | `pruneStore(limits)` | Enforces retention; returns `{removed, total}`. |
| Clear | `clearStore()` | Wipes the archive. |

**Keys.** Preferences live under their own AsyncStorage keys; session material lives in `expo-secure-store`; appearance lives in the theme registry. None of these are relational, so there are no foreign keys to declare — the only relationship is `stored_article.symbol → the symbol namespace used by the quote/news adapters`.

**Migrations.** There is no migration framework, because there is no server schema to migrate. The practical equivalent is **additive, tolerant reads**: new fields are optional, and records written by an older build remain readable. If a breaking change is ever needed, bump a `schemaVersion` key and re-derive on first read.

**Seed data.** None is required. The archive starts empty and the collector fills it. For a demo or test fixture, call `appendArticles([...])` with the same shape as above.

### Reference-only server schema

The original MySQL/Drizzle schema — `users`, `news_events`, `push_tokens`, `source_records`, plus `user_preferences`, `watchlists`, `watchlist_items`, `saved_screens` — is preserved in `docs/analyzerx-database-schema.md` and `docs/analyzerx-backend-database-schema.md` as the design for an optional future sync tier. It is **not** part of the running app and needs no local MySQL to develop.

## 8. Local services

None. There is no database, cache, queue or object store to start. The only external dependency is the public internet.

## 9. Test database

None. Tests that exercise persistence use AsyncStorage's in-memory mock, and the live-source tests use real network calls against public endpoints.

## 10. Adding a data source

1. Add an adapter in `lib/open-data/sources.ts` returning a provenance record with the value; throw `SourceError` on malformed input.
2. Register it in `lib/open-data/catalog.ts` with kind, format, market, cadence, credential state, reachability and licence.
3. Wire it into the relevant capability in `lib/open-data/engine.ts` behind `chain.ts` so it participates in failover.
4. Add a contract test in `tests/open-data.test.ts` asserting the shape, and that a failure yields "Unavailable" rather than a fabricated value.
5. Run `npx tsc --noEmit` and the suite.

## 11. Build and release

CI builds the APK: push to `main` triggers `.github/workflows/android-apk.yml`, which provisions the Android SDK, runs `assembleDebug`, signs v1+v2/v3 and stages the artifact. Retrieve it from the release assets or the temporary `apk-artifact` branch (the Actions artifact quota is exhausted, so the branch path is the reliable one), verify the SHA-256, then delete the branch.

There is no Windows `.exe` target. This is an Android/web Expo app; a desktop installer would require a separate target that does not exist. If a desktop build is wanted, that is a new project, not a flag.

## 12. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `ERR_VM_DYNAMIC_IMPORT_ADDRESS_HAS_NO_SOURCE_MAPPING` or a Node crash | 1.5 GB `ulimit -v` | `ulimit -v unlimited` |
| `Failed to find package 'tools'` in CI | broken `setup-android` action | manual `sdkmanager` provisioning (already in the workflow) |
| `./gradlew: Permission denied` | file pushed as 0644 | `chmod +x gradlew` |
| Provider fetch hangs in a sandbox | restricted network | set proxy env and use `undici` `ProxyAgent` |
| A screen shows "Unavailable" everywhere | sandbox DNS allowlist | expected in restricted networks; works on a device |
