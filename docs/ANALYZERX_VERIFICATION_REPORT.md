# AnalyzerX — Verification Report

What was actually executed, what passed, and what was never run. A missing check is
not a pass.

## 1. Categories, kept strictly separate

- Source inspection
- Static checks (esbuild parse, strict `tsc`)
- Unit tests (local harnesses; full vitest in CI)
- Successful compilation
- APK creation
- Live database execution (migration, backfill, rollback)
- Automated emulator execution
- Physical-device testing
- Live API integration verification
- Performance and accessibility measurement

Passing one of these does NOT imply the others passed.

## 2. Live database execution — REAL MariaDB, VERIFIED

Earlier revisions of this report recorded the migration as BLOCKED: no MySQL server, no
Docker, no root. That was a limitation of the environment, not of the work, and it has
now been removed by building a real database server inside the sandbox.

**How the server was obtained.** There is no `mysqld`, no Docker and no sudo here. The
MariaDB static tarballs return HTTP 403. So the Debian package pool was used directly:
`mariadb-server-core`, `mariadb-server` and `mariadb-client-core` 10.11.18 were
downloaded, unpacked with `ar` and Python's `lzma` (there is no `xz` binary), and three
missing shared libraries were resolved — `liburing.so.2`, `libaio.so.1` and
`libnuma.so.1`. The first `libnuma` candidate came from Debian 13 and required
`GLIBC_2.38`; the bookworm build `2.0.16-1` was used instead. The server then started,
and `CREATE INDEX` initially failed with "Out of memory" until the buffer pool and sort
buffers were tuned down for a 2 GB machine.

**What was executed.** The repository's own files, unmodified, against that live server:

- `drizzle/0019_market_scope.sql`
- `scripts/backfill-market-scope.mjs` (through `mysql2`), both dry-run and `--apply`
- `drizzle/0019_market_scope_rollback.sql`

**Result: 30/30 checks passed.** Highlights:

| Check | Result |
|---|---|
| Migration executes | VERIFIED — 41 statements |
| `marketId` present on all scoped tables | VERIFIED — 11 columns |
| Composite market indexes created | VERIFIED — 22 index entries |
| `marketId` column default | VERIFIED — `UNKNOWN` (never a real market) |
| Backfill runs against a live server | VERIFIED — dry-run and `--apply` |
| Classification correctness | VERIFIED — source key and exchange suffix both honoured |
| Existing user rows preserved | VERIFIED — classified `IN`, not discarded |
| **An `UNKNOWN` row is invisible to every market view** | VERIFIED — all ten markets |
| **No market view contains another market's row** | VERIFIED |
| Rollback removes every column and index | VERIFIED — 22 statements |
| Rollback loses no table or user data | VERIFIED |
| Forward migration re-applies cleanly | VERIFIED |

**A real defect was found by running it.** The classification carried a "bare
upper-case ticker means US" rule. That is a guess, and a wrong one: the United States
and India both use bare tickers (`AAPL`, `RELIANCE`) and they are the two largest
markets here, so a bare ticker from a source that does not identify a market would have
been silently labelled US — misclassifying Indian rows. The rule was removed from both
the migration and the backfill script. Classification now rests only on evidence: the
source key (`sec-*` → US, `nse-*`/`bse-*` → IN) and the exchange suffix (`.L` → GB,
`.TO` → CA, `.AX` → AU, `.T` → JP, `.SI` → SG, `.HK` → HK, `.DE` → DE, `.PA` → FR).
Anything else stays `UNKNOWN` and is hidden. The test asserts that a bare ticker with no
source is `UNKNOWN` rather than a guessed US.

## 3. Automated emulator execution — REAL Android 14 emulator, VERIFIED

Device verification was also previously recorded as BLOCKED. It is now performed on a
real Android emulator in CI, where KVM is available
(`.github/workflows/android-emulator-verify.yml`). The workflow downloads the published
release APK — so the artifact a user installs is the artifact tested — boots an
emulator, installs it, launches it, exercises the UI, and inspects logcat.

**Result: PASSED.**

| Check | Result |
|---|---|
| Emulator boots | VERIFIED — Android 14, x86_64 |
| `adb install` | VERIFIED — Success |
| Package registered | VERIFIED — `com.app.marketeventintelligence` |
| Activity launches | VERIFIED — `Status: ok`, `.MainActivity` |
| JavaScript engine runs | VERIFIED — `ReactNativeJS: [useAuth] …` in logcat |
| Survives UI interaction | VERIFIED |
| No fatal exception | VERIFIED — none in logcat |

**A second real defect was found by running it.** The first emulator run crashed:

```
SoLoaderDSONotFoundError: couldn't find DSO to load: libreactnative.so
  at ReactNativeApplicationEntryPoint.loadReactNative
  at com.app.marketeventintelligence.MainApplication.onCreate(MainApplication.kt:52)
ActivityManager: Process com.app.marketeventintelligence has crashed too many times,
  killing! Reason: crashed quickly
```

The APK packaged **only `arm64-v8a`** native libraries while the emulator is x86_64, so
no native library could load and the app died before any UI appeared. This APK could not
run on an x86_64 emulator, an x86 tablet or a Chromebook, and every release from build
57 onward shared the defect. No type check, unit test or code inspection would have
found it. Fixed by packaging `arm64-v8a,x86_64` in `android/gradle.properties`.

## 4. CI verification

CI runs were inspected and failures were fixed at the cause, never by disabling a
check: run 55 (tsc), 58 (`humanize` separator), 60 (a module imported `react-native` so
vitest could not load it), 62 (untyped test fixtures), 65 (nullable after market
scoping), 67 (duplicate `style` attribute and unreachable platform comparison), 69
(country search ranked Australia above the United States for "US"), 91 (a screen used
`market.id` without binding `market`).

**Build 94: VERIFIED green** — `pnpm install --frozen-lockfile`, `release:verify`,
`pnpm check`, the strict market-isolation gate, `pnpm test -- --run`, build, sign and
publish all succeeded. **Emulator run 33: VERIFIED green.**

## 5. Release artifact

| Field | Value |
|---|---|
| File | `analyzerx-3.24.0-94.apk` |
| Size | 111,039,673 bytes |
| SHA-256 | `8682d0b113e6ae077c01fd958c890d564d84c04109ee658eb02ee4e04a99a32e` |
| Version | 3.24.0 / versionCode 32400 |
| Native ABIs | `arm64-v8a`, `x86_64` — `libreactnative.so` present in both |
| Signing cert SHA-256 | `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c` |
| Signature scheme | v2 + v3 verified from the APK signing block |
| Built from commit | `b50f3a920939c5e376835cf4cdc07b6d6d0a656f` |

Size and SHA-256 were re-computed locally after download and matched the release asset.
The certificate was extracted from the APK's own signing block and matches builds
57–94, so the signing identity has not drifted across 38 releases.

## 6. NOT RUN — and why

| Check | Status | Reason |
|---|---|---|
| ARM64 hardware execution | NOT RUN | The emulator is x86_64. The `arm64-v8a` libraries are present in the APK and were verified in the archive, but were not executed. Emulating arm64 on an x86 host is impractically slow. |
| Live migration against the production database | NOT RUN | The SQL was executed against a real MariaDB 10.11 of the same major version, on a schema built for the purpose. The production instance's data and privileges were not available. |
| Real on-device LLM inference | NOT RUN | Cannot execute native inference here. |
| Model download (≈498 MB) | NOT RUN | Not attempted from this sandbox. |
| Live API integration against every provider | PARTIALLY VERIFIED | Endpoints are documented-public; not all exercised from here. |
| Performance measurement (frame timing, memory) | NOT RUN | No device profiler. The emulator run confirms the app starts and survives, not that it holds 120 Hz. |
| Accessibility audit | NOT RUN | Not performed. |

## 7. Honest summary

The build, the type checks, the unit tests, the release signing, the live database
migration (including rollback and recovery) and the automated emulator execution are
all verified. The application demonstrably installs, launches, runs its JavaScript
engine and survives interaction on a real Android 14 emulator.

What remains unverified is narrow and specific: execution on ARM64 hardware, execution
against the production database, on-device inference, and performance and accessibility
measurement. Nothing in this repository should be read as a claim about those.
