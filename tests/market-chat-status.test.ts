import { describe, expect, it } from "vitest";

import { streamingStatusLabel } from "../lib/market-chat-runtime";

describe("assistant streaming status label", () => {
  it("does NOT claim grounded evidence for a general question", () => {
    const label = streamingStatusLabel({ engine: "local", model: "Qwen3 0.6B LiteRT", grounded: false });
    expect(label).not.toMatch(/grounded/i);
    expect(label).toBe("Streaming from Qwen3 0.6B LiteRT\u2026");
  });

  it("DOES say grounded when the answer really is grounded", () => {
    const label = streamingStatusLabel({ engine: "local", model: "Qwen3 0.6B LiteRT", grounded: true });
    expect(label).toMatch(/grounded evidence/i);
  });

  it("names the model, and falls back when none is given", () => {
    expect(streamingStatusLabel({ engine: "local", model: "Llama 3.2 1B", grounded: true })).toContain("Llama 3.2 1B");
    expect(streamingStatusLabel({ engine: "local", model: null, grounded: false })).toBe("Streaming from the local model\u2026");
    expect(streamingStatusLabel({ engine: "local", model: "   ", grounded: false })).toBe("Streaming from the local model\u2026");
  });

  it("uses the connected wording for the connected engine", () => {
    expect(streamingStatusLabel({ engine: "connected", grounded: false })).toMatch(/connected evidence/i);
    // The connected path never claims a model is streaming.
    expect(streamingStatusLabel({ engine: "connected", grounded: true })).not.toMatch(/streaming from/i);
  });
});
