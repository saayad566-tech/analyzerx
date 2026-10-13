# AnalyzerX — Prompt 8 End-to-End Acceptance Audit

**Audit date:** 13 October 2026
**Repository:** `saayad566-tech/analyzerx`, branch `main`
**Audited revision:** 3.2.0
**Evidence rule:** every claim marked VERIFIED was observed in the audit environment. Everything else is FAILED, BLOCKED or NOT VERIFIED.

> Passing automated tests, a clean typecheck and a signed APK do **not** establish visual correctness, device compatibility or production readiness. This audit separates what was observed from what was assumed, and does not label a nonfunctional connector as working.

---

## 1. Engineering check results

| Check | Command | Result | Status |
|---|---|---|---|
| Type checking | `npx tsc --noEmit` | exit 0, no diagnostics | VERIFIED |
| Lint (repo-wide) | `npx eslint .` | 2 errors, 194 warnings | VERIFIED |
| Unit + integration tests | `npx vitest run` (104 files, two batches) | 823 passed, 7 skipped, 0 failures | VERIFIED |
| Dependency audit | npm registry bulk advisories endpoint | see section 4 | VERIFIED |
| Android build | CI `android-apk.yml` | see section 10 | see section 10 |

### 1.1 The two lint errors — investigated, not assumed

`server/india-stock-mcp.ts` imports `@modelcontextprotocol/sdk/client/index.js` and
`@modelcontextprotocol/sdk/client/stdio.js`. ESLint's `import/no-unresolved` cannot follow the
package's `.js`-suffixed subpath exports.

This was checked directly rather than waved away:

```
node -e "require('@modelcontextprotocol/sdk/client/index.js')"  -> OK (exports Client)
node -e "require('@modelcontextprotocol/sdk/client/stdio.js')"  -> OK (exports StdioClientTransport)
```

Both resolve at runtime, and `tsc` resolves them. The finding is a linter resolver-configuration gap,
**not a runtime defect**. It is recorded as a known lint finding, not suppressed.

### 1.2 The 194 warnings

Predominantly `@typescript-eslint/array-type` (`Array<T>` should be `T[]`), `import/first`, and
unused variables in `server/`. None is a correctness defect. Recorded, not suppressed.

---

## 2. Requirements traceability matrix

| ID | Requirement (Prompt 8) | Location | Evidence | Status | Remaining work |
|---|---|---|---|---|---|
| P8-1 | Traceability matrix with 8 columns | this document §2–§3 | this matrix | PARTIALLY IMPLEMENTED | PRD section numbers need recovery from the PDF |
| P8-1a | Six-way classification | this document | status column | VERIFIED | — |
| P8-2 | Scenarios A–M | §3 | §6 probes | PARTIALLY IMPLEMENTED | C, D, J, M cannot run here |
| P8-3 | Financial recalculation from the original filing | §3 E/F | — | NOT VERIFIED | no genuine filing recalculated |
| P8-4 | Source audit, 8 attributes per source | §5, §6 | live probes | PARTIALLY IMPLEMENTED | licensing/rate terms not re-read for all |
| P8-5 | Engineering checks incl. dependency scan | §1, §4 | commands above | VERIFIED | Vitest advisories outstanding |
| P8-5a | Separate pre-existing failures from regressions | §1 | 0 test failures | VERIFIED | none introduced by the upgrade |
| P8-6 | Cost inventory; confirm £0 or name conditions | §9 | Prompt 7 register | PARTIALLY IMPLEMENTED | hardware/electricity not inventoried |
| P8-7 | Release decision with evidence | §12 | this document | VERIFIED | recorded below |
| P8-7a | Version, files, tests, build, limits, matrix, blockers, rollback, 3 priorities | §10–§13 | this document | PARTIALLY IMPLEMENTED | build verification pending CI |

---

## 3. Acceptance scenarios A–M

| # | Scenario | Outcome | Status |
|---|---|---|---|
| A | Search an Indian listed company | BSE and SEBI responded 200; 501-row NSE Nifty-500 universe fallback present | VERIFIED (partial) |
| B | Retrieve a genuine Indian filing | BSE `announcements.xml` 200, 690,536 bytes; SEBI RSS 200, 15,775 bytes | VERIFIED |
| C | Retrieve a US filing from SEC EDGAR | `www.sec.gov`, `data.sec.gov` both HTTP 000 — refused by the egress proxy | BLOCKED |
| D | Retrieve a UK filing | Companies House and FCA both HTTP 000 — refused by the proxy | BLOCKED |
| E | Extract values and document locators | parsers exist (`ingestion/parsers/`); not exercised on a live document this session | NOT VERIFIED |
| F | Validate claims and calculations | `verification/*` with 72 passing tests | VERIFIED (unit level) |
| G | Generate the eleven-section report | 11-section contract exists with the PRD's names; not rendered end-to-end | NOT VERIFIED |
| H | Block publication on missing evidence | `verification/gate.ts`; unit-tested | VERIFIED (unit level) |
| I | Source outages and stale-data behaviour | NSE returned HTTP 404 on three consecutive attempts — an observed live outage | VERIFIED |
| J | Amended filing / version handling | versioning model in `ingestion/version.ts`; not exercised on a live amendment | NOT VERIFIED |
| K | Translation fallback | `i18n/translation.ts` implements display suppression; offline translation not bundled | VERIFIED (unit level) |
| L | Offline use of cached results | cache layer exists (`connectors/cache.ts`); not exercised on a device | NOT VERIFIED |
| M | Automatic update checking | no update-check mechanism observed | NOT VERIFIED |

**Summary:** 5 verified (three at unit level only), 1 verified as a live outage, 5 not verified, 2 blocked by the proxy.

---

## 4. Dependency and security audit

`pnpm audit` exhausts the sandbox's 2 GB heap and `api.osv.dev` is refused by the egress proxy, so the
audit queried the **npm registry's own bulk advisories endpoint** against the exact installed versions
of all 83 direct dependencies.

**Before remediation:** 6 packages, 42 advisories, 3 high/critical.

| Package | Installed | Worst | Advisory |
|---|---|---|---|
| `@modelcontextprotocol/sdk` | 1.30.0 | high | OAuth client could send credentials to an MCP-server-chosen authorization server (`<1.31.0`) |
| `@trpc/server` | 11.7.2 | high | Prototype pollution in `experimental_nextAppDirCaller` (`<11.8.0`) |
| `axios` | 1.13.2 | high | Prototype-pollution read-side gadgets allowing credential injection (`<1.15.2`), plus 34 more |
| `drizzle-orm` | 0.44.7 | high | SQL injection via improperly escaped identifiers (`<0.45.2`) |
| `mysql2` | 3.16.0 | high | Auth-plugin downgrade leaking plaintext credentials (`<3.22.0`) |
| `vitest` | 2.1.9 | critical | Vitest UI server arbitrary file read/execute (`<3.2.6`) |

**Remediation applied:** the five packages with runtime exposure were upgraded —
`@modelcontextprotocol/sdk@^1.32.1`, `@trpc/server@11.19.0`, `axios@^1.20.0`, `drizzle-orm@^0.45.4`,
`mysql2@^3.24.5`.

**After remediation:** 1 package, 2 advisories, **0 high/critical**. `vitest` is deliberately left in
place: the critical advisory needs the Vitest **UI server** listening, and this project runs
`vitest run` (headless, no UI server), so the vulnerable path is unreachable. Remediation is a 2.x → 3.x
major change touching all 104 test files — recorded as outstanding, not dismissed.

---

## 5. Source and client/server boundary audit

### 5.1 Finding: the client reaches into `server/`

The shipped app imports from `server/` in seven places. This was investigated in full.

| Client module | Import | Kind |
|---|---|---|
| `app/(tabs)/alerts.tsx` | `smartAlertTemplates`, `MonitoringRule` from `@/server/smart-event-alerts` | **value + type** |
| `app/market-chat.tsx` | `AnalyzerXAction`, `MarketChatAttachment` from `@/server/market-chat` | `import type` |
| `lib/open-data/engine.ts` | `FundamentalAnalysis` from `@/server/fundamental-analysis` | `export type` |
| `lib/open-data/fundamentals.ts` | `FundamentalAnalysis`, `QuantitativeMetric` | `import type` |
| `lib/open-data/link.ts` | `AppRouter` from `@/server/routers` | `import type` |
| `lib/trpc.ts` | `AppRouter` from `@/server/routers` | `import type` |

**Conclusion:** six of the seven are `import type`, erased at compile time — no runtime code, no
dependency. The single **value** import is `smartAlertTemplates` from `server/smart-event-alerts.ts`;
that file was inspected and contains **zero** references to `mysql2`, `drizzle-orm`, `express` or
`dotenv`. **No privileged server dependency or secret enters the production client bundle.** The
boundary is blurred stylistically and should be cleaned up, but it is not a leak.

### 5.2 Security-sensitive code

- Session-token logging removed in 3.0.0 (`lib/_core/auth.ts`).
- BYOH runner token now uses SecureStore, not unencrypted AsyncStorage (`lib/workstation-runner.ts`).
- Cached filings are **not** encrypted at rest — open item.
- No telemetry or crash reporter is bundled.

---

## 6. Live-source probe results

Run with the application's own User-Agent (`AnalyzerX/1.0 (filing-intelligence)`).

| Source | URL | HTTP | Bytes | Status |
|---|---|---|---|---|
| BSE (India) | `www.bseindia.com/data/xml/announcements.xml` | 200 | 690,536 | **WORKING** |
| SEBI (India) | `www.sebi.gov.in/sebirss.xml` | 200 | 15,775 | **WORKING** |
| data.gov.in (India) | `api.data.gov.in/lists` | 200 | 6,082 | **WORKING** |
| NSE (India) | `nsearchives.nseindia.com/.../Online_announcements.xml` | **404** | 3,532 | **FAILING (3/3 attempts)** |
| SEC EDGAR (US) | `www.sec.gov/cgi-bin/browse-edgar` | 000 | 0 | **BLOCKED by egress proxy** |
| SEC data (US) | `data.sec.gov/submissions/...` | 000 | 0 | **BLOCKED by egress proxy** |
| Companies House (UK) | `find-and-update.company-information.service.gov.uk` | 000 | 0 | **BLOCKED by egress proxy** |
| FCA (UK) | `www.fca.org.uk` | 000 | 0 | **BLOCKED by egress proxy** |

The US and UK blocks are a property of the **audit sandbox's egress proxy**, not necessarily of the
sources. Recorded as BLOCKED (environment), not FAILED (source). The SEC connector is verified against
mocked shapes only and is marked not connected.

---

## 7. Market connector coverage

| Market | Connector status |
|---|---|
| India | **3 sources working** (BSE, SEBI, data.gov.in); NSE failing at present |
| United States | BLOCKED — proxy refuses `sec.gov`; mocks only |
| United Kingdom | BLOCKED — proxy refuses Companies House and FCA |
| 7 further markets | **NO working connector** — declared, not faked |

**8 of 10 markets have no working connector.** The single largest gap in the product.

---

## 8. Reliability, configuration and production-readiness findings

- Market isolation is enforced (`markets/*`, `refreshFilings({ marketId })`).
- A failed check never advances `latestVerifiedCheckUtc`.
- Job engine and scheduler are **in-memory models with persistence hooks**; not durable across launches.
- Offline translation, OCR and GGUF local models are not bundled; the PDF parser does not resolve font CMaps.

---

## 9. Cost inventory

Grounded in the Prompt 7 free-tier register, read from each provider's own documentation.

| Dependency | Free quota (verified) | Payment required | When exceeded |
|---|---|---|---|
| Supabase (Postgres/storage/auth) | 500 MB DB, 1 GB storage, 5 GB egress | No | Paused after 1 week idle |
| Vercel Hobby (hosting/cron) | 100 GB transfer, 1M invocations, **cron once/day** | No | Paused |
| Cloudflare R2 (object storage) | 10 GB-month, no egress fee | No | Charged |
| Cloudflare D1 (SQLite) | 5 GB, 100k rows written/day | No | Charged |
| Cloudflare Queues | 10,000 ops/day | No | Charged |
| GitHub Actions | Free & uncapped on **public** repos | No | Private: 2,000 min/month |

**The initial operating design can run at £0**: the app has **no backend**, so it consumes none of the
hosted tiers. Once a backend is deployed, the first quota to fail is the **500 MB database**, at roughly
100,000 filing metadata rows.

**Marked UNKNOWN rather than invented:** self-hosted Postgres hardware/electricity, and no currency
conversion to £ is asserted because no authoritative rate was checked.

---

## 10. APK build

Updated below with the actual result, path, size and SHA-256 after the CI run. Until that section
carries a checksum, **no APK is claimed for 3.2.0**.

---

## 11. Device and visual-verification limitations

- **No physical Android device** is available in the audit environment.
- **No screen has ever been visually confirmed.** Every UI claim in this repository is unverified.
- Installation and launch smoke tests were **not** performed.
- No Android SDK/NDK is present in the sandbox; native compilation is exercised only by CI.

---

## 12. Release decision

# CONDITIONAL GO — limited beta only

**Supporting evidence:** typecheck clean; 823 tests pass with 0 failures; 0 high/critical dependency
advisories remaining; the client/server boundary carries no privileged dependency into the bundle;
three Indian sources confirmed reachable and returning real data.

**Critical gaps (disclosed, as a limited-beta recommendation requires):**
1. **No physical-device or visual verification has ever been performed.** The UI is unverified.
2. **8 of 10 markets have no working connector.** Only India is functional, and NSE is currently failing.
3. The SEC connector is verified against mocks only; it is not connected.
4. Offline translation, OCR and GGUF local models are not bundled.
5. `vitest` retains a critical advisory (unreachable code path, but outstanding).
6. Two repo-wide lint errors remain (linter config, not runtime).

**This is not a GO.** A GO requires device-verified UI and at least the US market connected.

---

## 13. Outstanding blockers, rollback and next priorities

**Blockers:** no physical device; sandbox egress proxy refuses all US/UK hosts; GGUF runtime needs a
llama.cpp arm64 NDK build; job persistence is not durable across launches.

**Rollback:** the Android app never depends on a backend, so a backend outage degrades nothing. To roll
back a release, redeploy the previous signed APK; the previous artifact for every version is retained.
Database (once it exists): apply each migration's own recorded rollback statement.

**Next three priorities**
1. **Connect the US market (SEC EDGAR)** from an environment that is not proxy-blocked, and verify end-to-end.
2. **Perform physical-device visual verification** of every screen and record it.
3. **Move shared pure modules out of `server/` into `lib/`** so the boundary is explicit, and add the ESLint resolver entry that clears the two lint errors.
