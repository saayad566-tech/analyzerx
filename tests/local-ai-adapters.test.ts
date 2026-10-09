import { describe, expect, it } from "vitest";

import { getLocalAIAdapter, isLocalAIAdapterUsable } from "../lib/local-ai-adapters";
import { getLocalAIModel } from "../lib/local-ai-policy";

describe("local AI adapter registry", () => {
  it("keeps Gemma on the verified LiteRT-LM path", () => {
    expect(getLocalAIAdapter("gemma3-1b")).toMatchObject({ runtime: "litert-lm-android", status: "verified", supportsVision: true, supportsAudio: false });
    expect(isLocalAIAdapterUsable("gemma3-1b", true)).toBe(true);
    expect(getLocalAIAdapter("gemma4-e2b")).toMatchObject({ runtime: "litert-lm-android", status: "verified", supportsVision: true, supportsAudio: true });
    expect(isLocalAIAdapterUsable("gemma4-e2b", true)).toBe(true);
    expect(isLocalAIAdapterUsable("gemma4-e2b", false)).toBe(false);
  });

  it("keeps Qwen and LFM disabled until their Android adapters are verified", () => {
    expect(getLocalAIAdapter("qwen35-08b")).toMatchObject({ runtime: "llama-cpp-android", status: "runtime_pending" });
    expect(getLocalAIAdapter("lfm25-12b")).toMatchObject({ runtime: "llama-cpp-android", status: "runtime_pending" });
    expect(getLocalAIModel("qwen35-08b")).toMatchObject({ artifactFile: "Qwen3.5-0.8B-Q4_K_M.gguf", artifactChecksum: { algorithm: "sha256", value: expect.stringMatching(/^[a-f0-9]{64}$/) } });
    expect(getLocalAIModel("lfm25-12b")).toMatchObject({ artifactFile: "LFM2.5-1.2B-Instruct-Q4_K_M.gguf", artifactChecksum: { algorithm: "sha256", value: expect.stringMatching(/^[a-f0-9]{64}$/) } });
    expect(isLocalAIAdapterUsable("qwen35-08b", true)).toBe(false);
    expect(isLocalAIAdapterUsable("lfm25-12b", true)).toBe(false);
  });
});
