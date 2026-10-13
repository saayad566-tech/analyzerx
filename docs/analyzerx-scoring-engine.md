# AnalyzerX Institutional Scoring Engine — Plan & Phase 1 Core (v3.6.0)

Source: the 16-page PRD *AnalyzerX Institutional Scoring Engine (Deep Score + News Impact)* v1.0, owned by Akshya.

The PRD is a six-phase, roughly six-month programme. This document states the plan, and exactly what has been built and verified now.

---

## 1. What the PRD asks for

Two independent engines plus a fusion layer:

- **Engine A — Deep Score (0–100):** multi-pillar, sector-relative, point-in-time fundamental and technical score with a confidence value and a full explanation. Eight pillars (Quality 20%, Growth 15%, Valuation 15%, Balance Sheet 12%, Cash Quality 12%, Governance 10%, Technical 10%, Moat 6%), a risk overlay that subtracts visible penalties, sector-specific models, a valuation sub-engine (relative + 3-scenario DCF + reverse DCF), and rating bands gated on confidence.
- **Engine B — News Impact Score (−100…+100, signed):** sentiment + catalyst + materiality, multiplied by source tier and centrality, with event-type half-lives.
- **Fusion:** news may raise a re-check or watchlist flag, but never silently rewrites the Deep Score.
- **Validation (Section 10):** point-in-time data, Information Coefficient, quantile monotonicity, walk-forward, multiple-testing control, cost model, regime tests.
- **Governance:** weights live in versioned config, not code; same inputs + same config version = identical score.

---

## 2. Built and verified now — Phase 1 core (Engine A + B + fusion)

| Module | What it implements |
| --- | --- |
| `lib/scoring/config.ts` | Versioned config: 8 pillar weights, 45 metric specs with per-sector overrides (e.g. D/E and current ratio removed for banks), rating bands, the capped risk-overlay rules, the news weights/source multipliers/half-lives, and labelled absolute anchors. |
| `lib/scoring/metrics.ts` | Altman Z, Sloan accruals, Piotroski F (9 tests), Beneish M (5-variable), CAGR, gross profitability, ROIC−WACC, margin stability, D/E, Net Debt/EBITDA, interest coverage, current/quick ratio, CFO/PAT, FCF conversion, capex intensity, FCF yield, PEG, EV/EBITDA, margin of safety, two-stage DCF and reverse DCF (bisection). Null-safe throughout. |
| `lib/scoring/percentile.ts` | Winsorisation at the 1st/99th percentile, sector-relative mid-rank percentile with inversion for "lower-better", and the labelled absolute-anchor fallback. |
| `lib/scoring/deep-score.ts` | Pillar aggregation with weight redistribution for missing metrics, confidence = weighted coverage × freshness, capped risk overlay, composite clamped to 0–100, rating bands with a "Provisional" gate, and **exact** per-metric explainability (the contributions sum to the pre-overlay composite). |
| `lib/scoring/news-impact.ts` | Engine B: signed raw impact, source tier × rumour × corroboration multiplier, centrality down-weighting, exponential decay by event half-life, confidence. No catalyst → 0, never NaN. |
| `lib/scoring/fusion.ts` | Re-check flag on severe negative events, watchlist flag only when the Deep Score is at least grade B, and the 2×2 quadrant. |
| `tests/scoring.test.ts` | 30 vitest cases across config, formulas, percentile, Deep Score, News Impact and fusion. |
| `server/scoring.ts` | Maps the app's existing fundamental analysis into the engine (metric extraction, sector mapping, derived FCF yield / momentum / drawdown / margin of safety). |
| `app/deep-score.tsx` + `server/routers.ts` | Deep Score screen (composite, grade, confidence, pillar bars, overlay penalties, drivers, unscored metrics, percentile-source note), reachable from the company screen via `scoring.deepScore`. |

**Determinism:** identical inputs and the same config version produce an identical result — asserted by test.

---

## 3. Roadmap mapping (PRD Section 16)

| Phase | PRD deliverable | Status |
| --- | --- | --- |
| 0. Foundation | Data schema, point-in-time store, NSE/BSE ingestion, config system | **Config system done**; point-in-time store + ingestion are **not built** |
| 1. Deep Score MVP | Pillars 1–5 and 7, sector percentile engine, confidence, overlay, basic report | **Engine core done** (all 8 pillars); peer store and PDF report **not built** |
| 2. News Engine | Feed ingestion, dedup, FinBERT, event tagger, scoring, decay, alerts | **Scoring + decay done**; ingestion, dedup and FinBERT **not built** |
| 3. Institutional | Governance pillar, valuation sub-engine, earnings-call parser, expansion tracker, bank/NBFC models | Governance pillar + DCF/reverse-DCF **done**; call parser, expansion tracker and bank/NBFC metric sets **not built** |
| 4. Validation | Backtest harness, IC/quantile reports, weight calibration | **Not built** (needs point-in-time history) |
| 5. Macro & fusion | Regime layer, re-check flags, 2×2 dashboard | Re-check flags + 2×2 **done**; macro regime layer **not built** |
| 6. Platform | API, peer tools, BYOH LLM, mobile polish | Deep Score screen **done**; REST API, peer tools **not built** |

---

## 4. Honest limitations

1. **Peer store not connected.** The PRD's primary method is sector-relative. The app has no point-in-time peer universe yet, so the engine uses its **labelled absolute-anchor fallback** and the response says so (`peerSource`). The UI states plainly that such a score is indicative, not sector-relative. This is the single largest gap.
2. **Point-in-time correctness.** Fundamental values come from the app's existing live analysis, not a versioned point-in-time store, so restatements and announcement-date discipline (PRD FR-2) are not yet enforced.
3. **No backtest yet.** Rank IC, quantile monotonicity and walk-forward (the PRD's Section 10, which it calls the difference between an institutional product and a toy) require point-in-time history and are not built.
4. **NLP is not wired.** Engine B scores an already-tagged event; the FinBERT/dictionary sentiment and event tagger that produce those inputs are not built.
5. **Not investment advice.** Educational analytics only.

---

## 5. Verification

- `lib/scoring/*` passes strict `tsc` (`strict`, `noUnusedLocals`, `noUnusedParameters`).
- 44 engine assertions pass locally; the committed vitest suite mirrors them.
- Full-project `tsc`, the full vitest suite and the Android build run in CI before any APK is published.
