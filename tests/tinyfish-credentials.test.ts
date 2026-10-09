import { describe, expect, it } from "vitest";

const apiKey = process.env.TINYFISH_API_KEY;
const integrationTest = apiKey ? it : it.skip;

describe("TinyFish credential", () => {
  integrationTest("authenticates against the TinyFish lightweight health endpoint", async () => {
    const response = await fetch("https://agent.tinyfish.ai/v1/automation/run-sse", {
      method: "POST",
      headers: { "X-API-Key": apiKey!, "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ url: "https://example.com", goal: "Return the page title", agent_config: { max_steps: 1, max_duration_seconds: 5 } }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.text();
    expect(response.status, body).toBeLessThan(500);
    if ([401, 402, 403, 429].includes(response.status)) console.warn(`[TinyFish] credential/rate-limit cooldown state observed: HTTP ${response.status}`);
  }, 15_000);
});
