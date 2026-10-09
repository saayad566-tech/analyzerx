# Research Source Findings

## 0xramm Indian Stock Market API
Source: https://github.com/0xramm/Indian-Stock-Market-API

The repository documents a no-key Flask REST API with `/search`, `/stock`, `/stock/list`, `/symbols`, and `/` routes. It claims NSE/BSE coverage, `.NS`/`.BO` suffix support, company name and symbol search, batch requests, and fields including last price, change, volume, market cap, PE, dividend yield, book value, EPS, sector, industry, currency, and timestamps. The README recommends a 60 requests/minute ceiling and at least 30 seconds of caching. It is an open-source wrapper using Yahoo Finance data rather than an official NSE feed; it should be treated as a secondary quote/metadata adapter with explicit freshness and licensing checks.

## nsetools
Source: https://github.com/vsjha18/nsetools

The repository is an MIT-licensed Python library for extracting NSE data and documents stock quotes, index quotes/lists, gainers/losers, advances/declines, stocks in an index, futures, and 52-week high/low methods. `get_quote(code, all_data=False)` returns last price, change, percentage change, previous close, open, close, VWAP, price bands, intraday high/low, and week high/low; `all_data=True` exposes additional security, market-depth, trading, and industry sections. It is an unofficial scraper/client and should be isolated behind caching, timeout, schema validation, retry, and unavailable states. It does not provide a complete audited financial-statement history by itself.

## Initial verification posture
Neither source should be represented as a guaranteed official real-time entitlement. For production, prefer licensed market data for prices/OHLC and official exchange/regulator/company filings for financial statements and shareholding. Public wrappers are fallback adapters only.

## Official NSE real-time data
Source: https://www.nseindia.com/static/market-data/real-time-data-subscription

NSE states that its market quotes and analytics are provided through NSE Data & Analytics Limited. The official page describes Level 1, Level 2, Level 3, and tick-by-tick feeds across capital market, derivatives, currency, and debt segments. The online feed is multicast over a dedicated leased line from an NSE point of presence, or can be obtained through an authorized data vendor. The page also exposes delayed snapshots, historical products, corporate data, and an authorized-vendor list. This is evidence that unrestricted official real-time redistribution should not be assumed from public web pages.

## Policy URL check
The guessed policy URL `https://www.nseindia.com/market-data/nse-data-sharing-and-usage-policy` returned `Resource not found` during this session. The report should link only to the verified official real-time-data page and advise checking the current NSE Data & Analytics usage-policy page before production redistribution.

## Formula and primary-filing research

Piotroski’s original paper defines F-Score as the sum of nine binary signals across profitability, leverage/liquidity, and operating efficiency. The JSTOR page itself presented a client challenge in this session, so the report cites the original publication metadata and uses the well-known nine-signal structure conservatively rather than claiming a page-level quotation.

Source: https://www.nseindia.com/companies-listing/corporate-filings-annual-reports

NSE’s Annual Reports page states that annual reports available there are based on submissions made by companies. The page’s corporate-filings navigation also exposes announcements, financial results, shareholding-related and governance filings, related-party transactions, board meetings, and other filing classes. These filings are the preferred raw inputs for the proposed score calculations, subject to period alignment and sector-specific normalization.

## yfinance
Source: https://github.com/ranaroussi/yfinance

The project is Apache-licensed and provides a Python interface to Yahoo Finance’s publicly available APIs. Its README explicitly says it is not affiliated with, endorsed, or vetted by Yahoo, is intended for research/education, and that Yahoo Finance API use is intended for personal use. It is useful for secondary historical OHLCV and metadata fallback, but should not be treated as a licensed real-time exchange feed or as a redistribution entitlement.

## SEBI corporate-filings index
Source: https://www.sebi.gov.in/curation/corporate_filings.html

The source was opened but did not return renderable content in this session. The search result identifies it as a regulator-level corporate-filings index that links filing categories back to NSE/BSE workflows. It should be used as a discovery and compliance reference, with final document retrieval validated from the relevant exchange or issuer source.

## ADANIENT report audit sources — 2026-08-17

The attached ADANIENT report is materially incomplete because the analysis payload resolved the symbol without attaching a verified Indian company profile, produced a zero current price, and substituted sector baselines for company-period fields. The official Adani Enterprises investor-download page exposes annual reports, quarterly financial statements, investor presentations, and result press releases, providing a direct company-source route for future-plan, business-model, and financial evidence: https://www.adanienterprises.com/investors/investor-downloads.

The NSE annual-report route is an official filing discovery surface, but it is dynamically rendered and may require validated request/session handling; the application must retain explicit unavailable states rather than bypassing controls: https://www.nseindia.com/companies-listing/corporate-filings-annual-reports.

The public Screener.in ADANIENT page exposes company identity and website links, current price, market cap, price range, P/E, book value, ROCE, ROE, quarterly and annual profit-and-loss history, balance-sheet history, cash-flow history, ratios, and shareholding history. These fields can provide a robots-compliant fallback when extracted conservatively and labeled as public-page data. The observed page showed current price ₹3,009, market cap ₹4,06,536 crore, book value ₹627, annual/TTM revenue history, annual CFO/FCF history, and promoter/FII/DII/public shareholding history: https://www.screener.in/company/ADANIENT/consolidated/.

The report quality gate must reject non-positive current-price values, must not render zero as a valid fair-value anchor, and must not use sector-baseline values for company-specific balance-sheet, ownership, cash-flow, or valuation fields when a company filing/public financial page is available. Any remaining missing field should be marked unavailable with its next source check rather than silently estimated.
