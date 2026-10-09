import type { LocalAIModelId } from "../lib/local-ai-policy";

export type ResearchRuntimePreference = "auto" | "hosted" | "local" | "deterministic";
export type ResearchRuntime = "hosted" | "local" | "deterministic";

export type ResearchDeviceCapabilities = {
  platform?: string | null;
  totalMemoryBytes?: number | null;
  cpuArchitectures?: string[];
  nativeRuntimeAvailable?: boolean;
  activeModelId?: LocalAIModelId | null;
  localModelReady?: boolean;
};

export type ResearchRuntimeDecision = {
  runtime: ResearchRuntime;
  modelId: LocalAIModelId | null;
  eligible: boolean;
  reasons: string[];
  hostedAvailable: boolean;
};

export function resolveResearchRuntime(input: {
  preference?: ResearchRuntimePreference;
  device?: ResearchDeviceCapabilities;
  hostedAvailable?: boolean;
}): ResearchRuntimeDecision {
  const preference = input.preference ?? "auto";
  const device = input.device ?? {};
  const hostedAvailable = input.hostedAvailable ?? true;
  const localReady = Boolean(device.platform === "android" && device.nativeRuntimeAvailable && device.localModelReady && device.activeModelId);
  const localReasons: string[] = [];
  if (device.platform !== "android") localReasons.push("Local Research Desk inference is currently Android-only.");
  if (!device.nativeRuntimeAvailable) localReasons.push("The native LiteRT/llama.cpp bridge is not verified in this build.");
  if (!device.localModelReady) localReasons.push("No checksum-verified active local model is ready.");
  if (!device.activeModelId) localReasons.push("No active local model was selected.");
  if (preference === "local") return { runtime: localReady ? "local" : "deterministic", modelId: localReady ? device.activeModelId ?? null : null, eligible: localReady, reasons: localReady ? ["Local runtime selected from verified device capabilities."] : localReasons, hostedAvailable };
  if (preference === "hosted") return { runtime: hostedAvailable ? "hosted" : "deterministic", modelId: null, eligible: hostedAvailable, reasons: hostedAvailable ? ["Hosted runtime selected; provider cooldown and quota remain enforced."] : ["Hosted runtime is unavailable or in cooldown."], hostedAvailable };
  if (preference === "auto" && localReady) return { runtime: "local", modelId: device.activeModelId ?? null, eligible: true, reasons: ["Auto policy selected the verified local runtime for this device."], hostedAvailable };
  if (preference === "auto" && hostedAvailable) return { runtime: "hosted", modelId: null, eligible: true, reasons: ["Auto policy selected the hosted runtime because local execution is not verified."], hostedAvailable };
  return { runtime: "deterministic", modelId: null, eligible: true, reasons: [...localReasons, "Deterministic specialist fallback remains available without an LLM runtime."], hostedAvailable };
}
