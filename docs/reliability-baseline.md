# Reliability Baseline

## Baseline Run

The full automated suite was executed on the current `main` revision before the reliability work began. The suite produced **296 passing tests**, **5 intentionally credential-gated skips**, and **1 failure** across 302 tests.

| Result | Count | Meaning |
|---|---:|---|
| Passed | 296 | Existing deterministic coverage passed. |
| Skipped | 5 | Live credential-dependent checks were not run because the required authorized secrets are absent in this workspace. |
| Failed | 1 | The Local AI native-wiring contract failed. |

## Confirmed Blocking Defect

The failed test is `tests/local-ai-native-wiring.test.ts`. It expects the LiteRT-LM Android dependency `com.google.ai.edge.litertlm:litertlm-android:0.16.0` to be present in the generated Android Gradle dependency block when an Android project exists.

The generated `android/app/build.gradle` currently has no LiteRT-LM dependency. This matches the active release configuration: both installable Android profiles set `ANALYZERX_ENABLE_NATIVE_LOCAL_AI=false` in `eas.json`. Consequently, the current APK cannot load the shipped Local AI native module and must not represent Local AI setup as available.

## Reliability Interpretation

The verified-news experience can work because it uses the managed API and provider paths that are already present. Failures in analysis, flows, research, and LLM setup require route-level runtime diagnostics and capability-specific user states rather than a generic loader. Local AI requires a separate native-AI build profile and physical-device validation before it can be presented as installable.

## Immediate Remediation Order

First, the app will receive a shared health/readiness contract and client-visible typed failures. Second, stock analysis, flows, research, and cloud LLM routes will be brought under common operation-state and partial-result handling. Third, Local AI will be restricted to verified runtime/model combinations and built with an enabled native bridge in a dedicated release profile. Every release candidate will be checked against this baseline and the capability contract.
