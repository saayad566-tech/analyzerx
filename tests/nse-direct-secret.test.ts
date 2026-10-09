import { describe, expect, it } from "vitest";

import { parseNseCsv, parseNseJson } from "../server/nse-flows";

describe("direct NSE FII/DII report configuration", () => {
  const endpoint = process.env.NSE_FII_DII_REPORT_URL;
  const integrationTest = endpoint?.startsWith("https://") ? it : it.skip;

  integrationTest("loads an authorized endpoint and returns a parseable report", async () => {
    if (!endpoint) return;
    const response = await fetch(endpoint, { headers: { Accept: "text/csv,application/json" }, signal: AbortSignal.timeout(12_000) });
    expect(response.ok).toBe(true);
    const body = await response.text();
    const contentType = response.headers.get("content-type") ?? "";
    const parsed = contentType.includes("csv") || body.trimStart().startsWith("Date,") ? parseNseCsv(body) : parseNseJson(JSON.parse(body));
    expect(parsed.reportDate).toBeTruthy();
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows.some((row) => row.net !== null || row.buy !== null || row.sell !== null)).toBe(true);
  }, 20_000);
});
