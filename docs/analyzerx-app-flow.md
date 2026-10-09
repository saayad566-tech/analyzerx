# AnalyzerX Detailed App Flow

## Flow conventions

AnalyzerX uses portrait-first, one-handed navigation. Every network-backed screen follows the same lifecycle: **idle → loading → first useful data → progressively enriched → refreshed/stale/error**. A failure in one provider must render at field or section level and preserve unaffected content.

## Entry and onboarding

| Step | User action | Result | Next path |
| --- | --- | --- | --- |
| 1 | Opens AnalyzerX | Splash icon, brand, session restoration | Live Events or sign-in |
| 2 | Chooses Continue without account | Local preferences enabled; account-specific sync unavailable | Live Events |
| 3 | Chooses Sign in | Manus OAuth opens | OAuth callback → Live Events |
| 4 | Grants notifications | Push registration and notification preference prompt | Live Events |
| 5 | Skips notifications | App remains usable; alerts stay disabled | Live Events |
| 6 | Opens account entry | Account and settings sheet/screen | Profile, alerts, watchlist, saved screens, privacy, logout |

## Primary navigation map

```text
Live Events
├── Search → symbol suggestions → selected symbol snapshot
├── Headline card → Article Detail → original source
├── Event card → Event Detail → Company Timeline / Relationship Graph
├── Stories shortcut → Storylines
├── Sectors shortcut → Sector Intelligence
├── Workspace shortcut → Research Workspace
├── Market Chat shortcut → Plain-English Chat
├── Bell → Notifications / Alerts
└── Account → Account Management

Storylines
├── Storyline card → Company Timeline
├── Entity chip → Company Timeline
└── Event item → Event Detail

Relationship Graph
├── Company node → Company Timeline
└── Relationship edge → Relationship evidence/detail

Sectors
├── Sector card → Sector Detail
├── Opportunity card → Screener pre-filtered by sector
└── Beneficiary entity → Company Timeline / Research

Flows
├── Date range → Today / Week / Month / QTD
├── Category → FII / DII / Pro / Mutual Funds / Stock Buying / Options
├── Sort → high-to-low or low-to-high
├── Flow row → Flow Detail → Company Timeline
└── Source card → provider evidence and refresh

Screener
├── Search → autocomplete → Analyze Company
├── Recent search → re-analyze
├── Strategy selector → strategy ranking
├── Criteria filters → candidate ranking
├── Candidate row → Company Research
├── Derivatives card → option-chain detail
├── Signal card → Signal Detail
├── Save → watchlist or saved screen
└── Export → standalone Markdown/PDF report

Market Chat
├── Plain-English question → grounded answer
├── Suggested follow-up → new question
├── Evidence link → source or company research
└── Clear history → local history reset
```

## Screen-by-screen contract

### Live Events

The screen opens with the AnalyzerX identity, global search, notification entry, live market snapshot, event filters, research shortcuts, tracker status, and newspaper news rail. Typing one or more characters debounces a server-backed search. Selecting a suggestion sets the featured symbol and refreshes quote, news, and analysis context. A user can refresh the selected symbol or the tracker. The screen must expose source, timestamp, freshness, and provider-specific failures.

### Event Detail

The event detail sheet shows event type, entities, relationship, value or signal, confidence, intelligence score, publication time, source, and evidence status. Actions are **Open Timeline**, **Open Graph**, **Open Source**, **Save**, and **Create Alert**. Invalid or missing URLs are rendered as unavailable rather than clickable.

### Article Detail

Article detail explains headline, publisher, published time, symbol, sentiment, catalyst evidence, impact-score components, summary, freshness, and original URL. The user can open the source, save the article, share it, or return to the newspaper rail.

### Storylines

Storylines groups related events by company, project, order, sector, or time window. A user taps a storyline to see the chronological sequence, then taps an entity or event to open the Company Timeline or Event Detail.

### Company Timeline

The timeline shows historical events in order with date, source, event type, related entities, confidence, and a link to the originating record. The user can filter by time range and category, open related storylines, or jump to research.

### Relationship Graph

The graph displays confirmed facts separately from model inference. Selecting a node opens the entity card. Selecting an edge opens evidence. Zoom, expand, reset, and timeline actions must always provide visible feedback.

### Sector Intelligence

The screen shows sector activity, institutional concentration, news catalysts, beneficiaries, risks, and opportunity confidence. Selecting a sector applies a Screener filter. A missing sector feed shows the last verified aggregate and a source-specific freshness state.

### Market Flows

Market Flows begins with date range and participant category controls. The summary card shows FII/DII aggregate values, report date, freshness, and comparison basis. Security-level rows are populated from verified stock-level adapters; if only aggregate data is available, the screen shows aggregate-only mode and offers a refresh/source explanation. Sorting and category filters operate on returned rows rather than an empty fixture array.

### Screener and Multibagger Strategies

The Screener supports symbol search, recent searches, saved screens, watchlist, strategy selection, fundamental filters, business-expansion triggers, sector filters, derivatives status, and research signals. A strategy selector opens named lenses. A candidate row shows total score, strategy score, criteria pass rate, data coverage, last updated time, key evidence, and risk flags. Tapping the row opens Company Research.

### Company Research

Company Research renders the entity card, business model, moat, management, financial health, profitability, cash flow, growth, valuation, scenario fair value, catalysts, risks, news, flows, derivatives, and source coverage. The report is progressively enriched and can be exported.

### Research Workspace

Workspace shows recent searches, watchlist, saved screens, latest analysis, exports, and shortcuts. Local-only state is clearly labeled; signed-in state syncs to the backend.

### Market Chat

Chat accepts plain-English questions about companies, markets, flows, news, sectors, valuation, and research signals. The answer contract includes concise answer, evidence used, freshness, limitations, confidence, and follow-up questions. If the server LLM is unavailable, deterministic retrieval summaries remain available for supported queries; the UI must never imply that an offline model is executing if it is not bundled in the current build.

### Account Management

Account includes profile, sign-in status, notification settings, watchlist, saved screens, alert rules, report history, data/privacy controls, source preferences, help/support, and logout. Native mobile routes use secure session storage; web uses the existing session cookie.

### Admin and Operations

Admin is role-gated. It shows provider status, collector status, latency, cooldown, last successful payload preview, Run Now, source catalog, and error history. Run Now actions are isolated per provider and never disable unrelated providers.

## Universal states and actions

| State | UI behavior | Allowed actions |
| --- | --- | --- |
| Loading | Skeleton or progress label with section title | Cancel, navigate back |
| Fresh | Value, source, timestamp, freshness badge | Open evidence, refresh |
| Stale | Last verified value with stale age and warning | Refresh, open source |
| Partial | Available sections remain visible; affected fields labeled | Retry affected provider |
| Unavailable | Explain exact missing provider/data class | Retry, view alternatives |
| Error | Provider-specific error and cooldown | Retry after cooldown, inspect health |
| Estimated | Value and derivation basis are explicit | Open methodology |

## Core journey acceptance criteria

A new user can enter the app, search a partial symbol, select it, read a verified snapshot, open a news article, run full research, inspect cash flow and fair value, save the symbol, ask a plain-English question, and return to the same research context. An active user can open Flows, choose a range and category, sort returned rows, open a company timeline, and see source/freshness context. An investor can select a strategy, compare ranked candidates, inspect why each passed, and export a report. An administrator can run one provider, observe its result, and confirm that other providers remain available.


## Expanded customer workflow contract

The Account workspace also exposes Appearance, Local AI models, Assistant, Telemetry, all tools, source preferences, support, privacy, and sign-out. Appearance applies theme and mode instantly. Local AI exposes downloaded-model switching and routes the active model to Assistant Local/Auto mode. Telemetry exposes date-range filtering, CSV export, encrypted backup, retention, and clear-data controls.

Flows must preserve the chosen date range, participant, sector/sub-sector, and sort basis when the user moves from an aggregate card to a stock. The stock detail must identify whether the row is FII-active, DII-active, mutual-fund-active, options-active, or derived from a category aggregate. News, options, and screener tables use the same high-to-low sorting pattern and expose the selected basis in the header.

For any plain-English Assistant question, the system first classifies whether it requires current evidence, app navigation, educational explanation, or personal account context. Current evidence questions call grounded context; navigation questions may invoke only allowlisted app actions; personal account questions are answered from local/account context only when available. Unsupported or missing evidence produces a concise limitation rather than an invented answer. Local model status is disclosed in the engine selector.


## Version 2 release-flow addendum

This addendum completes the current flow contract for the release-aligned AnalyzerX platform. It preserves the existing screen definitions above and adds the explicit recovery, market-scope, installer, and acceptance behavior required for publication.

### First launch and market selection

The first-run Assistant explainer is non-blocking. It explains Auto, Connected, and Local modes, then allows the user to select India or another supported market and continue directly to Live. Auto is initialized only when no prior Assistant preference exists. A later Local or Connected choice is never overwritten. If the user skips sign-in, public and local features remain usable; account-owned sync, watchlists, push notifications, and server history show an authentication prompt rather than blocking the app.

The market selector can be opened from the global header, Account, Settings, or any market-aware workflow. After selection, a prominent Continue to AnalyzerX action returns the user to Live without requiring a trip through Home. The chosen market is carried into Search, News, Analysis, Flows, Screener, Alerts, Reports, Research Desk, and Assistant. If server and local preferences conflict, the screen shows both timestamps and provides Keep local, Use account, Retry sync, or Decide later.

### Market-scoped retrieval and publication

Every market-aware request includes a market identifier and selected date/range context. Historical news records include market scope on write and read. A story enters a selected-market feed only after canonical entity resolution and evidence-based relevance. Strong issuer evidence includes ticker/exchange, legal issuer name, investor-relations domain, filing identity, or multiple issuer-specific anchors. Weak aliases such as common English words are insufficient by themselves.

For example, a headline containing “Reliance” without issuer, exchange, industry, ticker, or corporate-action evidence is ambiguous and must be withheld from Reliance Industries stock news. The same rule applies to Tata, Adani, Apple, and other terms that are also ordinary words or broad group names. International macro news may appear in the Indian market only when it has a material, evidence-backed relationship to the selected Indian entity or Indian market context. Unrelated Apple news must not appear in an India-scoped feed.

### Live and news recovery contract

Live initially shows cached verified data, then progressively enriches from independent providers. Refresh triggers provider adapters in parallel and updates only successful sections. A provider returning 401, 402, 403, 422, 429, a timeout, invalid payload, or cooldown state creates a source-specific status card. It must not clear other providers or change a previously verified value into a fabricated placeholder.

News supports Live, Archive, Special Events, sentiment, impact, date, source, and selected-entity filters. Changing a filter re-queries or re-ranks the selected market’s result set. The headline rail is swipeable; tapping a headline opens detail. Detail includes source, publication time, relevance evidence, sentiment, impact factors, and original-source link. If an article is removed or inaccessible, preserved metadata remains visible with an unavailable-source state.

### Search-to-research journey

The user types a partial symbol or company name. Suggestions are market-scoped and may be sourced from the local directory, canonical entity master, or validated search providers. Selecting a row stores a recent-search entry and opens the selected entity context. The context offers Company Research, News, Filings, Flows, Graph, Alerts, Watchlist, Reports, and Research Desk.

Company Research renders all five pillars even when individual metrics are missing. Each value is marked reported, derived, estimated, stale, or unavailable. Cash flow is a required section, not an optional enhancement. The user can open source evidence, inspect chart periods, change the comparison range, save the research, create an alert, compare another company, or export an individual report. A provider failure affects only the corresponding section and exposes retry.

### Flows, sector, and strategy journey

The user opens Flows, chooses Today, one week, one month, QTD, or a custom supported range, then selects participant or activity category. The request includes the period and the result header repeats it. Returned data must change when the period changes; a static repeated number is a contract failure. Sorting applies to the active result set by FII, DII, mutual-fund, proprietary trader, net buying, options activity, confidence, or impact. Sector selection opens constituents with the same date, category, and sort context.

The Multibagger strategy selector lists named strategies and explains each lens. Selecting a strategy triggers live evaluation or explicitly reports that the necessary source class is unavailable. Candidate rows include score, criteria pass/fail, evidence, period, freshness, risk flags, and market. Selecting a candidate opens Company Research. A valid zero-result screen says no candidates matched; an unavailable source state explains what could not be evaluated.

### Research Desk and Assistant journey

The user starts a Research Desk run from an entity, sector, question, or comparison. Specialist lanes run independently and produce evidence packets. The run supports progress, partial completion, retry per lane, retry all, cancellation, and protected persistence. Cards link to source-specific filing, news, flow, and company detail screens.

The Assistant classifies each question as app guidance, navigation, current market evidence, educational explanation, or personal/account context. Current questions retrieve grounded context before generation. Navigation uses only allowlisted actions. Personal context is answered only from available user-owned data. The response shows engine, as-of time, evidence, confidence, and limitations. If the selected local model cannot run, Auto or Connected fallback is explained rather than hidden.

### Local AI and ForgeShelf installer journey

Local AI shows the selected model, runtime readiness, hardware capability, download state, memory/thermal/battery telemetry, and retention/export controls. Switching a model updates the active selection persistently and does not overwrite Assistant mode preference.

ForgeShelf Browse shows verified AnalyzerX capabilities and open-source models with publisher, source, license, version, artifact policy, supported platform, memory/storage fit, and existing AnalyzerX destination. Install begins a one-click job. The installer performs device and storage preflight, verified release-channel check, dependency planning, checksum requirement check, download, SHA-256 verification, atomic activation, and completion persistence. Progress states are queued, installing, verifying, activating, complete, failed, and rollback. Missing checksum, dependency failure, download failure, mismatch, or unsupported hardware leaves no active partial artifact and provides retry or cancel. ForgeShelf never executes arbitrary repository code merely because it is listed.

### Account, settings, provider health, and export journey

Account exposes market sync, conflict handling, watchlists, saved research, alerts, report history, Research Desk, Macro Context, Local AI, ForgeShelf, Appearance, Provider Health, Data Truth Center, Support, Privacy, and session management. Appearance applies theme changes instantly through semantic tokens. Provider Health shows live, delayed, catalog-validated, unavailable, and cooldown states with freshness, latency, last-success payload preview, and source link.

Reports begin with a coverage and export-preflight check. The export job shows progress and can be cancelled or retried. A successful PDF/Markdown/CSV contains the selected market, entity, period, source list, score breakdown, charts, assumptions, risks, limitations, and generation timestamp. Export history stores ownership and status. Invalid or unauthorized downloads fail closed.

### Complete critical-path acceptance criteria

| Journey | Acceptance condition |
| --- | --- |
| First launch | User reaches Live without being trapped by Assistant setup |
| Market switch | User selects a market and returns directly to Live; all dependent workflows use the new scope |
| Search | Partial query returns selectable entities or an explicit empty/unavailable state |
| News relevance | Common-word aliases without issuer evidence are rejected; verified issuer stories are retained |
| News refresh | New provider results can appear without wiping prior verified stories |
| Analysis | Five pillars, including cash flow, render with complete status labels and no blocking blank scorecard |
| Flows | Changing date range changes query/result context and preserves sort/category selection |
| Strategy | Selecting a named strategy produces ranked candidates, zero-result, or explicit unavailable state |
| Research Desk | Run supports progress, evidence links, partial failure, retry, cancel, save, and export |
| Assistant | Current-data answers include grounding/evidence/limitations; navigation actions are allowlisted |
| Local AI | Explicit model choice persists and runtime status is truthful |
| ForgeShelf | Eligible verified artifact installs after checksum verification; failures roll back safely |
| Alerts | Results are user-owned, market-scoped, paginated, filterable, and status-traceable |
| Reports | Individual and comparison exports open and include source-aware charts and coverage states |
| Provider health | One provider can fail without disabling unrelated source families |
| Account | Unauthorized access, revocation, and sync conflicts are handled explicitly |
