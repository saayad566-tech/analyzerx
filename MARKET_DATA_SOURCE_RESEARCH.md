# Market Data Source Research

Phase 4 deliverable for the Global Market Data Isolation mandate.

**Verification status legend.** `in-repo` = a working adapter exists in this
repository (found by inspection). `documented` = the source is named in the mandate
with an official URL; it has **not** been live-tested from this environment.
`credentials` = requires a key or account.

**Environment caveat, stated up front.** This sandbox has public internet access but
no Android device, emulator, Java or Android SDK. Calls made from the *device* path
(GDELT, SEC EDGAR, exchange feeds) were **not** executed here. Nothing below claims a
live provider response was observed. Provider availability, free-tier terms and rate
limits change; re-verify before relying on any row.

---

## 1. Sources already implemented in the repository

| Source | Market scope | Category | Method | Access | Status | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| Yahoo Finance (chart / search / fundamentals) | Global | Quotes, history, profiles | HTTP JSON | No key | in-repo | Use — primary quote/history path |
| NSE archives (equity master, index constituents, FII/DII) | IN | Universe, indices, institutional flows | Bulk CSV/JSON | No key | in-repo | Use — **IN only** |
| Indian Market API | IN | Quotes, fundamentals | HTTP JSON | credentials (`INDIAN_API_KEY`) | in-repo | Use with limitations — IN only |
| Finnhub | Global | Company news, quotes | HTTP JSON | credentials (`FINNHUB_API_KEY`) | in-repo | Use when configured |
| Google News RSS | Global | News discovery | RSS | No key | in-repo | Use with limitations — redirects; search syntax undocumented |
| GDELT DOC 2.0 | Global | News discovery | HTTP JSON | No key | in-repo | Use with limitations — coverage/freshness vary |
| SEC EDGAR (submissions, company facts, full-text search) | US | Filings, XBRL facts | HTTP JSON | No key; descriptive User-Agent required | in-repo | Use — primary US filing path |
| Regional collectors | GB, CA, AU, JP, SG, HK, DE, FR | Filings, disclosures | HTTP | Mixed | in-repo | Use with limitations — per-market coverage unverified here |
| MarketAux / NewsAPI / NewsData / GNews | Global | News | HTTP JSON | credentials | in-repo, disabled unless keyed | Use only when configured |
| Nasdaq Data Link | Global/macro | Datasets | HTTP | credentials | in-repo, disabled | Requires credentials |
| OpenCorporates / OpenSanctions | Global | Entity/risk | HTTP | credentials | in-repo, disabled | Requires credentials |
| ECB / OECD / CoinGecko | Macro / crypto | Macro, crypto | HTTP JSON | No key | in-repo | Use with limitations — device-only path |

## 2. Official sources named in the mandate (not live-tested here)

| Market | Source | Official URL (as documented in the mandate) | Category | Access | Status | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| US | SEC EDGAR APIs | https://www.sec.gov/search-filings/edgar-application-programming-interfaces and https://data.sec.gov/ | Filings, XBRL | No key; User-Agent policy | documented; an adapter already exists in-repo | Use |
| UK | FCA National Storage Mechanism | https://www.fca.org.uk/markets/primary-markets/regulatory-disclosures/national-storage-mechanism | Regulated disclosures | Public documents | documented, not implemented as a dedicated adapter | Investigate before implementing |
| Canada | SEDAR+ | https://www.sedarplus.ca/ | Issuer filings | Public; terms unverified | documented, not implemented | Investigate — verify automation terms first |
| Japan | EDINET | https://disclosure2.edinet-fsa.go.jp/ and https://api-catalog.e-gov.go.jp/info/en/apicatalog/view/33 | Filings | **API key / registration likely required** | documented, not implemented | Requires credentials — verify before claiming support |
| India | data.gov.in and NSE/BSE | https://data.gov.in/ | Public datasets | Public | documented; NSE/BSE adapters exist in-repo | Use — India only |
| Germany / France | Exchange and issuer IR sources | — | Disclosures | Unverified | not researched to endpoint level | Requires research; do not claim support |
| Australia / Singapore / Hong Kong | Exchange announcement portals | — | Filings | Unverified | not researched to endpoint level | Requires research; do not claim support |

## 3. Categories genuinely available vs unavailable

| Category | Available today (in-repo, no key) | Requires credentials | Not implemented |
| --- | --- | --- | --- |
| Quotes | Yahoo Finance (global, delayed) | Finnhub, Indian Market API | Real-time exchange feeds for any market |
| Historical prices | Yahoo Finance | — | — |
| Company profiles / identifiers | Yahoo Finance | — | Provider-independent canonical instrument IDs |
| Fundamentals | Yahoo Finance (partial), Indian Market API (IN) | Indian Market API | Full fundamentals for GB/CA/AU/JP/SG/HK/DE/FR |
| News | Google News RSS, GDELT | MarketAux, NewsAPI, NewsData, GNews | — |
| Filings | SEC EDGAR (US) | EDINET (JP) | FCA NSM, SEDAR+ dedicated adapters |
| Ownership / shareholding | — | — | All markets |
| Indices / sectors | NSE archives (IN) | — | Non-Indian index membership |
| Search / discovery | Yahoo Finance, Finnhub | — | — |

## 4. Sources rejected, and why

- **Unlicensed scraping of paywalled or CAPTCHA-guarded pages** — rejected: the
  mandate forbids bypassing access controls, and the terms do not permit it.
- **Treated as "free" without verification** — no source is marked free here on
  assumption. Where terms were not verified, the row says so.

## 5. What this research does *not* establish

It does not establish that any provider returns correct data for a given market. That
requires live calls from a device with credentials, which was not possible here. The
coverage matrix in the audit report is therefore reported as **unmeasured**, not as
covered.
