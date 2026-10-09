import { describe, expect, it } from "vitest";

import { buildBoundedLocalPrompt, buildLocalGroundedPrompt, estimatePromptTokens, isGeneralChatQuestion, resolveMarketChatEngine, sanitizeLocalOutput, trimLocalHistory } from "../lib/market-chat-runtime";

describe("market chat runtime routing", () => {
  it("uses local inference only with a selected model, native runtime, and no attachments", () => {
    expect(resolveMarketChatEngine({ mode: "local", activeModelId: "gemma4-e2b", nativeRuntimeAvailable: true, hasAttachments: false })).toBe("local");
    expect(resolveMarketChatEngine({ mode: "local", activeModelId: "gemma4-e2b", nativeRuntimeAvailable: false, hasAttachments: false })).toBe("connected");
    expect(resolveMarketChatEngine({ mode: "local", activeModelId: "gemma4-e2b", nativeRuntimeAvailable: true, hasAttachments: true, supportsAttachments: true })).toBe("local");
    expect(resolveMarketChatEngine({ mode: "local", activeModelId: "gemma4-e2b", nativeRuntimeAvailable: true, hasAttachments: true, supportsAttachments: false })).toBe("connected");
  });

  it("uses connected mode for automatic fallback when local execution is unavailable", () => {
    expect(resolveMarketChatEngine({ mode: "auto", activeModelId: "gemma4-e2b", nativeRuntimeAvailable: false, hasAttachments: false })).toBe("connected");
    expect(resolveMarketChatEngine({ mode: "auto", activeModelId: "gemma4-e2b", nativeRuntimeAvailable: true, hasAttachments: true, supportsAttachments: false })).toBe("connected");
    expect(resolveMarketChatEngine({ mode: "auto", activeModelId: null, nativeRuntimeAvailable: true, hasAttachments: false })).toBe("connected");
    expect(resolveMarketChatEngine({ mode: "connected", activeModelId: "gemma4-e2b", nativeRuntimeAvailable: true, hasAttachments: false })).toBe("connected");
  });

  it("builds a bounded anti-fabrication prompt for local inference", () => {
    const prompt = buildLocalGroundedPrompt("What is the latest news?", '{"news":[]}', "Gemma 4 E2B IT");
    expect(prompt).toContain("Gemma 4 E2B IT");
    expect(prompt).toContain("ONLY the verified context");
    expect(prompt).toContain("Never invent current prices");
    expect(prompt).toContain("What is the latest news?");
  });

  it("compacts oversized local context below the hard LiteRT ceiling", () => {
    const result = buildBoundedLocalPrompt("Explain this", "x".repeat(30000), "Qwen3 0.6B LiteRT", true);
    expect(result.wasTrimmed).toBe(true);
    expect(result.estimatedTokens).toBeLessThan(2048);
    expect(estimatePromptTokens(result.prompt)).toBeLessThan(2048);
  });

  it("keeps ordinary chat independent of market grounding", () => {
    expect(isGeneralChatQuestion("How do I improve my sleep routine?")).toBe(true);
    const result = buildBoundedLocalPrompt("How do I improve my sleep routine?", "x".repeat(30000), "Qwen3 0.6B LiteRT", false);
    expect(result.prompt).not.toContain("VERIFIED CONTEXT:");
    expect(result.estimatedTokens).toBeLessThan(1400);
  });

  it("trims each connected history item to the server schema limit", () => {
    const result = trimLocalHistory([{ role: "user", content: "a".repeat(5000) }, { role: "assistant", content: "b".repeat(5000) }]);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((item) => item.content.length <= 1000)).toBe(true);
  });

  it("removes reasoning and chat-template markers from local output", () => {
    expect(sanitizeLocalOutput("<think>private reasoning</think><|im_start|>assistant\nUseful answer<|im_end|>")).toBe("assistant\nUseful answer");
  });
});
