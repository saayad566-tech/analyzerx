# Local AI export and native-build QA

AnalyzerX now supports local CSV export from the Local AI Telemetry screen. The export contains a stable header and one row per stored inference sample, including model, timestamp, duration, token count, backend, battery, charging state, memory, success, and error code. On native devices the file is written to local storage and opened through the system share sheet; if sharing is unavailable, the app reports the saved URI. The serializer safely escapes commas, quotes, and line breaks.

Telemetry retention is configurable at 25, 50, 100, or 250 recent samples. Changing the limit immediately trims stored history, while new samples always respect the selected limit. A confirmation-protected Clear all telemetry action removes the local sample store. No telemetry is sent to the server by these controls.

The requested arm64 smoke test was attempted with `node scripts/test_android_local_ai.mjs`. It is blocked in this sandbox because `adb` is not installed, so there is no connected Android device or ABI result. Gemma 3 1B and Gemma 4 E2B load/stream/cancel/unload remain manual device gates.

The requested llama.cpp bundle build was also attempted through `node scripts/build_llama_android.mjs`. It is blocked because `ANDROID_NDK_HOME`/`ANDROID_NDK_ROOT` is unset, CMake is not installed, and no pinned `native/llama.cpp` source tree exists. Consequently, `libanalyzerx_llama.so` was not built or bundled, and Qwen/LFM remain runtime-pending.

Verification passed: TypeScript, lint, backend build, Expo web export with 28 routes, focused Local AI/adapter/native-wiring/CSV tests (10 passed), and mobile visual verification. External provider failures remain isolated and unrelated to this Local AI change.
