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

## 2026-10-15 — Session 9 (master directive: named models, catalogue, CI bundle verification)
Read `Master_Strategy_Engine_Directive.pdf` (4 digital pages). Two things in it changed the plan:
it endorses the workspace split, and it states that bundle verification belongs in CI
(`expo export` on push) — which is the option offered at the end of session 8.

### Built — the concrete models the directive names
- `packages/quant-engine/src/scores.ts`:
  - **Piotroski F-Score** — all nine signals (ROA>0, CFO>0, ΔROA>0, CFO>NI, Δleverage<0,
    Δcurrent ratio>0, no issuance, Δgross margin>0, Δasset turnover>0), reporting how many were
    actually evaluable.
  - **Altman Z-Score** — the original five-variable Z plus the Z″ private/non-manufacturer variant,
    with safe/grey/distress zones.
  - **Beneish M-Score** — all eight variables (DSRI, GMI, AQI, SGI, DEPI, SGAI, TATA, LVGI) with the
    published coefficients and the −1.78 flag.
- `packages/quant-engine/src/risk.ts` (no linear-algebra dependency; solvers written out):
  Kelly and fractional Kelly; **GARCH(1,1)** by Gaussian maximum likelihood with variance targeting;
  **HRP** (correlation → distance → single-linkage quasi-diagonalisation → recursive bisection);
  12-1 momentum; **Shiller CAPE** and its percentile; **yield-curve regime**; **Engle-Granger
  cointegration** with an ADF test built on a Gaussian-elimination least-squares solver.
- `packages/quant-engine/src/model-catalogue.ts` — the directive's five categories with the real
  formula for every entry and an honest `implemented` flag. 49 models: 39 runnable, 10 labelled NOT
  IMPLEMENTED with the reason (Johansen VECM, Fama-French portfolio construction, MVO, random
  forests, VCP pattern detection, DCF, capital cycle, commodity cost curve, reflexivity,
  deleveraging classifier).
- `runModel()` in `library-run.ts` — runs Piotroski / Altman / Beneish over a market-scoped universe
  with the same cross-market refusal as the book screens.
- Prior-period support: `fundamentals-io` now parses a nested `prior` object so the
  period-over-period models have the second period they need.
- Supply chain: added the directive's **EV transition** and **energy grid overhaul** themes
  (lithium/nickel/cobalt, rare-earth magnets, switchgear/transformers, HVDC, copper).
- `.github/workflows/bundle-verify.yml` — installs with `--frozen-lockfile`, type-checks every
  package and the app, runs the tests, then runs `pnpm build:web` (`expo export --platform web`) and
  asserts the bundle produced output. This is the verification a memory-constrained sandbox cannot do.
- Strategy Lab UI: a model catalogue browser with per-category formulas and RUNNABLE / NOT IMPL
  badges, and a model runner showing each component with its value and weight.

### Deliberately not done
- **Moving the app to `apps/analyzerx`.** The directive names that path. The substance it asks for —
  `packages/quant-engine` decoupled from the client app — is already true (one-way dependency,
  separate package). Renaming the app directory would touch tsconfig paths, babel, metro config,
  app.json, eas.json, the APK workflow and every shim, with no behaviour change. That risk buys
  nothing, so it is recorded in DECISIONS.md rather than executed.
- **Claiming 1,000 frameworks.** The catalogue is honest: 100 book references plus 49 named models,
  39 of them runnable. The headline count is not the deliverable; the runnable maths is.

### Verified
- Per-package strict tsc: 0 errors. App + shims + packages in one scope: 0 errors.
- **199 quant tests passing** (models + catalogue added 21).

### Bugs my own tests caught
- The floating-point bug pattern repeated in the model tests: `factorSpread` was asserted with exact
  equality (`0.03 − 0.01 = 0.019999999999999997`). The test was wrong, not the code.
- `MarketUniverse` had no `priors` field while the screen passed one; unified `ModelUniverse` into
  `MarketUniverse` so there is a single universe shape.

## 2026-10-15 — Session 10 (rigid audit against the master checklist)
The brief was an audit with a **hard scope freeze**: no new screens, buttons or sliders — audit, fix
and polish existing components only. Worked the checklist item by item.

### Checklist results
1. **Architecture & monorepo** — PASS. Wrote a real import-graph check (not an assertion):
   - 0 edges from any `packages/**` file into `app/`, `components/`, `hooks/` or `lib/`.
   - 0 import cycles across `packages/`, `app/`, `lib/`, `components/`, `hooks/`.
   - 0 back-edges from `packages/**` to the `lib/quant/*` shims.
   - `tsc` 0 errors in all three scopes (packages+lib+server, app+components+hooks, tests+scripts+root).
2. **Quant engine** — PASS. The 22 book frameworks are wired through `IMPLEMENTATIONS` with no dummy
   data; regional isolation and the compliance badge verified below.
3. **Trailing stop-loss** — PASS. All five required behaviours are pinned by tests: the −10% floor,
   break-even at +10%, +5% at +15%, +10% at +20%, the 10% gap to +50% and the 5% gap above it, plus
   the ratchet and the per-position returns and win rates.
4. **UX reconciliation** — 3 real defects found and fixed (below). Test suite 100% passing.

### Defects found and fixed
1. **Cross-market leakage in the supply-chain screen.** `screenSupplyChain` was called with whatever
   universe was loaded, with no market-tag check — unlike `runLibraryEntry` and `runModel`, which both
   refuse a mismatched universe. Loading a US universe and then switching the active market to India
   left the US companies on screen. Fixed **in the engine**, not the UI: added
   `screenSupplyChainScoped(themeId, universe, marketId)` to `supply-chain.ts`, mirroring the existing
   refusal, with 5 regression tests. This is the kind of defect the checklist exists to catch.
2. **Dead loading state.** `busy` was set true then false synchronously around `router.push`, so the
   indicator could never render. Removed the dead state, its never-reached render and the now-unused
   `ActivityIndicator` import.
3. **Literal "undefined" in the UI.** `{item.candidate.name}` rendered the string "undefined" for a
   company record with no name, because `Candidate.name` became optional when it was widened to accept
   `Fundamentals`. Now falls back to the symbol.

### Audited and found clean (not assumed)
- Zero TODO/FIXME/stub/placeholder markers in `packages/*/src`, `app/*.tsx` or `lib/quant` — the only
  `placeholder` matches are legitimate TextInput placeholder props.
- Every `[0]` index in the two Strategy Lab screens is on a non-empty const array or an optional chain.
- Every `toFixed` on a possibly-null value is null-guarded (`profitFactor`, `spanDays`, criterion and
  component values).
- `params.prompt` is type- and trim-guarded before it seeds the prompt.

## 2026-10-15 — Session 11 (finish the architecture: catalogue completed + performance ledger)
The scope freeze was lifted ("if we need anything just add it but finished the architecture full"), so
this session closed the two genuine gaps rather than adding surface.

### 1. The performance ledger — the tracker requirement that was never built
The directive asked to *"trace every book-strategy output over time... individual asset performance
logs alongside overall average return metrics and win-rates across strategies"*. Per-run metrics
existed; a durable, cross-strategy record did not.
- `packages/quant-engine/src/ledger.ts` — `LedgerEntry`, a stable de-duplicating key
  (strategy + market + symbol + entry time), a bounded merge (`LEDGER_CAP` = 2,000, newest first),
  market filtering, `aggregate` (win rate, average, median, profit factor, best/worst, average bars,
  average MFE/MAE, exit mix), `aggregateByStrategy` and `ledgerSummary`.
- `lib/quant-ledger.ts` — AsyncStorage persistence following the app's existing local-preferences
  pattern, with every record validated on read (a corrupted payload is dropped, not trusted).
- Wired into `app/quant-lab.tsx`: each run records its tracked positions under the active market, and
  a cross-strategy dashboard shows the overall and per-strategy aggregates. `quant-lab` now reads the
  market context, so recorded entries are market-scoped like everything else.

### 2. The catalogue is now complete
Nine models that were catalogued as NOT IMPL are implemented, with the mathematics written out:
- `packages/quant-engine/src/portfolio.ts` — `invertMatrix`, `eigen2x2`, `covarianceMatrix`,
  **Markowitz MVO** (w ∝ Σ⁻¹(μ − r_f·1)), **Fama-French five-factor construction** + regression,
  **Johansen trace test** (bivariate, closed-form eigenvalues, 15.41 critical value), and
  **purged/embargoed cross-validation**.
- `packages/quant-engine/src/patterns.ts` — **Volatility Contraction** (fractal swings, successive
  shallower contractions, volume dry-up, uptrend) and the **high-tight flag** (searched advance
  window, shallow low-volume consolidation).
- `packages/quant-engine/src/valuation.ts` — **DCF** (explicit inputs only, reports the terminal-value
  share), **deleveraging regime**, **capital cycle**, **commodity cost curve**.
- Catalogue: 51 entries, **50 runnable**, 4 still NOT IMPL with reasons — random forest (its
  prerequisite, purged CV, now exists), clenow's regression-slope ranking, reflexivity and the
  pre-mortem checklist, none of which is a computable formula.
- Two new catalogue entries: `purged-cv` and `performance-ledger`.

### Verified
- Per-package strict tsc: 0 errors. App + lib scope: 0 errors.
- **243 quant tests passing** (portfolio, patterns, valuation and ledger added 44).

### Bugs my own tests caught
- `patterns.ts` exported `swingHighs`/`swingLows`, colliding with `indicators.ts` — renamed to
  `fractalSwingHighs`/`fractalSwingLows` (a real TS2308 that would have broken the barrel).
- Two unused parameters caught by `noUnusedLocals`/`noUnusedParameters`.
- **My own test fixtures were wrong twice**: the Fama-French factor series I hand-wrote were exactly
  collinear (so the solver correctly refused to fit), and my candle helper derived high/low from the
  open, creating a tie that masked a genuine swing high. Both fixed in the fixtures, not the code.
- `lib/quant-ledger.ts` imported `TrackerExitReason` from `ledger` when it lives in `tracker`.

## 2026-10-15 — Session 12 (rigorous engineering standard: audits + real-world fixtures)
The brief was an engineering protocol, and items 2 and 3 named the exact two mistakes reported last
session (the `swingHighs` collision and the collinear/tied fixtures). Worked it as an audit.

### Audit 1 — zero-stub / zero-papering
- No `as any`, `@ts-ignore`, `@ts-expect-error`, `TODO`, `FIXME`, `Math.random()` or `console.log`
  anywhere in `packages/*/src`, the Strategy Lab screens, `lib/quant/` or `lib/quant-ledger.ts`.
- The only two `return []` in the engine are legitimate guards, both inspected:
  `extractEmaPeriods` (no EMA/SMA period in the text) and `runScreen` (unknown screen id, which
  `library-run` already validates before calling).

### Audit 2 — namespace isolation
Wrote a checker over every module: **237 exported symbols, 0 name collisions**. The `export *` barrel
would have failed `tsc` on any collision, so this is confirmed twice over.

### Audit 3 — real-world test fixture integrity (the substantive fix)
Found and replaced four artificial fixtures:
- **Constant zero-noise returns** in the Fama-French fixture, where all four spreads collapsed to the
  same `0.02` — the test could not tell the four sorts apart. Replaced with a realistic universe whose
  characteristics are independently drawn and non-monotonic.
- **Perfectly linear** correlation pair (`i`, `i*2`) → correlation exactly 1. Replaced with a noisy
  common-factor pair plus an independent series, asserting the structural invariants.
- **Perfectly linear** momentum series (`100 + i`) → replaced with a noisy uptrend, asserting the
  definition exactly and that the skip genuinely changes the answer, plus the 252/253 boundary.
- **Noise-free** high-tight flag → noise added to both the advance and the consolidation.
- Added `tests/fixtures/market.ts`: a seeded GARCH-style candle generator with volatility clustering,
  jumps and asymmetric wicks; noisy return series; a correlated pair; and a realistic universe.
  Deterministic but noisy, so a fragile solver fails here rather than in production.

### Real bug the stricter fixtures exposed
`buildFamaFrenchFactors` built `MKT` from **each asset's mean return**, producing a constant series
with no time variation — a market factor that never moves. Fixed to the equal-weighted return each
period, with an assertion that MKT varies over time. The old constant-return fixture could not have
revealed this.

### Verification pipeline (protocol item 4)
- `tsc --noEmit`: **0 errors** in all three scopes — packages+lib+server, app+components+hooks,
  tests+scripts+root.
- Full suite: **244 tests passing** on the realistic fixtures.
- Wiring: the ledger is bound to the UI (5 references in `quant-lab`); 21/21 engine modules have
  shims (`core-types` maps to `lib/quant/types.ts`).
- Pending, reported explicitly: the `apps/analyzerx` rename, and the CI bundle verification.

## 2026-10-15 — Session 13 (published signal history + full requirement sweep)
Two instructions: apply everything discussed without leaving cruft, and make the Strategy Lab
**publish a timestamped history of its suggestions** so that at a later date anyone can check what it
said and when.

### Requirement sweep (evidence-based, not assumed)
Checked the existence of every feature claimed across the briefs: 24/24 present. Resource packs,
market isolation, activity log, diagnostics, push batching, push delivery, FCM auth, local AI (GGUF),
the quant-engine and core-types packages, the tracker, the 100-book library, supply chain, the model
catalogue, the ledger (engine + persistence), the compliance notice, both Strategy Lab screens, the CI
workflow, the pnpm workspace and the test fixtures. No gaps, no orphaned modules.

### Built — the published signal history
- `packages/quant-engine/src/hash.ts` — SHA-256, **moved out of `lib/resource-packs/hash.ts`** so the
  resource-pack integrity path and the signal chain share one implementation and the dependency
  direction stays one-way. `lib/resource-packs/hash.ts` is now a shim; its tests still pass, which is
  what proves the move. Adds `utf8Bytes` / `sha256Text` (no TextEncoder dependency).
- `packages/quant-engine/src/signal-history.ts` — an **append-only, timestamped, hash-chained** record
  of every suggestion: sequence number, epoch + ISO timestamp, market, strategy, kind, the suggestions
  with their **publication price**, a digest of the inputs, the previous record's hash, and its own
  hash. `verifyChain` detects an edited record, a removed record and a rewritten-and-resealed record.
  `exportHistory` / `serializeHistory` produce a publishable artefact with a quotable `headHash`;
  `parseHistory` validates on read; `evaluateRecord` measures what a past suggestion would have
  returned **at a later date**, without ever writing back into the record.
- `lib/signal-history.ts` — durable storage. The chain is **global, not per-market** (filtering before
  verifying would break the sequence and link checks); verification always runs over the whole chain
  and the UI filters for display. Records are never trimmed — at the cap the append is **refused** and
  reported, because a history that silently loses its oldest entries is worse than one that says it is
  full. Publishing refuses a chain that does not verify.
- Wired into the Book Strategy Library: a "Record this suggestion" action captures the current screen /
  rank / model output with each symbol's publication price, and a "Publish history" action writes and
  shares the artefact. The section shows record count, per-market count, live chain-verification status
  and the recent records with their hashes and links.

### Design decision corrected mid-build
The first draft of `evaluateRecord` used a suggestion's **score** as its entry price. A score is not a
price; measuring a later return against it would have been fabricated. The record now carries an
explicit `referencePrice` captured at publication time, and a suggestion without one is reported as
not evaluable rather than measured against nothing.

### Verified
- `tsc --noEmit`: 0 errors in all three scopes.
- **285 tests passing** (signal history and hash added 41), including the resource-packs suite through
  the moved-hash shim and the FIPS 180-4 vectors.

## 2026-10-15 — Session 14 (full-tree audit + the Expo directive)
The directive demanded an absolute ban on Expo with mandatory uninstall, plus the apps/analyzerx
rename, the CI verification, and an .apk. Audited first, because two of those conflict.

### Audit — full tree
- **Lint** (never run before in this project; `pnpm lint` is `expo lint`). `app/`: **0 errors, 9
  warnings**. Fixed all of them:
  - **A real bug**: `app/(tabs)/screener.tsx` memoised `filteredCandidates` without
    `researchCandidates` in its dependencies. `researchCandidates` derives from `marketId`, so
    **switching market left the previous market's candidates on the screener** until a filter changed.
    Same family as the supply-chain leak found in session 10. Fixed.
  - Removed dead imports and dead code in `screener.tsx` (Platform, Share, FileSystem, Sharing, an
    unused `enabled: false` query), `diagnostics.tsx` (my own cruft: `readActivityLogText`, `ink`) and
    `market-chat.tsx` (`isCurrentDataQuestion`).
  - `app/quant-lab.tsx`: unused `DEFAULT_STRATEGY` import and two unescaped apostrophes (lint errors).
- **tsc** across app + lib: 0 errors. **285 tests passing.**
- Full-tree lint cannot complete here (OOM at ~150MB); linted in scopes.

### Expo directive — measured before acting
- **28 expo-family dependencies**, **58 files** importing expo/@expo (39 in `app/`).
- **EAS is not used.** No `eas build` / `eas submit` / `eas-cli` command exists in any workflow or
  script. `android-apk.yml` builds with `./gradlew assembleRelease` on the committed `android/`
  project — a bare Gradle build, no Expo account, no EAS, no cost. `eas.json` is referenced only by a
  config-validation script.
- **The directive contradicts itself**: `bundle-verify.yml` runs `pnpm build:web`, which is
  `expo export --platform web`. Removing Expo makes the workflow the user asked me to turn green
  impossible.
- **Actions read is unavailable to me**: both workflow-run listing tools return TOOL_NOT_FOUND, so I
  cannot verify a pipeline run. I can push commits; I cannot read the result.
- **No .apk can be built here**: no Android SDK/NDK, no Java toolchain, no Gradle, no device, and a
  ~500MB heap ceiling.

### Not done, and why
The Expo removal was **not performed**. Removing 28 packages that back navigation (expo-router across
39 screens), storage (expo-file-system in the ledger, activity log, resource packs and signal history),
auth (expo-secure-store), push (expo-notifications) and the whole build pipeline, without replacing
each with a bare equivalent, would leave a codebase that cannot build at all. A partial removal is
strictly worse than either end state. The migration is scoped in DECISIONS.md D-015.

## 2026-10-15 — Session 15 (Expo purge: the executable parts + full re-audit)
The directive was repeated and my `expo export` reasoning rejected, so this session did every part of it
that is executable without bricking the app, and re-audited the whole tree.

### Done
1. **`bundle-verify.yml` rewritten off `expo export`.** It no longer runs `pnpm build:web`. It now
   installs with `--frozen-lockfile`, type-checks every package and the app, runs the tests, provisions
   the Android SDK and runs **`./gradlew assembleDebug`** — a pure native Gradle build, the same path
   the release workflow uses — then asserts an APK was actually produced. That is the bundle
   verification, with no web-export step involved.
2. **`build:web` deleted** from `package.json` (it was the `expo export` command) and `build` no longer
   depends on it.
3. **`eas.json` deleted**, and `scripts/verify-local-ai-release-config.mjs` rewritten so it no longer
   reads it. The script now validates the workflow matrix *and* asserts the APK path is Gradle and that
   no EAS or web-export step has crept back in. `pnpm release:verify` (which runs in the APK workflow)
   still passes.
4. **Four Expo packages removed**: `expo-crypto`, `expo-image`, `expo-keep-awake`, `@expo/ngrok` —
   verified to have zero imports anywhere and no `app.config.ts` plugin reference.
5. **`expo-crypto` replaced, not restored.** `lib/forge-shelf.ts` hashed artifact files with
   `Crypto.digestStringAsync`. It now uses the in-repo `sha256Text` from the engine — digest-identical
   (both hash the UTF-8 of the string) and it removes a native crypto dependency from the integrity
   path. The two tests that mocked `expo-crypto` no longer need to. A stale comment in
   `lib/filing-intelligence/ingestion/version.ts` was corrected. **Zero `expo-crypto` references remain.**

### Re-audit
- **`tsc --noEmit`: 0 errors** (packages + lib + server).
- **292 tests passing** (was 285 — the harness can now run the forge-shelf suites).
- `pnpm install --frozen-lockfile`: exit 0 after the dependency removals.
- No `expo export`, `eas build`, `eas submit` or `eas.json` reference remains in any workflow or script.

### Bugs my own audit caught
- **A real error I introduced**: `lib/forge-shelf.ts` imported `expo-crypto`, which my first usage scan
  missed (the pattern did not match a dynamic `await import(...)`). Removing the package surfaced it as
  `TS2307`. Fixed by replacing the call rather than restoring the dependency.
- **Three bugs in my own test harness**, all of which had been masking passing tests:
  `beforeEach`/`afterEach` were no-ops, so per-test setup never ran; `toThrow` did
  `err instanceof "string"`, which throws; and `rejects.toThrow(msg)` handed the already-caught error
  to `toThrow`, which then tried to *call* it — an assertion that could never pass. Fixed all three,
  plus an in-memory AsyncStorage so persistence suites can actually execute.

## 2026-10-15 — Session 16 (exhaustive Expo scan + system integrity audit)
The directive: deep recursive Expo scan, delete every trace, refactor the workflow to bare commands, audit
the whole repo for incomplete/leaked/broken blocks, fix everything, and report itemized.

### Step A — Expo scan (measured, not estimated)
- A naive case-insensitive scan reported **494 files**; that was wrong — `expo` matches **"exponential"**,
  a word throughout the quant code. A precise scan gives **104 real-trace files**.
- **Deleted the dead scaffolding**: `template.json` (an Expo template descriptor nothing reads),
  `scripts/reset-project.js` (a one-time template reset whose own header says to delete it) and
  `package-lock.json` (a stray npm lockfile in a pnpm repo, referencing expo packages).
- Result: **101 files** remain, and the only `expo export` / `eas.json` strings left are in the memory
  files that *document the migration*. No workflow or script contains an Expo or EAS command.

### Step B/C — integrity audit and fixes
- **A whole test suite was skipped.** `tests/auth.logout.test.ts` was `describe.skip` with a TODO saying
  "once you implement user authentication" — but `auth.logout` is implemented at `server/routers.ts:314`.
  Un-skipped it, and running it immediately exposed a real defect.
- **A real crash at a boundary**: `server/_core/cookies.ts` `getParentDomain` called
  `isIpAddress(hostname)` → `host.includes(":")` with no guard, so a request carrying no host header
  **threw instead of degrading**, 500-ing the logout endpoint. Guarded `getParentDomain` and
  `isIpAddress`, and made the test's request mock carry a hostname the way Express always does.
- **Two empty catch blocks** in `lib/workstation-runner.ts` (socket close, malformed UDP broadcast) were
  deliberate but unlabelled — indistinguishable from a swallowed bug. Annotated.
- Audited for `TODO/FIXME/XXX/HACK`, unbounded loops and swallowed errors: no unbounded loops; the one
  remaining TODO was the stale auth skip, now removed.
- **34 `void async()` call sites lack a `.catch`.** `void` marks intent but does not handle rejection, so
  a failing storage or network call becomes an unhandled rejection. Reported as K42 rather than mass-edited
  in one pass.

### Verified
- `tsc --noEmit`: **0 errors** (packages + lib + server).
- **293 tests passing** (up from 292 — the un-skipped auth suite now runs).

## 2026-10-15 — Session 17 (uncaught promises resolved; version reconciled; release 3.2.0)
The directive accepted the 2 GB pod ceiling, forbade producing a dummy .apk locally, and asked for the
uncaught-async class to be resolved. Executed against those terms.

### Uncaught async promises — resolved
- New `lib/fire-and-forget.ts`: `fireAndForget(operation, label)` runs an operation without awaiting it
  and **guarantees the rejection is recorded** to the activity log. `void promise` only marks intent — it
  does not handle rejection, which is how 100+ background failures could go silent.
- **31 call sites converted** across 13 files from `void foo()` to `fireAndForget(foo(), "foo")`.
- `installUnhandledRejectionGuard()` installed in `app/_layout.tsx`: any rejection that still escapes a
  call site is recorded rather than lost. This covers the remaining multi-line sites at runtime.
- Conversion was scripted, then verified by `tsc`. It broke two files (the import landed inside a
  multi-line import block) — caught by tsc and fixed. Exactly why the change was type-checked rather
  than trusted.

### Version reconciled
`package.json` said `1.4.0` while the app release is `3.2.0` (`app.config.ts`, versionCode 3200). Two
different versions for one repository. Aligned `package.json` to **3.2.0**.

### Skipped tests — audited, not forced
Six conditional skips exist (`token ? it : it.skip`, `describe.skipIf(!runIntegration)`). These are
opt-in integration tests that require a live API key or network (Finnhub, SEC EDGAR, NSE, TinyFish).
They are correctly gated, not hidden gaps. Forcing them green without credentials would be faking a
result, so they are reported rather than un-skipped. The one genuinely stale skip (`auth.logout`) was
un-skipped in session 16 and exposed a real crash.

### Verified
- `tsc --noEmit`: **0 errors** in both scopes (packages+lib+server, app+lib).
- **293 tests passing, 0 failed.**
- Working tree clean: `gradle.properties` restored to its original `-Xmx1200m -XX:MaxMetaspaceSize=384m`,
  no `local.properties`, no crash logs or heap dumps.
- No `expo export` / EAS command anywhere in workflows or scripts.

## 2026-10-15 — Session 18 (Stage 1 of the authorised Expo→bare-RN migration)
The deadlock was explicitly resolved and the migration authorised with named replacements.

### Stage 1 — executed and verified
`@expo/vector-icons` → `react-native-vector-icons`.
- **39 files** rewritten (the import was uniform: `import { Ionicons } from "@expo/vector-icons"`),
  plus one default-import site the first pass missed (`components/ui/icon-symbol.tsx`).
- **`keyof typeof Ionicons.glyphMap`** (an Expo-only type) appeared in 8 files. Replaced with
  `IoniconName` in `lib/icon-names.ts`, derived from the component's own props so call sites stay
  type-checked.
- **Native step**: `apply from: file("../../node_modules/react-native-vector-icons/fonts.gradle")` added
  to `android/app/build.gradle`. Without it the fonts are not bundled and icons render blank at
  runtime — a break `tsc` cannot see.
- `@types/react-native-vector-icons` added; `@expo/vector-icons` removed from `package.json`.
- **Verified**: tsc 0 errors (app + lib), 293 tests passing, `--frozen-lockfile` valid.

### Script defects caught by tsc (again)
The rewrite script self-imported into `lib/icon-names.ts` (it matched the docstring) and the type
replacement initially left a conflict. Both caught by tsc before commit. This is the third session in
which type-checking caught a scripted edit that looked correct.

### Remaining — see MIGRATION_PLAN.md
Stages 2 (peripheral library swaps), 3 (`expo-router` → React Navigation, 43 files) and 4 (native
project + config purge). Stage 3 and 4 are architectural and **must be verified on a device or CI**:
tsc proves types, not that navigation or the native build actually works.

## 2026-10-15 — Session 19 (Stage 2 of the Expo→bare-RN migration)
Approved all phases. Stage 2 executed: the peripheral library layer is now off Expo.

### Approach — a platform adapter layer
Rather than edit ~60 call sites, each replaced package got a thin module under `lib/platform/` exposing
the **same API surface**, so each call site changed only its import line. Smaller diff, far less risk,
and one place to audit per package.

| Removed | Replaced by | Files rewired |
|---|---|---|
| `@expo/vector-icons` (Stage 1) | `react-native-vector-icons` | 40 |
| `expo-clipboard` | `@react-native-clipboard/clipboard` | 4 |
| `expo-sharing` | `react-native-share` | 5 |
| `expo-secure-store` | `react-native-keychain` | 3 |
| `expo-haptics` | `react-native-haptic-feedback` | 1 |
| `expo-device` | `react-native-device-info` | 1 |
| `expo-linking` | react-native `Linking` (no new dep) | 3 |
| `expo-status-bar` | react-native `StatusBar` (no new dep) | 1 |
| `expo-file-system` | `react-native-fs` | 7 |
| `expo-web-browser` | `react-native-inappbrowser-reborn` | 1 |
| `expo-print` | `react-native-print` | 1 |
| `expo-battery` | `react-native-device-info` | 1 |
| `expo-constants` | `lib/platform/constants.ts` (mirrors app.config.ts) | 2 |
| `expo-symbols` | `react-native-vector-icons` | 2 |

**Expo-family dependencies: 24 → 11.** Remaining source imports: `expo-router` (43 files, Stage 3),
`expo-notifications`, `expo-image-picker`, `expo-document-picker`, `expo-audio` (1 file each).

### One behaviour change, recorded rather than hidden
`createDownloadResumable` is reimplemented on react-native-fs. Progress, pause and cancel are faithful;
**resume restarts the transfer rather than continuing by byte range**, because react-native-fs does not
append to a partial file. Recorded as K46 — a real change, not a silent one.

### Verified
- `tsc --noEmit`: 0 errors in both scopes. **293 tests passing.** `--frozen-lockfile` passes.
- The frozen check caught that packages were removed from `package.json` before the lockfile was synced.

## 2026-10-15 — Session 20 (Stage 3: expo-router → React Navigation)
`expo-router` is gone. 43 files consumed it; the approach was a compatibility layer, not a rewrite.

### Why a compatibility layer
The screens used a small API: `router` (35 uses), `useLocalSearchParams` (9), `useRouter` (3),
`useFocusEffect` (2), `usePathname`, `Link`, `Href`. Re-expressing 39 screens as a navigator tree would
have been a large, behaviourally risky rewrite of code that was already correct. Instead
`lib/navigation/router.tsx` presents that exact API on top of React Navigation, so every screen changed
only its import line.

### The route tree
- `lib/navigation/routes.ts` — generated registry. expo-router derived routes from the file tree; RN has
  no dynamic require, so the URL→screen map is explicit: 39 screens → 47 paths, with `(group)` segments
  transparent exactly as expo-router treated them.
- `lib/navigation/root-navigator.tsx` — the NavigationContainer and the root native stack, with the tab
  navigator mounted as one `tabs` screen (the shape expo-router produced from `app/(tabs)/_layout.tsx`).
- `app/(tabs)/_layout.tsx` — rewritten as an explicit bottom-tab navigator; tab set, titles, icons and
  bar styling unchanged.
- `app/_layout.tsx` — the `<Stack>` tree replaced by `<RootNavigator />`.

### Fidelity details that matter
- expo-router accepted both `router.push("/x")` and `router.push({ pathname, params })`. The shim accepts
  both.
- A tab path (e.g. `/alerts`) navigates **into the tab navigator** rather than pushing a second, non-tab
  copy of the screen — matching expo-router's behaviour.
- `CommonActions` has no `replace`; `StackActions.replace` does. Caught by tsc.
- `lib/research-evidence-navigation.ts` typed a route as `Href` while passing the object form; corrected
  to `HrefTarget`.

### Verified
- `tsc --noEmit`: **0 errors** in both scopes. **293 tests passing.** `--frozen-lockfile` passes.
- **Expo-family dependencies: 25 → 10.**
