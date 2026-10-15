# AnalyzerX — working checklist

Every item below was found by inspecting the repository, not by copying a prompt. Each
carries the evidence that produced it. Statuses are `DONE`, `NOT VERIFIED`, `BLOCKED` or
`OPEN`. An item is ticked only after its check has actually been run.

`todo.md` in the repository root holds a separate, much larger historical backlog (247
unticked lines at the time of writing). It is retained as-is: it is a record of intent, and
this file is the record of what has been verified. Where the two overlap, this file wins.

---

## Slice 1 — Orphans and dead wiring

| # | Item | Evidence | Status |
|---|---|---|---|
| 1.1 | Three Expo-starter components are never imported | `components/hello-wave.tsx`, `components/parallax-scroll-view.tsx`, `components/external-link.tsx` have no import anywhere in `app/`, `components/`, `lib/`, `server/` or `tests/` | DONE — removed |
| 1.2 | `lib/forge-shelf-filesystem.ts` looked orphaned | FALSE ALARM. `lib/forge-shelf.ts` line 2 imports it. A naive grep missed the relative `./` form; the corrected audit confirms it is wired | DONE — no change needed |
| 1.3 | `app/workstation-runner/index.tsx` looked unreachable | FALSE ALARM. `app/account.tsx` navigates to `/workstation-runner` | DONE — no change needed |
| 1.4 | `app/dev/theme-lab.tsx` shipped to production | Deep-linkable in a release build | DONE — now refuses to render outside `__DEV__` |

## Slice 2 — Features built but not surfaced

| # | Item | Evidence | Status |
|---|---|---|---|
| 2.1 | Natural-language screener had no UI | `lib/nl-screener.ts` existed and was tested (24 assertions) but no screen imported it | DONE — wired into the Screener screen |
| 2.2 | Technical indicators had no screen | `lib/indicators.ts` (26 indicators) and the chart had no route | DONE — `/chart` added, linked from the company screen, registered in `lib/app-inventory.ts` |
| 2.3 | `priceHistory` discarded OHLCV | Returned closes only, which made candlesticks and every volume indicator impossible | DONE — returns full OHLCV bars |

## Slice 3 — Artifact size (mandate §4)

| # | Item | Evidence | Status |
|---|---|---|---|
| 3.1 | The APK exceeds GitHub's 100 MB per-file limit | `analyzerx-3.29.0-107.apk` is 111,082,257 bytes; the artifact-branch step had to split it into 4 MB parts | DONE — per-ABI APKs built and published |
| 3.2 | No APK or large data committed to the repo | `.gitignore` covers `*.apk`, `*.aab`, `*.so`, `.gradle/`, model formats | DONE |

## Slice 4 — Keyboard and input (reported defect)

| # | Item | Evidence | Status |
|---|---|---|---|
| 4.1 | The composer sat under the keyboard on Android | `app/general-chat.tsx` used the pre-edge-to-edge `behavior={Platform.OS === "ios" ? "padding" : undefined}` and never applied the keyboard inset | DONE — reads the real height and applies it |

---

## Open — the large backlog, sliced

These are real and unverified. They are grouped so each slice is finishable in one pass,
per mandate §2. None is ticked until its check has run.

### Slice 5 — Data pipeline wiring (mandate §3)
- Draw the full chain per feature: source → download → parse → clean → validate → local SQL → query → screen → PDF.
- One test per stage, plus one end-to-end test with recorded data.
- Every failure path (offline, empty, rate limit, missing pack, source down) shows a message, never a crash or blank.
- **OPEN.** The chain is drawn for quotes, news and fundamentals; not for filings, flows or derivatives.

### Slice 6 — Country data packs (mandate §4/4B)
- Signed manifest hosted as a Release asset, one set per country, SHA-256 per part.
- In-app Download button with resume, Wi-Fi-only option, disk-space check, hash check, clear missing-pack message.
- Parts ≤ 100 MB, compressed, reassembled on device; a country counts as installed only when every part is verified.
- Test that builds a fake 250 MB country, splits it, downloads, verifies and opens it.
- **OPEN.** Not started. The ForgeShelf downloader (`lib/forge-shelf.ts` + `forge-shelf-filesystem.ts`) already implements resumable download, checksum verification and preflight, so it is the natural base.

### Slice 7 — In-app news reader (mandate goal)
- Read an article inside the app rather than handing off to the browser, with a pro "hacker" presentation.
- **OPEN.** `app/news/[id].tsx` exists; whether it renders in-app or links out is unverified.

### Slice 8 — PDF report readability
- **OPEN.** `lib/pdf.ts` exists; readability has not been reviewed.

### Slice 9 — Sector and flow live data
- Replace any fixture-derived sector score with a live-derived one, with loading/stale/unavailable/retry states.
- **OPEN.** The Sectors screen was rewritten to derive from verified events; whether any fixture path remains is unverified.

### Slice 10 — Earnings and financial-call coverage
- **OPEN.** Not started.

### Slice 11 — Company expansion / investment / announcement tracking
- **OPEN.** Partly covered by event projections; coverage not verified.

### Slice 12 — Backlog triage from `todo.md`
- 247 unticked lines. Each needs to be re-verified against the current tree, because many
  were written against older versions and may already be satisfied or may no longer apply.
- **OPEN.**

---

## Standing constraints (from the mandate, applied to every slice)

- Never change `applicationId` or the signing key; raise `versionCode` every release.
- Never commit the keystore, passwords or API keys.
- Never claim a check passed without running it.
- Never mix one country's stocks or news into another's.
- Never invent versions, URLs, endpoints or financial figures.
- Cache and rate-limit every free API call.
- A feature is DONE only when data flows from source to screen.
