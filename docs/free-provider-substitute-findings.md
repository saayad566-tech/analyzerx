# Free Provider Substitute Findings

## Decision

AnalyzerX will use no-key Google News RSS and GDELT DOC 2.0 as free news substitutes when paid or credentialed news providers are unavailable. NewsData.io remains the currently validated configured provider. SEC EDGAR remains the official no-key filing source for U.S. issuers.

## Sources

| Capability | Source | Status | Boundary |
|---|---|---|---|
| Global news discovery | GDELT DOC 2.0 | Free public endpoint; adapter to be added | Article discovery and source links; not a licensed real-time exchange feed |
| News discovery | Google News RSS | Existing no-key adapter | Aggregated links and freshness may vary; preserve original redirect URL |
| U.S. filings and XBRL | SEC EDGAR APIs | Existing validated adapter | U.S. issuer filings and XBRL only; no quotes/options |
| News fallback | NewsData.io | Existing credentialed provider; health check returned HTTP 200 | Plan limits and provider terms apply |
| Global market data fallback | Existing Yahoo chart fallback | Existing adapter | Delayed/public chart metadata; not a licensed real-time tape |
| Alert delivery | Discord webhook | Existing optional adapter | Requires a user-created webhook URL; no credential is invented |

## References

1. [GDELT DOC 2.0 API announcement](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/)
2. [GDELT data and live APIs](https://www.gdeltproject.org/data.html)
3. [SEC EDGAR API documentation](https://www.sec.gov/edgar/sec-api-documentation)
4. [Discord webhooks](https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Discord-Webhooks)
5. [Alpha Vantage](https://www.alphavantage.co/)

Alpha Vantage was not enabled automatically because its free use still requires a user key and its licensing/rate limits must be accepted before production routing.

## Additional public macro and market-context sources

AnalyzerX now catalogs public macro/context surfaces for OECD SDMX, IMF DataMapper, BIS Statistics, RBI Database on Indian Economy, Bank of Japan Statistics, MAS, HKMA, RBA, Bank of Canada, Deutsche Bundesbank, Banque de France, and Euronext issuer disclosures. These are deliberately labeled as source-catalog or context sources until endpoint schemas, cadence, and parser behavior are validated. They do not replace licensed quotes, options, intraday tape, or company-level fundamentals.

| Market/context | Added source families | Intended use |
|---|---|---|
| Global macro | OECD SDMX, IMF DataMapper, BIS Statistics | Country, rates, inflation, and financial-system context |
| India | RBI Database on Indian Economy | Rates, liquidity, banking, and macro context |
| Japan | Bank of Japan Statistics | Monetary and macro context |
| Singapore | MAS statistics | Monetary and financial context |
| Hong Kong | HKMA statistics | Rates, liquidity, and monetary context |
| Australia | RBA statistics | Macro and financial context |
| Canada | Bank of Canada data | Rates and macro context |
| Germany / France | Bundesbank, Banque de France | National macro and financial context |
| European equities | Euronext issuer disclosures | Listing and issuer-disclosure discovery |
