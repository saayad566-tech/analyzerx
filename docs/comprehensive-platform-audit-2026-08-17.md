# Comprehensive Platform Audit — 17 August 2026

## Executive conclusion

Market Event Intelligence completed a full engineering and workflow audit across the mobile/web routes, backend health, database availability, scheduled collectors, news ingestion, provider telemetry, stock search, global equity analysis, institutional report generation, and separate Markdown/PDF exports. The application is operational for its verified workflows. One actionable data-quality defect was found and repaired: unrelated global headlines were entering the Indian market-context archive through optional news/RSS ingestion. New ingestion-time and read-time relevance filtering now excludes those records while preserving direct company articles and India-linked global macro news.

The platform remains **India-first**, with global equity fallback support. It does not claim universal real-time coverage of every exchange or issuer when a provider, exchange endpoint, license, credential, or rate limit prevents verification.

## Audit coverage

| Area | Result | Evidence |
|---|---|---|
| App routes | Passed | Live Events, Storylines, Relationship Graph, Sectors, Market Flows, Screener, Alerts, and Support rendered without white screens at desktop preview. |
| Search and navigation | Passed | Route inventory and static interaction audit found no empty onPress handlers or missing declared route targets. |
| Fundamental analysis | Passed | India and global smoke paths returned complete scorecards with source-aware Estimated/Derived/Unavailable labels. |
| News tracker | Passed after repair | Background tracker running, 2,565 NSE-universe symbols reported, bounded batches active, and irrelevant market headlines filtered. |
| Archive and Special Events | Passed | Persisted archive query, date ordering, impact ordering, and high-impact/catalyst scope are implemented. |
| Database and health | Passed | `/api/health` returned `ok: true` and `databaseAvailable: true`. |
| NSE collectors | Operational with explicit limits | Scheduler running; blocked dynamic-download paths remain reported rather than bypassed. |
| Exports | Passed | Six independent institutional Markdown/PDF reports regenerated; six PDFs passed text-readability validation. |
| Quality gates | Passed | TypeScript, 81 deterministic tests, lint, and production build passed; two intentional tests skipped. |

## Real-data observations

The live health endpoint reported an active news tracker and NSE scheduler. Partial provider polling is surfaced explicitly through `lastError`; results are retained instead of being represented as complete coverage. The news archive now contains only relevance-validated market-context items after the repair. Direct stock-provider items remain eligible even when the article does not contain a macro keyword.

The export runner produced separate reports for Tata Motors, Tata Power, Adani Enterprises, Adani Ports, Reliance Industries, and Jio Financial Services. Each report contains score, rating, investment view, business and moat evidence, financial metrics, cash flow, solvency, valuation, catalysts, risks, scenarios, confidence, freshness, provenance, and the required disclaimer.

## Repaired issue

Before the audit, the persisted archive contained unrelated headlines such as general sports, entertainment, and international stories. The existing classifier was present but was not applied consistently to optional provider output or previously stored market-context records. The repair applies `classifyIndianNewsRelevance` at both ingestion and read time. It retains direct company articles, India-anchored headlines, and global macro headlines with an India-market connection, while filtering unrelated content without deleting database records.

## Verified limitations

GNews remains externally rejected with HTTP 403, and TinyFish remains externally rejected with HTTP 403/insufficient-credit behavior. These failures are isolated and shown through provider health rather than blocking the platform. The NSE dynamic download routes for bhavcopy, delivery, bulk deals, and block deals remain blocked until their current official machine-readable endpoints are validated. Finnhub and other free sources are subject to provider quotas, coverage windows, and freshness limitations; the app reports those conditions instead of fabricating values.

The development preview still emits non-blocking warnings for deprecated web `pointerEvents` handling in an upstream/runtime path and for the module-type configuration of the ESLint config. Neither warning caused a TypeScript, lint, build, or route-rendering failure during this audit.

## Final quality-gate record

The complete deterministic suite excluding only the two known external credential tests passed with **81 tests passed and 2 tests skipped across 26 test files**. TypeScript passed, lint passed, the production server bundle built successfully, backend health returned database availability, live news and NSE schedulers were running, and the primary routes rendered in responsive preview. The two external credential tests remain expected failures until valid provider access is available.

## Recommended next actions

The most valuable next step is to add a user-visible archive retention selector such as 7 days, 30 days, 90 days, and all stored history, with a clear count of records and provider coverage. Next, validate the current official NSE download endpoints for bhavcopy, delivery, bulk deals, and block deals. Finally, add an audit panel showing filtered-out article counts and relevance reasons so operators can review data-quality decisions without exposing unrelated headlines to end users.
