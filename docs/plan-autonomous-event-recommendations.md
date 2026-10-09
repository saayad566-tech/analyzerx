# AnalyzerX Autonomous Event-Driven Stock Recommendation Plan

## Goal

Upgrade Smart Event Alerts from a template-first discovery surface into an autonomous **Watch → Discover → Verify → Connect → Analyze → Rank → Recommend → Explain** engine. The system will continuously use available source payloads, identify listed companies and relationships, evaluate direct and evidence-supported indirect beneficiaries or affected companies, rank event-driven recommendations, and surface them proactively in the Alerts/Home experience.

Existing custom monitoring templates, natural-language rules, alert history, notification preferences, source isolation, provider cooldowns, deduplication, persisted alert results, and truthful empty states will remain available as an advanced monitoring layer. They will not be removed or replaced.

The engine will never manufacture an event, infer an order from an unverified headline, populate random stocks, or convert low-confidence relationships into recommendations.

## Current architecture to preserve

AnalyzerX already has the correct first half of the pipeline. News and official source records are normalized into `ExtractedNews`-like records. `live-smart-alerts.ts` converts tracked news and official records into event chains, enriches them with fundamental profiles, and passes them to `smart-event-alerts.ts`. That module already supports event types, deduplication, separate impact/confidence scoring, explanation text, eligibility states, sorting, and source evidence. Persisted Smart Alert results and notification transitions already exist.

The principal gap is that discovery currently terminates in **rule-specific eligible stocks** and the Alerts UI only scans after the user opens a selected template. The new autonomous layer will consume the same verified event chains and produce recommendations independently of a user-created rule.

## Architecture options

| Approach | Tradeoffs | Cost | Setup complexity |
|---|---|---:|---:|
| **Add an autonomous recommendation projection beside the existing rule evaluator** | Reuses the existing ingestion, event-chain, scoring, deduplication, persistence, and notification boundaries. Lowest regression risk. Requires a new recommendation contract, autonomous evaluator, storage, and proactive UI. | Lowest incremental cost; existing backend/providers | Medium |
| Replace Smart Alerts entirely with a new recommendation service | Could simplify the long-term domain model, but risks breaking templates, history, existing alert rules, notification semantics, and tested navigation. | Higher maintenance and migration cost | High |
| Run recommendation analysis only when the user opens Alerts | Simple and cheap, but it is not autonomous and misses the requirement for proactive discovery. It would also create slow first-open experiences. | Low runtime cost, poor product fit | Low |

**Planned route:** implement the additive autonomous recommendation projection. Use the existing server tracker/collector cadence for deterministic continuous evaluation. Do not use a high-frequency Manus session schedule. If sub-minute monitoring is later required, evaluate always-on hosted execution after measuring provider limits and resource requirements.

## Phase 1 — Define autonomous recommendation contracts

Add typed contracts separate from `MonitoringRule` and `EligibilityResult`:

| Contract | Required content |
|---|---|
| `AutonomousEventCandidate` | Stable event ID, normalized headline, event type, source set, published/detected/retrieved times, companies/entities, raw evidence, verification state |
| `RecommendationRelationship` | Direct beneficiary, indirect beneficiary, affected company, or mixed/uncertain; source company, target company, relationship type, relationship certainty |
| `RecommendationScore` | Independent 0–100 impact and 0–100 confidence; factor breakdown; score version; scoring warnings |
| `AutonomousRecommendation` | Stock/ticker, company name, headline, why-this-stock explanation, event type, relationship, impact/confidence, potential impact band, evidence, source timestamps, event timestamp, status, analysis route |
| `RecommendationStatus` | New, active, stale, invalidated, mixed, or no-longer-eligible |

All contracts will carry lineage and evidence kind: reported, derived, estimated, or inferred. Only reported and valid derived evidence can support a high-confidence recommendation. Estimated or inferred context may explain uncertainty but cannot be presented as confirmed fact.

## Phase 2 — Build the autonomous event candidate pipeline

Create an additive function such as `discoverAutonomousRecommendations` that consumes the existing tracked-news and official source-record streams. It will:

1. Select only records inside the configured lookback/freshness window.
2. Deduplicate the same event across NSE, BSE, company IR, government sources, and news using stable source/event identity, normalized headline similarity, URL/document hash, and event date.
3. Merge all supporting sources into one evidence set rather than producing duplicate recommendations.
4. Classify positive, negative, and mixed/uncertain event direction.
5. Extract event types including orders, government contracts, tenders, infrastructure/renewable projects, capacity/factory expansion, partnerships, joint ventures, acquisitions, fundraising, exports, supply agreements, project financing, capex, regulatory approvals, product launches, institutional investments, promoter/shareholding changes, cancellations, and other material disclosures.
6. Resolve entities using the existing alias map and entity master boundaries. Low-confidence or ambiguous names will remain unresolved and will not become recommendations.
7. Identify direct source/target relationships from explicit language such as supplier, customer, contractor, awarded to, partner, acquired, funded, invested in, or cancelled by.
8. Detect indirect beneficiary candidates only when there is sufficient evidence connecting the listed company to the project, supply chain, financing, customer, or disclosed relationship. Sector-level proximity alone is not sufficient.
9. Attach an evidence excerpt and direct original source URL to every candidate.

## Phase 3 — Evidence-backed relationship and impact analysis

Extend the current event-chain extraction rather than replacing it. Add relationship certainty and direction fields, keeping the existing customer/supplier/order/revenue/market-cap calculations.

For each candidate, resolve available market cap, revenue, order value, contract duration, capacity, sector, margins, profitability, historical relationship, repeat-business signals, and financial context from existing fundamental/market providers. Missing values remain unavailable. A ratio is calculated only when numerator, denominator, units, currency, and periods are valid.

Add positive and negative event handling. A contract cancellation, major customer loss, regulatory setback, adverse capacity event, or negative filing may produce an affected-company recommendation only when the event and company linkage are verified. Mixed events will be labeled mixed/uncertain and ranked below verified directional opportunities unless the evidence is unusually strong.

## Phase 4 — Separate impact and confidence scoring

Implement a versioned autonomous score using the existing explainable scoring style. Impact and confidence remain independent.

### Impact factors

| Factor | Treatment |
|---|---|
| Financial materiality | Order/value relative to revenue, market cap, earnings, or disclosed capital base |
| Customer or counterparty quality | Verified large-cap, government, strategic, or repeat customer context |
| Contract duration and revenue visibility | Explicit execution period, backlog, recurring potential, or multi-year visibility |
| Capacity and sector impact | Capacity additions, project scale, sector tailwind, and operational leverage |
| Profitability potential | Evidence-supported margin or business-model relevance; no invented margins |
| Strategic importance | Market entry, technology, export, or strategic positioning disclosed by source |
| Directness of relationship | Direct supplier/customer link ranks above indirect inferred exposure |
| Historical significance | Comparable disclosed events or repeat relationship when source-backed |

### Confidence factors

| Factor | Treatment |
|---|---|
| Source quality | Official exchange/regulator/company IR above government/reputable news/secondary sources |
| Entity match | Exact ticker/issuer match above alias or ambiguous name match |
| Event verification | Multiple independent aligned sources increase confidence; headline-only evidence is insufficient |
| Relationship certainty | Explicit named supplier/customer/partner above sector proximity |
| Numeric validity | Valid units, dates, currency, and source-backed calculations |
| Freshness | Recent, non-stale payloads score higher; stale evidence is visibly marked |

A recommendation may be high impact but low confidence. The UI will never collapse the two scores into a single misleading certainty indicator. Score thresholds will control presentation only after evidence gates pass; for example, an event with impact 92 but confidence 48 should appear as low-confidence review material or remain withheld, not as a strong recommendation.

## Phase 5 — Autonomous recommendation persistence and lifecycle

Add a recommendation persistence model or extend the existing alert-result model without breaking historical rule results. Store:

- Stable recommendation/event identity and dedupe key.
- User-independent event and recommendation payload.
- Optional authenticated user delivery records separately from the public recommendation object.
- Symbol, company, event type, relationship, direction, impact/confidence, factor JSON, explanation, evidence JSON, source/event/detected timestamps, freshness, status, score version, and route target.
- First-seen, last-seen, invalidated, and notification timestamps.

Persist one recommendation per deduplicated event/company relationship. If the same event is observed through several sources, update the evidence set and timestamps rather than insert another recommendation. Support status transitions: new → active, active → stale, active → invalidated, or active → mixed/no-longer-eligible when new evidence changes the interpretation.

Keep user-specific delivery preferences, quiet hours, push-token ownership, and notification history separate and protected. Autonomous recommendations can be read publicly if the product policy allows, but user-specific saves, dismissals, watchlist links, and notification delivery require authenticated ownership.

## Phase 6 — Background evaluation and notification behavior

Invoke autonomous evaluation after successful news/source ingestion and during the existing tracker/collector cycle. The evaluation must be deterministic and bounded: limit source records, cap entity enrichment fan-out, isolate provider failures, use existing cooldowns, and record partial results.

The evaluator will notify only on a newly eligible/high-confidence transition, not every polling cycle. Notification payloads will include the stock, event headline, impact, confidence, relationship, and source link. Quiet hours and notification preferences will be respected. If the notification channel is unavailable, persist the recommendation and delivery-unavailable state rather than failing ingestion.

The first implementation will use the existing server-side tracker cadence. Always-on or sub-minute polling is a separate hosting decision and will not be claimed from the current environment.

## Phase 7 — Autonomous-first Alerts UI

Change the Alerts screen hierarchy without removing templates:

1. **Top section: “We found something important” / “Today’s Event-Driven Opportunities.”**
2. Ranked recommendation cards populated only from real persisted autonomous recommendations.
3. Card fields: stock/company, ticker, event headline, why-this-stock, impact score, confidence score, potential impact band, relationship, event type, evidence source, event/detected time, freshness, and `View Analysis`.
4. Direction/status treatment for Potential Beneficiary, Potential Negative Impact, and Mixed/Uncertain.
5. Explicit empty state: “No high-confidence event-driven stock recommendations right now.”
6. Loading, stale, unavailable, partial-evidence, and retry states.
7. Date range and sort controls for recommendation history, reusing existing 30/90/180-day controls where appropriate.
8. A detail route or bottom sheet showing the full evidence bundle, factor breakdown, company fundamentals, relationship chain, source links, timeline, and invalidation conditions.
9. Existing custom monitoring templates and natural-language composer below the autonomous section under “Custom monitoring.”

Home/Live Events may show a compact “New Event Detected” rail that links to the same recommendation detail route. It must use the same persisted recommendation identity, not a second mock or fixture list.

## Phase 8 — Relationship graph and analysis integration

Add a recommendation-aware event graph projection:

> Source company/government → event → relationship → beneficiary/affected company → sector/project → financial significance → potential stock impact

Render only source-backed edges as confirmed. Inferred edges must be visibly labeled and must not meet the high-confidence recommendation gate without corroboration.

`View Analysis` will route to the existing Company Detail/Research flow with the event evidence bundle attached. The analysis prompt will receive event facts, fundamental facts, source lineage, confidence, freshness, and known gaps. It will be forbidden to invent order values, revenue impact, plans, customer links, or future outcomes.

## Phase 9 — Ranking, recommendation policy, and safety gates

Define configurable policy gates:

- Official/company/regulatory evidence required for high-confidence recommendations.
- Exact or strongly corroborated entity match required.
- Direct relationship required for direct-beneficiary claims.
- Indirect beneficiary claims require explicit supply/project/customer evidence.
- Numeric materiality ratios require valid units and periods.
- Stale or contradictory evidence lowers confidence and may suppress publication.
- No recommendation is published if evidence is headline-only, unresolved, duplicated without corroboration, or contradicted by a newer authoritative record.

Rank active recommendations by impact subject to a minimum confidence floor, freshness, and evidence quality. Show the factor breakdown and reason text generated from facts. The copy will avoid guaranteed-buy language and clearly label the output as event-driven research intelligence rather than a promise of returns.

## Phase 10 — Testing and verification

Add deterministic tests for:

- Autonomous discovery without any active user rule.
- Positive, negative, and mixed event directions.
- Direct customer/supplier/partner relationships.
- Evidence-supported indirect beneficiary relationships.
- Ambiguous entity rejection and no-fabrication behavior.
- Cross-source deduplication and merged evidence sets.
- Impact/confidence separation and factor breakdowns.
- Materiality ratios, currency/unit validation, and missing-data behavior.
- Stale, contradictory, invalidated, and no-longer-eligible transitions.
- Notification idempotency and quiet-hours behavior.
- Recommendation ranking and high-confidence threshold policy.
- UI loading, empty, stale, unavailable, populated, and detail-navigation states.

Add an end-to-end regression using a real-shaped source payload for an explicit order relationship and verify the path:

> payload → normalized event → resolved entities → relationship chain → impact/confidence → persisted recommendation → Alerts card → View Analysis

Also test an incomplete article and prove no recommendation is created. Run TypeScript, lint, production build, full regression, provider/source probes, database migration checks, web export, mobile visual QA, and the existing native readiness gates.

## Required final verification matrix

| Requirement | Verification |
|---|---|
| Autonomous discovery independent of user filters | Test calls recommendation discovery with no active rule and returns only source-backed records |
| Positive/negative/mixed events | Fixture-shaped contract tests and UI state checks |
| Direct and indirect relationships | Explicit relationship tests; indirect evidence gate test |
| Separate impact/confidence | Factor-level score assertions and UI display check |
| Deduplication | Multi-source same-event test produces one recommendation with merged evidence |
| No invented recommendations | Empty/incomplete/ambiguous evidence tests produce zero qualifying recommendations |
| Proactive UI | Alerts screen loads autonomous query on entry and displays real persisted recommendations |
| Existing templates preserved | Existing template/rule regression suite remains green |
| User delivery safety | Ownership, quiet-hour, notification-idempotency tests |
| Release integrity | TypeScript, lint, build, export, migration, full tests, and visual/native gates |

## Assumptions and open risks

The engine can only be as complete as the accessible, lawful source payloads. Official NSE/BSE/company-IR pages may remain dynamic, protected, or page-snapshot-only. Market-cap, revenue, options, and financial enrichment may be unavailable or stale. The system will show those limitations rather than infer them.

The recommendation engine will be an event-driven research feature, not an automated trading or order-execution system. No purchase, sale, brokerage action, or personalized financial instruction will be executed. External notification destinations remain optional and subject to their own credentials and delivery status.

The final release will not claim “real-time” or “24x7 uninterrupted” unless the hosted collector cadence and provider response telemetry demonstrate that behavior. The current implementation should first deliver reliable autonomous evaluation on the existing server tracker cadence, followed by measured performance tuning and an explicit hosting decision for tighter latency.
