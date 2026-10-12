import { describe, expect, it } from "vitest";

import { buildBoundedLocalPrompt, buildLocalGroundedPrompt, classifyAssistantFailure, estimatePromptTokens, formatAssistantFailure, isCurrentDataQuestion, isGeneralChatQuestion, localInputBudget, resolveMarketChatEngine, sanitizeLocalOutput, trimLocalHistory } from "../lib/market-chat-runtime";

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
    // The grounded prompt must bind current facts to the verified context...
    expect(prompt).toContain("VERIFIED CONTEXT");
    expect(prompt).toContain("Use the VERIFIED CONTEXT supplied with each question for any current prices");
    // ...while still forbidding fabrication.
    expect(prompt).toContain("Never invent prices");
    expect(prompt).toContain("What is the latest news?");
  });

  it("separates the system instruction from the user turn", () => {
    // The runtime attaches the instruction to the conversation and requires each
    // turn's rendered template to extend the previous one. Repeating the
    // instruction inside every turn is what broke the second message, so the two
    // must be delivered separately.
    const general = buildBoundedLocalPrompt("Hi", "", "Qwen3 0.6B LiteRT", false);
    expect(general.system).toContain("You are AnalyzerX Assistant");
    expect(general.turn).not.toContain("You are AnalyzerX Assistant");
    expect(general.turn).toContain("Hi");
    expect(general.prompt).toContain(general.system);
    expect(general.prompt).toContain(general.turn);

    const grounded = buildBoundedLocalPrompt("What is the latest news?", '{"news":[]}', "Gemma 4 E2B IT", true);
    // The instruction may reference the context, but the context data itself
    // must travel in the turn, not be baked into the instruction.
    expect(grounded.system).not.toContain('{"news":[]}');
    expect(grounded.turn).toContain("VERIFIED CONTEXT");
    expect(grounded.turn).toContain('{"news":[]}');
    // Two turns of a session must differ only in the turn text.
    const second = buildBoundedLocalPrompt("And now?", '{"news":[]}', "Gemma 4 E2B IT", true);
    expect(second.system).toBe(grounded.system);
    expect(second.turn).not.toBe(grounded.turn);
  });

  it("derives the input budget from each model's real context window", () => {
    const small = localInputBudget(2048);
    const large = localInputBudget(32768);
    // A bigger-context model must not be trimmed to a 0.6B model's budget.
    expect(large.tokens).toBeGreaterThan(small.tokens * 4);
    // An unknown window falls back to the smallest model rather than failing.
    expect(localInputBudget(null).tokens).toBe(small.tokens);
    // Bounds hold at both extremes.
    expect(localInputBudget(1).tokens).toBeGreaterThanOrEqual(512);
    expect(localInputBudget(1_000_000).tokens).toBeLessThanOrEqual(32768);
  });

  it("answers definitional questions without demanding live data", () => {
    for (const question of [
      "What is a P/E ratio?",
      "Explain how compound interest works",
      "Tell me a joke about the market",
      "How do I improve my sleep routine?",
    ]) {
      expect(isGeneralChatQuestion(question)).toBe(true);
      expect(isCurrentDataQuestion(question)).toBe(false);
    }
  });

  it("still routes genuine live-data questions to grounding", () => {
    for (const question of [
      "What is the latest news on RELIANCE?",
      "Show me the current price of TCS",
      "What are today's FII flows?",
    ]) {
      expect(isCurrentDataQuestion(question)).toBe(true);
      expect(isGeneralChatQuestion(question)).toBe(false);
    }
  });

  it("never leaks the raw prompt or template tokens into a failure message", () => {
    // The real LiteRT failure that reached the UI embedded the entire rendered
    // prompt, including chat-template tokens.
    const raw = new Error(
      "Failed to start nativeSendMessageAsync: INTERNAL: The new rendered template string does not start with the previous rendered template string.\n" +
      "old_string: <|im_start|>user\nYou are AnalyzerX Assistant...\nUSER:\nHi<|im_end|>\n<|im_start|>assistant\n",
    );
    expect(classifyAssistantFailure(raw)).toBe("NATIVE_RUNTIME");
    const message = formatAssistantFailure(raw);
    expect(message).not.toContain("<|im_start|>");
    expect(message).not.toContain("rendered template");
    expect(message).not.toContain("AnalyzerX Assistant");
    expect(message.length).toBeGreaterThan(0);
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
