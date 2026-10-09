# AnalyzerX multi-model Local AI

AnalyzerX now exposes an Atomic Chat-inspired browseable model catalog. Users can search model families, inspect capability badges, see storage and RAM requirements when verified, and manage supported artifacts with download, pause, resume, load, unload, and delete controls.

## Runtime policy

| Model family | Published format | Intended Android runtime | AnalyzerX status |
|---|---|---|---|
| Gemma 3 1B IT | `.litertlm` | LiteRT-LM Android | Verified installable when the native bridge, arm64 device, memory, and storage checks pass; text and image input only |
| Gemma 4 E2B IT | `.litertlm` | LiteRT-LM Android | Verified installable when the native bridge, arm64 device, memory, and storage checks pass |
| Gemma 4 E4B IT | `.litertlm` | LiteRT-LM Android | Verified installable when the native bridge, arm64 device, memory, and storage checks pass |
| LFM2.5 1.2B | GGUF/ONNX paths documented upstream | llama.cpp or LEAP-family runtime | Catalogued; Android adapter pending |
| Qwen 3.5 0.8B | GGUF | llama.cpp-family runtime | Catalogued; Android adapter pending |
| SmolLM3 3B | Safetensors/Transformers | A mobile conversion/runtime is required | Catalogued; Android adapter pending |
| Bonsai 8B | GGUF | llama.cpp-family runtime | Catalogued; artifact/license/runtime verification pending |

Gemma 3 1B uses the official LiteRT Community `gemma3-1b-it-int4.litertlm` artifact and shares the Gemma Android bridge with Gemma 4. Its catalog capability boundary is text and image input; audio is not enabled for this model. The Assistant still supplies grounded evidence before local generation.

The catalog deliberately distinguishes **verified installable** from **runtime pending**. A runtime-pending entry cannot be downloaded by the current UI, because downloading a file without a verified Android loader would create a misleading “installed” experience.

## Capability policy

Model recommendations are based on the device platform, available RAM, free storage, CPU architecture, and whether the native runtime is present. E2B is recommended before E4B when both are eligible because it has the lower memory and storage target. Models with no fixed verified artifact size are shown with quantization-dependent or unverified size labels instead of fabricated numbers.

## Current and government-news questions

A local model cannot know a current headline, filing, or government announcement from its weights alone. AnalyzerX therefore keeps live-data retrieval separate from local inference. Current questions are grounded through the existing verified news, research, and market-data providers; the response includes source and freshness information. The local model can only be treated as an offline summarizer after a verified Android runtime is loaded and the application has supplied it with the retrieved evidence. If the evidence is unavailable, the assistant must say so rather than inventing a current answer.

## Native build boundary

The LiteRT-LM Android bridge is registered through `plugins/with-analyzerx-local-ai.js`, which regenerates the Gradle dependency, Android manifest metadata, package registration, and Kotlin bridge on clean Expo prebuild. The JavaScript/web preview intentionally reports native inference as unavailable. Android SDK compilation and an arm64 device smoke test remain release gates.

## References

1. [Atomic Chat offline AI guide](https://atomic.chat/blog/llm-updates/offline-ai-apps-2026)
2. [Atomic Chat Google Play listing](https://play.google.com/store/apps/details?id=chat.atomic.app&hl=en_US)
3. [Liquid AI LFM2.5 announcement](https://www.liquid.ai/blog/introducing-lfm2-5-the-next-generation-of-on-device-ai)
4. [Qwen 3.5 0.8B GGUF model card](https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF)
5. [SmolLM3 model card](https://huggingface.co/HuggingFaceTB/SmolLM3-3B)
6. [Google AI Edge LiteRT-LM](https://developers.google.com/edge/litert-lm)
