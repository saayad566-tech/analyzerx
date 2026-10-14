/**
 * Registry-backed country and exchange resolution.
 *
 * These exist because the fundamentals path carried its own inline country-to-market and
 * exchange-to-country maps. They drifted from the market registry, and the drift had a
 * real consequence: an unrecognised country silently became "UNKNOWN", which then
 * produced the wrong market-cap convention and the wrong market-cap band for that
 * company — a data-integrity fault, not just duplication.
 *
 * The registry is now the only source, and these assert it resolves every supported
 * market and never guesses one.
 */
import { describe, it, expect } from "vitest";
import { marketIdForCountryName, marketIdForExchange, MARKET_PROFILES, getMarketProfile } from "../lib/market-regions";

const MARKETS = ["IN", "US", "GB", "CA", "AU", "JP", "SG", "HK", "DE", "FR"];

describe("country name resolution", () => {
  it("resolves every supported market from its own registry country label", () => {
    for (const id of MARKETS) {
      const country = getMarketProfile(id).country;
      expect(marketIdForCountryName(country), `${country} did not resolve to ${id}`).toBe(id);
    }
  });

  it("is case-insensitive and trims", () => {
    expect(marketIdForCountryName("united states")).toBe("US");
    expect(marketIdForCountryName("  UNITED KINGDOM  ")).toBe("GB");
    expect(marketIdForCountryName("india")).toBe("IN");
  });

  it("never guesses a market it does not know", () => {
    for (const unknown of ["Atlantis", "", "   ", null, undefined, "United States of Atlantis"]) {
      expect(marketIdForCountryName(unknown), `${String(unknown)} was guessed`).toBe("UNKNOWN");
    }
  });

  it("does not confuse one market for another", () => {
    // The old inline map defaulted to UNKNOWN and had no entry for several markets, so
    // this guards the specific regressions that could reappear.
    expect(marketIdForCountryName("Germany")).toBe("DE");
    expect(marketIdForCountryName("France")).toBe("FR");
    expect(marketIdForCountryName("Hong Kong")).toBe("HK");
    expect(marketIdForCountryName("Singapore")).toBe("SG");
    expect(marketIdForCountryName("Australia")).toBe("AU");
    expect(marketIdForCountryName("Canada")).toBe("CA");
    expect(marketIdForCountryName("Japan")).toBe("JP");
  });
});

describe("exchange resolution", () => {
  it("resolves markets from their registry exchange names", () => {
    for (const id of MARKETS) {
      const exchange = getMarketProfile(id).exchanges[0];
      if (!exchange) continue;
      expect(marketIdForExchange(exchange), `${exchange} did not resolve`).toBe(id);
    }
  });

  it("never guesses a market for an unknown exchange", () => {
    for (const unknown of ["", "   ", null, undefined, "ZZZZ"]) {
      expect(marketIdForExchange(unknown), `${String(unknown)} was guessed`).toBe("UNKNOWN");
    }
  });
});

describe("registry integrity", () => {
  it("has one profile per market with a non-empty country and at least one exchange", () => {
    for (const id of MARKETS) {
      const profile = getMarketProfile(id);
      expect(profile.id).toBe(id);
      expect(profile.country.trim().length).toBeGreaterThan(0);
      expect(profile.exchanges.length, `${id} lists no exchange`).toBeGreaterThan(0);
    }
  });

  it("has no two markets sharing a country label", () => {
    const seen = new Map<string, string>();
    for (const profile of MARKET_PROFILES) {
      const key = profile.country.trim().toLowerCase();
      expect(seen.has(key), `${profile.id} and ${seen.get(key)} share the country label ${profile.country}`).toBe(false);
      seen.set(key, profile.id);
    }
  });
});
