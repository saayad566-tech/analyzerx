import { describe, expect, it } from "vitest";

const token = process.env.FINNHUB_API_KEY;
const integrationTest = token ? it : it.skip;

describe("Finnhub configuration", () => {
  integrationTest("accepts the configured API key on a lightweight quote request", async () => {

    const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=AAPL&token=${encodeURIComponent(token!)}`);
    expect(response.ok).toBe(true);

    const payload = await response.json() as { c?: unknown; error?: string };
    expect(payload.error, "Finnhub rejected the configured API key").toBeUndefined();
    expect(payload).toHaveProperty("c");
  }, 20_000);
});
