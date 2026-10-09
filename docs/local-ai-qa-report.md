# AnalyzerX Local AI QA report

## Scope

This verification covers the Atomic Chat-inspired model catalog, capability search, device eligibility messaging, resumable model controls, active-model persistence, Assistant disclosure, Expo Android prebuild regeneration, TypeScript, lint, production server build, and Expo web export.

## Results

| Check | Result | Evidence |
|---|---|---|
| TypeScript | Passed | `pnpm exec tsc --noEmit` returned zero errors |
| ESLint | Passed | `pnpm lint` returned zero errors after removing the unused color constant |
| Android Expo prebuild | Passed | `CI=1 npx expo prebuild --platform android --no-install` completed successfully |
| Production backend build | Passed | `pnpm build` completed |
| Expo web export | Passed | 27 static routes exported, including `/local-ai`, `/assistant`, and `/market-chat` |
| Mobile visual review | Passed | `/local-ai` and `/assistant` captured at 390×844; search, truthful bridge state, model badges, Assistant disclosure, and navigation were visible |
| Full deterministic suite | Passed except known external probes | 141 passed, 2 skipped; 3 provider probes failed because Indian API returned 429, GNews returned 403, and TinyFish returned 403 |

## Functional observations

The catalog renders six model families and provides searchable descriptions and capability text. Gemma 4 E2B/E4B are the only entries marked verified installable by the current registry. LFM2.5, Qwen3.5, SmolLM3, and Bonsai remain visibly runtime-pending; they are not presented as installable Android artifacts without a verified adapter.

The Local AI screen reports that the web/Expo preview has no native LiteRT-LM bridge and does not silently fall back to cloud inference. On a native build, loading a verified artifact persists the selected model ID. The Assistant reads that selection and displays the model name; it also states that current-news answers still require connected evidence and that live facts are not invented.

## Release gates still open

A full Android SDK/Gradle compilation and arm64 physical-device smoke test are still required to verify LiteRT-LM 0.16.0 linking, model loading, token streaming, cancellation, and unload behavior. The sandbox does not provide that Android SDK/device environment. The four pending model families also need separately verified mobile artifacts and adapters before they can be enabled for download.

The three failing full-suite tests are credential/provider probes, not regressions in the catalog or Assistant UI. Provider cooldown and fallback logic remains the expected production behavior when those upstream credentials return 403 or 429.

## Verification run — 18 Aug 2026

The arm64 verification script passed the Expo plugin, Kotlin bridge source, LiteRT-LM dependency coordinate, and arm64 build-policy checks. It remains blocked at the Android SDK gate because `adb`, `ANDROID_HOME`, `ANDROID_SDK_ROOT`, CMake, and an arm64 device are unavailable in this workspace. The llama.cpp build gate therefore produced no native library. The EAS production attempt was executed non-interactively and stopped before build submission because an Expo user account or `EXPO_TOKEN` is required. No APK or real-device inference result is claimed. The remaining device checks are assembly, verified model download integrity, Gemma 3/4 load and streaming, multimodal input, cancellation/unload, model switching, and telemetry confirmation.
