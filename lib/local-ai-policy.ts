export type LocalAIModelId =
  | "qwen3-06b-think"
  | "gemma3-1b"
  | "gemma4-e2b"
  | "gemma4-e4b"
  | "qwen3-06b"
  | "lfm25-12b"
  | "qwen35-08b"
  | "smollm3-3b"
  | "bonsai-8b";

export type LocalAIBackend = "gpu" | "cpu" | "npu" | "unknown";
export type LocalAIRuntimeKind = "litert-lm-android" | "llama-cpp-android" | "transformers-android";
export type LocalAIInstallability = "verified_installable" | "requires_account" | "runtime_pending";
export type LocalAICapability = "text" | "vision" | "audio" | "thinking" | "agentic" | "multilingual" | "fast" | "efficient";

export interface LocalAIModelManifest {
  id: LocalAIModelId;
  displayName: string;
  description: string;
  upstreamRepo: string;
  artifactFile: string | null;
  artifactUrl: string | null;
  format: "litertlm" | "gguf" | "safetensors";
  runtime: LocalAIRuntimeKind;
  installability: LocalAIInstallability;
  revision: string | null;
  sizeBytes: number | null;
  sizeLabel: string;
  requiredFreeStorageBytes: number | null;
  recommendedRamBytes: number | null;
  /**
   * The model's real input context window in tokens. Prompt trimming is driven
   * by this rather than one global assumption, so a 0.6B model is not given the
   * same (small) budget as an 8K-context multimodal model.
   */
  contextTokens: number;
  /** Set when the model is catalogued but cannot be installed in this build. */
  unavailableReason?: string;
  supportedPlatforms: readonly ["android"];
  license: string;
  capabilities: readonly LocalAICapability[];
  sourceNote: string;
  artifactChecksum?: { algorithm: "sha256"; value: string };
}

export interface LocalAIDeviceProfile {
  platform: string;
  osVersion: string | null;
  modelName: string | null;
  totalMemoryBytes: number | null;
  freeStorageBytes: number | null;
  cpuArchitectures: string[];
  backend: LocalAIBackend;
  nativeRuntimeAvailable: boolean;
}

export interface LocalAIModelAssessment {
  model: LocalAIModelManifest;
  eligible: boolean;
  reasons: string[];
  recommended: boolean;
}

const E2B_REVISION = "6b78abd019e61a1ca4cbe3b212d2c9ce8ff38a94";
const E4B_REVISION = "2eee7ac325f20eb8c9ac1d0e972f7c84663062da";
const HUGGING_FACE_BASE = "https://huggingface.co";

export const LOCAL_AI_MODELS: readonly LocalAIModelManifest[] = [
  {
    id: "qwen3-06b",
    displayName: "Qwen3 0.6B Fast (INT4, no-think)",
    description: "The default assistant model: INT4 Qwen3-0.6B with thinking pre-closed, so it answers directly. Roughly twice as quick on a CPU backend as the thinking build, with no chain-of-thought to strip.",
    upstreamRepo: "litert-community/Qwen3-0.6B-int4",
    artifactFile: "qwen3_0.6b_nothink_q4_block32_ekv1280.litertlm",
    artifactUrl: `${HUGGING_FACE_BASE}/litert-community/Qwen3-0.6B-int4/resolve/main/qwen3_0.6b_nothink_q4_block32_ekv1280.litertlm?download=true`,
    format: "litertlm",
    runtime: "litert-lm-android",
    installability: "verified_installable",
    revision: "main",
    sizeBytes: 363_855_872,
    sizeLabel: "347 MB",
    requiredFreeStorageBytes: 520_000_000,
    recommendedRamBytes: 2_500_000_000,
    contextTokens: 1280,
    supportedPlatforms: ["android"],
    license: "Apache-2.0",
    capabilities: ["text", "fast", "efficient", "multilingual"],
    artifactChecksum: { algorithm: "sha256", value: "2df6821ec12702dafd33915e7a1a1adc7c4b053f3672fd9555dfaf3a114c4139" },
    sourceNote: "LiteRT Community INT4 build of Qwen/Qwen3-0.6B. The publisher records the SHA-256 of this exact file; the download is refused unless the bytes match it. Thinking is pre-closed in the file, which is what makes it the fast path.",
  },
  {
    id: "qwen3-06b-think",
    displayName: "Qwen3 0.6B Reasoning (INT4, thinking)",
    description: "The same INT4 Qwen3-0.6B with thinking ON, for multi-step reasoning and harder questions. Slower and it emits a reasoning block before the answer, so it is the optional choice rather than the default.",
    upstreamRepo: "litert-community/Qwen3-0.6B-int4",
    artifactFile: "qwen3_0.6b_q4_block32_ekv1280.litertlm",
    artifactUrl: `${HUGGING_FACE_BASE}/litert-community/Qwen3-0.6B-int4/resolve/main/qwen3_0.6b_q4_block32_ekv1280.litertlm?download=true`,
    format: "litertlm",
    runtime: "litert-lm-android",
    installability: "verified_installable",
    revision: "main",
    sizeBytes: 363_855_872,
    sizeLabel: "347 MB",
    requiredFreeStorageBytes: 520_000_000,
    recommendedRamBytes: 2_500_000_000,
    contextTokens: 1280,
    supportedPlatforms: ["android"],
    license: "Apache-2.0",
    capabilities: ["text", "thinking", "multilingual"],
    sourceNote: "The thinking-on sibling of the default model. Same quantisation and size; the difference is baked into the file's prompt format, which is why it is a separate entry rather than a runtime flag.",
  },
  {
    id: "gemma3-1b",
    displayName: "Gemma 3 1B IT",
    description: "Compact Google Gemma for everyday text chat and image understanding on Android.",
    upstreamRepo: "google/gemma-3-1b-it",
    artifactFile: "gemma3-1b-it-int4.litertlm",
    artifactUrl: `${HUGGING_FACE_BASE}/litert-community/Gemma3-1B-IT/resolve/6d54daa71cfbffba6b2843c08eeb1a27e7430bf0/gemma3-1b-it-int4.litertlm?download=true`,
    format: "litertlm",
    runtime: "litert-lm-android",
    installability: "requires_account",
    revision: "6d54daa71cfbffba6b2843c08eeb1a27e7430bf0",
    sizeBytes: 584_417_280,
    sizeLabel: "584 MB",
    requiredFreeStorageBytes: 800_000_000,
    recommendedRamBytes: 2_000_000_000,
    contextTokens: 8192,
    supportedPlatforms: ["android"],
    license: "Gemma Terms of Use",
    capabilities: ["text", "vision", "multilingual", "fast", "efficient"],
    sourceNote: "Upstream access is publisher-gated and returns an authentication response without a user account; AnalyzerX therefore does not offer an anonymous in-app download for this artifact.",
  },
  {
    id: "gemma4-e2b",
    displayName: "Gemma 4 E2B IT",
    description: "Mobile-optimized multimodal Gemma for text, vision, audio, and reasoning.",
    upstreamRepo: "litert-community/gemma-4-E2B-it-litert-lm",
    artifactFile: "gemma-4-E2B-it.litertlm",
    artifactUrl: `${HUGGING_FACE_BASE}/litert-community/gemma-4-E2B-it-litert-lm/resolve/${E2B_REVISION}/gemma-4-E2B-it.litertlm?download=true`,
    format: "litertlm",
    runtime: "litert-lm-android",
    installability: "verified_installable",
    revision: E2B_REVISION,
    sizeBytes: 2_588_147_712,
    sizeLabel: "2.59 GB",
    requiredFreeStorageBytes: 3_000_000_000,
    recommendedRamBytes: 6_000_000_000,
    contextTokens: 8192,
    supportedPlatforms: ["android"],
    license: "Apache-2.0",
    capabilities: ["text", "vision", "audio", "thinking", "fast"],
    sourceNote: "Official LiteRT-LM Community artifact; native Android bridge required.",
  },
  {
    id: "gemma4-e4b",
    displayName: "Gemma 4 E4B IT",
    description: "Higher-capability mobile-optimized multimodal Gemma for demanding analysis.",
    upstreamRepo: "litert-community/gemma-4-E4B-it-litert-lm",
    artifactFile: "gemma-4-E4B-it.litertlm",
    artifactUrl: `${HUGGING_FACE_BASE}/litert-community/gemma-4-E4B-it-litert-lm/resolve/${E4B_REVISION}/gemma-4-E4B-it.litertlm?download=true`,
    format: "litertlm",
    runtime: "litert-lm-android",
    installability: "verified_installable",
    revision: E4B_REVISION,
    sizeBytes: 3_659_530_240,
    sizeLabel: "3.66 GB",
    requiredFreeStorageBytes: 4_500_000_000,
    recommendedRamBytes: 8_000_000_000,
    contextTokens: 8192,
    supportedPlatforms: ["android"],
    license: "Apache-2.0",
    capabilities: ["text", "vision", "audio", "thinking"],
    sourceNote: "Official LiteRT-LM Community artifact; native Android bridge required.",
  },
  {
    id: "lfm25-12b",
    displayName: "LFM2.5 1.2B",
    description: "Fast on-device Liquid model candidate for everyday text and agentic tasks.",
    upstreamRepo: "LiquidAI/LFM2.5-1.2B-Instruct-GGUF",
    artifactFile: "LFM2.5-1.2B-Instruct-Q4_K_M.gguf",
    artifactUrl: `${HUGGING_FACE_BASE}/LiquidAI/LFM2.5-1.2B-Instruct-GGUF/resolve/76022b8bfa64af5862d6bce90a676c3cc9b17b52/LFM2.5-1.2B-Instruct-Q4_K_M.gguf?download=true`,
    artifactChecksum: { algorithm: "sha256", value: "b1b3de114215d9507409a662a501a631095a479a419584e8a2ded6304b19b4f5" },
    format: "gguf",
    runtime: "llama-cpp-android",
    installability: "runtime_pending",
    revision: "76022b8bfa64af5862d6bce90a676c3cc9b17b52",
    sizeBytes: 730_895_168,
    sizeLabel: "731 MB",
    requiredFreeStorageBytes: 900_000_000,
    recommendedRamBytes: 2_500_000_000,
    contextTokens: 32768,
    supportedPlatforms: ["android"],
    license: "LFM1.0",
    capabilities: ["text", "fast", "agentic"],
    sourceNote: "Official Liquid AI GGUF artifact; checksum pinned, but AnalyzerX llama.cpp Android JNI and device validation remain pending.",
  },
  {
    id: "qwen35-08b",
    displayName: "Qwen 3.5 0.8B GGUF",
    description: "Small multimodal Qwen candidate for lower-memory Android devices.",
    upstreamRepo: "unsloth/Qwen3.5-0.8B-GGUF",
    artifactFile: "Qwen3.5-0.8B-Q4_K_M.gguf",
    artifactUrl: `${HUGGING_FACE_BASE}/unsloth/Qwen3.5-0.8B-GGUF/resolve/6ab461498e2023f6e3c1baea90a8f0fe38ab64d0/Qwen3.5-0.8B-Q4_K_M.gguf?download=true`,
    artifactChecksum: { algorithm: "sha256", value: "bd258782e35f7f458f8aced1adc053e6e92e89bc735ba3be89d38a06121dc517" },
    format: "gguf",
    runtime: "llama-cpp-android",
    installability: "runtime_pending",
    revision: "6ab461498e2023f6e3c1baea90a8f0fe38ab64d0",
    sizeBytes: 532_517_120,
    sizeLabel: "533 MB",
    requiredFreeStorageBytes: 800_000_000,
    recommendedRamBytes: 3_000_000_000,
    contextTokens: 32768,
    supportedPlatforms: ["android"],
    license: "Apache-2.0",
    capabilities: ["text", "vision", "fast", "thinking"],
    sourceNote: "Checksum-pinned GGUF artifact; AnalyzerX still needs a verified Android llama.cpp/VLM bridge and device verification.",
  },
  {
    id: "smollm3-3b",
    displayName: "SmolLM3 3B",
    description: "Apache-2.0 text model candidate for multilingual reasoning and long context.",
    upstreamRepo: "HuggingFaceTB/SmolLM3-3B",
    artifactFile: null,
    artifactUrl: null,
    format: "safetensors",
    runtime: "transformers-android",
    installability: "runtime_pending",
    revision: null,
    sizeBytes: null,
    sizeLabel: "Published primary weights are not an Android artifact",
    unavailableReason: "SmolLM3 publishes Safetensors weights only. There is no Android runtime or installable artifact for it in this build, so it cannot be downloaded or executed.",
    requiredFreeStorageBytes: null,
    recommendedRamBytes: null,
    contextTokens: 8192,
    supportedPlatforms: ["android"],
    license: "Apache-2.0",
    capabilities: ["text", "thinking", "multilingual"],
    sourceNote: "Official card provides Transformers/Safetensors and server runtimes; mobile conversion is not yet verified in AnalyzerX.",
  },
  {
    id: "bonsai-8b",
    displayName: "Bonsai 8B",
    description: "Compressed 8B-class candidate shown in the Atomic reference catalog.",
    upstreamRepo: "prism-ml/Bonsai-8B-gguf",
    artifactFile: null,
    artifactUrl: null,
    format: "gguf",
    runtime: "llama-cpp-android",
    installability: "runtime_pending",
    revision: null,
    sizeBytes: null,
    sizeLabel: "Varies by Bonsai artifact",
    unavailableReason: "No verified Android artifact URL is recorded for Bonsai, and its redistribution terms are unconfirmed. It stays catalogued for transparency but cannot be installed.",
    requiredFreeStorageBytes: null,
    recommendedRamBytes: null,
    contextTokens: 8192,
    supportedPlatforms: ["android"],
    license: "Verify upstream Bonsai artifact terms",
    capabilities: ["text", "fast", "thinking", "efficient" as LocalAICapability],
    sourceNote: "Catalog reference only until the upstream artifact, license, and Android runtime path are verified for redistribution/use.",
  },
];

export function getLocalAIModel(modelId: LocalAIModelId): LocalAIModelManifest {
  const model = LOCAL_AI_MODELS.find((item) => item.id === modelId);
  if (!model) throw new Error(`Unknown Local AI model: ${modelId}`);
  return model;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(0)} MB`;
  return `${Math.max(0, Math.round(bytes / 1_000))} KB`;
}

export function assessLocalAIModel(model: LocalAIModelManifest, device: LocalAIDeviceProfile): LocalAIModelAssessment {
  const reasons: string[] = [];
  if (model.installability === "requires_account") reasons.push("This artifact is publisher-gated and requires an external account; AnalyzerX does not download it anonymously.");
  else if (model.installability !== "verified_installable") reasons.push(`The ${model.runtime} adapter is not shipped in this AnalyzerX build yet.`);
  if (model.installability === "verified_installable" && device.platform !== "android") reasons.push("The native LiteRT-LM bridge is Android-only in this release.");
  if (model.installability === "verified_installable" && !device.nativeRuntimeAvailable) reasons.push("This build does not include the native LiteRT-LM bridge.");
  if (model.recommendedRamBytes !== null && device.totalMemoryBytes !== null && device.totalMemoryBytes < model.recommendedRamBytes) reasons.push(`Recommended device memory is at least ${formatBytes(model.recommendedRamBytes)}.`);
  if (model.requiredFreeStorageBytes !== null && device.freeStorageBytes !== null && device.freeStorageBytes < model.requiredFreeStorageBytes) reasons.push(`Free storage must be at least ${formatBytes(model.requiredFreeStorageBytes)} before download.`);
  if (model.installability === "verified_installable" && device.cpuArchitectures.length > 0 && !device.cpuArchitectures.some((arch) => /arm64|aarch64/i.test(arch))) reasons.push("This artifact requires a 64-bit ARM Android architecture.");
  return { model, eligible: reasons.length === 0, reasons, recommended: false };
}

export function recommendLocalAIModel(device: LocalAIDeviceProfile): LocalAIModelAssessment[] {
  const assessments = LOCAL_AI_MODELS.map((model) => assessLocalAIModel(model, device));
  const priority: LocalAIModelId[] = device.totalMemoryBytes !== null && device.totalMemoryBytes >= 6_000_000_000
    ? ["qwen3-06b", "gemma4-e2b", "gemma4-e4b"]
    : ["qwen3-06b", "gemma4-e2b", "gemma4-e4b"];
  const firstEligible = priority.map((id) => assessments.find((assessment) => assessment.model.id === id)).find((assessment) => assessment?.eligible) ?? assessments.find((assessment) => assessment.eligible);
  return assessments.map((assessment) => ({ ...assessment, recommended: firstEligible?.model.id === assessment.model.id }));
}
