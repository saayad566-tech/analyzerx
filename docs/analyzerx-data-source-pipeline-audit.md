# AnalyzerX Data-Source and Pipeline Audit

**Audit date:** 2026-08-19

**Status vocabulary:** `live`, `delayed`, `catalog-validated`, `unavailable`, `environment-gated`, `planned`

## Executive assessment

AnalyzerX has a broad source architecture with provider isolation, market scope, entity resolution, source provenance, health telemetry, ECB/OECD parsers, official-source snapshots, GDELT fallback logic, regional collector metadata, and a market-scoped news pipeline. The system is structurally release-ready for web/backend when unavailable and credential-gated sources remain truthfully labeled. The main remaining gates are not solved by adding more names to a catalog: some sources require credentials or authorized endpoints, some free endpoints are rate-limited or legally constrained, and native Android Local AI requires an SDK/device environment.

## Capability and source matrix

| Capability | India | Global/regional | Preferred path | Fallback path | Publication state |
| --- | --- | --- | --- | --- | --- |
| Entity/search | Canonical directory, Indian search, NSE/BSE metadata | Regional seed directories, global search providers | Canonical entity master | Open search with provenance | live with partial regional coverage |
| Quotes/OHLCV | Licensed/credentialed market data where configured | Finnhub/Yahoo/open fallback where permitted | Authorized market-data provider | Public fallback with as-of label | mixed: live/delayed/unavailable by provider |
| Company fundamentals | Indian provider, official filings, IR | SEC EDGAR for U.S.; regional filings/IR | Structured provider or filing parser | Derived from official statements | live/partial by market |
| News | Google News RSS, GDELT fallback, configured providers, issuer IR | Same plus SEC/company sources and regional feeds | Source-backed provider parallel fan-out | RSS/open fallback with relevance gate | live/delayed/unavailable by source |
| Filings | NSE/BSE/SEBI/issuer IR snapshots and validated files | SEC EDGAR; regional collector contracts | Regulator/issuer source | Catalog-validated web source | mixed |
| FII/FPI/DII | Official NSE reports and validated fallbacks | Market-specific institutional disclosures | Official report/file | Aggregate fallback only | live/stale/unavailable by report |
| Mutual-fund/ownership | AMFI/NSDL/NSE/BSE/issuer disclosures where authorized | Regulator/issuer disclosures | Official machine-readable file | Source snapshot with limited grain | partial/catalog-validated |
| Options | Authorized broker/MCP or licensed provider | Exchange/OCC/public chain stats | Authorized chain source | Public chain with limited fields | credential-gated or unavailable where not configured |
| Macro | ECB and OECD SDMX parsers; other central banks | Regional macro registry | Official SDMX/central bank | Public source with units and as-of | live/stale/unavailable |
| Local AI | LiteRT/llama.cpp native adapter | CPU/web fallback and Connected mode | Verified native model | Connected/deterministic fallback | environment-gated for native |

## Provider operating contract

Each provider is registered with capability class, markets, endpoint/source URL, credential state, licensing note, freshness target, timeout, retry policy, circuit state, cooldown, latency, last success, last error, payload preview, and publication eligibility. Provider failures are classified and isolated. HTTP 401/402/403/422/429/5xx, timeout, malformed payload, missing credentials, and LLM exhaustion are not treated as empty valid data.

The source hierarchy is structured and authoritative first: official regulator, exchange, issuer IR, licensed market-data provider, validated structured provider, then open-web/RSS fallback. A fallback must carry source URL, retrieval time, as-of time, status, and the reason it was selected. The client must not silently change a preferred source into a different source without showing a basis change when the user has explicitly selected a provider.

## ECB and OECD validation

ECB and OECD are implemented as typed SDMX adapters. They parse indicator, geography, period, frequency, unit, dimensions, values, nulls, source URL, retrieval timestamp, latency, and freshness. The Macro Context route renders source, units, periods, current status, and unavailable states. Provider health and 30-day history retain last-success information. A provider outage does not block news, company data, or unrelated macro providers.

The remaining operational action is routine runtime monitoring: check HTTP reachability, parser success, freshness thresholds, null-value rates, and latency from the deployed environment. ECB/OECD data must remain macro context and must never be presented as a company observation merely because the selected entity is in the same country.

## News relevance audit

The current relevance gate now follows canonical issuer identity rather than broad token matching. Strong evidence includes ticker plus exchange, legal issuer name, investor-relations domain, filing identity, corporate action, or multiple issuer-specific anchors. Weak/common-word aliases require corroboration. Headlines containing ordinary-language words such as “reliance,” “tata,” or “adani” without issuer evidence are rejected for selected-stock publication and may remain only in a broad ambiguous archive with a reason code.

For an Indian selected market, stories about an international company are included only when they have evidence-backed material relevance to the selected Indian entity or Indian macro context. Unrelated Apple, Tesla, or foreign-company stories do not enter India-scoped feeds. When the user switches market, persisted and live retrievals use the new market scope; historical stories are filtered by their stored market ID.

## Freshness and fallback policy

| Data class | Freshness expectation | Stale behavior |
| --- | --- | --- |
| Live quotes | Intraday provider-defined | Keep last verified quote with age and delayed badge |
| News | Polling/provider-defined | Preserve recent archive; refresh independently |
| Official filings | Filing/report cadence | Show last report date and stale age |
| FII/DII | Report date cadence | Show aggregate with report period; do not imply intraday |
| Fundamentals | Filing/quarterly cadence | Preserve period and source; no current-value fabrication |
| ECB/OECD | Indicator frequency | Show latest period and stale threshold |
| Options | Expiry/intraday cadence | Show last chain timestamp and unavailable fields |
| Provider health | Runtime checks | Show current circuit/cooldown and last success |

## Credential and endpoint findings

Configured provider secrets remain server-side and are health-checked without exposing values. Several optional providers remain credential-gated, cooldown-limited, or unavailable depending on the environment. Public catalog entries are not promoted to live unless endpoint reachability, schema validation, license, and publication scope are confirmed. Dhan and other broker/MCP integrations remain read-only and authorization-dependent; no trading action is implied.

## Pipeline risks and fixes

The main risks are stale free endpoints, WAF/CAPTCHA-protected exchange pages, inconsistent regional schemas, rate-limit exhaustion, licensing ambiguity, common-word entity false positives, and provider-specific data grain. Current controls are adapter isolation, adaptive backoff, source hashes, parser versions, last-success previews, explicit status badges, canonical entity resolution, and fail-closed relevance.

The next improvements are to continue validating machine-readable regional endpoints one market at a time, add more historical persistence only when period semantics are confirmed, and keep a source-specific operational dashboard. No provider should be added merely because it is listed in an open API catalog.

## Audit conclusion

The data pipeline is suitable for release when the UI reflects these statuses accurately. The correct product behavior is not to claim that every market or every field is always live; it is to provide the strongest available evidence, keep providers independent, preserve last verified data, and make gaps actionable. The remaining native Android and credential-gated adapters are explicitly environment-gated rather than hidden.
