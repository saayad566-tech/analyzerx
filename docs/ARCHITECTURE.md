# AnalyzerX — architecture, isolation and per-country lifecycle

This document describes what is actually in the repository, measured against the five
requirements, and names every gap that was found and what was done about it. Where
something is not implemented, it says so.

---

## 1. First launch and onboarding

**Was: missing entirely.** `app/_layout.tsx` went straight to `/(tabs)` on the default
market (`IN`). `app/market-country.tsx` existed and was reachable from the Account screen,
the market chip and Filings — but only if the user found it. Nothing recorded that a user
had never chosen a country, and no country's data was ever knowingly requested.

**Now:**

- `app/onboarding.tsx` — a first-launch screen listing every market profile. The user
  selects **one or many** countries and proceeds.
- `FirstLaunchGate` in `app/_layout.tsx` reads a persisted flag and redirects a first-time
  user to `/onboarding`, once. A storage read failure is treated as "already onboarded",
  so an unreadable store can never trap the user in a redirect loop.
- Choosing countries **queues** them (`state: "queued"`), it does not mark them ready.
  Nothing has been fetched at that point, and the switcher must not claim otherwise.
- The first chosen country is activated so the app opens on something the user asked for.

```
first launch
    │
    ▼
FirstLaunchGate ── reads analyzerx.onboarding.v1 ──► completed?
    │ no                                              │ yes
    ▼                                                 ▼
/onboarding                                        /(tabs)
    │ pick 1..N countries
    ▼
completeOnboarding(selected)
    ├─ writes the flag (completed, selected, completedAt)
    ├─ each chosen country: not-downloaded ──► queued
    └─ setMarketId(selected[0]) ──► /(tabs)
```

## 2. Directory structure and modular isolation

The app is a single Expo/React Native bundle; isolation is by **namespace**, not by
separate compiled modules. That is a deliberate trade: one small APK (64 MB arm64) instead
of one per country.

```
app/                      screens (expo-router file routes)
  _layout.tsx             providers + FirstLaunchGate + back navigation
  onboarding.tsx          first-launch country selection        [NEW]
  market-country.tsx      the switcher, now lifecycle-aware
  chart.tsx               candlesticks + indicators
  (tabs)/                 live, stories, graph, sectors, flows, screener, alerts, assistant

components/               presentation only, no data fetching policy
  price-chart.tsx         candlestick + overlay/panel rendering
  nl-screener-panel.tsx   natural-language screen UI            [NEW]
  market-unavailable-card.tsx, market-scope-chip.tsx, screen-container.tsx

lib/
  market-regions.ts       THE registry: ids, country, currency, exchanges, tickerExamples
  market-isolation.ts     scoped cache keys, epoch switch guard, cross-market rejection
  market-context.tsx      which market is active + the atomic switch lifecycle
  market-lifecycle.ts     per-country install state + onboarding   [NEW]
  market-coverage.ts      honest per-category coverage per market
  market-benchmarks.ts    per-market indices and currency pair
  market-universe.ts      per-market seed symbol universe
  market-publisher-feeds.ts, market-news-query.ts   per-market news sources
  indicators.ts           pure technical-indicator engine (26 indicators)
  chart-geometry.ts       pure chart layout maths
  nl-screener.ts          plain-English -> conditions -> evaluation
  byok-vault.ts           AES-256-GCM provider-key vault
  forge-shelf.ts          resumable download + SHA-256 verification (reused by packs)

server/                   the on-device data layer (drizzle + adapters)
drizzle/                  schema + migrations
tests/                    230+ files
docs/                     checklist.md, progress.md, ARCHITECTURE.md, assumptions.md
```

**Per-country separation today:** every market-scoped value flows from `market-regions.ts`
as the single source of truth. Storage keys, cache keys, read queries and the news edition
are all derived from the market id, never hardcoded.

## 3. Pipeline activation and cross-country safety

**What is real:**

- `lib/market-isolation.ts` namespaces every cache and storage key by market, so two
  countries cannot read each other's entries.
- `lib/market-context.tsx` runs an **atomic switch**: a ticket carries an epoch, and
  `controller.swap(epoch)` / `isCurrent(epoch)` / `teardown(epoch)` mean a result from the
  previous market can never be rendered under the new one. A rapid `IN → US → GB` sequence
  cannot interleave.
- Read queries take `marketId` and filter on it. The isolation gate
  (`scripts/check-market-isolation.mjs`) fails the build on a silent India fallback, and
  it is strict with **zero allow-lists** except two documented India-only sites.
- The news poller polls **each market's own** symbol universe and its own publisher feeds.

**What is not true, and this matters:** pipelines for inactive countries are not
"paused" in a literal sense, because they do not run continuously. Data is fetched
**on demand** by whichever screen is open, scoped to the active market. So an inactive
country consumes no memory and issues no requests — but that is a consequence of the
on-demand model, not of an explicit pause/resume controller. There is no per-country
worker to pause.

**Storage-level collision prevention:** keys are `<prefix>:<marketId>:...` through
`scopedCacheKey`, the `marketId` column is on every market-scoped table with a `UNKNOWN`
default so an unclassified row is hidden from **every** market rather than shown under
India, and `resolveMarketId` returns `UNKNOWN` instead of guessing.

## 4. Market switcher lifecycle

**Was: missing.** The switcher showed only "active" and a coverage pill. Every country was
implicitly ready the moment it was selected — which is how a screen ends up querying data
that was never fetched.

**Now:** `lib/market-lifecycle.ts` is the missing state manager. It records, per country:

```
not-downloaded ──► queued ──► downloading ──► verifying ──► installed ──► active
       ▲                │            │             │            │            │
       └────────────────┴────────────┴─────────────┘        update-available
                            failed ──► queued / downloading
```

Legal transitions are declared explicitly and an **illegal one is refused rather than
written** — a country cannot jump from `downloading` to `installed` without passing
through `verifying`, and `completeMarketLifecycle` throws if any part is unverified. The
switcher renders the badge for each state and only offers activation for a country that is
`installed`, `active` or `update-available`.

```
switcher row
  ● Active        Live · data 2026-10-15
  ● Ready         42.3 MB installed
  ● Downloading   37%
  ● Verifying     2/3 parts checked
  ● Download      Not downloaded yet
  ● Failed        Network unavailable
```

## 5. Audit result — gaps found and their status

| Requirement | State before | Status |
|---|---|---|
| 1. First-launch country selection | **Absent** | **Built** — `app/onboarding.tsx` + gate |
| 2. Per-country tree/module isolation | Partial — namespace-based, no module tree | Documented; isolation is by namespace by design |
| 3. Only the active country runs | Partial — on-demand model, no explicit pause | Documented honestly; no worker to pause |
| 4. Switcher lifecycle states | **Absent** | **Built** — `lib/market-lifecycle.ts` + switcher UI |
| 5. Audit + leak risks | — | This document |

**Remaining gaps, stated plainly:**

1. **The data packs themselves do not exist yet.** The lifecycle state machine is real and
   tested, and `lib/forge-shelf.ts` already implements resumable download with SHA-256
   verification, but there is no signed manifest and no per-country pack hosted as a
   Release asset. So every country currently reaches `queued` and stops there; nothing
   transitions it to `installed`. This is the largest remaining piece.
2. **No explicit pause controller.** If a future version adds background polling per
   country, a real activation controller will be needed. Today's on-demand model does not
   require one.
3. **`update-available` is declared but never raised**, because there is no manifest to
   compare a data version against.

**Leak risks reviewed and closed:** the silent-India fallback in the local link, the
country→market maps duplicated in the fundamentals path, the news fallback that ignored
the requested market, the poller hardcoding `"IN"`, and the hardcoded demo event array.
Each was fixed in an earlier pass and is now covered by a regression test.
