# Gemma 3 1B and unified Local AI QA

## Implemented

AnalyzerX now includes **Gemma 3 1B IT** as a separate model entry backed by the LiteRT Community `gemma3-1b-it-int4.litertlm` artifact at repository revision `6d54daa71cfbffba6b2843c08eeb1a27e7430bf0`. The catalog records a 584,417,280-byte artifact, an 800 MB free-storage target, a 2 GB RAM target, Android LiteRT-LM runtime, and text/vision capabilities. Audio is intentionally disabled for this model.

Gemma 3 1B, Gemma 4 E2B, and Gemma 4 E4B use the same Assistant routing contract. When a verified model is loaded, the Assistant can use Local mode for grounded text generation and supported local attachments. Auto mode chooses local inference only when the native bridge, active model, capability, and file path are valid; otherwise it uses the connected grounded route. Qwen, LFM, SmolLM3, and Bonsai remain visible but runtime-pending.

Future GGUF downloads are checksum-gated. A model cannot enter the downloadable path without a pinned SHA-256 value. Local inference telemetry is stored on-device and bounded to 100 samples, recording model, backend, duration, token count, success/error, battery level, and charging state when Expo Battery is available.

## Verification

TypeScript passed. Focused Local AI, adapter, telemetry, and Assistant routing tests passed: 12/12. Lint, backend production build, Expo web export, Android Expo prebuild, native dependency placement, GPU manifest declarations, and arm64 configuration passed. Visual verification confirmed Gemma 3 1B appears in Local AI and the Assistant exposes Auto, Local model, and Connected selectors.

The full suite passed 149 tests with 2 skipped. Four failures are external provider probes: Indian API HTTP 429, GNews HTTP 403, Telegram provider timeout, and TinyFish HTTP 403. No Local AI or Gemma 3 test failed. Android Gradle/device execution remains a physical environment gate because this sandbox has no configured Android SDK or connected arm64 device.
