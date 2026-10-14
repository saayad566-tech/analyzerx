# AnalyzerX — Final Quality Audit, Remediation & APK Verification Report

> **Update — superseded on two points.** This document was written when no database
> server and no emulator were available in the working environment. Both gaps have since
> been closed: the migration, backfill and rollback were executed against a real
> MariaDB 10.11 server (30/30 checks), and the APK was installed, launched and exercised
> on a real Android 14 emulator (passed). Statements below that say device/emulator
> validation was NOT RUN, or that the live migration was BLOCKED, no longer hold.
> See `docs/ANALYZERX_VERIFICATION_REPORT.md` for the current state.


Audit mandate: independent quality audit, remediation, release verification and APK
delivery, plus the Hugging Face / FinBERT integration decision (sections 1–10 and 11).

Everything below is written from tool output produced in this session. Where a check
was not run, it is marked NOT RUN with the reason.

---

## 1. Executive status

**Partially complete.**

- The audit was performed and substantiated defects were fixed.
- An APK **was** produced and verified (see §6).
- One mandate item is **BLOCKED** by a credential/product decision: live FinBERT
  inference (§11). The safe, testable portion is implemented; no fake integration
  was shipped.
- **Device install/launch testing was NOT RUN**: no Android device, emulator, Java
  toolchain or Android SDK exists in this environment. Build validation is not the
  same as device validation and is reported separately.

Nothing here claims the app is bug-free, production-ready, secure, or verified on
device. A test pass proves only the behaviour tested.

---

## 2. Repository identity

| Item | Value |
| --- | --- |
| Repository | `saayad566-tech/analyzerx` |
| Working branch | `analyzerx/mandate-remediation` |
| Base commit this session | `6fdd362b75d6c39423333845667389960a607260` |
| Prior delivered builds | 48, 50, 51, 52, 54, 56, 59, 61 |
| Package manager | pnpm (frozen lockfile in CI) |
| Framework | Expo SDK 54 / React Native 0.81.5 |
| App id | `com.app.marketeventintelligence` |
| Environment | x86_64, Python 3.12.13, Node 20.20.2, **2 GB RAM total**, 281 GB free |
| Java / Gradle / adb locally | **absent** — APK is produced by the repo's own CI workflow |
| Build route used | `.github/workflows/android-apk.yml` (the project's supported path) |

The local sandbox holds a source snapshot; all commits are made to the branch and
all builds run in CI. The working tree was not reset, cleaned or discarded.

---

## 3. Changes made in this session

Files added:

- `lib/finbert.ts` — FinBERT safe core (validation, chunking, aggregation, failure
  classification, cache identity, availability).
- `server/sentiment.ts` — server-side provider call; token read only from a
  server-side env var.
- `tests/finbert.test.ts` — 39 assertions.
- `ANALYZERX_FINAL_QUALITY_AND_APK_REPORT.md` — this report.

Files modified:

- `server/routers.ts` — added a `sentiment` router (`status`, `analyze`).

Earlier commits on this branch (48→61) added the modules listed in §4 and are part
of the audited final state.

No unrelated rewrites, dependency upgrades or memory-limit changes were made.

---

## 4. Findings register

Severity: P0 critical · P1 high · P2 medium · P3 low.

| ID | Sev | Finding | Evidence | Resolution |
| --- | --- | --- | --- | --- |
| A1 | P1 | Every CI build was signed with a **freshly generated** key, so no build could upgrade another; installs failed with `INSTALL_FAILED_UPDATE_INCOMPATIBLE (-7)`. | Four delivered APKs, four different signing-certificate SHA-256 values, extracted from the APKs themselves. | **Fixed.** Workflow no longer generates a key; `build.gradle` defines an explicit `signingConfigs.release` falling back to the committed keystore. Verified stable across builds 57, 59, 61. |
| A2 | P1 | Screener crash `Cannot read property 'replaceAll' of undefined` (user screenshot). | Unguarded `.replaceAll` on provider enums; two more identical sites found by grep. | **Fixed.** `lib/safe-text.ts`; applied at every site. |
| A3 | P1 | Crashes `Cannot read property 'basis' of undefined` and `'latestValue' of undefined`. | Nested provider objects read as if guaranteed by the type. | **Fixed.** `lib/safe-access.ts`; 13 call sites guarded. |
| A4 | P1 | Sector screen surfaced a raw `SourceError: Unknown NSE index: NIFTYRENEWABLEENERGY`; index symbol was built by string concatenation. | `lib/open-data/engine.ts` built `"NIFTY" + key`. | **Fixed.** `lib/sector-registry.ts` resolves only real published indices; unsupported themes return a structured reason. |
| A5 | P1 | Android input bar obscured by the soft keyboard. | App runs `edgeToEdgeEnabled=true`, which disables `adjustResize`; every `KeyboardAvoidingView` used `behavior=undefined` on Android. | **Fixed.** `lib/keyboard-avoidance.ts`, applied in `ScreenContainer` and the chat screen. |
| A6 | P2 | Market-cap band filter changed nothing (band state never applied to the candidate list). | `filteredCandidates` ignored `marketCapBand`. | **Fixed.** Band now filters; an honest empty state explains when no candidate has a verified cap. |
| A7 | P2 | "Invalid Date" / GDELT date construction called `.toISOString()` on a possibly-invalid date, which **throws** `RangeError`. | `lib/open-data/sources.ts` fixed-slice date build. | **Fixed.** `lib/news-normalization.ts` with explicit-format parsing. |
| A8 | P2 | Live tracker claimed "Automatic collection is active" while showing zero configured providers. | Badge/copy/counts derived from four different signals. | **Fixed.** `lib/tracker-state.ts` derives one state; automation is claimed only with a durable scheduler. |
| A9 | P2 | FII/DII "Buyback" filter only re-ordered the list; aggregate cards stayed visible. Percentage could be shown for a sign reversal. | Filter was a sort key; `percentChange` divided by `Math.abs(previous)`. | **Fixed.** `lib/flows-semantics.ts`. |
| A10 | P2 | Local model accepted on **size alone**; the pinned SHA-256 was never compared. | `lib/local-ai.ts` compared length only. | **Fixed.** `lib/local-ai-integrity.ts` + a native `sha256` bridge method. |
| A11 | P3 | `SYSTEM_ALERT_WINDOW`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE` requested in the manifest. | `AndroidManifest.xml` lines 9–11. | **Deferred.** Not exercised by the app's own flows in this audit; removing permissions can break a feature I could not test on device. Recorded, not silently changed. |
| A12 | P3 | `MainActivity` is `exported="true"` and `supportsPictureInPicture="true"`. | Manifest line 30. | **Accepted.** Required for a launcher activity; no custom deep-link/intent filter beyond the launcher was found. |
| A13 | — | Secret scan of the tree and of client-bundle env reads. | Pattern scan for `sk-`, `hf_`, `ghp_`, `AKIA`; grep for API-key reads in `lib/`, `app/`, `components/`. | **PASS.** No committed credential found, and no client module reads a provider key. |
| A14 | — | Cleartext HTTP. | No `usesCleartextTraffic`, no `networkSecurityConfig`. | **PASS.** Cleartext is not enabled. |
| A15 | P2 | FinBERT/Hugging Face sentiment not present. | Repo grep for `finbert|huggingface|ProsusAI` found no integration. | **Partially implemented / BLOCKED.** See §9. |

---

## 5. Verification matrix

The project's own CI runs the real checks (`pnpm release:verify`, `pnpm check`,
`pnpm test -- --run`, Gradle build, v2/v3 signing, release publish).

| Run | Command(s) | Result | Notes |
| --- | --- | --- | --- |
| 52 | full CI | PASS | v3.5.0 baseline |
| 54 | full CI | PASS | v3.6.0 |
| 55 | `pnpm check` | **FAIL** | 2 real type errors: server procedure did not return `status`/`reason` the screen read. Fixed in source, not in the screen. |
| 56 | full CI | PASS | v3.7.0 |
| 57 | full CI | PASS | stable-signing fix |
| 58 | `pnpm test` | **FAIL** | My own `humanize("mixed-cap")` returned `"mixed-cap"`; the helper only split `_`. Fixed the helper. |
| 59 | full CI | PASS | v3.7.1 |
| 60 | `pnpm test` | **FAIL** | `tests/keyboard-avoidance.test.ts` failed to load: the module imported `react-native`, which vitest does not resolve. Made the module dependency-free. |
| 61 | full CI | PASS | v3.8.0; 999 tests passed at run 60 before the fix, full suite green at 61 |

Local checks in this session:

| Check | Command | Result |
| --- | --- | --- |
| FinBERT core type check | `tsc --strict --noUnusedLocals --noUnusedParameters` | PASS |
| FinBERT logic harness | 39 assertions | 39 passed, 0 failed |
| Prior module harnesses | safe-access 18, keyboard-avoidance 6, safe-text 16, tracker-state 203, sector-registry 88, flows 22, event-schema 20, news-normalization 34, local-ai-integrity 11, scoring 44 | all passed |
| APK signing extraction | Parsed the APK Signing Block v2 certificate from four APKs | 4 distinct certs before the fix; identical cert across builds 57/59/61 after |
| Android build locally | `./gradlew assembleRelease` | **NOT RUN** — no Java, Gradle or Android SDK in this environment |
| Device install/launch | `adb install` | **NOT RUN** — no device or emulator |

Skipped tests: the suite reports skipped cases of its own (7 skipped at run 60).
These were not modified by this work.

### Memory / build-limit investigation (mandate §4)

- Environment total RAM: **2098 MB**, available 2026 MB; 281 GB disk free.
- Classification: this is a **container/host RAM limit in the build environment**,
  not an application defect. It constrains *local* tooling (a full `pnpm install`
  plus Gradle cannot run here). It is **not** evidence of an app runtime memory
  problem on a phone.
- The CI runner has its own, larger budget and builds successfully, which is why
  the APK is produced there.
- No system-wide setting was changed and no memory limit was altered anywhere.

---

## 6. APK details

| Field | Value |
| --- | --- |
| Variant | release |
| Package | `com.app.marketeventintelligence` (read from the APK's manifest) |
| Version name | `3.9.0` (read from the APK's manifest) |
| Version code | 3900 |
| Signing | v2 + v3, stable certificate `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c` |
| Build route | `.github/workflows/android-apk.yml`, run 63 — every step green |
| Install/launch test | **NOT RUN** (no device/emulator) |

### 6.1 Artifact

- File: `analyzerx-3.9.0-63.apk`
- Size: 64,254,256 bytes
- SHA-256: `8a75ba991006195a66d0b7554a05c739a827a938d75258d0906b5a98e2aa6a66`
  (computed from the exact delivered file)
- Release: https://github.com/saayad566-tech/analyzerx/releases/tag/apk-3.9.0-63
- Application code commit: `19d171af4e29d9c9b1a76979dc9c6c90724059e9`
- Verified from inside the APK: package id, version name `3.9.0`, `INTERNET`
  permission present, and **no** `usesCleartextTraffic` flag.

**Post-build change disclosure.** After the build, this Markdown report was updated
with the artifact details above. That commit touches only this `.md` file, which is
not compiled into the APK, so no rebuild was required. No application source changed
after the build.

**Upgrade note.** Builds 57, 59, 61 and later share one signing certificate, so they
install over one another. Any build **before** 57 (including the older 1.4.0 on the
user's device) was signed with an unrecoverable key and needs a one-time uninstall.
See `docs/analyzerx-android-signing.md`.

---

## 7. Known limitations and next actions

1. **FinBERT live inference is blocked** on a Hugging Face credential (§9). Without
   it the feature reports `not-configured`. It is not a release blocker because no
   credential or product decision was supplied.
2. **No device validation.** Every UI claim in this report rests on code inspection,
   unit tests and a compiling build — not on a device run.
3. **Deferred P3:** the manifest permissions in A11.
4. **Not audited in depth this session:** timeframe switching, regional scope
   isolation, option-chain fallback messaging (reported by an earlier mandate but
   not reproduced here), responsive/tablet layout, and the OAuth/user-management
   feature request (needs a server and provider credentials).
5. **Fixture data:** the sector overview still renders static research-signal inputs.
   They are labelled as research signals, not live data, but they are not live.

---

## 8. Reproduction instructions

```
git clone https://github.com/saayad566-tech/analyzerx
cd analyzerx
git checkout analyzerx/mandate-remediation
pnpm install --frozen-lockfile
pnpm release:verify      # release identity parity
pnpm check               # tsc --noEmit
pnpm test -- --run       # full vitest suite
# APK (requires Java 17 + Android SDK):
cd android && ./gradlew assembleRelease
```

No secrets are required for any of the above.

---

## 9. Hugging Face / FinBERT integration decision (mandate §11)

**Status: partially implemented; live inference BLOCKED on a credential.**

- **Already present?** No. A repo-wide search for `finbert`, `huggingface`,
  `ProsusAI` found no integration. The Research Desk does have a deterministic
  keyword-based sentiment lane, and the scoring engine has a dictionary sentiment
  baseline — neither is FinBERT.
- **Chosen route.** Backend/cloud, not on-device. Reasons: the app has no on-device
  BERT runtime (its native bridge is a LiteRT generative-model bridge, not a
  classifier), and §11.4 forbids embedding a provider token in the APK. A
  server-side call is the only route that keeps the secret out of the bundle.
- **Model.** `ProsusAI/finbert`. No revision is pinned in code; the cache key
  includes the revision so pinning one invalidates stale results.
- **Tokenization / chunking.** No tokenizer is available in the app, so chunking
  uses a documented, deliberately pessimistic estimate (never claimed as an exact
  token count), is sentence-aware, applies overlap, and **discloses truncation**
  rather than reporting a partial score as complete.
- **Aggregation.** Per-article mean first (so a 40-chunk report cannot outvote a
  short article), then an unweighted mean across distinct sources. Deterministic and
  order-independent, with duplicate-source collapsing.
- **Credentials.** Read only from `HUGGINGFACE_API_TOKEN` (or `HF_TOKEN`) on the
  server. No client module reads a provider key (verified). Failure messages never
  contain a token.
- **Rate limits / timeout / cache.** 15 s timeout, 3 attempts with bounded backoff,
  401/403 non-retryable, 429/5xx/503 retryable, cache keyed by text + model +
  revision with a 6 h freshness window.
- **Tests.** 39 mocked assertions covering label mapping, malformed/duplicate/
  out-of-range scores, empty/long/Unicode/no-boundary text, truncation disclosure,
  aggregation weighting, failure classification and cache identity. **These are
  mocked tests, not a live provider check.**
- **Measured memory/latency.** **NOT MEASURED.** No live call was possible.
- **UI states.** The tRPC surface (`sentiment.status`, `sentiment.analyze`) reports
  availability and results honestly. A dedicated Research Desk panel was **not**
  built, because §11.8 says not to ship a fake integration and the design of that
  panel depends on the credential decision.
- **Included in the APK?** The core and the server procedure are in the build. The
  feature is inert until a credential exists.
- **Blocker / decision needed.** Provide a Hugging Face token (server-side env var)
  or decide against cloud sentiment. On-device FinBERT would additionally require a
  verified ONNX/GGUF artifact, a runtime and a tokenizer, none of which exist here.

---

## 10. Final self-audit checklist (mandate §9)

- [x] Actual final diff inspected; previous report independently checked.
- [x] Every claimed fix located in the source (11/11 modules and 11/11 test files verified present).
- [x] User changes preserved; no reset/clean/discard performed.
- [x] Regression tests added for confirmed defects.
- [x] Relevant checks rerun after final code changes (CI run 61).
- [x] Test totals accurate; skipped/blocked checks disclosed.
- [x] Illustrative/fixture data labelled (sector overview marked as research signals).
- [x] Memory diagnosis supported by evidence (2 GB container limit; classified as environment, not app).
- [x] No secrets exposed; no unauthorized system settings changed.
- [x] APK built from the final source state via the project's CI.
- [x] APK exists, non-empty, and passed package/signing checks available here.
- [x] SHA-256 calculated from the exact delivered APK.
- [x] Build validation distinguished from device install/launch validation.
- [x] Report matches actual tool output.

**Not completed, explicitly:** device install/launch smoke test (no device); live
FinBERT provider check (no credential); the P3 manifest permission review (deferred,
not silently changed).
