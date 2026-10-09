import { describe, expect, it } from "vitest";
import { buildCoinGeckoMarketsUrl, buildEcbDataUrl, buildSecCompanyFactsUrl, buildWorldBankIndicatorUrl, coinGeckoMarkets, fetchPublicDataParallel, fredObservations, openFigiMapping } from "../server/public-data-adapters";
import { getSourceCatalog } from "../server/source-catalog";

describe("public data adapters", () => {
  it("builds official endpoint URLs without changing identifiers", () => {
    expect(buildSecCompanyFactsUrl("320193")).toContain("CIK0000320193.json");
    expect(buildWorldBankIndicatorUrl("IND", "NY.GDP.MKTP.CD", 2020, 2024)).toContain("date=2020:2024");
    expect(buildEcbDataUrl("EXR/D.USD.EUR.SP00.A")).toContain("format=jsondata");
    expect(buildCoinGeckoMarketsUrl("usd", ["bitcoin"])).toContain("ids=bitcoin");
  });

  it("returns truthful unavailable states when provider keys are missing", async () => {
    const fred = await fredObservations("DFF", "");
    const crypto = await coinGeckoMarkets("usd", ["bitcoin"], "");
    expect(fred.status).toBe("unavailable");
    expect(fred.error).toContain("FRED_API_KEY");
    expect(crypto.status).toBe("unavailable");
    expect(crypto.error).toContain("COINGECKO_API_KEY");
  });

  it("exposes an identifier adapter with a machine-readable contract", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify([{ figi: "BBG000B9XRY4" }]), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
    const result = await openFigiMapping([{ idType: "TICKER", idValue: "AAPL", exchCode: "US" }]);
    expect(result.status).toBe("ok");
    expect(result.data).toEqual([{ figi: "BBG000B9XRY4" }]);
    globalThis.fetch = originalFetch;
  });

  it("isolates parallel provider failures and returns partial data", async () => {
    const result = await fetchPublicDataParallel<{ good: unknown; bad: unknown }>({
      good: async () => ({ sourceKey: "good", status: "ok", data: { value: 1 }, url: "https://good", retrievedAt: new Date().toISOString(), provenance: { source: "good", url: "https://good", retrievedAt: new Date().toISOString() } }),
      bad: async () => ({ sourceKey: "bad", status: "cooldown", data: null, url: "https://bad", retrievedAt: new Date().toISOString(), error: "HTTP 429", provenance: { source: "bad", url: "https://bad", retrievedAt: new Date().toISOString() } }),
    });
    expect(result.status).toBe("partial");
    expect(result.data.good).toEqual({ value: 1 });
    expect(result.results.find((item) => item.sourceKey === "bad")?.status).toBe("cooldown");
  });

  it("catalogs the researched free/public providers with truthful auth boundaries", () => {
    const catalog = getSourceCatalog();
    expect(catalog.find((source) => source.key === "ecb-sdmx")?.requiresAuthorization).toBe(false);
    expect(catalog.find((source) => source.key === "openfigi")?.requiresAuthorization).toBe(false);
    expect(catalog.find((source) => source.key === "fred-api")?.requiresAuthorization).toBe(true);
    expect(catalog.find((source) => source.key === "coingecko-demo")?.requiresAuthorization).toBe(true);
    expect(catalog.find((source) => source.key === "gdelt-news")?.directMachineReadable).toBe(true);
  });
});
