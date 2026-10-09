# Multi-market source findings

## Scope

The source registry distinguishes validated source families from live market-data availability. No region is promoted to fully live unless endpoint access, schema, issuer resolution, cadence, and licensing are verified.

## Authoritative source families reviewed

| Market | Source family | Evidence | Product treatment |
|---|---|---|---|
| United States | SEC EDGAR Search, Latest Filings, REST APIs, XBRL, RSS | SEC describes free public access to EDGAR, latest filings, APIs for submissions/XBRL, and RSS feeds. | Keep SEC filing ingestion validated; quote/options/news remain separately gated. |
| United Kingdom | FCA Official List / FCA Listings data, FCA publications, LSE issuer disclosures, company IR | FCA publishes Official List-based listings data and states that it is updated quarterly; filing/disclosure access is distinct from market-data access. | Keep FCA/LSE disclosure family catalog-validated; do not claim real-time quotes. |
| Singapore | SGX announcements, SGX annual reports, SGX data-connectivity products, company IR | SGX distinguishes data-connectivity/market-data products from public corporate information surfaces. | Keep SGX disclosure family catalog-validated; market-data cadence is separate. |
| European Union / Germany / France | ESMA/ESAP and national regulator/exchange/issuer sources | ESMA identifies ESAP and EU supervisory/data work; issuer reporting and national exchange/regulator feeds remain distinct by jurisdiction. | Register ESMA/ESAP as a cross-market regulatory source family while retaining BaFin/AMF/Euronext and ESEF as country-specific families. |

## Design decision

The app should use source families as discovery and provenance metadata, not as invented data. Missing access, stale payloads, schema gaps, or licensing restrictions must render as partial, delayed, or unavailable. Existing provider routing and circuit breakers remain unchanged.

## References

1. [SEC Search Filings](https://www.sec.gov/search-filings)
2. [FCA Listings data](https://www.fca.org.uk/data/fca-listings-data)
3. [SGX Data & Connectivity](https://www.sgx.com/data-connectivity)
4. [ESMA](https://www.esma.europa.eu/)
