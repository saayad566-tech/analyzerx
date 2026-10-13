import { describe, expect, it } from "vitest";

import { createStreamingSanitizer, sanitizeAssistantOutput } from "../lib/assistant-output";

const SYSTEM = "You are AnalyzerX Assistant, a helpful, knowledgeable AI assistant running privately on this device as Qwen3 0.6B LiteRT.\nAnswer whatever the user asks.";

describe("assistant output guard — single shot", () => {
  it("removes a balanced reasoning block", () => {
    expect(sanitizeAssistantOutput("<think>private reasoning</think>Useful answer")).toBe("Useful answer");
  });

  it("removes an unclosed reasoning block (mid-stream leak)", () => {
    expect(sanitizeAssistantOutput("<think>still thinking and leaking")).toBe("");
  });

  it("strips chat-template control tokens across model families", () => {
    expect(sanitizeAssistantOutput("<|lim_start|>assistant\nHello there<|lim_end|>")).toBe("Hello there");
    expect(sanitizeAssistantOutput("<|im_start|>assistant\nUseful answer<|im_end|>")).toBe("Useful answer");
    expect(sanitizeAssistantOutput("<start_of_turn>model\nNifty closed higher.<end_of_turn>")).toBe("Nifty closed higher.");
    expect(sanitizeAssistantOutput("<|start_header_id|>assistant<|end_header_id|>\nAnswer<|eot_id|>")).toBe("Answer");
    expect(sanitizeAssistantOutput("Value is <|weird_token_9|>42")).toBe("Value is 42");
  });

  it("strips a system-instruction echo", () => {
    expect(sanitizeAssistantOutput(`${SYSTEM} Paris is the capital of France.`, { systemInstruction: SYSTEM }))
      .toBe("Paris is the capital of France.");
  });

  it("strips the native template error and its dumped prompt", () => {
    const leaked = "Failed to start nativeSendMessageAsync: INTERNAL: The new rendered template string does not start with the previous rendered template string.\nold_string: <|im_start|>user\nYou are AnalyzerX Assistant...";
    const out = sanitizeAssistantOutput(leaked);
    expect(out).not.toContain("rendered template");
    expect(out).not.toContain("<|im_start|>");
  });

  it("strips template-diff labels", () => {
    expect(sanitizeAssistantOutput("new_string: hello")).toBe("hello");
  });

  it("preserves legitimate financial content", () => {
    expect(sanitizeAssistantOutput("RELIANCE is up 2.35% at ₹2,945.60 today.")).toBe("RELIANCE is up 2.35% at ₹2,945.60 today.");
    // A genuine less-than sign in prose must survive.
    expect(sanitizeAssistantOutput("Revenue grew: 5 < 7 is true.")).toContain("5 < 7");
  });

  it("handles empty and non-string input", () => {
    expect(sanitizeAssistantOutput("")).toBe("");
    expect(sanitizeAssistantOutput(undefined as unknown as string)).toBe("");
  });
});

describe("assistant output guard — streaming", () => {
  it("withholds a reasoning channel then emits the answer", () => {
    const guard = createStreamingSanitizer();
    let out = "";
    for (const token of ["<thi", "nk>", "secret reasoning ", "here", "</thi", "nk>", "Final ", "answer"]) out += guard.push(token);
    out += guard.flush();
    expect(out).toBe("Final answer");
    expect(guard.suppressedReasoning).toBe(true);
  });

  it("never flashes a control token split across frames", () => {
    const guard = createStreamingSanitizer();
    let out = "";
    for (const token of ["Hello ", "<|im_", "start|>", "assistant", " world"]) out += guard.push(token);
    out += guard.flush();
    expect(out).not.toContain("<|");
    expect(out).toContain("Hello");
    expect(out).toContain("world");
  });

  it("emits nothing for an interrupted reasoning-only generation", () => {
    const guard = createStreamingSanitizer();
    let out = "";
    for (const token of ["<think>", "never closed "]) out += guard.push(token);
    out += guard.flush();
    expect(out).toBe("");
  });

  it("streams a plain answer through unchanged", () => {
    const guard = createStreamingSanitizer();
    let out = "";
    for (const token of ["The ", "answer ", "is ", "42."]) out += guard.push(token);
    out += guard.flush();
    expect(out).toBe("The answer is 42.");
  });

  it("holds back a leading system-instruction echo", () => {
    const guard = createStreamingSanitizer({ systemInstruction: SYSTEM });
    let out = "";
    for (const word of SYSTEM.split(" ")) out += guard.push(`${word} `);
    out += guard.push("Paris is the capital.");
    out += guard.flush();
    expect(out).not.toContain("You are AnalyzerX Assistant");
    expect(out).toContain("Paris");
  });

  it("respects the maxChars cap", () => {
    const guard = createStreamingSanitizer({ maxChars: 5 });
    let out = "";
    out += guard.push("abcdefghij");
    out += guard.flush();
    expect(out.length).toBeLessThanOrEqual(5);
  });
});
