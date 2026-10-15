# AnalyzerX — authoritative completion checklist

Written against the actual repository state, verified file by file. Every item is
numbered and marked as it is finished. Nothing is marked DONE without its check having
been run and its output recorded.

**Starting state (verified, not assumed):** the previous session's market-isolation fixes
were performed locally but **never committed**, so the repository still contained the
India-hardcoded sector path, no `lib/market-sector-universe.ts`, ungated Indian provider
tiers, and a gate with no structural rules. Items 1–9 below exist because of that.

Legend: `DONE` · `IN PROGRESS` · `OPEN` · `BLOCKED (reason)`

---

## A. Re-land the market-isolation work that was lost (highest priority)

| # | Item | Status |
|---|---|---|
| 1 | Add `lib/market-sector-universe.ts` — the single per-market sector universe | DONE |
| 2 | Make `getSectorConstituents` take a `marketId`, use that market's universe, and gate the Indian quote API and both NSE flow feeds on `IN` | DONE |
| 3 | Make `getAvailableSectorNames(marketId)` per-market | DONE |
| 4 | Router `sectorConstituents` must actually pass `input.marketId` (it declared and discarded it) | DONE |
| 5 | Router `sectorNames` must take a `marketId` | DONE |
| 6 | Local link `market.sectorNames` must use the requested market, not `NSE_INDEX_FILES` | DONE |
| 7 | `analyzeFundamentals` must gate Indian provider tiers on `IN` and SEC on `US` | DONE |
| 8 | `getPositioningCoverage` must take a `marketId` and gate the NSE report | DONE |
| 9 | Router `positioning` must pass the market | DONE |
| 10 | Router `institutionalFlows` must be market-scoped (NSE report is India-only) | DONE |
| 11 | Screens `(tabs)/sectors.tsx` and `(tabs)/flows.tsx` must pass `marketId` to `institutionalFlows` | DONE |

## B. The gate must catch this class of bug

| # | Item | Status |
|---|---|---|
| 12 | Add rule `declared-but-unused-marketId` — a procedure declaring `marketId` whose handler never forwards it | DONE |
| 13 | That rule must follow **whole-`input` forwarding** so `f(input)` where `f` uses `marketId` is not a false positive | DONE |
| 14 | Add rule `ungated-india-source` — an India-only source called with no market gate in scope | DONE |
| 15 | Exclude function *definitions* (not just calls) from the ungated-source rule | DONE |
| 16 | Gate must pass clean, with any remaining excuse carrying a written reason | DONE |

## C. Screen-level audit — every surface must follow the active market

| # | Item | Status |
|---|---|---|
| 17 | News: reader, list, archive, per-market feeds and symbols | OPEN |
| 18 | Chat: market chat starter prompts, symbol resolution, source scope | OPEN |
| 19 | Analyze: symbol search, fundamentals, peer comparison, deep score | OPEN |
| 20 | Stock charts: symbol default, history request, indicator inputs | OPEN |
| 21 | Filings: company search, archive, official links | OPEN |
| 22 | Recommendations and alerts: persisted recommendations, smart alerts, storylines | OPEN |
| 23 | Reports: PDF export header, filename, currency, and the market label inside it | OPEN |
| 24 | Sectors and flows screens: headings, currency, empty states | OPEN |
| 25 | Graph and research workspace: entity and evidence scope | OPEN |

## D. Verification

| # | Item | Status |
|---|---|---|
| 26 | Isolation gate passes clean | OPEN |
| 27 | Per-market independence suite passes (10 markets, 45 pairs) | OPEN |
| 28 | Manifest, lifecycle, screener, indicator, chart-geometry suites pass | OPEN |
| 29 | `pnpm check` (strict tsc) passes | OPEN |
| 30 | CI build green, per-ABI APKs under 100 MB | OPEN |
| 31 | Emulator verification passes | OPEN |
| 32 | Final report with DONE / BLOCKED per item | OPEN |

## E. Known-open, outside this pass

| # | Item | Status |
|---|---|---|
| 33 | Country data packs: production signing key, CI signing step, hosted pack assets | BLOCKED — needs a repository-owner secret and published release assets; the manifest, verification and download code are built and tested |
| 34 | ARM64 hardware execution | BLOCKED — no physical device; the CI emulator is x86_64 |
| 35 | Release signing (Play will reject a debug-signed APK) | BLOCKED — needs `ANDROID_KEYSTORE_BASE64` and password secrets only the owner can set |
| 36 | Read all 41 screens line by line | OPEN — the pattern scan covers known India-specific literals, not every possible market assumption |
