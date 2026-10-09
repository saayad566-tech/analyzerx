# AnalyzerX QA, Security, and Android Native Validation Report

**Date:** 18 August 2026  
**Scope:** Full application pipeline, security boundaries, provider resilience, Android arm64 Local AI gates, and post-remediation verification.

## Executive Result

AnalyzerX passed the post-remediation TypeScript check, lint, production server build, Expo web export, and full regression suite. The final suite completed with **209 passing tests and 2 intentionally skipped tests across 60 test files**. The web export produced **33 static routes**, including Marketplace, Local AI, Assistant, Alerts, Flows, Sectors, Screener, History, Account, Company, Sector Detail, Research Workspace, and report-related routes.

The Android native smoke tests were executed honestly. LiteRT validation is blocked because `adb` is not installed and no arm64 Android device is connected. The llama.cpp JNI build is blocked because Android NDK, CMake, and the pinned `native/llama.cpp` source tree are absent. No native inference or `.so` build is claimed.

## Findings and Applied Fixes

| Area | Finding | Action | Result |
|---|---|---|---|
| Scheduled collector security | Production scheduled endpoints could proceed when callback secrets were unset. | Added a side-effect-free authorization helper; production now returns a configuration error instead of executing tokenless callbacks. | Fixed and covered by 3 regression tests. |
| Push-token ownership | A legacy public push-token write route bypassed authenticated account ownership. | Removed `news.registerPushToken`; the application already uses `account.pushTokenUpsert` through a protected procedure. | Fixed; no client references remain. |
| Input validation | Invalid symbols were tested against the live API. | The router rejected `<script>` with HTTP 400 before provider execution. | Passed; regex and bounded Zod validation remain active. |
| CORS and headers | Browser-origin and security-header behavior required verification. | Confirmed allowlisted origins, credentialed first-party access, rejected untrusted preflight, `nosniff`, frame denial, referrer policy, and restrictive permissions policy. | Passed live health/API smoke checks. |
| Provider resilience | Optional providers returned cooldown or schema errors during live activity. | Preserved circuit breakers, cooldowns, `Promise.allSettled` fan-out, stale states, and deterministic fallbacks. | No provider failure stopped the server or regression suite. |
| Local AI | LiteRT and llama.cpp were not proven on native hardware. | Executed authoritative gates and retained explicit blocked/manual outcomes. | Correctly blocked; no false success state. |

## Android LiteRT Gate

The executed smoke script reported `adb ENOENT` for device connection, arm64 ABI, and package-install checks. Gemma 3 1B and Gemma 4 E2B load/stream/cancel/unload checks remain manual device actions. The correct release state is **blocked until an SDK-equipped environment and authenticated arm64 device are available**.

## llama.cpp JNI Gate

The executed build gate reported all three prerequisites blocked: `ANDROID_NDK_HOME`/`ANDROID_NDK_ROOT` is not configured, CMake is unavailable, and `/home/ubuntu/market-event-intelligence/native/llama.cpp` does not exist. The correct state is **no library built**. The next valid run must use a reviewed pinned llama.cpp source tree, Android NDK, CMake, an arm64 build, JNI symbol checks, and a device smoke test.

## Full Application QA

The preview rendered successfully after a clean service restart. Mobile visual verification covered Live Events, Market Flows, Sectors, Multibagger Screener, Assistant, Market Chat, Smart Alerts, History, and the finance Marketplace at a 390×844 viewport. Screens displayed bounded loading, unavailable, cooldown, empty, scanning, and authenticated/guest states without a blank crash screen. The initial multi-route capture failed because browser rendering slots were saturated; restarting the managed services cleared the condition and the subsequent captures passed.

The live backend returned HTTP 200 for health, confirmed the database was available, and showed the NewsTracker and NSE collector schedulers running. Invalid symbol input returned HTTP 400. Missing authentication for `auth.me` returned a null user rather than exposing protected data. Provider registry access remained available while provider-specific cooldown states remained isolated.

## Known Non-Blocking States

The environment continues to report expected provider cooldowns: Indian API HTTP 429, TinyFish HTTP 403, GNews HTTP 403, and occasional NewsData HTTP 422. These are not treated as healthy live coverage. The built-in LLM extraction fallback also enters its documented cooldown when usage is exhausted. Expo reports package-version compatibility suggestions and an old Browserslist database; neither caused a build failure. These are maintenance or credential gates, not application crashes.

## Release Decision

**Web and backend:** release-candidate conditionally ready after remediation.  
**Security:** the verified callback-token and push-token ownership gaps are fixed in code and covered by tests.  
**Android native Local AI:** not release-verified. An APK must not be represented as having working LiteRT or llama.cpp inference until the arm64 device and NDK gates pass.

## Required Native Validation Procedure

On an authenticated Android SDK-equipped environment, install `adb`, Android SDK/NDK, CMake, and the reviewed pinned llama.cpp source. Build the arm64 JNI library, install the AnalyzerX package, run the LiteRT smoke script, load Gemma 3 1B and Gemma 4 E2B, exercise text and supported multimodal prompts, cancel and unload each model, and confirm telemetry records success and failure transitions. Preserve the device serial, model checksums, ABI, library hash, and logs in the release evidence.
