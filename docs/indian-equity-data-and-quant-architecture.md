# Indian Equity Data and Quantitative Analysis Architecture

**Author:** Manus AI  
**Prepared:** 17 August 2026  
**Scope:** Free and open-source components that can support Indian NSE/BSE quantitative screening and fundamental analysis, with explicit source, licensing, freshness, and low-resource limitations.

> **Executive conclusion:** Free public wrappers are useful for discovery, delayed quotes, secondary metadata, and resilience testing, but they are not equivalent to a licensed NSE/BSE real-time data entitlement. The production design should use official exchange and issuer filings as the accounting source of record, licensed or clearly permitted market data for prices/OHLCV, and open wrappers only as isolated fallbacks with caching, validation, provenance, and unavailable states.

## 1. Data Source Matrix

| Source | Repository / URL | Endpoint or access type | Authentication | Coverage and production posture |
|---|---|---|---|---|
| NSE Data & Analytics | [Official real-time data page][1] | Licensed multicast feeds, authorized vendors, delayed snapshots, historical and corporate products | Commercial agreement or authorized vendor for real-time entitlement | Primary reference for market-data licensing and feed levels. The official page describes Level 1, Level 2, Level 3, and tick-by-tick feeds; do not redistribute public-page data as if it were an official real-time license. |
| NSE Annual Reports and Corporate Filings | [Annual reports][2] | Official web filing pages and document links | No API key for public pages; usage and redistribution must be checked | Primary source for company-submitted annual reports and related filing classes. Best input for statements, accounting notes, related parties, governance, and historical evidence. |
| 0xramm Indian Stock Market API | [GitHub repository][3] | `/search`, `/stock`, `/stock/list`, `/symbols` REST routes | No key according to README | NSE/BSE symbols, search, quote metadata, PE, EPS, book value, sector, industry, currency, and batch queries. README recommends caching and a 60 requests/minute limit. Treat as a secondary Yahoo-backed wrapper, not as an official exchange feed. |
| nsetools | [GitHub repository][4] | Python client methods such as `get_quote`, index lists, gainers/losers, advances/declines, futures, and 52-week ranges | No API key | Useful unofficial NSE quote and index adapter. The documented full quote can include price, VWAP, price bands, market depth, trading, and industry sections. It does not supply an audited multi-year statement model by itself. Isolate behind retry, schema validation, and stale states. |
| yfinance | [GitHub repository][5] | Python access to Yahoo Finance public APIs, including chart and metadata workflows | No key for the open-source client | Secondary historical OHLCV and metadata fallback. The project explicitly says it is not affiliated with Yahoo, is intended for research/education, and that the Yahoo API is intended for personal use. Do not treat it as licensed real-time or redistribution data. |
| SEBI corporate-filings index | [SEBI corporate filings][6] | Regulator-level filing discovery and links to exchange workflows | Public web access | Compliance and discovery reference. The page may route users to NSE/BSE filing categories; final retrieval should be validated from the official exchange or issuer document. |
| Company investor-relations site | Issuer-specific official IR URL | Annual reports, investor presentations, results, transcripts, notices, and policy disclosures | Usually public; issuer terms apply | Primary source for company plans, segment detail, management commentary, capacity, contracts, related-party disclosures, and non-GAAP explanations. Store URL, publication date, document hash, and extraction version. |

The matrix separates **data availability** from **data rights**. A route that returns JSON is not automatically authorized for commercial redistribution or non-display use. Prices and OHLCV should therefore carry a provider, retrieval timestamp, adjustment status, and license posture in the internal schema.

## 2. Recommended Provider Routing

Use a capability-based cascade rather than a provider race. For accounting values, route first to company-submitted annual reports, quarterly results, XBRL or official filing documents, and issuer IR materials. For prices and OHLCV, route first to a licensed or explicitly permitted market-data provider. Use 0xramm, nsetools, and yfinance only after validating response shape, adjustment fields, timestamp, and provider terms.

A practical request sequence is:

1. Resolve the security to an exchange, symbol, ISIN where available, currency, fiscal-year end, and listing status.
2. Read the latest official filing and the prior comparable period; do not compare a quarterly value with an annual value or mix consolidated and standalone statements.
3. Retrieve price/OHLCV from the approved market-data route and record whether prices are split, bonus, and dividend adjusted.
4. Run the quantitative engine only when required fields share the same period, unit, currency, consolidation basis, and accounting basis.
5. If a fallback is used, label it with `source`, `retrieved_at`, `freshness`, `basis`, and `license_posture`; if validation fails, return `unavailable` rather than a fabricated estimate.

## 3. Verified Python Formula Module

The production-ready implementation is included at [`scripts/quant_scores.py`](../scripts/quant_scores.py). It is intentionally a pure calculation layer: it does not scrape, silently impute, or call an LLM. A separate ingestion layer should normalize statements before invoking these functions.

### 3.1 Piotroski F-Score

The F-Score is the sum of nine binary signals covering profitability, leverage/liquidity, and operating efficiency [7]. The implementation returns both the total score from 0 to 9 and the individual signal map.

```python
from quant_scores import PiotroskiYear, piotroski_f_score

prior = PiotroskiYear(
    net_income=prior_net_income,
    operating_cash_flow=prior_cfo,
    total_assets=prior_assets,
    long_term_debt=prior_long_term_debt,
    current_assets=prior_current_assets,
    current_liabilities=prior_current_liabilities,
    shares_outstanding=prior_shares,
    gross_margin=prior_gross_margin,
    asset_turnover=prior_asset_turnover,
)
current = PiotroskiYear(
    net_income=current_net_income,
    operating_cash_flow=current_cfo,
    total_assets=current_assets,
    long_term_debt=current_long_term_debt,
    current_assets=current_current_assets,
    current_liabilities=current_current_liabilities,
    shares_outstanding=current_shares,
    gross_margin=current_gross_margin,
    asset_turnover=current_asset_turnover,
)

result = piotroski_f_score(current, prior)
print(result.score, result.signals)
```

The nine signals are positive ROA, positive CFO, improving ROA, CFO greater than net income, lower leverage, improving liquidity, no share dilution, improving gross margin, and improving asset turnover. A bank or NBFC requires sector-specific interpretation because debt, liquidity, and operating-cash-flow semantics differ materially from an industrial company.

### 3.2 Beneish M-Score

The implementation uses the common eight-variable form: DSRI, GMI, AQI, SGI, DEPI, SGAI, LVGI, and TATA. The score is a **screening signal**; a value above the common `-1.78` threshold is not proof of fraud and must be followed by document-level review. The implementation requires total liabilities for LVGI rather than substituting interest-bearing debt alone.

```python
from quant_scores import BeneishYear, beneish_m_score

prior = BeneishYear(
    sales=prior_sales,
    receivables=prior_receivables,
    current_assets=prior_current_assets,
    property_plant_equipment=prior_net_ppe,
    depreciation=prior_depreciation,
    total_assets=prior_total_assets,
    current_liabilities=prior_current_liabilities,
    total_liabilities=prior_total_liabilities,
    net_income=prior_net_income,
    operating_cash_flow=prior_cfo,
    selling_general_admin=prior_sga,
    gross_profit=prior_gross_profit,
)
current = BeneishYear(
    sales=current_sales,
    receivables=current_receivables,
    current_assets=current_current_assets,
    property_plant_equipment=current_net_ppe,
    depreciation=current_depreciation,
    total_assets=current_total_assets,
    current_liabilities=current_current_liabilities,
    total_liabilities=current_total_liabilities,
    net_income=current_net_income,
    operating_cash_flow=current_cfo,
    selling_general_admin=current_sga,
    gross_profit=current_gross_profit,
)

result = beneish_m_score(current, prior)
print(result.m_score, result.high_risk, result.variables)
```

The main data trap is inconsistent classification. For example, leases, provisions, deferred tax balances, and sector-specific current/non-current conventions can affect asset quality and leverage ratios. Preserve the raw line-item mapping used to calculate every variable.

### 3.3 Sloan Ratio

The Sloan accrual ratio measures the accrual component of earnings relative to average total assets:

```python
from quant_scores import sloan_ratio

ratio = sloan_ratio(
    net_income=current_net_income,
    operating_cash_flow=current_cfo,
    average_total_assets=(prior_total_assets + current_total_assets) / 2,
)
print(ratio)
```

Positive values indicate that net income exceeds operating cash flow. The ratio is not a standalone fraud test; it should be reviewed alongside working-capital movements, revenue recognition, receivables, provisions, and cash-flow notes. Banks and NBFCs need specialist treatment because operating cash flow is not directly comparable with an industrial company’s cash conversion.

## 4. Validation and Test Results

The formula module validates finite numeric inputs, rejects invalid denominators, returns component-level Beneish variables, and makes no attempt to fill missing fields. The deterministic test file is [`scripts/test_quant_scores.py`](../scripts/test_quant_scores.py).

| Check | Result |
|---|---:|
| Piotroski all-positive nine-signal test | Passed |
| Beneish eight-variable output and threshold type test | Passed |
| Sloan ratio arithmetic test | Passed |
| Invalid denominator rejection test | Passed |
| Python syntax compilation | Passed |

Run locally with:

```bash
cd /home/ubuntu/market-event-intelligence
PYTHONPATH=scripts python3 -m unittest discover -s scripts -p 'test_quant_scores.py' -v
python3 -m py_compile scripts/quant_scores.py
```

## 5. Lightweight 4GB Architecture Blueprint

A 4GB host should be treated as a constrained batch-and-cache worker, not as an unrestricted low-latency research terminal. The safest design keeps scraping, calculation, and local language-model inference in separate bounded stages.

| Component | Suggested footprint | Design rule |
|---|---:|---|
| FastAPI/Uvicorn service | 80–180 MB | Use one worker on a 4GB host; apply request timeouts and bounded concurrency. |
| SQLite or compact PostgreSQL client cache | 50–300 MB working set | Store normalized records, source URLs, hashes, retrieval timestamps, and parser versions; index symbol/date/source. |
| Scraper and parser workers | 100–400 MB | Use asynchronous HTTP with a small semaphore, 30–60 second cache TTL for quotes, longer TTL for filings, and exponential backoff. |
| Quantitative engine | 20–100 MB | Use streaming row normalization and pure functions; do not load the entire market universe into memory. |
| Quantized 1B–1.5B local model | Approximately 0.8–2.0 GB including runtime overhead | Optional and serialized. Use short prompts, bounded context, and one inference at a time. Do not keep a model resident while a large backfill is running. |
| OS, logging, and safety reserve | At least 1.0 GB | Reserve memory for the kernel and transient parsing; do not design around swap as normal capacity. |

A minimal installation sequence is:

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install --upgrade pip
pip install fastapi uvicorn httpx pydantic pandas beautifulsoup4 lxml aiosqlite
# Add a local inference runtime only if the host has enough headroom.
# Prefer llama.cpp/Ollama with a small quantized model and one active request.
```

Recommended service boundaries are a collector, a normalizer, a score worker, and an API. The collector writes raw response bytes or document files to durable storage. The normalizer creates period-aligned statement records. The score worker calculates ratios and stores the input mapping and formula version. The API serves only validated records and exposes freshness and unavailable states.

On a 4GB machine, prefer a supervisor with restart limits, health checks, and a single Uvicorn worker. Use SQLite WAL mode for a small deployment, or move the database to a separate service when multi-user concurrency grows. Keep the local LLM optional: summaries can be generated asynchronously after the quantitative result is persisted, and the app should remain functional if inference is disabled.

## 6. Raw Data Fallbacks When APIs Fail

Fallbacks must be **source-preserving**, not a license to bypass access controls. Do not rotate proxies to defeat WAFs, bypass CAPTCHAs, or scrape pages whose terms prohibit the intended use. Prefer a slower, cached, transparent degradation path.

| Failure | Safe fallback | Required metadata |
|---|---|---|
| Quote endpoint unavailable | Approved secondary market-data provider, then a delayed public wrapper such as 0xramm or nsetools | Provider, exchange, timestamp, delayed/live label, adjustment status, response hash |
| Historical OHLCV unavailable | yfinance only where its stated personal/research use is compatible, or an approved historical vendor | Ticker mapping, interval, corporate-action adjustment status, retrieval time |
| Financial statement API incomplete | NSE annual reports, NSE financial-results filings, BSE filings, and issuer IR PDFs | Filing date, fiscal period, consolidated/standalone basis, currency/unit, document URL, checksum |
| Company plans or catalysts missing | Investor presentation, annual report, board-meeting disclosure, exchange announcement, or official IR notice | Publication date, issuer, document page/section, extraction confidence |
| News API outage | Verified RSS feeds and official company/exchange announcements | Feed URL, publication date, deduplication key, source name, relevance decision |
| Anti-bot or schema change | Mark provider degraded, use cached last-successful data, and queue a retry with backoff | Error class, last success, stale age, retry time, no fabricated values |

For financial-portal HTML, use robots-compliant retrieval, a realistic but honest user agent, strict rate limits, conditional requests where supported, and parser tests against stored snapshots. Normalize tables using explicit field maps and fail closed when a column moves or a unit changes. Raw documents should be retained separately from parsed values so a human can audit the source.

## 7. Indian Accounting and Modeling Caveats

Piotroski, Beneish, and Sloan were developed from accounting data with assumptions about comparable statement structures. Indian Ind AS reporting, sector-specific presentation, lease accounting, exceptional items, financial-company balance sheets, and consolidated versus standalone reporting can distort naive comparisons. The application should therefore attach `sector`, `accounting_basis`, `statement_basis`, `period_end`, `currency`, and `unit_scale` to every input.

The scores should be displayed as **screening diagnostics**, not investment advice or fraud determinations. A high Beneish flag requires document review. A low Piotroski score may reflect a cyclical investment period rather than a weak business. A high Sloan ratio can reflect working-capital timing. The app should show the underlying signals and evidence gaps instead of collapsing them into a single unexplained verdict.

## 8. Recommended Implementation Order

First, finish the source registry and normalized statement schema. Second, implement filing ingestion with document hashes and period validation. Third, connect the pure score module and store formula versions alongside outputs. Fourth, add sector-specific adapters for banks, NBFCs, insurers, and other financial companies. Fifth, add a cache-backed API with provider telemetry. Only after those controls are stable should the project enable optional local-LLM summaries on a 4GB host.

## References

[1]: https://www.nseindia.com/static/market-data/real-time-data-subscription "NSE Paid Real Time Data"
[2]: https://www.nseindia.com/companies-listing/corporate-filings-annual-reports "NSE Corporate Filings Annual Reports"
[3]: https://github.com/0xramm/Indian-Stock-Market-API "0xramm Indian Stock Market API"
[4]: https://github.com/vsjha18/nsetools "nsetools"
[5]: https://github.com/ranaroussi/yfinance "yfinance"
[6]: https://www.sebi.gov.in/curation/corporate_filings.html "SEBI Corporate Filings"
[7]: https://www.jstor.org/stable/2672906 "Piotroski, Value Investing: The Use of Historical Financial Statement Information to Separate Winners from Losers"
