import { describe, expect, it } from "vitest";

import {
  LOCAL_AI_MODELS,
  assessLocalAIModel,
  formatBytes,
  getLocalAIModel,
  recommendLocalAIModel,
} from "../lib/local-ai-policy";
const androidFlagship = {
  platform: "android",
  osVersion: "16",
  modelName: "Test Android flagship",
  totalMemoryBytes: 12_000_000_000,
  freeStorageBytes: 10_000_000_000,
  cpuArchitectures: ["arm64-v8a"],
  backend: "gpu" as const,
  nativeRuntimeAvailable: true,
};

describe("Local AI model registry", () => {
  it("uses the official converted LiteRT-LM artifacts rather than Safetensors", () => {
    const gemmaModels = LOCAL_AI_MODELS.filter((model) => model.id.startsWith("gemma4-"));
    expect(LOCAL_AI_MODELS.length).toBeGreaterThanOrEqual(6);
    expect(gemmaModels).toHaveLength(2);
    expect(gemmaModels.every((model) => model.format === "litertlm" && model.artifactUrl?.includes("litert-community"))).toBe(true);
    expect(getLocalAIModel("gemma4-e2b").sizeBytes).toBe(2_588_147_712);
    expect(getLocalAIModel("gemma4-e4b").sizeBytes).toBe(3_659_530_240);
  });

  it("recommends the public Qwen artifact first and blocks non-installable catalog candidates", () => {
    const result = recommendLocalAIModel(androidFlagship);
    expect(result.find((item) => item.recommended)?.model.id).toBe("qwen3-06b");
    expect(result.filter((item) => item.model.installability === "verified_installable").every((item) => item.eligible)).toBe(true);
    expect(result.filter((item) => item.model.installability === "requires_account").every((item) => !item.eligible && item.reasons.join(" ").includes("publisher-gated"))).toBe(true);
    expect(result.filter((item) => item.model.installability === "runtime_pending").every((item) => !item.eligible && item.reasons.join(" ").includes("adapter"))).toBe(true);
  });

  it("blocks both models when the native bridge is absent", () => {
    const result = recommendLocalAIModel({ ...androidFlagship, nativeRuntimeAvailable: false });
    expect(result.every((item) => !item.eligible)).toBe(true);
    expect(result[0].reasons.join(" ")).toContain("native LiteRT-LM bridge");
  });

  it("blocks E4B on insufficient memory and storage without inventing a fallback", () => {
    const result = assessLocalAIModel(getLocalAIModel("gemma4-e4b"), {
      ...androidFlagship,
      totalMemoryBytes: 6_000_000_000,
      freeStorageBytes: 4_000_000_000,
    });
    expect(result.eligible).toBe(false);
    expect(result.reasons.join(" ")).toContain("Recommended device memory");
    expect(result.reasons.join(" ")).toContain("Free storage");
  });


  it("formats large artifacts clearly for the model picker", () => {
    expect(formatBytes(2_588_147_712)).toBe("2.59 GB");
    expect(formatBytes(500_000_000)).toBe("500 MB");
  });

  it("covers every catalogued model with an explicit lifecycle classification", () => {
    expect(LOCAL_AI_MODELS.map((model) => model.id)).toEqual(["qwen3-06b", "qwen3-06b-think", "gemma3-1b", "gemma4-e2b", "gemma4-e4b", "lfm25-12b", "qwen35-08b", "smollm3-3b", "bonsai-8b"]);
    expect(LOCAL_AI_MODELS.filter((model) => model.installability === "verified_installable")).toHaveLength(4);
    expect(LOCAL_AI_MODELS.filter((model) => model.installability === "requires_account")).toHaveLength(1);
    expect(LOCAL_AI_MODELS.filter((model) => model.installability === "runtime_pending")).toHaveLength(4);
    // The default is the INT4 no-think build: smaller and roughly twice as quick on a CPU
    // backend than the thinking build, with the publisher's own SHA-256 pinned.
    expect(getLocalAIModel("qwen3-06b")).toMatchObject({ sizeBytes: 363_855_872, format: "litertlm", installability: "verified_installable", artifactChecksum: { algorithm: "sha256", value: "2df6821ec12702dafd33915e7a1a1adc7c4b053f3672fd9555dfaf3a114c4139" } });
    // And the reasoning sibling is offered as a separate, explicit choice.
    expect(getLocalAIModel("qwen3-06b-think")).toMatchObject({ format: "litertlm", installability: "verified_installable" });
    expect(LOCAL_AI_MODELS.filter((model) => model.installability !== "verified_installable").every((model) => model.sourceNote.length > 20)).toBe(true);
  });
});
