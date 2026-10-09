# Public APIs Repository Inventory

Repository reviewed: [public-apis/public-apis](https://github.com/public-apis/public-apis), commit `ac94df4`.

## Relevant candidates

| Provider | Repository description | Relevance | Credential state |
|---|---|---|---|
| MarketAux | Live stock-market news with tagged tickers, sentiment, and statistics | High for news enrichment and ticker linking | API key required |
| NewsAPI | Headlines from news sources and blogs | Medium for broad news fallback | API key required |
| NewsData | Live-breaking news and headlines | Medium for broad news fallback | API key required |
| Newsflash | Deduplicated news events with corroboration/confidence scores | High for event corroboration | API key required |
| GNews | Search across news sources | Medium for discovery | API key required |
| Noozra | Headlines from curated RSS sources | Medium for no-key RSS fallback | No key listed |
| Nasdaq Data Link | Stock market data | Medium for global/macro supplementary data | API key required |
| Statistics of the World | GDP, population, inflation, and indicators | Medium for macro context | No key listed |
| OpenCorporates | Corporate entities and directors | Medium for company/entity linking | API key required |
| OpenSanctions | Sanctions, crime, and PEP data | Medium for management and counterparty risk checks | No key listed |
| arXiv | Research papers including quantitative finance and economics | Low-to-medium for research discovery | No key listed |
| Telegram Bot | Bot messaging API | High for existing high-impact alert channel | API key required |
| Discord | Bot and integration API | High for existing high-impact alert channel | OAuth/API setup required |

## Excluded from automatic integration

The repository also contains many unrelated APIs, paid services, unstable demos, and providers outside Indian equities. They should not be bundled into the app without a product use case, legal review, credential ownership, and rate-limit handling. The list is a catalog, not a set of universally safe or universally free APIs.

## Initial implementation direction

Keep Finnhub and the Indian API as current first-party market providers. Add a provider registry with optional adapters for MarketAux, NewsAPI, NewsData, Newsflash, GNews, and configurable RSS/Noozra. Add macro and corporate-risk adapters only behind explicit capability flags. Store provider status, last-success timestamps, and failure reasons so one provider outage cannot block the tracker.
