# GME (Global Market Engine) — evaluation and adoption record

The user supplied `files.zip`, containing a Python project (`gme_global_market_engine.zip`)
and a 199-row country dataset. This records what was researched, what was adopted, and
what was **deliberately rejected** and why.

## 1. What GME is

A server-side Python data-collection engine:

```
data/countries.csv (199 rows)
  -> registry.build_sources()   (country x exchange x topic x sector x intent x engine)
  -> Engine (sharded)
  -> http.Fetcher (per-domain rate limit, UA + proxy rotation, backoff, robots.txt, circuit breaker)
  -> parsers (rss | gdelt | worldbank | yahoo | edgar) -> pydantic validation -> nlp
  -> Parquet lake sharded by country/category  (+ DuckDB view `world`)
```

Its README is unusually honest: it states that "real-time quotes and order books are
licensed data", that free endpoints give delayed prices only, and that local exchange
portals need per-site adapters.

## 2. What was adopted

**The country / exchange / MIC reference dataset.** `lib/market-registry.ts` now
carries all **199 countries** with ISO2, name, region, exchange names and ISO 10383
MIC codes, transcribed from the supplied CSV — 97 countries carry MICs, 160 carry
exchange names. Verified in tests against the dataset (e.g. `XASX` → `AU`).

**The index-symbol list** for the ten markets AnalyzerX actually supports
(`^GSPC`, `^FTSE`, `^GDAXI`, `^N225`, `^NSEI`, `^HSI`, …), taken from GME's
`INDEX_SYMBOLS`.

**The known-vs-supported distinction.** This is the part that matters most. Earlier
audits found the app could not answer "which market does this exchange belong to?"
and could not honestly say whether a market was supported. The registry now separates:

- **known** — present in the reference dataset; and
- **supported** — has a market profile and adapters in AnalyzerX (the same ten).

`describeMarketCoverage()` returns `Not Implemented` with a reason for a known but
unsupported market (Brazil, for example), and never claims coverage for an unknown
identifier. Exposed through the `marketRegistry.search` and `marketRegistry.coverage`
procedures.

**A cross-check test** asserts the registry and the app's own market profiles agree, so
the app can never offer a market it has no adapter for.

## 3. What was deliberately rejected

**Proxy rotation and User-Agent rotation.** GME's fetcher rotates browser User-Agent
strings and routes through a proxy list. That exists to avoid per-IP and per-UA
detection — i.e. to evade rate limits and access controls. The project's mandates
forbid exactly this ("Never use unlicensed scraping, bypass paywalls/CAPTCHAs/
authentication, evade rate limits, or ignore provider terms"), so **none of it was
ported**. It is called out here rather than quietly dropped.

**Playwright-driven scraping of cookie/JS-gated portals.** It is server-side, needs
per-site terms review, and cannot run on-device.

**The Python code itself.** AnalyzerX is an Expo/React Native app whose data pipeline
is on-device TypeScript. GME is a Python server with a Parquet/DuckDB lake. The two
do not compose, so the *code* was not adopted — only the reference data and the
identity model, which is the part that transfers cleanly.

## 4. What is worth considering later

- **Query-expansion source registry.** GME reaches hundreds of sources per country by
  expanding (topic × sector × intent) into concrete feed queries. AnalyzerX's
  `lib/provider-chain.ts` (added earlier) is the consumer side of that idea; the
  expansion side is not built.
- **World Bank indicator list** (30 codes) for the macro layer.
- **Circuit breaker + DLQ patterns** — AnalyzerX has bounded retries but no DLQ.

## 5. Honest limits of this adoption

- The registry is **reference data**, not a data feed. It tells the app which
  exchange belongs to which market; it does not fetch anything.
- MIC coverage is partial: 97 of 199 countries have MICs in the supplied dataset.
  Where a MIC is absent, resolution returns null rather than guessing.
- The dataset was transcribed as supplied. It was not independently verified against
  the ISO 10383 register, and it should be re-validated before being treated as
  authoritative for anything regulatory.
- No UI was added; the registry is available through the API for a future market
  picker that can honestly show "known but not supported".
