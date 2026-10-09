# AnalyzerX Workflow and Data-Source Audit

## Audit result

The deterministic application suite passed **157 tests across 43 files**, with two intentionally skipped tests. The complete suite also ran the two credential-dependent probes and failed only those external checks: the Indian API returned HTTP 429, and TinyFish returned HTTP 403. These are provider credential/rate-limit conditions, not application logic failures. They must remain visible in provider health and must not be converted into fabricated market values.

## Verified workflow areas

Search, progressive suggestions, market data normalization, news archive and tracker, Google News parsing, NSE flow normalization and date ranges, derivatives state handling, fundamental-analysis scoring, cash-flow metrics, research reports, provider registry, circuit breakers, parallel provider isolation, Assistant runtime policy, Local AI adapter truth states, Local AI telemetry/export, theme registry, and account/navigation surfaces passed deterministic tests.

## Data-source coverage contract

The platform currently separates official NSE/BSE/SEBI/company sources, licensed or configured market APIs, optional public fallback sources, and research/web providers. Provider results are normalized with source, URL, retrieval time, report date, freshness, status, and error metadata. FII/FPI and DII support includes date-range aggregation, comparisons, sorting, and source state. Options support includes a verified/auth-required contract and fallback state rather than invented chain values. News supports multi-provider collection, deduplication, entity relevance, sentiment/catalyst scoring, impact ordering, archive filtering, refresh, and article detail.

## LLM and Assistant status

The Assistant has Auto, Local, and Connected modes. Grounded context is required for current facts. Local generation is permitted only for a loaded native model with the requested capability; Automatic falls back to Connected. The model registry distinguishes verified LiteRT-LM artifacts from runtime-pending Qwen/LFM/other adapters. The web preview cannot prove native Android inference, so Android SDK/NDK, arm64 compilation, and device tests remain release gates. The Assistant does not claim that every listed model is active when its runtime is pending.

## Remaining operational gates

The Indian API and TinyFish credentials require remediation or cooldown-aware acceptance criteria. Live sector-wise mutual-fund and security-level institutional coverage depends on an authorized source and cannot be completed by inventing data. Native Android model execution requires an SDK-equipped build worker and arm64 device. Before publishing, run the production Android build on the EAS worker, inspect the complete Gradle “Run gradlew” log, and confirm the APK loads and streams with Gemma on a real device.


## Regression discovered during visual QA

The first mobile preview pass exposed a real Local AI route crash: `expo-file-system/legacy.getInfoAsync` was called in the web preview even though local model file management is native-only. The implementation now returns a truthful `native_unavailable` state before any native file inspection on web. The Local AI screen was re-captured successfully after the fix, and focused Local AI, Assistant, theme, provider, flow, and derivatives tests plus TypeScript, lint, and production export passed.
