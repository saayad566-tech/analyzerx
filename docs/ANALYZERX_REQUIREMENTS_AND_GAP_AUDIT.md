# AnalyzerX — Requirements and Gap Audit

Status vocabulary used throughout (per the master directive):
VERIFIED · FAILED · BLOCKED · NOT RUN · PARTIALLY VERIFIED

Authoritative version at time of writing: **3.15.0 / versionCode 31500** (from
`package.json`, which is the single source of truth; `app.config.ts`,
`eas.json` and `android/app/build.gradle` are derived from it).

---

## 1. Capability matrix (Phase 0)

| Capability | Status | Evidence |
|---|---|---|
| Read and inspect project files | VERIFIED | Files read from the fetched tree |
| Browse repository, search across files | VERIFIED | ripgrep across the checkout |
| Access GitHub repository (read) | VERIFIED | Branch `analyzerx/mandate-remediation` fetched at commit `65feb137` |
| Write to GitHub (commit) | VERIFIED | Commits pushed via the Contents API |
| Create and edit files | VERIFIED | New modules and tests committed |
| Execute shell commands | VERIFIED | bash in the sandbox (Debian 12, uid 1000) |
| Internet research | VERIFIED | Web search against official sources |
| **Android SDK / Gradle / JDK / Kotlin** | **UNAVAILABLE** | `java`, `javac`, `gradle`, `adb` all absent; apt installs unsupported |
| Run the full vitest suite locally | PARTIALLY VERIFIED | CI runs it; locally only esbuild + strict `tsc` + node harnesses (no dependency install) |
| Build APK / AAB | PARTIALLY VERIFIED | **Only via GitHub Actions CI**, never in this sandbox |
| Android emulator or physical device | UNAVAILABLE | No adb, no emulator, no device |
| Access CI workflows and results | VERIFIED | Runs 48–72 inspected, logs read |
| Commit or push changes | VERIFIED | Authorized by the user; all work committed to the branch |

**Consequence, stated plainly:** every UI behaviour claim in this project is
unverified on hardware. An APK that builds is not an APK that runs.

---

## 2. Functional requirements and gaps

### P0 — critical (build, integrity, core correctness)

| # | Requirement | Status | Evidence / gap |
|---|---|---|---|
| P0-1 | The app builds a signed release APK | VERIFIED | CI run 72 green; `analyzerx-3.15.0-72.apk`, sha256 `41658cbd…a05c7` |
| P0-2 | Signing is stable across releases | VERIFIED | Builds 57–72 share cert SHA-256 `fac61745…33b9c`; earlier builds 48–56 each had a different cert, which caused `INSTALL_FAILED_UPDATE_INCOMPATIBLE (-7)` |
| P0-3 | No cross-market data mixing | PARTIALLY VERIFIED | Isolation modules built and unit-tested; **not yet threaded through every screen's live query key and formatter** |
| P0-4 | No fabricated data, no placeholder states | PARTIALLY VERIFIED | Several stubs removed (cross-market `"RELIANCE"` fallbacks, blanket `.NS` suffix); a full sweep is NOT RUN |
| P0-5 | Secrets never in the client bundle | VERIFIED | Provider keys are server-side only; FinBERT returns `not-configured` rather than a fake result |

### P1 — essential functionality

| # | Requirement | Status | Evidence / gap |
|---|---|---|---|
| P1-1 | Keyboard does not obscure the composer | PARTIALLY VERIFIED | `lib/keyboard-avoidance.ts` + `hooks/use-keyboard-inset.ts` wired into `screen-container.tsx` and `market-chat.tsx`; **no device verification possible** |
| P1-2 | Per-market currency, grouping and dates | PARTIALLY VERIFIED | `lib/market-format.ts` built and tested (₹ vs $, 12,34,567 vs 1,234,567); not yet called from every screen |
| P1-3 | Market status in the exchange's timezone | PARTIALLY VERIFIED | `lib/market-session.ts` built and tested (IN open while US closed at the same instant); not yet rendered on the home screen |
| P1-4 | Search history isolated per market | PARTIALLY VERIFIED | `lib/market-scoped-store.ts` built and tested; live storage not yet migrated to scoped keys |
| P1-5 | Screener does not crash | VERIFIED | `lib/safe-text.ts` guards; crash fixed in 3.7.1 |
| P1-6 | Market-cap filter actually filters | VERIFIED | Fixed in 3.8.0 |
| P1-7 | Honest per-market coverage | VERIFIED | `lib/market-coverage.ts`; "PLANNED" removed, per-category status shown |

### P2 — high-value usability and reliability

| # | Requirement | Status | Evidence / gap |
|---|---|---|---|
| P2-1 | Redundant provider fallback | PARTIALLY VERIFIED | `lib/provider-chain.ts` engine built and tested; wired into some paths, NOT all |
| P2-2 | Bounded auto-refresh | VERIFIED | `refetchInterval` on snapshot/flows/sectors/screener |
| P2-3 | Global market registry (country/exchange/MIC) | VERIFIED | `lib/market-registry.ts`, 199 countries transcribed from the supplied dataset |
| P2-4 | Responsive/tablet layout | NOT RUN | No tablet target or device |
| P2-5 | Accessibility audit | NOT RUN | Not performed |

### P3 — optional / advanced

| # | Requirement | Status | Evidence / gap |
|---|---|---|---|
| P3-1 | Local LLM runtime state model | PARTIALLY VERIFIED | Lifecycle modules exist; explicit Not-Downloaded→Ready→OOM state machine not completed |
| P3-2 | Real on-device inference | NOT RUN | Cannot execute native inference here |
| P3-3 | Hosted auth (sign-up/OTP/social) | BLOCKED | Needs a backend + provider credentials; conflicts with the zero-cost/offline constraint |
| P3-4 | Import pipeline (PDF/HTML/CSV) | NOT RUN | Not built |
| P3-5 | Hybrid assistant intent router | NOT RUN | Assistant exists; the dual-persona intent router does not |

---

## 3. Market coverage (Phase 5)

Per-market status is declared per category in `lib/market-coverage.ts` as
available / partial / portal / licensed, each with its backing source. Summary:

- **India** — 7 of 7 categories available (deepest market).
- **United States** — quotes, news, macro and SEC EDGAR filings available; flows
  via quarterly 13F; options delayed.
- **United Kingdom, Canada, Australia, Singapore, Hong Kong** — quotes, news and
  macro available; filings are **portal-only** (no free machine-readable endpoint).
- **Japan** — filings via EDINET, which needs a free registered key (inert without one).
- **Germany, France** — filings via EU ESEF, machine-readable but coverage-limited.

Real-time exchange quotes are **licensed data** for every market and are not claimed.
