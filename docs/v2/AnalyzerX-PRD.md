# AnalyzerX — Product Requirements Document

**Version:** 2.0 (expanded) · **Supersedes:** `docs/analyzerx-prd.md` v1.0 · **Status:** reflects the shipped on-device product

## 1. Product vision

AnalyzerX is a source-grounded financial-intelligence workspace for Indian and global markets. It helps an investor move from a plain-English question or a ticker to a transparent research view combining market events, company fundamentals, cash-flow quality, valuation, derivatives context, institutional flows, news impact, and scenario-based signals.

The product optimises for **trust before completeness**. A field is never populated with an invented number. When a preferred source is unavailable, AnalyzerX uses a documented fallback chain, labels the source and timestamp, and states whether the value is reported, derived, estimated, stale, or unavailable. "Complete research" therefore means a complete decision structure with explicit evidence status, not fabricated certainty.

## 2. Target users and personas

| Persona | Primary job | Success condition |
| --- | --- | --- |
| **Retail investor** (Ravi, 32) | Discover, compare and monitor listed companies | Analyses a stock in under two minutes and understands how trustworthy each number is |
| **Long-term fundamental investor** (Meera, 45) | Find durable compounders | Applies named strategy lenses and inspects the evidence behind a ranking |
| **Active trader** (Arjun, 27) | Track news, flows and catalysts | Spots a fresh market-moving event with latency and source context |
| **Research analyst** (Sneha, 34) | Build repeatable company and sector research | Exports source-aware reports and revisits prior work |
| **Portfolio owner** (Vikram, 51) | Monitor watchlists and holdings context | Gets timely alerts and sees saved research |
| **Operations administrator** | Maintain providers and collectors | Sees latency, last success, failures, cooldowns and payload previews |

## 3. User problems

1. Market information is fragmented across exchanges, filings, news providers and public APIs.
2. Data quality varies by symbol and by geography.
3. Investors need historical context, not isolated numbers.
4. Multi-factor screens are hard to explain.
5. Financial assistants often answer without showing evidence or admitting limits.

## 4. Product goals

1. Make evidence quality visible on every material number.
2. Survive provider failure without blanking a screen.
3. Return a usable snapshot fast, then enrich progressively.
4. Make every score explainable by its components.
5. Give the user explicit control over watchlists, alerts and preferences.
6. Never present estimated values as reported facts.

## 5. Feature set

### Core
Market snapshot and quotes; symbol search; per-symbol and market-wide news with sentiment and impact; company research across a 121-field fundamental model; institutional flows (FII/DII aggregate with history); sector intelligence; screener with named strategy lenses; storylines; relationship graph; research workspace; on-device news archive; research-report PDF export.

### Advanced
Provider failover with circuit breaker and cooldown; continuous background collector; dynamic theme registry (8 themes + custom); grounded plain-English assistant with an evidence footer; data-truth screen exposing evidence status; FPI sector allocation; local-model management and telemetry surfaces; research-report generation with inline charts.

### Priorities

| Priority | Feature area |
| --- | --- |
| P0 | Quotes, news, fundamentals, evidence status, offline archive |
| P0 | Provider failover and honest "Unavailable" |
| P1 | Flows with history, sectors, screener, report export |
| P1 | Assistant with evidence contract |
| P2 | Storylines, relationship graph, themes, local-model surfaces |

## 6. User stories and acceptance criteria

**US-1 — Research a company quickly.** *As a retail investor I want to open a stock and see a usable research view fast, so I can decide whether to dig further.*
- AC: opening a symbol renders a snapshot within a few seconds on a normal connection.
- AC: sections enrich progressively; a slow section does not block the rest.
- AC: every material value shows source and timestamp.

**US-2 — Trust the numbers.** *As an investor I want to know whether a number is reported, derived or estimated.*
- AC: no field is ever filled with an invented value.
- AC: when a provider fails, the field reads "Unavailable" with provenance, never a zero or a guess.
- AC: estimated and derived values are visually distinct from reported ones.

**US-3 — Survive a broken source.** *As a user I want one failing provider not to blank my screen.*
- AC: each capability attempts its provider chain; on failure it falls to the next.
- AC: a provider in cooldown is skipped rather than retried hot.
- AC: unaffected sections still render.

**US-4 — Follow institutional flows.** *As a trader I want FII/DII activity with history, so I can see the trend.*
- AC: the current session is shown with report date and freshness.
- AC: a chronological history of recent sessions renders as a chart.
- AC: if NSE is unavailable the open dataset supplies the values, labelled by upstream.

**US-5 — Keep news on the phone.** *As a user I want collected news to stay available offline.*
- AC: articles are appended without duplicates.
- AC: the archive is queryable by symbol, category and time.
- AC: retention is bounded and pruned automatically.

**US-6 — Ask in plain English.** *As a user I want a grounded answer with its evidence.*
- AC: the answer states the evidence used, freshness, limitations and confidence.
- AC: the UI never implies an offline model is running when it is not.

**US-7 — Export research.** *As an analyst I want a report I can keep.*
- AC: export produces a PDF with the analysis, charts and a source register.
- AC: every figure in the report carries the same evidence status as in the app.

## 7. Business rules

1. **No invented values.** A field with no verified source is "Unavailable", never fabricated.
2. **Provenance always travels.** Every material value carries source and retrieval time.
3. **Failover is documented.** The chain, and which provider answered, are recorded.
4. **Estimated ≠ reported.** Estimated and derived values are marked and cannot silently drive a high-confidence recommendation.
5. **Free and keyless.** No paid data keys; no hosted backend dependency.
6. **Colour is never the only status signal** — status always has text and an icon.
7. **The catalog must not overstate itself.** Query variants are not counted as independent providers.
8. **Offline-first.** Anything already collected remains readable without a network.

## 8. Success metrics

| Metric | Target | How measured |
| --- | --- | --- |
| Time to first useful data on a symbol | < 3 s typical | Instrumented in the capability layer |
| Capability availability with one provider down | 100% for P0 capabilities | Failover tests in `tests/open-data-chain.test.ts` |
| Fabricated-value incidents | 0 | Contract tests asserting "Unavailable" on failure |
| Archive dedup correctness | No duplicate ids | `appendArticles` returns duplicate counts |
| Typecheck / test health | `tsc` clean, suite green | CI |
| Build success | APK produced and SHA-verified | CI workflow |

**Honest caveat on metrics:** the product has never run on a physical device, so timing and UX metrics are design targets, not measured results. Only build, typecheck and test metrics are currently observed.

## 9. Out of scope

Per-stock (security-wise) FII/DII attribution, option chains, SEC XBRL comparison and promoter/pledge ownership are **excluded** because no free feed provides them. A Windows desktop build is excluded because this is an Android/web Expo app with no desktop target. A hosted backend is excluded by design.

## 10. Release definition of done

An APK builds and is SHA-verified; `tsc` is clean and the test suite is green; every P0 capability has a working provider chain with a documented fallback; no screen can display a fabricated number; and the known limitations in `AnalyzerX-Project-State.md` are stated in the release notes rather than hidden.
