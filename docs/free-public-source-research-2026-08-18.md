# AnalyzerX free/public data-source research — 2026-08-18

## Verified source findings

| Domain | Source | What is available | Constraints and implementation rule |
|---|---|---|---|
| U.S. filings and XBRL | SEC EDGAR APIs | Public submissions and XBRL company facts; SEC states the APIs require no authentication/API key, update as filings disseminate, and provide bulk ZIPs. | Automated requests must comply with SEC privacy/security policy and identify the client; data is not an Indian-equity source. |
| U.S. macro | FRED | Series observations, metadata, releases, revisions, and bulk histories via API v1/v2. | FRED API documentation includes API-key handling; key-dependent requests must remain unavailable when not configured. |
| European macro/FX | ECB Data Portal SDMX | Programmatic retrieval and discovery of statistical datasets and metadata through SDMX 2.1 REST. | Use dataset metadata/codelists; observations are periodic and must retain dimensions and units. |
| Global macro/development | World Bank APIs | Indicators, data catalog, projects, finances, and climate datasets. | Respect dataset terms; use country/indicator/period metadata and do not treat development indicators as market prices. |
| Crypto | CoinGecko Demo API | Crypto market data and metadata through documented REST endpoints; documentation distinguishes Demo/free endpoints from paid Pro endpoints. | Demo key/rate limits are provider-dependent; no key means explicit unavailable state. Never claim exchange-grade real-time data. |
| Global identifier mapping | OpenFIGI | Free public identifier mapping and FIGI search with lower public rate limits. | Use for symbol/entity resolution, not prices or fundamentals; batch and cooldown requests. |
| Global news/events | GDELT | Open global news/event platform and documented query/data resources. | News coverage is not primary filing evidence; deduplicate, preserve URL/time, and label event confidence. |
| India official | NSE, NSDL, AMFI, BSE, SEBI | Official exchange reports, announcements, filings, periodic FPI and mutual-fund disclosures. | No CAPTCHA/WAF bypassing; protected/dynamic pages remain unavailable or page-snapshot only until a lawful machine-readable download is resolved. |

## Planned coverage expansion

AnalyzerX should add catalog metadata and safe adapters for SEC EDGAR, FRED, ECB SDMX, World Bank, CoinGecko Demo, OpenFIGI, and GDELT. It should also retain existing Finnhub, Google News RSS, NSE/BSE/SEBI/NSDL/AMFI, and provider fallbacks. Every adapter needs source URL, retrieval timestamp, response hash, schema/parser version, freshness/cadence, rate-limit state, and explicit unavailable/cooldown output.

## Deliberate exclusions

No scraper should bypass CAPTCHA, WAF, robots restrictions, login walls, paid/licensed data entitlements, or exchange terms. Free/public does not mean unrestricted or real-time. NSE/BSE real-time quotes, full option-chain Greeks, complete Indian mutual-fund flows, and comprehensive sector-wise DII flows remain limited unless an authorized machine-readable source is available.

## References

[1]: https://www.sec.gov/search-filings/edgar-application-programming-interfaces "SEC EDGAR Application Programming Interfaces"
[2]: https://fred.stlouisfed.org/docs/api/fred/ "FRED API documentation"
[3]: https://data.ecb.europa.eu/help/api/overview "ECB Data Portal API overview"
[4]: https://datahelpdesk.worldbank.org/knowledgebase/articles/889386-developer-information-overview "World Bank developer information"
[5]: https://docs.coingecko.com/reference/introduction "CoinGecko API documentation"
[6]: https://www.openfigi.com/api/overview "OpenFIGI API overview"
[7]: https://www.gdeltproject.org/data.html "GDELT data resources"

## Live non-mutating smoke probe

On 2026-08-18, the World Bank India GDP indicator endpoint returned HTTP 200 with JSON in approximately 3.3 seconds, and the ECB SDMX EUR/USD endpoint returned HTTP 200 with SDMX JSON in approximately 4.9 seconds. The GDELT probe failed at transport level after approximately 10.5 seconds, and the OpenFIGI mapping probe timed out after 12 seconds; these sources remain catalogued but must be treated as unavailable/cooldown until a later probe succeeds. No source was bypassed or retried aggressively.
