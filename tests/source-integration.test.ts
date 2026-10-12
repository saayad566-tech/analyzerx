import { describe, expect, it, vi } from "vitest";

import {
  backoffDelay,
  buildCatalog,
  buildCatalogWithReasons,
  canTransition,
  catalogSummary,
  CircuitBreaker,
  deriveState,
  fetchSecFilings,
  filingDocumentUrl,
  findTickerEntry,
  isAllowedHost,
  nextStates,
  normalizeCik,
  parseCompanyFacts,
  parseCompanyTickers,
  parseRetryAfter,
  parseSubmissions,
  RateLimiter,
  resolveHost,
  safeFetch,
  SEC_POLICY,
  accessClassLabel,
  sourceStateLabel,
} from "../lib/filing-intelligence";

/** Build a minimal Response-shaped object for the mocked fetch. */
function mockResponse(init: { status?: number; headers?: Record<string, string>; body?: string }): Response {
  const headers = new Map(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  const status = init.status ?? 200;
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
    text: async () => init.body ?? "",
  } as unknown as Response;
}

const noSleep = async () => {};
const fixedJitter = () => 0.5;

describe("Phase 5: URL and host safety", () => {
  it("parses only https hosts", () => {
    expect(resolveHost("https://data.sec.gov/x.json")).toBe("data.sec.gov");
    expect(resolveHost("http://data.sec.gov/x.json")).toBeNull();
    expect(resolveHost("not a url")).toBeNull();
  });

  it("allows an approved host and its subdomains, and nothing else", () => {
    expect(isAllowedHost("https://data.sec.gov/x", ["sec.gov"]).allowed).toBe(true);
    expect(isAllowedHost("https://www.sec.gov/x", ["sec.gov"]).allowed).toBe(true);
    expect(isAllowedHost("https://evil.example.com/x", ["sec.gov"]).allowed).toBe(false);
  });

  it("refuses loopback, private and link-local destinations", () => {
    for (const url of ["https://127.0.0.1/x", "https://192.168.1.1/x", "https://169.254.169.254/latest/meta-data", "https://10.0.0.5/x"]) {
      expect(isAllowedHost(url, ["sec.gov", "127.0.0.1", "192.168.1.1", "169.254.169.254", "10.0.0.5"]).allowed).toBe(false);
    }
  });
});

describe("Phase 5: safeFetch", () => {
  const policy = { ...SEC_POLICY, maxRetries: 1 };

  it("returns the body on success", async () => {
    const outcome = await safeFetch("https://data.sec.gov/x.json", policy, {
      fetchImpl: async () => mockResponse({ headers: { "content-type": "application/json" }, body: '{"a":1}' }),
      sleep: noSleep,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.text).toBe('{"a":1}');
  });

  it("treats 401 and 403 as a refusal, not a transient failure", async () => {
    const outcome = await safeFetch("https://data.sec.gov/x.json", policy, {
      fetchImpl: async () => mockResponse({ status: 403, headers: { "content-type": "text/plain" }, body: "no" }),
      sleep: noSleep,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.kind).toBe("blocked");
      expect(outcome.attempts).toBe(1); // a refusal is not retried
    }
  });

  it("honours Retry-After on a 429 and then succeeds", async () => {
    let call = 0;
    const outcome = await safeFetch("https://data.sec.gov/x.json", policy, {
      fetchImpl: async () => {
        call += 1;
        if (call === 1) return mockResponse({ status: 429, headers: { "retry-after": "2" } });
        return mockResponse({ headers: { "content-type": "application/json" }, body: "{}" });
      },
      sleep: noSleep,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.attempts).toBe(2);
  });

  it("retries a 5xx then gives up", async () => {
    let call = 0;
    const outcome = await safeFetch("https://data.sec.gov/x.json", policy, {
      fetchImpl: async () => {
        call += 1;
        return mockResponse({ status: 503, headers: { "content-type": "text/plain" }, body: "down" });
      },
      sleep: noSleep,
    });
    expect(outcome.ok).toBe(false);
    expect(call).toBe(2); // maxRetries 1 => 2 attempts
    if (!outcome.ok) expect(outcome.kind).toBe("http");
  });

  it("rejects an unexpected content type", async () => {
    const outcome = await safeFetch("https://data.sec.gov/x.json", policy, {
      fetchImpl: async () => mockResponse({ headers: { "content-type": "text/html" }, body: "<html>" }),
      sleep: noSleep,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.kind).toBe("content_type");
  });

  it("rejects a declared body over the size ceiling", async () => {
    const outcome = await safeFetch("https://data.sec.gov/x.json", { ...policy, maxBytes: 10 }, {
      fetchImpl: async () => mockResponse({ headers: { "content-type": "application/json", "content-length": "5000" }, body: "x" }),
      sleep: noSleep,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.kind).toBe("size");
  });

  it("refuses a redirect that leaves the approved domain", async () => {
    const outcome = await safeFetch("https://data.sec.gov/x.json", policy, {
      fetchImpl: async () => mockResponse({ status: 302, headers: { location: "https://evil.example.com/x" } }),
      sleep: noSleep,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.kind).toBe("redirect");
  });

  it("follows an in-domain redirect", async () => {
    let call = 0;
    const outcome = await safeFetch("https://data.sec.gov/x.json", policy, {
      fetchImpl: async () => {
        call += 1;
        if (call === 1) return mockResponse({ status: 302, headers: { location: "https://www.sec.gov/y.json" } });
        return mockResponse({ headers: { "content-type": "application/json" }, body: "{}" });
      },
      sleep: noSleep,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.url).toBe("https://www.sec.gov/y.json");
  });

  it("refuses before fetching when the host is not approved", async () => {
    const impl = vi.fn();
    const outcome = await safeFetch("https://evil.example.com/x", policy, { fetchImpl: impl as unknown as typeof fetch, sleep: noSleep });
    expect(outcome.ok).toBe(false);
    expect(impl).not.toHaveBeenCalled();
    if (!outcome.ok) expect(outcome.kind).toBe("blocked");
  });
});

describe("Phase 5: rate limiting, backoff and circuit breaking", () => {
  it("computes a deterministic backoff with an injected jitter", () => {
    expect(backoffDelay(0, { jitter: fixedJitter, baseMs: 400 })).toBe(300);
    expect(backoffDelay(1, { jitter: fixedJitter, baseMs: 400 })).toBe(600);
    expect(backoffDelay(2, { jitter: fixedJitter, baseMs: 400 })).toBe(1200);
  });

  it("prefers Retry-After over the exponential delay", () => {
    expect(backoffDelay(0, { jitter: fixedJitter, retryAfterMs: 5000 })).toBe(5000);
  });

  it("parses both Retry-After forms", () => {
    expect(parseRetryAfter("3")).toBe(3000);
    expect(parseRetryAfter(null)).toBeNull();
    const soon = new Date(Date.now() + 2000).toUTCString();
    const parsed = parseRetryAfter(soon);
    expect(parsed).not.toBeNull();
    expect(parsed!).toBeGreaterThan(0);
  });

  it("enforces the per-window request limit", () => {
    const limiter = new RateLimiter({ requestsPerWindow: 2, windowSeconds: 10, minDelayMs: null, honoursRetryAfter: true });
    const t = 1_000_000;
    limiter.record(t);
    limiter.record(t);
    expect(limiter.delayUntilAllowed(t)).toBeGreaterThan(0);
    expect(limiter.remaining(t)).toBe(0);
    // After the window passes, requests are allowed again.
    expect(limiter.delayUntilAllowed(t + 10_001)).toBe(0);
  });

  it("enforces a minimum delay between requests", () => {
    const limiter = new RateLimiter({ requestsPerWindow: null, windowSeconds: null, minDelayMs: 1000, honoursRetryAfter: false });
    limiter.record(5000);
    expect(limiter.delayUntilAllowed(5000)).toBe(1000);
    expect(limiter.delayUntilAllowed(5500)).toBe(500);
    expect(limiter.delayUntilAllowed(6000)).toBe(0);
  });

  it("opens the circuit after repeated failures and recovers after the cooldown", () => {
    const breaker = new CircuitBreaker(3, 1000);
    breaker.recordFailure(0);
    breaker.recordFailure(10);
    expect(breaker.isOpen(20)).toBe(false);
    breaker.recordFailure(20);
    expect(breaker.isOpen(30)).toBe(true);
    expect(breaker.isOpen(1100)).toBe(false); // half-open after the cooldown
    breaker.recordSuccess();
    expect(breaker.failureCount).toBe(0);
  });

  it("refuses to fetch while the circuit is open", async () => {
    const breaker = new CircuitBreaker(1, 60_000);
    breaker.recordFailure(0);
    const impl = vi.fn();
    const outcome = await safeFetch("https://data.sec.gov/x.json", SEC_POLICY, {
      fetchImpl: impl as unknown as typeof fetch,
      sleep: noSleep,
      breaker,
      now: () => 0,
    });
    expect(impl).not.toHaveBeenCalled();
    if (!outcome.ok) expect(outcome.kind).toBe("circuit_open");
  });
});

describe("Phase 6: SEC EDGAR parsers", () => {
  it("normalizes a CIK to ten digits and rejects an empty value", () => {
    expect(normalizeCik("320193")).toBe("0000320193");
    expect(normalizeCik(320193)).toBe("0000320193");
    expect(normalizeCik("CIK0000320193")).toBe("0000320193");
    expect(normalizeCik("abc")).toBeNull();
  });

  it("parses the company tickers file", () => {
    const json = { "0": { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." }, "1": { cik_str: 789019, ticker: "MSFT", title: "Microsoft Corp" } };
    const entries = parseCompanyTickers(json);
    expect(entries).toHaveLength(2);
    expect(findTickerEntry(entries, "aapl")?.cik).toBe("0000320193");
    expect(findTickerEntry(entries, "NOPE")).toBeNull();
  });

  it("transposes the column-wise submissions block", () => {
    const json = {
      filings: {
        recent: {
          accessionNumber: ["0000320193-24-000123", "0000320193-24-000100"],
          form: ["10-K", "8-K"],
          filingDate: ["2024-11-01", "2024-10-15"],
          reportDate: ["2024-09-28", ""],
          primaryDocument: ["aapl-20240928.htm", "aapl-8k.htm"],
          primaryDocDescription: ["10-K", "8-K"],
        },
      },
    };
    const refs = parseSubmissions(json);
    expect(refs).toHaveLength(2);
    expect(refs[0].form).toBe("10-K");
    expect(refs[0].accessionNumber).toBe("0000320193-24-000123");
    expect(refs[1].primaryDocument).toBe("aapl-8k.htm");
  });

  it("skips a filing with no accession number rather than inventing one", () => {
    const json = { filings: { recent: { accessionNumber: ["", "0000320193-24-000100"], form: ["10-K", "8-K"] } } };
    expect(parseSubmissions(json)).toHaveLength(1);
  });

  it("builds the official document URL with an unpadded CIK", () => {
    const url = filingDocumentUrl("0000320193", { accessionNumber: "0000320193-24-000123", form: "10-K", filingDate: null, reportDate: null, primaryDocument: "aapl-20240928.htm", primaryDocDescription: null });
    expect(url).toBe("https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/aapl-20240928.htm");
  });

  it("parses XBRL company facts", () => {
    const json = { facts: { "us-gaap": { Revenues: { units: { USD: [{ end: "2024-09-28", val: 391035000000, form: "10-K" }] } } } } };
    const facts = parseCompanyFacts(json);
    expect(facts).toHaveLength(1);
    expect(facts[0].tag).toBe("Revenues");
    expect(facts[0].value).toBe(391035000000);
    expect(facts[0].end).toBe("2024-09-28");
  });
});

describe("Phase 6: SEC connector against mocked responses", () => {
  const tickers = JSON.stringify({ "0": { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." } });
  const submissions = JSON.stringify({
    filings: {
      recent: {
        accessionNumber: ["0000320193-24-000123"],
        form: ["10-K"],
        filingDate: ["2024-11-01"],
        reportDate: ["2024-09-28"],
        primaryDocument: ["aapl-20240928.htm"],
        primaryDocDescription: ["10-K"],
      },
    },
  });

  it("resolves a ticker and normalizes its filings", async () => {
    const result = await fetchSecFilings("AAPL", {
      fetchImpl: (async (url: string) =>
        String(url).includes("company_tickers")
          ? mockResponse({ headers: { "content-type": "application/json" }, body: tickers })
          : mockResponse({ headers: { "content-type": "application/json" }, body: submissions })) as unknown as typeof fetch,
      sleep: noSleep,
      jitter: fixedJitter,
    });
    expect("filings" in result).toBe(true);
    if ("filings" in result) {
      expect(result.cik).toBe("0000320193");
      expect(result.filings).toHaveLength(1);
      expect(result.filings[0].category).toBe("10-K");
      expect(result.filings[0].externalId).toBe("0000320193-24-000123");
      expect(result.filings[0].publishedAt).toBe("2024-11-01T00:00:00.000Z");
      expect(result.filings[0].url).toContain("/Archives/edgar/data/320193/");
    }
  });

  it("reports an honest error when the ticker cannot be resolved", async () => {
    const result = await fetchSecFilings("NOPE", {
      fetchImpl: (async () => mockResponse({ headers: { "content-type": "application/json" }, body: tickers })) as unknown as typeof fetch,
      sleep: noSleep,
    });
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toMatch(/could not resolve/i);
  });

  it("reports an honest error when the source is refused", async () => {
    const result = await fetchSecFilings("AAPL", {
      fetchImpl: (async () => mockResponse({ status: 403, headers: { "content-type": "text/plain" }, body: "denied" })) as unknown as typeof fetch,
      sleep: noSleep,
    });
    expect("error" in result).toBe(true);
  });
});

describe("Phase 2: source state machine", () => {
  it("permits the declared transitions and refuses the illegal ones", () => {
    expect(canTransition("planned", "available")).toBe(true);
    expect(canTransition("available", "connected")).toBe(true);
    expect(canTransition("connected", "stale")).toBe(true);
    // A source may not jump straight from planned to connected.
    expect(canTransition("planned", "connected")).toBe(false);
    expect(canTransition("unsupported", "connected")).toBe(false);
    expect(nextStates("planned")).toEqual(["available", "unsupported", "blocked"]);
  });

  const base = { accessClass: "A_official_api" as const, termsForbidAccess: false, blocker: null };

  it("never marks a source connected without valid end-to-end data", () => {
    const derived = deriveState({ ...base, hasAdapter: true, verifiedEndToEnd: false, health: { lastSuccessfulCheckUtc: new Date().toISOString(), lastRetrievalUtc: null, lastError: null, latestEndToEndEvidence: null } });
    expect(derived.state).toBe("available");
  });

  it("marks a verified source stale when the last check is old", () => {
    const old = new Date(Date.now() - 100 * 3_600_000).toISOString();
    const derived = deriveState({ ...base, hasAdapter: true, verifiedEndToEnd: true, health: { lastSuccessfulCheckUtc: old, lastRetrievalUtc: null, lastError: null, latestEndToEndEvidence: "x" } });
    expect(derived.state).toBe("stale");
  });

  it("marks a source with proven capability but no check time available, not connected", () => {
    const derived = deriveState({ ...base, hasAdapter: true, verifiedEndToEnd: true, health: { lastSuccessfulCheckUtc: null, lastRetrievalUtc: null, lastError: null, latestEndToEndEvidence: "x" } });
    // Capability is proven, but current health is not asserted, so it is
    // available rather than connected or stale.
    expect(derived.state).toBe("available");
    expect(derived.state).not.toBe("connected");
  });

  it("marks a recent successful check connected, and a recorded error degraded", () => {
    const recent = new Date(Date.now() - 3_600_000).toISOString();
    expect(deriveState({ ...base, hasAdapter: true, verifiedEndToEnd: true, health: { lastSuccessfulCheckUtc: recent, lastRetrievalUtc: null, lastError: null, latestEndToEndEvidence: "x" } }).state).toBe("connected");
    expect(deriveState({ ...base, hasAdapter: true, verifiedEndToEnd: true, health: { lastSuccessfulCheckUtc: recent, lastRetrievalUtc: null, lastError: "HTTP 500", latestEndToEndEvidence: "x" } }).state).toBe("degraded");
  });

  it("blocks a source whose terms forbid the access", () => {
    expect(deriveState({ ...base, termsForbidAccess: true, hasAdapter: true, verifiedEndToEnd: true, health: { lastSuccessfulCheckUtc: new Date().toISOString(), lastRetrievalUtc: null, lastError: null, latestEndToEndEvidence: "x" } }).state).toBe("blocked");
  });

  it("marks an unsupported access class unsupported", () => {
    expect(deriveState({ ...base, accessClass: "F_unsupported", hasAdapter: false, verifiedEndToEnd: false, health: { lastSuccessfulCheckUtc: null, lastRetrievalUtc: null, lastError: null, latestEndToEndEvidence: null } }).state).toBe("unsupported");
  });
});

describe("Phase 3: the catalog is honest about every source", () => {
  const catalog = buildCatalog();

  it("classifies each source A-F and labels it", () => {
    const sec = catalog.find((s) => s.sourceId === "sec_edgar_submissions")!;
    expect(sec.accessClass).toBe("A_official_api");
    expect(accessClassLabel(sec.accessClass)).toContain("Official API");
    const fca = catalog.find((s) => s.sourceId === "fca_nsm")!;
    expect(fca.accessClass).toBe("D_human_only");
  });

  it("does not present the US or UK sources as connected", () => {
    for (const id of ["sec_edgar_submissions", "sec_edgar_companyfacts", "companies_house", "fca_nsm", "mca_public_information"]) {
      const record = catalog.find((s) => s.sourceId === id)!;
      expect(record.state).not.toBe("connected");
    }
  });

  it("records the three Indian feeds and data.gov.in with real evidence", () => {
    for (const id of ["nse_corporate_announcements", "bse_corporate_announcements", "sebi_regulatory_filings", "datagovin_open_data"]) {
      const record = catalog.find((s) => s.sourceId === id)!;
      expect(record.health.latestEndToEndEvidence).toBeTruthy();
      expect(record.state).not.toBe("planned");
    }
  });

  it("states a blocker for every source that is not working", () => {
    for (const record of catalog) {
      if (record.state === "blocked" || record.state === "planned") {
        expect(record.blocker).toBeTruthy();
      }
    }
  });

  it("never asserts a successful check time it has not observed", () => {
    for (const record of catalog) {
      expect(record.health.lastSuccessfulCheckUtc).toBeNull();
    }
  });

  it("explains every derived state and summarises the catalog", () => {
    const withReasons = buildCatalogWithReasons();
    expect(withReasons.every((entry) => entry.reason.length > 10)).toBe(true);
    const summary = catalogSummary(catalog);
    expect(summary.reduce((sum, entry) => sum + entry.count, 0)).toBe(catalog.length);
  });

  it("labels the states in plain words", () => {
    expect(sourceStateLabel("blocked")).toBe("Blocked");
    expect(sourceStateLabel("available")).toBe("Available");
    expect(sourceStateLabel("stale")).toBe("Stale");
  });
});

/**
 * OPTIONAL INTEGRATION TEST — runs against the real public source.
 *
 * Labelled optional and skipped by default: it makes real network calls to
 * sec.gov, which the CI sandbox's egress proxy refuses. Run it deliberately
 * with SEC_INTEGRATION=1 in an environment that can reach SEC.
 */
const runIntegration = process.env.SEC_INTEGRATION === "1";
describe.skipIf(!runIntegration)("OPTIONAL INTEGRATION: real SEC EDGAR", () => {
  it("retrieves a genuine filing list for a known ticker", async () => {
    const result = await fetchSecFilings("AAPL", { limit: 5 });
    expect("filings" in result).toBe(true);
    if ("filings" in result) {
      expect(result.cik).toBe("0000320193");
      expect(result.filings.length).toBeGreaterThan(0);
      expect(result.filings[0].url).toContain("sec.gov/Archives");
    }
  }, 60_000);
});
