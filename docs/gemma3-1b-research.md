# Gemma 3 1B research findings

Google’s `google/gemma-3-1b-it` is an instruction-tuned Gemma 3 model distributed under Google’s Gemma license. The official model card describes text and image inputs, text output, a 32K context window for the 1B size, and an 8,192-token output limit [1]. The Hugging Face repository requires accepting Google’s usage terms before downloading the original weights [1].

The LiteRT Community `Gemma3-1B-IT` repository provides Android-oriented LiteRT/LiteRT-LM artifacts and identifies `gemma3-1b-it-int4.litertlm` as a LiteRT-LM artifact. Its published benchmark table reports a model size of approximately 529 MB for that artifact and shows Android CPU/GPU benchmark results on reference Samsung devices [2]. These benchmark values are upstream reference measurements, not AnalyzerX guarantees.

The model is suitable for a separate AnalyzerX text-and-vision catalog entry. It should not inherit Gemma 4’s audio capability: the official Gemma 3 1B model card documents text and image input, while the LiteRT-LM multimodality guide describes audio support only for models that expose an audio-capable runtime/model configuration [1] [3].

The correct AnalyzerX status is `verified_installable` for the LiteRT-LM artifact metadata and Android bridge boundary, but device execution remains pending until the APK compiles with a configured Android SDK, the artifact checksum is verified, and an arm64 device successfully loads and streams it.

## References

[1]: https://huggingface.co/google/gemma-3-1b-it "Google Gemma 3 1B IT model card"

[2]: https://huggingface.co/litert-community/Gemma3-1B-IT "LiteRT Community Gemma3-1B-IT artifact and benchmarks"

[3]: https://developers.google.com/edge/litert-lm/android "Google AI Edge LiteRT-LM Android guide"

[4]: https://ai.google.dev/gemma/docs/integrations/mobile "Google Gemma mobile deployment guide"
