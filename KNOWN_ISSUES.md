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
