# AnalyzerX Multi-Agent Research Desk — Implementation Plan

## Goal

Upgrade AnalyzerX from a primarily single-pass assistant into a **research-focused multi-agent framework** in which specialist agents independently analyze news, sentiment, technicals, fundamentals, filings, institutional flows, risk, and market context before a synthesis agent produces a source-grounded research brief. The framework will remain market-scoped, authenticated where user data is involved, compatible with the existing Expo/tRPC/Drizzle architecture, and explicit whenever data is unavailable.

The phrase **fully free tools and data** is interpreted as follows: public or already-available data sources, open-source deterministic libraries, and locally runnable models are preferred. Provider terms, rate limits, licensing restrictions, and missing machine-readable endpoints must remain visible. Built-in hosted LLM calls are treated as optional acceleration rather than a claim of unlimited free inference. The system must never fabricate market facts to compensate for a blocked provider.

## Current-state assumptions

AnalyzerX already has a selected-market context, source-gated regional collectors, SEC/FCA filing infrastructure, news ingestion with deduplication and fallback extraction, technical/financial data paths, autonomous recommendations, a server LLM wrapper, a local-model policy registry, authenticated user storage, and a single grounded Assistant pass. The safest seam is to preserve the current data collectors and replace the single merged reasoning pass with an orchestrated set of typed specialist outputs followed by deterministic validation and synthesis.

## Architecture

The first implementation will use a **server-side orchestrator** inside the existing backend. It will execute deterministic data collection in parallel, invoke specialist reasoning only after evidence is assembled, validate every response against strict schemas, and persist an auditable run record. The mobile app will remain a client of typed tRPC procedures; no provider credentials or LLM credentials will be exposed to the client.

The orchestrator will have five layers:

| Layer | Responsibility | Trust boundary |
|---|---|---|
| Market context | Resolve the selected country, exchange, currency, ticker format, timezone, and coverage policy | Reject symbols that do not belong to the selected scope or label cross-listed entities explicitly |
| Evidence tools | Call existing collectors and structured data adapters for news, filings, prices/OHLCV, fundamentals, flows, ownership, and macro data | Provider-specific retries, cooldowns, source lineage, freshness, and schema validation |
| Specialist agents | Convert bounded evidence into typed findings for news, sentiment, technicals, fundamentals, filings, flows, macro, and risk | No agent may invent missing values; each claim must reference evidence IDs or be marked unavailable |
| Quality gates | Score completeness, freshness, contradiction, source count, and confidence; reject malformed or unsupported claims | Deterministic code, not an LLM judgment |
| Synthesis | Produce a concise research-desk brief, scenario table, risks, open questions, and next actions | Must preserve market scope, citations/evidence IDs, timestamps, and disclaimer language |

## Specialist agent roster

The initial roster will be intentionally bounded rather than an uncontrolled swarm.

| Agent | Inputs | Outputs | Deterministic guardrails |
|---|---|---|---|
| News collector/extractor | Deduplicated provider articles and official announcements | Headline, entities, event type, publication time, source quality, summary | URL/headline dedupe; entity resolution; freshness and provider status retained |
| Sentiment agent | Article text, headline, source metadata | Positive/neutral/negative/mixed sentiment, score, rationale, uncertainty | No trading recommendation; sentiment cannot override source quality or stale timestamps |
| Technical agent | OHLCV, volume, corporate actions, benchmark series | Trend, momentum, volatility, support/resistance, indicator values | Technical indicators are computed from actual bars; insufficient history is unavailable |
| Fundamental agent | Statements, ratios, cash flow, ownership, company profile | Profitability, solvency, growth, cash-flow quality, valuation observations | Fiscal period, currency, units, and as-reported/derived status are mandatory |
| Filing agent | SEC/FCA/regional filing records and XBRL facts | Filing significance, affected metrics, period comparison, links | Uses original filings and accession/source URLs; no secondary summary replaces a filing |
| Flow/ownership agent | FII/DII, mutual-fund, insider, short-interest, delivery, and holdings evidence | Buying/selling context and activity changes | Unsupported sector or intraday flow remains explicitly unavailable |
| Macro/context agent | Rates, FX, commodities, index/sector data, market calendar | Relevant market drivers and scenario context | Only uses data available for the selected country/asset class |
| Risk/contradiction agent | All specialist findings and evidence graph | Conflicts, stale data, concentration, governance, source disagreement | Does not invent a risk; every risk must point to evidence or be labelled an analytical caveat |
| Synthesis agent | Validated specialist packets plus quality-gate results | Research brief, confidence, open questions, evidence map, no-action/monitor/action framing | Must not issue personalized financial advice or claim certainty; market scope is printed in output |

## Execution flow

1. Resolve the user request into an intent, selected market, symbols/entities, asset class, date range, and requested depth. Build an entity card containing ticker/exchange, listing status, fiscal-year anchor, currency, and industry.
2. Create an immutable research-run record with a correlation ID, owner ID when authenticated, market ID, input parameters, requested agents, model/runtime policy, and start timestamp.
3. Fetch evidence through the existing source adapters in parallel. Each evidence item receives a stable ID, provider, URL/accession, retrieved time, source status, checksum where available, parser version, freshness state, and confidence policy.
4. Apply deterministic normalization: units, currencies, dates, fiscal periods, ticker aliases, duplicate removal, and source ranking. Preserve raw payloads separately from normalized observations.
5. Run specialist agents in parallel only when their dependencies are satisfied. News and technical agents can begin early; filing, fundamental, flow, and macro agents consume their respective normalized evidence. The risk agent waits for specialist packets.
6. Validate every specialist response with strict JSON schemas, required evidence IDs, bounded scores, maximum lengths, and explicit unavailable reasons. Retry malformed responses once with a repair prompt; then fall back to deterministic rules or an unavailable packet.
7. Run contradiction and completeness checks. If two providers disagree, retain both observations, identify the conflict, and lower confidence rather than selecting an arbitrary value.
8. Run the synthesis agent over only the validated packets. Include a compact evidence index and machine-readable claim-to-evidence links.
9. Persist the final brief, specialist packets, quality-gate results, provider health, and model/runtime metadata. Notify users only when configured and only after the result passes freshness and confidence policy.
10. Render the brief in Assistant, Reports, Alerts, and Company/Market views with the selected-market label and visible source coverage.

## Model and runtime routing

The framework will use a capability-aware policy rather than hardcoding one model for all jobs.

| Workload | Preferred runtime | Fallback |
|---|---|---|
| Deduplication, entity matching, indicator calculation, unit conversion, freshness, scoring | Deterministic TypeScript/Python code | Existing provider adapters and cached observations |
| High-volume extraction/classification | Small local model where the device supports it; otherwise the server’s configured structured LLM helper | Deterministic heuristics with an explicit reduced-confidence label |
| Specialist synthesis over bounded evidence | Server-side structured LLM with runtime model discovery and strict JSON schema | Local model for offline summaries; otherwise a deterministic evidence digest |
| Multimodal filing/chart/screenshot interpretation | Local vision-capable model when installed; otherwise server-side multimodal model | User-facing unavailable state with a request for a supported input |
| Large or repeated background workloads | Bounded server worker with concurrency limits and cooldowns | Queue for later processing; never uncontrolled fan-out |

The implementation will discover available hosted model IDs at runtime rather than hardcoding a catalog. It will use the correct model-family token and reasoning parameters, strict structured output, and bounded concurrency. Local models will be selected through the existing hardware/capability policy; a device cannot be labeled as supporting a model until its runtime, RAM/storage requirements, checksum, and smoke-test state are verified.

## Free-data and provider policy

The framework will reuse AnalyzerX’s existing source-gated adapters first. Public sources may be used only when their access and automation terms are documented. Each provider will have a circuit breaker, cooldown, timeout, retry policy, last-success timestamp, and status visible in the Data Truth Center. Free access is not treated as unlimited access. The system will prioritize official filings and structured public data over scraping, and it will not silently replace a preferred source with an unauthorised alternative.

For non-US markets, the market registry will determine ticker formatting and source readiness. A market may expose filing research while quotes, flows, or fundamentals remain gated. Every agent packet will carry a capability matrix so the synthesis agent cannot imply full coverage from a partial source set.

## Persistence and API design

Additive tables are preferred. Proposed tables are:

| Table | Important fields | Purpose |
|---|---|---|
| `research_runs` | id, userId, marketId, requestJson, status, runtimePolicy, startedAt, completedAt | Run lifecycle and ownership |
| `research_agent_runs` | id, runId, agentType, modelId, runtimeKind, status, inputEvidenceIds, outputJson, confidence, latencyMs, errorCode | Per-agent audit trail |
| `research_evidence` | id, runId, marketId, entityId, provider, sourceUrl, accession, payloadJson, checksum, retrievedAt, freshnessStatus, parserVersion | Immutable evidence ledger |
| `research_claims` | id, runId, agentType, claimText, valueJson, evidenceIds, confidence, unavailableReason | Claim-to-evidence graph |
| `research_contradictions` | id, runId, claimGroup, evidenceIds, severity, explanation | Multi-source disagreement tracking |
| `research_outputs` | id, runId, outputType, markdown, structuredJson, reportAssetId, createdAt | Assistant/report/alert-ready output |
| `agent_policies` | userId or workspace scope, enabledAgents, modelPreferences, maxParallelism, freshnessPolicy | User-managed agent and model controls |

Add indexes for `(userId, marketId, startedAt)`, `(runId, agentType)`, `(marketId, entityId, retrievedAt)`, and `(runId, status)` after measuring query patterns. All user-owned tables require protected procedures and ownership checks.

Proposed tRPC surface:

| Procedure | Behavior |
|---|---|
| `researchDesk.start` | Validates market, entity, date range, enabled agents, and depth; creates a run |
| `researchDesk.status` | Returns run state, agent states, provider coverage, and partial results |
| `researchDesk.result` | Returns only the authenticated owner’s completed result and evidence map |
| `researchDesk.retryAgent` | Re-runs one failed or stale agent under the same run policy |
| `researchDesk.cancel` | Cancels queued work without deleting audit records |
| `researchDesk.modelPolicy` | Reads/updates allowed model/runtime preferences and hardware constraints |
| `researchDesk.export` | Exports source-grounded Markdown, CSV, PDF, and chart assets |

## UI and user experience

Add a **Research Desk** screen that presents the agent roster as a compact progress timeline. Users will see which agents are running, completed, blocked by missing data, or degraded to deterministic fallback. The screen will show the selected country and date range at the top, a coverage summary, contradictions, key findings, and an evidence drawer.

The Assistant will use the same orchestration procedure when the user asks for deep research, while short navigation/help questions will continue to use the lightweight route. Smart Alerts may trigger a bounded research run only when a rule requests it and the user has enabled that behavior. Reports will show agent contributions and a unified source/evidence appendix.

The UI must distinguish **Unavailable**, **Fallback**, **Estimated/Derived**, and **Verified source observation** states. No blank scorecards, unsupported numbers, or fabricated provider success messages may be introduced.

## Security and reliability

Use protected procedures for user-owned runs, outputs, policies, saved prompts, and evidence attachments. Never expose provider keys or hosted LLM keys to the client. Validate all agent tool calls against an allowlist. Cap input length, symbol count, date span, number of agents, fan-out, and output size. Redact secrets from prompts and logs. Persist only necessary evidence and apply retention controls.

Provider and model failures must be isolated per agent. A failed sentiment agent must not prevent a technical-only report. A failed synthesis call must return the validated specialist digest with a clear degraded state. Use idempotency keys for run creation and notification delivery. Keep deterministic calculations separate from LLM interpretation for reproducibility.

## Testing and verification

The implementation will add deterministic tests for:

1. Market isolation, cross-listed ticker resolution, and entity-card creation.
2. Evidence deduplication, checksums, freshness, source ranking, and provider cooldown behavior.
3. Strict JSON-schema validation, malformed-output repair, bounded scores, and unavailable fallbacks.
4. Agent dependency ordering, partial failures, cancellation, retry idempotency, and concurrency limits.
5. Contradiction detection and claim-to-evidence linkage.
6. User ownership, revoked sessions, protected result retrieval, and export authorization.
7. Report/Assistant/Smart Alert propagation of selected-market scope.
8. Local-model hardware policy and deterministic fallback behavior.
9. PDF, Markdown, CSV, and chart-asset rendering with no unsupported values.
10. Full TypeScript, lint, backend build, Expo web export, mobile visual QA, and representative end-to-end smoke runs.

## Phased delivery

### Phase 1 — Contracts and evidence ledger
Freeze shared schemas, market context, evidence IDs, agent packet contracts, quality gates, and run lifecycle. No user-facing behavior changes beyond a feature flag.

### Phase 2 — Deterministic research lanes
Extract reusable news, technical, filing, fundamental, flow, and macro lanes from existing modules. Add source/health metadata and deterministic calculations before adding more LLM calls.

### Phase 3 — Specialist agents and orchestrator
Implement bounded parallel execution, structured specialist outputs, repair/fallback behavior, contradiction checks, and synthesis. Add persistence and protected tRPC procedures.

### Phase 4 — Research Desk UI and integrations
Add progress/status UI, evidence cards, model/runtime policy controls, Assistant deep-research routing, Smart Alert hooks, and Report export integration.

### Phase 5 — Local and free-runtime optimization
Connect the orchestration policy to the existing local-model registry. Add device-aware agent assignments, offline deterministic summaries, optional local inference, checksums, telemetry, and explicit runtime gates.

### Phase 6 — Verification and staged rollout
Run focused tests, full regression, build/export, visual QA, provider cooldown tests, and controlled end-to-end runs for India, US, UK, and one additional gated market. Release behind a feature flag, compare outputs with the existing Assistant, then expand gradually.

## Viable implementation approaches

| Approach | Tradeoffs | Cost | Setup complexity |
|---|---|---:|---:|
| Server-orchestrated multi-agent desk inside AnalyzerX | Best reliability and shared evidence; hosted LLM usage is not unlimited free and background execution needs bounded capacity | Lowest incremental infrastructure; model usage depends on configured runtime | Medium |
| Local-first specialist agents with server evidence collection | Strong privacy and low marginal inference cost; Android hardware support, model sizes, battery, and runtime availability constrain coverage | Mostly free after model distribution; higher device/storage cost | High |
| Lightweight staged pipeline: deterministic collectors plus one synthesis model | Fastest and cheapest to ship; less independent cross-checking and fewer specialist explanations | Lowest model usage | Low |

The recommended initial delivery is the **server-orchestrated desk with deterministic calculations and optional local specialist fallback**, because it preserves the current AnalyzerX data architecture, can run on the existing backend, and provides a clean path to local hardware without claiming that every device can run every agent. The lightweight staged pipeline remains a viable fallback if latency or model budget becomes the limiting factor.

## Open risks and assumptions

The framework cannot guarantee that every requested market has complete free real-time data. Public sources may impose rate limits, licensing restrictions, bot controls, or delayed publication. The platform will show these states instead of fabricating completeness. Built-in hosted LLM calls may be subject to project quotas; local models require device-specific validation. The first release will focus on research and evidence synthesis, not autonomous trade execution or personalized investment advice. The user has not specified whether the first target is server-first or local-first, so the plan assumes server-first with a feature-flagged local fallback and preserves the alternative in the architecture.
