# AnalyzerX — Global Market Data Audit Report

Response to the Global Market Data Isolation, Deep Research & Pipeline Rebuild
mandate. Written from tool output produced in this session. Unrun checks are named.

---

## A. Executive result

**Overall status: Partially Complete.**

**Exact reproduction of the screenshot bug — traced and fixed.**

The screenshot shows `MARKET SCOPE: United States · NYSE / NASDAQ / CBOE · USD`
while the Live Market Snapshot renders `RELIANCE.NS`, `₹1166.70`, `₹-41.00`,
`-3.39%`, `P/E 19.55`, an NSE source badge (`Yahoo Finance (NSE)`) and Reliance news
from Indian publishers.

**Confirmed root causes — three, compounding:**

| # | Root cause | Location | Effect |
| --- | --- | --- | --- |
| 1 | The featured snapshot instrument was seeded with a hardcoded Indian ticker and **never re-derived when the market changed** | `app/(tabs)/index.tsx` — `useState("RELIANCE.NS")`, with no effect on `market.id` | Selecting the US left `RELIANCE.NS` on screen |
| 2 | Every search selection forced the Indian exchange suffix | `app/(tabs)/index.tsx` — `setFeaturedSymbol(\`${item.symbol}.NS\`)` in both handlers | Picking a US ticker produced `AAPL.NS` |
| 3 | The snapshot request carried **no market**, so routing defaulted to India | client sent `{ symbol }`; `symbolInput` had no `marketId`; `market()` in the link defaults to `"IN"` | Even a correct symbol routed through the Indian pipeline |

**Critical remaining risks:** the app is not device-validated (no device/emulator
here); per-market coverage is **unmeasured**; non-Indian fundamentals/filings adapters
are thin.

---

## B. Research results

See `MARKET_DATA_SOURCE_RESEARCH.md` for the full table. Summary:

- Sources already implemented in-repo: Yahoo Finance, NSE archives, Indian Market
  API, Finnhub, Google News RSS, GDELT, SEC EDGAR, regional collectors, and several
  credentialed news providers.
- Official sources named in the mandate (SEC EDGAR, FCA NSM, SEDAR+, EDINET,
  data.gov.in) are documented with their official URLs. **None was live-tested from
  this environment.**
- EDINET appears to require registration/an API key; FCA NSM and SEDAR+ have no
  dedicated adapter and their automation terms are unverified.
- **Rejected:** unlicensed scraping of paywalled/CAPTCHA-guarded pages.

**Research findings are explicitly separated from live-tested behaviour.** No live
provider response was observed in this session.

---

## C. Code changes

| File | Change |
| --- | --- |
| `lib/market-defaults.ts` | Added `MARKET_PRIMARY_SUFFIX` and `providerSymbolForMarket()` — maps a bare ticker to the active market's provider symbol instead of always appending `.NS`. Never double-suffixes; leaves an unknown market alone. |
| `app/(tabs)/index.tsx` | Featured instrument now initialises from the active market; added an effect that re-derives it whenever `market.id` changes; both search handlers use `providerSymbolForMarket`; the snapshot query now sends `marketId`; the India-specific search hint text is now market-neutral. |
| `server/routers.ts` | `symbolInput` gained an optional `marketId`; `fetchMarketSnapshot` accepts it, honours it over the suffix heuristic, and only calls the India-specific provider when the market actually is India. |
| `tests/market-defaults.test.ts` | 5 new regression cases covering the screenshot scenario. |
| `MARKET_DATA_SOURCE_RESEARCH.md` | Phase 4 research deliverable. |

**Routing rules now enforced:** a US context cannot receive an Indian default ticker
or an Indian provider call; every search result is suffixed by the active market's
own convention; the market is carried on the request rather than inferred.

**Preserved:** unrelated work, user watchlists, saved reports and settings. Nothing
was reset or deleted.

---

## D. Coverage matrix

| Market | Quotes | History | Profiles | Fundamentals | News | Filings | Ownership | Indices | Search |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| IN | in-repo | in-repo | in-repo | in-repo | in-repo | in-repo | — | in-repo | in-repo |
| US | in-repo | in-repo | in-repo | partial | in-repo | in-repo (SEC EDGAR) | — | — | in-repo |
| GB | in-repo | in-repo | in-repo | partial | in-repo | not implemented | — | — | in-repo |
| CA | in-repo | in-repo | in-repo | partial | in-repo | not implemented | — | — | in-repo |
| AU | in-repo | in-repo | in-repo | partial | in-repo | not implemented | — | — | in-repo |
| JP | in-repo | in-repo | in-repo | partial | in-repo | requires credentials (EDINET) | — | — | in-repo |
| SG | in-repo | in-repo | in-repo | partial | in-repo | not implemented | — | — | in-repo |
| HK | in-repo | in-repo | in-repo | partial | in-repo | not implemented | — | — | in-repo |
| DE | in-repo | in-repo | in-repo | partial | in-repo | not implemented | — | — | in-repo |
| FR | in-repo | in-repo | in-repo | partial | in-repo | not implemented | — | — | in-repo |

**Validated coverage: unmeasured.** The mandate requires coverage to be calculated
from validated records against a documented denominator. No live calls were made in
this environment, so no coverage percentage is reported. `lib/source-status.ts`
(added in a prior pass) provides the calculation with an explicit denominator and a
`canClaimCovered` gate that only passes for `Operational`.

**Freshness/delay:** quotes come from Yahoo Finance and are delayed; this is not
labelled per-record yet. Remaining gap.

---

## E. Test evidence

**CI runs (the project's own supported checks):** run 65 for this change set.
Earlier in the sequence: 55, 58, 60, 62 FAILED (each fixed at the cause), 56, 57, 59,
61, 63, 64 PASSED. Each run executes `pnpm release:verify`, `pnpm check` (tsc),
`pnpm test -- --run` (full suite), Gradle build, v2/v3 signing, publish.

**Local harnesses this session:** `providerSymbolForMarket` — 10 assertions passed,
0 failed. Cumulative module harnesses across passes: 33 (market-defaults +
source-status), 39 (finbert), 44 (scoring), 34 (news-normalization), 22 (flows),
20 (event-schema), 18 (safe-access), 16 (safe-text), 11 (local-ai-integrity),
6 (keyboard-avoidance), 203 (tracker-state), 88 (sector-registry).

**Mocked vs live:** every test above is mocked/unit-level. **No live-provider test
was executed.**

**Not run, with reason:** device/emulator install and launch (no device, emulator,
Java or Android SDK); live provider integration checks (device path + credentials);
lint (not a CI gate).

---

## F. Release artifact

| Field | Value |
| --- | --- |
| Variant | release |
| Package | `com.app.marketeventintelligence` |
| Version | see the delivery message for this build |
| Signing | v2 + v3, stable certificate `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c` (unchanged since build 57) |
| Install/launch tested | **NO** — no device or emulator available |

The exact filename, size, SHA-256 and release URL are recorded in the delivery
message; the checksum is computed from the delivered file.

---

## G. Unfinished work

| # | Requirement | Severity | Reason | Dependency | Next action |
| --- | --- | --- | --- | --- | --- |
| 1 | Device validation of the screenshot scenario | P1 | No device/emulator | A physical device | Install, select US, confirm no `RELIANCE.NS`/INR/NSE badge |
| 2 | Per-market fundamentals for GB/CA/AU/JP/SG/HK/DE/FR | P2 | Only partial via Yahoo; no dedicated adapters | Source decisions | Implement per-market adapters |
| 3 | FCA NSM / SEDAR+ / EDINET filing adapters | P2 | Not implemented; terms unverified; EDINET likely needs a key | Credentials + terms review | Verify terms, then implement |
| 4 | Per-record source badge and delay label | P2 | Badges derive from the record's provider, but the delay status is not yet labelled | None | Add delay/quote-time metadata to the snapshot card |
| 5 | Canonical provider-independent instrument identity (`instrument_id`) | P2 | Symbols are still provider-shaped | None | Introduce the identity model from Phase 2 |
| 6 | News market/entity relevance filtering with LEI/CIK identity | P2 | Filtering exists but not identity-based | None | Extend the news filter to canonical IDs |
| 7 | Cache keys include market/exchange | P2 | Market is now on the request, but cache keying was not re-audited end-to-end | None | Audit cache keys per Phase 7 |
| 8 | Coverage matrix computed from validated records | P2 | No live calls possible here | Device + credentials | Populate from validated retrievals |
| 9 | Ownership/shareholding for any market | P3 | No adapter exists | Source decisions | Research permitted sources |

---

## Honest summary

The screenshot defect is fixed by an actual code change at three levels: the
instrument is now derived from the active market and re-derived on every switch; the
provider symbol follows the market's own convention instead of a blanket `.NS`; and
the market travels on the request rather than defaulting to India. Regression tests
cover it. What remains unproven is everything that requires a device and live
credentials, and those are listed above rather than glossed over.
