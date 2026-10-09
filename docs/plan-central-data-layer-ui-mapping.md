# AnalyzerX Central Data Layer and Feature-Mapping Plan

## Goal

Extend AnalyzerX so that every approved and accessible dataset follows one traceable path:

> **Source → ingestion → normalization → database → intelligence engine → feature → user interface**

The implementation will not create a hidden data warehouse, populate screens with mock records, or claim coverage that is unavailable, stale, protected, paid, or unvalidated. It will preserve the existing provider isolation, source provenance, Smart Event Alerts, primary Institutional Five-Pillar scoring, secondary Multibagger Thesis, report generation, navigation, and test architecture.

## Current architecture to preserve

AnalyzerX already has a source catalog, `source_records` provenance storage, official-source ingestion, NSE collector health, tracked-news storage, Smart Event Alerts discovery, research/fundamental engines, provider fallback/cooldown logic, and mobile routes. The plan will extend this spine rather than create parallel scrapers or disconnected feature databases.

The current Stock/Company screen is the largest known UI gap: it still relies substantially on local timeline/storyline fixtures rather than a normalized stock-profile query. Current official filing support also includes source catalog links and page snapshots, but not yet a unified, symbol-resolved filing model for every category. NSE datasets that are not accessible through a validated public machine-readable route will remain explicitly blocked or page-snapshot-only.

## Architecture options and decision

| Approach | Tradeoffs | Cost | Setup complexity |
|---|---|---:|---:|
| **Incremental canonical data layer inside the current AnalyzerX backend** | Reuses existing source catalog, ingestion, provenance, collectors, tRPC, Drizzle, and mobile routes. Requires careful schema migration and staged UI wiring, but minimizes regressions. | Lowest incremental cost; uses existing hosting and configured providers | Medium |
| Separate event/data warehouse service feeding AnalyzerX | Better long-term analytics scale and independent ingestion, but duplicates schemas, increases operations, adds synchronization lag, and risks disconnected UI features. | Higher hosting, database, and maintenance cost | High |
| Lightweight source-capability registry plus UI-only mapping first | Fastest visible improvement and low migration risk, but cannot support durable cross-feature event relationships, alert evaluation, or historical lineage by itself. | Lowest initial cost | Low |

**Planned route:** use the incremental canonical data layer. Begin with the registry and read models, then add validated dataset adapters and feature consumers in vertical slices. Continuous deterministic ingestion should remain on the existing hosted backend/collector path; it must not be implemented as a high-frequency Manus session schedule. If sub-minute or always-on polling is later required, evaluate persistent always-on hosting after measuring provider limits and resource needs.

## Phase 1 — Define the capability contract and dataset matrix

Create a typed central capability registry, likely adjacent to the existing source catalog, with one record per dataset. Each record will include dataset key, source key/name, organization, entity scope, data category, cadence, access mode, schema/parser version, freshness SLA, confidence policy, primary/secondary source rank, stored record type, intelligence consumers, UI consumers, route/query name, feature status, and explicit limitations.

Define the canonical lineage object with `sourceId`, `sourceName`, `sourceUrl`, `originalDocument`, `publishedAt`, `detectedAt`, `ingestedAt`, `dataTimestamp`, `retrievedAt`, `freshnessStatus`, `confidence`, `parserVersion`, checksum/data hash, and evidence status. Every normalized record and every intelligence fact will carry or reference this lineage.

Produce the required dataset matrix with columns: Dataset, Source, Imported, Stored, Intelligence Used, UI Displayed, Feature, Freshness, Confidence, and Limitation. The matrix will distinguish real imported data from page snapshots, unavailable sources, and intentionally internal-only operational records.

## Phase 2 — Canonical entity and normalized record model

Add or extend normalized tables and query helpers only where the existing `source_records` model cannot safely represent a feature. Proposed logical models are:

| Model | Purpose | Key fields |
|---|---|---|
| Entity master | Resolve stock/company/issuer aliases across providers and exchanges | canonical ID, legal name, ticker, exchange, ISIN/FIGI, country, sector, subsector, active status, aliases, resolution confidence |
| Filing/document | Unify announcements, results, actions, board meetings, shareholding, insider, related-party, fundraising, M&A, investor presentations, annual reports, and regulatory disclosures | entity ID, category, title, document URL, original source, published/event period, detected/ingested times, document hash, status, lineage |
| Market observation | Preserve licensed/public quote and historical price/volume observations separately from fundamentals | entity ID, timestamp, OHLCV, market cap if sourced, provider, currency, interval, freshness, lineage |
| Fundamental observation | Store dated statements and derived metrics without overwriting source facts | entity ID, period, metric, value, unit, statement type, reported/derived/estimated flag, source lineage |
| Event/relationship | Represent Company A → relationship → Company B → event → value → sector → impact | source entities, relationship type, event type, value/currency, sector, financial significance, score, evidence, status, lineage |
| Watchlist/alert ownership | Connect user-specific stocks, rules, notification preferences, and status history to authenticated users | user ID, entity ID/rule ID, enabled state, quiet hours, channel preferences, created/updated timestamps |

Use stable entity IDs and idempotent hashes. Do not silently merge entities when confidence is low; retain unresolved/ambiguous states and expose the evidence gap.

## Phase 3 — Source adapter and ingestion expansion

Extend the current `source-ingestion.ts` and collector registry through dataset-specific adapters, not ad hoc fetches inside UI routes. Each adapter will have bounded timeouts, retry/backoff, provider circuit/cooldown behavior, response-size limits, schema validation, deduplication, checksum, parser version, freshness calculation, and a typed unavailable/error result.

Prioritize accessible primary sources in this order: official NSE/BSE/SEBI/NSDL/AMFI exchange/regulatory data, company investor-relations documents, government sources, reputable news, then secondary aggregators. Public RSS and structured feeds will be used where permitted. BSE APIs or paid feeds remain optional and will not be mandatory. Protected, CAPTCHA-gated, dynamically rendered, or unresolved endpoints will remain documented as blocked rather than bypassed.

Implement vertical slices in this order:

1. **NSE announcements RSS and page records:** resolve symbols/entities, classify event type, normalize publication/detection time, store original document links, and feed News, Stock Profile, Event Intelligence, Alerts, Search, and History.
2. **NSE corporate actions, results, board meetings, shareholding, and filing pages:** add validated parsers only after live schemas are confirmed; store page snapshots when structured extraction is not valid.
3. **NSDL sector-wise FPI and AMFI portfolio disclosures:** preserve periodic semantics and calculate dated changes only when two valid disclosures exist; never represent them as intraday DII or mutual-fund trading flow.
4. **BSE and company-IR payloads:** add source-specific schemas for accessible machine-readable records; preserve direct documents and mark unresolved records as unavailable.
5. **Market prices/OHLC, volume, fundamentals, derivatives, and macro data:** retain licensed-provider boundaries and source-specific units/currency/periods.
6. **News providers:** unify Finnhub, configured news aggregators, Google News RSS, GDELT, and official-source records through one normalized news/event contract with deduplication and source priority.

Every adapter will be independently testable and will not fail the entire fan-out when another provider is rate-limited or unavailable.

## Phase 4 — Intelligence-engine fan-out

Build a deterministic post-ingestion projection pipeline. When a normalized filing, news article, market observation, or fundamental observation is saved, it will update only the relevant projections and event indexes.

The Event Intelligence projection will extract and validate Company A, Company B, relationship, event type, value, currency, sector, financial significance, and potential impact. It will distinguish explicit source facts from inferred relationships and require evidence before an event can become an eligible Smart Alert.

Smart Alerts will evaluate every newly eligible normalized event against authenticated users’ active rules. Add idempotent evaluation keys, per-user ownership, status-transition records, quiet-hour/channel preferences, notification deduplication, and delivery status. The existing real-data-only Eligible Stocks view will be fed from persisted validated results; no mock/demo candidates will be introduced.

Fundamental, technical, event, and Multibagger engines will consume shared canonical observations. Missing values will remain missing with explicit estimated/derived badges only when a valid derivation policy exists. AI analysis will receive a structured evidence bundle containing source, period, confidence, and freshness, and its prompt/response contract will prohibit invented values.

## Phase 5 — Feature and UI mapping

### Stock Profile / Company Detail

Replace the fixture-based company timeline with a tRPC-backed stock-profile query that composes entity identity, latest quote, historical price summary, volume, market cap, filings, financial results, annual reports, shareholding, promoter/insider activity, corporate actions, board meetings, orders/contracts, partnerships, acquisitions, fundraising, capacity expansion, news, important filings, investor presentations, risk events, event history, AI analysis, and Smart Alert matches.

Render each category only when real source-backed records exist. Show source, period, freshness, confidence, and an explicit unavailable state for missing categories. Preserve direct original-document links and provide timeline/storyline/graph navigation.

### News Center

Create one normalized news query supporting Latest, Breaking, Company, Sector, Market, Corporate, Government, Regulatory, Macro, Global, IPO, M&A, Orders, Partnerships, Capacity Expansion, and Fundraising filters. Add search, date range, source priority, sentiment/impact, confidence, and freshness filters. Every article/event will display source, published time, detected time, company, sector, event type, importance, confidence, and original source link.

### Unified Corporate Filings

Add a filing screen and stock-profile filing section with category filters for announcements, results, board meetings, actions, shareholding, insider trading, related-party transactions, fundraising, acquisitions, regulatory disclosures, investor presentations, annual reports, and other material disclosures. The screen will separate structured records from page snapshots and show direct source/document links.

### Smart Alerts and Eligible Stocks

Connect all supported event projections to alert rules and the Eligible Stocks screen. Display stock/ticker, match score, matched rule, event, entities involved, event value, revenue impact, market-cap relationship, sector, evidence, source, event date, confidence, last updated, and status: Eligible, Potential, or No Longer Eligible. Empty states must explicitly say no verified match exists.

### Screener / Multibagger

Expose normalized revenue/profit growth, ROE/ROCE, leverage/debt reduction, operating/free cash flow, promoter/institutional holding, order growth/order book, capacity expansion, new customers, contracts, sector growth, valuation, earnings momentum, insider/promoter activity, corporate events, and news/event momentum as evidence-aware filters. Allow combined conditions with a clear distinction between reported, derived, estimated, stale, and unavailable values.

### Watchlist

Connect authenticated watchlist entities to filings, news, orders, actions, results, shareholding changes, insider activity, important events, Smart Alert matches, and material fundamental changes. Add notification preferences and retention controls without altering anonymous public research routes.

### Search

Expand platform-wide search over the entity master and normalized indexes. A symbol/company query will return Stock, News, Filings, Orders, Events, Relationships, Financials, Alerts, Analysis, and Historical Events. Natural-language queries will be normalized into structured filters and will return only evidence-backed results, with a clear “no verified matches” state.

## Phase 6 — Data lineage and explainability UI

Add a reusable evidence/lineage component for Stock Profile, News, Filings, Alerts, Screener, Analysis, and Reports. It will show source organization, original link, publication/data/retrieval times, freshness, confidence, parser version, and whether a value is reported, derived, estimated, or inferred.

Add an admin capability matrix showing dataset status, last successful import, latest payload preview, parser version, record counts, last error, cooldown, downstream consumers, and UI screens. This will make “Imported but not displayed” visible and actionable.

## Phase 7 — Authentication and ownership hardening

Before user-specific alert/watchlist/notification behavior expands, add `userId` ownership to watchlists, alert rules, alert results/status transitions, push tokens, saved analyses, and report history. Protect user-specific reads/writes with `protectedProcedure`, enforce ownership in database helpers, add token revocation/delete, and keep public market/news reads public only where intended.

Use migrations and inspect generated SQL before applying them. Do not alter existing source records destructively; add lineage/ownership columns and backfill only when a safe deterministic mapping exists.

## Phase 8 — Testing and verification

Add contract tests for each adapter’s fresh/stale/unavailable/error/schema-mismatch behavior, entity resolution, lineage preservation, idempotent ingestion, source-priority selection, event extraction, alert eligibility/status transitions, and cross-feature projections.

Add end-to-end tests for one representative entity covering ingestion → database → intelligence → Stock Profile → News → Filing → Alert → Search → Screener → AI evidence bundle. Repeat with an incomplete-data entity, a global symbol, a crypto asset where supported, and a symbol with an alias/ticker change.

Run TypeScript, lint, server build, Expo web export, full regression, database migration checks, public-provider probes, collector smoke tests, report checks, and mobile visual QA. Verify no mock rows are used to populate the new screens. Measure p50/p95 ingestion-to-display and query latency where the environment permits; otherwise document the measurement gate.

## Required final dataset matrix

The final deliverable will include a table in this form for every dataset:

| Dataset | Source | Imported | Stored | Intelligence Used | UI Displayed | Feature | Freshness | Confidence | Limitation |
|---|---|---:|---:|---|---|---|---|---|---|
| NSE announcements | Official NSE RSS/page | Yes/No | Yes/No | Events, alerts, search | Stock Profile, News, Filings, History | Corporate events | Event-driven | Source-aware | Protected/unresolved routes remain unavailable |
| NSE FII/DII | Official NSE report | Yes/No | Yes/No | Flow comparisons | Market Flows, sectors | Institutional flows | Daily | Report-period confidence | Aggregate; not stock-level sector flow |
| NSDL FPI sector | Official NSDL report | Yes/No | Yes/No | Sector flow context | Flows, sectors, reports | Sector FPI | Fortnightly | Periodic | Does not provide DII flows |
| AMFI portfolios | Official AMFI disclosure | Yes/No | Yes/No | Holdings/change analysis | Stock Profile, Flows, reports | Mutual-fund holdings | Periodic | Disclosure-based | Not intraday trading flow |
| Financial results | NSE/company IR/SEC | Yes/No | Yes/No | Fundamental score | Stock Profile, Analysis, Screener, Reports | Financials | Periodic | Filing evidence | Schema/source dependent |
| Corporate actions | NSE/BSE/company IR | Yes/No | Yes/No | Event/risk analysis | Stock Profile, Filings, News, Alerts | Actions | Event-driven | Document-backed | Endpoint access varies |
| Market price/OHLC | Licensed/public provider | Yes/No | Yes/No | Technical analysis | Stock Profile, Analysis, charts | Market data | Intraday/delayed | Provider-specific | Paid/licensed boundaries |
| News/events | Finnhub/RSS/GDELT/official | Yes/No | Yes/No | Sentiment, events, alerts | News, Stock Profile, Search, History | News intelligence | Provider-specific | Source-ranked | Secondary sources are not official filings |

No important dataset will remain in the final matrix with `Imported = Yes` and `UI Displayed = No` unless it is explicitly marked internal-only or operational telemetry.

## Assumptions and risks

The plan assumes the current AnalyzerX workspace remains the source of truth and that existing provider credentials, access permissions, and public-source terms do not change. “Real-time” will mean the measured cadence and source freshness, not an unsupported promise. Public NSE/BSE pages may be dynamic or protected; no CAPTCHA/WAF bypass or guessed download URL will be introduced. Paid exchange feeds remain optional. Full worldwide coverage, live options, and intraday ownership/flow data remain dependent on lawful accessible providers.

The work is large and should be delivered as vertical slices. Each slice must preserve existing tests and data-source isolation before the next slice begins.
