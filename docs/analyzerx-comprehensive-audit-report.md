# AnalyzerX Comprehensive A-to-Z Audit Report

**Audit role:** Principal Full-Stack Architect, Security Engineer, and Automated QA Lead  
**Audit date:** 2026-08-17  
**Workspace:** `/home/ubuntu/market-event-intelligence`

## Executive assessment

AnalyzerX is structurally healthy and builds successfully after the audit patches, but it is not accurate to describe every external provider as live and healthy. The application now fails closed for missing credentials, protects administrative mutations, uses bounded outbound requests, and preserves provider isolation. Public research screens retain access to safe read-only provider metadata while collector execution and provider telemetry remain administrative operations.

The deterministic application suite completed with **125 passing tests and 2 skipped tests** in the final run. Three external credential/provider probes failed because their upstream services returned HTTP 429 or 403: the Indian API rate limit, GNews access rejection, and TinyFish access rejection. These failures are isolated and must not be reclassified as application defects or hidden as successful data.

The dependency audit reported **142 advisories: 6 low, 53 moderate, 80 high, and 3 critical**. The report includes substantial transitive exposure through the Expo/React Native toolchain and MCP/validation dependencies. A blanket upgrade is not safe without an Expo-compatible upgrade matrix; this remains a release blocker for a security-sensitive production deployment and requires a dedicated dependency remediation sprint.

## 1. Architecture and core-logic findings

| Area | Finding | Severity | Disposition |
|---|---|---:|---|
| App entry and routing | Expo Router exports 24 static routes including Live Events, Flows, Screener, Admin, Account, Market Chat, Storylines, Graph, Sectors, Alerts, Support, Research Workspace, company detail, OAuth callback, and not-found handling. | Informational | Verified by production Expo export. |
| API architecture | Express hosts the API and tRPC router; public read-only research procedures are separated from administrative mutations. | Good | Preserved and regression-tested. |
| Admin UI | The Admin screen used `useMemo` without a stable explicit React import and did not clearly render authorization failures. | High | Fixed. It now imports `useMemo` and renders explicit Admin access or operations-data error states. |
| Public data access | Earlier authorization hardening accidentally made provider/source metadata unavailable to public screens that use it for freshness and coverage summaries. | High | Fixed by keeping read-only registry/catalog/status procedures public while protecting run/ingest/telemetry mutations. |
| Async operations | Core Data API and heartbeat outbound calls now use bounded timeouts. News extraction has deterministic fallback behavior. | Medium | Fixed and tested. |
| News LLM fallback | Permanent account exhaustion produced repeated per-article extraction warnings. | Medium | Fixed with a 15-minute configurable LLM cooldown and one-time permanent-failure logging. |

## 2. Data-source and provider audit

AnalyzerX uses provider-isolated adapters and fallback behavior rather than treating one provider as authoritative for every asset class. Each response should retain provider, timestamp, freshness, and error context.

| Provider class | Current state | Correct behavior |
|---|---|---|
| Finnhub/news providers | Configured in the environment, but some upstream providers reject requests or impose plan limits. | Continue with independent circuits and expose provider failures without suppressing valid results from other sources. |
| Dhan derivatives | Adapter exists and is read-only, but live runtime authorization remains unavailable in the current session. | Show `auth_required`; do not fabricate expiry, OI, IV, Greeks, PCR, or max pain. |
| Angel One SmartAPI | Optional adapter and provider registry support exist, but no credentials are available. | Keep `auth_required` and do not report the provider as ready. |
| NSE public option-chain reference | Bounded free fallback exists with cookie handling and normalized response parsing. | Use only as a reference fallback, apply freshness labels, respect 403/429/WAF responses, and stop rather than bypass controls. |
| FII/DII flows | Official NSE reference and free intermediary/history fallback paths exist. | Prefer fast verified history when the official page is only a reference; display `unavailable` or stale when no verified payload is available. |
| GNews | External probe returned HTTP 403. | Isolate the circuit and preserve other news sources. |
| TinyFish | External probe returned HTTP 403. | Mark unavailable; do not retry indefinitely. |
| Indian API | External probe returned HTTP 429. | Apply cooldown and automatic fallback; do not interpret the rate limit as an empty market. |

## 3. Security findings and fixes

Administrative provider execution, collector execution, and source ingestion are now protected by admin procedures. Public clients can read safe metadata needed by the research UI, but they cannot trigger external calls or ingestion actions. Router inputs use bounded Zod schemas for symbols, provider IDs, source keys, limits, chat messages, tokens, and histories.

CORS and security headers remain restrictive. The server does not bypass CAPTCHA, WAF, robots, authentication, or licensing controls. Environment values are documented in `.env.example` and `docs/analyzerx-env-reference.md`; secrets must remain server-side and must not be placed in the mobile bundle.

The package audit found 142 advisories. Because most are transitive and several upgrades cross Expo major versions, the safe remediation is an explicit compatibility upgrade matrix rather than an unreviewed lockfile rewrite. No credentials were found in the tracked source scan.

## 4. Applied patches

The following patches were applied during this audit:

1. Administrative provider and collector mutations were hardened with admin-only procedures.
2. Public read-only provider/source catalogs and collector status were restored so Live Events and coverage surfaces do not fail because of the admin hardening.
3. Core Data API and heartbeat requests were bounded with explicit timeouts.
4. Angel One readiness now requires all required server-side SmartAPI fields instead of reporting partial configuration as ready.
5. A sanitized `.env.example` and environment reference were added.
6. Admin authorization regression coverage was added and corrected to distinguish public registry reads from protected telemetry and mutations.
7. The Admin screen now imports `useMemo` explicitly and renders visible access/error states instead of leaving an indefinite spinner as the only feedback.
8. News LLM extraction now enters a configurable cooldown after permanent quota, payment, authentication, or account-exhaustion errors and uses deterministic extraction during the cooldown.

## 5. Verification evidence

| Check | Result |
|---|---|
| TypeScript (`pnpm check`) | Passed after final patches. |
| Focused authorization/provider/derivatives/flows suite | 19/19 passed. |
| Full Vitest suite | 125 passed, 2 skipped, 3 external provider probes failed with HTTP 429/403. |
| Lint | Passed before final audit patches; rerun required after the final patch set before release checkpoint. |
| Production backend build | Passed before final audit patches; rerun required after the final patch set before release checkpoint. |
| Expo web export | Passed and emitted `web-dist` with 24 static routes. |
| Local production root | HTTP 200, nonzero HTML bundle. |
| Local API health | HTTP 200 with database, tracker, and collector status. |
| Responsive visual QA | Primary routes were captured before the last Admin/LLM patch; Admin exposed an indefinite loading presentation, which was patched afterward. Managed preview metadata was temporarily unavailable after restart. |

## 6. Remaining risks and release gates

The current application should not be marketed as having complete live data for every provider. Dhan and Angel One remain credential-gated, free NSE data is bounded public-reference data rather than a guaranteed WebSocket feed, and several optional providers are rejected by upstream plans or credentials.

The most important remaining security gate is the dependency audit. The 80 high and 3 critical advisories require package-level triage, especially where they affect server runtime, request parsing, URL handling, archive extraction, or production build tooling. The Expo SDK must be upgraded only through a compatible Expo migration plan.

A final release checkpoint should be created only after rerunning lint, the production server build, the full suite, local `/` and `/api/health` smoke tests, and a fresh managed-preview screenshot after the server restart. The three external provider probes should remain explicitly documented rather than forced green.

## References

[1]: https://docs.expo.dev/versions/latest/  
[2]: https://trpc.io/docs/  
[3]: https://owasp.org/www-project-application-security-verification-standard/  
[4]: https://docs.npmjs.com/auditing-package-dependencies-for-security-vulnerabilities  
[5]: https://dhanhq.co/docs/v2/option-chain/  
[6]: https://github.com/angel-one/smartapi-python  
[7]: https://www.nseindia.com/option-chain
