# Qwen and LFM GGUF research

## LFM2.5

Liquid AI publishes official `LiquidAI/LFM2.5-1.2B-Instruct-GGUF` and `LiquidAI/LFM2.5-1.2B-Thinking-GGUF` repositories under the `lfm1.0` license. The model cards document llama.cpp execution and list Q4_K_M artifacts around 731 MB [1] [2]. These sources establish a compatible upstream format and command-line runtime path, but do not prove that AnalyzerX’s Android JNI binary is compiled or that a selected artifact is safe to load on a device.

## Qwen 3.5

The `unsloth/Qwen3.5-0.8B-GGUF` repository is Apache-2.0 licensed and advertises GGUF, llama.cpp, and image-text-to-text usage. Its model card documents a `UD-Q4_K_XL` llama.cpp path and image-capable usage [3]. The Qwen llama.cpp documentation explains that the runtime is a compiled C/C++ ecosystem, that GGUF is the model container, and that model/runtime compatibility must be validated against a sufficiently recent llama.cpp build [4].

## AnalyzerX policy

This milestone records exact upstream repository/file identities and a checksum-required download contract. A runtime-pending GGUF model remains non-downloadable until a trusted artifact SHA-256 is recorded, the artifact license is accepted, the Android llama.cpp JNI library is built for arm64, and load/stream/cancel/unload tests pass on a real device. The app will not substitute a Git LFS object ID or an unverified HTTP header for a cryptographic SHA-256 value.

## References

[1]: https://huggingface.co/LiquidAI/LFM2.5-1.2B-Instruct-GGUF "Liquid AI LFM2.5 1.2B Instruct GGUF model card"

[2]: https://huggingface.co/LiquidAI/LFM2.5-1.2B-Thinking-GGUF "Liquid AI LFM2.5 1.2B Thinking GGUF model card"

[3]: https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF "Qwen 3.5 0.8B GGUF model card"

[4]: https://qwen.readthedocs.io/en/latest/run_locally/llama.cpp.html "Qwen llama.cpp documentation"
