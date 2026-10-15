# KNOWN_ISSUES.md

| id | severity | issue | status |
|---|---|---|---|
| K1 | high | India-only fixtures leaked into every market (Live/Sectors/Flows) | **Fixed** — lib/market-dataset.ts + screen wiring |
| K2 | high | `market.institutionalFlows` (NSE-only) had no marketId | **Fixed** — marketId input; non-IN returns an explicit empty result |
| K3 | medium | `graph.projection` mixed markets | **Fixed** — `event_projections.marketId` + marketId input |
| K4 | medium | Screener seed directory fell back to IN | **Fixed** — no fallback; market-scoped candidates |
| K5 | low | The Sectors "MARKET-WIDE SIGNAL 82/100" hero is a static seed figure | Open (pre-existing, cosmetic); not market-contaminating |
| K6 | info | Physical Android APK build/device QA impossible in this sandbox (no Android SDK/NDK/adb/device; 2 GB RAM) | Environment-gated; CI workflow retained, unchanged |
| K7 | info | Live provider credentials (Finnhub/Dhan/Angel One/…) absent here | Environment-gated; truthful unavailable states retained |
| K8 | info | Non-IN markets remain catalog-validated for live data; only seed content is bundled | Documented in PROJECT_SPEC and the dataset notices |
| K9 | info | `event_projections.marketId` requires a schema migration (`pnpm db:push`, which CI runs) | Documented; legacy NULL rows are treated as India for the graph |

| K10 | low | 13 `any` usages remain, all in vendor-style scaffolding (`lib/_core/*`, `server/_core/*`) that parses external payloads | Deliberately untouched — replacing them risks the auth path for no functional gain |
| K11 | low | `console.log` in `lib/_core/api.ts` and `manus-runtime.ts` are not dev-gated | The auth path is now dev-gated; the rest is framework scaffolding, lower priority |

| K12 | low | Web only: stored user info (name/email) sits in `localStorage`, unencrypted | Documented; web auth is cookie-based and this is display metadata. Not changed |

| K13 | info | Live FCM delivery is unverified in this environment (needs the operator's Firebase service account + a device) | Implemented + unit-tested; Expo remains the default free path when FCM is unconfigured |
| K14 | info | `push_tokens` has no index beyond its primary key | Deliberate: `ORDER BY token` is served by the PK; an extra 2 KB-wide index would be redundant |

| K15 | resolved | Native file picker | Added `expo-document-picker@~14.0.8` (SDK-54 pinned) with the lockfile re-synced; Strategy Lab now picks CSV/JSON directly |
| K16 | info | Backtest costs model commission + slippage only — not short borrow/financing, market impact, or size limits | Documented in `lib/quant/backtest.ts`; sufficient for single-instrument research, not for capacity analysis |

| K17 | resolved | Monorepo workspace | `packages/core-types` + `packages/quant-engine` are real pnpm workspace packages with their own manifests and strict tsconfigs; the app consumes them through one-line relative-path shims, so no existing import changed and no new module-resolution behaviour was introduced |
| K19 | info | A full Metro bundle cannot be produced in this pod | `metro`'s `runBuild` runs and resolves the modules, but the transform stage OOMs on WASM. Resolution is verified; end-to-end bundling needs a bundler-capable environment |
| K18 | info | 78 of the 100 catalogued books are reference-only (no algorithm) | Deliberate: they are labelled REFERENCE in the UI. Fabricating 78 screens would produce confident nonsense |

| K20 | info | App lives at the repo root, not `apps/analyzerx` | The directive's substantive requirement (quant-engine decoupled from the client app) is met by the workspace package. Moving the app directory would touch tsconfig paths, babel, metro config, app.json, eas.json and the APK workflow for no behaviour change. See DECISIONS.md |
| K21 | info | 10 catalogue models are not implemented | Labelled NOT IMPL in the UI with the reason (Johansen VECM, Fama-French portfolio construction, MVO, random forests, VCP pattern detection, DCF, capital cycle, commodity cost curve, reflexivity, deleveraging classifier). Fabricating them would produce confident nonsense |
| K22 | info | The bundle is verified in CI, not locally | `bundle-verify.yml` verifies the bundle with a pure Gradle `assembleDebug` build on push. The local sandbox cannot complete a Metro transform (WASM allocation) |

| K23 | resolved | Cross-market leakage in the supply-chain screen | Fixed: `screenSupplyChainScoped` enforces the market tag in the engine, with 5 regression tests. The library and model runners already refused mismatched universes; this section did not |
| K24 | resolved | Dead loading state and a literal "undefined" render in Strategy Lab | Fixed: removed the unreachable `busy` indicator; the candidate name now falls back to its symbol |

| K25 | resolved | No cross-strategy performance ledger | Built: `src/ledger.ts` (pure aggregation) + `lib/quant-ledger.ts` (validated AsyncStorage persistence), wired into Strategy Lab with a cross-strategy dashboard |
| K26 | info | 4 catalogue models remain unimplemented | random forest (its prerequisite, purged CV, is now implemented), Clenow's regression-slope ranking, reflexivity and the pre-mortem checklist. None has a published computable formula; each is labelled NOT IMPL with the reason |

| K27 | resolved | Artificial test fixtures (collinear / constant / zero-noise) | Replaced with a seeded realistic market generator: GARCH-style volatility clustering, jumps, asymmetric wicks, noisy universes. This exposed a real bug — MKT was a constant series |
| K28 | open | `apps/analyzerx` rename not performed | Pure risk, no behaviour change; the decoupling it stands for is already true. Reported per protocol item 4 |
| K29 | open | CI bundle verification has not run | `bundle-verify.yml` triggers on push to main; commits are made through the API, so the workflow has not executed. Local verification is resolution-only (Metro's transform needs WASM the pod cannot allocate) |

| K30 | info | Signal history is capped at 2,000 records and refuses appends beyond it | Deliberate: trimming the oldest records would break the chain's genesis link and silently destroy history. At the cap the Lab says so and asks for a publish/archive |
| K31 | info | `evaluateRecord` needs later prices supplied by the caller | The engine fetches nothing. A past suggestion cannot be scored without a price for the evaluation date, and inventing one would defeat the point of the record |

| K32 | resolved | Screener showed the previous market's candidates after a market switch | `filteredCandidates` memoised without `researchCandidates` in its deps, and that value derives from `marketId`. Fixed; same family as the supply-chain leak (K23) |
| K33 | open | Expo removal not performed | Removing 28 expo-family packages that back navigation, storage, auth, push and the build pipeline would leave a codebase that cannot build. EAS is not actually in use; the APK builds with Gradle. Migration scoped in DECISIONS.md D-015 |
| K34 | open | Workflow run status cannot be read | The GitHub Actions read tools are unavailable to this agent (TOOL_NOT_FOUND). Commits can be pushed; pipeline results cannot be verified from here |
| K35 | open | No .apk can be produced in this sandbox | No Android SDK/NDK, Java, Gradle or device, and a ~500MB heap ceiling. The CI workflow builds a signed APK on a runner |

| K36 | resolved | `bundle-verify.yml` depended on `expo export` | Rewritten to verify the bundle with a pure Gradle `assembleDebug` build. `build:web` (the expo export script) is deleted |
| K37 | resolved | `eas.json` present | Deleted, and the script that read it rewritten. No EAS command was ever in the build path — the APK is built by Gradle |
| K38 | resolved | `expo-crypto` used for artifact hashing | Replaced with the in-repo SHA-256 (digest-identical), removing the native crypto dependency |
| K39 | open | 25 expo-family packages remain | These are the app's own framework: expo-router drives navigation across 39 screens; expo-file-system backs the ledger, activity log, resource packs and signal history; expo-secure-store backs auth; expo-notifications backs push. Removing them requires bare replacements — see DECISIONS.md D-015 |

| K40 | resolved | A whole test suite was skipped with a stale TODO | `tests/auth.logout.test.ts` was `describe.skip` claiming auth was unimplemented; `auth.logout` exists in server/routers.ts. Un-skipped — and running it exposed a real crash (K41) |
| K41 | resolved | `getParentDomain` crashed on a missing host header | `isIpAddress(host)` called `host.includes(":")` unguarded, so a request with no host header 500'd the logout endpoint instead of degrading. Guarded at the boundary |

| K42 | resolved | Fire-and-forget calls used `void async()` without a `.catch` | 31 sites converted to `fireAndForget(...)`, which records the rejection to the activity log; a process-level guard in `app/_layout.tsx` covers the remaining multi-line sites |

| K43 | info | Six conditional integration tests skip without credentials | `token ? it : it.skip` / `describe.skipIf(!runIntegration)` for Finnhub, SEC EDGAR, NSE and TinyFish. Correctly gated — they need a live key or network. Forcing them green would be faking a result |

| K44 | resolved | `@expo/vector-icons` was the app's icon set | Replaced with `react-native-vector-icons` across 39 files; the Expo-only `glyphMap` type replaced by `IoniconName`; the native font-linking gradle fragment added |
| K45 | open | 24 expo-family packages remain | Stages 2-4 of MIGRATION_PLAN.md. Stage 3 (`expo-router`, 43 files) and Stage 4 (native project regeneration) are architectural and need device/CI verification — tsc cannot validate navigation or a native build |

| K46 | info | Model download resume restarts rather than continuing by byte range | `react-native-fs` cannot append to a partial file, so `createDownloadResumable` re-fetches on resume. Progress, pause and cancel are faithful; the byte-range behaviour is not. Documented in `lib/platform/file-system.ts` |
| K47 | open | 11 expo-family packages remain | `expo-router` (43 files) is Stage 3; `expo-notifications`, `expo-image-picker`, `expo-document-picker`, `expo-audio` and the Expo core/config/native layer are Stages 3-4 of MIGRATION_PLAN.md |
