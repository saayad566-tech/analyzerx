import { getLocalAIModel, type LocalAIModelId, type LocalAIRuntimeKind } from "./local-ai-policy";

export type LocalAIAdapterStatus = "verified" | "runtime_pending";

export type LocalAIAdapterDescriptor = {
  modelId: LocalAIModelId;
  runtime: LocalAIRuntimeKind;
  status: LocalAIAdapterStatus;
  artifactFormat: "litertlm" | "gguf" | "safetensors";
  supportsText: boolean;
  supportsVision: boolean;
  supportsAudio: boolean;
  note: string;
};

const ADAPTER_NOTES: Record<LocalAIModelId, LocalAIAdapterDescriptor> = {
  "qwen3-06b": { modelId: "qwen3-06b", runtime: "litert-lm-android", status: "verified", artifactFormat: "litertlm", supportsText: true, supportsVision: false, supportsAudio: false, note: "Public LiteRT-LM Android artifact with anonymous download access; device load validation is required." },
  "qwen3-06b-think": { modelId: "qwen3-06b-think", runtime: "litert-lm-android", status: "verified", artifactFormat: "litertlm", supportsText: true, supportsVision: false, supportsAudio: false, note: "Thinking-on sibling of the default model; same INT4 file family, slower because it emits a reasoning block first." },
  "gemma3-1b": { modelId: "gemma3-1b", runtime: "litert-lm-android", status: "verified", artifactFormat: "litertlm", supportsText: true, supportsVision: true, supportsAudio: false, note: "LiteRT-LM Android bridge is implemented; APK/device validation is still required." },
  "gemma4-e2b": { modelId: "gemma4-e2b", runtime: "litert-lm-android", status: "verified", artifactFormat: "litertlm", supportsText: true, supportsVision: true, supportsAudio: true, note: "LiteRT-LM Android bridge is implemented; APK/device validation is still required." },
  "gemma4-e4b": { modelId: "gemma4-e4b", runtime: "litert-lm-android", status: "verified", artifactFormat: "litertlm", supportsText: true, supportsVision: true, supportsAudio: true, note: "LiteRT-LM Android bridge is implemented; APK/device validation is still required." },
  "lfm25-12b": { modelId: "lfm25-12b", runtime: "llama-cpp-android", status: "runtime_pending", artifactFormat: "gguf", supportsText: true, supportsVision: false, supportsAudio: false, note: "Liquid AI publishes GGUF checkpoints and llama.cpp guidance; AnalyzerX still needs an Android llama.cpp JNI build and artifact verification." },
  "qwen35-08b": { modelId: "qwen35-08b", runtime: "llama-cpp-android", status: "runtime_pending", artifactFormat: "gguf", supportsText: true, supportsVision: true, supportsAudio: false, note: "Qwen publishes GGUF checkpoints and llama.cpp guidance; AnalyzerX still needs an Android llama.cpp/VLM bridge and device verification." },
  "smollm3-3b": { modelId: "smollm3-3b", runtime: "transformers-android", status: "runtime_pending", artifactFormat: "safetensors", supportsText: true, supportsVision: false, supportsAudio: false, note: "Primary Safetensors distribution is not an installable Android artifact in AnalyzerX." },
  "bonsai-8b": { modelId: "bonsai-8b", runtime: "llama-cpp-android", status: "runtime_pending", artifactFormat: "gguf", supportsText: true, supportsVision: false, supportsAudio: false, note: "Bonsai artifact and license must be verified before redistribution or runtime enablement." },
};

export function getLocalAIAdapter(modelId: LocalAIModelId): LocalAIAdapterDescriptor {
  const model = getLocalAIModel(modelId);
  return ADAPTER_NOTES[model.id];
}

export function isLocalAIAdapterUsable(modelId: LocalAIModelId, nativeRuntimeAvailable: boolean): boolean {
  const adapter = getLocalAIAdapter(modelId);
  return adapter.status === "verified" && nativeRuntimeAvailable;
}
