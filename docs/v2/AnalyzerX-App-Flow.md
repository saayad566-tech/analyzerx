# AnalyzerX — Detailed App Flow

**Version:** 2.0 · **Supersedes:** `docs/analyzerx-app-flow.md` · Corrects all hosted-backend references to the shipped on-device architecture.

## Flow conventions

AnalyzerX is portrait-first with one-handed navigation. Every network-backed screen follows the same lifecycle: **idle → loading → first useful data → progressively enriched → refreshed / stale / error**. A failure in one provider renders at field or section level and preserves unaffected content. Because the data layer is on-device, "offline" is a normal state, not an error: anything already collected stays readable.

## Entry, onboarding and authentication

| Step | User action | Result | Next path |
| --- | --- | --- | --- |
| 1 | Opens AnalyzerX | Splash, brand, local session restore | Live Events |
| 2 | Continues without account | Local preferences enabled; account-specific sync unavailable and labelled as such | Live Events |
| 3 | Chooses Sign in | Sign-in flow (no hosted identity provider; no remote call when unconfigured) | Live Events |
| 4 | Grants notifications | Notification permission prompt | Live Events |
| 5 | Skips notifications | App fully usable; alerts stay disabled | Live Events |
| 6 | Opens account | Account and settings | Profile, alerts, watchlist, saved screens, privacy, logout |

**Correction from the hosted era:** the previous flow described a Manus OAuth round-trip and an OAuth callback screen. In the shipped app there is no hosted identity provider, and `lib/_core/api.ts` was changed so authentication performs no remote call when no server is configured. `app/oauth/callback.tsx` remains as a route but is not part of the normal path.

## Primary navigation map

```text
Live Events (home)
├── Search → symbol suggestions → selected-symbol snapshot
├── Headline card → Article Detail → original source
├── Event card → Event Detail → Company Timeline / Relationship Graph
├── Stories → Storylines
├── Sectors → Sector Intelligence
├── Workspace → Research Workspace
├── Assistant → Plain-English chat
├── Bell → Notifications / Alerts
└── Account → Account management

Storylines → Storyline card → Company Timeline; entity chip → Timeline; event → Event Detail
Relationship Graph → node → Company Timeline; edge → relationship evidence
Sectors → Sector card → Sector Detail; opportunity → Screener (pre-filtered); beneficiary → Timeline
Flows → range → Today/Week/Month/QTD; category → FII/DII/Pro/MF/Stock/Options;
        sort → high↔low; row → Flow Detail → Company Timeline; source card → provider evidence
Screener → search → Analyze; recent → re-analyze; strategy → ranking; criteria → candidates;
           candidate → Company Research; derivatives card → options detail; Save → watchlist; Export → PDF/Markdown
Assistant → question → grounded answer; follow-up → new question; evidence → source; Clear → reset history
```

## Screen-by-screen contract

**Live Events.** Identity, global search, notification entry, live market snapshot, event filters, research shortcuts, collector status, news rail. Typing debounces a search over local data and the selected symbol's providers. Selecting a suggestion sets the featured symbol and refreshes quote, news and analysis. Source, timestamp, freshness and provider-specific failures are always exposed.

**Event Detail.** Event type, entities, relationship, value/signal, confidence, intelligence score, publication time, source, evidence status. Actions: Open Timeline, Open Graph, Open Source, Save, Create Alert. Missing URLs render as unavailable, not as dead links.

**Article Detail.** Headline, publisher, published time, symbol, sentiment, catalyst evidence, impact components, summary, freshness, original URL. Actions: open source, save, share, return to rail.

**Storylines.** Groups related events by company, project, order, sector or time window. Tap a storyline for the chronological sequence; tap an entity or event to open Timeline or Event Detail.

**Company Timeline.** Historical events in order with date, source, type, related entities, confidence and a link to the record. Filter by range and category; jump to research.

**Relationship Graph.** Confirmed facts are visually separated from model inference. Node → entity card; edge → evidence. Zoom, expand and reset always give visible feedback.

**Sector Intelligence.** Sector activity, institutional concentration, news catalysts, beneficiaries, risks, opportunity confidence. Selecting a sector applies a Screener filter. A missing feed shows the last verified aggregate with a source-specific freshness state.

**Market Flows.** Range and participant controls; summary card with FII/DII aggregate, report date, freshness and comparison basis. **History:** the 30-session backfill renders as a chronological chart; when NSE is unavailable the open dataset supplies values and the upstream is named. **Sector allocation** is carried on the payload (device-side source) with honest degradation. Sorting and filters operate on returned rows, never on an empty fixture.

**Screener / strategies.** Symbol search, recent searches, saved screens, watchlist, strategy selection, fundamental filters, expansion triggers, sector filters, derivatives status, research signals. Candidate rows show total score, strategy score, criteria pass rate, coverage, last updated, key evidence and risk flags.

**Company Research.** Entity card, business model, moat, management, financial health, profitability, cash flow, growth, valuation, scenario fair value, catalysts, risks, news, flows, derivatives, source coverage. Progressively enriched; exportable.

**Research Workspace.** Recent searches, watchlist, saved screens, latest analysis, exports, shortcuts. Local-only state is labelled; there is no backend sync in the shipped build.

**Assistant.** Accepts plain-English questions about companies, markets, flows, news, sectors, valuation and signals. The answer contract: concise answer, evidence used, freshness, limitations, confidence, follow-ups. The engine selector shows Auto / Local / Connected. The UI must never imply an offline model is executing when it is not bundled.

**Data Truth.** Exposes the evidence status behind the data on screen — reported, derived, estimated, stale, unavailable.

## States (loading, empty, error, permission, recovery)

| State | Behaviour |
| --- | --- |
| **Loading** | Skeleton on first fetch; stops as soon as the first usable response arrives. Never a full-screen spinner over usable adjacent content. |
| **Empty** | Explicit empty copy plus the action that would fill it (e.g. "No saved screens yet"). Never a blank panel. |
| **Error** | Section- or field-level, with the provider named and a retry action. Cooldown state and next retry are shown, not hidden. |
| **Stale** | Value retained, marked stale with its age and source. |
| **Unavailable** | States the missing capability and its provenance; never a fabricated value. |
| **Offline** | Normal state; archive content remains readable and the UI says what is live vs local. |
| **Permission** | Notification permission is requested contextually and denied gracefully — the app stays fully usable. |
| **Recovery** | A failed provider is retried on next interaction after cooldown; a crashed screen recovers on navigation. |
| **Logout** | Clears session material from secure storage; local archive retention is governed by the store limits. |
