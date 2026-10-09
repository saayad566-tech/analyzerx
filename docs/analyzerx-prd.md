# AnalyzerX Product Requirements Document

**Version:** 1.0  
**Status:** Product baseline for implementation and release planning  
**Product owner:** AnalyzerX team

## Product vision

AnalyzerX is a source-grounded financial intelligence workspace for Indian and global markets. It helps investors move from a plain-English question or a ticker to a transparent research view combining market events, company fundamentals, cash-flow quality, valuation, derivatives context, institutional flows, news impact, and scenario-based signals.

The product must optimize for **trust before completeness**. A field is never populated with an invented number. When a preferred source is unavailable, AnalyzerX uses a documented fallback chain, labels the source and timestamp, and explains whether the value is reported, derived, estimated, stale, or unavailable. “Complete research” therefore means a complete decision structure with explicit evidence status, not fabricated certainty.

## Target users

| User | Primary job | Success condition |
| --- | --- | --- |
| Indian retail investor | Discover, compare, and monitor listed companies | Can analyze a stock in under two minutes and understand evidence quality |
| Long-term fundamental investor | Find durable compounders and multibagger candidates | Can apply named strategy lenses and inspect the evidence behind rankings |
| Active trader | Track news, flows, derivatives, and catalysts | Can identify fresh market-moving events with latency and source context |
| Research analyst | Build repeatable company and sector research | Can export source-aware reports and revisit prior work |
| Portfolio owner | Monitor watchlists, alerts, and holdings context | Receives timely alerts and sees account-specific saved research |
| Operations administrator | Maintain providers and collectors | Can see latency, last success, failures, cooldowns, and payload previews |

## Core problems

AnalyzerX must solve five recurring problems. Market information is fragmented across exchanges, company filings, news providers, and public APIs. Data quality varies by symbol and geography. Investors need historical context rather than isolated numbers. Multi-factor screens are difficult to explain. Finally, current financial assistants often answer without showing evidence or limitations.

## Product principles

1. **Evidence-first:** every material field carries source, retrieval time, period, and status.
2. **Graceful degradation:** one provider failure must not blank an entire screen.
3. **Fast path first:** return a usable snapshot quickly, then progressively enrich it.
4. **Explainability:** scores show component weights, evidence, and uncertainty.
5. **User control:** saved searches, watchlists, alert preferences, and account settings are explicit.
6. **No false precision:** estimated values are visibly marked and cannot silently drive high-confidence recommendations.
7. **Mobile-native clarity:** one-handed portrait flows, readable cards, consistent back paths, and accessible contrast.

## Core feature set

| Capability | Required behavior | Release priority |
| --- | --- | --- |
| Live Events | Search symbols, filter event types, inspect chronology, open sources, and refresh automatically | P0 |
| Newspaper News | Swipe headlines, sentiment and impact scoring, article detail, original-source link, archive filters | P0 |
| Company Research | Entity resolution, scorecard, business model, moat, governance, financial health, profitability, cash flow, growth, valuation, risks, catalysts, and fair-value scenarios | P0 |
| Multibagger Strategies | Named strategy lenses such as Buffett/Munger quality, Peter Lynch growth-at-reasonable-price, CANSLIM, Joel Greenblatt quality/value, Fisher scuttlebutt, and GARP. Each candidate shows criteria pass/fail, evidence, score, and freshness. | P0 |
| Market Flows | FII/FPI, DII, proprietary traders, mutual funds, stock-level buying, options, bulk/block deals, sector aggregation, date ranges, sorting, comparisons, stale states, and source links | P0 |
| Derivatives | Option-chain source, expiry, PCR, max pain, IV, open-interest structure, freshness, and auth state | P1 |
| Sector Intelligence | Sector activity, capital concentration, catalysts, beneficiaries, risk labels, and source coverage | P1 |
| Plain-English Market Chat | Question answering over live app data, recent research, news, and source limitations; local history with server-side inference | P0 |
| Account Management | Sign-in state, profile, notification preferences, watchlist, saved screens, alert preferences, privacy, export history, and logout | P0 |
| Alerts | News, impact-score, price, flow, derivatives, and research-score alerts with delivery status | P1 |
| Reports | Standalone Markdown/PDF reports with charts, sources, data coverage, assumptions, and timestamp | P1 |
| Operations | Provider registry, run-now controls, cooldowns, latency, last success, payload preview, and collector health | P1 |

## Multibagger strategy contract

Each strategy is represented by a stable identifier, display name, philosophy, criteria, weights, disqualifiers, and evidence requirements. Strategies must not claim that a pass predicts returns. The output is a ranked research queue.

| Strategy | Core lens | Example evidence |
| --- | --- | --- |
| Buffett/Munger quality | Durable moat, pricing power, high returns on capital, conservative balance sheet, trustworthy management | ROCE/ROE history, margins, debt, governance and capital allocation |
| Peter Lynch GARP | Understandable business, growth relative to valuation, runway, category leader or improver | EPS/revenue growth, PEG, segment runway, valuation anchor |
| CANSLIM | Current earnings, annual growth, new catalyst, supply/demand, leader, institutional sponsorship, market direction | Quarterly growth, new products/orders, relative strength, ownership and index trend |
| Greenblatt quality/value | High return on capital with attractive earnings yield | ROIC/ROCE, earnings yield, peer-normalized valuation |
| Fisher scuttlebutt | Long runway, innovation, sales strength, management depth, reinvestment | Company disclosures, filings, IR narrative, product and market expansion |
| Small-cap compounder | Smaller base, reinvestment runway, cash generation, governance, low leverage | Market cap, FCF, debt, promoter/insider data, addressable market evidence |

## Data completeness standard

A screen or report is considered operational when it returns the full structural output even if individual providers fail. Every metric has one of four states: **reported**, **derived**, **estimated**, or **unavailable**. The UI must show a provider failure banner only for the affected field or section, not replace the whole report with a blocking “waiting for verification” page.

## Success metrics

| Metric | Target | Measurement |
| --- | --- | --- |
| First useful result | p95 under 3 seconds for quote/search snapshot | Client telemetry from request start to first usable card |
| Full research completion | p95 under 15 seconds for standard symbol | Server timing across progressive enrichment |
| Data provenance coverage | At least 98% of rendered material fields have source and timestamp | Automated report audit |
| Provider isolation | One provider outage leaves at least 80% of unaffected capabilities usable | Failure-injection tests |
| Flow usability | 95% of valid flow queries return aggregate data or an explicit source-specific state | API contract tests |
| Search success | 95% of valid partial symbols return a selectable result | Search fixture and provider tests |
| Chat groundedness | 100% of answers include evidence-used and limitations fields | Schema validation and audit |
| Navigation success | 100% of primary buttons resolve to a valid screen or action | Automated route map plus manual smoke tests |
| Export integrity | 100% of generated reports contain required sections and open successfully | Markdown/PDF audit |
| Alert delivery | 99% of eligible high-impact alerts are queued without duplicate sends | Notification idempotency metrics |
| Retention | 30-day repeat research rate above 35% for signed-in users | Product analytics |
| Trust | Reported “data not trustworthy” feedback below 3% of research sessions | In-product feedback and support tags |

## Release gates

The product may be marked publish-ready only when the production web root serves the Expo bundle, API health is 200, primary routes load, deterministic tests pass, the production build succeeds in the deployment image, and remaining external provider failures are isolated, visible, and documented. A provider credential failure must never be hidden by substituting mock market values.

## Non-goals

AnalyzerX does not execute trades, provide guaranteed returns, replace licensed financial advice, bypass exchange protections, or present third-party data as official when it is not. A local mobile LLM may support offline reading or re-ranking, but guaranteed 24x7 background execution remains server-dependent because mobile operating systems can defer background work.

## Roadmap

**Phase 1: Reliability baseline.** Repair production serving, make Flow and Screener progressive, complete provenance states, and add account entry points.

**Phase 2: Research depth.** Add named strategy ranking, persisted watchlists and saved screens, richer flow datasets, and report history.

**Phase 3: Intelligence scale.** Add historical strategy evaluation, portfolio-aware alerts, sector rotation analysis, and richer global coverage.

## References

[1]: https://docs.expo.dev/router/introduction/ "Expo Router documentation"
[2]: https://docs.expo.dev/guides/customizing-metro/ "Expo Metro configuration"
[3]: https://orm.drizzle.team/docs/overview "Drizzle ORM documentation"
[4]: https://trpc.io/docs/ "tRPC documentation"


## Expanded 2026 operating requirements

The platform must combine independent providers in parallel behind normalized contracts. News, prices, fundamentals, filings, options, FII/FPI, DII, mutual-fund, sector, and sub-sector records must carry provider identity, retrieval time, freshness, and error state. Provider circuit breakers, cooldowns, timeouts, and fallback ordering must prevent a 429, 402, 403, or malformed response from blocking unrelated features.

The Assistant must accept plain-English questions ranging from product guidance to company research, current news, options, institutional flows, sectors, crypto, gold, and forex. Current or time-sensitive answers must call the grounded context path before generation. Connected mode uses the server-grounded engine; Local mode uses the selected loaded model only after verified context is retrieved; Automatic mode chooses Local when capability and runtime status permit and otherwise falls back to Connected. The Assistant must state evidence and limitations rather than inventing facts. “100% working” is treated as a release objective, not as permission to hide unavailable providers or unverified native runtimes.

Institutional flow screens must support date-range selection, sector and sub-sector aggregation, stock-level activity, FII/DII comparison, sorting by net buying, buying value, options activity, and impact or confidence where applicable. The same sorting and filtering contract must be shared by news, options, stock rankings, sector rankings, and research tables so a customer can move from a category to the most active securities without losing the selected period.
