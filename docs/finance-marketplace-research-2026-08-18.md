# Finance Marketplace Research Notes — 2026-08-18

AnalyzerX's marketplace should be stock-market specific rather than a generic creator marketplace. The first recommended tool families are market-data connectors, technical-analysis libraries, filing and document parsers, financial sentiment models, screening/ranking engines, portfolio/risk analytics, report/export tools, and grounded local assistants.

## Evidence-backed candidates

| Tool family | Candidate | What it can provide | Marketplace boundary |
|---|---|---|---|
| Market data and discovery | `yfinance` | Ticker data, multi-ticker downloads, market data, WebSocket/AsyncWebSocket, search/news, sector/industry information, and screening helpers | The project documentation states that it is intended for research and educational use, is not affiliated with Yahoo, and users must review Yahoo terms. It cannot be presented as a guaranteed licensed real-time exchange feed. [1] |
| Technical analysis | Pandas TA | 130+ indicators including moving averages, MACD, Bollinger Bands, OBV, Aroon, squeeze, strategies, and multiprocessing support | MIT-licensed repository candidate, but indicators are calculations over supplied OHLCV data; the tool does not itself establish data provenance or trading validity. [2] |
| Financial NLP | ProsusAI/FinBERT | Financial-domain sentiment classification with positive, negative, and neutral outputs through Transformers | Suitable for local news/document sentiment where the model artifact, license, and runtime are verified. Its output is sentiment evidence, not a buy/sell conclusion. [3] |
| U.S. filing intelligence | SEC EDGAR APIs and RSS | JSON APIs for company submissions and extracted XBRL, filing access, RSS, daily/quarterly indexes, and archives | SEC fair-access guidance requires efficient downloads and limits total requests to no more than 10 requests per second. The connector must rate-limit, identify itself, cache, and preserve filing source URLs. [4] |

## Finance-only marketplace categories

1. **Data Connectors:** market quotes, OHLCV, fundamentals, corporate actions, filings, institutional flows, derivatives, macro, crypto, and FX. Each connector declares freshness, coverage, authentication, licensing, rate limits, and source lineage.
2. **Research Extractors:** filing/XBRL extraction, earnings-call/document parsing, management-guidance extraction, TAM/customer-concentration extraction, and source-backed company timelines.
3. **Analysis Engines:** fundamental five-pillar scoring, valuation/DCF, technical indicators, event impact scoring, sentiment, multibagger strategy scoring, peer comparison, and contradiction detection.
4. **Portfolio and Risk:** watchlists, holdings import, exposure, sector concentration, drawdown, scenario analysis, and alert rule evaluation. These tools must remain user-owned and protected.
5. **News and Event Intelligence:** symbol/entity linking, deduplication, relevance, catalyst classification, sentiment, storylines, event projections, autonomous recommendations, and alert delivery.
6. **Report and Export:** institutional PDF/Markdown/CSV generation, evidence appendix, score explanation, charts, data lineage, and report-history management.
7. **Local Assistant Models:** small/medium/large local models recommended by hardware profile for grounded search, extraction, classification, summarization, and navigation support. A local model is not allowed to invent missing financial data.
8. **Operations and Quality:** provider health, latency, circuit breakers, cooldowns, source coverage matrix, schema validation, parser tests, and audit export.

## Implementation implications

The existing AnalyzerX source catalog, provider registry, cooldown handling, financial analysis, news tracker, filings, flows, reports, graph, alerts, authenticated ownership, Local AI policy, and telemetry should be exposed to marketplace tools as capability contracts rather than duplicated. A marketplace tool can be installed only when its manifest is approved, its artifact checksum is pinned, its license is visible, and its adapter declares how it consumes and emits source-backed records.

Generic image/video/music studio tools are out of scope for this product. The native host should instead run finance workloads such as local FinBERT sentiment, filing extraction, technical-indicator computation, document embeddings/search, report generation, and grounded assistant actions. Heavy or unsupported workloads must return an explicit compatibility state.

## References

[1]: https://pypi.org/project/yfinance/ "yfinance PyPI project and usage/licensing notice"

[2]: https://github.com/Data-Analisis/Technical-Analysis-Indicators---Pandas "Pandas TA GitHub repository and README"

[3]: https://huggingface.co/ProsusAI/finbert "ProsusAI FinBERT model card"

[4]: https://www.sec.gov/about/developer-resources "SEC Developer Resources"
