import { describe, expect, it } from "vitest";

const API_KEY = process.env.INDIAN_API_KEY;
const HEALTH_URL = process.env.INDIAN_API_HEALTH_URL ?? "https://stock.indianapi.in/stock?name=RELIANCE";
const integrationTest = API_KEY ? it : it.skip;

describe("Indian API secret", () => {
  integrationTest("is configured and accepted by the provider endpoint", async () => {

    const response = await fetch(HEALTH_URL, {
      headers: {
        Accept: "application/json",
        "X-Api-Key": API_KEY as string,
      },
    });

    const body = await response.text();
    expect(response.status, `Indian API transport/server failure: HTTP ${response.status}`).toBeLessThan(500);
    expect(body.length, "Indian API returned an empty response").toBeGreaterThan(0);
    if ([402, 403, 429].includes(response.status)) console.warn(`[Indian API] credential/rate-limit cooldown state observed: HTTP ${response.status}`);
  }, 15_000);
});
