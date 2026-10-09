import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { parseSecFacts, parseSecSubmissions, resolveSecTicker } from "../server/sec-edgar";

describe("SEC EDGAR collector contracts", () => {
  const originalUserAgent = process.env.SEC_EDGAR_USER_AGENT;
  beforeEach(() => { process.env.SEC_EDGAR_USER_AGENT = "AnalyzerX/1.0 contact@example.com"; });
  afterEach(() => { if (originalUserAgent === undefined) delete process.env.SEC_EDGAR_USER_AGENT; else process.env.SEC_EDGAR_USER_AGENT = originalUserAgent; });

  it("resolves exact tickers without fuzzy guessing", () => {
    const result = resolveSecTicker([{ cik_str: 320193, ticker: "AAPL", title: "Apple Inc." }], "AAPL");
    expect(result?.cik_str).toBe(320193);
    expect(resolveSecTicker([{ cik_str: 320193, ticker: "AAPL", title: "Apple Inc." }], "APP")).toBeNull();
  });

  it("parses recent SEC submissions into accession-backed URLs", () => {
    const result = parseSecSubmissions({ filings: { recent: { accessionNumber: ["0000320193-25-000001"], filingDate: ["2025-01-31"], reportDate: ["2024-12-31"], form: ["10-Q"], primaryDocument: ["aapl-20241228.htm"], primaryDocDescription: ["Quarterly report"] } } }, "0000320193");
    expect(result[0]).toMatchObject({ accessionNumber: "0000320193-25-000001", form: "10-Q", filingUrl: "https://www.sec.gov/Archives/edgar/data/320193/000032019325000001/aapl-20241228.htm" });
  });

  it("flattens XBRL facts while preserving taxonomy, unit, and period", () => {
    const result = parseSecFacts({ facts: { "us-gaap": { Revenue: { units: { USD: [{ val: 100, start: "2024-01-01", end: "2024-12-31", filed: "2025-01-31", form: "10-K" }] } } } } });
    expect(result[0]).toMatchObject({ taxonomy: "us-gaap", tag: "Revenue", unit: "USD", value: 100, start: "2024-01-01", end: "2024-12-31" });
  });
});
