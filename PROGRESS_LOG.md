# PROGRESS_LOG.md

## 2026-10-15 — Session 1
- Fetched `saayad566-tech/analyzerx` @ bdcc93fd into the sandbox; read the full tree (667 files),
  package.json, app.config, CI workflow, market infra, and the existing market tests.
- **Audit result:** confirmed the cross-contamination defect — India-only fixtures wired into Live
  Events, Sectors, Flows; Screener IN fallback; unscoped institutional-flows and graph procedures.
- Wrote the 7 memory files.

## 2026-10-15 — Session 1 (build)
### Delivered
- **Resource-pack architecture** (`lib/resource-packs/*`, 10 modules): a separate assets repository,
  a main file (`manifests/index.json`), per-market manifests, 1 MiB-bounded chunks, resumable
  download with retry/backoff, SHA-256 verification per chunk and per dataset, and atomic activation.
- **Market isolation**: `lib/market-dataset.ts` is now the single source of truth; Live Events,
  Sectors, Market Flows and the Screener read only the selected market. `market.institutionalFlows`
  and `graph.projection` are market-scoped; `event_projections` gained a `marketId` column.
- **Build tooling**: `scripts/build-resource-pack.mjs` + `scripts/resource-pack-format.mjs`.
- **Assets published** to a new separate repo `saayad566-tech/analyzerx-assets` (37 files: index,
  2 manifests, 22 chunks, 10 auditable sources, SHA256SUMS, README).

### Verified (evidence)
- `tsc --noEmit`: **0 errors**.
- New tests: resource-packs **22/22**, market-dataset-isolation **12/12**.
- Regression: market-data 8/8, market-regions 4/4, market-isolation 32/32, sector-intelligence 4/4,
  archive-exports-market-cap 4/4, news-market-isolation-dedup 3/3, indian-news-relevance 10/10,
  regional-collectors 3/3.
- SHA-256 checked against FIPS vectors and node:crypto, including the `length ≡ 55 (mod 64)` padding
  boundary — **a real bug found and fixed** (the naive `>>6 + 1` padding added a spurious block).
- Build tool ↔ runtime: every manifest digest, chunk digest and dataset digest reproduces on both
  sides; datasets reassemble byte-identical to their sources.
- **Published assets re-downloaded and fully verified by the app runtime** (36/37 byte-identical on
  the first pass; README re-uploaded and confirmed at 1767 bytes via the API — the raw CDN was stale).

### Notes / environment limits
- `vitest` cannot run in this sandbox (2 GB RAM; vite needs WebAssembly, which the 1.5 GB address-space
  limit cannot host). The same test files were executed through Node with esbuild bundling and the
  real installed dependencies. `pnpm install` succeeded only under `NODE_OPTIONS=--jitless`.
- Android APK build/device QA and credentialed live providers remain environment-gated (K6–K8).

### Next
- On a device/CI: install the packs end-to-end, then run the market-switch smoke path
  (IN → US → GB) on Live, Sectors, Flows, Screener and Graph.

## 2026-10-15 — Session 2 (A-to-Z audit pass)
Triggered by the "Ultimate Full-Stack Audit" brief.

### Audit results
- **Lazy/placeholder code:** 0 `TODO`/`FIXME`/`@ts-ignore`/`@ts-nocheck` in app code. Clean.
- **Safe area / layout:** every screen uses `ScreenContainer`/SafeArea; no missing insets. The one
  apparent gap (`app/(tabs)/assistant.tsx`) is a re-export of `market-chat.tsx`, which is correct.
  `width: 318` is a horizontal-carousel card, not a root container — not a defect.
- **Error containment:** `ErrorBoundary` is wired into the root layout and is well built.
- **Hardcoded secrets:** none found.
- **`any`:** 13 occurrences, all in vendor-style scaffolding (`lib/_core/*`, `server/_core/*`) parsing
  external payloads. Left alone deliberately (see KNOWN_ISSUES K10).

### Defects found and fixed
1. **Security — credential in logs.** `lib/_core/auth.ts` logged a **20-character prefix of the
   session token**, contradicting the file's own policy comment. Removed: presence only.
2. **Security — PII in logs.** The same file logged the **entire user object** (which carries
   `email`) on read and write. Now logs a non-identifying fact only.
3. **Broken UI promise.** `components/error-boundary.tsx` told the user a crash "can be reviewed in
   Diagnostics", but **no Diagnostics screen existed** and `loadLastCrash` had no consumer. Built it.
4. **Missing plain-English logging.** No `AI_RND_Activity_Log.txt` and no activity log existed.

### Added
- `lib/activity-log-core.ts` — pure: redaction, plain-English error phrasing, formatting, bounded
  ring buffer, issue-report builder. 15 tests.
- `lib/activity-log.ts` — device layer: AsyncStorage + `AI_RND_Activity_Log.txt` mirror (debounced),
  export, clear. Never throws.
- `app/diagnostics.tsx` — the Diagnostics screen: last crash, the activity log, export, copy bug
  report, clear, and the on-device file path. Reachable from Account → Diagnostics.
- ErrorBoundary now records crashes into the plain-English log.

### Verified (evidence)
- `tsc --noEmit`: **0 errors**.
- activity-log **15/15**, resource-packs 22/22, market-dataset-isolation 12/12, market-data 8/8,
  market-isolation 32/32, market-regions 4/4, sector-intelligence 4/4, news-market-isolation-dedup 3/3.
- The redaction tests caught two real gaps in my own first attempt (2-segment JWTs and bare
  20–39-character tokens leaked) — rules strengthened until green.

### Note on the brief
"Sandbox bypass via simulation" is **not** applied to results: nothing simulated is presented as a
real fix. Mocks are used only inside tests, where they belong. Physical-device APK QA and live
credentialed providers remain environment-gated and are reported as such, not faked.

## 2026-10-15 — Session 3 (domain audit: RN/Expo, integrations, logic, security, perf)
Triggered by the "Zero to Hero" audit brief (health score + flaw matrix format).

### Cleared (verified, not assumed)
- **Secure storage:** session tokens use `expo-secure-store` only; no token/secret in AsyncStorage.
- **Storage wrappers:** all 6 file-system imports are `expo-file-system/legacy` — uniform, no mismatch.
- **SSRF:** every server `fetch` targets a hardcoded host; user input enters only via
  `encodeURIComponent(...)` path segments. No user-controlled fetch target found.
- **SQL injection:** `sql\`\`` interpolations are drizzle-bound parameters, not string concatenation.
- **Listener/timer leaks:** all `BackHandler` subscriptions and the calendar `keydown` listener
  remove themselves; the debounce timers clear on unmount.
- **Hallucinated APIs / phantom components:** `tsc --noEmit` is clean, which proves every import,
  type and component reference resolves.

### Defects found and fixed
1. **High — push delivery breaks past 100 devices.** `server/db.ts:getEnabledPushTokens()` loaded
   **every** enabled token in one unbounded query, and `server/news-tracker.ts` posted them in a
   **single** Expo request. Expo accepts at most **100 messages per request**, so high-impact push
   notifications fail once more than 100 devices are registered. Now paginated, sent in pages of
   100, with a page bound.
2. **Medium — no retry/backoff on the optional-provider path.** `server/optional-providers.ts`
   `requestJson` had a timeout but no retry and no 429/5xx handling, unlike every other provider
   path in the codebase. Now retries transient failures with exponential backoff + jitter and
   honours `Retry-After`.
3. **Low — web stores user info (incl. email) in `localStorage`.** Unencrypted; documented rather
   than changed, because web auth is cookie-based and this is display metadata.

### Added
- `server/push-batching.ts` — shared batching limits + clamping (removes magic numbers).
- `tests/push-batching.test.ts` — 10 tests. Caught one real mismatch in my own first attempt
  (`Infinity` fell back to the default instead of clamping to the cap); fixed.

### Verified
- `tsc --noEmit`: **0 errors**.
- push-batching 10/10, activity-log 15/15, resource-packs 22/22, market-dataset-isolation 12/12,
  market-isolation 32/32 (plus market-data 8, market-regions 4, sector-intelligence 4,
  news-market-isolation-dedup 3, indian-news-relevance 10, regional-collectors 3).

## 2026-10-15 — Session 4 (zero-cost push engine, indexes, resilience)
Triggered by the FCM/VAPID brief.

### Built — free, provider-agnostic push engine
- `server/push-batching.ts` — provider selection (free Expo **or** free FCM HTTP v1), per-provider
  caps (Expo 100, FCM 500), token-shape checks, page arithmetic, jittered backoff, `Retry-After`
  parsing, and error classification for both providers (Expo `DeviceNotRegistered`; FCM
  `UNREGISTERED`/`NOT_REGISTERED`, `UNAVAILABLE`/`INTERNAL`/`QUOTA_EXCEEDED`).
- `server/push-delivery.ts` — the delivery loop with an **injectable transport**: cursor paging,
  per-page retry with backoff + jitter, dead-token deactivation, page bound, and honest summaries.
- `server/fcm-auth.ts` — FCM HTTP v1 service-account auth: real RS256 JWT signing via `node:crypto`,
  OAuth2 token exchange, cached access token. Returns failures as values, never throws.

### Changed
- `server/db.ts` — **cursor (keyset) pagination** replaces OFFSET for token reads, so deactivating
  dead tokens mid-run cannot skip a live device; added bounded `deactivatePushTokens`.
- `server/news-tracker.ts` — uses the delivery engine; picks FCM when configured, otherwise Expo;
  deactivates tokens the service reports as unregistered.
- `drizzle/schema.ts` — added the missing indexes on the hot paths: `news_events`
  (marketId+publishedAt, marketId+symbol+publishedAt, publishedAt, impactScore+publishedAt),
  `event_projections` (status+eventAt, marketId+status+eventAt, symbol+eventAt, storylineKey+eventAt),
  `source_records` (symbol+retrievedAt, retrievedAt, sourceKey+retrievedAt), `user_push_tokens`
  (userId+enabled+revokedAt).

### Verified (evidence)
- `tsc --noEmit`: **0 errors**.
- **174 tests passing across 14 files**, including the new push-batching 27, push-delivery 15,
  fcm-auth 11. The delivery loop is tested end-to-end with a stub transport — paging 250 tokens as
  100+100+50, cursor advancement, dead-token deactivation, 429-then-success retry, page bound, and
  the FCM path. The FCM JWT is verified by checking its signature against the matching public key.

### Deliberately not done
- `push_tokens.token` is already the primary key; the delivery query's `ORDER BY token` is served by
  it, so no extra index was added (it would be redundant and 2 KB wide).
- `markProviderHealthy`/`markProviderRejected` are synchronous, so the unawaited-call scan hits are
  false positives — no change made.

### Environment-gated
- Live FCM delivery cannot be exercised here (needs the operator's Firebase service account and a
  device). The transport is real and its logic is unit-tested; the live call is not claimed as
  verified. Expo remains the default free path when FCM is unconfigured.

## 2026-10-15 — Session 5 (quant R&D engine: real backtesting, no stubs)
Triggered by the "quant systems architect" brief. Two parts of that brief were already satisfied and
are NOT rebuilt: on-device local AI (real: pinned HF artifacts in `lib/local-ai-policy.ts`, Kotlin
modules in `plugins/local-ai-android/`, real probes in `workstation-runner/adapters.py`) and the
zero-cost push engine (session 4).

### Built — `lib/quant/` (pure, dependency-free, 81 tests)
- `types.ts`, `indicators.ts` — SMA, EMA (2/(n+1) seed), Wilder RSI, Wilder ATR, true range, rolling
  extremes, fractal swings, market-structure trend. Warm-up is `null`, never a fabricated value.
- `metrics.ts` — win rate, profit factor, expectancy, max drawdown, time-in-drawdown, CAGR,
  volatility, Sharpe, exposure. Uncomputable metrics are `null`, never a flattering default.
- `strategy.ts` — explicit rule list (AND entry, OR exit), precomputed series, and a **rule-based**
  `generateStrategyFromPrompt` (deterministic keyword mapping — not a fake LLM).
- `backtest.ts` — event-driven engine: signal on bar close, **fill on the next bar's open**,
  commission on both legs, adverse slippage, intrabar stops/targets, and when a bar touches both the
  **stop wins** (pessimistic). Refactored into a **generator** so the UI can show genuine per-bar
  progress instead of animating a fake bar over a blocking call.
- `ohlcv.ts` — strict CSV/JSON ingestion with quote-aware splitting, column aliasing, timestamp
  normalisation, validation and dedupe. Reports what it dropped and why.
- `stream-buffer.ts` — bounded `RingBuffer` + `BackpressureQueue` with explicit overflow policy and
  a visible degraded flag. This is the correct answer to "handle millions of ticks": a fixed memory
  ceiling with backpressure, not an unbounded array.
- `app/quant-lab.tsx` — the wired console: paste/clipboard or a clearly-labelled demo series,
  strategy prompt + presets, real progress bar and live log, metrics grid, trades and execution log.

### Bugs my own tests caught (fixed)
1. `maxHoldBars` off-by-one — held `N+1` bars instead of `N`.
2. `generateStrategyFromPrompt` missed the common "ema 10/30" phrasing (number after the keyword).
3. Stop/target percentages were only read when the number followed the word ("3% stop" failed).
4. Quoted CSV fields were not handled, so `"1,000"` corrupted a value.

### Verified
- 81 quant tests passing (indicators 16, backtest 27, ingestion 20, stream 16).
- Scoped **strict** tsc (with `noUnusedLocals`/`noUnusedParameters`) on `lib/quant` + quant tests:
  0 errors. Scoped tsc on the new screen and on `app/account.tsx`: 0 errors.
- Full-project `tsc --noEmit` passed earlier this session with the quant modules present. It could
  not be re-run at the end: jitless exceeds the 300s cap and non-jitless OOMs at the pod's ~500MB
  real heap ceiling. Every file changed *after* that pass was type-checked with a scoped config.

### Deliberately NOT done (and why)
- **Removing all limits / unbounded queries.** Refused on engineering grounds: an uncapped buffer or
  query converts a latency problem into an out-of-memory crash. Bounded buffers with backpressure
  and cursor pagination are what actually scales. See `stream-buffer.ts`.
- **A native file picker.** `expo-document-picker` is not a dependency, and adding one would break
  `pnpm install --frozen-lockfile` in CI. Paste/clipboard is used instead.

## 2026-10-15 — Session 6 (full-project type check closed; file picker added)
Triggered by the master directive, which (a) adopts the bounded-streams position argued in session 5
and (b) authorises lockfile synchronisation for missing dependencies.

### Closed the verification gap from session 5
The full-project `tsc --noEmit` could not complete in this pod (jitless exceeds the 300s cap;
non-jitless OOMs at a real ~500MB heap ceiling). Per the directive's "smart alternatives", the check
was split into three scopes and all three now pass with **0 errors**:
- A: `server/**`, `lib/**`, `drizzle/**`, `shared/**`, `constants/**`
- B: `app/**`, `components/**`, `hooks/**`
- C: `tests/**`, `scripts/**`, root `*.ts`
A first attempt produced two false errors (a missing `pako` declaration and a socket option type).
Root cause: a scoped config **replaces** `include`, so the project's ambient declarations
(`types/pako.d.ts`, `theme.config.d.ts`) were dropped. Adding them back cleared both. The code was
never wrong — the config was.

### Added — native CSV/JSON file picker (directive §2, lockfile sync)
- `expo-document-picker@~14.0.8` — the version Expo SDK 54 pins in `expo/bundledNativeModules.json`.
- `package.json` + `pnpm-lock.yaml` updated by a real `pnpm install` (lockfile now in sync, so
  `--frozen-lockfile` in CI keeps working).
- `app/quant-lab.tsx` — "Choose CSV / JSON" reads the picked file via `expo-file-system/legacy` and
  feeds it to the same strict parser (paste and the labelled demo series remain).

### Verified
- Scoped strict tsc A, B, C: 0 errors each (B re-run after the picker change).
- 81 quant tests still passing.

## 2026-10-15 — Session 7 (book-strategy library, fundamental screens, picks & shovels)
Triggered by the 100-book Strategy Lab brief and the master directive.

### Built (all pure, all tested)
- `lib/quant/fundamentals.ts` — real fundamental screening: earnings yield, EV, ROIC, NCAV / net-net,
  current ratio, D/E, P/E, P/B, P/S, PEG, ROE, EV/EBIT, EV/EBITDA, net margin, accruals ratio (Sloan),
  days sales outstanding. Ten named screens (Graham defensive, Graham net-net, Buffett quality, deep
  value EV/EBIT, Slater PEG, Fisher growth, O'Shaughnessy value, forensic red flags, Weinstein stage
  two, 100-bagger compounders) plus Greenblatt's Magic Formula **ranking**. Every metric is `null`
  when its inputs are missing, and a criterion is `passed: false` when it cannot be computed.
- `lib/quant/fundamentals-io.ts` — strict fundamentals ingestion (percentage strings → fractions,
  drops and reports bad records).
- `lib/quant/strategy-library.ts` — the reference catalogue of all **100** books with author, family
  and a one-line statement of each method, plus **22 entries with real runnable logic** (a price rule
  set the backtest engine executes, or a wired fundamental screen). The remaining 78 are marked
  `implemented: null` and labelled REFERENCE in the UI. The library does not pretend 100 books are
  100 algorithms.
- `lib/quant/supply-chain.ts` — layered picks & shovels classification (primary / secondary /
  tertiary) across three themes, with confidence scoring and an explicit `unmatched` list so a
  candidate is never force-fitted into a layer.
- `lib/quant/library-run.ts` — market-scoped execution with a **cross-market refusal**: a universe
  tagged for one market cannot be screened under another.
- `lib/quant/compliance.ts` — the compliance notice and backtest caveat in one place.
- `app/strategy-library.tsx` — the education panel: catalogue browser with family filters and
  search, RUNNABLE/REFERENCE badges, per-criterion screening rationale, Magic Formula rank table,
  supply-chain layer view, and the mandatory compliance badge.
- `app/quant-lab.tsx` — now carries the compliance badge, a link to the library, and accepts a
  `prompt` param so a library strategy opens straight into the backtest.

### Verified
- Scoped strict tsc (`app/**`, `components/**`, `hooks/**`, `lib/quant/**`) with `noUnusedLocals` /
  `noUnusedParameters`: 0 errors.
- **117 quant tests passing** (library/fundamentals/supply-chain added 36).
- Three real bugs my own work surfaced and fixed: a stub `implementationCoverage()` returning zeros
  (deleted, not shipped); `Fundamentals` missing the `description` field the parser set; and
  `MARKET_PROFILES` being an **array** indexed by string in the new screen (now `getMarketProfile`).

### Refused, with evidence
- **Multi-repo / monorepo sharding was NOT executed.** `expo export --platform web` — the only way
  to verify Metro resolves a workspace package — fails in this pod with
  `RangeError: WebAssembly.instantiate(): Out of memory` (undici's llhttp parser, the same cap that
  blocks vitest). A workspace conversion therefore cannot be verified here, and shipping it blind
  risks breaking the app bundle. Recorded as K17 with the exact error.

## 2026-10-15 — Session 8 (monorepo workspace + dynamic trailing-stop performance tracker)
Triggered by the monorepo/tracker directive.

### Monorepo workspace
- `pnpm-workspace.yaml` + two real packages: **`@analyzerx/core-types`** (the shared domain model —
  `MarketId`, `Candle`, `Trade`, `EquityPoint`, `BacktestMetrics`) and **`@analyzerx/quant-engine`**
  (indicators, metrics, backtest, strategy, OHLCV, bounded streams, fundamentals, the book library,
  supply chain, and the new tracker), each with its own `package.json` and strict `tsconfig.json`.
- Dependency direction is one-way: the engine imports core-types; the app imports both. The engine
  no longer imports anything from the application's `lib/` (verified by grep).
- `lib/quant/*.ts` are now **one-line compatibility shims** re-exporting the package, so not a single
  existing application import changed. The shims use **relative paths only**, which is deliberate:
  it introduces no new module-resolution behaviour, so Metro's resolution requirements are identical
  to the working repo. That is what makes the restructure safe to ship without a bundler here.
- `pnpm install --frozen-lockfile` passes with the workspace; `pnpm list -r` shows all three
  packages; per-package `tsc -p` is clean for both.

### New: dynamic trailing stop-loss performance tracker (`packages/quant-engine/src/tracker.ts`)
Implements the specified ladder exactly:
- −10% initial risk floor (the absolute maximum stop).
- At +10% gain the stop moves to break-even; at +15% to +5%; at +20% to +10%.
- Above the +20% step the stop trails the peak at a **10% gap up to +50%**, then tightens to a
  **5% gap above +50%**.
- The stop **ratchets upward only** — it can never fall back, which is the whole point of a trail.
- Peak is taken from the bar's high and the stop is tested against the bar's low, so an intrabar
  stop-out is caught.
- Dashboard: per-position entry/peak/final-stop/exit-reason/return plus MAE and MFE, and aggregate
  average, median, win rate, profit factor, best/worst, average bars held, max drawdown and an exit
  mix by reason.
- Wired into the Strategy Lab: a run now also tracks its own output and renders the ladder, the
  per-position log and the dashboard.

### Bug my own tests caught
The ladder used exact float comparisons, so `115/100 − 1 = 0.14999999999999991` fell through the
+15% step and landed on break-even. Fixed with an epsilon-tolerant `reached()`; two test series were
also corrected where the peak bar's own low legitimately breached the new stop on the same bar.

### Verified
- **142 quant tests passing** (tracker added 25).
- Per-package strict tsc: 0 errors. App + shims + packages in one scope: 0 errors.
- `pnpm install --frozen-lockfile`: exit 0.

### Metro verification — what I actually established
`expo export` fails at the CLI's HTTP layer (undici's WASM llhttp). Driving **Metro directly**
(`metro`'s `runBuild`) works and **resolved my modules**, but the transform stage then hits the same
WASM allocation ceiling on React Native's own polyfills. So: resolution is proven; a full bundle is
not possible in this pod. The restructure therefore adds no new resolution behaviour.
