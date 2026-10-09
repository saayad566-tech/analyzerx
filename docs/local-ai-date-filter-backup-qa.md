# Local AI date filtering and encrypted backup QA

The Local AI Telemetry dashboard now supports five range presets: All, Today, 7 days, 30 days, and QTD. The selected range filters the sample count, success rate, latency, throughput, per-model breakdown, and CSV export. Invalid timestamps are excluded from date-filtered views rather than being assigned to a period.

CSV export remains local-first and now exports only the selected range. The encrypted backup action serializes the same filtered sample set using authenticated AES-GCM, stores the device key in SecureStore with device-only accessibility, writes an encrypted JSON envelope locally, and opens the native share sheet when supported. If authenticated device encryption or sharing is unavailable, the app reports the limitation instead of creating a false “encrypted” backup.

The arm64 smoke script was retried. It remains blocked because `adb` is not installed and no Android device is connected. The llama.cpp build gate was retried and remains blocked because `ANDROID_NDK_HOME`/`ANDROID_NDK_ROOT` is unset, CMake is absent, and no pinned `native/llama.cpp` source tree is present. No APK inference or `libanalyzerx_llama.so` build is claimed.

Verification passed: TypeScript, lint, backend build, Expo web export with 28 routes, Android prebuild, focused telemetry/filter tests (5 passed), and mobile visual verification. The visual check confirms the date-range chips, filtered-count label, CSV export button, encrypted backup button, retention controls, and clear-data control render correctly.
