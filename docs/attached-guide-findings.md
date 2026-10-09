# Attached NSE Collector Guide Findings

The attached guide requires official-source collection, raw-response provenance, checksums, validation, durable storage, incremental updates, and safe failure reporting. It also explicitly prohibits bypassing CAPTCHA, WAF, authentication, robots restrictions, or other access controls.

## Verified NSE page behavior

The official [NSE All Reports page](https://www.nseindia.com/all-reports) is a dynamic report landing page rather than a stable CSV endpoint. The official [NSE Corporate Filings Application](https://www.nseindia.com/companies-listing/corporate-filings-application) renders current announcement, corporate-action, board-meeting, financial-result, and shareholding tables, with links to specialized filing pages and the NEAPS portal. The pages expose current records in HTML and dynamically generated links; visible page URLs must not be treated as direct machine-readable downloads.

## Safe implementation decision

The existing project now uses a source catalog and controlled ingestion service. It stores the original source URL, retrieval timestamp, raw payload, normalized metadata, freshness/error state, and report date when available. The NSE FII/DII collector remains the first working dataset. Future bhavcopy, delivery, deals, announcements, actions, results, shareholding, and board-meeting collectors should resolve and validate the current official download or API mechanism before parsing. If access is blocked or requires prohibited bypassing, the collector must stop and report the limitation.

Prices and OHLC remain outside general page scraping and require a licensed market-data provider. AI extraction must remain source-linked; no fact may be created without a corresponding source record.

## Additional verified discovery

The official NSE announcements page exposes an RSS link to `https://nsearchives.nseindia.com/content/RSS/Online_announcements.xml`. The feed contains announcement title, publication time, description, and, for some items, a direct official document link such as an NSE archive PDF URL. Direct browser access may return a CAPTCHA; the collector therefore uses bounded requests and reports access failures without bypassing the protection.
