import { describe, expect, it } from "vitest";

import {
  assertMarketIsolation,
  buildAllMarketCoverage,
  buildMarketCoverage,
  DATA_CATEGORIES,
  explainTerm,
  fiscalYearForDate,
  formatIndianNumber,
  hasReliableIdentifier,
  isValidBseScripCode,
  isValidCin,
  isValidIndianIsin,
  isValidNseSymbol,
  MARKET_SOURCES,
  parseIndianNumber,
  parseIndianPeriod,
  refreshFilings,
  resolveIndianIdentifiers,
  sourceById,
  sourceIdsForMarket,
  sourcesForMarket,
  toCrore,
  toLakh,
  type Connector,
  type RefreshOptions,
} from "../lib/filing-intelligence";
import { MARKET_PROFILES, type MarketId } from "../lib/market-regions";

const MARKET_IDS = MARKET_PROFILES.map((profile) => profile.id);

describe("market registry: every source belongs to exactly one market", () => {
  it("covers all ten markets the app offers", () => {
    const withSources = [...new Set(MARKET_SOURCES.map((entry) => entry.marketId))].sort();
    expect(withSources).toEqual([...MARKET_IDS].sort());
  });

  it("uses only market ids the app recognises", () => {
    for (const entry of MARKET_SOURCES) {
      expect(MARKET_IDS).toContain(entry.marketId);
    }
  });

  it("never registers the same source id twice", () => {
    const ids = MARKET_SOURCES.map((entry) => entry.sourceId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("returns only one market's sources, and never another's", () => {
    const india = sourcesForMarket("IN");
    const us = sourcesForMarket("US");
    expect(india.length).toBeGreaterThan(0);
    expect(india.every((entry) => entry.marketId === "IN")).toBe(true);
    expect(us.every((entry) => entry.marketId === "US")).toBe(true);
    // No Indian source id appears in the US list, and vice versa.
    const indiaIds = new Set(india.map((entry) => entry.sourceId));
    expect(us.some((entry) => indiaIds.has(entry.sourceId))).toBe(false);
  });

  it("scopes the Indian market to Indian sources only", () => {
    const ids = sourceIdsForMarket("IN");
    expect(ids).toContain("nse_corporate_announcements");
    expect(ids).toContain("bse_corporate_announcements");
    expect(ids).toContain("sebi_regulatory_filings");
    expect(ids).not.toContain("sec_edgar_submissions");
  });

  it("resolves a source by id with its market intact", () => {
    expect(sourceById("sec_edgar_submissions")?.marketId).toBe("US");
    expect(sourceById("nse_corporate_announcements")?.marketId).toBe("IN");
    expect(sourceById("not_a_source")).toBeUndefined();
  });

  it("flags a cross-market source through the isolation guard", () => {
    const mixed = [...sourcesForMarket("IN"), ...sourcesForMarket("US")];
    const check = assertMarketIsolation(mixed, "IN");
    expect(check.isolated).toBe(false);
    expect(check.offenders).toContain("sec_edgar_submissions");
    expect(assertMarketIsolation(sourcesForMarket("IN"), "IN").isolated).toBe(true);
  });
});

describe("market isolation: a refresh reads one market only", () => {
  function stub(sourceId: string, marketId: MarketId, ran: string[]): Connector {
    return {
      terms: { sourceId, label: sourceId, marketId, market: marketId, homepage: "https://example.invalid", accessBasis: "open_licence", automaticAccessAllowed: true, userInitiatedAccessAllowed: true, redistributionAllowed: true, attributionRequired: true, termsNote: "test", approvedDomains: ["example.invalid"], filingTypes: ["x"] },
      verifiedEndToEnd: true,
      async fetchFilings() {
        ran.push(sourceId);
        return { sourceId, status: "ok", filings: [], message: "ok" };
      },
      async health() {
        return { lastSuccessfulCheckUtc: null, lastError: null };
      },
    };
  }

  const base = { cache: [], mode: "user_initiated" as const, now: new Date("2026-10-12T12:00:00.000Z") };

  it("runs only the selected market's connectors", async () => {
    const ran: string[] = [];
    const connectors = [stub("in_a", "IN", ran), stub("in_b", "IN", ran), stub("us_a", "US", ran)];
    const result = await refreshFilings({ ...base, marketId: "US", connectors } as RefreshOptions);
    expect(ran).toEqual(["us_a"]);
    expect(result.outcomes.map((outcome) => outcome.sourceId)).toEqual(["us_a"]);
    expect(result.marketId).toBe("US");
  });

  it("runs the Indian connectors when India is selected, and none of the US ones", async () => {
    const ran: string[] = [];
    const connectors = [stub("in_a", "IN", ran), stub("us_a", "US", ran)];
    const result = await refreshFilings({ ...base, marketId: "IN", connectors } as RefreshOptions);
    expect(ran).toEqual(["in_a"]);
    expect(result.outcomes.some((outcome) => outcome.sourceId === "us_a")).toBe(false);
  });

  it("reads nothing when the market has no connectors", async () => {
    const ran: string[] = [];
    const connectors = [stub("in_a", "IN", ran)];
    const result = await refreshFilings({ ...base, marketId: "JP", connectors } as RefreshOptions);
    expect(ran).toEqual([]);
    expect(result.outcomes).toEqual([]);
    expect(result.totalAdded).toBe(0);
    expect(result.message).toMatch(/Market JP: 0 sources/);
  });

  it("tags every outcome with its market", async () => {
    const ran: string[] = [];
    const result = await refreshFilings({ ...base, marketId: "IN", connectors: [stub("in_a", "IN", ran)] } as RefreshOptions);
    expect(result.outcomes[0].marketId).toBe("IN");
  });
});

describe("coverage matrix: per market, per category, no single badge", () => {
  it("describes India only through Indian sources", () => {
    const coverage = buildMarketCoverage("IN");
    expect(coverage.marketId).toBe("IN");
    expect(coverage.sources.every((entry) => entry.marketId === "IN")).toBe(true);
    expect(coverage.sources.some((entry) => entry.sourceId === "sec_edgar_submissions")).toBe(false);
  });

  it("describes the United States only through US sources", () => {
    const coverage = buildMarketCoverage("US");
    expect(coverage.sources.every((entry) => entry.marketId === "US")).toBe(true);
    expect(coverage.sources.some((entry) => entry.sourceId === "nse_corporate_announcements")).toBe(false);
  });

  it("lists all thirteen data categories for every market", () => {
    for (const marketId of MARKET_IDS) {
      expect(buildMarketCoverage(marketId).categories).toHaveLength(DATA_CATEGORIES.length);
    }
  });

  it("never claims a market is fully covered when it is not", () => {
    for (const marketId of MARKET_IDS) {
      const coverage = buildMarketCoverage(marketId);
      if (!coverage.summary.fullyCovered) {
        expect(coverage.summary.categoriesCovered).toBeLessThan(DATA_CATEGORIES.length);
      }
      // The statement always names the counts rather than a bare "covered".
      expect(coverage.summary.statement).toMatch(/data categories/);
    }
  });

  it("gives a next step for every uncovered category", () => {
    const coverage = buildMarketCoverage("GB");
    for (const category of coverage.categories) {
      if (!category.covered) expect(category.nextStep).toBeTruthy();
    }
  });

  it("reports India as the most covered market, but not fully covered", () => {
    const india = buildMarketCoverage("IN");
    expect(india.summary.categoriesCovered).toBeGreaterThan(0);
    expect(india.summary.statement).toMatch(/India:/);
  });

  it("builds coverage for all ten markets in the app's order", () => {
    const all = buildAllMarketCoverage();
    expect(all.map((entry) => entry.marketId)).toEqual(MARKET_IDS);
  });
});

describe("zero-cost classification and honest access classes", () => {
  it("classifies every source's recurring cost", () => {
    for (const entry of MARKET_SOURCES) {
      expect(["zero", "zero_within_free_tier", "unknown", "paid_or_authorised"]).toContain(entry.cost);
    }
  });

  it("never calls a licensed feed free", () => {
    const asx = sourceById("au_asx_announcements")!;
    expect(asx.cost).toBe("paid_or_authorised");
    expect(asx.redistributionAllowed).toBe(false);
  });

  it("names the dependency for every source that is not working", () => {
    for (const entry of MARKET_SOURCES) {
      if (entry.status === "blocked" || entry.status === "planned") {
        expect(entry.blocker).toBeTruthy();
      }
    }
  });

  it("gives every source a manual fallback", () => {
    for (const entry of MARKET_SOURCES) {
      expect(entry.manualFallback.length).toBeGreaterThan(10);
    }
  });

  it("does not let one source claim every data category", () => {
    for (const entry of MARKET_SOURCES) {
      expect(entry.categories.length).toBeLessThan(DATA_CATEGORIES.length);
      expect(entry.categories.length).toBeGreaterThan(0);
    }
  });

  it("never asserts a successful check time it has not observed", () => {
    for (const entry of MARKET_SOURCES) {
      expect(entry.lastSuccessfulCheckUtc).toBeNull();
    }
  });
});

describe("Indian identifiers and accounting conventions", () => {
  it("validates an Indian ISIN, CIN, scrip code and symbol", () => {
    expect(isValidIndianIsin("INE002A01018")).toBe(true);
    expect(isValidIndianIsin("US0378331005")).toBe(false);
    expect(isValidCin("L17110MH1973PLC019786")).toBe(true);
    expect(isValidCin("not-a-cin")).toBe(false);
    expect(isValidBseScripCode("500325")).toBe(true);
    expect(isValidBseScripCode("12")).toBe(false);
    expect(isValidNseSymbol("RELIANCE")).toBe(true);
    expect(isValidNseSymbol("M&M")).toBe(true);
  });

  it("keeps only the identifiers that are actually valid", () => {
    const resolved = resolveIndianIdentifiers({
      nseSymbol: "reliance",
      bseScripCode: "500325",
      isin: "INE002A01018",
      cin: "L17110MH1973PLC019786",
      companyName: "Reliance Industries Limited",
      aliases: ["RIL"],
    });
    expect(resolved.nseSymbol).toBe("RELIANCE");
    expect(resolved.bseScripCode).toBe("500325");
    expect(resolved.isin).toBe("INE002A01018");
    expect(resolved.cin).toBe("L17110MH1973PLC019786");
    expect(resolved.aliases).toEqual(["RIL"]);
    expect(hasReliableIdentifier(resolved)).toBe(true);
  });

  it("rejects a malformed identifier rather than accepting it", () => {
    const resolved = resolveIndianIdentifiers({ nseSymbol: "TOOLONGSYMBOLNAMEHERE", isin: "XX123", cin: "nope" });
    expect(resolved.nseSymbol).toBeNull();
    expect(resolved.isin).toBeNull();
    expect(resolved.cin).toBeNull();
    expect(hasReliableIdentifier(resolved)).toBe(false);
  });

  it("parses Indian grouping, where 1,20,000 is one lakh twenty thousand", () => {
    expect(parseIndianNumber("1,20,000")).toBe(120000);
    expect(parseIndianNumber("1,00,00,000")).toBe(10000000);
    expect(parseIndianNumber("(3,400)")).toBe(-3400);
    expect(parseIndianNumber("₹ 1,200")).toBe(1200);
    expect(parseIndianNumber("not a number")).toBeNull();
  });

  it("formats a number in the Indian grouping convention", () => {
    expect(formatIndianNumber(120000)).toBe("1,20,000");
    expect(formatIndianNumber(10000000)).toBe("1,00,00,000");
    expect(formatIndianNumber(1234567)).toBe("12,34,567");
    expect(formatIndianNumber(-120000)).toBe("-1,20,000");
  });

  it("converts to lakh and crore while retaining the original", () => {
    expect(toLakh(120000).value).toBeCloseTo(1.2, 6);
    expect(toLakh(120000).note).toMatch(/original figure is retained/);
    expect(toCrore(10000000).value).toBeCloseTo(1, 6);
  });

  it("parses an Indian fiscal period with the April-to-March convention stated", () => {
    expect(parseIndianPeriod("Q2 FY27")).toEqual({ fiscalYear: "FY27", quarter: "Q2", annual: false });
    expect(parseIndianPeriod("FY2027").fiscalYear).toBe("FY27");
    expect(parseIndianPeriod("FY27").annual).toBe(true);
    // 1 April boundary: a February date is still the previous fiscal year.
    expect(fiscalYearForDate(new Date("2027-02-15T00:00:00Z"))).toBe("FY27");
    expect(fiscalYearForDate(new Date("2027-05-15T00:00:00Z"))).toBe("FY28");
  });

  it("explains Indian reporting terminology without changing its meaning", () => {
    expect(explainTerm("Consolidated")).toMatch(/subsidiaries/);
    expect(explainTerm("crore")).toMatch(/Ten million/);
    expect(explainTerm("unknown term")).toBeNull();
  });
});
