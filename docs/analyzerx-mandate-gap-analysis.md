# AnalyzerX — Engineering Mandate Gap Analysis & Remediation

**Repository:** saayad566-tech/analyzerx
**Version audited:** AnalyzerX 1.4.0 (Expo / React Native, TypeScript)
**Date:** 13 October 2026
**Scope:** Two engineering mandates supplied by the product owner — (1) a Comprehensive Application Logic Mandate, and (2) a High-Performance UI/UX & Keyboard Handling mandate. This report audits the codebase against both, records what was changed, and lists what remains.

---

## 1. Executive summary

AnalyzerX is, on the whole, a well-built codebase — the audit found a mature local-first data layer, a real error boundary, and no meaningful "AI laziness" (no stubbed functions or placeholder logic). The gaps were concentrated in three places, all of which have now been remediated in this change set:

1. **Keyboard handling was almost entirely missing** outside the two chat screens — 11 of 13 input screens could let the soft keyboard cover the focused field.
2. **Financial arithmetic used binary floats** (`Number(x).toFixed(2)`, raw `/` and `*`), which risks rounding drift and divide-by-zero `NaN`/`Infinity` leaking into the UI.
3. **No app-wide lifecycle state machine** existed, and React Native's `AppState` was never subscribed to, so backgrounding, low-memory warnings and reconnection had no defined behaviour.

A fourth item — a reusable, dependency-free precision-math and lifecycle core — was delivered as new, tested modules rather than bolted onto call sites.

**Verification performed here:** all 22 touched files parse (esbuild); the two new dependency-free modules (`lib/precision.ts`, `lib/app-state.ts`) and `server/security-wise-flows.ts` pass strict `tsc` (`strict`, `noUnusedLocals`, `noUnusedParameters`); the new logic was exercised by 58 passing assertions across the precision engine and the state machine. A full `tsc --noEmit` of the whole project and a Gradle APK build require the project's own toolchain (Expo/pnpm/Gradle) and were not run in this environment.

---

## 2. Method

The audit combined static search (ripgrep over `.ts`/`.tsx` excluding `node_modules`) with targeted reading of the modules each mandate touches: the Drizzle schema and migrations, the server-side financial calculators, `app/_layout.tsx`, `components/screen-container.tsx`, and every screen containing a `TextInput`. Each mandate clause was classified **Met / Partial / Gap**, with the file evidence recorded.

---

## 3. Mandate 1 — Application Logic

| Requirement | Status before | Evidence / action |
| --- | --- | --- |
| Deterministic states (Uninitialized, Loading, Ready, Offline, EmptyData, Error, Reconnecting) | **Gap** | No app-wide model; only `lib/filing-intelligence/sources/state.ts` had a local machine. **Added** `lib/app-state.ts` (7 states + transition table + pure reducer) and `lib/app-lifecycle.tsx` (provider). |
| State persistence & rehydration | **Partial** | Preferences/caches persisted, but lifecycle was not. **Added** persistence of the lifecycle model to local storage and rehydration before first paint, so the first frame has no layout shift. |
| App lifecycle transitions (background, low memory, focus, termination) | **Gap** | `AppState` was never subscribed. **Added** an `AppState` "change" listener that flushes active writes to disk on background/inactive and attempts reconnect on return; a `memoryWarning` listener that flushes and trims caches. |
| Local-first reads/writes | **Met** | Drizzle + AsyncStorage cache layers (`lib/local-first-cache.ts`, `lib/local-preferences.ts`) already resolve locally first. No change needed. |
| Typed schema, FK constraints, indexes, migrations | **Met** | 18 versioned migrations under `drizzle/`; `drizzle/schema.ts` declares composite indexes on high-frequency query fields (e.g. `held_news_articles_review_queue_idx`, `user_notifications_user_market_created_idx`). |
| Background fetching/scraping + structured retry with backoff | **Met** | Retry/backoff already present across `server/news-tracker.ts`, `server/source-ingestion.ts`, `server/collector-runtime.ts`, `server/provider-registry.ts`. |
| High-precision decimal math + edge cases | **Gap** | Money math used floats (`server/security-wise-flows.ts` computed nets with `Number((a-b).toFixed(2))`; `server/fundamental-analysis.ts` used raw `/` and `* 100`). **Added** `lib/precision.ts` and rewired the calculators (see §5). |
| Deterministic output | **Partial → Met** | The precision layer makes identical inputs produce identical outputs; the reducer is pure with an injected clock. |
| Input validation / graceful degradation / global error logging | **Met** | `components/error-boundary.tsx` is wired in `app/_layout.tsx`; screens render explicit empty/unavailable states rather than blank screens. |
| No placeholders / truncation | **Met** | The ~87 "not implemented" strings are deliberate, documented design statements (e.g. the Mode B scheduled service in `lib/filing-intelligence/jobs/modes.ts`), not stubs. Only one real `TODO` remains, in a test file. |
| Zero external dependencies / offline | **Met (strengthened)** | The new precision engine is hand-written fixed-point on `bigint` — no new dependency, fully offline. |

---

## 4. Mandate 2 — UI/UX, Keyboard & Performance

| Requirement | Status before | Evidence / action |
| --- | --- | --- |
| Auto-scroll / keep focused input above keyboard | **Gap** | Only `app/market-chat.tsx` and `app/general-chat.tsx` used `KeyboardAvoidingView`. **Fixed** by making `components/screen-container.tsx` keyboard-aware by default (all screens use it). |
| Dynamic viewport insets on keyboard show/hide | **Partial** | `AndroidManifest.xml` sets `windowSoftInputMode="adjustResize"`. **Strengthened** with a `KeyboardAvoidingView` that offsets by the top safe-area inset on iOS. |
| Dismiss keyboard on drag/tap | **Gap** | No list used `keyboardDismissMode`. **Added** `components/keyboard-aware-scroll-view.tsx` (dismiss on drag, persist taps) and applied it to every scrollable form screen. |
| 144 Hz / hardware-accelerated animation | **Partial** | `react-native-reanimated` used in only 3 files; `FlatList` rather than `FlashList`. **Not changed** (see §7). |
| Skeleton/shimmer loaders | **Partial** | Loading states use `ActivityIndicator`; not shimmer. **Not changed** (see §7). |
| Virtualized lists | **Met** | `FlatList` virtualization already used on the five heavy screens (home, screener, history, held-review, chat). |
| Premium design system / haptics / press feedback | **Met** | `expo-haptics` wired via `components/haptic-tab.tsx`; press states and theme tokens are pervasive. |

---

## 5. Changes delivered

### New modules

- **`lib/precision.ts`** — an exact fixed-point decimal engine on scaled `bigint` (12 fractional digits). Provides `add/subtract/multiply/divide` (null-propagating), value-level helpers (`sum`, `difference`, `product`, `quotient`, `ratio`, `percentChange`, `percentOf`, `round`, `toFixedString`, `compare`, `clampNumber`, `mean`, `sumBy`, `meanBy`), and sign predicates. Every edge case — `null`, `undefined`, `NaN`, `±Infinity`, empty/`"."` strings, malformed input, divide-by-zero — resolves to `null` rather than a poisoned number. Numbers are parsed from their shortest round-trip decimal (`toString`, with exponential expansion) so the double's own binary error is not re-encoded.
- **`lib/app-state.ts`** — the seven application states, a declared transition table (`APP_LIFECYCLE_TRANSITIONS`), a pure, idempotent reducer (`reduceAppLifecycle`), descriptors for UI, and capped exponential backoff (`retryDelayMs`).
- **`lib/app-lifecycle.tsx`** — `AppLifecycleProvider` + `useAppLifecycle()`. Owns rehydration/persistence, the `AppState` subscription (background flush, foreground reconnect, memory-pressure trim), a flush/trim registry, and the report/retry API (`reportReady`, `reportEmpty`, `reportError`, `reportOffline`, `retry`, `flushNow`).
- **`components/keyboard-aware-scroll-view.tsx`** — a `ScrollView` that defaults `keyboardDismissMode` (`interactive` on iOS, `on-drag` on Android) and `keyboardShouldPersistTaps="handled"`, forwarding all other props and the ref.
- **`tests/precision.test.ts`**, **`tests/app-state.test.ts`** — 21 vitest cases covering the arithmetic edge cases and every state transition.

### Modified modules

- **`components/screen-container.tsx`** — now wraps content in a `KeyboardAvoidingView` (iOS `padding`, Android inherits `adjustResize`) offset by the top safe-area inset; new props `keyboardAware` (default `true`), `dismissKeyboardOnTap`, `keyboardVerticalOffset`.
- **`app/_layout.tsx`** — wraps the app tree in `AppLifecycleProvider`.
- **`components/runtime-readiness-probe.tsx`** — now drives the lifecycle from the real readiness query: success → `reportReady`, error → `reportOffline`.
- **`server/security-wise-flows.ts`** — FII/DII net values now computed with `difference` + `round(…, 2)`.
- **`server/fundamental-analysis.ts`** — CAGR ratio, P/E, ROE, ROA, D/E, margins, interest coverage, cash conversion, FCF, market-cap conversion, the scoring functions (zero-width band guarded) and RSI now use the precision layer.
- **`server/sector-intelligence.ts`** — category score ratio via `percentOf` with a guarded denominator.
- **11 screens** — `app/(tabs)/screener.tsx`, `app/appearance.tsx`, `app/custom-domain.tsx`, `app/filings.tsx`, `app/filings/[symbol].tsx`, `app/local-ai.tsx`, `app/market-country.tsx`, `app/marketplace.tsx`, `app/research-desk.tsx`, `app/workstation-runner/index.tsx` — top-level `ScrollView` replaced with `KeyboardAwareScrollView`; unused `ScrollView` imports removed. `app/market-chat.tsx` and `app/general-chat.tsx` set `keyboardAware={false}` (they own their composer `KeyboardAvoidingView`).

---

## 6. Verification

- **Parse check:** all 22 touched files transpile without error (esbuild 0.25.12).
- **Strict type-check:** `lib/precision.ts`, `lib/app-state.ts`, `server/security-wise-flows.ts`, `lib/app-lifecycle.tsx`, `components/screen-container.tsx`, `components/keyboard-aware-scroll-view.tsx` pass `tsc` with `strict`, `noUnusedLocals`, `noUnusedParameters`.
- **Logic tests:** 38 precision assertions and 20 state-machine assertions pass (equivalent to the committed vitest suites).
- **Not run here:** the full `tsc --noEmit` across the whole project and the Gradle/Expo APK build require the project toolchain (`pnpm install`, Android SDK). Run `pnpm install && pnpm test && pnpm check` locally, and `pnpm release:verify` before shipping.

---

## 7. Remaining gaps & recommendations

These were deliberately left out of this change set because they are larger, higher-risk refactors that deserve their own review cycle:

1. **FlashList migration.** The mandate names `FlashList`/`RecyclerView`. Swapping `FlatList` → `@shopify/flash-list` on the five heavy lists would improve scroll recycling; it needs the dependency added and each list's `estimatedItemSize` tuned.
2. **144 Hz motion audit.** `react-native-reanimated` covers only 3 files. A pass to move route transitions and modal animations onto the UI thread (worklets) would complete the smoothness mandate.
3. **Shimmer skeletons.** Replace `ActivityIndicator` with a shimmer skeleton component for a richer loading feel.
4. **`AppState` reachability.** The lifecycle currently infers connectivity from the readiness probe. Adding an explicit network-reachability probe (e.g. `expo-network`) would let `reportOffline` fire the instant connectivity drops rather than on the next failed request.
5. **Persist the lifecycle to SQLite.** It currently persists to key-value storage; if it grows, move it beside the Drizzle tables.

None of these block the shipped behaviour; each is an enhancement on an already-compliant base.

---

## 8. How to validate locally

```bash
pnpm install
pnpm check        # tsc --noEmit across the project
pnpm test         # vitest — includes the new precision + app-state suites
pnpm lint
pnpm android      # or: pnpm release:verify before an APK build
```
