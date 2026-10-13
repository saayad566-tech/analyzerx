# AnalyzerX — Prompt 9: Release-Blocker Remediation and Version Identity

**Date:** 13 October 2026
**Baseline:** commit `bdcc93f` (release `3.2.0`), branch `main`
**Scope:** fix the release-version inconsistency and strengthen release verification, without misrepresenting untested functionality.

Classifications used throughout: **VERIFIED · PARTIAL · NOT VERIFIED · BLOCKED · NOT APPLICABLE**. No item is promoted from PARTIAL or NOT VERIFIED to VERIFIED without new evidence.

---

## A. Execution summary

The release identity now has a single source of truth, `release-version.json`. The app
configuration consumes it directly; `package.json`, the release manifest, the EAS profile
and the CI workflow are reconciled to it and are checked against it by a strengthened
verifier that fails when any of them disagree. A release-readiness gate reports each check
as PASS / FAIL / BLOCKED / NOT VERIFIED and never treats device QA as a pass. The two ESLint
errors are fixed with a resolver that follows Node's `exports` map. The Vitest advisory is
remediated by upgrading Vitest (and its `vite` peer) to an advisory-free version, with the
full suite re-run to prove no regression. The orphan checksum is retained in a documented
historical archive. The one client-side value import from `server/` was moved to `lib/`,
because the module is pure.

---

## B. Changed files

| File | Change | Reason |
|---|---|---|
| `release-version.json` | **new** — `{ version: "3.2.0", androidVersionCode: 3200, iosBuildNumber: "3200" }` | Single source of truth for the release identity |
| `app.config.ts` | Import the shared source; delete the three hardcoded literals | App config can no longer drift from the release metadata |
| `package.json` | `version` `1.4.0` → `3.2.0`; add `release:verify:local-ai` and `release:readiness` scripts; add the local resolver devDependency | Reconcile package metadata; wire the new checks |
| `release-manifest.json` | Add `version`, `androidVersionCode`, `releaseVersionSource`; add `sharedDomainModules` group | Manifest now carries the release identity it is verified against |
| `eas.json` | Rename profile `analyzerx-1.4.0-local-ai` → `analyzerx-local-ai`; values `1.4.0`/`1400` → `3.2.0`/`3200` | Remove the stale version from the profile name and values |
| `.github/workflows/android-apk.yml` | Read version/code from `release-version.json` into env; use them in tag/title/artifact/keystore; tag trigger `v3.2.0` → `v*`; add `release:verify:local-ai` and the readiness gate step | CI no longer hardcodes a version; it derives and gates |
| `scripts/verify-release.mjs` | Rewritten: reads the authoritative version, cross-checks package/manifest/EAS/app-config/CI, adds artifact size + SHA-256 + signing (or NOT VERIFIED) + source revision | Verification now validates the real release identity, not a stale copy |
| `scripts/verify-local-ai-release-config.mjs` | Rewritten: validates against the shared source; removes the dependency on a non-existent workflow matrix | The old script threw on every run and asserted the stale identity |
| `scripts/release-readiness.mjs` | **new** — PASS/FAIL/BLOCKED/NOT VERIFIED gate; orphan-checksum scan; explicit device-QA NOT VERIFIED | Release process cannot call itself ready on tests alone |
| `scripts/lib/release-version-scan.mjs` | **new** — finds release-version literals in release-identity contexts only | Avoids false positives (e.g. pnpm `9.12.0`, build-tools `36.0.0`) |
| `scripts/checksum-artifact.mjs` | Refuse to write a checksum for a missing/empty artifact; post-write verify | Checksum metadata can never refer to a nonexistent artifact |
| `eslint.config.js` | Add the `node-exports` import resolver | Follow Node's `exports` map instead of disabling the rule |
| `tools/eslint-import-resolver-node-exports/` | **new** — tiny local resolver package | Version-controlled resolver; not a blanket disable |
| `lib/smart-event-alerts.ts` | **moved** from `server/smart-event-alerts.ts` (pure module, 0 imports) | Remove the one client-side value import from `server/` |
| `app/(tabs)/alerts.tsx`, `server/autonomous-recommendations.ts`, `server/live-smart-alerts.ts`, `server/routers.ts` | Update the import path | Follow the move |
| `tests/smart-event-alerts.test.ts`, `tests/live-smart-alerts.test.ts`, `tests/autonomous-recommendations.test.ts` | Update the import path | Follow the move |
| `tests/release-version.test.ts` | **new** — 11 tests | Regression coverage for version consistency and the gate |
| `archive/historical-checksums/` | **new** — the orphan checksum plus a README documenting the uncertainty | Retain, relocate and document rather than delete |
| `docs/analyzerx-device-qa-checklist.md` | **new** — PENDING REAL-DEVICE EXECUTION | Device QA handoff |
| `docs/analyzerx-prompt-9-release-remediation.md` | **new** — this document | Traceability |
| `scripts/record-test-results.mjs` | **new** — turns a Vitest JSON report into `artifacts/test-results.json`, bound to the revision | Evidence for the readiness gate (Prompt 10 fix: the evidence file is generated per run and git-ignored, never committed stale) |

---

## C. Validation results

| Command | Exit code | Result |
|---|---|---|
| `pnpm install --frozen-lockfile` | **0** | Lockfile consistent after the dependency changes |
| `npx tsc --noEmit` | **0** | No type errors |
| `npx eslint .` | **0** | **0 errors**, 195 warnings (was 2 errors / 195 warnings) |
| `npx vitest run` (shards 1–3) | **0** | **834 passed, 7 skipped, 0 failed**, 105 files |
| `node scripts/verify-release.mjs` | **0** | PASS 7, FAIL 0, NOT VERIFIED 3 (artifact/checksum/signing absent here) |
| `node scripts/release-readiness.mjs` | **0** | PASS 4, FAIL 0, NOT VERIFIED 2 (artifact, device QA) |
| `node scripts/verify-local-ai-release-config.mjs` | **0** | Local AI profile verified against 3.2.0 |

Skipped tests (7): `auth.logout`, `finnhub.secret`, `indian-api.secret`, `nse-direct-secret`, `tinyfish-credentials` — all credential-gated. Pre-existing vs regression: no failures were introduced; the only test change was the import path in three existing files.

**Honesty note on the test run:** the full suite was executed in three shards because a single unsharded run exceeds this environment's 300-second command limit. Sharding partitions files and skips no tests; all 105 files ran. Per-shard counts are recorded in `artifacts/test-results.json`, which is generated per run by `scripts/record-test-results.mjs` and is deliberately git-ignored so it cannot be committed stale (see the Prompt 10 audit).

---

## D. Prompt 8 findings → result

| # | Prompt 8 finding | Result | Evidence |
|---|---|---|---|
| 1 | Release version not single-sourced (`1.4.0` vs `3.2.0`) | **VERIFIED (fixed)** | `release-version.json` is authoritative; `verify-release.mjs` fails on any disagreement |
| 2 | Verifier validated the wrong version | **VERIFIED (fixed)** | The verifier reads the source and cross-checks package/manifest/EAS/app-config/CI |
| 3 | Orphan root checksum `AnalyzerX-1.0.1-updated.apk.sha256` | **VERIFIED (resolved)** | Relocated to `archive/historical-checksums/` with a README; provenance could not be established (no 1.0.1 tag/release/artifact), so it was retained, not deleted |
| 4 | Two ESLint `import/no-unresolved` errors | **VERIFIED (fixed)** | `npx eslint .` → 0 errors; resolver added, no blanket disables |
| 5 | Vitest critical advisory (`<3.2.6`) | **VERIFIED (remediated)** | Vitest `2.1.9` → `4.1.11`; 0 advisories; suite re-run green |
| 6 | Client value import from `server/` | **VERIFIED (fixed)** | Pure module moved to `lib/`; imports updated; type-only imports documented as erased |
| 7 | No automated release-readiness gate | **VERIFIED (added)** | `release-readiness.mjs` with four statuses; wired into CI |
| 8 | No device QA checklist / evidence | **PARTIAL** | Checklist prepared and marked PENDING REAL-DEVICE EXECUTION; no execution occurred |
| 9 | Job persistence not durable; no update checker | **NOT VERIFIED** | Out of scope for this prompt; unchanged |
| 10 | 9 of 10 markets have no working connector | **BLOCKED** | Needs external network/credentials; unchanged |
| 11 | Financial values credential-gated | **BLOCKED** | No `INDIAN_API_KEY`/`FINNHUB_API_KEY` in this environment |

---

## E. Release metadata: before → after

| Field | Before | After |
|---|---|---|
| `package.json` version | `1.4.0` | `3.2.0` |
| `app.config.ts` version / code | `3.2.0` / `3200` (hardcoded) | from `release-version.json` |
| `verify-release.mjs` version | `1.4.0` / `1400` (hardcoded) | read from `release-version.json` |
| Release manifest | no version fields | `version` + `androidVersionCode` + `releaseVersionSource` |
| EAS Local-AI profile | `analyzerx-1.4.0-local-ai`, `1.4.0`/`1400` | `analyzerx-local-ai`, `3.2.0`/`3200` |
| CI workflow | `v3.2.0` literals | derived from `release-version.json` |
| vitest / vite | `2.1.9` / `5.4.21` | `4.1.11` / `7.3.7` |

---

## F. Security remediation status

- **Vitest advisory: remediated (VERIFIED).** The original critical advisory (Vitest UI server) is gone, and the moderate `@vitest/mocker` advisory that superseded it is also gone: vitest `4.1.11` reports **0 advisories** against the npm bulk-advisories endpoint. This required a major upgrade (2.x → 4.x) and a `vite` peer upgrade (5 → 7); the full suite was re-run green, so no migration was needed.
- **UI-server reachability (VERIFIED):** before deciding, the UI-server path was checked rather than assumed — `@vitest/ui` is not installed and no script, CI step or configuration enables `--ui`/`ui:true`/`api:true`. The remediation was done anyway because it was safe.
- **No secrets:** no credential was added; no server-only module was moved into client code.

---

## G. Artifact and checksum verification status

**NOT VERIFIED in this environment.** No APK was built here (no JDK, Android SDK/NDK or device). The verifier is ready to validate an artifact: pass `--artifact <apk>` and it checks existence, non-zero size, SHA-256 against the `.sha256` file, and signing via `apksigner` (reported as NOT VERIFIED when `apksigner` is absent — never treated as proof of valid signing). CI runs this automatically after the signed APK is produced.

---

## H. Real-device QA status

**NOT VERIFIED — PENDING REAL-DEVICE EXECUTION.** No physical-device installation, launch or visual verification has occurred. See `docs/analyzerx-device-qa-checklist.md`. To let the readiness gate consume the evidence, record `docs/device-qa-evidence.json` with `{ "executed": true, "device": "...", "apkSha256": "...", "failed": 0 }` once it is executed. The gate reports device QA as NOT VERIFIED until then and never counts a skipped device test as passed.

---

## I. Outstanding blockers

1. **No physical Android device / SDK / NDK** — device QA cannot be executed here.
2. **Network egress restrictions** — SEC EDGAR and UK hosts are unreachable from this environment.
3. **No provider credentials** (`INDIAN_API_KEY`, `FINNHUB_API_KEY`) — live financial values cannot be demonstrated.
4. **No APK in the workspace** — artifact/checksum/signing verification is NOT VERIFIED here (CI covers it).
5. `liblitertlm_jni.so` is bundled but has never been launched on a device.

---

## J. Release decision

# READY FOR DEVICE QA

The release-identity defect is fixed and enforced by tests; typecheck, lint and the full
test suite pass; the Vitest advisory is remediated; the client/server boundary is clean; and
the release-readiness gate exists and refuses to call the build ready on tests alone.

This is **not** READY FOR LIMITED BETA or GENERAL RELEASE, because the two things a beta
requires have not happened and cannot happen in this environment: **no physical-device
installation/launch/visual verification has ever been performed**, and **the financial core
has not been exercised on credentialed data**. Passing repository tests alone is not
sufficient for a beta or general-release decision.

The path from here is short and specific: execute the device QA checklist on an arm64 device
and record the evidence, then attach provider credentials and re-run the filing/financial
flows. When both are done, the readiness gate will report them and the decision can be raised.
