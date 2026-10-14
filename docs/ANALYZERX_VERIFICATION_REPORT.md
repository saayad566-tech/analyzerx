# AnalyzerX — Verification Report

What was actually executed, what passed, and what was never run. A missing check is
not a pass.

## 1. Categories, kept strictly separate

- Source inspection
- Static checks (esbuild parse, strict `tsc`)
- Unit tests (local harnesses; full vitest in CI)
- Successful compilation
- APK creation
- Automated emulator execution
- Physical-device testing
- Live API integration verification

Passing one of these does NOT imply the others passed.

## 2. Local verification (this environment)

| Check | Status | Detail |
|---|---|---|
| esbuild parse of every changed module | VERIFIED | No parse errors |
| Strict `tsc` (`noUnusedLocals`, `noUnusedParameters`) | VERIFIED | Clean across all seven market modules |
| Node harness, market registry | VERIFIED | 11/11 |
| Node harness, provider-chain / keyboard / prompts | VERIFIED | 31/31 |
| Node harness, safe-access | VERIFIED | 18/18 |
| Node harness, scoring | VERIFIED | 44/44 |
| Node harness, sector-registry | VERIFIED | 88/88 |
| Node harness, tracker-state | VERIFIED | 203 |
| Node harness, finbert | VERIFIED | 39/39 |
| Node harness, market isolation + coverage | VERIFIED | 31/31 |
| Node harness, format / session / scoped store | VERIFIED | 38/38 after fixing two test bugs |
| Full `pnpm test -- --run` locally | NOT RUN | No dependency install in this sandbox; CI runs it |

Two local failures were investigated and were **test bugs, not code bugs**: one
expected an HK mid-session break at 11:00 (HK's break is 12:00–13:00), and one
wrongly expected `recordSearch` to retain cross-market entries — the exact bleeding
the module exists to prevent. The tests were corrected; the code was not weakened.

## 3. CI verification

CI runs 48–72 were inspected. Failures were fixed at the cause, never by disabling a
check: run 55 (tsc), 58 (`humanize` separator), 60 (a module imported `react-native`
so vitest could not load it), 62 (untyped test fixtures), 65 (nullable after market
scoping), 67 (duplicate `style` attribute and unreachable platform comparison),
69 (country search ranked Australia above the United States for "US").

**Run 72: VERIFIED green** — `pnpm install --frozen-lockfile`, `release:verify`,
`pnpm check`, `pnpm test -- --run`, build, sign, publish all succeeded.

## 4. Release artifact

| Field | Value |
|---|---|
| File | `analyzerx-3.15.0-72.apk` |
| Size | 64,286,524 bytes |
| SHA-256 | `41658cbd5e69408217a0ec3141bd12b59d1d376dc86d9796fb065ae72bfa05c7` |
| Version | 3.15.0 / versionCode 31500 |
| Signing cert SHA-256 | `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c` |
| Signature scheme | v2 + v3 verified from the APK signing block |
| Built from commit | `65feb137d51357d8488f2bce8980e3b6abb8ebd5` |

Size and SHA-256 were re-computed locally after download and matched the release
asset. The certificate was extracted from the APK's own signing block and matched
builds 57–72.

## 5. NOT RUN — and why

| Check | Status | Reason |
|---|---|---|
| Install the APK on a device | NOT RUN | No device, no adb |
| Launch and exercise any screen | NOT RUN | Same |
| Emulator UI test | NOT RUN | No emulator, no Android SDK |
| Real on-device LLM inference | NOT RUN | Cannot execute native inference here |
| Model download (≈498 MB) | NOT RUN | Not attempted from this sandbox |
| Live API integration against every provider | PARTIALLY VERIFIED | Endpoints are documented-public; not all exercised from here |
| Performance measurement | NOT RUN | No device or profiler |
| Accessibility audit | NOT RUN | Not performed |

## 6. Honest summary

The build, the type checks, the unit tests and the release signing are verified. The
**running application is not**. No claim in this repository should be read as device
verification, because none was performed.
