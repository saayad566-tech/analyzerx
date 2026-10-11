# AnalyzerX Technical Design

**Version:** 1.4.0 · **Status:** reflects the shipped on-device architecture · **Supersedes:** the server-centric description in `docs/analyzerx-technical-design.md`

## 1. System context

AnalyzerX is an Expo SDK 54 / React Native mobile application (Android, with an Expo Router web target) that runs **entirely on the device**. There is no application server. Earlier revisions of this document described a Node/Express + tRPC backend backed by MySQL through Drizzle, with Manus OAuth and S3-compatible storage. That backend is no longer reachable — the hostname does not resolve and no credentials exist — and the product no longer depends on it. The data layer was moved into the client.

This is the central design fact of the project. Everything below follows from it.

## 2. Architecture

```text
Expo Router app  (36 screens, 68 procedure call sites)
  │
  ├── Presentation        screens, NativeWind + semantic theme tokens,
  │                       TanStack Query cache, dynamic theme registry
  │
  ├── Transport boundary  lib/trpc.ts  ──►  lib/open-data/link.ts
  │                       (every procedure the screens call, implemented locally)
  │
  ├── Capability layer    engine.ts   — quotes, news, fundamentals, flows,
  │                                     sectors, macro, screener
  │
  ├── Resilience          chain.ts    — failover, circuit breaker, cooldown
  │
  ├── Providers           sources.ts  — Yahoo, NSE archives, Google News RSS,
  │                                     publisher RSS, SEBI, BSE,
  │                                     FII/DII open dataset, NSDL sector, World Bank
  │
  ├── Primitives          core.ts     — HTTP (UA rotation, retries, timeout),
  │                                     provenance, TTL cache, CSV/RSS parsing
  │
  └── Persistence         store.ts (AsyncStorage archive), expo-secure-store,
                          theme registry, collector.ts (continuous collection)
```

## 3. Frontend architecture

Expo Router file-based routing, portrait-first, bottom-tab primary navigation with stack routes for detail screens. Server-derived data flows through TanStack Query hooks; because the transport boundary is preserved, those hooks are unchanged from the hosted era. NativeWind supplies utility styling; colour is never taken from raw literals in screens — every screen consumes **semantic tokens** from the theme provider (`lib/_core/theme.ts`, `lib/theme-registry.ts`, `constants/theme.ts`) so the eight registered themes and custom themes apply instantly.

State splits cleanly: remote data in TanStack Query, durable local data in the archive store, session material in secure storage, appearance in the theme registry.

## 4. Backend architecture — the on-device layer

There is no backend process. The functions a server would perform are implemented in-process:

| Server-era responsibility | On-device implementation |
| --- | --- |
| tRPC routers + Zod validation | `lib/open-data/link.ts` — one function per procedure |
| Provider registry + circuit breakers | `catalog.ts` (registry) + `chain.ts` (breaker/cooldown) |
| News tracker / NSE collector schedulers | `collector.ts` |
| Fundamental analysis + valuation engine | `fundamentals.ts` (121-field model) |
| Derivatives / institutional-flow adapters | `sources.ts` flow adapters + `engine.ts` |
| Static web export | unchanged (Expo web target) |

The trade-off is explicit: the device does the fetching, so the app depends on the phone's connectivity and on each provider's terms, and there is no shared server-side cache. In exchange, there is nothing to host, nothing to pay for, and the app works offline for anything already collected.

## 5. Database architecture

No server database. Persistence is device-local:

- **News archive** — `lib/open-data/store.ts`, AsyncStorage-backed. Records carry the article payload plus symbol, source, publication time and impact metadata. Operations: append (with dedup counting), query (by symbol, category, time window, text), stats, prune to retention limits, clear.
- **Preferences** — AsyncStorage.
- **Session material** — `expo-secure-store`.
- **Appearance** — theme registry.

The original MySQL/Drizzle schema is retained in `docs/analyzerx-database-schema.md` purely as the reference design for a future optional hosted sync tier. Nothing in the shipped app reads or writes it.

## 6. API architecture

No HTTP API is hosted and none is called. Two directions exist:

**Inbound (procedure calls).** Screens call `trpc.*` exactly as before. `lib/trpc.ts` routes those calls to local implementations in `link.ts`. This is why all 68 call sites and 36 screens survived the migration untouched. `lib/_core/api.ts` was modified so that authentication performs **no remote call** when no server is configured — this removed the startup hang.

**Outbound (data sources).** Only free, keyless public endpoints are contacted: Yahoo Finance, NSE archives, Google News RSS, publisher RSS, SEBI RSS, the FII/DII open dataset, NSDL-derived sector data, and the World Bank API. Each adapter returns a provenance record (URL, retrieval time, freshness status) alongside the value.

## 7. Authentication and authorization

There is no hosted identity provider. The app is usable without an account; account-specific sync is unavailable when signed out, and the UI says so rather than implying it works. Admin-only surfaces (provider/collector health) are reachable only through the in-app admin route. Because there is no server session, there is no server-side authorization boundary — the security model is therefore "the device holds the user's own data and nothing leaves it except outbound reads of public sources."

## 8. AI architecture

The app ships a grounded retrieval path: a question is answered from collected, source-attributed data, and the answer contract always includes the evidence used, freshness, limitations and confidence. The engine selector distinguishes Auto / Local / Connected. A hosted LLM is **not** bundled and **not** required; the UI must never imply an offline model is running when it is not. `app/local-ai.tsx` and `app/local-ai-telemetry.tsx` manage and report local-model state.

## 9. Third-party integrations

Yahoo Finance, NSE archives, Google News, publisher RSS feeds, SEBI, BSE, the FII/DII open dataset, NSDL-derived sector data, World Bank, plus Expo platform services (notifications, print, sharing, secure store, file system, web browser). No paid keys, no hosted backend, no OAuth provider.

## 10. Background jobs

The continuous collector (`collector.ts`) refreshes the archive on a cadence and prunes to retention limits. Expo background-task primitives are used where the platform allows; because Android is aggressive about background work, collection is treated as best-effort and the archive is always readable with whatever it currently holds.

## 11. Caching

A TTL cache in `core.ts` fronts provider calls; `chain.ts` adds a circuit breaker and per-provider cooldown so a failing provider is skipped rather than retried hot. Flows are cached with distinct TTLs (current session short, 30-session history long, sector allocation long) to avoid refetching expensive history on every screen visit.

## 12. Storage

AsyncStorage for the archive and preferences; `expo-secure-store` for session material; `expo-file-system` for exports. Retention is bounded by the store's limits with explicit pruning, so the archive cannot grow without bound on a device.

## 13. Monitoring and observability

No hosted telemetry. Observability is in-app: each source exposes latency, last success, failure count, cooldown state and a payload preview on the admin surface; `chain.ts` records attempts per call so a degraded capability explains itself. The data-truth screen (`app/data-truth.tsx`) shows the evidence status of the data the user is looking at.

## 14. Security and privacy

- No credentials are stored because none are required; there is no API key to leak.
- Outbound traffic is read-only reads of public endpoints.
- User data (archive, preferences) stays on the device.
- Inputs from providers are parsed defensively; malformed payloads raise `SourceError` and surface as "Unavailable" rather than propagating.
- The removed server means the previous attack surface (hosted API, database, OAuth callback) no longer exists.
- Residual risk: provider content is untrusted data and is treated as data, never as instructions.

## 15. Data flow

1. A screen calls a procedure through `trpc.*`.
2. `link.ts` resolves it to a capability in `engine.ts`.
3. The capability asks `chain.ts` for a provider; the chain consults the catalog, honours cooldown, and calls the adapter.
4. The adapter fetches through `core.ts`, which applies UA rotation, retries, timeout, and records provenance.
5. The payload is normalised into the domain contract the screen already expects; freshness and source travel with the value.
6. Results are cached with a TTL; anything worth keeping is appended to the archive.
7. The screen renders value first, then status, source and timestamp — and shows "Unavailable" with provenance rather than a guess when a provider fails.

## 16. Build and release

GitHub Actions (`android-apk.yml`) provisions the Android SDK manually, runs `assembleDebug`, signs v1+v2/v3 and stages the APK. Because the account's Actions artifact quota is exhausted, the artifact is retrieved through release assets and a temporary branch. Windows `.exe` and desktop installers are **not** produced: this is an Expo/React Native Android application with a web target, and no Windows desktop target is configured. That is stated plainly rather than implied to exist.

## 17. Known limitations

No device verification has ever been performed — every UI claim is unverified against a real screen. Several procedure shapes remain best-effort. The exchange/flow/calendar layers are India-weighted, which conflicts with the market-agnostic requirement. See `AnalyzerX-Project-State.md` §4, §7 and §9 for the live list.
