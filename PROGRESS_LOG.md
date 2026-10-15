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
