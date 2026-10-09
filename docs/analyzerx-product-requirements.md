# AnalyzerX Product Requirements Document

**Version:** 2.0

**Status:** Release-aligned product baseline

**Product:** AnalyzerX

**Marketplace:** ForgeShelf

## 1. Product vision

AnalyzerX is a source-grounded financial intelligence workspace that helps a user move from a plain-English market question or a selected security to an explainable research result. It combines market events, company fundamentals, cash-flow quality, valuation, derivatives context, institutional flows, macro context, verified news, research agents, alerts, reports, and an optional local AI assistant.

The product promise is **fast, useful, and honest**. AnalyzerX should return an initial usable result quickly, progressively enrich it from independent providers, and expose the evidence, timestamp, confidence, and limitations behind every material conclusion. It must never fill gaps with invented values, publish ambiguous common-word news as stock news, or imply that a catalog entry or native model is working when the runtime has not verified it.

## 2. Target users

| User | Main job | AnalyzerX outcome |
| --- | --- | --- |
| Indian retail investor | Understand a listed company and current catalysts | A readable company view with evidence, risks, and data status |
| Global self-directed investor | Compare securities across a selected market | Market-scoped search, news, fundamentals, and reports without cross-market leakage |
| Long-term fundamental investor | Find quality or multibagger candidates | Named strategy screens with criteria, ranking, freshness, and evidence |
| Active market participant | Track news, flows, options, and events | High-signal recent items, impact ranking, filters, alerts, and source links |
| Research analyst | Build repeatable company and sector research | Research Desk runs, source-linked reports, comparison tables, and history |
| Portfolio/watchlist user | Monitor selected securities and signals | Authenticated watchlists, alert history, quiet hours, and notification status |
| Operations administrator | Maintain provider reliability | Provider health, latency, cooldown, run-now actions, and last-success previews |
| Technical/local-AI user | Install and manage local capabilities | Local model manager, telemetry, and ForgeShelf one-click installation with verification |

## 3. Problems to solve

Financial information is fragmented across exchanges, regulators, issuer filings, news providers, macro sources, and public APIs. Coverage and freshness vary by security and geography. A user needs historical context rather than isolated numbers, and a score without evidence is difficult to trust. Common words such as “Reliance,” “Tata,” or “Adani” create false news matches when token matching is used without issuer evidence. Provider outages and rate limits can also make an otherwise healthy feature appear empty.

AnalyzerX addresses these problems with a canonical entity layer, market context, parallel provider adapters, freshness and availability states, evidence-backed relevance, progressive enrichment, explainable scoring, durable history, and independent failure boundaries.

## 4. Product principles

1. **Source before score.** A score must be traceable to reported, derived, estimated, or unavailable evidence.
2. **Identity before relevance.** A name match is not an issuer match; strong aliases and corroborating evidence are required.
3. **Market context before retrieval.** India, the United States, the United Kingdom, and other markets are explicit scopes, not a single mixed feed.
4. **Graceful degradation.** One provider’s 401, 402, 403, 422, 429, timeout, or malformed payload must not blank unrelated capabilities.
5. **Fast path first.** Return a usable snapshot quickly and enrich in parallel.
6. **No fabricated completeness.** Missing data is shown as unavailable, stale, delayed, estimated, or derived with a reason.
7. **Explainable intelligence.** News impact, research scores, strategy ranks, and recommendations expose their factors and evidence.
8. **User control.** Market preference, Assistant mode, model choice, alerts, retention, and account data are explicit and persistent.
9. **Privacy-aware AI.** Local mode uses only verified local capabilities; Connected mode uses grounded server context; Auto chooses according to runtime capability.
10. **Every action has an exit.** Loading, retry, cancel, back, undo, and failure paths are first-class.

## 5. Core release scope

| Capability | Release requirement |
| --- | --- |
| Live Events and News | Market-scoped feed, refresh, date/signal filters, impact ranking, sentiment filtering, article detail, archive, original-source links, and verified relevance |
| Search and Entity Resolution | Partial autocomplete, canonical instrument selection, recent searches, market-aware aliases, and safe empty states |
| Company Research | Business model, moat, management/governance, balance-sheet health, profitability, cash flow, growth, valuation, risks, catalysts, scores, charts, evidence, and exports |
| Market Flows | FII/FPI, DII, mutual-fund and disclosed flow context where available, date ranges, sector/sub-sector and security views, sorting, comparison, freshness, and source status |
| Sector Intelligence | Sector activity, beneficiaries, concentration, catalysts, risks, selected-security drill-down, and evidence |
| Derivatives | Option-chain source state, expiry, PCR, OI, IV, max pain, Greeks where available, and explicit unavailable states otherwise |
| Strategy Screener | Named strategies, criteria, score/ranking, disqualifiers, evidence, freshness, and no-result versus unavailable states |
| Research Desk | Parallel specialist lanes for news, sentiment, technicals, fundamentals, filings, flows, macro, and risk with contradiction and evidence navigation |
| Assistant | Plain-English guidance and grounded market questions with selected-market context, limitations, and supported app actions |
| Local AI | Auto/Connected/Local modes, model selection, install state, telemetry, retention/export controls, and native readiness states |
| ForgeShelf | Browse, details, compatibility, one-click verified installation, dependency checks, checksum verification, progress, rollback, activation, update, remove, and launch routing |
| Alerts and History | User-owned rules/results, status transitions, market/date filters, notification preferences, quiet hours, pagination, and exports |
| Reports | Individual and comparison Markdown/PDF/CSV outputs with charts, source list, timestamps, assumptions, and evidence gaps |
| Operations | Provider registry, live/delayed/unavailable state, latency, last successful payload preview, cooldown, budget telemetry, and run-now control |
| Account and Settings | Authenticated preference sync, conflict handling, themes, provider health, support, data retention, privacy, and session controls |

## 6. Non-functional requirements

The first usable search or quote snapshot should target p95 under three seconds in a healthy environment. Standard research should target progressive completion within fifteen seconds without blocking on an optional provider. Every rendered material field should carry source and timestamp metadata, or an explicit unavailable state. Provider adapters must run independently, obey timeouts and cooldowns, and preserve stale data with a visible freshness label.

The application must support portrait one-handed use, accessible contrast, readable dynamic text, keyboard-safe web behavior, deterministic loading/error/empty states, and crash-free primary flows. Server persistence must enforce ownership for watchlists, alerts, saved research, push tokens, telemetry, and reports. Local models and downloaded artifacts must be checksum- or signature-verified before activation.

## 7. Success metrics and guardrails

| Metric | Target | Measurement |
| --- | --- | --- |
| Activation completion | 70% of new users reach a usable Live state | Onboarding funnel telemetry |
| First useful result | p95 under 3 seconds for search/quote snapshot | Request-to-first-card timing |
| Full research completion | p95 under 15 seconds for a standard security | Progressive server timing |
| Search success | 95% of valid partial queries produce a selectable entity | Search regression and production analytics |
| Verified-news precision | 98% precision on ambiguous common-word fixtures | Relevance evaluation set |
| Market leakage | Zero accepted cross-market stories without explicit relevance | Contract tests and audit logs |
| Provenance coverage | At least 98% of material rendered fields have source and timestamp | Report audit |
| Provider isolation | 80% or more of unaffected functions remain usable during one provider outage | Failure-injection tests |
| Report integrity | 100% of exports contain required sections and open successfully | Export tests |
| Assistant grounding | 100% of current-data answers include evidence and limitations | Schema validation |
| ForgeShelf install success | 95% of eligible verified installs succeed | Installer telemetry |
| Safe rollback | 100% of checksum/dependency failures leave no partial active artifact | Installer tests |
| Navigation success | 100% of primary actions resolve to a route or explicit state | Route/action matrix |
| Crash-free sessions | 99.5% target for primary workflows | Client crash telemetry |
| Trust guardrail | Zero fabricated material values or unverified publications | Automated audit and incident review |

## 8. Risks and controls

The largest risks are provider instability, regional coverage gaps, data licensing boundaries, ambiguous entity names, overconfident AI responses, native model build limitations, and increasing history volume. Controls include provider isolation, source hierarchy, entity master, fail-closed relevance, evidence contracts, ownership checks, retention policies, native environment gates, and honest status labels.

AnalyzerX does not execute trades, guarantee returns, bypass exchange protections, or replace licensed financial advice. It may display research signals and recommendations only as explainable, source-grounded decision support with risk and limitation language.

## 9. Roadmap

**Reliability baseline:** stabilize serving, market scope, source status, entity relevance, flows, screeners, and exports.

**Research depth:** complete richer ownership/flow evidence, durable research history, named strategy ranking, and multi-company comparisons.

**Intelligence scale:** improve global coverage, historical strategy evaluation, portfolio-aware alerts, sector rotation, and model-capability routing.

## 10. Release decision

AnalyzerX is publish-ready for web/backend when TypeScript, lint, tests, production build, Expo export, route smoke tests, provider-health checks, and security review pass; no primary flow is blocked by onboarding; and remaining provider or native limitations are visible. Android arm64 LiteRT/llama.cpp certification remains a separate environment-gated release item until a pinned native source tree, Android SDK/NDK, and physical device are attached.
