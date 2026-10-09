# AnalyzerX Local AI architecture and workflow audit

## Executive verdict

The AnalyzerX Local AI catalog and lifecycle UI are functioning as a **truthful catalog and Android runtime boundary**, but it is not accurate to say that all six listed LLMs are working end to end. Two Gemma 4 artifacts have verified catalog metadata and a Kotlin LiteRT-LM bridge implementation, yet Android compilation and physical-device inference remain unverified. The other four entries are catalogued candidates whose Android adapters are not shipped. The Assistant currently displays the selected local model, but its message-generation path still calls the server-grounded hosted model route; it does not invoke the selected local model for chat generation.

## Architecture trace

| Layer | Current implementation | Audit result |
|---|---|---|
| Model registry | `lib/local-ai-policy.ts` | Six explicit model manifests, runtime kinds, artifact metadata, capabilities, storage/RAM policy, and installability flags. |
| Device policy | `assessLocalAIModel()` and `recommendLocalAIModel()` | Blocks non-Android/native-ineligible verified models and all runtime-pending models; recommends the first eligible model, normally Gemma 4 E2B. |
| Download manager | `lib/local-ai.ts` | Android-only verified-artifact download, resumable state, progress callbacks, byte-size integrity check, pause, resume, and delete. |
| Native boundary | Kotlin `AnalyzerXLocalAIModule` plus Expo config plugin | Implements LiteRT-LM engine creation, conversation creation, streaming events, cancellation, unload, and clean-prebuild registration. Not compiled or device-tested in this sandbox. |
| Model-management UI | `app/local-ai.tsx` | Search, capability/device status, download, pause, resume, load, unload, delete, and runtime-pending messaging are present. |
| Active-model persistence | `AsyncStorage` active-model key | Loading a model persists its ID; unloading or deleting clears it. The Assistant displays the persisted model name. |
| Assistant server route | `server/market-chat.ts` and `server/routers.ts` | Grounds responses with fundamentals, news, and multi-asset signals, then uses hosted `gpt-5-mini` for text or `gemini-3-flash-preview` for attachments, with deterministic fallback. |
| Assistant local execution | `app/market-chat.tsx` | **Not connected.** The selected model is shown in the disclaimer, but the send action always calls `trpc.chat.ask`; it does not call `getLocalAIRuntime().stream()`. |

## Model-by-model status

| Model | Catalog status | Can download now? | Can load now? | Can answer Assistant chat now? | Truthful conclusion |
|---|---|---:|---:|---:|---|
| Gemma 4 E2B IT | Verified LiteRT-LM artifact metadata | Yes, on eligible Android native builds | Bridge code exists; Android compile/device test pending | No, not through the current Assistant send path | Best-supported local candidate, not yet release-verified end to end |
| Gemma 4 E4B IT | Verified LiteRT-LM artifact metadata | Yes, on eligible Android native builds | Bridge code exists; Android compile/device test pending | No, not through the current Assistant send path | Supported artifact path, higher memory/storage requirement, not release-verified end to end |
| LFM2.5 1.2B | Runtime pending | No | No | No | Catalog reference only; llama.cpp/LEAP Android adapter is absent |
| Qwen 3.5 0.8B GGUF | Runtime pending | No | No | No | Catalog reference only; verified Android llama.cpp adapter is absent |
| SmolLM3 3B | Runtime pending | No | No | No | Catalog reference only; published Safetensors/Transformers path is not an Android runtime |
| Bonsai 8B | Runtime pending | No | No | No | Catalog reference only; artifact, license, and Android runtime path are not verified |
| Hosted text model | Server-grounded | N/A | N/A | Yes, when provider access works | Current Assistant path for text is `gpt-5-mini` with deterministic fallback if unavailable |
| Hosted multimodal model | Server-grounded | N/A | N/A | Yes for bounded image/audio requests when provider access works | Attachment path is `gemini-3-flash-preview` with evidence and limitation labels |

## Test evidence

| Check | Result | Interpretation |
|---|---:|---|
| Focused Local AI, Assistant, preferences, and report tests | 16/16 passed | Registry eligibility and existing Assistant fallback behavior are covered. No local streaming/switching test exists. |
| Full regression suite | 141 passed, 2 skipped, 3 failed | The three failures are external provider probes: Indian API HTTP 429, GNews HTTP 403, and TinyFish HTTP 403. |
| TypeScript | Passed | No compile-time errors. |
| Lint | Passed | No lint errors after removing the unused Local AI color constant. |
| Expo Android prebuild | Passed | The config plugin regenerates the native dependency, package registration, manifest metadata, and bridge files. |
| Production backend build | Passed | Server package build completed. |
| Expo web export | Passed | Local AI and Assistant routes exported successfully. |
| Mobile visual review | Passed | The catalog clearly displays six families, web/native bridge limitations, search, and model controls; Assistant clearly displays when no local model is loaded. |
| Android Gradle/device inference | Not run | Sandbox has no usable Android SDK/device validation path; this remains a release gate. |

## User workflow: manage models

A person opens the **Assistant** tab and taps the hardware-chip button in the top-right corner. This opens **Local AI — Use your own hardware**. The screen shows the device platform, RAM, free storage, CPU architecture assessment, and whether the native LiteRT-LM bridge is present.

The person can type into **Search models or capabilities** to filter the catalog. Gemma 4 E2B/E4B are the current verified-installable entries. LFM2.5, Qwen3.5, SmolLM3, and Bonsai show **Runtime pending** and cannot be downloaded because their Android adapters are not installed.

On an eligible Android native build, the person taps **Download model**. The download is resumable and displays progress. If interrupted, the person returns to the same model and uses **Resume download**. **Pause** stores resumable state. After the verified artifact is present, the person taps **Load model**. The selected model ID is persisted locally and the Assistant shows its name. The person taps **Unload** to stop using it, or **Delete** to remove the local artifact and clear the active selection.

## User workflow: switch models

The current UI supports switching between downloaded verified Gemma artifacts as follows:

1. Open Assistant, then tap the hardware-chip icon.
2. If the current model is loaded, tap **Unload**.
3. On the other downloaded Gemma card, tap **Load model**.
4. Return to Assistant and confirm that the selected model name is shown in the disclosure line.
5. To change again, repeat the unload-then-load sequence.

This is the **model-management workflow**, but it is not yet a complete **inference-routing workflow**. The selected name is persisted and displayed, while the Assistant’s actual `sendMessage` path still calls the server route. Therefore, switching currently changes the managed/selected model state, not the model that generates Assistant responses.

## Important gaps found

The highest-priority gap is that local model selection is not wired into Assistant inference. The client needs a local route that first obtains grounded evidence, then passes that evidence and the user question to `getLocalAIRuntime().stream()` when a loaded local model is selected. The server route should remain the source of current news, government announcements, prices, and filings; a local model should summarize or reason over supplied evidence rather than invent current facts.

The Android native bridge also needs an actual Gradle build and arm64 device test. The current Kotlin bridge appears to enforce one engine/conversation at a time through `closeRuntime()` during load, but the JavaScript screen does not explicitly unload the previous model before loading another. The UI’s `loadedModel` state is in-memory and resets when the screen remounts, while the active model ID is persisted separately. A production-hardening pass should expose a runtime status query and initialize the screen from the persisted/native state.

Finally, current automated tests do not exercise local token streaming, native cancellation, model switching, corrupted artifact recovery, or Assistant routing to a selected local runtime. The existing tests validate the registry and server fallback, not end-to-end on-device inference.

## Recommended next implementation order

First, add a grounded-context endpoint and a client-side local inference branch with an explicit user choice such as **Use local model** versus **Use connected grounded Assistant**. Second, add a single-runtime switch transaction that unloads the current model before loading the next and persists a verified runtime status. Third, compile and run the Android bridge on an arm64 device, then add mocked native-module tests for load, stream, token events, cancellation, unload, and switching.

## References to project evidence

The findings above are based on `lib/local-ai-policy.ts`, `lib/local-ai.ts`, `app/local-ai.tsx`, `app/market-chat.tsx`, `server/market-chat.ts`, `server/routers.ts`, `android/app/src/main/java/com/app/marketeventintelligence/localai/AnalyzerXLocalAIModule.kt`, `plugins/with-analyzerx-local-ai.js`, `tests/local-ai.test.ts`, `tests/market-chat.test.ts`, and `docs/local-ai-qa-report.md`.
