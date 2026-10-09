# AnalyzerX Local AI adapter roadmap

AnalyzerX now has three explicit runtime families. **Gemma 3 1B IT** is an additional LiteRT-LM Android catalog entry using the official LiteRT Community `gemma3-1b-it-int4.litertlm` artifact at a pinned repository revision; it advertises text and vision, not audio. It shares the common Assistant routing contract with Gemma 4. **LiteRT-LM Android** is the verified adapter boundary for Gemma 4 E2B/E4B artifacts. **llama.cpp Android** is the planned adapter boundary for Qwen and LFM GGUF artifacts. **Transformers Android** remains a pending research path for SmolLM3 Safetensors. The catalog does not enable a model merely because an upstream model card exists.

## Gemma verification path

The Expo config plugin pins `com.google.ai.edge.litertlm:litertlm-android:0.16.0`, copies the Kotlin bridge after prebuild, adds the optional GPU native-library declarations, and limits the release architecture to arm64. The bridge supports text streaming, cancellation, unload, and multimodal `ImageFile`/`AudioFile` content. A real Android build and device test are still required because the current sandbox has no Android SDK or connected arm64 device.

## Multimodal local routing

The Assistant retrieves verified market context first. In Auto mode, local inference is selected only if a loaded model, native runtime, required capability, and usable local media path are present. Otherwise the connected route is used. Local inference receives the image/audio file separately and a bounded prompt containing the grounded evidence. Local inference cannot execute app navigation or financial actions.

## Qwen and LFM boundary

Qwen and LFM remain `runtime_pending`. Their next adapter should be a version-pinned llama.cpp Android JNI module with one model-at-a-time loading, GGUF checksum validation, CPU/Vulkan or OpenCL backend selection, cancellation, token events, and an explicit VLM path for Qwen only after image support is verified. Qwen’s current documentation identifies GGUF and llama.cpp as the local execution path [1]. Liquid AI documents LFM2.5 GGUF and llama.cpp deployment [2]. Neither source is evidence that the AnalyzerX Android binary is already compiled or that a specific downloaded artifact is safe to redistribute.

## Integrity and telemetry

Future GGUF downloads must include a pinned SHA-256 value before the downloadable-model guard can allow them. Qwen, LFM, SmolLM3, and Bonsai therefore remain runtime-pending. Local inference records model ID, backend, duration, token count, success/error state, and platform battery level/charging state when the native battery API is available. Storage is local-only and bounded to the latest 100 samples.

## Release gates

A model changes from `runtime_pending` to `verified_installable` only after the Android dependency compiles, the artifact checksum is verified, the model loads on an arm64 device, text generation emits non-empty tokens, cancellation and unload release resources, and multimodal behavior passes when the model advertises that capability. Until then, the UI shows the model as catalogued but not loadable.

## References

[1]: https://qwen.readthedocs.io/en/latest/run_locally/llama.cpp.html "Qwen llama.cpp documentation"

[2]: https://docs.liquid.ai/deployment/on-device/llama-cpp "Liquid AI llama.cpp deployment documentation"

[3]: https://developers.google.com/edge/litert-lm/android "Google AI Edge LiteRT-LM Android guide"
