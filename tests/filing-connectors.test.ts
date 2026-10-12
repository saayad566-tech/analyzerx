import { describe, expect, it } from "vitest";

import {
  BSE_TERMS,
  cacheSummary,
  cachedForCompany,
  COMPANY_UNIVERSE_SIZE,
  DATAGOVIN_TERMS,
  dedupKey,
  describeStatus,
  evaluateAccess,
  externalIdFromLink,
  industriesInUniverse,
  isApprovedUrl,
  mergeFetched,
  NSE_TERMS,
  parseRssItems,
  refreshFilings,
  resolveIndianCompany,
  searchIndianCompanies,
  SEC_TERMS,
} from "../lib/filing-intelligence";
import type { CachedFiling, Connector, ConnectorResult } from "../lib/filing-intelligence";

const now = new Date("2026-10-12T12:00:00.000Z");

describe("access policy (compliance)", () => {
  it("blocks NSE for automatic polling but allows a user-initiated read", () => {
    const auto = evaluateAccess(NSE_TERMS, "automatic");
    expect(auto.allowed).toBe(false);
    expect(auto.status).toBe("blocked");
    expect(auto.reason).toMatch(/automated collection/i);

    const manual = evaluateAccess(NSE_TERMS, "user_initiated");
    expect(manual.allowed).toBe(true);
    expect(manual.reason).toMatch(/attribution/i);
  });

  it("blocks BSE automatically, as it does NSE", () => {
    expect(evaluateAccess(BSE_TERMS, "automatic").allowed).toBe(false);
    expect(evaluateAccess(BSE_TERMS, "automatic").status).toBe("blocked");
  });

  it("allows an authorized feed automatically, because its terms permit it", () => {
    // SEC EDGAR publishes a documented API that permits access with a
    // descriptive User-Agent, so it is not blocked for background use. The
    // adapter is not implemented, which is a separate fact from access.
    const decision = evaluateAccess(SEC_TERMS, "automatic");
    expect(decision.allowed).toBe(true);
    expect(decision.status).toBe("connected");
  });

  it("allows an open-licence source automatically", () => {
    const decision = evaluateAccess(DATAGOVIN_TERMS, "automatic");
    expect(decision.allowed).toBe(true);
    expect(decision.status).toBe("connected");
  });

  it("marks a prohibited source unsupported in every mode", () => {
    const prohibited = { ...NSE_TERMS, accessBasis: "prohibited" as const };
    expect(evaluateAccess(prohibited, "automatic").status).toBe("unsupported");
    expect(evaluateAccess(prohibited, "user_initiated").status).toBe("unsupported");
  });

  it("refuses off-domain, plain-http, loopback and private destinations", () => {
    expect(isApprovedUrl(NSE_TERMS, "https://nsearchives.nseindia.com/content/RSS/Online_announcements.xml").allowed).toBe(true);
    expect(isApprovedUrl(NSE_TERMS, "https://evil.example.com/x.xml").allowed).toBe(false);
    expect(isApprovedUrl(NSE_TERMS, "http://nsearchives.nseindia.com/x.xml").allowed).toBe(false);
    expect(isApprovedUrl(NSE_TERMS, "https://127.0.0.1/x.xml").allowed).toBe(false);
    expect(isApprovedUrl(NSE_TERMS, "https://192.168.1.5/x.xml").allowed).toBe(false);
    expect(isApprovedUrl(NSE_TERMS, "https://169.254.169.254/latest/meta-data").allowed).toBe(false);
  });
});

describe("dedup cache", () => {
  const filing = {
    externalId: "PRIOR_INTIMATION_1",
    contentSha256: "abc",
    url: "https://nsearchives.nseindia.com/corporate/xbrl/a.xml",
    title: "Acme Ltd",
  };

  it("prefers the source-scoped external id over the hash and the url", () => {
    expect(dedupKey(filing, "nse")).toBe("nse::id::PRIOR_INTIMATION_1");
  });

  it("falls back to the content hash when there is no external id", () => {
    expect(dedupKey({ ...filing, externalId: null }, "nse")).toBe("nse::sha::abc");
  });

  it("falls back to the url when there is neither", () => {
    expect(dedupKey({ ...filing, externalId: null, contentSha256: null }, "nse")).toBe(`nse::url::${filing.url}`);
  });

  it("never keys on the title, because titles collide", () => {
    const a = dedupKey({ externalId: null, contentSha256: null, url: "https://x/1" }, "nse");
    const b = dedupKey({ externalId: null, contentSha256: null, url: "https://x/2" }, "nse");
    expect(a).not.toBe(b);
  });

  it("adds new filings and keeps firstSeen on a repeat", () => {
    const first = mergeFetched([], "nse", [{ ...filing, publishedAt: "2026-10-12T10:00:00.000Z", category: "c", symbol: null, companyName: "Acme", summary: "", byteCount: null }], now);
    expect(first.added).toHaveLength(1);
    expect(first.unchanged).toBe(false);

    const later = new Date("2026-10-12T13:00:00.000Z");
    const second = mergeFetched(first.cache, "nse", [{ ...filing, publishedAt: "2026-10-12T10:00:00.000Z", category: "c", symbol: null, companyName: "Acme", summary: "", byteCount: null }], later);
    expect(second.added).toHaveLength(0);
    expect(second.existing).toHaveLength(1);
    expect(second.unchanged).toBe(true);
    expect(second.cache[0].firstSeenUtc).toBe("2026-10-12T12:00:00.000Z");
    expect(second.cache[0].lastSeenUtc).toBe("2026-10-12T13:00:00.000Z");
  });

  it("filters by company and summarises the cache", () => {
    const cache: CachedFiling[] = [
      { key: "a", sourceId: "nse", externalId: "1", title: "Acme", url: "u", publishedAt: "2026-10-12T10:00:00.000Z", category: "c", companyName: "Acme Ltd", contentSha256: null, firstSeenUtc: "x", lastSeenUtc: "x" },
      { key: "b", sourceId: "nse", externalId: "2", title: "Beta", url: "u2", publishedAt: "2026-10-11T10:00:00.000Z", category: "c", companyName: "Beta Corp", contentSha256: null, firstSeenUtc: "x", lastSeenUtc: "x" },
    ];
    expect(cachedForCompany(cache, "acme")).toHaveLength(1);
    expect(cacheSummary(cache)).toEqual({ total: 2, sources: 1, newest: "2026-10-12T10:00:00.000Z" });
  });
});

describe("RSS parsing and external ids", () => {
  const xml = `<rss><channel><item><title>Acme Ltd</title><link>https://nsearchives.nseindia.com/corporate/xbrl/PRIOR_INTIMATION_9_WebXMLFile_1.xml</link><pubDate>Mon, 12 Oct 2026 20:03:24 +0530</pubDate><description>Board meeting</description></item><item><title>Beta</title><link>https://x/y</link></item></channel></rss>`;

  it("parses items and decodes entities", () => {
    const items = parseRssItems(xml);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("Acme Ltd");
    expect(items[0].description).toBe("Board meeting");
  });

  it("derives a stable external id from the filing link", () => {
    expect(externalIdFromLink("https://nsearchives.nseindia.com/corporate/xbrl/PRIOR_INTIMATION_9_WebXMLFile_1.xml")).toBe("PRIOR_INTIMATION_9_WebXMLFile_1");
    expect(externalIdFromLink("not a url")).toBeNull();
  });
});

describe("refresh orchestration", () => {
  function stub(
    sourceId: string,
    terms = NSE_TERMS,
    result?: ConnectorResult,
    verified = false,
    status: ConnectorResult["status"] = "ok",
  ): Connector {
    return {
      terms: { ...terms, sourceId },
      verifiedEndToEnd: verified,
      async fetchFilings() {
        return result ?? { sourceId, status, filings: [], message: "stub" };
      },
      async health() {
        return { lastSuccessfulCheckUtc: null, lastError: null };
      },
    };
  }

  const filing = { externalId: "E1", title: "Acme", url: "https://nsearchives.nseindia.com/x", publishedAt: "2026-10-12T10:00:00.000Z", category: "c", symbol: null, companyName: "Acme", summary: "", contentSha256: null, byteCount: null };

  it("never calls a connector whose terms block the mode", async () => {
    let called = false;
    const connector: Connector = {
      terms: NSE_TERMS,
      verifiedEndToEnd: false,
      async fetchFilings() {
        called = true;
        return { sourceId: "nse", status: "ok", filings: [], message: "should not run" };
      },
      async health() {
        return { lastSuccessfulCheckUtc: null, lastError: null };
      },
    };
    const result = await refreshFilings({ cache: [], mode: "automatic", connectors: [connector], now });
    expect(called).toBe(false);
    expect(result.outcomes[0].status).toBe("blocked");
    expect(result.outcomes[0].allowed).toBe(false);
  });

  it("reads an allowed source and caches its filings", async () => {
    const result = await refreshFilings({
      cache: [],
      mode: "user_initiated",
      connectors: [stub("nse", NSE_TERMS, { sourceId: "nse", status: "ok", filings: [filing], message: "ok" }, true)],
      now,
    });
    expect(result.totalAdded).toBe(1);
    expect(result.outcomes[0].status).toBe("connected");
    expect(result.outcomes[0].verifiedEndToEnd).toBe(true);
  });

  it("reports a not-implemented adapter as planned, not as working", async () => {
    const result = await refreshFilings({ cache: [], mode: "user_initiated", connectors: [stub("sebi", BSE_TERMS, undefined, false, "not_implemented")], now });
    expect(result.outcomes[0].status).toBe("planned");
  });

  it("maps an empty result to stale and an error to degraded", async () => {
    const empty = await refreshFilings({ cache: [], mode: "user_initiated", connectors: [stub("n", NSE_TERMS, { sourceId: "n", status: "empty", filings: [], message: "none" })], now });
    expect(empty.outcomes[0].status).toBe("stale");
    const error = await refreshFilings({ cache: [], mode: "user_initiated", connectors: [stub("n", NSE_TERMS, { sourceId: "n", status: "error", filings: [], message: "HTTP 500" })], now });
    expect(error.outcomes[0].status).toBe("degraded");
    expect(error.outcomes[0].lastError).toBe("HTTP 500");
  });

  it("does not re-add a filing on a repeat refresh", async () => {
    const connector = stub("nse", NSE_TERMS, { sourceId: "nse", status: "ok", filings: [filing], message: "ok" });
    const first = await refreshFilings({ cache: [], mode: "user_initiated", connectors: [connector], now });
    const second = await refreshFilings({ cache: first.cache, mode: "user_initiated", connectors: [connector], now });
    expect(first.totalAdded).toBe(1);
    expect(second.totalAdded).toBe(0);
  });

  it("labels the four required source states", () => {
    expect(describeStatus("connected")).toBe("Connected");
    expect(describeStatus("stale")).toBe("Stale");
    expect(describeStatus("blocked")).toBe("Blocked");
    expect(describeStatus("unsupported")).toBe("Unsupported");
  });
});

describe("Indian company search", () => {
  it("loads the pinned Nifty-500 universe", () => {
    expect(COMPANY_UNIVERSE_SIZE).toBeGreaterThan(400);
  });

  it("ranks an exact symbol match first", () => {
    const hits = searchIndianCompanies("RELIANCE", 3);
    expect(hits[0].symbol).toBe("RELIANCE");
    expect(hits[0].matchKind).toBe("exact_symbol");
  });

  it("finds companies by name and symbol prefix", () => {
    const hits = searchIndianCompanies("tata", 6);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((hit) => /tat/i.test(hit.symbol) || /tat/i.test(hit.name))).toBe(true);
  });

  it("returns nothing for an empty or unmatched query rather than guessing", () => {
    expect(searchIndianCompanies("")).toEqual([]);
    expect(searchIndianCompanies("zzzzzznotacompany")).toEqual([]);
    expect(resolveIndianCompany("zzzzzznotacompany")).toBeNull();
  });

  it("carries an ISIN so a match can be checked against an official identifier", () => {
    const hit = resolveIndianCompany("INFY");
    expect(hit).not.toBeNull();
    expect(hit!.isin).toMatch(/^INE/);
  });

  it("summarises industries in the universe", () => {
    const industries = industriesInUniverse(5);
    expect(industries.length).toBe(5);
    expect(industries[0].count).toBeGreaterThanOrEqual(industries[4].count);
  });
});
