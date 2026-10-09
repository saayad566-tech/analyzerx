# Deep Research Upgrade Findings

## Current product gaps

The project already has broad screens for Live Events, Storylines, Relationship Graph, Market Flows, Sector Intelligence, Multibagger Screener, Alerts, native Support, provider registry, and server news tracking. The unresolved TODO items show that several displays remain structurally prepared but are not yet connected to verified live data: sector-wise FII/DII and mutual-fund metrics, imported JSON contracts, institutional-flow normalization, options/fundamental data completeness, saved alert persistence, and the standalone FinBERT analyzer.

## Authoritative coverage findings

NSE states that its real-time products cover capital-market quotes, futures and options, currency derivatives, debt, corporate data, and corporate-bond data, but these are commercial products and may require an authorized data-vendor relationship. NSE also publishes 15-minute delayed snapshots and official reports, which is more appropriate for a transparent delayed-data mode than presenting an unofficial endpoint as guaranteed real time. Source: https://www.nseindia.com/static/market-data/real-time-data-subscription.

NSE exposes a dedicated corporate-filings announcements area and a separate FII/FPI and DII activity report. The latter provides downloadable reports for NSE capital-market activity and combined NSE/BSE/MSEI activity, making it a stronger institutional-flow source than relying on fixture values. Source: https://www.nseindia.com/companies-listing/corporate-filings-announcements and https://www.nseindia.com/reports/fii-dii.

AMFI exposes a portfolio-disclosure area and related mutual-fund disclosure workflows. It is a suitable provenance source for monthly portfolio holdings and NAV-related context, but disclosure cadence is not equivalent to intraday flow data. Source: https://www.amfiindia.com/online-center/portfolio-disclosure.

## Upgrade priorities

| Priority | Upgrade | Rationale | Truthful product behavior |
|---|---|---|---|
| P0 | Persist alerts and user preferences locally | Existing alert controls reset between sessions | Store enabled rules and display last-saved state |
| P0 | Add provider freshness and provenance model | Multiple sources have different cadence and licensing | Show source, as-of timestamp, delayed/stale/unavailable state |
| P0 | Improve server news event normalization | More providers require consistent entity and URL deduplication | Keep raw source metadata and normalized fields |
| P1 | Add official NSE FII/DII report adapter | Directly addresses the largest unresolved flow gap | Use report date and show report cadence |
| P1 | Add filings and announcement event category | Strengthens catalyst and corporate-event coverage | Link to original filing and label source |
| P1 | Add AMFI disclosure ingestion as monthly holdings context | Adds mutual-fund ownership evidence without claiming live buying flow | Label as portfolio disclosure date |
| P1 | Add search/watchlist persistence | Broad search is useful but lacks continuity | Store selected symbols and recent searches locally |
| P2 | Expand research evidence cards | Screener scores need more transparent source context | Unavailable metrics remain unavailable until verified |
| P2 | Improve options data adapter contract | Existing scorecard has unavailable states | Expose expiry, OI, PCR, and IV only when provider-backed |

## Guardrails

The platform must not label NSE commercial feeds as freely available, convert monthly AMFI holdings disclosures into intraday mutual-fund flows, or replace missing fundamental/derivatives values with estimates. Provider failures must isolate to the affected card and surface a stale or unavailable state.
