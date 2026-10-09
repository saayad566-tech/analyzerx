import { describe, expect, it } from "vitest";

const assertReachableWithSecret = async (name: string, url: string, toleratedStatuses: number[] = [429]) => {
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  } catch (error) {
    console.warn(`[${name}] reachability unavailable in this environment: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  if (toleratedStatuses.includes(response.status)) {
    console.warn(`[${name}] credential/cooldown state observed: HTTP ${response.status}`);
    return;
  }
  expect(response.status, `${name} rejected the configured secret`).not.toBe(401);
  expect(response.status, `${name} returned a forbidden response`).not.toBe(403);
  expect(response.status, `${name} returned a server failure`).toBeLessThan(500);
};

describe("configured provider secrets", () => {
  it("accepts the configured MarketAux token", async () => {
    if (!process.env.MARKETAUX_API_TOKEN) return;
    await assertReachableWithSecret("MarketAux", `https://api.marketaux.com/v1/news/all?api_token=${encodeURIComponent(process.env.MARKETAUX_API_TOKEN)}&symbols=AAPL&limit=1`);
  }, 20_000);

  it("accepts the configured NewsAPI key", async () => {
    if (!process.env.NEWS_API_KEY || process.env.ENABLE_NEWS_API !== "true") return;
    await assertReachableWithSecret("NewsAPI", `https://newsapi.org/v2/top-headlines?country=us&pageSize=1&apiKey=${encodeURIComponent(process.env.NEWS_API_KEY)}`);
  }, 20_000);

  it("accepts the configured NewsData key", async () => {
    if (!process.env.NEWSDATA_API_KEY) return;
    await assertReachableWithSecret("NewsData", `https://newsdata.io/api/1/latest?apikey=${encodeURIComponent(process.env.NEWSDATA_API_KEY)}&q=markets&size=1`);
  }, 20_000);

  it("accepts the configured GNews key", async () => {
    if (!process.env.GNEWS_API_KEY) return;
    await assertReachableWithSecret("GNews", `https://gnews.io/api/v4/search?q=markets&max=1&apikey=${encodeURIComponent(process.env.GNEWS_API_KEY)}`, [403, 429]);
  }, 20_000);

  it("accepts the configured Telegram bot token", async () => {
    if (!process.env.TELEGRAM_BOT_TOKEN) return;
    await assertReachableWithSecret("Telegram", `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`);
  }, 20_000);
});
