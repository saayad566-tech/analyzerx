import { describe, expect, it } from "vitest";
import { getProviderRegistry } from "../server/provider-registry";

describe("provider registry", () => {
  it("keeps relevant providers discoverable without pretending missing credentials are configured", () => {
    const providers = getProviderRegistry();
    expect(providers.map((provider) => provider.id)).toEqual(expect.arrayContaining(["finnhub", "indian-api", "marketaux", "newsapi", "nasdaq-data-link", "telegram", "discord"]));
    const marketAux = providers.find((provider) => provider.id === "marketaux");
    expect(marketAux?.sourceUrl).toContain("marketaux.com");
    if (!process.env.MARKETAUX_API_TOKEN) expect(marketAux?.status).toBe("needs_secret");
  });

  it("exposes news-provider capability states without performing network calls", () => {
    const newsProviders = getProviderRegistry().filter((provider) => provider.domain === "news");
    expect(newsProviders.length).toBeGreaterThanOrEqual(5);
    expect(newsProviders.every((provider) => ["configured", "needs_secret", "not_implemented"].includes(provider.status))).toBe(true);
  });
});
