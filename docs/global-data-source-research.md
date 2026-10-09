# Worldwide Equity Coverage Research

## Verified source findings

| Source | Verified capability | Coverage / caveat | Planned use |
|---|---|---|---|
| Yahoo Finance coverage page | Lists exchange suffixes and market delays for many global exchanges, including US, UK, Europe, Canada, Australia, Japan, Hong Kong, China, India, Singapore, South Africa, Korea, Taiwan, Thailand, Turkey, UAE, and Vietnam. | Yahoo explicitly states that information is provided as-is, for informational use, and must not be redistributed. Public chart endpoints can be used as a fallback only with provenance and no claim of licensed redistribution. | Global symbol suffix routing, public chart fallback, currency and exchange metadata when returned. |
| Finnhub | Official site states that its API covers global stocks, currencies, crypto, financial statements, analyst estimates, news, and more. It states 30+ years of financial statements for global companies and international market data with exchange-specific delays. | Free access is rate-limited and endpoint/plan availability must be monitored. Existing project credential is already configured for news/search/quotes. | Primary global search, quote/news context, and available global fundamentals where the configured plan permits. |
| Alpha Vantage | Official site states that it provides JSON/CSV stock data, historical data, fundamentals, global market news/sentiment, forex, commodities, and crypto. | Requires a user API key for normal operation; user requested no new credentials, so do not make it a mandatory dependency. | Optional future provider only if a key is later supplied through secure configuration. |
| SEC EDGAR | Official SEC page provides free access to millions of filings, full-text search, latest filings, company/CIK lookup, APIs, and RSS. | Coverage is for SEC-reporting issuers, not every worldwide exchange. Use for US-listed/SEC-reporting companies only. | Filing provenance and US company filing links/metadata. |

## Design boundary

The platform will remain **India-first** for official exchange filings and NSE/BSE-specific institutional data. Worldwide coverage will provide broad discovery and market context across supported exchange suffixes, with structured fundamentals only when an available provider returns them. Every global result must show exchange, country when known, currency, as-of time, provider, and whether a field is reported, derived, estimated, or unavailable.

Yahoo Finance is a discovery and chart fallback, not a blanket redistribution license. No source should be represented as real-time or licensed when the provider only supplies delayed or informational data. Global scoring must never imply that missing filing-level metrics are verified; it should downgrade confidence and preserve unavailable labels.

## URLs

1. https://help.yahoo.com/kb/SLN2310.html — Exchanges and data providers on Yahoo Finance.
2. https://finnhub.io/ — Finnhub global stock, fundamental, news, and crypto capability overview.
3. https://www.alphavantage.co/ — Alpha Vantage global stock, fundamentals, news, and crypto overview.
4. https://www.sec.gov/search-filings — SEC EDGAR search, filings, APIs, and public-access description.
