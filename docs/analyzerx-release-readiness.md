# AnalyzerX Release-Readiness Report

**Audit date:** 2026-08-19

**Release candidate:** Current AnalyzerX project checkpoint

## Executive decision

**Web/backend publication readiness: conditional pass.** The project has a coherent mobile/web architecture, source-aware provider pipeline, non-blocking onboarding, market-scoped news, ECB/OECD macro context, Research Desk, Local AI management, ForgeShelf lifecycle, report exports, and broad deterministic regression coverage. The web/backend release may proceed through the project’s supported Publish flow only if the management UI confirms the latest checkpoint and the remaining external-provider caveats are accepted.

**Native Android Local AI certification: environment-gated.** Physical arm64 device QA and the native LiteRT/llama.cpp JNI build cannot be certified from the current sandbox because the required Android SDK/NDK, adb, CMake, pinned native source tree, and connected device are not attached. The app is designed to remain usable in Auto or Connected mode rather than claiming Local mode is active when it is not.

## Verification summary

| Gate | Result | Notes |
| --- | --- | --- |
| TypeScript | Passed | `pnpm check` completed without type errors |
| Focused installer/ForgeShelf/Local AI tests | Passed | 12/12 tests passed |
| Full regression baseline | Passed with known external caveats | Previous full baseline reached 259 passed and 2 skipped; provider credential reachability may time out independently |
| Backend production build | Passed | `pnpm build` completed in the verification run |
| Expo web export | Passed | 39 static routes exported |
| News relevance | Passed | Common-word false-positive fixtures and market-scope tests pass |
| ECB/OECD parsers | Passed | Typed parser and health/freshness fixtures pass |
| ForgeShelf installer | Passed | Preflight, checksum policy, dependency, and failure persistence tests pass |
| Provider isolation | Passed in deterministic tests | 401/402/403/422/429/timeout paths are isolated by provider |
| Web visual capture | Limited | Authenticated preview state and sandbox capture constraints prevented a complete fresh screenshot pass |
| Android arm64 native smoke test | Pending | Requires attached SDK, device, pinned llama.cpp, and native build toolchain |

## Product and workflow findings

Onboarding is non-blocking and self-guided. Market context can be changed from the selector without returning to Home, and the selected market is propagated to Search, News, Analysis, Flows, Screener, Alerts, Reports, Research Desk, and Assistant contracts. Account and Live expose previously hidden Research Desk, History, Macro Context, Local AI, and ForgeShelf entry points.

News publication is now evidence-based. Bare common-word matches are not treated as stock identity, and selected-market feeds do not mix unrelated foreign-company stories. Persisted news records carry market scope, while provider refresh and archive reads retain source and freshness states.

ECB and OECD are represented as macro providers with typed observations, units, periods, latency, freshness, and unavailable states. Their failure cannot block company or news workflows. The one-click ForgeShelf installer checks device fit, dependencies, pinned checksum policy, download integrity, and atomic activation before making a tool available.

## Security review

No new hardcoded credentials were added. Provider credentials remain server-side or in secure configuration. The installer does not execute arbitrary repository code, and remote artifacts without pinned checksum metadata are rejected. Partial downloads are removed on failure, and a previous verified install can be restored. User-owned routes must continue to enforce server-side ownership for alerts, watchlists, reports, research, telemetry, push tokens, and conversations.

Remaining security follow-ups are operational: maintain a no-secrets scan in CI, keep provider source allowlists current, validate report/source URLs against SSRF and unsafe-content rules, rotate any compromised external credentials through the management UI, and complete authenticated Android review of native artifact loading.

## Known limitations

Some regional sources remain catalog-validated, delayed, credential-gated, or unavailable because authorized endpoints, licenses, or runtime credentials are not present. Free public sources may have rate limits and cannot be treated as guaranteed low-latency feeds. Aggregate FII/DII reports do not automatically imply stock-level activity. Derivatives flow and advanced Greeks remain source-dependent. The native Local AI bridge remains unverified until device QA is performed.

The LLM extraction path can temporarily disable itself after quota exhaustion, but deterministic extraction remains active. This is an expected graceful-degradation state, not a reason to publish fabricated AI output.

## Publication checklist

Before clicking Publish, confirm the latest checkpoint is visible, the web root and API health are 200, the management UI shows the expected routes, provider status cards are truthful, no required screen is blocked by auth or onboarding, and external-provider caveats are documented. After publication, execute smoke paths for first launch, market switching, search, news relevance, analysis, flows, strategy selection, Assistant, ForgeShelf install, report export, and Account recovery.

The Publish action should be used rather than manually building an APK in the sandbox. If APK installation testing is required, generate it through the project’s supported Publish/build flow and then perform the documented physical-device QA.

## Final recommendation

Proceed with the web/backend publication as a conditional release, with the native Android arm64 gate visibly pending. The next operational priorities are a full authenticated device QA run, a pinned native build, fresh endpoint-health checks for credentialed providers, and a repeated market-scope/news relevance audit against a larger adversarial headline set.
