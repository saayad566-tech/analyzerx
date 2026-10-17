# ARCHITECTURE.md

How AnalyzerX is put together, why the boundaries sit where they do, and where each capability from
the product brief lives.

## 1. The shape

```
app/            screens (React Native, React Navigation)   — presentation only
components/     shared UI (design tokens + the premium kit)
hooks/          stateful glue
lib/            application logic: domain models, adapters, persistence
packages/       pure engines — no React, no I/O, no network
server/         tRPC procedures, providers, collectors, scheduling
desktop/        the Electron shell (Windows .exe)
android/        the native Android project
```

**The dependency direction is one-way and enforced:** `app → components → lib → packages`. A package
never imports from `lib`, `app` or `server`; a `lib` module never imports React. That is what makes
the mathematics testable without a device and the UI replaceable without touching the maths.

`packages/quant-engine` is the only place strategy, indicator and screening mathematics lives. Its
barrel (`src/index.ts`) is the whole contract — nothing outside it is public.

## 2. The engines (pure, deterministic, unit-tested)

| Module | What it is | Brief it serves |
|---|---|---|
| `packages/quant-engine/src/conditions.ts` | The user-defined condition **language**: tokenizer → recursive-descent parser → evaluator over OHLCV | Custom Condition Screener |
| `packages/quant-engine/src/momentum.ts` | **Dual Momentum** scanner: gainers / crashers ≥ threshold inside a 1–7 day window, with the volume multiple that explains the move | Momentum Movers |
| `packages/quant-engine/src/failover.ts` | **Multi-source failover**: key pool, rotation on 429, provider failover, per-key quota + health, throttling and backoff | Never stall on a rate limit |
| `packages/quant-engine/src/{indicators,backtest,risk,metrics,strategy-library,…}.ts` | The existing quant core | Research + backtesting |

Three rules hold across all of them:

1. **No I/O.** A caller supplies the candles; the engine supplies the answer. This is what keeps the
   market/country filter honest — an engine can only ever see one market's bars.
2. **No hidden state.** `failover.ts` takes its clock, its `sleep` and its jitter as injected
   functions, so its behaviour under a rate limit is *provable* in a test rather than timed in
   production.
3. **No guessing.** A condition that does not parse returns a character position; an instrument with
   too few bars is reported as skipped; a clause whose value cannot be computed marks the result
   `insufficientData` and the screen cannot pass on it.

### 2.1 The condition language

A grammar, not free text. `RSI < 30 and Volume > 5x`, `Price > 200 EMA and changePct(3) > 10%`.

- Fields: `price close open high low volume`; derived: `changePct(n) pctFromHigh(n) pctFromLow(n) volAvg(n)`
- Indicators: `rsi(n) sma(n) ema(n) atr(n)`; aliases `RSI` → `rsi(14)`, `200 EMA` → `ema(200)`
- Literals: `10%` is the number 10 (a readable percent unit); `5x` is 5 × the **prior** 20-bar mean,
  so a spike is not diluted by the bar that constitutes it
- Boolean: `and` `or` `not` and parentheses, with a canonical rendering that re-inserts parentheses so
  the text always means exactly what the AST does

Anything else is an error with a position. It never guesses at a phrase it cannot parse, because a
silently mis-parsed condition screens on a rule the user did not write.

### 2.2 The failover engine

Providers are tried in order; a free/local provider is listed last. Within a provider, keys are tried
in order. A `429` rotates to the next key immediately and cools the failed one; a provider-level
failure stops trying that provider's other keys and moves on. Cooled-down keys return to the pool by
themselves when their cooldown expires. On total exhaustion it raises `AllProvidersFailed` with the
per-attempt detail — the caller surfaces that; it never fabricates a result.

Scope, deliberately: it rotates keys **you own** and honours `Retry-After` and each provider's terms.
It does **not** evade anti-abuse — no user-agent spoofing, no IP rotation, no CAPTCHA bypass. Backoff
and rotation are reliability engineering; detection evasion is not.

## 3. The application layer

- `lib/screener-conditions.ts` — validation, universe screening, named-condition persistence and the
  `# SYMBOL` block splitter. Pure functions plus AsyncStorage; the language itself is untouched here.
- `lib/quant/*.ts` — one-line compatibility shims so application code imports `@/lib/quant/<x>` while
  the implementation stays in the package. `lib/quant/index.ts` re-exports the whole contract.
- `lib/design/tokens.ts` + `components/ui/premium.tsx` — the design language: semantic colour roles, a
  4-pt space scale, a type ramp with tabular figures, a **tone-based** elevation ladder (a shadow on
  near-black reads as mud; a tone step reads as raised), and one accent reserved for the single
  primary action on a screen.
- `lib/platform/*` — the seam that lets one component tree run on Android and, through
  `react-native-web`, on desktop.

## 4. The server layer

`server/routers.ts` is the tRPC surface. Providers sit behind `server/provider-registry.ts` and
`server/provider-health.ts`; `server/optional-providers.ts` and `server/parallel-providers.ts` hold
the retry/fan-out behaviour. `server/collector-runtime.ts` and the schedulers drive ingestion. The
failover engine is the runtime layer those providers should sit behind: the same rotation and quota
tracking, applied to every credential-bearing call.

## 5. Market isolation

The product's hard rule is that choosing India shows India everywhere. It is enforced structurally,
not by convention: market identity is a parameter that reaches the data layer, seeds are
market-scoped, and the pure engines only ever receive one market's bars. A cross-market leak is a
bug in the caller, never something an engine can introduce.

## 6. Honest states

Every surface has four states and they are never conflated: **live** (a provider answered),
**stale** (data with an old timestamp, shown with its age), **unavailable** (no provider configured —
said plainly), and **insufficient data** (the maths could not run). A seed or fixture is always
labelled as one. The condition screener, for example, screens what you paste and says that a live
multi-market scan needs a configured provider, rather than inventing numbers.

## 7. Build and delivery

- **Android APK** — `.github/workflows/android-apk.yml` (Gradle `assembleRelease`, signed v2/v3).
- **Windows EXE** — `.github/workflows/desktop-exe.yml` (web bundle → Electron → NSIS + portable),
  triggered by hand or on push. One command, `pnpm build:win`, shared with the local path.
- **Off-GitHub** — `.gitlab-ci.yml`, `.woodpecker.yml`, `build.sh` and `Dockerfile.build`.
- **Verification** — `scripts/verify_artifacts.py` proves every artifact is non-zero and carries the
  right magic bytes before anyone trusts it.

## 8. Where the brief lands

| Requirement | Where it lives now |
|---|---|
| Dual momentum scanner (gainers / crashers, 1–7 days, country-filtered) | `quant-engine/momentum.ts` (engine) + a caller that supplies market-scoped bars |
| Automated research on a ≥10% move | `quant-engine/momentum.ts` produces the trigger and the volume multiple; `server/research-desk.ts` + `server/news-tracker.ts` assemble the why and the news |
| Universal failover & key rotation | `quant-engine/failover.ts` |
| Custom condition screener | `quant-engine/conditions.ts` + `lib/screener-conditions.ts` + `app/condition-screener.tsx` |
| Free / open-source sourcing | the `free-resource-hunter` method — discover, validate live, integrate |
| Open-source research references (OpenBB, Qlib, yfinance, PKScreener, …) | studied as patterns, never vendored; the maths is re-implemented in `quant-engine` so it is tested and licence-clean |

## 9. Rules this architecture holds to

- Pure mathematics in `packages/`, never in a screen.
- A dependency arrow points one way: `app → components → lib → packages`.
- Every engine is deterministic and unit-tested; no `Math.random()` in a decision, no look-ahead.
- Missing data is reported, never smoothed over.
- A capability is not "done" until it is reachable in the UI and covered by a test.
