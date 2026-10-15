# AnalyzerX — Remaining Blockers

> **Update — superseded on two points.** This document was written when no database
> server and no emulator were available in the working environment. Both gaps have since
> been closed: the migration, backfill and rollback were executed against a real
> MariaDB 10.11 server (30/30 checks), and the APK was installed, launched and exercised
> on a real Android 14 emulator (passed). Statements below that say device/emulator
> validation was NOT RUN, or that the live migration was BLOCKED, no longer hold.
> See `docs/ANALYZERX_VERIFICATION_REPORT.md` for the current state.


Each blocker states the exact obstacle and the next legitimate action.

## B1 — No Android toolchain in the build environment (BLOCKED)

**Obstacle:** `java`, `javac`, `gradle` and `adb` are absent, and system package
installs are unsupported. The APK therefore cannot be built here.

**Workaround in use:** GitHub Actions builds and signs the APK. CI runs 48–72.

**Next action:** none required — the CI route works. It does cost roughly 13–15
minutes per build.

## B2 — No device or emulator (BLOCKED)

**Obstacle:** no adb, no emulator, no physical device. Every UI change — the keyboard
fix, the market chips, the per-category coverage row — is unverified on hardware.

**Next action:** the user installs `analyzerx-3.24.0-94.apk` on a device and reports
what the Market & Country screen shows. This is the single highest-value outstanding
verification, and only the user can perform it.

## B3 — Isolation modules not yet threaded through every screen (PARTIAL)

**Obstacle:** `market-isolation`, `market-format`, `market-session` and
`market-scoped-store` are built and unit-tested, and the switch lifecycle is wired
into `market-context.tsx`. They are **not** yet called from every screen's live query
key, formatter and storage read.

**Consequence:** some screens still hold data in unscoped keys and use a global
formatter. The isolation is real where wired, absent where not.

**Next action:** mechanical, screen by screen. Highest-value targets, in order:
`app/(tabs)/index.tsx`, `app/(tabs)/screener.tsx`, `app/company/[symbol].tsx`,
`app/(tabs)/flows.tsx`.

## B4 — Hosted authentication needs a backend (BLOCKED, needs a user decision)

**Obstacle:** a real sign-up/OTP/social flow needs a server and provider credentials
— paid and networked, against the zero-cost/offline constraint.

**Next action:** the user decides: accept a backend plus provider credentials, or
keep authentication local-only. Not an engineering call.

## B5 — Real-time quotes are licensed (BLOCKED, cannot be fixed by code)

**Obstacle:** genuine real-time exchange data is a licensed product in every market.
Free endpoints return delayed data only.

**What is done instead:** delayed quotes are labelled as delayed, and no real-time
claim is made anywhere.

**Next action:** a licensed feed adapter, if the user obtains an entitlement. The
adapter point exists; the entitlement does not.

## B6 — FinBERT is inert without a token (BLOCKED)

**Obstacle:** the sentiment model needs a Hugging Face token, which must stay
server-side. None is configured.

**Behaviour:** it returns `not-configured` honestly rather than a fabricated score.

**Next action:** the user supplies a token in the server environment, never in the
client bundle.

## B7 — Exchange holiday calendars not modelled (KNOWN LIMITATION)

**Obstacle:** holidays are not modelled, so a holiday renders as a normal trading day.

**Reason for not guessing:** a fabricated calendar is worse than a documented gap.

**Next action:** a maintained per-exchange calendar source, if one is found that is
free and machine-readable.

## B8 — MCP GitHub multi-file commit times out intermittently (WORKAROUND)

**Obstacle:** `GITHUB_COMMIT_MULTIPLE_FILES` times out on large batches.

**Workaround:** per-file `GITHUB_CREATE_OR_UPDATE_FILE_CONTENTS`. Reliable.

## B9 — Remaining unbuilt requirements (NOT STARTED)

Import pipeline (PDF/HTML/CSV), hybrid assistant intent router, explicit local-LLM
runtime state machine, responsive/tablet layout, accessibility audit, and the full
provider-chain wiring across all data paths.
