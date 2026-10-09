# Atomic Chat reference findings

Atomic Chat’s public offline-AI article says phone-local models need device-specific tradeoffs: practical Android use is centered around modern phones with roughly 6 GB+ RAM, larger models consume significant storage, and background inference is not unrestricted when the app is closed. Its Google Play listing states that models are downloaded once, run locally without accounts or cloud servers, and can be swapped based on speed versus quality. The screenshots show a browseable catalog with installed models, downloadable models, model sizes, capability badges such as vision/thinking/fast/agentic, progress, pause, delete, and storage-used summaries.

These are product-reference findings, not proof that Atomic Chat’s individual model files or licenses can be redistributed by AnalyzerX. AnalyzerX therefore uses only official model repositories and officially documented runtimes, labels each model’s verified source/format/license, and does not claim that every phone supports every model.

Sources: https://atomic.chat/blog/llm-updates/offline-ai-apps-2026 and https://play.google.com/store/apps/details?id=chat.atomic.app&hl=en_US

## Additional official model findings

Liquid AI’s official LFM2.5 announcement documents open-weight models available through Hugging Face and LEAP, with GGUF checkpoints for llama.cpp, ONNX checkpoints for broad accelerators, and NPU deployment through NexaML on selected Qualcomm hardware. The announcement reports an LFM2.5-1.2B Q4_0 footprint under 1 GB on Snapdragon-class hardware, but these benchmarks do not prove a drop-in Android runtime for AnalyzerX.

The official `unsloth/Qwen3.5-0.8B-GGUF` model card identifies Apache-2.0 licensing, GGUF artifacts with multiple quantization levels, multimodal image-text support, and deployment through llama.cpp among other runtimes. It does not itself provide a complete Android build recipe; AnalyzerX must therefore treat Qwen GGUF as a separate llama.cpp-family runtime track rather than a LiteRT-LM artifact.

The official `HuggingFaceTB/SmolLM3-3B` card identifies Apache 2.0 licensing, Transformers/Safetensors as the primary published format, text generation rather than a ready Android artifact, and vLLM/SGLang deployment examples. It should be catalogued as a potential conversion/runtime candidate, not presented as installable on Android until a verified mobile artifact and native runtime are added.

Sources: https://www.liquid.ai/blog/introducing-lfm2-5-the-next-generation-of-on-device-ai, https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF, https://huggingface.co/HuggingFaceTB/SmolLM3-3B
