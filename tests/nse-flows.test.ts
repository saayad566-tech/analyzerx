import { afterEach, describe, expect, it, vi } from "vitest";

import { businessDayDistance, classifyNseFreshness, fetchNseInstitutionalFlows, parseNseCsv, parseNseHistory, parseNseJson } from "../server/nse-flows";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.NSE_FII_DII_REPORT_URL;
  delete process.env.NSE_FII_DII_DIRECT_DATA_URL;
  delete process.env.NSE_FII_DII_API_URL;
});

describe("NSE institutional flows", () => {
  it("normalizes JSON FII/FPI and DII values", () => {
    const result = parseNseJson({ date: "2026-08-14", fii_buy: "12,115.05", fii_sell: "11,589.40", dii_buy: 12368.44, dii_sell: 12172.3 });
    expect(result.reportDate).toBe("2026-08-14");
    expect(result.rows[0].net).toBe(525.65);
    expect(result.rows[1].net).toBe(196.14);
  });

  it("normalizes compact free-provider history records", () => {
    const result = parseNseJson([{ d: "2026-08-17", fb: 11546.16, fs: 14081.26, fn: -2535.1, db: 16654.08, ds: 11552.62, dn: 5101.46 }]);
    expect(result.reportDate).toBe("2026-08-17");
    expect(result.rows.find((row) => row.participant === "FII/FPI")?.net).toBe(-2535.1);
    expect(result.rows.find((row) => row.participant === "DII")?.net).toBe(5101.46);
  });

  it("parses a full historical array instead of collapsing it to the first record", () => {
    const result = parseNseHistory([
      { date: "2026-08-17", fii_net: 100, dii_net: 50 },
      { date: "2026-08-14", fii_net: -40, dii_net: 20 },
      { date: "2026-08-13", fii_net: 10, dii_net: -5 },
    ]);
    expect(result).toHaveLength(3);
    expect(result[0].reportDate).toBe("2026-08-17");
    expect(result[2].rows[0].net).toBe(10);
  });

  it("aggregates the requested three-day range and computes a comparable-period change", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([
      { date: "2026-08-17", fii_net: 100, dii_net: 50 },
      { date: "2026-08-14", fii_net: -40, dii_net: 20 },
      { date: "2026-08-13", fii_net: 10, dii_net: -5 },
      { date: "2026-08-12", fii_net: 20, dii_net: 10 },
      { date: "2026-08-11", fii_net: 30, dii_net: 10 },
      { date: "2026-08-10", fii_net: 10, dii_net: 0 },
    ]), { status: 200, headers: { "content-type": "application/json" } })));
    const result = await fetchNseInstitutionalFlows({ range: "THREE_DAYS", now: new Date("2026-08-17T12:00:00.000Z") });
    expect(result.range).toBe("THREE_DAYS");
    expect(result.rows.find((row) => row.participant === "FII/FPI")?.net).toBe(70);
    expect(result.rows.find((row) => row.participant === "DII")?.net).toBe(65);
    expect(result.comparison.find((row) => row.participant === "FII/FPI")?.previousNet).toBe(60);
    expect(result.comparison.find((row) => row.participant === "FII/FPI")?.changePct).toBeCloseTo(16.67, 2);
  });

  it("parses CSV participant rows", () => {
    const csv = "Date,Participant,Buy Value,Sell Value,Net Value\n14-Aug-2026,FII/FPI,12115.05,11589.40,525.65\n14-Aug-2026,DII,12368.44,12172.30,196.14";
    const result = parseNseCsv(csv);
    expect(result.reportDate).toBe("2026-08-14");
    expect(result.rows.map((row) => row.net)).toEqual([525.65, 196.14]);
  });

  it("falls back to the intermediary when the configured official NSE URL is blocked", async () => {
    process.env.NSE_FII_DII_DIRECT_DATA_URL = "https://nse.example.com/fii-dii.csv";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("Access Denied", { status: 403 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ date: "17-Aug-2026", fii_buy: 11546.16, fii_sell: 14081.26, fii_net: -2535.1, dii_buy: 16654.08, dii_sell: 11552.62, dii_net: 5101.46 }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchNseInstitutionalFlows({ now: new Date("2026-08-17T12:00:00.000Z") });

    expect(result.status).toBe("fresh");
    expect(result.upstream).toBe("NSE via intermediary");
    expect(result.source).toBe("https://fii-diidata.mrchartist.com/api/data");
    expect(result.rows.find((row) => row.participant === "FII/FPI")?.net).toBe(-2535.1);
    expect(result.rows.find((row) => row.participant === "DII")?.net).toBe(5101.46);
    expect(result.error).toMatch(/intermediary fallback/i);
  });

  it("tries the free history endpoint after the latest free endpoint times out", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("latest endpoint timeout"))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ d: "2026-08-17", fb: 11546.16, fs: 14081.26, fn: -2535.1, db: 16654.08, ds: 11552.62, dn: 5101.46 }]), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchNseInstitutionalFlows({ now: new Date("2026-08-17T12:00:00.000Z"), timeoutMs: 100 });
    expect(result.status).toBe("fresh");
    expect(result.source).toBe("https://fii-diidata.mrchartist.com/api/history");
    expect(result.rows[0].net).toBe(-2535.1);
  });

  it("counts weekdays for report freshness", () => {
    expect(businessDayDistance("2026-08-14", new Date("2026-08-17T12:00:00Z"))).toBe(1);
    expect(classifyNseFreshness("2026-08-14", new Date("2026-08-17T12:00:00Z")).status).toBe("fresh");
    expect(classifyNseFreshness("2026-08-13", new Date("2026-08-17T12:00:00Z")).status).toBe("stale");
    expect(classifyNseFreshness(null).status).toBe("unavailable");
  });
});
