# AnalyzerX — Fixes 03–08 and Prompts 1–2 (v3.7.0)

This document records, for each workstream, the root cause found in the code, the
change made, and how it is verified. It is written after the changes, from the
code, not from intent.

Verification legend: **unit** = covered by a committed vitest suite; **local** =
also exercised by a standalone harness during development; **CI** = type check,
full test suite and Android build run in GitHub Actions before any APK ships.

---

## FIX 03 — Invalid story dates, duplicates, news normalization

**Root cause found.** `lib/open-data/sources.ts` built the GDELT publication date
by fixed string slicing and then called `.toISOString()` on the result. When the
provider value did not match the expected shape, `new Date(...)` produced an
invalid date and `.toISOString()` **throws** `RangeError: Invalid time value`.
Three RSS paths used `Date.parse` guards but still conflated publication time
with retrieval time, and nothing deduplicated near-identical headlines.

**Change.** New `lib/news-normalization.ts`:
- `parsePublicationDate` handles ISO 8601 (with/without offset), RFC 2822 (RSS),
  the GDELT `YYYYMMDDTHHMMSSZ` shape, 14-digit and 8-digit compact forms, and
  epoch seconds vs milliseconds — the latter only when the magnitude matches the
  declared unit. A missing date is `null` + `unknown`; it is never replaced with
  the current time. Future dates and pre-1990 values are rejected.
- `dedupeArticles` merges only genuine copies (same canonical URL, same provider
  id, or near-identical headline from the **same host**); two different articles
  that mention the same company are kept.
- `filterByPublicationWindow` separates undated from out-of-window records.
- `formatPublicationLabel` returns "Publication date unavailable" for an
  untrusted date, so the literal text "Invalid Date" cannot reach a card.

Wired into all four parse sites in `lib/open-data/sources.ts`.

**Verification.** `tests/news-normalization.test.ts` (34 assertions); local
harness 34/34. The GDELT malformed-shape cases are asserted not to throw.

---

## FIX 04 — Live tracker operational states

**Root cause found.** `app/(tabs)/index.tsx` computed the badge, the headline,
the provider count and the "Automatic collection is active" sentence from four
different signals, so the panel could claim automation while showing zero
configured providers.

**Change.** New `lib/tracker-state.ts` derives ONE of nine states (unconfigured,
configuration-incomplete, checking, healthy, stale, request-failed,
authentication-failed, server-unavailable, empty-success, success-with-items)
from the real tracker inputs, and every label is a pure function of that state.
`trackerAutomationClaim` refuses the automation claim unless a durable scheduler
exists; the in-app foreground interval is not one, so the app now describes
itself as on-device/best-effort. A successful empty poll is `ok`, not an error.

Wired into the tracker panel; the provider count now comes from
`providers.list` (the registry), not a guess.

**Verification.** `tests/tracker-state.test.ts`; local harness 203/203 including
180 state combinations.

---

## FIX 05 — Sector mapping, invalid NSE index, deterministic scores

**Root cause found.** `lib/open-data/engine.ts` built an index symbol by
concatenation: `key.startsWith("NIFTY") ? key : "NIFTY" + key`. "Renewable
Energy" became `NIFTYRENEWABLEENERGY`, the source layer threw, and the raw
`SourceError: Unknown NSE index: …` string was surfaced to the UI through
`limitations`. Separately, the sector overview rendered hard-coded numbers
("82 / 100", "+7 pts since last week", "Updated 2m ago") with no traceable input.

**Change.**
- New `lib/sector-registry.ts`: a verified registry of the 15 NSE indices whose
  constituent files are actually published, plus an explicit `unsupported` list
  for themes with no official index (renewable energy, capital goods, defence,
  railways). `resolveSector` never throws and never invents a symbol.
- `sectorConstituents` now resolves through the registry and returns a structured
  `status` (`supported` | `unsupported` | `error`) with a human-readable `reason`
  instead of a raw exception string. `lib/open-data/link.ts` propagates it.
- New `lib/sector-score.ts`: a versioned, documented weighted formula that returns
  the score **with** its inputs, coverage, weights, missing-data rule and
  timestamps; `Unavailable` when nothing is available, `Provisional research
  score` below 75% coverage. It is explicitly not labelled "institutional buying
  strength".
- `app/sector/[name].tsx` shows the registry reason in its empty state.

**Verification.** `tests/sector-registry.test.ts`; local harness 88/88.

---

## FIX 06 — FII/DII freshness, period comparisons, filter semantics

**Root cause found.** Two distinct defects. (1) `percentChange` in
`server/nse-flows.ts` divided by `Math.abs(previous)`, so a sign flip from −100 to
+100 was reported as "+200%". (2) In `app/(tabs)/flows.tsx` the Buyback and
government-benefit options were **sort keys only** — they reordered the list and
never filtered it, so aggregate FII/DII cards stayed visible under a Buyback
filter.

**Change.** New `lib/flows-semantics.ts`:
- `percentChangeConvention` returns `null` with a stated reason for a zero
  denominator and for a sign reversal.
- `isTradingSession` / `latestTradingSession` / `resolveFlowPeriod` resolve a
  requested range against the sessions that exist, keep report date separate from
  retrieval time, and say plainly when today's report is not published and name
  the latest available session.
- `matchesSignalFilter` / `applyFlowFilters` **restrict** the dataset, and return
  an explicit empty reason rather than padding with unrelated cards.

Wired into `nse-flows.ts` (percentage convention) and the flows screen (signal
filters now filter, with an honest empty state).

**Verification.** `tests/flows-semantics.test.ts`; local harness 22/22.

---

## FIX 07 — Verified storyline storage and relationship graph

**Root cause found.** No traceable event contract existed: nothing guaranteed that
a persisted event carried a stable id, its article ids, a validated publication
time, its evidence chain and a verification status — and nothing prevented a
relationship edge from being created without evidence.

**Change.** New `lib/event-schema.ts` defines the traceable event (stable
idempotent key, article ids, evidence references with a per-article
`publicationVerified` flag, first-seen and retrieval times, entity mentions with
resolution confidence, verification status) and the relationship edge (source
event, evidence, direction, confidence **with a rationale**, period, confirmed vs
inferred, contradictory flag). `isEdgeSupported` rejects an edge with no source
event, no evidence, no source URL, or no rationale — so a relationship can never
be inferred from keyword or time proximity. `dedupeEdges` is idempotent and keeps
contradictory edges separate from confirmed ones.

**Honest limitation.** The graph screen's existing empty state is retained and is
now backed by `emptyGraphReason`, which states exactly which dependency is
missing. No synthetic relationships were created — the acceptance criterion
explicitly prefers an honest empty state to fabricated data.

**Verification.** `tests/event-schema.test.ts`; local harness 20/20.

---

## PROMPT 1 — Production-ready local model download

**Root cause found.** `lib/local-ai.ts` accepted a downloaded artifact when its
**length** matched the manifest, and never compared the pinned SHA-256 — so a
corrupt file of exactly the right length would be treated as usable. There was
also no guard against two concurrent downloads of the same model.

**Change.** New `lib/local-ai-integrity.ts`:
- `verifyModelArtifact` returns `verified-checksum`, `size-verified-only`,
  `size-mismatch`, `checksum-mismatch` or `missing`. It only reports
  checksum-verified when a digest was actually computed and matched.
- `canRunInference` refuses inference for a missing, unchecked, incomplete or
  corrupt artifact.

Wired into `downloadLocalAIModel` (verify before keeping, discard on failure) and
`getLocalAIModelState` (expose the verdict). Added a concurrent-download guard.
Added a `sha256` React method to the native module (both copies) that hashes on a
background executor and resolves `null` when it cannot, so the JS layer reports
"size-verified only" honestly rather than claiming a verification it did not do.

The Qwen3 0.6B LiteRT model remains a pinned, revision-addressed Hugging Face
artifact (~498 MB) with a recorded SHA-256; nothing is bundled in the APK.

**Verification.** `tests/local-ai-integrity.test.ts`; local harness 11/11.
**Not verified here:** end-to-end device download and inference (see PROMPT 2).

---

## PROMPT 2 — Real LiteRT inference

**Status: not verifiable in this environment, and not claimed.**

There is no Android device, emulator, Java toolchain, Android SDK or native LiteRT
runtime in the build sandbox. CI compiles the Kotlin module and the app, which
proves it **builds**; it does not prove device inference. The existing 3.5.0 work
(engine lifecycle, conversation hygiene, off-main-thread streaming via the native
executor) is unchanged by this task apart from the added `sha256` method.

**Manual device test procedure (not executed here):**
1. Install the v3.7.0 APK on a 64-bit Android device with ≥ 4 GB RAM and ≥ 3 GB
   free storage.
2. Open Local AI, select Qwen3 0.6B LiteRT, start the download, and confirm
   progress, size and the integrity verdict shown on completion.
3. Interrupt mid-download (airplane mode), confirm it resumes rather than
   restarting, then confirm completion.
4. Load the model and send two consecutive messages; confirm the second does not
   reload the engine and returns decoded text.
5. Force-stop and reopen; confirm the model is still reported as downloaded.
6. Attempt inference with the file truncated on disk; confirm it is refused.

---

## FIX 08 — Regression audit

See the audit table in the chat response. Every claim there is limited to what was
actually executed: unit suites and local harnesses were run in the sandbox; the
type check, full test suite and Android build are run by CI on the commit.

**Not done / remaining:** device inference (PROMPT 2), a live end-to-end tracker
poll against a real provider from a device, and the relationship-graph population
path (which needs a permitted source that yields two entities in one document with
a shared, evidenced relationship).
