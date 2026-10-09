# AnalyzerX Technical Design

## System context

AnalyzerX is an Expo SDK 54 mobile application with an Expo Router web target and a Node.js/Express backend. React Native screens use TanStack Query and tRPC for typed server access. The backend normalizes heterogeneous market sources into source-aware domain contracts. Drizzle ORM maps persisted MySQL data. The production server serves both the API and the exported Expo web bundle from the same origin.

## Architecture

```text
Expo mobile/web client
  ├── Expo Router screens
  ├── NativeWind + theme tokens
  ├── TanStack Query cache
  ├── AsyncStorage local research memory
  └── Secure session / notifications
          │ tRPC over HTTPS
          ▼
Node.js + Express API
  ├── tRPC routers and Zod validation
  ├── Provider registry and circuit breakers
  ├── News tracker and NSE collector schedulers
  ├── Fundamental analysis and valuation engine
  ├── Derivatives and institutional-flow adapters
  ├── Research signals and strategy ranking
  ├── Market chat orchestration
  └── Static Expo web export
          │
          ├── MySQL via Drizzle ORM
          ├── S3-compatible report/file storage
          ├── Manus OAuth and built-in LLM
          ├── Finnhub, Indian Stock API, Yahoo/open fallback
          ├── NSE/BSE/SEBI/company IR source pages
          ├── Dhan MCP / option-chain adapter
          └── News and web-research providers
```

## Technology stack

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Client | Expo SDK 54, React Native 0.81, React 19 | Native and web UI |
| Navigation | Expo Router 6 | File-based route graph and deep links |
| Styling | NativeWind 4, centralized theme tokens | Responsive styling and AnalyzerX brand |
| Server state | TanStack Query 5 | Caching, refetch, stale and loading states |
| API | tRPC 11, Express 4, Zod | Typed procedures, validation, transport |
| Runtime | Node.js, TypeScript, esbuild | Backend execution and production bundle |
| Persistence | MySQL/TiDB, Drizzle ORM | Users, events, sources, preferences, research history |
| Auth | Manus OAuth | Web cookie and native bearer session |
| Notifications | Expo Notifications and server delivery | High-impact news and alert delivery |
| AI | Built-in server LLM; optional local inference later | Chat, extraction, classification, summarization |
| Reporting | Markdown/PDF generation | Standalone research reports |

## Domain modules

The API is organized by capability rather than provider. `market` owns search, snapshots, fundamentals, comparisons, and universe data. `news` owns tracker state, selected-symbol news, archive, refresh, and push registration. `sources` owns catalog, raw records, NSE collectors, and collector health. `providers` owns registry, health, Run Now, and web-research state. `chat` owns grounded question answering. Research modules own fundamental analysis, derivatives, signals, and report generation.

## Data-source routing

Every data request follows the same chain:

1. Resolve the entity and exchange using symbol directory, Indian search, Finnhub search, and global fallback.
2. Fetch the highest-priority configured source for the capability class.
3. Run independent secondary sources in parallel when the class is material or the primary response is incomplete.
4. Normalize into a shared contract with source, retrieved time, report period, freshness, and status.
5. Derive safe metrics from source data when possible.
6. Use open-web/filing fallback only with provenance and as-of date.
7. Return partial data with explicit gaps rather than blocking the screen.

## Provider isolation

Each provider has a registry record, capability list, configuration status, runtime status, latency, last success, last error, cooldown, and payload preview. HTTP 401/402/403/408/409/422/429/5xx responses are classified. A provider-specific circuit breaker suppresses repeated calls during cooldown while unaffected providers continue. Provider failures are returned as structured metadata rather than thrown through all screens.

## Data contracts

All material API responses include:

```ts
interface EvidenceMeta {
  source: string;
  sourceUrl?: string;
  retrievedAt: string;
  asOf?: string;
  status: "fresh" | "stale" | "derived" | "estimated" | "unavailable" | "error";
  confidence?: "high" | "medium" | "low";
  error?: string;
}
```

A metric contract additionally contains `value`, `unit`, `period`, `basis`, and `evidence`. No client component should render a number without an evidence object.

## Fundamental-analysis flow

The server resolves an entity, fetches quote/profile/financial statements/news/filings, validates period alignment, computes the ten-category institutional score, and builds scenario valuation only when inputs pass plausibility gates. Cash flow is a first-class pillar: operating cash flow, capex, free cash flow, conversion versus net income, and trend are all rendered independently. Missing history can lower coverage and confidence but cannot erase the complete structural scorecard.

## Flow data flow

NSE FII/FPI and DII reports are parsed into aggregate participant rows with report date and freshness. Security-level flow adapters normalize bulk/block deals, delivery, mutual-fund holdings, proprietary trader activity, and options positioning into a common `MarketFlow` contract. Sector aggregation groups rows by canonical sector. The client filters and sorts returned rows; it must never manufacture rows or intentionally return an empty array when valid rows exist.

## News data flow

Schedulers poll configured feeds and APIs, deduplicate by canonical URL plus normalized headline, resolve entities, classify sentiment and catalyst, calculate impact score, persist `news_events`, and enqueue high-impact notifications. The selected-symbol query runs a bounded refresh and merges fresh and recent stored results. LLM extraction is optional and circuit-broken; deterministic parsing remains available when LLM quota/authentication fails.

## Chat data flow

The client sends the user message, optional symbol, and the last eight local turns. The server retrieves relevant current snapshot, analysis, flows, news, and source-health context, then calls the built-in LLM with a structured response contract. The response contains answer, evidence used, limitations, confidence, and follow-ups. If the LLM is unavailable, supported deterministic answers return source-backed summaries and clearly state the limitation. No API key is exposed to the client.

## Security

The API uses strict input validation, HTTPS in deployment, allowlisted first-party origins, security headers, disabled `x-powered-by`, bounded JSON body size, OAuth session handling, and no arbitrary-origin credential reflection. Admin routes are role-gated. Provider tokens remain server-side. Original article links are validated before opening. Reports sanitize source text and do not execute embedded HTML or scripts.

## Reliability and observability

Health checks expose database queryability, news tracker status, NSE collector status, provider health, last successful response, latency, and cooldown. Every scheduled collector records retrieval time, checksum, parser version, source URL, raw payload, normalized payload, freshness, and error. Structured logs include provider ID, symbol, request class, duration, and outcome without secrets.

## Deployment

`pnpm build` first bundles the server and then exports the web client to `web-dist`. The build clears NativeWind/Metro cache artifacts and uses a deterministic Metro export mode. Express serves the API routes first and the Expo static bundle plus SPA fallback second. Before publish, the deployment image must run TypeScript checks, deterministic tests, Expo export, root/SPA/API smoke tests, and a no-secrets scan.

## Third-party integrations

| Integration | Use | Failure policy |
| --- | --- | --- |
| Finnhub | Global quotes, company news, profiles, metrics | Circuit breaker; Indian/open fallback |
| Indian Stock API | Indian profile, quote, holdings, news | Secret-gated; preserve Finnhub separately |
| NSE/BSE/SEBI/IR | Official reports, announcements, actions, filings | Store raw provenance; stale/unavailable states |
| Dhan MCP | Read-only option-chain source | OAuth/credential-gated; no trade route |
| Yahoo/open market endpoints | Global quote/history fallback | Label public fallback and as-of time |
| Google News RSS | Optional broad news | Parse safely; provider isolated |
| Manus OAuth | Authentication | Protected account data only |
| Built-in LLM | Chat and structured extraction | Deterministic fallback on exhaustion |
| S3-compatible storage | Reports and generated artifacts | Retry and checksum validation |

## References

[1]: https://docs.expo.dev/router/introduction/ "Expo Router documentation"
[2]: https://docs.expo.dev/guides/customizing-metro/ "Expo Metro configuration"
[3]: https://trpc.io/docs/ "tRPC documentation"
[4]: https://orm.drizzle.team/docs/overview "Drizzle ORM documentation"
[5]: https://expressjs.com/en/advanced/best-practice-security.html "Express security best practices"


## Expanded orchestration and latency design

The coordinator executes independent capability providers in parallel with bounded concurrency, abort signals, response-size limits, and per-provider circuit breakers. A request returns the fastest trustworthy snapshot first, then enriches the same view with fundamentals, news, institutional flows, derivatives, and sector context. Cache keys include normalized entity, exchange, capability, date range, and provider version. Freshness and source provenance are returned with every material field.

Flow queries use a shared normalized contract for participant, date, sector, sub-sector, symbol, buy, sell, net, activity, options activity, sort basis, and evidence. The API performs aggregation and comparison; the client performs display-level sorting and filtering only over returned verified rows. A range change invalidates the range-specific query key, so Today, 1 Week, 1 Month, and QTD cannot silently reuse identical values.

## Assistant runtime contract

Assistant generation has three stages: intent classification, evidence retrieval, and response generation. Current news, prices, filings, government announcements, FII/DII, options, sector, and stock questions call grounded context before generation. Connected mode uses the server model; Local mode uses the active loaded native model; Automatic selects Local only when bridge, model, modality, and device capability are valid. The response contract includes answer, evidence, freshness, limitations, confidence, and optional allowlisted action. Personal account data is never inferred from market sources.

## Local model runtime

The registry is the source of truth for model identity, artifact revision, checksum, capabilities, minimum hardware, adapter, license, and status. LiteRT-LM Gemma entries and llama.cpp GGUF entries are separated from runtime-pending catalog entries. Downloads verify size/checksum before activation. The native bridge serializes one active model at a time, supports load, stream, cancellation, and unload, and reports telemetry for model, engine, latency, token throughput, battery, memory, and errors. Unsupported Android environments show a readiness gate rather than a false success.

## Operational SLAs and diagnostics

Provider telemetry includes request duration, first useful response, last success, freshness, error class, cooldown, and payload preview. Admin Run Now is scoped to one adapter. Automated tests inject 429, 402, 403, timeout, malformed payload, stale report, missing credentials, and LLM exhaustion conditions. The intended operational behavior is graceful degradation: unaffected providers continue, screens retain valid sections, and the user receives a specific next action.


## Release architecture addendum

### Canonical layers and contracts

AnalyzerX uses eight boundaries: Expo client routes; local preference and cache layer; typed tRPC contracts; server orchestration; provider adapters; normalization/entity-resolution layer; durable storage; and background jobs/notifications. Optional native Local AI is an adapter behind the same Assistant runtime contract and cannot be assumed available because the web, Expo Go, and native production environments differ.

Every material observation has entity, market, provider, source URL, retrieved time, observation/as-of period, unit/currency, freshness, confidence, status, parser/version, and raw evidence reference. Every user-owned record has user ID, created/updated timestamps, revocation/deletion semantics, and ownership enforcement in the server procedure rather than only the client.

### Market and entity isolation

The security master resolves legal entity, common name, ticker, exchange, country, sector, aliases, listing status, and parent/merged entity. Query keys include market ID and exchange. Persisted news, filings, flows, alerts, reports, and research projections store market scope. Read procedures require the selected market unless the route explicitly requests a comparison or global view.

News relevance is a bounded adjudication pipeline: tokenize and normalize; resolve strong and weak aliases; gather issuer, exchange, ticker, IR-domain, filing, geography, sector, and macro anchors; apply negative evidence; score corroboration; reject ambiguous common-word matches; deduplicate; and persist a reason code. Borderline stories fail closed for stock publication but may remain in a broad source archive with an ambiguity label.

### Parallel provider orchestration

The coordinator fans out by capability with bounded concurrency and abort signals. Provider results are normalized independently and merged by canonical entity and period. A provider circuit breaker records failure class, cooldown, retry-after, latency, last success, and payload preview. Cache keys include market, entity, capability, period, and provider version. A 401, 402, 403, 422, 429, timeout, malformed response, or LLM quota exhaustion is isolated to the provider or capability that produced it.

### ECB/OECD macro contract

ECB and OECD observations are parsed as typed SDMX records with indicator, geography, period, frequency, unit, value, dimension metadata, source URL, retrieval latency, freshness, and parser version. Null observations remain null. A response can be `live`, `stale`, `unavailable`, or `error`. Macro observations are never silently treated as company metrics. The Macro Context route shows units, periods, source links, freshness, and unavailable states.

### Jobs and background execution

Schedulers run news polling, official filing snapshots, provider-health refresh, alert evaluation, retention, and provider-budget maintenance. Jobs are idempotent by provider/entity/period/source hash, retry with exponential backoff and jitter, and record start/end/outcome. Mobile background work is best-effort and battery-controlled; reliable always-on monitoring belongs to the server scheduler.

### Assistant and local runtime

Assistant requests pass through intent classification, market/entity resolution, evidence retrieval, model routing, and structured response validation. Current-data questions must retrieve source context before generation. Auto selects Local only when the verified bridge, model, modality, memory, and runtime are ready; otherwise it selects Connected or deterministic fallback. Local and Connected selections persist independently of first-run Auto initialization.

### ForgeShelf installer security

ForgeShelf listings are metadata, not executable trust. A one-click install is allowed only for a verified AnalyzerX contract or a signed/pinned artifact with source, license, platform, version, dependency declarations, and SHA-256 or stronger signature metadata. Preflight checks platform, architecture, memory, storage, runtime, redistribution policy, and dependencies. The installer downloads to a temporary path, verifies checksum, persists verification metadata, activates atomically, and deletes partial artifacts on failure. It never runs arbitrary repository scripts or archives. The prior active installation is restored when an update fails.

### Security controls

Secrets stay server-side or in platform secure storage. Input is validated with Zod and bounded for size and complexity. External URLs are allowlisted by provider class and no raw user URL is fetched server-side without SSRF protections. Report text is escaped and rendered as data. OAuth/session state is validated and revoked server-side. Admin procedures require role checks. Provider logs redact tokens, cookies, authorization headers, and payload fields marked sensitive. User-owned histories, alerts, watchlists, report files, push tokens, and telemetry cannot be read by another user.

### Observability and release gates

Health endpoints report database, API, scheduler, provider, source, and export state. Structured telemetry records request class, market, entity, provider, duration, outcome, freshness, and error class. It does not record credentials or unrestricted prompt content. Release gates are TypeScript, lint, full regression, backend build, Expo export, route smoke test, provider health, schema/migration review, security review, and no-secret scan. Android arm64 LiteRT/llama.cpp remains an explicit environment gate until SDK, NDK, CMake, pinned source, and device are available.
