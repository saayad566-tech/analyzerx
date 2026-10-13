# AnalyzerX — Master Engineering Remediation Report

Response to the Master Engineering, System Remediation & Quality Assurance mandate
(phases 1–11, final report format A–H). Written from tool output produced in this
session. Unrun checks are named explicitly; nothing here is inferred.

---

## A. Executive summary

**Overall status: Partially Complete.**

- **Confirmed defects found:** 3 in this pass (market-context substitution, missing
  source-status model, missing coverage denominator), on top of 15 from the prior
  audit pass which remain fixed in the tree.
- **Defects fixed this pass:** the Phase 3 cross-market substitution defect — the
  one the mandate names explicitly — plus two supporting models (source status,
  coverage).
- **Critical remaining risks:** no device/emulator validation exists in this
  environment; Phases 4, 5, 7, 8 and the wiring of Phase 6 remain incomplete.

The project is **not** declared production-ready. It compiles and its suite passes;
that is not the same claim.

---

## B. Requirements traceability matrix

| Phase | Requirement | Root cause | Files changed | Fix | Tests | Result | Limitation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Baseline | — | — | Branch/commit/toolchain recorded | — | Done | 2 GB RAM, no Java/SDK locally |
| 2 | ForgeShelf install state consistency | Inspected, **no defect found** | none | Not changed | existing `forge-shelf*.test.ts` (CI) | Verified by inspection + CI suite | Not run locally (no deps installed) |
| 3 | No cross-market substitution | Hardcoded `"RELIANCE"` fallbacks in 4 client/server sites | `lib/market-defaults.ts` (new), `app/research-desk.tsx`, `app/research-workspace.tsx`, `app/(tabs)/screener.tsx`, `server/advanced-research.ts`, `server/provider-actions.ts` | Market-scoped defaults derived from the active market profile; cross-market suffix rejection; market-scoped peers | `tests/market-defaults.test.ts` (18) | **PASS** | No device run |
| 4 | Explicit local runtime states | State model exists but is coarse (`local-ai.ts`) | none this pass | Deferred | existing `local-ai-lifecycle.test.ts`, `local-ai-integrity.test.ts` | Not implemented this pass | Needs the full Not Downloaded→Ready/OOM/Unsupported model |
| 5 | News tracker auto-configuration | Not addressed this pass | none | Deferred | existing news-tracker tests | Not done | Needs a verified default feed decision |
| 6 | Source status model | No unified status derivation | `lib/source-status.ts` (new) | Seven-state model with reason, `canClaimCovered` gate, fallback promotion rule, coverage denominator | `tests/source-status.test.ts` (15) | **PASS** | Not yet wired into the source catalog |
| 7 | Coverage matrix | No stated denominator | `lib/source-status.ts` (`calculateCoverage`) | Coverage computed from validated items with an explicit denominator | same suite | **PASS** | Full market×category matrix not built |
| 8 | Import pipeline | Not addressed this pass | none | Deferred | existing parsers/tests | Not done | |
| 9 | Reliability/security regression | — | as above | New tests for each new module | see F | **PASS** | |
| 10 | Testing | — | — | CI full suite + module harnesses | see F | **PASS (CI)** | No device/emulator |
| 11 | APK delivery | — | — | Built via the project's CI | see G | **PASS** | Not installed on a device |

---

## C. Market and data coverage report

**Markets declared** (from `lib/market-regions.ts`, the authoritative profile list):
India, United States, United Kingdom, Canada, Australia, Japan, Singapore, Hong
Kong, Germany, France.

**Coverage method.** Coverage is computed only from validated items, with the
denominator stated: `${requiredItems} required market/category/field/period
combinations`. Coverage is never derived from the number of registered sources or
written connectors.

**Phase 3 isolation result.** A market-scoped default and a suffix plausibility
check now exist, so a non-Indian market can no longer silently receive an Indian
instrument. Automated tests assert this for all nine non-Indian markets.

**Unresolved gaps.** The full market × category coverage matrix (annual reports,
shareholding, historical prices, indices, profiles, filings, news) has **not** been
built. Per-market validated coverage is therefore **not measurable yet** and is not
claimed.

---

## D. Model and assistant report

- **Local runtime:** the LiteRT bridge and lifecycle exist. Integrity checking
  (pinned SHA-256, inference gating on a partial/corrupt artifact) was implemented
  in a prior pass and is covered by `tests/local-ai-integrity.test.ts`.
- **Explicit runtime state model** (Not Downloaded / Downloading / Verifying /
  Loading / Ready / Out Of Memory / Unsupported / Failed) is **not implemented**;
  the current status enum is coarser. This is the main Phase 4 gap.
- **Fallback routing:** a general question now routes to the general assistant only
  when a provider is configured, and otherwise states the limitation plainly rather
  than substituting unrelated market context (prior pass).
- **Memory/latency measurements:** **none collected.** No model was loaded on a
  device in this environment, so no performance figure is reported.

---

## E. Security report

| Check | Command | Result |
| --- | --- | --- |
| Secret pattern scan | search for `sk-`, `hf_`, `ghp_`, `AKIA` across the tree | PASS — no committed credential found |
| Client bundle secret reads | grep for API-key env reads in `lib/`, `app/`, `components/` | PASS — none |
| Cleartext HTTP | manifest inspection | PASS — no `usesCleartextTraffic`, no `networkSecurityConfig` |
| Exported components | manifest inspection | Only `MainActivity` (launcher) — accepted |
| Permissions | manifest inspection | `SYSTEM_ALERT_WINDOW` and legacy external-storage permissions present — **deferred P3**, not silently changed |
| FinBERT credential handling | `server/sentiment.ts` | Token read only from a server-side env var; never in the APK; failure messages contain no token |

No penetration test or certification was performed, and none is claimed.

---

## F. Test and build evidence

**CI runs (the project's own supported checks):**

| Run | Result | Note |
| --- | --- | --- |
| 55 | FAIL | 2 real type errors — fixed in source |
| 56 | PASS | |
| 58 | FAIL | my own helper bug — fixed in the helper |
| 59 | PASS | |
| 60 | FAIL | test file failed to load (`react-native` unresolvable) — module made dependency-free |
| 61 | PASS | 3.8.0 |
| 62 | FAIL | my own test fixtures untyped — annotated |
| 63 | PASS | 3.9.0 |
| 64 | see G | 3.10.0 |

Each CI run executes: `pnpm release:verify`, `pnpm check` (tsc), `pnpm test -- --run`
(full vitest suite), Gradle release build, v2/v3 signing, release publish.

**Local harnesses this session:** `market-defaults` + `source-status` — 33 assertions
passed, 0 failed. Prior passes: safe-text 16, safe-access 18, keyboard-avoidance 6,
tracker-state 203, sector-registry 88, flows 22, event-schema 20, news-normalization
34, local-ai-integrity 11, scoring 44, finbert 39.

**NOT RUN (with reason):** device/emulator install and launch — no device, emulator,
Java or Android SDK in this environment. Lint (`expo lint`) — not part of the CI gate
and not run locally.

**Memory note.** The environment has 2 GB RAM total. That constrains local tooling
(a full dependency install plus Gradle cannot run here). It is an **environment
limit**, not evidence of an application runtime defect on a phone.

---

## G. APK delivery

| Field | Value |
| --- | --- |
| Variant | release |
| Package | `com.app.marketeventintelligence` |
| Version | `3.10.0` (code 31000) |
| Signing | v2 + v3, certificate `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c` — unchanged since build 57 |
| Build route | `.github/workflows/android-apk.yml` |
| Install/launch test | **NOT RUN** — no device or emulator |

**Signing-key migration.** Builds 57 and later share one certificate and install over
one another. Any build before 57 (including the older 1.4.0) was signed with an
unrecoverable key and needs a **one-time uninstall**. Uninstalling deletes local app
data — downloaded models, watchlists, saved reports. Back up anything you need
first. See `docs/analyzerx-android-signing.md`.

The exact filename, size, SHA-256 and release URL are recorded in the delivery
message for this build; the checksum is computed from the delivered file.

---

## H. Remaining work

| # | Unfinished requirement | Cause | Dependency | Severity | Next action |
| --- | --- | --- | --- | --- | --- |
| 1 | Device install/launch validation | No device, emulator, Java or Android SDK | A physical device or emulator | P1 | Install the APK and exercise the eight tabs |
| 2 | Phase 4 explicit runtime state model | Budget this pass | None | P2 | Extend `lib/local-ai.ts` status to the eight states and test the transitions |
| 3 | Phase 6 wiring | Model built, not integrated | None | P2 | Feed `deriveSourceStatus` from the source catalog's real signals |
| 4 | Phase 5 default news feed | Needs a verified public feed + terms decision | A product decision | P2 | Choose a feed whose terms permit the intended use |
| 5 | Phase 7 coverage matrix | Not built | Requires per-market adapter work | P2 | Build market × category matrix from validated records |
| 6 | Phase 8 import pipeline | Not addressed | None | P2 | Add bounded PDF/HTML/CSV parsing with untrusted-input handling |
| 7 | P3 manifest permissions | Deferred, not changed | Device testing to avoid breaking a feature | P3 | Review `SYSTEM_ALERT_WINDOW` and legacy storage permissions on a device |
| 8 | FinBERT live inference | No provider credential | A Hugging Face token configured server-side | P2 | Configure `HUGGINGFACE_API_TOKEN` server-side, or decide against cloud sentiment |

---

## Verification method

Every claim above is traceable to one of: a CI run identifier, a local harness
result, a file read, or a manifest/APK inspection performed in this session. Where a
check could not be run, it is marked NOT RUN with the reason. No test is reported as
passing that was not executed.
