import { describe, expect, it } from "vitest";

import {
  COUNTRY_REGISTRY,
  MARKET_INDEX_SYMBOLS,
  SUPPORTED_MARKET_IDS,
  countryFor,
  countryForMic,
  describeMarketCoverage,
  exchangesForCountry,
  indexSymbolsForMarket,
  isSupportedMarket,
  micsForCountry,
  searchCountries,
} from "../lib/market-registry";
import { MARKET_PROFILES } from "../lib/market-regions";

describe("global market registry (from the GME dataset)", () => {
  it("carries the full country dataset with no fabricated rows", () => {
    expect(COUNTRY_REGISTRY.length).toBe(199);
    for (const country of COUNTRY_REGISTRY) {
      expect(country.iso2).toMatch(/^[A-Z]{2}$/);
      expect(country.name.trim().length).toBeGreaterThan(0);
      expect(country.region.trim().length).toBeGreaterThan(0);
      expect(Array.isArray(country.exchanges)).toBe(true);
      expect(Array.isArray(country.mics)).toBe(true);
    }
  });

  it("has no duplicate ISO2 codes", () => {
    const codes = COUNTRY_REGISTRY.map((country) => country.iso2);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("records MIC codes where the dataset provides them", () => {
    const withMics = COUNTRY_REGISTRY.filter((country) => country.mics.length > 0);
    expect(withMics.length).toBeGreaterThan(90);
    // A known, verifiable pair from the dataset.
    expect(countryForMic("XASX")).toBe("AU");
    expect(countryForMic("xasx")).toBe("AU"); // case-insensitive
    expect(countryForMic("NOT-A-MIC")).toBeNull();
    expect(countryForMic("")).toBeNull();
  });

  it("resolves countries case-insensitively and returns null when unknown", () => {
    expect(countryFor("in")?.name).toBe("India");
    expect(countryFor(" us ")?.name).toBe("United States");
    expect(countryFor("ZZ")).toBeNull();
    expect(countryFor(null)).toBeNull();
  });

  it("exposes exchanges and MICs per country", () => {
    expect(exchangesForCountry("AU")).toContain("ASX");
    expect(micsForCountry("AU")).toContain("XASX");
    expect(exchangesForCountry("ZZ")).toEqual([]);
    expect(micsForCountry("ZZ")).toEqual([]);
  });

  it("separates KNOWN markets from SUPPORTED markets", () => {
    // A country can be in the registry and still have no adapter.
    const known = countryFor("BR");
    expect(known).not.toBeNull();
    expect(isSupportedMarket("BR")).toBe(false);
    const coverage = describeMarketCoverage("BR");
    expect(coverage.known).toBe(true);
    expect(coverage.supported).toBe(false);
    expect(coverage.status).toBe("Not Implemented");
    expect(coverage.reason).toMatch(/no data adapter/i);
  });

  it("never claims coverage for an unknown identifier", () => {
    const coverage = describeMarketCoverage("ZZ");
    expect(coverage.known).toBe(false);
    expect(coverage.supported).toBe(false);
    expect(coverage.status).toBe("Not Implemented");
    expect(coverage.reason).toMatch(/not in the reference registry/i);
  });

  it("reports the supported markets as Operational", () => {
    for (const marketId of SUPPORTED_MARKET_IDS) {
      const coverage = describeMarketCoverage(marketId);
      expect(coverage.known).toBe(true);
      expect(coverage.supported).toBe(true);
      expect(coverage.status).toBe("Operational");
      expect(coverage.reason).toMatch(/adapters/i);
    }
  });

  it("keeps the registry and the app's market profiles in agreement", () => {
    // If these two ever disagree, the app would offer a market it cannot serve.
    const profileIds = MARKET_PROFILES.map((profile) => profile.id).sort();
    expect([...SUPPORTED_MARKET_IDS].sort()).toEqual(profileIds);
    for (const marketId of SUPPORTED_MARKET_IDS) expect(countryFor(marketId)).not.toBeNull();
  });

  it("returns index symbols only for supported markets", () => {
    expect(indexSymbolsForMarket("US")).toContain("^GSPC");
    expect(indexSymbolsForMarket("IN")).toContain("^NSEI");
    expect(indexSymbolsForMarket("BR")).toEqual([]);
    expect(indexSymbolsForMarket("ZZ")).toEqual([]);
    // Every declared index symbol belongs to a supported market.
    for (const key of Object.keys(MARKET_INDEX_SYMBOLS)) expect(isSupportedMarket(key)).toBe(true);
  });

  it("searches countries by name or code, and never throws", () => {
    expect(searchCountries("ind").some((country) => country.iso2 === "IN")).toBe(true);
    expect(searchCountries("US")[0].iso2).toBe("US");
    expect(searchCountries("")).toEqual([]);
    expect(searchCountries("zzzzzz")).toEqual([]);
    expect(searchCountries("a", 3).length).toBeLessThanOrEqual(3);
  });
});
