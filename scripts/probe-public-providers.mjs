const checks = [
  { key: "world-bank-indicators", url: "https://api.worldbank.org/v2/country/IND/indicator/NY.GDP.MKTP.CD?format=json&per_page=1" },
  { key: "ecb-sdmx", url: "https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?format=jsondata&startPeriod=2026-01-01&endPeriod=2026-01-02" },
  { key: "gdelt-news", url: "https://api.gdeltproject.org/api/v2/doc/doc?query=India%20equities&mode=artlist&format=json&maxrecords=1&sort=HybridRel" },
  { key: "openfigi", url: "https://api.openfigi.com/v3/mapping", method: "POST", body: JSON.stringify([{ idType: "TICKER", idValue: "AAPL", exchCode: "US" }]), headers: { "Content-Type": "application/json" } },
];
const results = [];
for (const check of checks) {
  const started = Date.now();
  try {
    const response = await fetch(check.url, { method: check.method ?? "GET", body: check.body, headers: { Accept: "application/json", ...(check.headers ?? {}) }, signal: AbortSignal.timeout(12000) });
    const body = await response.text();
    let parsed = null;
    try { parsed = JSON.parse(body); } catch {}
    results.push({ key: check.key, status: response.status, ok: response.ok, latencyMs: Date.now() - started, contentType: response.headers.get("content-type"), schema: parsed === null ? "non-json" : Array.isArray(parsed) ? "array" : typeof parsed });
  } catch (error) {
    results.push({ key: check.key, status: null, ok: false, latencyMs: Date.now() - started, error: error instanceof Error ? error.message : String(error) });
  }
}
console.log(JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
