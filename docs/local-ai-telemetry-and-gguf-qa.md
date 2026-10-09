# Local AI telemetry, GGUF, and Android readiness QA

## Delivered

AnalyzerX now records immutable GGUF metadata for Qwen 3.5 0.8B and LFM2.5 1.2B Q4_K_M artifacts, including repository revisions, exact filenames, byte sizes, licenses, download URLs, and 64-character SHA-256 integrity values. The models remain `runtime_pending`: checksum metadata alone does not enable them. The download guard still requires a verified installability state, so users cannot download a model whose Android adapter has not passed validation.

A guarded `AnalyzerXLlamaCpp` Android React Native module and package have been added. It exposes availability, load, stream, cancel, and unload operations and attempts to load `libanalyzerx_llama` only when the future arm64 JNI binary exists. Without that binary, the module reports unavailable rather than failing at app startup or claiming local inference. The Expo plugin copies and registers the module during clean prebuilds.

A Local AI Telemetry screen is available from the Local AI catalog. It reads only the bounded local sample store and displays total samples, success rate, average latency, token throughput, latest battery context, and per-model history. Empty and unavailable states are explicit; no mock performance values are shown.

## Verification

The arm64 smoke-test script is available at `scripts/test_android_local_ai.mjs`. It checks ADB connectivity, arm64 ABI, installed package state, and documents the manual Gemma 3 1B and Gemma 4 E2B load/stream/cancel/unload steps. This sandbox has no `adb` executable or connected Android device, so physical inference remains blocked and is not claimed as passed.

The deterministic suite passed 149 tests with 2 skipped after excluding four external credential probes: Indian API HTTP 429, GNews HTTP 403, Telegram timeout, and TinyFish HTTP 403. TypeScript, lint, backend build, Expo web export (28 routes), Android prebuild, adapter tests, native-wiring tests, and visual checks passed. The new telemetry screen rendered correctly with zero-sample unavailable states.

## Device procedure

On an Android SDK-equipped machine, connect an arm64 device with USB debugging enabled, run `adb devices`, build/install the debug APK, and run `node scripts/test_android_local_ai.mjs --serial <device-serial>`. In AnalyzerX, open Local AI, download Gemma 3 1B, load it, select Assistant Local mode, send a text prompt, cancel one generation, unload, and confirm telemetry updates. Repeat with Gemma 4 E2B and a supported image/audio input. Qwen and LFM require the future compiled `libanalyzerx_llama.so` before their runtime status can change.
