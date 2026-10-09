import { describe, expect, it } from "vitest";

import { assertJsonApiResponse } from "../lib/api-response-validation";

describe("tRPC transport response validation", () => {
  it("rejects a plaintext API response before client JSON parsing", () => {
    expect(() => assertJsonApiResponse({
      status: 200,
      contentType: "text/plain",
      body: "Service temporarily unavailable",
    }, "https://api.example.test/api/trpc/chat.ask"))
      .toThrow("AnalyzerX API returned a non-JSON response (200)");
  });

  it("rejects malformed JSON even when the API advertises JSON", () => {
    expect(() => assertJsonApiResponse({
      status: 200,
      contentType: "application/json",
      body: "Service temporarily unavailable",
    }, "https://api.example.test/api/trpc/chat.ask"))
      .toThrow("AnalyzerX API returned malformed JSON (200)");
  });

  it("preserves valid tRPC JSON responses", () => {
    expect(() => assertJsonApiResponse({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: '[{"result":{"data":{"json":{"ok":true}}}}]',
    }, "https://api.example.test/api/trpc/chat.ask")).not.toThrow();
  });
});
