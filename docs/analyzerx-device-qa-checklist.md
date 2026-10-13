# AnalyzerX — Physical-Device QA Checklist (arm64 Android)

**Status: PENDING REAL-DEVICE EXECUTION.**

This checklist has **not** been executed. No physical Android device, Android SDK/NDK or
`adb` is attached to the environment in which this repository was prepared, so no
installation, launch, navigation or visual verification has occurred. Nothing here may be
reported as passed until a person (or an authorised device-testing environment) runs it and
records evidence in the Actual result and Evidence columns.

**How to use this table.** For each row: follow the Procedure, compare against the Expected
result, and record the Actual result, the Evidence (screenshot id / log line / video
timestamp), and a Status. Status values: **PASS**, **FAIL**, **NOT TESTED** (blank = NOT
TESTED). A FAIL needs a filed defect with reproduction steps.

---

## 0. Session record

| Field | Value |
|---|---|
| Tester | |
| Date | |
| Device model | |
| Android version | |
| APK filename | |
| APK source (CI release tag / local build) | |
| Version / version code | |
| APK size (bytes) | |
| APK SHA-256 | |
| SHA-256 matches the published `.sha256`? | |
| Signing verified (`apksigner verify --verbose`)? | |

---

## 1. Installation and launch

| ID | Procedure | Expected result | Actual result | Evidence | Status |
|---|---|---|---|---|---|
| 1.1 | `adb install <apk>` | Installs with `Success`, no error | | | |
| 1.2 | Launch the app from the launcher | First screen renders within a few seconds | | | |
| 1.3 | Observe for 60 s | No crash, no ANR | | | |
| 1.4 | Cold start (force-stop, relaunch) | Stable; no blank or frozen frame | | | |
| 1.5 | Trigger notifications feature | `POST_NOTIFICATIONS` requested at the right moment, not on first launch | | | |

## 2. Navigation — every primary screen

For each row: open the screen by tapping through the UI (not a deep link), then navigate back.

| ID | Screen | Route | Expected result | Actual result | Evidence | Status |
|---|---|---|---|---|---|---|
| 2.1 | Home / Live | `app/(tabs)/index.tsx` | Renders; no overlap or clipped text | | | |
| 2.2 | Alerts | `app/(tabs)/alerts.tsx` | Renders; rules listed | | | |
| 2.3 | Assistant | `app/(tabs)/assistant.tsx` | Renders; input usable | | | |
| 2.4 | Flows | `app/(tabs)/flows.tsx` | Renders; tabs switch | | | |
| 2.5 | Graph | `app/(tabs)/graph.tsx` | Renders; nodes/edges drawn | | | |
| 2.6 | Screener | `app/(tabs)/screener.tsx` | Renders; filters usable | | | |
| 2.7 | Sectors | `app/(tabs)/sectors.tsx` | Renders | | | |
| 2.8 | Storylines | `app/(tabs)/storylines.tsx` | Renders | | | |
| 2.9 | Company detail | `app/company/[symbol].tsx` | Renders for a real symbol | | | |
| 2.10 | Filings | `app/filings.tsx` | Renders | | | |
| 2.11 | News detail | `app/news/[id].tsx` | Renders; original-source link opens | | | |
| 2.12 | Research Desk | `app/research-desk.tsx` | Renders | | | |
| 2.13 | Market chat | `app/market-chat.tsx` | Renders; send works | | | |
| 2.14 | Local AI | `app/local-ai.tsx` | Renders; mode selector present | | | |
| 2.15 | Marketplace / ForgeShelf | `app/marketplace.tsx` | Renders; catalogue visible | | | |
| 2.16 | Account | `app/account.tsx` | Renders | | | |
| 2.17 | Appearance / Settings | `app/appearance.tsx` | Renders; theme change applies | | | |
| 2.18 | Back navigation from every screen above | Returns to the previous screen, never to a blank route | | | | |

## 3. State handling

| ID | Procedure | Expected result | Actual result | Evidence | Status |
|---|---|---|---|---|---|
| 3.1 | Open a data screen on a slow connection | Loading indicator appears, then resolves | | | |
| 3.2 | Open a screen with no data | Informative empty state, not a blank panel | | | |
| 3.3 | Force a request failure | Error state with retry/back; no hang | | | |
| 3.4 | Open a screen whose source is down | Field/section labelled Unavailable; the rest still renders | | | |
| 3.5 | Leave a failing screen for 30 s | No infinite spinner | | | |

## 4. Data-dependent flows

| ID | Procedure | Expected result | Actual result | Evidence | Status |
|---|---|---|---|---|---|
| 4.1 | Search a partial Indian symbol (e.g. `relia`) | Selectable result appears | | | |
| 4.2 | Tap a search result | Company detail opens for the right entity | | | |
| 4.3 | Refresh Indian filings | BSE/SEBI/NSE items appear with real URLs | | | |
| 4.4 | Open a filing report | Report opens | | | |
| 4.5 | Open a news article and its source link | Article detail and original source open | | | |
| 4.6 | Create an alert rule | Rule is saved and appears in the list | | | |
| 4.7 | Change a preference, force-stop, relaunch | Preference persists | | | |

**Important — do not fake completeness.** For every data screen, distinguish a valid
**Unavailable** state from real analysis. An honest "Unavailable" state is a PASS for 3.4;
a screen showing fabricated or unlabelled numbers is a FAIL. Do not require invented
financial values to make a screen look complete.

## 5. Network and offline

| ID | Procedure | Expected result | Actual result | Evidence | Status |
|---|---|---|---|---|---|
| 5.1 | Disable network, open a data screen | Clear message; no crash | | | |
| 5.2 | With cached data present, open offline | Cached results usable where supported | | | |
| 5.3 | Re-enable network | Refresh recovers | | | |

## 6. Native Local AI

| ID | Procedure | Expected result | Actual result | Evidence | Status |
|---|---|---|---|---|---|
| 6.1 | Open Local AI, select Local mode | Native bridge initialises (`liblitertlm_jni.so`) | | | |
| 6.2 | Run an inference if a model is present | Produces output; no crash | | | |
| 6.3 | Deny/withhold the native model | Graceful failure; app remains usable | | | |
| 6.4 | Switch to Auto/Connected when Local is unavailable | Falls back without claiming Local is active | | | |

## 7. Defects and evidence

| ID | Item | Expected | Actual | Evidence | Status |
|---|---|---|---|---|---|
| 7.1 | Crash logs captured | Full logcat for any crash | | | |
| 7.2 | Screenshot per screen | One screenshot per screen above | | | |
| 7.3 | Reproducible defects filed | Steps + expected/actual + log | | | |

## 8. Sign-off

| Field | Value |
|---|---|
| Executed by | |
| Date | |
| Device(s) | |
| APK SHA-256 | |
| Overall result | NOT TESTED |

> To let the release-readiness gate consume this, write `docs/device-qa-evidence.json`:
> `{ "executed": true, "device": "<model>", "androidVersion": "<ver>", "apkSha256": "<hash>", "failed": 0 }`.
> Until then the gate reports Physical-Device QA as **NOT VERIFIED**, and it never counts as a pass.
