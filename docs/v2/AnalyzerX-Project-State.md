# AnalyzerX — Project State & Knowledge System

**Purpose.** This is the permanent project-state file the build brief asks for: a single place that records what AnalyzerX is, what is actually built, what is pending, what is broken, and what has been decided. Read this before starting any task; extend it after every task. It is the shared context that keeps work from being repeated.

**Version:** 1.4.0 · **Platform:** Android (Expo/React Native) · **Last updated:** 2026-10-11

---

## 1. What the product is

AnalyzerX is a source-grounded financial-intelligence workspace for Indian and global markets. A user moves from a plain-English question or a ticker to a transparent research view spanning market events, company fundamentals, cash-flow quality, valuation, derivatives context, institutional flows, news impact, and scenario-based signals. The governing principle is **trust before completeness**: no field is ever filled with an invented number. When a preferred source is unavailable the app uses a documented fallback chain, labels the source and timestamp, and states whether a value is reported, derived, estimated, stale, or unavailable.

## 2. Architecture — current, as built

The single most important fact about this project's history: **the original architecture was a hosted backend** — an Expo client calling a Node/Express + tRPC API backed by MySQL via Drizzle, with Manus OAuth and S3-compatible storage. That backend no longer resolves in DNS. This was the root cause of the app appearing "completely broken"; it was not broken code, it was an unreachable server plus absent credentials.

**The fix was architectural, not cosmetic.** The data layer was moved onto the device. There is now **no backend to host**. The app fetches free, keyless public sources directly from the phone, normalises them into the same domain contracts the screens already consumed, and keeps history locally.

```
Expo Router app (36 screens)
  ├── 68 tRPC procedure call sites  ──►  lib/trpc.ts  (transport swap)
  │                                          │
  │                                          ▼
  │                                   lib/open-data/link.ts
  │                                   (implements every procedure locally)
  │                                          │
  │        ┌─────────────────────────────────┼──────────────────────────────┐
  │        ▼                                 ▼                              ▼
  │   engine.ts                       chain.ts                    fundamentals.ts
  │   (capability layer)         (failover + circuit breaker)   (121-field model)
  │        │                                 │
  │        ▼                                 ▼
  │   sources.ts ────────────────► core.ts (HTTP, provenance, cache, CSV/RSS)
  │   (provider adapters)
  │        │
  │        ├── catalog.ts   (800-source catalog + reachability/licence)
  │        ├── store.ts     (on-device history, AsyncStorage-backed)
  │        └── collector.ts (continuous background collection)
  │
  └── lib/pdf.ts (expo-print report with inline SVG charts)
```

**Key modules**

| Module | Role |
| --- | --- |
| `lib/open-data/core.ts` | HTTP with UA rotation and retries, provenance records, TTL cache, CSV/RSS parsers, `SourceError`. |
| `lib/open-data/sources.ts` | Provider adapters (Yahoo, NSE archives, Google News RSS, publisher RSS, SEBI, BSE, the FII/DII open dataset, NSDL sector flows, World Bank). |
| `lib/open-data/engine.ts` | Capability layer — quotes, news, fundamentals, flows, sectors, macro, screener. |
| `lib/open-data/fundamentals.ts` | Faithful 121-field `FundamentalAnalysis`, typed against the original server type. |
| `lib/open-data/chain.ts` | Provider failover with circuit breaker, cooldown and attempt records. |
| `lib/open-data/catalog.ts` | The 800-target source catalog with kind, format, market, cadence, credential state, reachability, licence. |
| `lib/open-data/store.ts` | On-device news archive: append, query, stats, prune, clear. |
| `lib/open-data/collector.ts` | Continuous collector that keeps the archive fed. |
| `lib/open-data/link.ts` | Implements all 68 procedures locally, so no screen needed rewriting. |
| `lib/trpc.ts` | Routes procedure calls to the local implementation instead of a server. |
| `lib/pdf.ts` | Research-report export via `expo-print`. |

**Why this design.** It removes the hosting dependency entirely, keeps the app usable offline for anything already collected, and preserves the entire screen layer — the swap happened at the transport boundary, so 36 screens and 68 call sites were left intact.

## 3. Data sources — status

**Free and keyless only.** No paid keys anywhere.

**Verified reachable and wired:** Yahoo Finance (quotes, search, fundamentals-timeseries, history), Google News RSS, Yahoo Finance RSS, NSE archives (`nsearchives.nseindia.com` — equity master, index CSVs, FII/DII, bulk/block deals, `sec_bhavdata_full.csv`, 7 RSS feeds), SEBI RSS, the FII/DII open dataset on `raw.githubusercontent.com`/jsDelivr, and the World Bank API.

**Wired but device-only** (blocked by the build sandbox's DNS allowlist, expected to work on a real phone): NSDL-derived FPI sector allocation, OECD SDMX, ECB SDMX, SEC EDGAR, GDELT, CoinGecko, and Indian publisher domains.

**Catalog honesty caveat.** The catalog holds 800 targets: 760 verified reachable and 40 device-only. They resolve to six real providers (NSE, Google News, publisher RSS, SEBI, BSE, RBI). Most entries are Google News per-symbol or per-topic query variants, **not** 800 independent providers. This is stated plainly rather than presented as 800 distinct sources.

## 4. Features — built vs pending

**Built and working**
- Live market snapshot, symbol search and quotes (Yahoo).
- News: per-symbol and market-wide, with sentiment, impact score, source and freshness.
- Company fundamentals — 121-field analysis model.
- Institutional flows — FII/DII aggregate, now with **30-session history backfill** and provider failover between NSE and the open dataset.
- FPI sector allocation — wired, exposed on the flows payload, honest degradation when unreachable.
- Sector intelligence, screener, storylines, relationship graph, research workspace.
- On-device news archive with append/query/prune, and a continuous collector.
- Research-report PDF export.
- Dynamic theme registry (8 themes + custom) with semantic tokens.

**Pending**
- Sector-allocation UI — the data is exposed but not yet drawn on the flows screen.
- Device verification — no screen has ever been visually confirmed (see §7).
- Market-agnostic generalisation — exchange adapters, the FII/DII concept and the trading calendar remain India-weighted, though the spec asks for no hardcoded country assumptions.
- Several procedure shapes are best-effort approximations: `events.latest` row shape, `researchDesk.run`, `smartAlerts.discover`, `autonomousRecommendations.*`, `market.secFilings`, and the `sources.list`/`providers.list`/`capabilities.*` catalog shapes.

**Explicitly unavailable (no free feed exists)**
- Per-stock (security-wise) FII/DII attribution.
- Option chains.
- SEC XBRL comparison.
- Promoter/pledge ownership.

## 5. Database / persistence

There is no server database. Persistence is on-device: AsyncStorage for the news archive and user preferences, `expo-secure-store` for session material, and the theme registry for appearance. The original MySQL/Drizzle schema (`users`, `news_events`, `push_tokens`, `source_records`, plus production extensions) is retained in `docs/analyzerx-database-schema.md` as the reference for a future hosted sync tier, but **nothing in the shipped app depends on it**.

## 6. APIs

No HTTP API is hosted. The 68 procedures the screens call are implemented locally in `lib/open-data/link.ts` and dispatched through `lib/trpc.ts`. Outbound HTTP goes only to the public data sources in §3. `lib/_core/api.ts` was changed so auth makes **no remote call** when no server is configured — this removed the startup failure that made the app hang.

## 7. Testing, build and deployment status

**Tests.** `tests/open-data.test.ts` (live source contracts, now 48 tests), `tests/open-data-chain.test.ts` (failover, 10), `tests/open-data-pipeline.test.ts` (14). Two pre-existing failures were fixed: `autonomous-recommendations` (time-expired fixtures made run-relative) and `research-desk` (real NSE network I/O in a unit test replaced with mocks). `tsc --noEmit` is clean.

**Build.** GitHub Actions workflow `.github/workflows/android-apk.yml` provisions the Android SDK manually (the `android-actions/setup-android@v3` action was failing with `Failed to find package 'tools'`), runs `assembleDebug`, signs v1+v2/v3, and stages the APK. Two CI fixes were needed: removing `/android` from `.gitignore`, and `chmod +x gradlew` because files pushed through the API land as 0644.

**Deployment.** The account's Actions artifact-storage quota is exhausted, so the APK is retrieved via release assets and a temporary `apk-artifact` branch, then the branch is deleted. Latest verified build: run #26, `analyzerx-1.4.0.apk`, 63,858,975 bytes, SHA-256 `f215e2a4a45afe5447729fb771ad5b967c1c5d62db4899dc11bf1e3decd3d037`, arm64-v8a, signed.

**Known limitation.** No physical device has ever run this build. Every UI claim in the documentation is therefore unverified against a real screen. This is the single largest open risk in the project.

## 8. Decisions log

| Decision | Rationale |
| --- | --- |
| Move the data layer on-device instead of re-hosting the backend | The server was unreachable and hosting is a recurring cost; on-device removes both. |
| Swap at the transport boundary (`lib/trpc.ts` + `link.ts`) | Preserves all 36 screens and 68 call sites; no screen rewrite. |
| Free, keyless sources only | No budget for paid data; keeps the app self-contained. |
| Evidence-first, "Unavailable" over guessing | Trust is the product's core promise. |
| Provider failover with circuit breaker | "In case one not working, the other works." |
| AsyncStorage archive rather than SQLite | Sufficient for the news volume; avoids a native dependency and migration surface. |
| Keep the original MySQL schema documented but unused | Preserves the option of a hosted sync tier without blocking the offline product. |

## 9. Technical debt

- India-weighted assumptions in the exchange/flow/calendar layers (contradicts the market-agnostic requirement).
- Best-effort procedure shapes listed in §4 pending.
- The catalog conflates "sources" with "query variants"; the count overstates provider diversity.
- No automated UI/E2E test and no device verification.
- Stale `package.json` scripts still reference the removed server (`dev:server`, `build:server`).

## 10. How to use this file

Before any task: read §2 (architecture) and §4 (built vs pending) so you neither duplicate working code nor re-diagnose the dead backend. After any task: update §4, §7 and §9. When a decision is made that a future contributor could reasonably reverse, add it to §8.
