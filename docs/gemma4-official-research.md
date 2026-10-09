# Gemma 4 official research notes

## Source

- https://huggingface.co/google/gemma-4-E2B-it

## Verified model-card observations

The official Google model card identifies `google/gemma-4-E2B-it` as a Transformers/Safetensors model with the `gemma4` tag, multimodal image-text-to-text capability, and Apache 2.0 licensing. Its example loads `AutoProcessor` and `AutoModelForMultimodalLM` from Transformers. The model card states that Gemma 4 models are multimodal, with text and image input; audio is supported on E2B and E4B among other sizes. It identifies E2B and E4B as model sizes in a larger Gemma 4 family and states that smaller models target deployment from high-end phones to servers.

The page also contains an official Google AI Edge / Gemma documentation link, but the page itself does not prove that the standard Safetensors checkpoint is directly loadable by Android LiteRT-LM. The supplied mobile-optimized checkpoint URLs and the official runtime documentation must be checked separately before implementation.

## Google AI Edge / LiteRT-LM observations

- https://developers.google.com/edge/litert-lm

The official Google AI Edge site has a dedicated LiteRT-LM documentation tree with installation, usage, configuration, model management, OpenAI-compatible server, Android/Kotlin, iOS/Swift, Web, Flutter, C++, and `.litertlm` file-builder guides. It also exposes a dedicated **Gemma 4** page and a page titled **Convert and run a fine tuned model on device**. This indicates LiteRT-LM is the relevant official path to investigate for native on-device Gemma 4, rather than assuming the standard Hugging Face Safetensors checkpoint can be loaded directly by an Expo JavaScript app.

## Official Android LiteRT-LM guide

- https://developers.google.com/edge/litert-lm/android

The official Android guide identifies LiteRT-LM's Kotlin API for Android and JVM, with GPU and NPU acceleration, multimodality, and tools use. It initializes an `Engine` with a local `modelPath` pointing to a `.litertlm` file, selects `Backend.GPU()` or `Backend.NPU(nativeLibraryDir = ...)`, initializes the engine, creates conversations, and requires explicit engine/conversation close calls. The guide shows optional Android cache directory support for faster subsequent loads.

GPU support requires optional native libraries such as `libOpenCL.so` and `libvndksupport.so` in the Android manifest. NPU support requires a native library directory. The guide states that API calls can throw `LiteRtLmJniException` or Kotlin exceptions. It does not state a universal minimum Android API level on the page, so AnalyzerX must not invent one; the native dependency's Gradle/ABI requirements must be confirmed from the version actually selected.

The key implementation consequence is that a real on-device path requires a native Android module and `.litertlm` model artifacts. An Expo JavaScript-only screen cannot load the model directly.

## Official mobile QAT checkpoint observations

- https://huggingface.co/google/gemma-4-E2B-it-qat-mobile-transformers
- https://huggingface.co/google/gemma-4-E4B-it-qat-mobile-transformers

Both supplied mobile checkpoint pages are Google model cards tagged **Transformers**, **Safetensors**, **Gemma 4**, and Apache 2.0. They are not `.litertlm` artifacts. The E2B page reports a 2B-parameter model and the E4B page reports a 4B-effective model; both pages identify the checkpoint family as QAT mobile Transformers.

The model card explains four QAT variants: unquantized QAT (`Q4_0`) for custom downstream compilation/research; GGUF (`Q4_0`) for broad ecosystem compatibility; mobile-optimized (`wNa8o8`) with targeted 2-bit decoding layers, optimized KV caches, and static activations for E2B/E4B; and compressed tensors (`w4a16`) for vLLM. The mobile-optimized variant is explicitly designed for mobile hardware efficiency, but the supplied `*-qat-mobile-transformers` repositories remain Transformers/Safetensors model cards. Therefore a real LiteRT-LM deployment still requires the official conversion/build path to produce a `.litertlm` model artifact; downloading these Safetensors files into an APK would not satisfy the runtime contract.

The cards also state multimodal image understanding and audio support for E2B/E4B, but those model-card capabilities do not by themselves prove that the selected LiteRT-LM Android artifact exposes every modality. The Android runtime capability must be verified separately after conversion and native integration.

## Official LiteRT-LM Gemma 4 guide

- https://developers.google.com/edge/litert-lm/models/gemma-4

The official page explicitly says LiteRT-LM supports Gemma 4 E2B and E4B today, targeting mobile and edge devices. Its model file format is `.litertlm`, converted from Safetensors or other formats. The documented conversion command uses `litert-torch export_hf` with `--externalize_embedder` and a `litert-community/gemma-4-E2B-it-litert-lm` chat-template override. The page shows CPU and GPU backends and a `litert-lm run /path/model.litertlm --prompt=...` command. It also recommends Multi-Token Prediction for GPU backends and says it can benefit CPU tasks.

This is the first official source that fully resolves the format question: the supplied Google `*-qat-mobile-transformers` repositories are not the final Android runtime artifact; a conversion/build step is required to produce `.litertlm` files for LiteRT-LM. The exact E4B conversion command must use the corresponding E4B model and chat-template override, and must be validated before shipping.

## Gradle and model-management findings

- https://developers.google.com/edge/litert-lm/android
- https://developers.google.com/edge/litert-lm/cli/model_management

The official Android dependency is `com.google.ai.edge.litertlm:litertlm-android:latest.release` in the documentation example. The guide warns that `engine.initialize()` can take up to roughly 10 seconds and should run off the UI thread. GPU libraries must be declared as optional native libraries; NPU support needs a bundled native library directory.

The official model-management guide says LiteRT-LM imports `.litertlm` files into a local registry with a Model ID, and supports importing from a local path or from a Hugging Face repository, listing models, renaming, and deleting. Its examples show approximately 2.4 GB for `gemma4-e2b` and 3.4 GB for `gemma4-e4b` in the local registry. These are substantial device downloads and must be treated as user-managed storage, not bundled in the APK.

The official model-management examples reference `litert-community/gemma-4-E2B-it-litert-lm` as the Hugging Face LiteRT-LM repository. This is distinct from the user-supplied Google Transformers/Safetensors repositories and is the artifact source that should be verified for production downloads.

## Official converted LiteRT-LM artifact observations

- https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm
- https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm

The LiteRT Community E2B repository explicitly provides a `.litertlm` model for LiteRT-LM, targets Android/iOS/Desktop/IoT/Web, and reports approximately 2.583 GB on disk. The E4B repository likewise provides `.litertlm`, targets the same platforms, and reports approximately 3.66 GB, including approximately 2.24 GB of decoder weights and 0.67 GB of embedding parameters. The cards describe XNNPack CPU and ML Drift GPU acceleration, and LiteRT-LM facilities such as KV-cache management, prompt templating, and function calling. Both are Apache 2.0.

These artifact sizes make a separate, resumable user download mandatory. E4B should not be offered as a default on low-storage or low-memory devices. The cards describe multimodal components loaded on demand, so actual image/audio support must be tested on the selected Android artifact rather than inferred from text-only execution.

## LiteRT-LM Android release evidence

- https://mvnrepository.com/artifact/com.google.ai.edge.litertlm/litertlm-android

The public Maven artifact page identifies `com.google.ai.edge.litertlm:litertlm-android` as the LiteRT-LM Android API and lists version `0.16.0` as the latest indexed release dated Aug 11, 2026, with earlier 0.15.0, 0.14.0, and 0.13.1 releases. The official Google guide uses `latest.release` as an example, but a production build should pin a tested version rather than use a moving selector. The project currently has no Android native folder or local config-plugin/module, so adding this dependency requires an Expo prebuild/config-plugin and native Kotlin bridge rather than a JavaScript-only change.
