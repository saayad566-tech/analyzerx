# AnalyzerX — Upgrade Plan

Companion to `ANALYZERX_REQUIREMENTS_AND_GAP_AUDIT.md` (what exists),
`ANALYZERX_ENGINEERING_DECISIONS.md` (why), `ANALYZERX_VERIFICATION_REPORT.md` (what
was actually run) and `ANALYZERX_REMAINING_BLOCKERS.md` (what is blocked).

## 1. Architecture (as it actually is)

```
app/                       39 Expo Router routes (8 bottom-nav tabs + 31 screens)
  (tabs)/                  Live · Stories · Graph · Sectors · Flows · Screener · Assistant · Alerts
lib/
  market-registry.ts       199 countries, ISO 10383 MIC codes        (reference data)
  market-regions.ts        10 supported market profiles              (derived coverage)
  market-coverage.ts       per-category availability + reason        (honesty layer)
  market-isolation.ts      namespaced keys + epoch switch guard      (anti-bleed)
  market-format.ts         currency · grouping · dates per market
  market-session.ts        exchange sessions in the exchange's tz
  market-scoped-store.ts   user_history:{country}:* and user:{id}:*:{country}
  app-inventory.ts         the app's own screens, machine-readable
  assistant-app-awareness.ts  navigation vs data question routing
  device-profile.ts        low/mid/high tier and the behaviour it implies
  open-data/               source catalog, adapters, chain, store
  scoring/                 institutional scoring engine
server/                    tRPC routers (quotes, filings, flows, scoring, sentiment)
```

Data path, unchanged and deliberately so: provider → network client → parsing →
validation → normalisation → market-scoped cache → domain calc → UI → source +
timestamp. Market isolation applies at the cache and query-key layer.

## 2. Key decisions (ADR summary)

Full text in `ANALYZERX_ENGINEERING_DECISIONS.md`. The load-bearing ones:

- **D1** No proxy or User-Agent rotation — refused twice; it is rate-limit evasion.
- **D2** Known ≠ supported: a country without an adapter is `Not Implemented`.
- **D3** Coverage is per category, not one word per market.
- **D4** No hosted auth without a user decision (needs a paid backend).
- **D5** Market status from the exchange's timezone via Intl, holidays not modelled.
- **D6** Isolation is epoch-based, not just key-based — a stale switch cannot commit.
- **D7** `package.json` is the single source of version truth.
- **D8** Modules under test must not import `react-native` and must use relative imports.
- **D9** Adopt reference data, not code, from supplied projects.

## 3. Device and platform support matrix

`lib/device-profile.ts` classifies at runtime from total RAM, `isLowRamDevice()`,
CPU core count and `getMemoryClass()`. Thresholds are grounded in Android's CDD and
Go-edition specifications and in measured on-device LLM figures (~0.6 GB weights per 1B
parameters at Q4, plus 50–100% headroom).

| Profile | Signal | On-device AI | Largest model | Refresh | List window | Image |
|---|---|---|---|---|---|---|
| **Low** | `isLowRamDevice`, or ≤2 GB RAM, or ≤2 cores | Off | none | ×2 interval | 3 | low |
| **Mid** | <6 GB RAM, or memory class ≤160 MB, or <8 cores | On | 1B @ Q4_K_M | ×1.5 interval | 5 | medium |
| **High** | none of the above | On | 3B @ Q4_K_M | ×1 | 7 | high |

Safety rule: a single low-end signal demotes, and an unreadable signal never promotes.

| Platform | Status |
|---|---|
| Android arm64 | Target. APK built and signed in CI; **not device-verified here** |
| Android Go edition | Supported by behaviour, unverified on hardware |
| iOS | Configured in `app.config.ts`; needs macOS + Xcode, so not built here |

## 4. Phased roadmap

**Phase A — screen audit.** DONE. 39 routes inventoried; 25 found not reading the
market context.

**Phase B — core market flow.** IN PROGRESS. `flows` and `company/[symbol]` made
market-aware. Remaining: `sectors`, `graph`, `assistant`, `history`, `deep-score`.

**Phase C — market-specific categories.** Data layer done (`market-coverage`,
`market-session`, `market-format`); screen wiring outstanding.

**Phase D — AI and device behaviour.** Assistant app-awareness DONE. Device-profile
tiering DONE. Outstanding: local-LLM runtime state machine, hybrid intent router,
model-download UI wiring.

**Phase E — verification.** Tests run in CI on every push. Outstanding: device
testing, accessibility audit, performance measurement — all blocked by the absence of
a device and toolchain.

## 5. Risk register

| # | Risk | Severity | Mitigation | Status |
|---|---|---|---|---|
| R1 | No device or emulator — UI changes unverified on hardware | High | CI type-check + tests; user device check requested | Open |
| R2 | 23 screens still not market-wired | High | Phase B/C, screen by screen | Open |
| R3 | Licensed real-time data unavailable | Medium | Delayed data labelled; nothing substituted | Accepted |
| R4 | Hosted auth needs a paid backend | Medium | Scoping built; decision pending | Blocked on user |
| R5 | Low-end device OOM from model load | Medium | `device-profile` gates AI by tier | Mitigated |
| R6 | Version drift across 8 files | Low | `verify-release.mjs` fails the build on mismatch | Mitigated |
| R7 | Exchange holidays not modelled | Low | Documented limitation | Accepted |

## 6. Acceptance tests

| Requirement | Test | Status |
|---|---|---|
| Market keys never collide | `market-isolation.test.ts` | Passing |
| A stale switch cannot commit | `market-isolation.test.ts` | Passing |
| Indian search never appears in US history | `market-logic.test.ts` | Passing |
| ₹ never on a US figure; crore never on a US amount | `market-logic.test.ts` | Passing |
| Market status uses the exchange's timezone | `market-logic.test.ts` | Passing |
| "Where is Market Flows?" answers with the Flows tab | `assistant-app-awareness.test.ts` | Passing |
| A data question is NOT intercepted by app awareness | `assistant-app-awareness.test.ts` | Passing |
| Low-tier device gets no on-device AI | `device-profile.test.ts` | Passing |
| A 7B model is refused on a phone | `device-profile.test.ts` | Passing |
| No cross-market substitution anywhere | Screen-by-screen audit | Partial |

## 7. What is explicitly NOT planned

Real-time exchange feeds (licensed), proxy/UA rotation (refused), a hosted auth backend
(pending a user decision), and any fabricated benchmark or device result.
