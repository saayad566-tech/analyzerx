import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchDerivativesSnapshot, getDerivativesSourceCatalog } from "../server/derivatives";

describe("derivatives adapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.DHAN_ACCESS_TOKEN;
    delete process.env.DHAN_CLIENT_ID;
    delete process.env.DHAN_API_BASE_URL;
    delete process.env.ANGELONE_API_KEY;
    delete process.env.ANGELONE_CLIENT_ID;
    delete process.env.ANGELONE_ACCESS_TOKEN;
    delete process.env.ANGELONE_JWT_TOKEN;
    delete process.env.ANGELONE_CLIENT_LOCAL_IP;
    delete process.env.ANGELONE_CLIENT_PUBLIC_IP;
    delete process.env.ANGELONE_CLIENT_MAC_ADDRESS;
    delete process.env.ANGELONE_OPTION_GREEK_PAYLOAD_JSON;
  });

  it("does not fabricate a chain for an unmapped symbol", async () => {
    const result = await fetchDerivativesSnapshot("AAPL", "IN");
    expect(result.status).toBe("unavailable");
    expect(result.contracts).toEqual([]);
    expect(result.error).toMatch(/mapping/i);
  });

  it("returns an explicit auth-required state when Dhan credentials are absent", async () => {
    const result = await fetchDerivativesSnapshot("ADANIENT", "IN");
    expect(result.status).toBe("auth_required");
    expect(result.contracts).toEqual([]);
    expect(result.nextStep).toMatch(/Dhan/i);
  });

  it("normalizes expiry, OI, PCR, max pain, IV and Greeks from the documented Dhan shape", async () => {
    process.env.DHAN_ACCESS_TOKEN = "test-token";
    process.env.DHAN_CLIENT_ID = "1000000001";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: ["2026-08-27"] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { last_price: 2500, oc: {
        "2500": { ce: { last_price: 50, oi: 100, previous_oi: 80, volume: 10, implied_volatility: 20, security_id: 1, greeks: { delta: 0.5, gamma: 0.01, theta: -1, vega: 2 } }, pe: { last_price: 45, oi: 150, previous_oi: 100, volume: 12, implied_volatility: 21, security_id: 2, greeks: { delta: -0.5, gamma: 0.01, theta: -1, vega: 2 } } },
      } } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchDerivativesSnapshot("ADANIENT", "IN");
    expect(result.status).toBe("fresh");
    expect(result.expiry).toBe("2026-08-27");
    expect(result.contracts).toHaveLength(2);
    expect(result.pcr).toBe(1.5);
    expect(result.maxPain).toBe(2500);
    expect(result.contracts[0].changeInOpenInterest).toBe(20);
    expect(result.contracts[0].delta).toBe(0.5);
  });

  it("routes authenticated requests through an explicitly configured sandbox base URL", async () => {
    process.env.DHAN_ACCESS_TOKEN = "test-token";
    process.env.DHAN_CLIENT_ID = "1000000001";
    process.env.DHAN_API_BASE_URL = "https://sandbox.dhan.co/v2/";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: ["2026-08-27"] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { last_price: 2500, oc: { "2500": { ce: { oi: 1, last_price: 2 }, pe: { oi: 1, last_price: 2 } } } } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchDerivativesSnapshot("ADANIENT", "IN");
    expect(result.status).toBe("fresh");
    expect(result.source).toMatch(/Sandbox/);
    expect(fetchMock.mock.calls[0][0]).toBe("https://sandbox.dhan.co/v2/optionchain/expirylist");
    expect(fetchMock.mock.calls[1][0]).toBe("https://sandbox.dhan.co/v2/optionchain");
  });

  it("falls back to the free NSE public reference after Dhan authorization fails", async () => {
    process.env.DHAN_ACCESS_TOKEN = "test-token";
    process.env.DHAN_CLIENT_ID = "1000000001";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ errorCode: "DH-901", remarks: "Unauthorized" }), { status: 401 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200, headers: { "set-cookie": "nsit=abc; Path=/" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ records: { data: [
        { strikePrice: 2500, expiryDate: "27-Aug-2026", underlyingValue: 2500, CE: { lastPrice: 50, openInterest: 100, changeinOpenInterest: 20, impliedVolatility: 18, totalTradedVolume: 10 }, PE: { lastPrice: 45, openInterest: 150, changeinOpenInterest: 30, impliedVolatility: 20, totalTradedVolume: 12 } },
      ] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchDerivativesSnapshot("ADANIENT", "IN");
    expect(result.status).toBe("fresh");
    expect(result.source).toMatch(/NSE public/);
    expect(result.contracts).toHaveLength(2);
    expect(result.pcr).toBe(1.5);
    expect(fetchMock.mock.calls[1][0]).toBe("https://www.nseindia.com/option-chain");
  });

  it("falls back from Dhan to Angel One SmartAPI when authenticated credentials are configured", async () => {
    process.env.DHAN_ACCESS_TOKEN = "dhan-token";
    process.env.DHAN_CLIENT_ID = "1000000001";
    process.env.ANGELONE_API_KEY = "angel-api-key";
    process.env.ANGELONE_CLIENT_ID = "A123456";
    process.env.ANGELONE_ACCESS_TOKEN = "angel-jwt";
    process.env.ANGELONE_CLIENT_LOCAL_IP = "127.0.0.1";
    process.env.ANGELONE_CLIENT_PUBLIC_IP = "203.0.113.10";
    process.env.ANGELONE_CLIENT_MAC_ADDRESS = "00:11:22:33:44:55";
    process.env.ANGELONE_OPTION_GREEK_PAYLOAD_JSON = JSON.stringify({ name: "ADANIENT", expirydate: "2026-08-27" });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ errorCode: "DH-901", remarks: "Unauthorized" }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: true, data: [
        { strike: 2500, optionType: "CE", expiry: "2026-08-27", symboltoken: "1", ltp: 50, oi: 100, volume: 10, iv: 18, greeks: { delta: 0.5, gamma: 0.01, theta: -1, vega: 2 } },
        { strike: 2500, optionType: "PE", expiry: "2026-08-27", symboltoken: "2", ltp: 45, oi: 150, volume: 12, iv: 20, greeks: { delta: -0.5, gamma: 0.01, theta: -1, vega: 2 } },
      ] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchDerivativesSnapshot("ADANIENT", "IN");
    expect(result.status).toBe("fresh");
    expect(result.source).toMatch(/Angel One/);
    expect(result.contracts).toHaveLength(2);
    expect(result.pcr).toBe(1.5);
    expect(fetchMock.mock.calls[1][0]).toBe("https://apiconnect.angelone.in/rest/secure/angelbroking/marketData/v1/optionGreek");
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({ "X-PrivateKey": "angel-api-key", Authorization: "Bearer angel-jwt" });
  });

  it("documents primary, optional fallback, and reference sources without pretending NSE HTML is a live API", () => {
    const catalog = getDerivativesSourceCatalog();
    expect(catalog.primary.mode).toMatch(/authenticated/i);
    expect(catalog.reference.mode).toMatch(/delayed|manual/i);
    expect(catalog.fallback.name).toMatch(/Angel One/);
    expect(catalog.fields).toContain("open interest");
  });
});
