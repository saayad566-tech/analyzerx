# AnalyzerX Local AI implementation

## Runtime selected

AnalyzerX uses Google's official **LiteRT-LM Android runtime** through `com.google.ai.edge.litertlm:litertlm-android:0.16.0`. This was selected because Google's official Android guide documents `Engine`, `EngineConfig`, `Conversation`, `MessageCallback`, CPU/GPU/NPU backends, and `.litertlm` model files for on-device Gemma execution.

The JavaScript layer does not pretend that a cloud model is local. `lib/local-ai.ts` exposes a replaceable `LocalAIRuntime` interface and returns an explicit unavailable runtime when the native module is absent. On Android, `NativeModules.AnalyzerXLocalAI` is registered by the Kotlin bridge and calls LiteRT-LM directly.

## Exact artifacts

| Model | Repository | Artifact | Revision | Verified size | Storage policy |
|---|---|---|---:|---:|---|
| Gemma 4 E2B IT | [`litert-community/gemma-4-E2B-it-litert-lm`](https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm) | `gemma-4-E2B-it.litertlm` | `6b78abd019e61a1ca4cbe3b212d2c9ce8ff38a94` | 2,588,147,712 bytes | Requires 3 GB free storage and targets 6 GB+ RAM |
| Gemma 4 E4B IT | [`litert-community/gemma-4-E4B-it-litert-lm`](https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm) | `gemma-4-E4B-it.litertlm` | `2eee7ac325f20eb8c9ac1d0e972f7c84663062da` | 3,659,530,240 bytes | Requires 4.5 GB free storage and targets 8 GB+ RAM |

The app does **not** bundle the multi-gigabyte model files into the APK and does not download the supplied Safetensors checkpoints. It downloads the converted `.litertlm` artifacts separately from Hugging Face, verifies the exact byte size, and stores them under the app document directory.

## Implemented behavior

The model manager performs Android/platform, RAM, free-storage, and 64-bit ARM checks before download. It uses Expo's `DownloadResumable`, persists the official pause state in AsyncStorage, reports progress, verifies the final artifact size, supports pause/resume, and deletes model files and resume state. E2B is recommended before E4B when both pass the device policy. E4B is not silently substituted when it fails eligibility.

The Local AI screen is available at `/local-ai` and from the hardware-chip button in the Assistant header. It shows artifact size, RAM target, format, device status, eligibility reasons, download/resume/pause/delete actions, and load/unload controls. The Android bridge exposes real LiteRT-LM load, stream-token events, cancellation of the active executor job, and unload operations. The web/Expo preview explicitly shows that it cannot execute LiteRT-LM inference.

## Native files changed

- `android/app/build.gradle`: pinned LiteRT-LM Android dependency `0.16.0`.
- `android/app/src/main/AndroidManifest.xml`: optional `libvndksupport.so` and `libOpenCL.so` declarations.
- `android/app/src/main/java/com/app/marketeventintelligence/localai/AnalyzerXLocalAIModule.kt`: real Engine/Conversation bridge.
- `android/app/src/main/java/com/app/marketeventintelligence/localai/AnalyzerXLocalAIPackage.kt`: React Native package registration.
- `android/app/src/main/java/com/app/marketeventintelligence/MainApplication.kt`: manual package registration.
- `app.config.ts`: Android build architecture restricted to `arm64-v8a`.

## JavaScript files changed

- `lib/local-ai-policy.ts`: pure model manifest and hardware eligibility policy.
- `lib/local-ai.ts`: Expo device/filesystem model manager, persisted resumable downloads, native runtime adapter, and explicit unavailable fallback.
- `app/local-ai.tsx`: model picker, device status, download/pause/resume/delete, load/unload, and no-cloud messaging.
- `app/market-chat.tsx`: direct Local AI entry point from the Assistant screen.
- `tests/local-ai.test.ts`: deterministic registry, sizing, eligibility, recommendation, and safety tests.

## Verification

- TypeScript check: passed.
- Local AI policy and Assistant regressions: 11 tests passed.
- ESLint, production backend build, and Expo web export: passed; web export includes `/local-ai`.
- Android native compilation: attempted twice but could not start native compilation because the sandbox has no Android SDK (`SDK location not found`). The Kotlin bridge therefore still requires a real Android build environment to validate the LiteRT-LM 0.16.0 API linkage and produce an installable APK.

## Android build instructions

1. Install Android Studio/SDK and set `ANDROID_HOME` or create `android/local.properties` with a valid `sdk.dir`.
2. From the project root, run `npx expo prebuild --platform android` only when preserving the checked-in native changes or after adding an equivalent config plugin.
3. Run `cd android && ./gradlew :app:assembleRelease`.
4. Install the APK on a 64-bit ARM Android device with sufficient storage and RAM.
5. Open AnalyzerX → Assistant → hardware-chip Local AI settings, download E2B or E4B, wait for byte-size verification, load the model, and test a prompt.

## Known limitations and safety boundaries

The native bridge is implemented but not declared production-verified until an Android SDK build and a physical/emulated arm64 device test succeed. Android/iOS parity is not claimed: this release implements Android LiteRT-LM only. The official LiteRT-LM page documents multimodality in the runtime, but image/audio execution must be separately validated against the selected Gemma 4 artifact after a native build. Cloud fallback is not triggered by the Local AI manager and must remain an explicit, user-consented action in the assistant layer.

The native files are currently generated/checked into `android/`; a future cleanup should add an Expo config plugin that regenerates the dependency, manifest declarations, and bridge source after `prebuild --clean`.
