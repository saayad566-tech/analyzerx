# AnalyzerX Global Market Adapter Validation — 18 August 2026

## Validation policy

A market is not marked fully supported merely because an official website exists. AnalyzerX separates **catalog validation** (the authoritative source, schema family, access boundary, and update semantics are understood) from **runtime adapter validation** (a tested parser, identifier resolver, freshness contract, and provider-health path are operational). Until runtime validation is complete, the UI must show the market as expanding or planned and must not manufacture quotes, filings, flows, scores, or recommendations.

| Market | Authoritative source family | Validation outcome | Runtime boundary |
|---|---|---|---|
| India | NSE, BSE, SEBI, NSDL, AMFI | Validated primary market | Existing AnalyzerX adapters and source-specific restrictions remain authoritative. |
| United States | SEC EDGAR submissions and XBRL APIs | Catalog-validated | SEC APIs are unauthenticated JSON endpoints with real-time filing updates, but CORS is not supported and compliant server-side access plus User-Agent policy are required. Quotes, options, and news require separate sources. |
| United Kingdom | FCA National Storage Mechanism | Catalog-validated | Regulated disclosures and downloadable documents are available, but the NSM is not a real-time information service. PIP/API metadata and corrections require schema-aware parsing. |
| Canada | SEDAR+ | Catalog-validated | SEDAR+ is the national filing/disclosure/search system, but public automated parser, issuer-resolution, and market-data cadence are not yet promoted as production-ready. |
| Australia | ASX announcements and ASX information services | Catalog-validated | Announcement and price-data product boundaries are known; real-time access, ASIC integration, and licensing remain gated. |
| Japan | JPX/TDnet and EDINET | Catalog-validated | JPX TDnet API is a paid service with a test server returning dummy data; no production subscription is assumed. Japanese-language parsing and fiscal normalization remain pending. |
| Singapore | SGX announcements and annual reports | Catalog-validated | Public disclosure surfaces are identified; ACRA, issuer resolution, quote licensing, and parser cadence remain pending. |
| Hong Kong | HKEXnews | Catalog-validated | Corporate announcement search is identified; bilingual parsing, issuer resolution, and quote licensing remain pending. |
| Germany | ESMA ESEF plus BaFin/exchange/company sources | Catalog-validated | ESEF is the EU electronic reporting format; Germany-specific issuer, language, and exchange adapters remain pending. |
| France | ESMA ESEF plus AMF/Euronext/company sources | Catalog-validated | ESEF and French regulatory/exchange source families are identified; French-language parsing, issuer resolution, and quote adapters remain pending. |

## Source evidence

The SEC states that `data.sec.gov` provides submissions and XBRL JSON APIs without API keys and that updates are disseminated throughout the day; the SEC also states that CORS is not supported, so AnalyzerX must access it through compliant server-side collectors. The FCA describes the NSM as a store for regulated announcements and disclosed documents, explicitly noting that it is not a real-time information service. The Canadian Securities Administrators describes SEDAR+ as the secure national system used to file, disclose, and search Canadian capital-market information. JPX documents TDnet API as a direct distribution service with a paid production offering and a test server whose responses are dummy data; AnalyzerX must never treat that test server as live market evidence.

## Promotion gates

A regional adapter may move from `catalog-validated` to `validated` only after a deterministic fixture test, live transport probe where permitted, identifier-resolution test, schema mismatch handling, freshness/clock test, source-lineage persistence, cooldown behavior, and a licensing/redistribution review. A market with only filing coverage must not show unsupported price, options, institutional-flow, or recommendation features as live.
