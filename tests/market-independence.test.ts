/**
 * Per-market independence.
 *
 * Every market is checked individually, then every PAIR is checked for collisions. The
 * point is not that the code runs — it is that each market's identity, formatting, storage
 * keys, benchmarks, universe, news edition and session are genuinely its own, and that
 * nothing one market stores is reachable under another.
 *
 * The pairwise block matters most: a single shared storage key or an identical currency
 * formatter is exactly how two countries end up showing each other's data, and that is
 * invisible when you only test one market at a time.
 */
import { describe, it, expect } from "vitest";

import {
  MARKET_IDS, getMarketProfile, resolveMarketId, isMarketId,
  marketIdForExchange, marketIdForCountryName, UNKNOWN_MARKET,
} from "../lib/market-regions";
import { formatForMarket, formatMarketCurrency, formatMarketNumber, formatMarketCompact, usesIndianGrouping } from "../lib/market-format";
import { sessionForMarket, marketStatus, isMarketTrading } from "../lib/market-session";
import { benchmarksForMarket, hasMarketBenchmarks } from "../lib/market-benchmarks";
import { seedUniverseForMarket } from "../lib/market-universe";
import { newsEditionFor } from "../lib/market-news-edition";
import { marketScopeKey } from "../lib/market-isolation";
import { marketStoreKey } from "../lib/market-scoped-store";
import { lifecycleKey } from "../lib/market-lifecycle";
import { packCacheKey } from "../lib/market-manifest-client";
import {
  COUNTRY_REGISTRY, countryFor, isSupportedMarket, countryForMic,
  countriesForMic, isRegionalMic, exchangesForCountry, searchCountries, SUPPORTED_MARKET_IDS,
} from "../lib/market-registry";

const UTC_NOON = Date.parse("2026-10-15T12:00:00Z");
const india = getMarketProfile("IN");

describe("every market is complete and independent", () => {
  // A loop rather than 10 separate blocks, so a newly added market is covered
  // automatically and cannot be forgotten.
  for (const id of MARKET_IDS) {
    describe(`${id} (${getMarketProfile(id).country})`, () => {
      const profile = getMarketProfile(id);

      it("resolves with a complete profile", () => {
        expect(profile.id).toBe(id);
        expect(profile.country.length).toBeGreaterThan(1);
        expect(profile.currency.length).toBeGreaterThanOrEqual(3);
        expect(profile.timezone).toContain("/");
        expect(profile.exchanges.length).toBeGreaterThan(0);
        expect(profile.tickerExamples.length).toBeGreaterThan(0);
        expect(["deep", "broad", "standard"]).toContain(profile.coverage);
      });

      it("is not a clone of India", () => {
        if (id === "IN") return;
        expect(profile.country).not.toBe(india.country);
        expect(profile.currency).not.toBe(india.currency);
        expect(profile.timezone).not.toBe(india.timezone);
        expect(profile.exchanges.join()).not.toBe(india.exchanges.join());
      });

      it("formats in its own currency, locale and timezone", () => {
        const format = formatForMarket(id);
        expect(format.currencyCode).toBe(profile.currency);
        expect(format.timeZone).toBe(profile.timezone);
        expect(format.locale.length).toBeGreaterThanOrEqual(2);
        expect(format.datePattern.length).toBeGreaterThan(0);
        expect(format.currencySymbol.length).toBeGreaterThan(0);
        expect(formatMarketCurrency(1234567.89, id)).toContain(format.currencySymbol);
        expect(formatMarketNumber(1234567.89, id).length).toBeGreaterThan(0);
        expect(formatMarketCompact(1234567.89, id).length).toBeGreaterThan(0);
      });

      it("uses Indian digit grouping only if it is India", () => {
        expect(usesIndianGrouping(id)).toBe(id === "IN");
        expect(usesIndianGrouping(id)).toBe(formatForMarket(id).grouping === "indian");
      });

      it("handles missing values without throwing", () => {
        expect(formatMarketCurrency(null, id)).toBeDefined();
        expect(formatMarketNumber(undefined, id)).toBeDefined();
        expect(formatMarketCompact(null, id)).toBeDefined();
      });

      it("has five distinct, market-namespaced storage keys", () => {
        const keys = [
          marketScopeKey(id, "quotes", "TEST"),
          marketScopeKey(id, "news", "TEST"),
          marketStoreKey(id, "watchlist"),
          lifecycleKey(id),
          packCacheKey(id, null),
        ];
        for (const key of keys) expect(key).toContain(id);
        expect(new Set(keys).size).toBe(5);
      });

      it("has its own benchmarks", () => {
        expect(hasMarketBenchmarks(id)).toBe(true);
        const symbols = benchmarksForMarket(id).map((asset) => asset.symbol);
        expect(symbols.length).toBeGreaterThan(0);
        for (const symbol of symbols) expect(symbol.length).toBeGreaterThan(0);
        if (id !== "IN") {
          expect(symbols.some((symbol) => /NIFTY|SENSEX/i.test(symbol))).toBe(false);
          expect(symbols.join()).not.toBe(benchmarksForMarket("IN").map((a) => a.symbol).join());
        }
      });

      it("has its own seed universe", () => {
        const universe = seedUniverseForMarket(id);
        expect(universe.length).toBeGreaterThan(0);
        if (id !== "IN") {
          expect(universe.some((symbol) => ["RELIANCE", "TCS", "HDFCBANK", "INFY"].includes(symbol))).toBe(false);
          expect(universe.join()).not.toBe(seedUniverseForMarket("IN").join());
        }
      });

      it("has its own news edition", () => {
        const edition = newsEditionFor(id);
        expect(edition).not.toBeNull();
        expect(edition!.hl.length).toBeGreaterThan(0);
        expect(edition!.gl.length).toBeGreaterThan(0);
        expect(edition!.ceid.length).toBeGreaterThan(0);
      });

      it("has its own session, in its own timezone", () => {
        const session = sessionForMarket(id);
        expect(session.timeZone).toBe(profile.timezone);
        expect(session.regular.length).toBeGreaterThan(0);
        const slot = session.regular[0];
        expect(slot.openMinute).toBeGreaterThanOrEqual(0);
        expect(slot.openMinute).toBeLessThan(1440);
        expect(slot.closeMinute).toBeGreaterThan(slot.openMinute);
        expect(slot.closeMinute).toBeLessThanOrEqual(1440);
      });

      it("computes a coherent market status", () => {
        const status = marketStatus(UTC_NOON, id);
        expect(status.timeZone).toBe(profile.timezone);
        expect(status.status.length).toBeGreaterThan(0);
        expect(status.localTime.length).toBeGreaterThan(0);
        expect(status.isTrading).toBe(status.status === "open");
        expect(isMarketTrading(UTC_NOON, id)).toBe(status.isTrading);
      });

      it("never silently falls back to another market", () => {
        expect(isMarketId(id)).toBe(true);
        expect(resolveMarketId(id)).toBe(id);
        expect(resolveMarketId(id.toLowerCase())).toBe(id);
        expect(resolveMarketId(null)).toBe(UNKNOWN_MARKET);
        expect(resolveMarketId(undefined)).toBe(UNKNOWN_MARKET);
        expect(resolveMarketId("ZZZZ")).toBe(UNKNOWN_MARKET);
      });
    });
  }
});

describe("no two markets collide", () => {
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < MARKET_IDS.length; i += 1) {
    for (let j = i + 1; j < MARKET_IDS.length; j += 1) pairs.push([MARKET_IDS[i], MARKET_IDS[j]]);
  }

  it(`checks all ${pairs.length} pairs`, () => {
    expect(pairs.length).toBe((MARKET_IDS.length * (MARKET_IDS.length - 1)) / 2);
  });

  for (const [a, b] of pairs) {
    it(`${a} and ${b} share no storage key`, () => {
      const kinds = (m: string) => [
        marketScopeKey(m, "quotes", "X"),
        marketScopeKey(m, "news", "X"),
        marketStoreKey(m, "watchlist"),
        lifecycleKey(m),
        packCacheKey(m, null),
      ];
      const left = kinds(a);
      const right = kinds(b);
      for (let k = 0; k < left.length; k += 1) expect(left[k]).not.toBe(right[k]);
    });

    it(`${a} and ${b} do not share a news edition`, () => {
      expect(newsEditionFor(a)!.gl).not.toBe(newsEditionFor(b)!.gl);
    });

    it(`${a} and ${b} format currency differently`, () => {
      if (getMarketProfile(a).currency === getMarketProfile(b).currency) return;
      expect(formatMarketCurrency(1000, a)).not.toBe(formatMarketCurrency(1000, b));
    });
  }
});

describe("the 199-country registry", () => {
  it("has every entry well formed and round-tripping", () => {
    expect(COUNTRY_REGISTRY.length).toBeGreaterThan(150);
    const seen = new Set<string>();
    for (const country of COUNTRY_REGISTRY) {
      expect(typeof country.iso2).toBe("string");
      expect(country.iso2.length).toBeGreaterThan(1);
      expect(seen.has(country.iso2)).toBe(false);
      seen.add(country.iso2);
      expect(country.name.length).toBeGreaterThan(1);
      expect(Array.isArray(country.exchanges)).toBe(true);
      expect(Array.isArray(country.mics)).toBe(true);
      expect(countryFor(country.iso2)?.iso2).toBe(country.iso2);
      expect(Array.isArray(exchangesForCountry(country.iso2))).toBe(true);
    }
  });

  it("never attributes a MIC to the wrong country", () => {
    for (const country of COUNTRY_REGISTRY) {
      for (const mic of country.mics) {
        const claimants = countriesForMic(mic);
        expect(claimants).toContain(country.iso2);
        if (claimants.length === 1) {
          expect(countryForMic(mic)).toBe(country.iso2);
          expect(isRegionalMic(mic)).toBe(false);
        } else {
          // A shared code must refuse to resolve rather than picking a winner.
          expect(countryForMic(mic)).toBeNull();
          expect(isRegionalMic(mic)).toBe(true);
        }
      }
    }
  });

  it("treats BRVM as regional rather than as Benin", () => {
    expect(isRegionalMic("XBRV")).toBe(true);
    expect(countriesForMic("XBRV").length).toBe(8);
    expect(countryForMic("XBRV")).toBeNull();
  });

  it("maps XBSE to Romania and XBEI to China", () => {
    expect(countryForMic("XBSE")).toBe("RO");
    expect(countryForMic("XBEI")).toBe("CN");
    expect(countriesForMic("XBSE")).toEqual(["RO"]);
  });

  it("returns null for unknown input rather than guessing India", () => {
    expect(countryForMic("XXXX")).toBeNull();
    expect(countryForMic("")).toBeNull();
    expect(countryForMic(null)).toBeNull();
    expect(countryFor("ZZ")).toBeNull();
    expect(countryFor(null)).toBeNull();
    expect(countryFor("")).toBeNull();
    expect(countriesForMic("XXXX")).toEqual([]);
  });

  it("supports exactly the ten markets with adapters", () => {
    expect(SUPPORTED_MARKET_IDS.join(",")).toBe(MARKET_IDS.join(","));
    for (const id of SUPPORTED_MARKET_IDS) expect(isSupportedMarket(id)).toBe(true);
    expect(isSupportedMarket("AF")).toBe(false);
  });

  it("searches by name", () => {
    expect(searchCountries("united kingdom").some((c) => c.iso2 === "GB")).toBe(true);
    expect(searchCountries("japan").some((c) => c.iso2 === "JP")).toBe(true);
    expect(searchCountries("qqqqzzzz")).toEqual([]);
  });
});

describe("country and exchange resolution never defaults to India", () => {
  it("maps country names to the right market", () => {
    expect(marketIdForCountryName("India")).toBe("IN");
    expect(marketIdForCountryName("United States")).toBe("US");
    expect(marketIdForCountryName("Japan")).toBe("JP");
    expect(marketIdForCountryName("France")).toBe("FR");
  });

  it("returns UNKNOWN for a name it does not know", () => {
    expect(marketIdForCountryName("Atlantis")).toBe(UNKNOWN_MARKET);
    expect(marketIdForCountryName("")).toBe(UNKNOWN_MARKET);
  });

  it("maps exchange codes to the right market", () => {
    expect(marketIdForExchange("NYSE")).toBe("US");
    expect(marketIdForExchange("NASDAQ")).toBe("US");
    expect(marketIdForExchange("TSE")).not.toBe("IN");
  });

  it("returns UNKNOWN for an exchange it does not know", () => {
    expect(marketIdForExchange("NOTANEXCHANGE")).toBe(UNKNOWN_MARKET);
    expect(marketIdForExchange("")).toBe(UNKNOWN_MARKET);
  });
});
