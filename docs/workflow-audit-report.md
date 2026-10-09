# End-to-End Workflow Audit Report

**Project:** Market Event Intelligence  
**Audit date:** 17 August 2026  
**Author:** Manus AI

## Executive assessment

The application’s core workflow is operational across the verified NSE universe, official-source ingestion, server-side news tracking, impact ranking, persistence, MCP connectivity, and the primary mobile routes. The live backend reported a queryable database, running news and NSE schedulers, a verified NSE universe of 2,565 securities, and rotating 25-symbol news batches. The quality gates passed TypeScript, lint, production build, 53 deterministic tests, and mobile visual checks.

The audit found that external provider availability is not uniform. Finnhub returned HTTP 429 during one live tracker cycle and is now protected by a cooldown and bounded concurrency. The configured GNews credential still returns HTTP 403 in its dedicated credential test. Dhan MCP is present in session configuration but currently disabled, so its tools cannot be used by the running app session until the connector is enabled and authorized. These states are reported as provider limitations, not replaced with fabricated market data.

## Workflow results

| Workflow | Result | Evidence and boundary |
|---|---|---|
| Backend health | Pass | `/api/health` returned `ok: true` and `databaseAvailable: true` after a real `select 1` query. |
| Database persistence | Pass | Drizzle now uses a mysql2 pool; health checks queryability rather than object initialization. |
| News scheduler | Pass with degradation | Scheduler runs at 60 seconds. One Finnhub 429 was observed; cooldown and bounded concurrency now prevent repeated bursts. |
| NSE collector scheduler | Pass | Collector scheduler runs at 300 seconds and reports the configured official collectors. |
| NSE equity universe | Pass | Official CSV `https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv` returned HTTP 200 and normalized 2,565 securities. |
| NSE SME universe | Partial | The official SME route remains subject to access restrictions and is not counted as available when blocked. |
| Google News RSS | Pass | Indian-market RSS retrieval returned HTTP 200 and 100 `<item>` entries in the live smoke check. |
| India Stock MCP | Pass | Read-only RELIANCE smoke test returned quote and fundamentals without provider errors. |
| Dhan MCP | Unavailable in current session | The connector is configured but disabled in session configuration; no order, alert, or portfolio mutation was attempted. |
| News parsing and impact scoring | Pass | Structured extraction, fallback extraction, catalyst scoring, ranking, deduplication, source links, and stale fallback are covered by deterministic tests. |
| A–Z news batching | Pass with provider limits | The tracker rotates across the verified NSE universe, prioritizes configured symbols, limits symbol concurrency, and caps processed articles per poll. This is progressive coverage, not a claim that every stock has a fresh article every cycle. |
| Market flows | Truthful unavailable state | FII/DII aggregate totals are shown only when verified; unsupported stock-level flow cards remain unavailable. |
| Fundamental research | Truthful unavailable state | Scorecards do not produce ratings, fair values, or buy/sell conclusions without current verified inputs. |
| Mobile routes | Pass visually | Live Events, Market Flows, Sectors, Screener, Relationship Graph, Storylines, Alerts, and Support rendered on a 390×844 viewport without blank-screen crashes. |
| Controls and navigation | Pass in static audit | No empty press handlers were found; route links, search, filters, article detail, support, and alert controls have handlers. |

## Confirmed fixes applied during this audit

The database health path was hardened to create a real mysql2 pool and execute a lightweight query. The news tracker now uses a maximum article-processing cap per poll, bounded Finnhub concurrency, a rate-limit cooldown after HTTP 429, and explicit warnings when articles are deferred. Global market articles associated with a selected symbol are labeled `Market context` in the source field so they are not presented as company-specific evidence. The hardcoded Live Events notification badge was removed because no unread-alert count was persisted.

## Quality gates

The final checks passed `pnpm check`, 18 test files with 53 passing tests and 2 intentional skips, `pnpm lint`, and the production server build. The backend health endpoint passed after service restart. Visual regression checks covered the major routes and the corrected Live Events and Market Flows screens.

## Remaining limitations

The app does not claim instantaneous A–Z company news for every listed symbol. Coverage is progressive and constrained by provider quotas, provider search behavior, article availability, and the configured polling batch. The GNews credential remains externally rejected with HTTP 403 and should be disabled or replaced rather than treated as healthy. Dhan MCP remains unavailable to the current session while disabled. Verified India Stock MCP data may be delayed or incomplete because its reviewed package relies on public/free upstream sources. The research scorecard still needs UI wiring for the new MCP fields; until that is connected, the existing scorecard correctly shows unavailable states.

## References

[1]: https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv "NSE official equity securities CSV"
[2]: https://news.google.com/rss/search?q=Indian%20stocks%20global%20markets&hl=en-IN&gl=IN&ceid=IN:en "Google News RSS Indian-market query"
[3]: https://mcp.dhan.co/mcp "Dhan MCP endpoint"
[4]: https://docs.dhanhq.co/mcp/ "Dhan official MCP documentation"
[5]: https://github.com/Akhilgovind02/india-stock-mcp "India Stock MCP repository"
