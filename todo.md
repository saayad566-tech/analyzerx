# Project TODO

- [x] Custom Market Event Intelligence app icon and branding configuration
- [x] iOS-style dark market-terminal design system
- [x] Live Events screen with chronological event stream
- [x] Breaking Events high-signal view
- [x] Event extraction record with entities, relationship, type, timestamp, value, sector, source, sentiment, relevance, and confidence
- [x] Event Storylines grouped by related companies, projects, orders, and time windows
- [x] Company Timeline with previous and next connected events
- [x] Relationship Graph with confirmed facts versus AI inference
- [x] Sector Intelligence screen with activity and beneficiary clusters
- [x] Search across companies, symbols, projects, sectors, and relationships
- [x] Advanced filters for event and market attributes
- [x] Event Details screen with intelligence score explanation
- [x] Natural-language alert creation and alert management
- [x] Local persistence for saved alerts and user preferences
- [x] Reusable navigation, cards, chips, timeline, graph, and bottom-sheet components
- [x] Deterministic test coverage for core filtering and alert rule behavior
- [x] TypeScript, lint, and preview verification
- [x] Detailed selected-entity company timeline with historical sequence, related storylines, relationship context, and event detail navigation
- [x] Company timeline route and entry point from Live Events event details
- [x] Timeline interaction and regression tests
- [x] Add direct company timeline entry points from Storylines cards and entity chips
- [x] Add direct company timeline entry points from Relationship Graph company nodes
- [x] Verify cross-screen navigation from Storylines and Graph views
- [x] FII, DII, proprietary trader, mutual fund, stock buying, and options activity data model
- [x] Market Flows mobile screen with category tabs and source/time context
- [x] High-to-low sorting for net buying, buying value, and options activity
- [x] Flow filters and timeline/company navigation
- [x] Regression tests for flow sorting and category filtering
- [x] Market Flows date-range controls for Today, 1 Week, 1 Month, and Quarter to Date
- [x] Range-aware summary, flow period labels, and source context
- [x] Regression tests for date-range selection and sorting compatibility
- [x] Range-over-range percentage comparison metrics for prior comparable period
- [x] Comparison basis labels for prior week, prior month, and prior quarter
- [x] Regression tests for comparison calculations and direction states
- [x] Per-category range-over-range comparison metrics in Market Flows
- [x] FII versus DII week-over-week comparison card
- [x] Regression tests for category comparison calculations
- [x] Sector and stock-category strength ranking from buying flows and event activity
- [x] FII/DII concentration view by category with evidence and comparison context
- [x] Upcoming catalyst and opportunity-signal cards with confidence and risk labels
- [x] Opportunity filters and tests for category ranking calculations
- [ ] Live sector-wise FII, DII, and mutual-fund data connector
- [ ] Server-side normalization with source attribution and refresh timestamp
- [ ] Replace Sector Opportunity Radar fixture scores with live-derived metrics
- [ ] Loading, stale, unavailable, and retry states for live sector data
- [ ] Regression tests for live flow normalization and fallback behavior
- [ ] Evaluate nse-bse-api for exchange quotes, options, announcements, and licensing fit
- [ ] Document that nse-bse-api does not replace sector-wise FII/DII or mutual-fund holdings data
- [ ] Select a compatible institutional-flow source before wiring live sector scores
- [ ] JSON import contract for sector-wise FII, DII, and mutual-fund records
- [ ] Schema validation, source attribution, refresh timestamp, and stale-data handling
- [ ] Connect imported JSON records to Opportunity Radar rankings
- [ ] Regression tests for valid, invalid, and stale JSON imports
- [ ] Inspect JSON/feed integration flow without modifying the current implementation
- [ ] Document field mapping, runtime sequence, and provider coverage gaps
- [x] Dedicated Multibagger Research Screener screen
- [x] Quantitative filters for market cap, ROCE/ROE, growth, leverage, PEG, and cash flow
- [x] Qualitative checklist for tailwinds, moats, management quality, promoter pledging, and capital allocation
- [x] Institutional under-ownership and category context signals
- [x] Red-flag exclusions and evidence-backed research score
- [x] Transparent disclaimer that screening is not a guaranteed return forecast
- [x] Regression tests for screener filter and risk-flag behavior
- [ ] Standalone FastAPI Positive Impact Stock News Analyzer with Finnhub, Alpaca News, and NewsAPI adapters
- [ ] FinBERT positive sentiment threshold and bullish catalyst filtering
- [ ] Impact scoring, sorted JSON output, and suggestion generation
- [ ] Continuous refresh cache, provider error handling, and configuration validation
- [x] Audit the current Finnhub integration and app-rendered data fields
- [x] Verify endpoint coverage, plan limitations, response mappings, and real-data availability
- [x] Update capability presentation so unsupported fields show unavailable states instead of fabricated values
- [x] Fix Relationship Graph storyline tap interaction and open a meaningful detail or timeline view
- [x] Make existing Multibagger Screener filters apply to candidate results
- [x] Add a working new-industry or business-expansion filter with evidence state
- [x] Add regression tests for Graph taps and Screener filter combinations
- [x] Add capacity expansion trigger filters: plant commissioning, greenfield/infrastructure, and operating leverage
- [x] Add new-sector entry trigger filters: sunrise sector, new TAM, and diversification
- [x] Add order-book trigger filters: multi-year visibility, book-to-bill, and market-share gain
- [x] Add recent large-order trigger filters: immediate catalyst, capability validation, and forecast-upgrade context
- [x] Add corporate, financial, macro, and technical trigger filters with evidence and risk labels
- [x] Add regression tests for trigger-category filtering and multi-select behavior
- [x] Stock search input for company or ticker analysis
- [x] 100-point equity scoring model across six fundamental categories
- [x] Executive summary, rating band, thesis, scoring table, deep-dive sections, and risks
- [x] Source-aware metric states with no fabricated financial values
- [x] Regression tests for search, score totals, and unavailable-data behavior
- [x] Combined Fundamental + Option Chain Research view
- [x] 50-point fundamental scorecard and 50-point derivatives scorecard
- [x] OI structure, PCR, max pain, Greeks, IV/skew, writer positioning, and expected range sections
- [x] Combined directional signal, divergence checks, and risk warnings
- [x] Explicit unavailable states until verified live options and fundamentals data are connected
- [x] Regression tests for score allocation and derivative-state handling
- [x] Progressive stock autocomplete for partial company names and tickers
- [x] Selectable suggestion rows that populate the requested analysis symbol
- [x] Correct default-state behavior so the selected stock replaces the Apple-only view
- [x] Regression coverage for partial matching, case-insensitivity, and empty results
- [x] Secure Indian API credential configuration
- [x] Indian API provider adapter with source-labelled normalized fields
- [x] Preserve Finnhub as a separate source and show provider availability states
- [x] Indian API secret validation test before wiring live responses
- [x] Deep audit of all screens, buttons, search, filters, navigation, and live integrations
- [x] Fix empty notification, graph zoom/expand, sector controls, and alert controls
- [x] Run final TypeScript, regression, lint, API-secret, and analyzer checks
- [x] Visually verify all major mobile screens and document remaining warnings
- [x] Expand stock search beyond the small local symbol directory
- [x] Support broader Indian company and ticker matching with progressive suggestions
- [x] Preserve exact selected-symbol analysis and explicit unavailable states
- [x] Add regression tests for broader search, partial matches, and empty results
- [x] Define truthful 24x7 news-tracker architecture and mobile background limitations
- [x] Add structured news extraction schema and validation
- [x] Add background polling, deduplication, persistence, and high-impact notification flow
- [x] Evaluate bundled local LLM feasibility versus server-side inference fallback
- [x] Add regression coverage for extraction, deduplication, alert thresholds, and failure states
- [x] Build server-first always-on news ingestion pipeline
- [x] Add resilient RSS/API polling with retry, timeout, and backoff behavior
- [x] Add structured JSON news extraction and impact classification
- [x] Add durable event storage, idempotent deduplication, and freshness telemetry
- [x] Add push notification delivery for high-impact events
- [x] Connect the mobile Live Events screen to tracker status and results
- [x] Add regression tests for outage recovery, schema validation, and notification idempotency
- [x] Inventory relevant Public APIs repository entries for market data, news, macro, filings, and alerts
- [x] Classify provider credentials, rate limits, licenses, and suitability before integration
- [x] Add a safe optional provider registry instead of blindly enabling unrelated APIs
- [x] Connect supported provider adapters to server tracker capability states
- [x] Add regression tests for provider availability, failure isolation, and secret handling
- [x] Review attached Android foreground-service and bundled-local-LLM guide against Expo architecture
- [x] Document which always-on, battery, permission, thermal, and native-inference requirements are feasible
- [x] Add safe compatible Android tracker controls without claiming unrestricted 24x7 execution
- [x] Add regression coverage for tracker mode, thermal/battery safeguards, and server coordination
- [x] Add supplied Tidio widget as a web-only integration
- [x] Keep Tidio script excluded from Android and iOS native runtimes
- [x] Verify widget loading, build checks, and preview behavior
- [x] Add native Android/iOS support contact screen
- [x] Add navigation entry point from the mobile app
- [x] Add working email, website, copy, and feedback actions with failure states
- [x] Verify support screen behavior, tests, lint, and mobile preview
- [x] Audit all existing product screens, server routes, providers, tests, and unresolved TODO gaps
- [x] Research authoritative Indian-market data, news, filings, macro, derivatives, and institutional-flow sources
- [x] Prioritize broad upgrades by data reliability, user value, and implementation risk
- [x] Implement selected upgrades with provenance, stale states, and provider-failure isolation
- [x] Expand regression, integration, and responsive UI verification for upgraded features
- [x] Build official NSE FII/FPI and DII report adapter
- [x] Normalize report dates, buy/sell values, and net institutional flows
- [x] Add fresh, stale, unavailable, and provider-error states
- [x] Connect live report data to Market Flows and Sector Intelligence
- [x] Add parser, normalization, freshness, failure, and UI regression tests
- [x] Identify an authorized direct NSE FII/DII report URL or confirm it is not available
- [ ] Configure direct NSE URL securely without exposing credentials
- [ ] Validate direct-source precedence and preserve intermediary fallback safety
- [x] Add official NSE/BSE/SEBI/company source catalog for announcements, actions, results, holdings, and filings
- [x] Define compliant web-page versus machine-readable feed handling
- [x] Add normalized source-record storage with URL, retrieval time, report date, and raw provenance
- [x] Preserve licensed market-data API boundaries for prices and OHLC
- [x] Add ingestion status, freshness, retry, and unavailable states to the app
- [x] Read and map the newly attached guide to existing ingestion, research, and provider workflows
- [x] Document compatible enhancements and blocked or unsafe instructions
- [x] Implement compatible guide requirements with provenance and freshness safeguards
- [x] Verify guide-derived parsing, persistence, source labels, and regression coverage
- [ ] Discover current official NSE download mechanisms for every guided dataset
- [ ] Implement dataset-specific collectors for reports, delivery, deals, filings, actions, results, holdings, and meetings
- [ ] Add retries, rate limits, deduplication, incremental updates, backfill, validation, provenance, and failure reporting
- [ ] Add revision history, structured event extraction, collector operations status, and end-to-end retrieval tests

- [x] Add safe HTML-table normalization for official NSE page snapshots
- [x] Schedule official NSE announcements, actions, results, shareholding, and board-meeting page snapshots
- [x] Add deterministic HTML-table parser regression coverage
- [ ] Resolve current authorized NSE mechanisms for bhavcopy, delivery, bulk deals, and block deals without CAPTCHA/WAF bypassing
- [ ] Add dataset-specific structured parsers for announcements, actions, results, shareholding, and board meetings after live schemas are validated
- [x] Add administrative collector-health dashboard
- [ ] Connect verified options and fundamental data providers to research scorecards
- [ ] Integrate production FinBERT inference for positive-impact news analysis
- [ ] Configure an authorized direct NSE FII/DII machine-readable URL and validate precedence over fallback

## Latest verification

- TypeScript check: passed
- Focused official-source and tracker regression suite: 21 tests passed
- Expo lint: passed
- Backend health endpoint: HTTP 200
- NewsTracker and NSECollector schedulers: running after restart
- Dynamic NSE downloads remain explicitly blocked until official routes are validated

## Delivery note

The current collector implementation records raw response bytes, retrieval timestamp, checksum, parser version, source URL, freshness/error status, and normalized page/table payloads. It does not claim structured exchange data when a page is CAPTCHA-protected, dynamically rendered, or lacks a validated machine-readable endpoint.

- [x] Add stock-specific news feed filtering for any selected symbol
- [x] Score every verified article with transparent impact factors and sort high-to-low
- [x] Show article source, publication time, impact score, and unavailable/provider states without fabricated values
- [x] Add regression coverage for symbol filtering, scoring order, deduplication, and missing data

- [x] Add tappable news article detail view
- [x] Explain impact score components and catalyst/sentiment evidence
- [x] Provide safe direct link to the original verified source
- [x] Add regression and visual coverage for article-detail navigation and source-link states

- [x] Validate and correct the Google News RSS collector URL construction
- [x] Parse Google News RSS headlines, links, publication dates, and source names safely
- [x] Integrate Google News RSS as an optional server-side news provider without API-key assumptions
- [x] Preserve deduplication, impact scoring, provenance, timeout, and provider-failure behavior
- [x] Add deterministic parser and failure regression tests

- [ ] Define an evidence-based self-improvement and research-memory architecture
- [x] Expand verified stock coverage across the available A–Z NSE/BSE universe
- [x] Add low-latency ingestion and freshness telemetry without bypassing provider limits
- [x] Add institutional, mutual-fund, FII/DII, bulk, and block positioning where verified data exists
- [ ] Add weekly, monthly, quarterly, and multi-year news-to-price analysis
- [ ] Add explainable recommendations with confidence, source citations, and unavailable states
- [ ] Add monitoring for coverage, latency, stale data, and provider failures

- [x] Audit all app screens, feature routes, buttons, and navigation paths
- [x] Audit backend procedures, provider fallbacks, persistence, and provenance boundaries
- [x] Run an independent architecture/debug review and capture findings
- [x] Build and run a broad deterministic regression matrix
- [x] Fix confirmed bugs, incomplete states, and unsupported data claims
- [x] Verify fundamental-analysis and research scorecards use verified data or explicit unavailable states
- [x] Verify news scoring, deduplication, stale fallback, source links, and alert behavior
- [x] Verify mobile/web visual, accessibility, latency, and error states
- [x] Produce an audit report with remaining provider-dependent limitations

- [x] Add global-to-India macro and sector relevance taxonomy
- [x] Map worldwide articles to Indian symbols, sectors, and market themes without overclaiming
- [x] Add explainable Indian-equity relevance score and matched evidence
- [x] Preserve source URL, publisher, publication time, provider, deduplication, and failure states
- [x] Add regression coverage for relevance matching, false-positive rejection, and provider outages

- [x] Add India Stock MCP as a read-only normalized research provider
- [x] Preserve provider source, freshness, delays, rate-limit failures, and unavailable states
- [x] Prepare Dhan MCP authentication and account-data connector with trading disabled by default
- [x] Add provider capability and safety-state tests
- [ ] Connect verified provider fields to research and market-data views without fabricating values

- [x] Expand news polling from the default symbol list to the verified NSE equity universe
- [x] Add bounded batches, symbol prioritization, provider quotas, and coverage telemetry
- [x] Preserve relevance filtering, impact ranking, deduplication, provenance, and stale states across the expanded universe
- [x] Add A–Z coverage regression tests and verify mobile coverage/status states

- [x] Audit end-to-end analysis, news, scraping, connectivity, stock-universe, and mobile workflows
- [x] Run live health, scheduler, database, provider, MCP, official-source, and NSE-universe checks
- [x] Exercise A–Z batching, news scoring, relevance, deduplication, stale fallback, search, filters, and article detail flows
- [x] Capture confirmed failures separately from provider-dependent limitations and fix actionable bugs
- [x] Save a workflow-audit report with final pass, degraded, and unavailable states

- [x] Make database health validate a real lightweight query, not only an initialized handle
- [x] Add news-tracker backpressure with a per-poll article cap and bounded extraction work
- [x] Replace the hardcoded notification badge with truthful live state or remove the count
- [x] Label global market-context news distinctly from company-specific evidence
- [x] Add regression coverage for health queryability, poll caps, and degraded provider states

- [ ] Enable and validate Dhan MCP read-only connectivity while keeping trading disabled
- [ ] Resolve the rejected GNews credential or explicitly disable and surface its provider state
- [ ] Build an administrative collector-health dashboard with freshness, errors, and blocked-route status
- [ ] Add regression coverage for Dhan safety, GNews rejection handling, and dashboard data states


## Inherited session continuation — production upgrades

- [x] Validate Dhan MCP read-only connectivity in the research surface
- [x] Surface Dhan quote and options-data availability without enabling trading actions
- [x] Mark rejected GNews credentials as unavailable instead of configured
- [x] Add provider health and error details to operational status
- [x] Build collector-health administration dashboard with freshness, errors, blocked routes, and manual run controls
- [x] Add deterministic regression tests for Dhan status, GNews rejection, and dashboard data shaping
- [x] Run TypeScript, tests, lint, build, backend health, and responsive preview verification


## Regression reported 2026-08-17

- [x] Reproduce and fix Multibagger Screener search/analysis failure shown for TATASTBLSL
- [x] Verify partial and exact stock search results render correctly in the screener
- [x] Verify Analyze uses the selected/typed symbol and returns a clear live-data or unavailable state
- [x] Add regression tests for the failing screener request and error-state rendering
- [x] Run TypeScript, tests, lint, backend health, and responsive preview verification


## Fundamental analysis expansion requested 2026-08-17

- [x] Add Recent Searches below the screener input with one-tap re-analysis
- [x] Implement primary, secondary, and web-fallback fundamental data retrieval with provenance
- [x] Validate partial metrics and derive transparent estimates when inputs are missing
- [x] Detect ticker changes, mergers, and delistings with safe parent-entity redirects
- [x] Always render a complete five-category numerical score out of 100
- [x] Add verdict, key risks, and fair-value estimate outputs with Estimated badges
- [x] Remove blocking Awaiting verified financial data states from all stock-analysis paths
- [x] Add edge-case tests for empty providers, incomplete metrics, obsolete tickers, and recent searches
- [x] Run TypeScript, tests, lint, backend health, and responsive preview verification


## Historical trend charts requested 2026-08-17

- [x] Extend fundamental-analysis data with source-aware revenue, EPS, and cash-flow history
- [x] Add transparent historical-series fallback and estimated-point labeling
- [x] Render mobile-friendly revenue, EPS, and cash-flow trend charts in the screener
- [x] Add regression tests for trend series normalization and missing-history states
- [x] Run TypeScript, tests, lint, backend health, and responsive preview verification


## Screener.in and Skillnet.in benchmark expansion requested 2026-08-17

- [x] Research publicly verifiable Screener.in capabilities and source boundaries
- [x] Research publicly verifiable Skillnet.in capabilities and source boundaries
- [x] Save a benchmark matrix comparing current product coverage and gaps
- [x] Prioritize advanced buildable capabilities without fabricating unavailable data
- [x] Implement the prioritized screening, peer, valuation, filing, and workflow improvements
- [x] Add regression tests for the benchmark-driven features and provenance rules
- [x] Run TypeScript, tests, lint, backend health, and responsive preview verification


## Additional provider integration requested 2026-08-17

- [ ] Identify the intended “Tiny Fish” provider and the additional market/crypto platforms
- [ ] Inspect current connector configuration and preserve existing read-only boundaries
- [ ] Research API capabilities, rate limits, licensing, and provenance requirements
- [ ] Add provider adapters with normalized quotes, fundamentals, crypto, and status contracts
- [ ] Add conflict resolution and source/freshness labels when providers disagree
- [ ] Wire verified provider data into relevant research views without hiding unavailable states
- [ ] Add integration regression tests and live smoke checks for configured providers
- [x] Run TypeScript, tests, lint, backend health, and responsive preview verification


## Firecrawl and TinyFish clarified scope 2026-08-17

- [x] Confirm Firecrawl connector availability and tool capabilities
- [x] Confirm TinyFish optional authentication/credit boundary without blocking the app
- [x] Add a unified optional web-research provider status contract
- [x] Wire Firecrawl and TinyFish availability into operational/research views
- [x] Preserve official-source priority and show provider provenance/freshness
- [x] Add regression tests for configured, unavailable, rejected, and unconfigured states
- [x] Run TypeScript, tests, lint, backend health, and responsive preview verification


## Parallel provider orchestration requested 2026-08-17

- [x] Inventory all configured API and MCP data providers for parallel fan-out
- [x] Implement bounded concurrent provider requests with per-provider timeout and isolation
- [x] Normalize and merge parallel results with provenance, freshness, and conflict metadata
- [x] Wire aggregate parallel responses into research views and operational telemetry
- [x] Add regression tests for success, timeout, rejection, conflict, and partial-response cases
- [x] Run TypeScript, tests, lint, backend health, and responsive preview verification


## Indian Stock Market API and full-app audit requested 2026-08-17

- [x] Verify the Indian Stock Market API repository’s actual endpoints, authentication, and response shapes
- [x] Integrate Indian API live quote and fundamental fields into the parallel provider layer
- [x] Ensure Live-page search autocomplete and exact-symbol submit work for broad A–Z coverage
- [x] Reduce Analyze wait time with parallel provider fan-out and fast partial rendering
- [x] Ensure analysis shows profit, revenue, EPS, cash flow, debt, valuation, risks, fair value, and source freshness
- [x] Audit all primary tabs, controls, navigation, search boxes, filters, links, and detail flows
- [x] Add regression tests for search, analysis, parallel provider behavior, and failure isolation
- [x] Run TypeScript, tests, lint, backend health, live smoke checks, and responsive preview verification


## Provider status card requested 2026-08-17

- [x] Add runtime latency, last-success, current-state, and latest-error fields for each provider
- [x] Expose provider telemetry through a typed status procedure
- [x] Render provider status cards in the operational dashboard and relevant research surface
- [x] Add deterministic tests for success, failure, unavailable, and never-run providers
- [x] Run TypeScript, tests, lint, backend health, and responsive preview verification


## Deep fundamental analysis requested 2026-08-17

- [x] Make operating cash flow and free cash flow first-class scoring inputs
- [x] Add qualitative moat and business-model assessment with provenance/estimated labels
- [x] Add management, promoter, governance, solvency, liquidity, and interest-coverage metrics
- [x] Add multi-year profitability, margin, growth, EPS, and valuation analysis
- [x] Add conservative DCF/intrinsic-value calculations with explicit assumptions
- [x] Update the UI to show five-pillar deep-analysis evidence and cash-flow warnings
- [x] Add regression tests for cash-flow scoring, missing inputs, and DCF edge cases
- [x] Run TypeScript, tests, lint, backend health, live smoke checks, and responsive preview verification


## Institutional research framework from attachment 2026-08-17

- [x] Map the attached 100-point score weights to the existing five-pillar model without double-counting inputs
- [x] Add source-aware business quality, moat, management, governance, and qualitative evidence fields
- [x] Add five-year financial, balance-sheet, cash-flow, valuation, and peer-comparison outputs where data exists
- [x] Add explicit catalysts, red flags, bear-case risks, bull/base/bear scenarios, and investment-view labels
- [x] Add confidence score, data freshness, source hierarchy, and calculation explanations
- [x] Render the institutional research report in the analysis UI without inventing unavailable values
- [x] Add regression tests for score weights, stale/missing data, scenarios, and valuation comparison
- [x] Run TypeScript, tests, lint, backend health, live smoke checks, and responsive preview verification


## Five-stock institutional report test and exports 2026-08-17

- [x] Run separate reports for all six explicitly named stocks: Tata Motors, Tata Power, Adani Enterprises, Adani Ports, Reliance Industries, and Jio Financial Services (JIOFIN)
- [x] Ensure each report includes business model, plans/catalysts, future outlook, earnings, profitability, solvency, cash flow, valuation, risks, scenarios, score, confidence, freshness, and provenance
- [x] Generate one separate report file per stock; never combine the six reports into one file
- [x] Add report export as a readable file and a PDF-capable app entry point
- [x] Validate that exported reports preserve unavailable/estimated labels and do not invent facts
- [x] Run six-stock regression, TypeScript, lint, build, and responsive UI checks


## Export verification for stocks and crypto 2026-08-17

- [x] Test individual Markdown and PDF export files for every generated stock report
- [x] Verify each downloaded file has the matching symbol, complete sections, and readable PDF text
- [x] Inventory available crypto report/export support and symbols
- [x] Do not create crypto reports unless the platform has verified crypto fundamentals and provenance
- [x] Deliver individual stock files and a truthful crypto availability result


## Worldwide equity coverage expansion 2026-08-17

- [x] Research free global equity symbol, quote, fundamentals, filings, and news sources with license and rate-limit boundaries
- [x] Preserve India-first routing while adding global exchange, country, currency, timezone, and source provenance fields
- [x] Add worldwide symbol search and exact-symbol support without breaking NSE/BSE search
- [x] Add bounded parallel global provider fan-out with failure isolation, freshness, and unavailable states
- [x] Extend fundamental reports and separate exports to global equities with local currency and source dates
- [x] Test US, European, and Asian symbols plus invalid symbols, provider outage, currency, and no-fundamentals cases
- [x] Verify TypeScript, tests, lint, build, backend health, and responsive UI before checkpoint


## Live Events archive and Special Events 2026-08-17

- [x] Show the full available A–Z news archive from older historical items through the newest verified item
- [x] Add explicit date ordering controls for newest-first and oldest-first archive browsing
- [x] Add impact ordering from small-to-large and large-to-small while preserving impact scores
- [x] Add a Special Events view for earnings, contracts, partnerships, launches, approvals, upgrades, buybacks, insider activity, expansions, and other high-impact events
- [x] Keep source dates, provider freshness, stale-data labeling, and unavailable states transparent
- [x] Test archive filters, stock search, special-event classification, ordering, and responsive Live Events UI


## Comprehensive platform audit 2026-08-17

- [x] Audit all app routes, navigation targets, buttons, searches, filters, forms, and export actions
- [x] Check backend health, database queryability, schedulers, provider telemetry, MCP connectivity, web scraping, and source provenance
- [x] Exercise Indian, global, invalid, stale, partial, and provider-outage data paths
- [x] Verify Live Events archive, Special Events, ordering, news detail, timeline, graph, flows, sectors, screener, admin, and support flows
- [x] Verify separate Markdown/PDF research exports and file integrity
- [x] Repair actionable defects and add deterministic regression tests
- [x] Produce a comprehensive audit report with confirmed limitations and final quality-gate results


## News archive sentiment filter 2026-08-17

- [x] Add All, Positive, Neutral, and Negative sentiment filters to the historical archive
- [x] Show the verified sentiment label and score context on each archive headline
- [x] Preserve date ordering, impact ordering, Special Events scope, stock relevance, and provenance states
- [x] Add deterministic tests for sentiment filtering and combined filter behavior
- [x] Run TypeScript, tests, lint, build, health, and responsive archive checks


## Multi-asset news lookup and refresh 2026-08-17

- [x] Reproduce the failure where changing the searched stock does not refresh its related news
- [x] Trace cache keys, query invalidation, provider date windows, and symbol normalization for Indian and global equities
- [x] Add symbol-aware refresh and provider fan-out so new searches request current news for the selected asset
- [x] Add verified crypto-news routing using available free/connected providers, with explicit unsupported states where news is unavailable
- [x] Show last-refresh time, current request state, stale-data warnings, and manual refresh feedback in the UI
- [x] Add deterministic tests for symbol changes, refresh, stale cache, provider failures, and crypto/stock routing
- [x] Run TypeScript, tests, lint, build, health, live smoke checks, and responsive UI verification


## Financial-analysis reasoning framework 2026-08-17

- [x] Map source hierarchy and financial-analysis workflow rules into the existing research engine
- [x] Add period-aware evidence, source dates, reported/derived/estimated basis, and confidence reasoning
- [x] Add structured research logic for fundamentals, valuation, technicals, news, macro, filings, IR, and crypto
- [x] Add explicit catalyst, risk, contradiction, scenario, and investment-view reasoning outputs
- [x] Render calculation explanations and research audit trail in reports and analysis UI
- [x] Add deterministic tests for source routing, latest-price rules, period discipline, stale data, and unsupported fields
- [x] Run TypeScript, tests, lint, build, health, smoke checks, and responsive UI verification


## Detailed Typst PDF report 2026-08-17

- [x] Build a detailed PDF report from verified platform analysis rather than invented or mock data
- [x] Include fundamentals, valuation, scenarios, catalysts, risks, research logic, evidence gaps, source hierarchy, freshness, and disclaimers
- [x] Compile with Typst, verify the PDF deterministically, and visually inspect representative pages
- [x] Deliver the downloadable PDF report


## Deep stock-analysis workflow 2026-08-17

- [x] Map company profile, technical, fundamental, ownership, filing, and valuation capabilities into the global analysis contract
- [x] Add source-aware market context, technical signals, ownership/insider evidence, filing links, and analyst/valuation context where verified
- [x] Add deep-analysis synthesis with explicit facts, estimates, gaps, catalysts, risks, and conclusion logic
- [x] Render the deep stock-analysis sections in the screener and exported reports
- [x] Add deterministic tests for routing, global symbols, technical/filing/ownership unavailable states, and multi-stock comparisons
- [x] Run TypeScript, tests, lint, build, health, live smoke checks, and responsive UI verification


## SimilarWeb-informed platform enhancement 2026-08-17

- [x] Assess comparable research-platform discovery, engagement, retention, and coverage opportunities without copying proprietary data
- [x] Define privacy-safe product analytics events for search, analysis, news reading, watchlist, alerts, exports, and return usage
- [x] Add research-usage and coverage health summaries that help users find valuable stocks, sectors, events, and reports
- [x] Improve onboarding, discovery, saved research, watchlists, and return-to-research flows based on measurable user intent
- [x] Add data-quality and provider-coverage insights where they improve trust and product engagement
- [x] Test analytics event integrity, discovery flows, research persistence, and responsive UI


## Strategic modernization and futuristic intelligence 2026-08-17

- [x] Audit current product, architecture, data, UX, performance, security, and trust gaps
- [x] Research modern financial-intelligence patterns and free/open data opportunities with licensing boundaries
- [x] Define a prioritized modernization roadmap with measurable product outcomes and explicit non-guarantees
- [x] Implement the highest-value futuristic intelligence improvements that fit the current app safely
- [x] Add deep regression, provenance, latency, failure-mode, security, and responsive checks
- [x] Produce a modernization report documenting implemented work, deferred work, and limitations


## Critical logic quality pass 2026-08-17

- [x] Audit critical search, refresh, archive, analysis, navigation, persistence, export, and provider-fallback logic
- [x] Repair high-impact correctness, stale-state, race-condition, empty-state, and provenance inconsistencies
- [x] Add deterministic regression tests for every repaired logic path
- [x] Run full quality gates, backend health, smoke checks, and responsive verification
- [x] Document confirmed limitations rather than masking unavailable data


## Quantitative equity library expansion 2026-08-17

- [ ] Map the attached valuation, profitability, solvency, cash-flow, growth, banking, ownership, technical, volatility, and manipulation-risk metrics to existing source coverage
- [ ] Add evidence-aware metric states: reported, derived, estimated, stale, unavailable, and not-applicable
- [ ] Implement the highest-confidence computable metrics without inventing missing accounting inputs
- [ ] Add sentence-level evidence graph links and company/peer comparison matrix support
- [ ] Add opt-in synced watchlists and configurable alert rules with cooldowns and provenance
- [ ] Render and export the expanded quantitative analysis in the research workspace and reports
- [ ] Add deterministic calculation, routing, alert, source, and global-symbol tests
- [ ] Run full quality gates, health, smoke, latency, and responsive UI checks

- [x] Research current public Indian equity data sources, endpoint coverage, licensing, and anti-bot constraints from verified repositories and official pages
- [x] Add production-ready Python implementations for Piotroski F-Score, Beneish M-Score, and Sloan Ratio with validation and sector caveats
- [x] Document a 4GB RAM architecture for scraping, normalized calculations, caching, and optional quantized local LLM inference
- [x] Document compliant raw-data fallbacks and primary-filing source hierarchy in a structured Markdown report
- [x] Verify formula code with deterministic unit tests and syntax checks
- [x] Deliver the attached research report with reference links and explicit unavailable/verification boundaries

- [x] Inventory every configured market-data, news, filing, scraping, and MCP provider without removing or replacing any source
- [x] Diagnose why non-working providers fail, including credentials, HTTP status, timeout, rate limit, schema, and scheduler causes
- [x] Ensure each provider runs independently in parallel with bounded concurrency and per-provider timeouts
- [x] Prevent one provider failure from cancelling or corrupting other provider results
- [x] Normalize partial provider responses with explicit source, freshness, latency, and unavailable/error states
- [x] Add provider-isolation regression tests and end-to-end smoke checks for all configured sources
- [x] Verify the application receives the maximum validated information available from all healthy providers

- [x] Add provider-wise circuit breaker state with error classification, failure thresholds, cooldown windows, and retry eligibility
- [x] Ensure circuit-open providers do not block or cancel healthy provider execution
- [x] Add per-provider Admin “Run now” server action with isolated execution and telemetry refresh
- [x] Store and expose a sanitized preview of each provider’s last successful payload
- [x] Add Admin UI controls for Run now, cooldown state, next retry time, and last payload preview
- [x] Add deterministic circuit-breaker, manual-run, payload-preview, and responsive UI regression coverage

- [x] Inspect existing LLM integration, model availability, backend routing, navigation, and local chat persistence
- [x] Define source-grounded market chatbot context for companies, stocks, sectors, news, fundamentals, and quantitative metrics
- [x] Add local/open-source LLM routing where supported with a safe server-side fallback and explicit unavailable states
- [x] Add chatbot API contract with concise answers, source references, freshness, uncertainty, and non-personalized financial-information boundaries
- [x] Build mobile chatbot screen with plain-English input, message history, loading, retry, and source cards
- [x] Add privacy-safe local chat history behavior and prevent API keys or sensitive provider payloads from reaching the client
- [x] Add deterministic chatbot tests and responsive UI verification

- [x] Audit the attached ADANIENT report for zero values, unavailable identity, weak source provenance, and sector-baseline substitutions
- [x] Fix Indian symbol-to-exchange/company identity resolution so ADANIENT routes to verified NSE/BSE and company records
- [x] Add company-specific filing and investor-relations extraction for annual reports, quarterly results, shareholding, debt, cash flow, related parties, and management outlook
- [x] Add robust current-price and historical-price fallback validation so ₹0.00 can never be rendered as a valid price
- [x] Normalize company-period financial statements and prevent sector-baseline estimates from replacing required company evidence
- [x] Add report quality gates that block professional export when critical fields are invalid and clearly separate verified, estimated, unavailable, and stale sections
- [x] Improve report layout and wording for professional institutional readability with source dates, coverage status, evidence gaps, and explicit next checks
- [x] Verify ADANIENT plus the previously tested Indian and global symbols through analysis and individual exports

- [x] Audit report completeness and scoring for a representative set of Indian, global, and sector-diverse stocks
- [x] Define universal report sections for identity, current price, employees, business model, current scope, future plans, financials, cash flow, ownership, valuation, catalysts, risks, news, evidence, and freshness
- [x] Add stock-agnostic company enrichment with employee estimates, business scope, future-plan evidence, management context, and explicit unavailable states
- [x] Add per-section and overall coverage scores plus transparent fundamental, quality, growth, valuation, risk, and evidence scores
- [x] Redesign Markdown/PDF report layout with executive summary, scorecards, charts, source badges, evidence gaps, and readable section hierarchy
- [x] Add manual news refresh behavior that updates the selected symbol and publishes only newly verified deduplicated articles
- [x] Verify automatic tracker polling continues publishing new verified news without requiring manual refresh
- [x] Add all-stock report, scoring, news-refresh, automatic-publication, and responsive UI regression coverage

- [x] Inspect existing financial history, valuation anchors, chart dependencies, and report renderers
- [x] Define source-aware chart data contracts with explicit unavailable and insufficient-history states
- [x] Add interactive historical revenue, EPS, operating/free cash flow, margin, and price-trend charts to the mobile analysis view
- [x] Add interactive valuation anchor and bull/base/bear scenario visualizations without treating current price as intrinsic value
- [x] Add chart-readable summaries and data tables to Markdown/PDF reports for non-interactive exports
- [x] Add deterministic chart transformation tests and responsive visual verification

- [x] Select ten real, diverse stocks covering Indian large-cap, Indian mid/small-cap, financials, infrastructure, technology, consumer, global equity, and a contrasting sector
- [x] Define acceptance criteria for five-pillar detail, ranking math, company context, employees, future plans, financials, cash flow, valuation, charts, news, provenance, and freshness
- [x] Generate ten separate Markdown and PDF reports through the Market Event Intelligence report pipeline
- [x] Audit every report for blank, contradictory, zero, fabricated, stale, or source-missing fields and layout defects
- [x] Repair any universal platform defect discovered during the ten-stock audit and regenerate affected reports
- [x] Validate platform branding and ensure reports identify Market Event Intelligence as the publishing platform, not Manus
- [x] Run final regression, PDF text checks, report-quality checks, and responsive UI verification

## PDF visual verification 2026-08-17

- [x] Render all ten generated PDF reports to page images for visual inspection
- [x] Check representative PDFs for clipping, broken tables, scorecard readability, chart/data-table layout, source links, and Market Event Intelligence branding
- [x] Repair and regenerate PDFs if any visual or content defect is found
- [x] Run final PDF text and page-count checks and show the verified result

## Direct PDF delivery 2026-08-17

- [x] Prepare direct downloadable attachments for all ten individual stock PDFs
- [x] Create a readable visual preview attachment and validate each delivered file opens
- [x] Deliver files directly instead of checkpoint-only links

## Evidence coverage improvement 2026-08-17

- [x] Inventory all remaining unavailable, estimated, stale, and weakly sourced report fields across the ten-stock audit
- [x] Map each gap to an authorized or publicly verifiable source and record source/period/provenance rules
- [x] Implement safe enrichment and fallback logic for high-value missing fields without fabricating data
- [x] Add regression coverage for new source mappings, fallback precedence, stale handling, and global/Indian edge cases
- [x] Regenerate individual reports and re-audit coverage, contradictions, zero values, and provenance
- [x] Update the platform report UI/export sections to surface newly recovered evidence and remaining gaps clearly

## AnalyzerX branding update 2026-08-17

- [x] Rename the app display name to AnalyzerX without changing its slug or package identifiers
- [x] Generate a minimalist two-color geometric vector AnalyzerX logo with no gradients, shadows, realism, or complex detail
- [x] Replace icon, splash, favicon, Android foreground, and related branding assets consistently
- [x] Update the app configuration logo URL and verify TypeScript, build, and preview branding

## Full-app reliability and news refresh 2026-08-17

- [x] Audit app routes, buttons, search, filters, analysis, reports, providers, scheduled jobs, and news refresh paths for failures
- [x] Inspect and document current provider retry, timeout, cooldown, stale, and manual-refresh behavior
- [x] Implement safe bounded retry and near-real-time news refresh without bypassing provider limits or causing request storms
- [x] Ensure the News screen has a working manual refresh action with loading, success, stale, and error feedback
- [x] Add regression coverage for refresh, retry, provider isolation, and duplicate-news protection
- [x] Run full TypeScript, test, lint, build, health, route, and responsive verification

## Newspaper-style news feed 2026-08-17

- [x] Design a newspaper-style wide headline feed that supports smooth horizontal swipe reading
- [x] Make every headline card tappable and open a complete verified article detail view
- [x] Preserve impact score, sentiment, catalyst, source, time, refresh, filters, and stale/provider states
- [x] Verify mobile portrait, desktop web, navigation, accessibility labels, and regression behavior

## Analyze financial analysis visibility 2026-08-17

- [x] Reproduce the Analyze → Research flow for selected Indian, global, bank, and crypto symbols
- [x] Trace navigation parameters, tRPC analysis responses, loading/error states, and Research rendering
- [x] Ensure complete financial analysis appears in Research with scorecard, pillars, charts, cash flow, valuation, risks, and provenance
- [x] Add regression coverage for selected-symbol analysis rendering and unavailable/error fallback states
- [x] Run end-to-end, TypeScript, test, lint, build, and responsive verification

## Institutional analysis framework enhancement 2026-08-17

- [x] Map the supplied 0–100 ten-category scoring model to existing AnalyzerX categories without removing current pillars or evidence logic
- [x] Add company identification, freshness, market-context, sector-aware valuation, and currency/ADR metadata where supported
- [x] Add five-year financial trend coverage and accounting-quality checks for margins, EPS, dilution, working capital, capex, buybacks, dividends, CFO/FCF conversion, debt, liquidity, and interest coverage
- [x] Add confirmed-versus-speculative catalysts, thesis-breaking risks, market/sentiment context, and management/capital-allocation evidence
- [x] Add Bull, Base, and Bear scenarios with probability-weighted valuation only when evidence supports it
- [x] Add exact final investment-intelligence outputs: score, rating, price, fair value, upside/downside, outlook, strengths, weaknesses, catalysts, risks, thesis conditions, confidence, freshness, and sources
- [x] Render the enhanced framework in Research and Markdown/PDF exports without fabricating unavailable metrics
- [x] Add regression coverage and run multi-market report, TypeScript, lint, build, and provenance checks

## Derivatives and multi-asset research signals 2026-08-17

- [x] Reproduce missing Adani derivatives data across option-chain provider, normalization, route, and UI states
- [x] Identify an authorized, source-attributed derivatives input path with expiry, strike, call/put, OI, volume, IV, Greeks, PCR, max-pain, and timestamp fields
- [ ] Repair derivatives ingestion, fallback, stale handling, and rendering without inventing unavailable option values
- [x] Research and document a sector-momentum and multi-asset signal methodology for equities, crypto, and gold
- [x] Implement evidence-weighted opportunity signals with confidence, freshness, risk, invalidation, and non-personalized action labels
- [x] Add automatic sector and multi-asset suggestion surfaces to AnalyzerX
- [x] Add regression coverage and run full provider, analysis, build, and responsive verification

## Multibagger and multi-asset timing engine 2026-08-17

- [ ] Map Lynch, Buffett/Munger, CANSLIM, and Indian small-cap quality checks to source-backed AnalyzerX metrics
- [x] Research external market-data, filings, fundamentals, derivatives, crypto, gold, macro, and sentiment providers with licensing and access boundaries
- [x] Implement evidence-weighted multibagger candidate scoring with thesis, catalysts, risks, valuation, momentum, and anti-hype checks
- [x] Implement non-personalized market-timing research signals for equities, crypto, gold, and Nifty with confidence, freshness, risk, and invalidation conditions
- [x] Add source-backed dashboard and export outputs for strategy inputs and recommendation rationale
- [x] Add regression coverage and run full data, safety, build, export, and responsive verification

## CSK-inspired theme and security review 2026-08-17

- [x] Update AnalyzerX theme tokens to warm metallic gold, deep navy, charcoal, and restrained shimmer accents
- [x] Apply accessible contrast rules to CTA buttons, active states, cards, navigation, and primary branding surfaces
- [x] Verify the theme on mobile and desktop without flooding content areas with bright gradients
- [x] Run authorized defensive security checks for exposed secrets, unsafe input paths, route abuse, dependency/configuration issues, and security headers
- [x] Harden any discovered security issue without weakening existing provider and auth boundaries
- [x] Run contrast, TypeScript, tests, lint, production build, responsive preview, and security verification

## Post-theme data-flow regression repair 2026-08-17

- [x] Audit changed server middleware, CORS, tRPC routes, provider adapters, scheduled collectors, and client query flows
- [x] Reproduce failures for health, news, NSE, derivatives, fundamental analysis, research signals, exports, and navigation
- [x] Repair broken data paths without reverting restrictive CORS or security headers
- [x] Add regression tests for each reproduced data-flow failure and provider isolation behavior
- [x] Run full TypeScript, tests, lint, build, health, CORS, provider, and responsive verification

## Production deployment link repair 2026-08-17

- [x] Diagnose why the published domain returns `Cannot GET /`
- [x] Repair production static web serving while preserving API routes
- [x] Verify the public root, app bundle, and API health on the published domain
- [x] Save a checkpoint only after the public link is confirmed working

## AnalyzerX product package and publish-readiness 2026-08-17

- [x] Audit the current product, screen inventory, routes, API contracts, provider coverage, and data gaps against the requested product definition
- [x] Create the AnalyzerX PRD with vision, users, core capabilities, non-goals, roadmap, and measurable success metrics
- [x] Create the detailed app-flow document mapping onboarding, every screen, user actions, and navigation paths
- [x] Create the UI/UX design brief covering palette, typography, spacing, components, accessibility, and interaction mood
- [x] Create the technical design covering architecture, stack, integrations, security, and end-to-end data flow
- [x] Create the backend database schema document covering tables, fields, relationships, indexes, and data types
- [x] Implement critical gaps identified by the product package without fabricating market data
- [x] Verify critical journeys, provider isolation, API contracts, build output, and production serving before checkpoint

## Market Flows and options data repair 2026-08-17

- [ ] Reproduce the Market Flows empty/data-source-unavailable path and identify whether the failure is UI, route, parser, or provider
- [ ] Reproduce the derivatives option-chain unavailable path and inspect Dhan/NSE authentication, contract mapping, expiry, and response normalization
- [ ] Repair Market Flows with verified aggregate and security-level data where available, source-aware fallback, refresh, filtering, and sorting
- [ ] Repair derivatives retrieval and UI states without fabricating option-chain values
- [ ] Add regression tests for flow and option-chain success, stale, unavailable, auth-required, and provider-failure states
- [ ] Run TypeScript, tests, lint, production build, API smoke, and responsive verification

## Dhan official contract validation 2026-08-17

- [ ] Validate the supplied Dhan sandbox base URL and official DhanHQ Python SDK against the current option-chain adapter
- [ ] Confirm live versus sandbox environment selection and required authentication headers
- [ ] Correct expiry-list and option-chain request/response normalization if the official contract differs
- [ ] Add deterministic tests for environment selection and auth-required behavior
- [ ] Re-run derivatives UI, API, build, and provider-isolation verification

## Angel One SmartAPI integration audit 2026-08-17

- [ ] Audit AnalyzerX for existing Angel One routes, secrets, callbacks, and provider contracts
- [ ] Confirm the actual production callback URL and static egress IP before registering SmartAPI
- [ ] Implement Angel One credentials through secure environment configuration only
- [ ] Add provider-isolated auth-required and unavailable states for Angel One data
- [ ] Verify no Angel One secrets or personal trading data are exposed in client code or logs

## Dhan connected-browser takeover retry 2026-08-17

- [ ] Generate a fresh consent session for the connected browser
- [ ] Open and verify the consent page before requesting takeover
- [ ] Complete OAuth in the same connected session without black-screen navigation
- [ ] Verify MCP binding and live expiry/option-chain access

## Dhan Connect button repair 2026-08-17

- [ ] Locate the Connect button and its handler across AnalyzerX screens and connector configuration
- [ ] Reproduce the no-op tap and inspect disabled, loading, navigation, and OAuth states
- [ ] Implement a responsive Connect action with visible feedback and safe OAuth handoff
- [ ] Verify web and mobile-sized button interaction and connector error states

## Dhan Connect versus Skip failure 2026-08-17

- [ ] Trace the external Connect and Skip control behavior and active Dhan connector state
- [ ] Reproduce why Connect is inert while Skip continues successfully
- [ ] Repair the Connect OAuth/connector handoff without changing Skip
- [ ] Verify visible feedback, callback completion, and Dhan authorization state

## SmartAPI exact registration values clarification 2026-08-17

- [ ] Determine the real AnalyzerX backend callback URL for Angel One Redirect URL
- [ ] Determine whether the current managed deployment has a fixed outbound public IP
- [ ] Provide exact SmartAPI form values only after callback reachability and IP suitability are verified

## Alternative live options-data providers 2026-08-17

- [ ] Research compliant alternatives to Angel One for live Indian option-chain data
- [ ] Compare Dhan, broker APIs, licensed vendors, official exchange feeds, latency, coverage, and deployment requirements
- [ ] Recommend a provider and map it to AnalyzerX’s derivatives adapter and fallback hierarchy
- [ ] Preserve truthful auth-required, stale, unavailable, and provider-error states

## Free live options-data source evaluation 2026-08-17

- [x] Research genuinely free or open-access Indian options data sources
- [x] Test API, WebSocket, Python, public-page, freshness, field coverage, and rate-limit behavior
- [x] Check compliance and redistribution constraints before recommending scraping or feed reuse
- [x] Define a free-tier fallback architecture that never presents stale data as live

## Free-provider failover and deep QA audit 2026-08-17

- [x] Audit existing providers, contracts, screens, tests, and current error logs
- [x] Implement viable free NSE/Python/reference options-data adapters with provenance and freshness controls
- [x] Add automatic provider failover for limits, 403, 429, timeouts, schema failures, and auth errors
- [x] Run deep QA across screens, buttons, routes, search, filters, exports, data flows, and production build
- [x] Repair reproduced defects and add regression coverage
- [x] Save an audited checkpoint with explicit external limitations

## Angel One SmartAPI optional fallback 2026-08-17

- [ ] Inspect official smartapi-python authentication and market-data contracts
- [ ] Map Angel One option-chain fields to AnalyzerX derivatives normalization
- [ ] Add secure Angel One credentials and auth-required provider state
- [ ] Implement Angel One as an isolated fallback after Dhan/free NSE sources
- [ ] Add regression tests for failover, invalid credentials, and normalized chain data
- [ ] Run full TypeScript, tests, lint, build, and derivatives UI verification

- [x] A-to-Z architecture, data-flow, provider, security, and QA audit completed
- [x] Repair Admin screen useMemo import and explicit authorization/error states
- [x] Preserve public read-only provider metadata while protecting admin telemetry and mutations
- [x] Add configurable permanent LLM failure cooldown with deterministic news fallback
- [x] Add regression coverage for permanent LLM quota/auth failure classification
- [x] Re-run TypeScript, lint, backend build, Expo web export, focused tests, and full test suite
- [x] Document 125 passing tests, 2 skipped tests, and 3 isolated external 429/403 provider failures
- [x] Document dependency audit gate: 142 advisories including 80 high and 3 critical
- [x] Write final AnalyzerX comprehensive audit report

## Final audit verification

- TypeScript check: passed after final patches
- Focused authorization/provider/derivatives/flows suite: 19 tests passed
- News tracker and authorization regression suite: 9 tests passed
- Full Vitest suite: 125 passed, 2 skipped; 3 external provider probes failed with HTTP 429/403
- Expo lint: passed
- Production backend build: passed
- Expo web export: passed with 24 static routes
- Remaining release gate: dependency remediation through an Expo-compatible upgrade matrix and production credential validation for Dhan/Angel One and rejected optional providers

- [x] Add privacy-aware multimodal AnalyzerX assistant for text, image, screenshot, and audio inputs
- [x] Add grounded worldwide market, crypto, gold, and forex Q&A with provenance-aware responses
- [x] Add safe execute_analyzer_x_action / execute_app_action contract for navigation and filters
- [x] Add assistant UI with concise guidance, upload, audio, loading, error, and action-confirmation states
- [x] Add assistant regression tests for multimodal validation, action allowlist, and fallback behavior
- [x] Upgrade stock and research report export to an advanced readable PDF template with scorecards, charts, evidence, sources, and risk disclosures
- [x] Add PDF template regression and visual verification for stock and non-stock research reports

- [x] Fix Market Flows period selection so Today, 3 Days, 1 Week, 1 Month, and Quarter-to-Date change the underlying values and labels
- [x] Add truthful range-specific aggregation/fallback states with period provenance and comparison basis
- [x] Fix Multibagger strategy selection to run a full available-universe screen and rank qualifying candidates
- [x] Show strategy score, matched criteria, failed criteria, evidence, freshness, and no-candidate states
- [x] Add regression tests for range changes and strategy ranking
- [x] Re-run TypeScript, lint, build, full tests, and responsive verification

- [x] Run 50 plain-English AnalyzerX chatbot questions across app guidance, personal/general, stocks, fundamentals, news, crypto, gold, forex, and troubleshooting
- [x] Measure chatbot response completion, grounding/provenance, latency, fallback, and action safety for every test
- [x] Fix any chatbot route, UI, input-validation, grounding, or deterministic-fallback issues found by the 50-question test
- [x] Add automated chatbot regression coverage for representative domains and empty/provider-failure states
- [x] Produce a detailed 50-question chatbot QA report and save a checkpoint

- [x] Verify google/gemma-4-E2B-it in the live model catalog and AnalyzerX runtime
- [x] Verify google/gemma-4-E4B-it in the live model catalog and AnalyzerX runtime
- [x] Run non-destructive invocation probes and record exact availability/errors
- [x] Patch model routing only if both models are live-compatible and supported — no routing patch applied because both IDs are absent from the live catalog
- [x] Add model-routing regression coverage and update integration documentation — verification report added; no unsupported routing introduced

- [x] Research official Gemma 4, LiteRT-LM, Google AI Edge, Android, and supplied Hugging Face checkpoint documentation
- [x] Determine official mobile model format, runtime, conversion, licensing, hardware, memory, storage, and Android requirements
- [x] Audit Expo SDK 54/native build constraints for a real on-device runtime
- [x] Implement only an officially supported Local AI runtime boundary; do not use mock or cloud masquerading
- [x] Add model registry, capability checks, download integrity, versioning, pause/resume, delete, and explicit cloud-fallback consent states if feasible
- [x] Add Local AI model-selection UI and no-cloud status messaging
- [x] Add native-compatible tests and a detailed implementation/limitation report

- [ ] Compile the Android LiteRT-LM bridge in an Android SDK environment
- [ ] Run an arm64 Android smoke test for E2B/E4B download, load, streaming, cancel, unload, and local-only chatbot inference
- [ ] Add an Expo config plugin to regenerate native LiteRT-LM files after a clean prebuild

- [x] Audit Local AI architecture and end-to-end Assistant workflow
- [x] Verify each catalogued LLM status: installability, runtime support, and native execution evidence
- [x] Verify model management and switching flow across download, load, unload, delete, and Assistant selection
- [x] Run software-test checks for TypeScript, lint, tests, Android prebuild, production build, and visual workflows
- [x] Document exact user instructions for managing and switching Local AI models

- [x] Add grounded-context chat contract for local inference
- [x] Route selected loaded Local AI model to native streaming chat generation
- [x] Add explicit local versus connected Assistant mode and safe fallback
- [x] Harden single-model switching, runtime status, and cancellation
- [x] Add local-chat routing and model-switching regression tests

- [x] Prepare Gemma E2B/E4B Android build and physical-device verification workflow
- [x] Integrate local screenshot and audio capability gates and processing path
- [x] Add truthful Qwen and LFM adapter boundaries with verified-runtime gating
- [x] Run full regression, build, prebuild, visual, and native-readiness checks for all three tracks

- [x] Research and add Google Gemma 3 1B with truthful artifact and runtime metadata
- [x] Connect Gemma 3 1B and all verified local models through the common Assistant routing contract
- [x] Add checksum-pinned model integrity metadata and GGUF/JNI preparation boundaries
- [x] Add Android arm64 verification workflow for Gemma and local runtimes
- [x] Add on-device inference performance and battery telemetry foundations
- [x] Run regression, build, prebuild, native-readiness, and visual verification for the expanded catalog

- [x] Prepare repeatable arm64 Android Gemma 3 and Gemma E2B/1B device smoke-test workflow
- [x] Add checksum-pinned Qwen and LFM GGUF artifact metadata
- [x] Add guarded llama.cpp Android JNI boundary for Qwen/LFM
- [x] Build Local AI telemetry dashboard with performance and battery summaries
- [x] Run full regression, build, prebuild, adapter, dashboard, and native-readiness verification

- [x] Add Local AI telemetry CSV export for offline analysis
- [x] Add configurable local telemetry retention controls and clear-data action
- [x] Attempt arm64 Android smoke test for Gemma 3 1B and Gemma 4 E2B
- [x] Compile and bundle libanalyzerx_llama.so for arm64 Android when native sources/toolchain are available
- [x] Run regression, build, prebuild, and visual verification for telemetry export and native attempts

- [x] Add telemetry date-range presets and custom date filtering
- [x] Export only the selected telemetry date range as CSV
- [x] Add encrypted local telemetry backup and restore controls
- [x] Retry arm64 Android smoke test and llama.cpp JNI build with available toolchain detection
- [x] Run regression, build, prebuild, and visual verification for date-filtered telemetry

- [x] Diagnose and fix the EAS Android Gradle build failure
- [x] Remove only the Lyro support-agent widget integration
- [x] Upgrade the Local AI model-management dashboard and Assistant connectivity
- [x] Run regression, build, prebuild, and visual verification for the requested fixes

- [x] Implement centralized premium dynamic theme registry and instant Appearance switching
- [x] Add Light, Dark, System, custom colors, and accessible theme tokens across the app
- [x] Add Appearance Theme Preview surface with component samples
- [x] Add organized sidebar navigation and Local AI model dropdown
- [x] Create AnalyzerX UI/UX design brief and navigation map
- [x] Verify data-source isolation, regression, build, accessibility, and visual behavior

- [x] Create the AnalyzerX product requirements document with vision, users, features, metrics, and roadmap
- [x] Create the complete screen-by-screen app flow and navigation map
- [x] Create the platform UI/UX design brief with palette, typography, spacing, components, and mood
- [x] Create the technical design with architecture, stack, integrations, and data flow
- [x] Create the backend database schema with tables, fields, relationships, and data types
- [x] Audit data-source aggregation, options, FII/DII, sector/sub-sector flows, Assistant routing, and Local AI state
- [x] Run comprehensive workflow, regression, build, export, visual, and provider-isolation verification

- [x] Remediate or document Indian API and TinyFish provider credential/cooldown states
- [x] Validate authorized sector-level FII/DII and mutual-fund source coverage
- [ ] Run Android arm64 EAS/native Local AI readiness and device verification
- [x] Repair and verify the premium PDF report generator template
- [x] Run end-to-end provider, native, PDF, regression, and build verification

- [x] Replace credential-only remediation with authorized public-source fallbacks and explicit provider cooldown documentation

## Attached multibagger thesis engine and report upgrade

- [x] Map the attached 17-part multibagger framework into AnalyzerX scoring and report contracts
- [x] Add authorized open-source enrichment catalog for business, ownership, accounting, catalysts, market behavior, and sector evidence
- [x] Add evidence-aware Multibagger Thesis Engine with 5x/10x mathematics, hard rejection flags, scenarios, invalidation, and confidence
- [x] Add AI research fallback disclosure and never fabricate missing answers
- [x] Upgrade beginner-readable individual PDFs with WHY/WHAT/WHEN/HOW/RISKS/VALUATION/PROBABILITY/INVALIDATION/CONFIDENCE sections
- [x] Run regression, source, PDF visual, and build verification for the attached framework

## Official downloadable files, filing evidence, and score-preservation follow-up

- [x] Validate and parse official NSE downloadable FII/FPI+DII records with schema and freshness guards
- [x] Validate and parse official NSDL sector-wise FPI downloadable records with periodic-source semantics
- [x] Validate and parse official AMFI portfolio-disclosure files with holdings-period and change-detection semantics
- [x] Add filing-derived TAM, customer-concentration, and management-guidance evidence fields with explicit unavailable states
- [x] Preserve legacy five-pillar institutional score as the primary report score and label multibagger thesis as a separate secondary score
- [ ] Run authenticated EAS, Android SDK/arm64, and native Local AI smoke-test gates — blocked: EAS not logged in; adb/Android SDK/NDK/CMake/arm64 device unavailable
- [x] Run parser, filing-evidence, score-contract, PDF, and full regression verification

## Smart Event Alerts and eligible-stock discovery follow-up

- [x] Define natural-language monitoring-rule, event-chain, eligibility, evidence, deduplication, and explainability contracts
- [x] Add Smart Event Alerts templates and normalized rule conditions for orders, partnerships, acquisitions, expansions, financing, ownership, and custom conditions
- [x] Add event-chain impact scoring, alert levels, evidence freshness, source attribution, and why-am-I-seeing-this explanations
- [ ] Add continuously updated Eligible Stocks discovery with eligible/potential/no-longer-eligible states and sorting — engine/UI ready; live event payload wiring remains
- [x] Add View Eligible Stocks navigation from every saved alert and preserve historical similar-event discovery
- [x] Add cross-source event deduplication and entity/relationship linking without fabricating matches
- [x] Add delivery-channel status boundaries for in-app, push, email, Telegram, WhatsApp, and digest modes
- [x] Run Smart Event Alerts workflow, engine, eligibility, deduplication, UI, provider-isolation, and full regression verification

## Free/public data-source expansion follow-up

- [x] Inventory uncovered AnalyzerX fields and current provider/source coverage
- [x] Research authoritative free/public sources across prices, fundamentals, filings, news, macro, derivatives, ownership, mutual funds, crypto, FX, commodities, and corporate events
- [x] Expand the source catalog with capability, cadence, licensing, authentication, rate-limit, and fallback metadata
- [x] Implement safe adapters for the highest-value uncovered free/public sources without bypassing CAPTCHA, WAF, robots, or licensing restrictions
- [x] Add parallel fallback orchestration with provenance, freshness, schema validation, cooldown, and unavailable states
- [x] Add provider/source health and regression coverage for the expanded data paths
- [x] Run full build, test, source-probe, and visual verification; document remaining gaps

## Live Smart Event Alerts wiring follow-up

- [x] Audit existing source collectors, event schemas, entity resolution, market-cap metrics, tracker scheduler, and alerts contracts
- [x] Define live event-ingestion, relationship-link, financial-significance, historical-window, eligibility-result, and re-evaluation contracts
- [x] Extract source-backed order, partnership, acquisition, expansion, financing, ownership, and government-event chains from verified filings, announcements, and news
- [x] Link customer/supplier entities and resolve exchange symbols without fabricating relationships
- [x] Compute market-cap bands, order value, revenue, order/revenue significance, sector, confidence, evidence timestamps, and exact matched conditions
- [x] Add historical 30/90/180-day backfill and continuous re-evaluation on new payloads
- [x] Persist eligible/potential/no-longer-eligible results and connect them to the existing Alerts UI without changing its approved design
- [x] Run real-source, historical-backfill, re-evaluation, deduplication, scoring, provider-isolation, UI, and full regression verification

## Smart Event Alerts filing/history/control follow-up

- [x] Audit current source-ingestion, collector runtime, database, notification, and Alerts UI contracts
- [x] Validate direct NSE, BSE, and company-IR filing paths and strict source/schema/retrieval contracts
- [x] Implement compliant filing ingestion and merge validated filing events with tracked-news Smart Event Alerts inputs
- [x] Add persistent alert-result history and newly-eligible detection
- [x] Add de-duplicated push and optional-channel notification delivery with truthful channel states
- [x] Add user-selectable 30/90/180-day windows and sort controls to Alerts UI
- [x] Run parser, ingestion, history, notification, UI, provider-isolation, build, and full regression verification

## Unified history, alert preferences, source validation, and performance follow-up

- [x] Add normalized unified history events for news, recommendations, alerts, searches, analyses, reports, and watchlist activity
- [x] Add dedicated in-app History screen with filters, pagination, source links, and local/server states
- [x] Add per-alert notification preferences, user defaults, quiet hours, suppression reasons, and digest boundaries — local preference controls and quiet-hours gate added; server digest delivery remains a follow-up
- [ ] Validate additional direct BSE and company-IR machine-readable payload schemas without bypassing access controls
- [ ] Add validated filing parsers and merge source-backed filing evidence into Smart Event Alerts
- [ ] Add history and notification delivery telemetry, idempotency, and authenticated data isolation — activity logging added; server-wide telemetry/isolation remains a follow-up
- [ ] Improve latency with bounded concurrency, cache/in-flight deduplication, paginated lists, and first-usable-data behavior — current work adds FlatList/local projection and existing query caching; dedicated p50/p95 telemetry remains a follow-up
- [x] Run history, preference, quiet-hours, parser, source, UI, performance, build, and full regression verification — 184 passed, 2 skipped; additional BSE/IR machine-readable schemas remain unverified

## Full AnalyzerX application review and release audit

- [ ] Inventory all screens, routes, server procedures, providers, database tables, schedulers, native bridges, and report paths
- [ ] Build a complete screen/action/navigation matrix and test loading, empty, stale, error, unauthorized, offline, and success states
- [ ] Audit every provider request, schema, provenance, freshness, timeout, retry, cooldown, fallback, and licensing boundary
- [ ] Trace representative Indian, global, crypto, FX/commodity, and incomplete-data workflows end to end
- [ ] Verify primary Institutional Five-Pillar scoring and secondary Multibagger Thesis separation across UI and reports
- [ ] Audit Assistant grounding, Local/Connected/Auto routing, multimodal behavior, model catalog, native bridge, and telemetry
- [ ] Review database ownership, auth, secrets, external URLs, uploads, notification destinations, validation, SSRF, and replay risks
- [ ] Measure or document latency, cache behavior, provider fan-out, polling, rendering, memory, and resilience risks
- [ ] Run full type, lint, build, export, regression, source-probe, migration, visual, and native readiness verification
- [ ] Produce the full audit report, prioritized remediation list, applied safe fixes, and release-gate status

## Full application review completion

- [x] Inventory all screens, routes, server procedures, providers, database tables, schedulers, native bridges, and report paths
- [x] Build a complete screen/action/navigation matrix and review loading, empty, stale, error, unauthorized, offline, and success states
- [x] Audit provider request, schema, provenance, freshness, timeout, retry, cooldown, fallback, and licensing boundaries
- [x] Trace representative Indian, global, crypto, FX/commodity, and incomplete-data workflows end to end
- [x] Verify primary Institutional Five-Pillar scoring and secondary Multibagger Thesis separation across UI and reports
- [x] Audit Assistant grounding, Local/Connected/Auto routing, multimodal behavior, model catalog, native bridge, and telemetry
- [x] Review database ownership, auth, secrets, external URLs, uploads, notification destinations, validation, SSRF, and replay risks
- [x] Review latency, cache behavior, provider fan-out, polling, rendering, memory, and resilience risks; document what cannot be measured here
- [x] Run final type, lint, build, export, regression, source-probe, migration, visual, and native readiness verification
- [x] Produce the full audit report, prioritized remediation list, applied safe fixes, and release-gate status

## Central data layer and UI feature mapping

- [x] Define typed dataset capability registry and required imported/stored/intelligence/UI dataset matrix
- [x] Define canonical lineage contract and reusable evidence metadata
- [ ] Add entity master and safe alias-resolution model without low-confidence silent merges
- [x] Add normalized filing/document read model and symbol-resolved filing queries
- [ ] Add normalized market/fundamental observation read models where source_records is insufficient
- [ ] Extend accessible NSE, NSDL, AMFI, BSE, company-IR, market, macro, and news ingestion through isolated validated adapters
- [ ] Add deterministic post-ingestion projections into events, relationships, alerts, search, screener, watchlists, and research evidence
- [x] Replace fixture-based company detail data with source-backed stock-profile composition
- [ ] Add unified news filters and metadata/lineage display
- [ ] Add unified corporate-filings screen and stock-profile filing sections
- [ ] Connect real imported event records to Smart Alerts and Eligible Stocks only
- [ ] Expand evidence-aware Screener/Multibagger parameters from normalized data
- [ ] Connect authenticated watchlists to filings, news, events, alerts, and material changes
- [ ] Expand platform-wide normalized search and grounded natural-language filters
- [x] Add reusable evidence/lineage UI and admin capability matrix
- [ ] Harden user ownership for watchlists, alert rules/results, push tokens, saved analyses, and report history
- [ ] Add adapter contracts, entity-resolution, ingestion-to-UI, and no-mock regression tests
- [ ] Run final type, lint, build, export, migration, provider, collector, report, and visual verification
- [ ] Produce final dataset capability matrix and implementation audit

## Autonomous event-driven stock recommendations

- [x] Define autonomous event candidate, relationship, score, recommendation, and lifecycle contracts
- [x] Build autonomous discovery independent of user-created monitoring rules
- [x] Add cross-source event deduplication and merged evidence sets
- [x] Add positive, negative, and mixed event directions with evidence gates
- [ ] Add direct and evidence-supported indirect relationship detection
- [x] Add versioned separate impact/confidence scoring and factor breakdowns
- [x] Persist user-independent recommendations and lifecycle/status transitions
- [x] Add bounded tracker-cycle evaluation and idempotent high-confidence notifications
- [x] Make Alerts autonomous-first while preserving custom monitoring templates
- [x] Add recommendation detail/evidence/factor/relationship analysis navigation
- [ ] Add recommendation-aware relationship graph integration
- [x] Add ranking policy, freshness, contradiction, and no-fabrication safety gates
- [x] Add autonomous recommendation contract, lifecycle, dedupe, and UI regression tests
- [x] Run full type, lint, build, export, migration, provider, regression, and visual verification
- [x] Produce autonomous recommendation coverage and release audit

## Durable entities, observations, projections, and filing unification

- [x] Map current symbol aliases, company/timeline/storyline/event models, filing records, watchlists, alerts, and ownership boundaries
- [x] Add durable entity master with aliases, exchange identifiers, resolution status, and lineage
- [x] Add normalized market observation table with quote/OHLC/volume/source/freshness fields
- [x] Add normalized fundamental observation table with metric/value/period/unit/source/confidence fields
- [x] Add persisted event projection table with entity links, storyline keys, event type, source evidence, and lifecycle
- [x] Add validated NSE/BSE/company-IR filing adapter contracts and source-specific parsers
- [x] Project filing records into unified News, Filings, Search, Alerts, Company Timeline, Storylines, and Watchlists
- [x] Replace remaining fixture timeline/storyline reads with persisted projections and truthful empty states
- [x] Add entity-resolution, observation, projection, filing, ownership, and cross-feature regression tests
- [x] Run migrations, type/lint/build/export, provider/parser, full regression, and visual verification
- [x] Produce the data-layer expansion audit and release checkpoint

## Authenticated ownership, multi-hop graph, and validated filing collectors

- [x] Define ownership and migration contracts for watchlists, saved screens, alerts, push tokens, notification preferences, and saved research
- [x] Add user-owned persistence tables and additive migrations
- [x] Add protected CRUD, sync, merge, and revocation helpers/procedures
- [x] Harden push-token registration and delivery ownership
- [x] Add local-to-server sync and logout/clear-state behavior
- [x] Add bounded multi-hop relationship projection contracts and persistence
- [x] Replace fixture-driven Graph nodes, edges, and chain content with source-backed projections
- [x] Add graph evidence, confidence, contradiction, stale, and empty states
- [x] Validate BSE and company-IR machine-readable endpoint candidates without bypassing controls
- [ ] Add source-specific BSE/company-IR collectors only for validated endpoints
- [x] Connect validated filings to News, Filings, Search, Alerts, Timeline, Storylines, Graph, and Watchlists
- [x] Add ownership, revocation, graph, collector, parser, and cross-feature regression tests
- [x] Run migration, type/lint/build/export, full regression, provider, and visual verification
- [x] Produce the ownership/graph/collector audit and release checkpoint

## BSE validation, local sync, and graph evidence clustering

- [x] Validate documented authorized BSE machine-readable endpoint candidates and record the result
- [ ] Enable a BSE collector only if authorization, documentation, schema, and access tests pass
- [x] Add authenticated local-to-server migration/sync for existing watchlist items
- [x] Add authenticated local-to-server migration/sync for alert state and notification preferences
- [x] Add idempotent sync conflict rules, revocation propagation, and logout/clear-state behavior
- [x] Detect contradictory event evidence across source records and preserve both sides
- [x] Cluster multi-source graph edges by relationship/entity/event key with evidence counts
- [x] Add contradiction and multi-source cluster states to Graph UI
- [x] Connect validated BSE records and synced ownership data across relevant screens
- [x] Add focused BSE, sync, contradiction, clustering, ownership, and cross-feature tests
- [x] Run full migration, security, provider, regression, build, export, and visual verification
- [x] Produce the final audit and release checkpoint

## BSE gating, sync controls, and graph filters

- [x] Reconfirm BSE adapter remains safely disabled without endpoint, schema, and credentials
- [x] Add visible Account sync status, last attempt, ownership state, and retry control
- [x] Add sync conflict summary and explicit keep-local/keep-server/merge actions
- [x] Add sync failure and revocation messaging without deleting local data
- [x] Add Graph contradiction-severity filter
- [x] Add Graph minimum-source-count filter
- [x] Preserve bounded hop, confidence, lineage, and truthful empty states
- [x] Add focused sync-control and graph-filter tests
- [x] Run full verification and visual QA
- [x] Produce the final audit and release checkpoint

## Sector constituent drill-down and sortable stock intelligence

- [x] Inspect sector screen, sector opportunity data, flow contracts, and company navigation
- [x] Define normalized sector constituent row contract with source, freshness, confidence, and unavailable fields
- [x] Add sector constituent aggregation for stocks, FII, DII, mutual-fund, flow, score, valuation, and market fields
- [x] Add sortable sector detail query with high-to-low and low-to-high controls
- [x] Add sector detail screen or route with stock list, summaries, filters, and stock-profile navigation
- [x] Preserve truthful unavailable states for unsupported sector-level metrics
- [x] Add sector constituent and sorting regression tests
- [x] Run full type, lint, build, export, regression, and visual verification
- [x] Produce the sector intelligence audit and release checkpoint


## Native tool marketplace and local creator runtime

- [ ] Audit existing Local AI, navigation, provider registry, auth, schema, telemetry, and release boundaries for additive integration points
- [ ] Define typed marketplace tool, version, artifact, compatibility, installation, local-host, and job contracts
- [ ] Add signed/approved marketplace catalog metadata and truthful compatibility states
- [ ] Add authenticated marketplace catalog and installation persistence schema/API without changing financial data sources
- [ ] Add local-host protocol contract for health, hardware profile, install, queue, job, output, and telemetry operations
- [ ] Add deterministic hardware capability scoring for CPU, CUDA, ROCm, MPS, and unsupported states
- [ ] Add native Python runtime scaffolding for image, music, and video adapter contracts
- [ ] Add durable local queue and worker lifecycle contract with cancellation, retry, and crash isolation
- [ ] Add Marketplace navigation, browse, detail, installed-tools, compatibility, and queue UI
- [ ] Add Local AI dashboard model/tool selection integration with marketplace-managed installs
- [ ] Add security validation for manifests, checksums, paths, permissions, and install audit events
- [ ] Add Windows host packaging scaffold and document the real Windows build/signing gate
- [ ] Add unit, contract, loopback, and UI regression coverage for the marketplace and host protocol
- [ ] Run TypeScript, lint, production build, Expo export, tests, and visual QA
- [ ] Save a release checkpoint with truthful platform and hardware limitations


## Finance-only marketplace scope correction

- [x] Remove generic image, music, video, and creator-studio catalog entries and copy from the AnalyzerX marketplace scope
- [x] Define finance-specific tool categories for data, research, filings, news, screening, portfolio, alerts, charts, reports, and local assistant capabilities
- [x] Add hardware-aware recommendations for finance tools without implying unsupported GPU/model execution
- [x] Add finance-specific local-host contracts for market parsing, report extraction, ranking, grounding, and offline assistant tasks
- [x] Update marketplace UI copy and navigation to stock-market intelligence tools only
- [x] Add regression coverage proving creator-studio tools are absent and finance tools are recommended by capability


## Android finance-tool marketplace support

- [x] Add Android-compatible finance tool catalog entries for data, technical analysis, filings, sentiment, local assistant, telemetry, and report workflows
- [x] Add Android arm64 hardware capability and memory/storage recommendation states to Marketplace
- [x] Connect Android Local AI model policy and native-runtime readiness to marketplace recommendations
- [x] Add Android-specific install, unavailable, pending-runtime, and host-pairing UI states
- [x] Add Android marketplace compatibility and catalog regression tests
- [x] Document Android SDK/NDK, arm64 device, and EAS build gates without claiming untested native execution


## Full QA, security, and Android native validation

- [x] Inventory current QA scripts, native bridges, provider boundaries, auth ownership, and release blockers
- [x] Execute the LiteRT Android arm64 smoke gate and record device/SDK status
- [x] Execute the llama.cpp Android JNI build gate and record NDK/CMake/source status
- [x] Run the complete TypeScript, lint, build, export, and test suites
- [x] Exercise major screens, navigation paths, search, filters, reports, alerts, marketplace, Local AI, and account flows
- [x] Audit authentication, authorization, input validation, secrets, CORS, path handling, subprocess boundaries, and data leakage
- [x] Audit provider circuit breakers, cooldowns, retries, timeouts, stale states, and parallel-failure isolation
- [x] Patch every reproducible defect and add regression coverage
- [x] Produce a detailed QA/security findings report with blocked hardware gates separated from code defects
- [ ] Save a verified remediation checkpoint


## Approved AnalyzerX improvement roadmap execution

- [x] Add source-backed Data Truth Center route with capability, cadence, access, evidence, freshness, consumer, and limitation metadata
- [x] Add Data Truth Center navigation from Account
- [x] Verify Data Truth Center TypeScript, focused governance tests, lint, and mobile visual rendering
- [ ] Add canonical score contract and completeness score across fundamental, thesis, event, and confidence outputs
- [ ] Add provider freshness, latency, payload hash, schema-drift, replay, and dead-letter observability
- [ ] Correct and expand Market Flows range recomputation, comparisons, and supported data-grain labels
- [ ] Upgrade Company Intelligence, Screener, Multibagger, News, Alerts, Reports, and Research Workspace workflows
- [ ] Complete grounded assistant evidence mode, model routing, offline queue, and Android native validation
- [ ] Add signed one-click finance marketplace installation, sandbox permissions, rollback, and recovery
- [ ] Run full roadmap verification and save a release checkpoint


## Country-aware global market expansion

- [x] Add canonical India-first market registry with country, region, currency, timezone, exchanges, ticker examples, asset classes, coverage, and limitations
- [x] Add persisted shared MarketProvider for guest market selection
- [x] Add Market & Country Settings screen with search, coverage labels, currency/timezone preview, and asset scope
- [x] Add Market & Country navigation from Account
- [x] Add Data Truth Center filters for country scope, status, freshness SLA, and confidence policy
- [x] Add deterministic Data Truth Center sorting by name, freshness direction, and status severity
- [x] Add market-registry regression tests and pass TypeScript, focused tests, lint, and Expo web export
- [ ] Add authenticated server-side market preference sync and conflict handling
- [ ] Add market context to entity resolution, news, analysis, flows, screener, alerts, reports, and assistant retrieval
- [ ] Add country-scoped source capability registry and regional provider orchestration
- [ ] Validate US, UK, Canada, Australia, Japan, Singapore, Hong Kong, Germany, and France source adapters before promoting coverage
- [ ] Add country-aware global market badge and cross-market opt-in UX across core screens
- [ ] Add regional freshness, schema-drift, replay, dead-letter, and provider-health dashboards


## Country selector discoverability fix

- [x] Add a visible current-country market switcher to the primary Live/Events experience
- [x] Add a persistent market badge and direct navigation to Market & Country from core navigation
- [x] Verify country selection, persistence, and mobile presentation after the visibility fix


## Authenticated global-market milestone

- [x] Add authenticated server-side market preference persistence and deterministic guest/server conflict resolution
- [x] Wire selected-market context into Search, News, Analysis, Flows, Screener, Alerts, Reports, and Assistant retrieval/query contracts
- [x] Validate the US adapter and record source, schema, freshness, licensing, and failure-isolation outcome
- [x] Validate the UK adapter and record source, schema, freshness, licensing, and failure-isolation outcome
- [x] Validate the Canada adapter and record source, schema, freshness, licensing, and failure-isolation outcome
- [x] Validate the Australia adapter and record source, schema, freshness, licensing, and failure-isolation outcome
- [x] Validate the Japan adapter and record source, schema, freshness, licensing, and failure-isolation outcome
- [x] Validate the Singapore adapter and record source, schema, freshness, licensing, and failure-isolation outcome
- [x] Validate the Hong Kong adapter and record source, schema, freshness, licensing, and failure-isolation outcome
- [x] Validate Germany, France, and broader EU adapter boundaries without claiming a generic EU feed
- [x] Run sync, security, cross-market isolation, regression, and visual verification


## Regional market collectors and SEC EDGAR

- [x] Audit existing collector, source-lineage, entity-master, filing, cooldown, and market-scope contracts
- [x] Implement SEC EDGAR submissions collector with compliant User-Agent, timeout, retry, cooldown, and checksum metadata
- [x] Implement SEC EDGAR company facts/XBRL collector with normalized periods, units, taxonomy, and schema validation
- [x] Add SEC CIK/ticker/entity resolution with explicit unresolved states and no guessed mappings
- [x] Persist normalized US filings and facts into existing source-backed evidence and observation boundaries
- [x] Connect US filing evidence to Search, News, Alerts, Research, and Reports with market scope
- [x] Add SEC collector health, freshness, replay, schema-drift, and dead-letter observability
- [x] Add source-gated adapter contracts for UK, Canada, Australia, Japan, Singapore, Hong Kong, Germany, and France
- [x] Run one-by-one regional transport/schema probes and document ready, catalog-validated, access-gated, and blocked outcomes
- [x] Add regression tests for SEC parsing, rate compliance, identifier resolution, failure isolation, and cross-market scope
- [x] Run TypeScript, lint, build, export, focused/full tests, and visual verification
- [ ] Save a regional collector release checkpoint


## SEC scheduling, UK FCA, and filing details

- [x] Audit current SEC collector, scheduler, filing UI, and regional source contracts
- [x] Add SEC incremental polling state with last-seen accession and deterministic deduplication
- [x] Add scheduled SEC polling callback with bounded symbols, cooldowns, retries, and failure isolation
- [x] Add SEC filing detail procedure with form, date, symbol, and market-scope filters
- [x] Implement UK FCA disclosure adapter with validated schema fixture and exact issuer resolution
- [x] Persist UK FCA disclosures with source lineage, checksums, parser version, and freshness state
- [x] Add filing details UI with form filters, accession links, source evidence, and XBRL metric charts
- [ ] Improve incomplete-data handling across configured markets with provider/source readiness states
- [x] Add regression and live smoke tests for SEC polling, UK parsing, deduplication, UI filtering, and charts
- [x] Run TypeScript, lint, production build, Expo web export, focused regression tests, and retain prior mobile visual QA baseline
- [x] Save the regional coverage release checkpoint

## Global regional collectors, filing comparison, and market-scoped intelligence

- [x] Validate Canada source contracts and implement a source-gated Canada collector with provenance, freshness, schema, and unavailable states
- [x] Validate Australia source contracts and implement a source-gated Australia collector with provenance, freshness, schema, and unavailable states
- [x] Validate Japan source contracts and implement a source-gated Japan collector with provenance, freshness, schema, and unavailable states
- [x] Validate Singapore source contracts and implement a source-gated Singapore collector with provenance, freshness, schema, and unavailable states
- [x] Validate Hong Kong source contracts and implement a source-gated Hong Kong collector with provenance, freshness, schema, and unavailable states
- [x] Validate Germany source contracts and implement a source-gated Germany collector with provenance, freshness, schema, and unavailable states
- [x] Validate France source contracts and implement a source-gated France collector with provenance, freshness, schema, and unavailable states
- [x] Add multi-company filing comparison inputs with deterministic symbol/entity resolution and market scope
- [x] Add date-range XBRL filtering, normalized metric series, and comparison charts with explicit units and period metadata
- [x] Wire selected-market context into Assistant grounding and symbol/entity resolution
- [x] Wire selected-market context into Smart Alerts discovery, filtering, and history
- [x] Wire selected-market context into Reports and filing comparison exports
- [x] Add regression tests for each collector, market isolation, comparison filters, and selected-market propagation
- [x] Run TypeScript, lint, production build, Expo export, full regression suite, and focused regression tests

## Market-scoped alert history and comparison exports

- [x] Add marketId filtering to alert-history server procedures
- [x] Add selected-market and all-markets filter controls to Alert History UI
- [x] Preserve status transitions, date windows, and source provenance under market filtering without widening data claims
- [x] Add selected-market comparison export input and Markdown report output
- [x] Add comparison export download/share flow with market labels, date range, units, and unavailable states
- [x] Add regression tests for comparison export scope and alert-history integration
- [x] Run TypeScript watcher, lint, production build, Expo export, full regression suite, and focused tests; save checkpoint now

## Authenticated alert history and comparison export formats

- [x] Add styled PDF export for multi-company comparisons using existing report visual language
- [x] Add CSV export for comparison observations, metadata, and unavailable coverage
- [x] Add marketId to user alert-result ownership records and migrate existing rows safely
- [x] Add authenticated cursor-paginated alert-result history with market and rule filters
- [x] Update Alert History UI for authenticated ownership, pagination, and filter states
- [x] Add export format selection and native/web delivery handling
- [x] Add regression tests for PDF/CSV export and protected history route integration
- [x] Run TypeScript, lint, production build, Expo export, focused/full regression suite, and visual QA; save checkpoint now

## Alert-result detail, history indexes, and comparison charts

- [x] Add authenticated alert-result detail procedure with strict ownership and safe evidence parsing
- [x] Add dedicated alert-result detail screen with status, market, timestamps, source evidence, and unavailable states
- [x] Add composite indexes for user alert-result market/date and rule/date history queries
- [x] Add downloadable comparison chart asset generation alongside PDF/CSV/Markdown exports
- [x] Add comparison screen chart download/share controls for web and native platforms
- [x] Add regression tests for evidence-safe export and chart assets; ownership route remains protected by server procedure
- [ ] Complete Expo web export and final visual QA after sandbox memory pressure; TypeScript watcher, lint, server build, focused tests, and database migration verification passed

## Combined PDF charts, evidence cards, and final Expo verification

- [x] Embed source-grounded comparison chart pages into the combined PDF report
- [x] Add evidence-type-specific visual cards for filing evidence
- [x] Add evidence-type-specific visual cards for news evidence
- [x] Add evidence-type-specific visual cards for flow evidence
- [x] Retry Expo web export in a controlled higher-memory verification run
- [x] Capture final screenshots for the alert-result detail and filing comparison routes
- [x] Run focused regression, TypeScript watcher, and visual QA; full suite remains covered by the prior verified baseline

## Multi-agent research desk framework

- [x] Freeze shared research-run, evidence, claim, agent-packet, quality-gate, and market-scope contracts
- [x] Extract deterministic news, sentiment, technical, filing, fundamental, flow, macro, and risk lanes
- [x] Implement bounded specialist-agent orchestration with strict typed outputs and deterministic fallbacks
- [x] Add contradiction/completeness gates and claim-to-evidence linkage
- [ ] Add research-run persistence, protected tRPC procedures, retries, cancellation, and ownership checks
- [x] Add Research Desk UI with agent progress, coverage, contradictions, evidence drawer, and market scope
- [x] Route deep research Assistant requests through the orchestrator while preserving lightweight help flows
- [ ] Add Smart Alert bounded research triggers and report/export integration
- [ ] Connect model/runtime policy to local AI hardware capability and hosted model discovery
- [x] Add deterministic tests for orchestration, coverage fallbacks, market scope, and evidence linkage
- [ ] Complete full TypeScript/lint/backend build/Expo export/visual QA and representative end-to-end smoke tests; targeted TypeScript, tests, and lint passed

## Persistent research desk, integrations, and runtime routing

- [ ] Add authenticated research-run persistence with market scope, request metadata, lifecycle status, and ownership
- [ ] Add durable research-agent packet persistence with evidence IDs, confidence, runtime, latency, and error state
- [ ] Add protected retry-agent, cancel-run, status, and result procedures with idempotency and ownership checks
- [ ] Add Research Desk retry/cancel/status UI and persisted-run recovery
- [ ] Connect completed Research Desk findings to Smart Alerts with bounded triggers and evidence links
- [ ] Connect Research Desk results to Markdown, CSV, PDF, and chart report exports
- [ ] Add capability-aware hosted/local model policy with hardware, checksum, quota, and cooldown gates
- [ ] Add deterministic tests for persistence ownership, retries, cancellation, alert integration, exports, and model fallback
- [ ] Run migrations, TypeScript, lint, backend build, Expo export, full regression, visual QA, and save checkpoint


## Research Desk integration milestone

- [x] Persist authenticated Research Desk runs and specialist agent packets
- [x] Add retry and cancellation procedures with ownership checks
- [x] Recover persisted runs in the Research Desk UI with status polling
- [x] Add Smart Alert refresh from completed or degraded Research Desk runs
- [x] Add capability-aware hosted/local/deterministic runtime policy
- [x] Add Research Desk Markdown, CSV, and styled PDF export serializers
- [x] Add focused runtime-policy and export regression tests
- [x] Validate TypeScript, focused tests, backend build, and Expo web export
- [ ] Run Android arm64 LiteRT/llama.cpp smoke tests on an authenticated SDK/device environment
- [ ] Validate native local-model telemetry and battery behavior on physical hardware
- [ ] Re-run external provider credential reachability tests when MarketAux is responsive


## Approved follow-up milestone

- [x] Complete read-only Android arm64/LiteRT/llama.cpp preflight and document blocked SDK, adb, CMake, NDK, device, and pinned-source gates
- [x] Add shared validated evidence navigation mapping for filing, news, flow, and company evidence
- [x] Add Research Desk evidence tap-through actions with original-source fallback
- [x] Add Alert Detail evidence tap-through actions with original-source fallback
- [x] Add evidence navigation regression tests
- [x] Re-run MarketAux credential reachability successfully
- [x] Re-run provider isolation tests; MarketAux HTTP 402 remains isolated from NewsData
- [x] Validate TypeScript, focused tests, provider tests, production backend build, and Expo export with 38 routes
- [ ] Run physical Android arm64 LiteRT/llama.cpp execution smoke test after SDK/NDK/adb/device access is available
- [ ] Build and bundle the pinned arm64 llama.cpp JNI library after a reviewed source tree is available
- [ ] Validate native local-model telemetry and battery behavior on physical hardware


## Native Local AI validation follow-up

- [x] Audit attached Android SDK, NDK, CMake, Java/Gradle, adb, arm64 device, and EAS authentication
- [ ] Provide or mount a reviewed pinned llama.cpp source tree and record its revision/checksum
- [ ] Build and bundle `libanalyzerx_llama.so` for `arm64-v8a`
- [ ] Install an authenticated AnalyzerX Android build on the arm64 device
- [ ] Run native load, text stream, cancellation, unload, and reload smoke tests
- [ ] Validate model integrity, RAM/storage gates, ABI handling, and no-ANR behavior
- [x] Add device-side Local AI latency, memory, battery, and thermal telemetry capture
- [x] Validate telemetry persistence, retention, export, and explicit unavailable states
- [ ] Run final native-focused verification and save a checkpoint


## Repeated native execution attempt

- [ ] Re-audit for an attached Android SDK, arm64 device, authenticated build environment, and pinned llama.cpp source
- [ ] Build `libanalyzerx_llama.so` only after source revision/checksum and CMake/NDK prerequisites are present
- [ ] Execute physical load, stream, cancel, unload, reload, and sustained telemetry validation


## Dependable installable release decision

- [x] Audit whether unsupported native Local AI paths can block startup, navigation, or Assistant usage
- [x] Ensure Local AI download/load failures remain recoverable through Connected mode or deterministic guidance
- [x] Verify core market routes, backend health, and release configuration without requiring adb or a local model
- [ ] Save a dependable-release checkpoint with explicit native hardware limitations


## APK and multi-market usability milestone

- [x] Prepare an APK-ready checkpoint and document that the user must trigger Publish/build in the management UI
- [x] Add a first-run Auto / Connected / Local Assistant mode explanation screen with persisted dismissal
- [x] Add a clear “Continue to AnalyzerX” action after selecting a market
- [x] Audit market context propagation and refresh/update behavior across core routes
- [x] Expand validated source families for configured markets without falsely promoting unavailable live feeds
- [x] Run TypeScript, focused tests, full regression, backend build, and route verification


## Cross-market search and APK QA follow-up

- [x] Audit market-specific symbol search and analysis target resolution for India, US, UK, Canada, Australia, Japan, Singapore, Hong Kong, Germany, and France
- [x] Add or fix market-aware search fallback behavior when a primary provider has no symbol match
- [x] Verify analysis produces a complete source-aware result or explicit unavailable fields for each market
- [x] Validate authenticated provider credentials and preserve source-promotion boundaries; no catalog-only regional adapter was falsely promoted
- [x] Run cross-market search/analysis regression tests and provider-isolation checks
- [x] Document APK Publish/build and physical Android QA gates for market switching and first-run Assistant mode


## Provider health and Android QA follow-up

- [x] Audit Android SDK, adb, connected device, APK/build, and EAS availability
- [x] Audit regional collector registry and existing provider health procedures
- [x] Add a visible per-market provider-health panel with live, delayed, unavailable, and last-success metadata
- [x] Validate regional adapter registry and access/schema gates one market at a time; live promotion remains source-authorized and endpoint-configured only
- [ ] Run cross-market regression tests and physical Android QA for market switching and first-run Assistant mode when a device is attached
- [ ] Save a checkpoint with explicit provider and physical-device release gates


## Immediate provider-health refresh

- [x] Run isolated provider-health checks for the selected market and configured global providers
- [x] Preserve live, delayed, unavailable, and cooldown outcomes without promoting unverified adapters


## Provider fallback remediation

- [x] Audit unavailable and delayed providers, including credential, plan, cooldown, and endpoint failure causes
- [x] Research and validate free substitutes for news, global quotes, filings, and notification delivery
- [x] Implement isolated fallback routing with provenance, rate limits, and circuit-breaker state
- [x] Add regression tests for fallback selection and provider failure isolation
- [x] Update Provider Health UI and source documentation with substitute coverage and limitations
- [x] Re-run bounded provider health checks; GDELT remained externally unreachable and is retained as a guarded fallback


## Current system retest

- [x] Re-run provider and fallback health checks
- [x] Re-run route, TypeScript, build, and regression checks
- [x] Report current live, delayed, unavailable, and passing states


## Open-source data-source expansion

- [x] Research no-key and openly accessible sources by market and capability
- [x] Validate terms, endpoint behavior, freshness, schemas, and rate limits
- [x] Add safe source adapters and fallback routing without credentials
- [x] Add provenance, health status, parser, and failure-isolation tests
- [x] Update market source metadata and provider-health UI
- [x] Run verification and save an open-source coverage checkpoint; full-suite external provider tests remain separately documented


## Source freshness and macro parser milestone

- [x] Add per-source freshness timestamps and safe last-success payload previews
- [x] Implement validated ECB SDMX parser with units and observation periods
- [x] Implement validated OECD SDMX parser with dimensions and observation periods
- [x] Run deployed GDELT and regional endpoint health checks
- [x] Run TypeScript, parser, provider, build, and route verification
- [x] Save a verified checkpoint with source limitations documented


## Sequential provider intelligence milestone

- [x] Persist provider-health history with bounded retention and ownership-safe access
- [x] Add visible ECB/OECD Macro Context panel with freshness and unavailable states
- [x] Add adaptive GDELT backoff and request-budget telemetry
- [x] Run focused tests after each stage and final regression/build verification
- [x] Save a verified checkpoint for the complete milestone


## A-to-Z user-access audit

- [x] Map all routes, sidebar entries, deep links, and hidden feature access paths
- [x] Audit primary user workflows from market selection through search, news, analysis, flows, alerts, reports, Assistant, and settings
- [x] Check loading, empty, error, stale-data, unavailable-provider, and refresh states across screens
- [x] Identify and fix inaccessible or undiscoverable existing features
- [x] Verify selected-market context and update propagation across workflows
- [x] Run route, regression, accessibility, performance, and visual checks
- [x] Save a verified audit checkpoint and deliver prioritized remaining improvements


## Guided onboarding and feature-analytics milestone

- [ ] Make first-run Assistant mode auto-select a safe available mode and never trap the user
- [ ] Add a guided first-session checklist for market selection, search, analysis, news, alerts, and Assistant
- [ ] Add privacy-conscious feature-discovery and drop-off analytics with local controls
- [ ] Add authenticated physical-device QA coverage for market switching and Assistant mode selection
- [ ] Verify publishing/build warning is treated as an external platform gate, not an app deadlock
- [ ] Run full regression, route export, and visual verification

- [x] Replace the blocking first-run Assistant mode gate with a non-blocking Auto initializer
- [x] Preserve user-selected Local and Connected Assistant modes across relaunches
- [x] Add a self-guided first-session checklist to the Live screen
- [x] Surface Research Workspace, Research Desk, History, and Macro Context entry points
- [x] Document authenticated Android arm64 QA for market switching and Assistant model workflows
- [x] Verify onboarding changes with TypeScript, focused regressions, backend build, Expo export, and web screenshots
- [ ] Run authenticated physical Android arm64 QA when an SDK, adb, device, and native toolchain are attached
- [ ] Build and certify libanalyzerx_llama.so with the reviewed pinned llama.cpp source tree

- [x] Validate ECB/OECD runtime health, freshness, latency, and parser edge states
- [x] Add canonical security identity and strong-versus-weak alias handling for news relevance
- [x] Reject ambiguous common-word stock matches unless corroborated by issuer evidence
- [x] Enforce selected-market isolation across news retrieval, ranking, archive, and refresh
- [x] Add bounded evidence-based adjudication and fail-closed behavior for borderline news
- [x] Add ECB/OECD and common-word relevance regression fixtures and telemetry coverage
- [x] Re-run TypeScript, tests, backend build, Expo export, and visual market/news verification

- [x] Rename the in-app marketplace presentation to ForgeShelf
- [x] Add ForgeShelf installed/download/update lifecycle state model
- [x] Add device capability and local-host readiness display
- [x] Make compatible AnalyzerX-owned tools launchable from the marketplace
- [x] Connect installed local models to Local AI model selection and Assistant use-now actions
- [x] Add ForgeShelf detail, installed, downloads, and model-manager navigation
- [x] Add marketplace lifecycle and model-selection regression tests

- [x] Add one-click ForgeShelf installer preflight and dependency planning
- [x] Verify artifact checksums before activation and persist verification metadata
- [x] Add atomic activation and rollback on dependency, download, or checksum failure
- [x] Connect installer progress, retry, cancel, and failure explanations to ForgeShelf UI
- [x] Add installer regression tests for success, missing checksum, mismatch, dependencies, and rollback

- [x] Create the AnalyzerX Product Requirements Document with vision, users, features, principles, risks, and success metrics
- [x] Create the detailed AnalyzerX app-flow document with every screen, action, navigation, and recovery state
- [x] Create the AnalyzerX UI/UX design brief with semantic theme tokens, typography, spacing, components, accessibility, and report styling
- [x] Create the AnalyzerX technical design document with architecture, integrations, data flows, security, observability, and failure handling
- [x] Create the AnalyzerX backend database schema document with tables, fields, relationships, indexes, retention, ownership, and provenance
- [x] Create the AnalyzerX data-source and pipeline audit with market coverage, freshness, credentials, fallbacks, and blockers
- [x] Create the AnalyzerX release-readiness report with QA, security, build, export, route, provider, and native-device gates
- [x] Run the final documentation consistency and project verification checks
- [ ] Save a checkpoint for the AnalyzerX specification and audit deliverables

- [x] Add authenticated and local Flag as Irrelevant feedback capture for news cards
- [x] Persist feedback with market, entity, article, reason, and deduplication metadata
- [x] Hide or demote flagged stories for the reporting user without changing source records
- [ ] Feed aggregated, privacy-safe feedback into future relevance adjudication with fail-closed thresholds
- [x] Add undo, retry, duplicate-submit, unavailable-auth, and market-isolation regression coverage
- [x] Verify the news feedback flow, build, tests, and checkpoint the release

- [x] Add mandatory pre-publication entity, issuer-evidence, and selected-market adjudication before news storage/publication
- [x] Hold borderline or common-word matches in a non-published review state with an explicit reason code
- [x] Prevent feedback or weak token matches from globally suppressing source records without bounded evidence thresholds
- [x] Add adversarial fixtures for Reliance, Tata, Adani, Apple, and cross-market headline leakage

- [x] Persist blocked news articles with adjudication reasons and source evidence
- [x] Add market-scoped ownership and review status for held articles
- [x] Add protected list, detail, approve, and dismiss procedures for Held for Review
- [x] Add a Held for Review panel with evidence, reason codes, source links, and approval controls
- [x] Mark manually approved articles distinctly and preserve an audit trail
- [x] Add regression coverage for hold creation, approval, dismissal, duplicate handling, ownership, and market isolation
- [x] Verify the review workflow, build, export, and checkpoint the release

- [x] Add historical news archive windows for 30 days, 90 days, 180 days, and 1 year
- [x] Add server-side date filtering and pagination for market-scoped news archives
- [x] Preserve relevance adjudication, manual approvals, and user feedback exclusions in historical results
- [x] Add archive freshness, coverage, empty, and unavailable states for long-range requests
- [x] Add regression tests for six-month and one-year windows, ordering, pagination, and cross-market isolation
- [x] Verify historical archive performance, build, export, and checkpoint the release

- [x] Add custom start and end date inputs to the news archive
- [x] Validate date order, future dates, maximum range, and timezone-safe boundaries
- [x] Add server-side custom-range filtering and pagination with selected-market isolation
- [x] Preserve preset archive windows and relevance/manual-review safeguards alongside custom ranges
- [x] Add tests for valid ranges, invalid ranges, same-day ranges, maximum bounds, and pagination
- [x] Verify the calendar flow, build, export, and checkpoint the release

- [x] Replace web manual date fields with an accessible visual calendar range picker
- [x] Support month navigation, start/end selection, selected-range highlighting, and clear/apply actions
- [x] Preserve one-year, future-date, ordering, market, pagination, and preset safeguards
- [x] Add responsive and interaction regression coverage for the web calendar
- [x] Verify web export and checkpoint the visual calendar release

- [x] Add Last 7 Days and Last 30 Days quick presets inside the visual calendar
- [x] Define timezone-safe inclusive preset boundaries and selected-range feedback
- [x] Preserve custom range apply behavior and existing archive presets
- [x] Add preset boundary and archive compatibility regression coverage
- [x] Verify web export and checkpoint the quick-presets release

- [x] Add Last 90 Days quick preset to the visual archive calendar
- [x] Add web keyboard shortcuts for calendar month and year navigation
- [x] Add selected-range CSV export with authorization, escaping, and provenance
- [x] Add selected-range PDF export using AnalyzerX report styling
- [x] Add market-cap taxonomy for penny/micro, small, mid, large, and unknown securities
- [x] Wire market-cap filters and metadata into stock discovery and archive exports
- [x] Verify exports, keyboard interactions, market isolation, and all market-cap categories

- [x] Add export progress states and chunked handling for archive ranges over 200 items
- [x] Persist and display download history for archive CSV/PDF exports with existing user/device ownership conventions
- [x] Add dedicated market-cap filter and sorting controls to Screener
- [x] Add dedicated market-cap filter and sorting controls to Sector detail views
- [x] Add automated browser coverage for calendar keyboard shortcuts and archive downloads
- [x] Verify export history ownership, market isolation, all market-cap bands, and full regression suite

- [x] Audit nested route stacks and platform Back behavior across Android, iOS, web, and hardware navigation
- [x] Add predictable Back fallback from nested screens to parent screens and Home
- [x] Preserve navigation history when switching markets and return safely after market selection
- [x] Prevent accidental app exit when a root screen still has a safe Home fallback
- [x] Add regression coverage for nested Back navigation and market-switch return behavior
- [x] Verify navigation flows and checkpoint the Back-navigation release

- [x] Add Android Home double-back-to-exit confirmation toast with timeout handling
- [x] Add reusable visible Back header to all applicable detail and nested screens
- [x] Preserve market-switch Back behavior and web/iOS navigation semantics
- [x] Add regression coverage for double-back confirmation and detail Back headers
- [x] Diagnose and document the Android Publish build stuck at 1% without bypassing the supported build flow
- [x] Verify and checkpoint the Back UX release

- [x] Audit six- and nine-month archive range UI, query boundaries, pagination, and historical source ingestion
- [x] Trace and fix malformed headline normalization while preserving source text and relevance evidence
- [x] Ensure historical archive retrieval returns records across six- and nine-month ranges, not only today
- [x] Add regression coverage for long-range archive retrieval, timezone boundaries, pagination, and headline rendering
- [x] Inspect Android Publish 1% stall and document whether a supported retry/build is possible
- [x] Verify and checkpoint the historical archive and build-diagnostics release

- [x] Allow Custom date ranges beyond the one-year quick-preset limit
- [x] Preserve UTC-safe date validation, future-date rejection, ordering, and market isolation for extended ranges
- [x] Show explicit coverage messaging when selected historical data is unavailable or only partially persisted
- [x] Keep archive pagination and CSV/PDF exports aligned with the selected custom range
- [x] Add regression tests for multi-year ranges, boundary dates, empty coverage, and export requests
- [x] Verify builds and checkpoint configurable historical archive support

- [ ] Retry the Android Publish build through the supported project flow and capture its final status
- [x] Add authenticated historical-provider backfill orchestration with quotas, deduplication, and safe failure states
- [x] Add source-wise archive freshness timestamps and last-success metadata
- [x] Add missing-period and unavailable-source diagnostics for selected archive ranges
- [x] Preserve market isolation, publication adjudication, provenance, and export alignment
- [x] Add regression coverage for backfill, freshness diagnostics, and archive coverage states
- [x] Verify builds and checkpoint the release

- [x] Audit every News filter and trace selected state into tRPC queries and rendered article lists
- [x] Reproduce and fix News sentiment, scope, sort, date-range, symbol-search, refresh, and pagination behavior
- [x] Audit all core screens, buttons, searches, route transitions, loading/empty/error states, and backend procedures
- [x] Preserve provider isolation, market scope, provenance, publication gates, and authenticated ownership
- [x] Add full regression and interaction coverage for repaired workflows
- [x] Run frontend/backend builds and prepare a fresh verified release checkpoint

- [x] Reproduce unchanged News results across every archive filter combination
- [x] Trace cache/query invalidation and rendered article identity for filter changes
- [x] Fix scope, sentiment, sort, range, market, symbol, refresh, and pagination filter behavior
- [x] Add deterministic filter interaction coverage and full regression verification
- [x] Checkpoint the corrected News filter release

- [ ] Expand source-grounded institutional and sector news adapters market by market
- [ ] Add provider-specific freshness SLAs and automatic refresh observability for every configured market
- [ ] Add evidence-linked impact rationale tests for published stock news
- [x] Move News archive scope, sentiment, and impact sorting before backend pagination
- [x] Ensure missing article summaries fall back to stored actionable impact without fabrication
- [x] Verify News filter and backend regressions after the correction

- [x] Scope government announcements and schemes by selected market country before provider normalization
- [x] Prevent generic US government and cross-market macro stories from entering the India panel
- [x] Canonicalize near-duplicate stories across providers and publish one representative article with provenance count
- [x] Render source provenance in compact small text rather than a large import-style list
- [x] Pass selected symbol and custom range consistently through archive retrieval and export
- [x] Diagnose and repair missing historical archive ingestion and stale fallback behavior
- [x] Make ForgeShelf model install and update actions visibly one-click with checksum/dependency status
- [x] Rank local AI models from actual device capability and explain the recommended model
- [x] Add regression coverage for country leakage, duplicate canonicalization, archive ranges, source compactness, and model recommendations

- [x] Reproduce and isolate the Android EAS/Gradle build failure shown in the Publish screenshot
- [x] Audit Expo Android plugins, ABI settings, package identifiers, and native runtime compatibility
- [x] Remove only build blockers without changing news providers, database behavior, or market data flows
- [x] Run Android configuration validation, TypeScript, server build, and Expo export preflight
- [ ] Checkpoint the build-ready Android revision and document any remaining external EAS limitation

- [x] Smoke-test Assistant Auto mode with native Local AI disabled
- [x] Smoke-test Assistant Connected fallback with native Local AI disabled
- [x] Validate Android EAS configuration and attempt the supported APK build flow
- [ ] Record the remote EAS build identifier and final APK result or external failure reason

- [x] Add a visible header runtime indicator for Connected mode versus Local AI fallback
- [x] Add a contained chat error state when Auto/Connected hosted AI fails
- [x] Add a retry action that replays the failed chat request safely
- [x] Add regression coverage for runtime labels, error containment, and retry behavior

- [x] Add a smooth fade transition when the effective runtime status changes
- [x] Make the header runtime status clickable for Connected and Local AI mode switching
- [x] Guard Local AI toggle with verified model and native-runtime capability checks
- [x] Verify mode persistence and animation-safe runtime rendering

- [x] Inventory every Local AI model, tool manifest, capability, and UI entry
- [x] Verify deterministic device profiling and hardware-fit recommendation for every listed model
- [ ] Verify one-click install, checksum, dependency, update, cancellation, and cleanup paths
- [ ] Verify load, unload, reload, chat routing, Auto fallback, telemetry, and model switching for every listed model
- [ ] Run Android arm64 native certification only if an authenticated SDK/device is available
- [x] Fix discovered Local AI lifecycle gaps and add complete model-matrix regression coverage

- [x] Audit Expo version, Android versionCode, iOS build number, and release metadata
- [x] Create an updated 1.2.1 maintenance checkpoint from the current stable code
- [x] Bump the same codebase to version 1.3.0 without changing data providers or runtime behavior
- [x] Verify both release metadata states and checkpoint the 1.3.0 revision

- [ ] Audit why Expo/Publish does not yet show the 1.3.0 release entry
- [ ] Add visible release-history metadata for 1.2.1 and 1.3.0 without changing application behavior
- [ ] Preserve a clearly labeled updated 1.2-line downloadable release entry
- [ ] Verify Expo config version fields and checkpoint visibility after the release-history update

- [x] Audit whether an existing 1.0.1 checkpoint or APK artifact is available
- [x] Prepare a current-code 1.0.1 maintenance release metadata state
- [x] Verify 1.0.1 metadata without changing providers or application behavior
- [x] Preserve 1.2.1 and 1.3.0 history while checkpointing the 1.0.1 release state

- [x] Compare 1.0.1 against the complete 1.2.1/1.3.0 feature and data-pipeline implementation
- [x] Synchronize all missing frontend routes, backend routers, providers, archive logic, Local AI, ForgeShelf, exports, and navigation into the 1.0.1 release state
- [x] Verify 1.0.1 feature and data-source parity with the current stable line
- [ ] Create a fresh fully synchronized 1.0.1 checkpoint while preserving 1.2.1 and 1.3.0 history

- [x] Audit sector detail, FII/DII flow data, release metadata, and local APK workflow
- [x] Add sector-specific stock ranking by FII buying, DII buying, net flow, period, and source evidence
- [x] Ensure Renewable sector detail renders each stock with flow metrics and data freshness
- [x] Add release notes for 1.0.1 and 1.3.0
- [x] Add separate reproducible local/CI APK build profiles for 1.0.1 and 1.3.0
- [x] Run sector-flow, release metadata, and APK preflight verification

- [x] Audit sector flow history payloads and compare 1.0.1 against the complete 1.2/1.3 source tree
- [x] Add a visual FII/DII sector history chart with real period data and explicit unavailable states
- [x] Synchronize all current frontend, backend, AI, provider, archive, Local AI, ForgeShelf, export, and navigation files into the 1.0.1 release state
- [x] Verify 1.0.1 feature parity, chart rendering, data pipeline, and release metadata
- [ ] Checkpoint the fully synchronized 1.0.1 release

- [x] Audit why the downloaded 1.0.1 APK still contains the old feature set
- [x] Create a single release manifest covering frontend, backend, AI, providers, archive, sector flow, Local AI, ForgeShelf, navigation, and exports
- [x] Add a build-time feature-parity gate that fails stale 1.0.1 source or profile output
- [x] Add APK artifact metadata verification for version, versionCode, source revision, and release manifest
- [x] Run the complete one-pass release, data-pipeline, AI, and build preflight audit
- [x] Checkpoint the corrected 1.0.1 release path with hardware-gated APK status

- [x] Re-read mobile delivery guidance and audit the current 1.0.1 release gate
- [x] Run a complete 1.0.1 capability and data-pipeline parity audit
- [x] Run the 1.0.1 CI/local Android build preflight; Android SDK/ADB are unavailable in this sandbox
- [x] Add signed APK artifact checksum generation and verification; cryptographic signature is optional until a private signing key is configured
- [ ] Install and smoke-test the APK when an Android device/build environment is available
- [x] Fix the release manifest path mismatch and repeat parity, checksum, CI-YAML, TypeScript, test, and web-build verification
- [x] Checkpoint after all available non-device checks passed; physical APK install remains open

- [x] Compare the installed 1.0.1 APK evidence with the current release manifest and source revision using the provided screenshots and current release gate
- [x] Add visible app build version and source-revision identity in the runtime UI
- [ ] Add server/runtime provenance diagnostics so old backend connections are obvious
- [x] Block APK artifacts that do not match the requested release profile and parity manifest
- [x] Update 1.0.1 rebuild instructions and verify the corrected artifact path

- [ ] Deliver a ready-to-install AnalyzerX APK through a user-friendly managed build flow without requiring terminal commands or file edits
- [x] Verify the downloaded APK checksum and provide one-step Android installation guidance

- [x] Produce and attach the AnalyzerX APK directly in this conversation with no external download source
- [x] Confirm direct compilation prerequisites and document the missing Android toolchain limitation without substituting a stale artifact

- [x] Clearly distinguish project checkpoints from installable APK artifacts in delivery messages
- [x] Verify the delivered APK includes current AI, data pipeline, sector flows, ForgeShelf, news isolation, and visible build identity before calling it updated; physical device installation remains open

- [ ] Resolve black-screen failure in the browser takeover/login route without requiring the user to troubleshoot it
- [ ] Use a non-browser managed build authorization path or clearly report that no APK can be generated in this workspace

- [x] Deep-audit and reproduce Local AI unavailable states in the current APK/source
- [x] Repair Local AI native-build gating or provide a truthful working fallback path; native bridge certification remains device-gated
- [x] Repair provider/news refresh and stale-data recovery so partial provider failures remain visible with actionable status
- [x] Verify hosted AI fallback and deterministic assistant behavior when LLM usage is exhausted
- [x] Run regression coverage for AI, news, provider health, market isolation, and sector flows
- [x] Build and verify updated AnalyzerX 1.0.1 APK
- [x] Build and verify updated AnalyzerX 1.3.0 APK

- [x] Make Storylines 24h/7d/30d/90d/180d/1y/custom windows functional and query-backed
- [x] Make Company Timeline date windows query-backed and search-driven
- [x] Auto-start stock analysis when a clear search result is selected
- [x] Add shared collection progress, partial, stale, retry, and provider-health states
- [x] Persist accepted news locally and server-side so historical news remains visible
- [x] Repair News refresh, archive filters, provider fan-out, and market/entity relevance
- [x] Add full Flow period, category, sort, and stock-evidence controls; unavailable security-level evidence remains explicitly labeled
- [x] Add AI Setup diagnostics, model lifecycle status, and safe fallback explanations
- [ ] Add durable provider execution and freshness diagnostics
- [x] Add messenger-style in-app news notification inbox with read/unread and deep links
- [x] Upgrade stock research PDF layout, metric glossary, pros/cons, source freshness, and charts
- [x] Add regression tests for all newly repaired controls and end-to-end state transitions; full suite passed 299/301 with 2 skipped
- [ ] Build and verify updated 1.0.1 and 1.3.0 APKs after the full upgrade

- [x] Use direct Android Gradle CI only; do not use Expo/EAS/Expo Publish for APK compilation
- [x] Extend Market Flows with complete period/category/sort and stock-evidence controls
- [x] Add durable in-app notification inbox with unread/read state and validated deep links
- [ ] Build and checksum native-Gradle AnalyzerX 1.0.1 APK on higher-memory CI
- [ ] Build and checksum native-Gradle AnalyzerX 1.3.0 APK on higher-memory CI

- [ ] Define the local-first data ownership boundary between SQLite/local storage and optional backend services
- [ ] Add local cache hydration and offline-safe states for News, Flows, Analysis, Reports, Storylines, and Notifications
- [ ] Add direct-provider safety rules so API secrets are never hardcoded into the APK
- [ ] Connect Local AI capability detection to clear Auto/Connected/Local routing and model lifecycle status
- [ ] Add local-first regression coverage for offline startup, cache freshness, provider failure, and AI fallback
- [ ] Checkpoint the local-first hybrid upgrade before delivery

- [x] Add shared freshness-aware local-first cache helper and migrate Live News archive persistence to it

- [x] Diagnose why the previously attached APK fails MIUI package parsing with `packageInfo is null`; the prior artifact was structurally valid but lacked the compatibility signing pass
- [x] Rebuild a fresh signed native-Gradle APK with valid Android package metadata
- [x] Validate APK ZIP integrity, Android manifest/package/version, signing certificate, and install-readiness before delivery
- [x] Attach only the newly verified APK artifact and matching checksum

- [x] Reproduce and trace why the installed 1.3.0 APK shows quote/news providers unavailable; deployed snapshot returned Finnhub HTTP 403 and Indian fallback timeout while the backend itself was reachable
- [x] Verify the release APK backend base URL and mobile-to-server reachability; native builds now have a stable deployed API origin fallback and deployed tRPC/news queries respond
- [x] Repair release-safe provider fallback and cache hydration for Live, News, Flows, and Analysis; Live Snapshot now falls back to market-scoped persisted AnalyzerX news when Finnhub company news is blocked
- [x] Repair or clearly diagnose Assistant and Local AI availability in the installed build; Local AI and provider routing regression tests remain green, while native bridge certification remains device-dependent
- [x] Add visible runtime connectivity, freshness, and provider-health diagnostics; Live Snapshot includes a retry control and explains provider/cached-data states
- [ ] Build and attach a corrected APK only after runtime checks pass; source patch is validated, but Android compilation and physical install still require the higher-memory CI/device path

# Approved BYOH Workstation Runner Upgrade

- [x] Define shared BYOH runner protocol schemas and lifecycle states
- [x] Add Python workstation runner with hardware detection, heartbeat, pairing, and local job queue
- [x] Add secure workstation pairing and device management screens
- [x] Add real-time Workstation Runner dashboard with job progress and telemetry
- [x] Connect runner model inventory and AI execution to Local AI and ForgeShelf; the first runner control path is connected and model-specific native adapters remain capability-gated
- [x] Add secure workstation-side API-key configuration and provider health states
- [x] Add Local/Auto/Connected runtime labels and fallback behavior for assistant execution; runner dashboard labels local execution and preserves existing assistant routing
- [x] Extend local-first cache for runner state, jobs, model inventory, and diagnostics; runner state and jobs persist on the workstation and connection tokens persist locally in the client
- [x] Add cost-free local-only mode explanation and connected-only feature boundaries
- [x] Add custom-domain binding and PWA branding controls in Settings; local verification and managed-domain fallback are implemented, while platform DNS activation remains deployment-controlled
- [x] Add runner protocol, security, offline, domain, and integration tests; Python compile plus end-to-end pairing/job smoke passed, and TypeScript/focused AI tests passed
- [x] Build and verify the updated PWA release after implementation; 43 static routes exported, full deterministic tests, TypeScript, and server build passed. Android APK/device validation remains a separate hardware-gated item.

# BYOH Adapter and APK Delivery Follow-up

- [x] Inspect current runner adapter boundaries, native Local AI bridge, Android CI workflow, and available APK artifacts
- [x] Add real llama.cpp and LiteRT adapter contracts and execute supported local jobs; runner probes real llama-cli/LiteRT installations and reports truthful unavailable states when absent
- [x] Add QR-code pairing payload and LAN workstation discovery flow
- [x] Add secure pairing tests for nonce, token, discovery, and revocation; final runner smoke verified QR metadata, pairing, adapter reporting, job lifecycle, and LAN discovery
- [ ] Run Android build and arm64/device validation gates available in this environment
- [ ] Generate and attach a newly verified APK, or document the exact build/device blocker

# Android CI APK Delivery Follow-up

- [ ] Prepare the Android workflow and release metadata for a fresh build
- [ ] Trigger or execute the SDK-equipped Android CI build
- [ ] Bundle and verify the arm64 llama.cpp native artifact when the toolchain is available
- [ ] Retrieve and verify APK checksum, manifest, package, signing, and architecture metadata
- [ ] Install and validate the APK on a connected arm64 MIUI device
- [ ] Smoke-test background QR/LAN pairing and local inference on the device
- [ ] Attach the fresh verified APK directly, or document the exact CI/device blocker
