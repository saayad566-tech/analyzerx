# Regional Collector Research — 2026-08-18

## Canada — SEDAR+

The Canadian Securities Administrators describe SEDAR+ as a secure web-based system used to file, disclose, and search information in Canadian capital markets. The official CSA page provides public portal access, system status, training/resources, and help-centre guidance, but does not document a public machine-readable API in the page content reviewed [1]. The Ontario Securities Commission describes SEDAR+ as the national system for filings, disclosure, payments, and information searching, with a unified portal and improved search/data quality; it likewise does not document a public structured feed or API in the reviewed content [2].

**Implementation decision:** Canada remains `catalog-validated`/access-gated for automated collection. AnalyzerX should not claim full live SEDAR+ ingestion until an authorized, documented endpoint and stable response schema are available. A collector may support an explicitly configured authorized endpoint later, with raw payload checksum, parser version, exact issuer resolution, freshness state, and unavailable/error states.

[1]: https://www.securities-administrators.ca/about-sedar/ "Canadian Securities Administrators — SEDAR+"
[2]: https://www.osc.ca/en/industry/sedarplus "Ontario Securities Commission — SEDAR+"

## Australia — ASX

The official ASX Today's Announcements page is a public announcement surface with search/navigation, but the reviewed page does not document a stable public machine-readable announcements API. ASX separately directs users to its connectivity and data services for data access, which are distinct from the public web page [3]. AnalyzerX therefore keeps ASX runtime collection source-gated until an authorized structured endpoint and schema are configured.

## Japan — JPX TDnet

JPX describes TDnet API Service as a direct distribution service for timely disclosures, with subscribers able to request up to five years of disclosure information. The service includes financial statements, forecasts, dividends, buybacks, and index metadata; the page is under JPX Paid Information Services and links to API specifications [4]. AnalyzerX must not treat public/dummy test responses or third-party scrapers as live official evidence. The Japan collector is implemented for an explicitly configured authorized endpoint and exact issuer map, otherwise it remains access-gated.

[3]: https://www.asx.com.au/markets/trade-our-cash-market/todays-announcements "ASX — Today's announcements"
[4]: https://www.jpx.co.jp/english/markets/paid-info-listing/tdnet/02.html "JPX — TDnet API Service"

## Singapore — SGX

The official SGX company-announcements page is a public web surface, but its extracted content is mostly a client-rendered shell and does not document a stable public JSON feed. SGX separately exposes Data & Connectivity/reference-data services, indicating that structured reference data, announcements, and financial-statement products are service-based rather than an assumed free public API [5]. AnalyzerX keeps Singapore ingestion source-gated until an authorized endpoint and schema are configured.

[5]: https://www.sgx.com/data-connectivity/reference-data-feed "SGX — Reference Data Feed"

## Hong Kong — HKEXnews

HKEXnews is the official public search surface for corporate announcements, shareholder circulars, annual reports, and prospectuses. The reviewed page did not expose a stable structured API in its accessible content. AnalyzerX therefore keeps Hong Kong collection source-gated until an authorized machine-readable endpoint and bilingual schema are configured [6].

## Germany — EU ESEF

ESMA states that ESEF is the mandated electronic reporting format for issuers on EU regulated markets. Annual financial reports are prepared in XHTML, and IFRS consolidated financial statements are tagged with Inline XBRL, making marked disclosures structured and machine-readable. ESMA publishes the reporting standards, taxonomies, manuals, and conformance tools, but it is not a single issuer filing API; country/exchange repositories and exact issuer resolution remain required [7]. AnalyzerX’s Germany adapter is therefore configured for an authorized issuer/repository endpoint and validates disclosure envelopes before persistence.

[6]: https://www.hkexnews.hk/index.htm "HKEXnews — Official corporate disclosure search"
[7]: https://www.esma.europa.eu/issuer-disclosure/electronic-reporting "ESMA — Electronic Reporting / ESEF"
