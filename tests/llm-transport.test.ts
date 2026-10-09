import { afterEach, describe, expect, it, vi } from "vitest";

const originalForgeUrl = process.env.BUILT_IN_FORGE_API_URL;
const originalForgeKey = process.env.BUILT_IN_FORGE_API_KEY;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  if (originalForgeUrl === undefined) delete process.env.BUILT_IN_FORGE_API_URL;
  else process.env.BUILT_IN_FORGE_API_URL = originalForgeUrl;
  if (originalForgeKey === undefined) delete process.env.BUILT_IN_FORGE_API_KEY;
  else process.env.BUILT_IN_FORGE_API_KEY = originalForgeKey;
});

describe("LLM transport response validation", () => {
  it("rejects a successful plaintext payload with a safe normalized error", async () => {
    process.env.BUILT_IN_FORGE_API_URL = "https://forge.test";
    process.env.BUILT_IN_FORGE_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Service temporarily unavailable", {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    })));

    const { invokeLLM } = await import("../server/_core/llm");
    await expect(invokeLLM({ messages: [{ role: "user", content: "Hi" }] }))
      .rejects.toThrow("LLM invoke returned a non-JSON response");
  });

  it("rejects malformed JSON even when the upstream advertises JSON", async () => {
    process.env.BUILT_IN_FORGE_API_URL = "https://forge.test";
    process.env.BUILT_IN_FORGE_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Service temporarily unavailable", {
      status: 200,
      headers: { "content-type": "application/json" },
    })));

    const { invokeLLM } = await import("../server/_core/llm");
    await expect(invokeLLM({ messages: [{ role: "user", content: "Hi" }] }))
      .rejects.toThrow("LLM invoke returned malformed JSON");
  });
});
