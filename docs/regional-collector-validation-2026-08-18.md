# AnalyzerX Regional Collector Validation — 2026-08-18

## Implemented

AnalyzerX now has a compliant SEC EDGAR collector with exact ticker-to-CIK resolution, issuer submissions retrieval, XBRL company-facts retrieval, accession-backed filing URLs, normalized filing/fact contracts, SHA-256 lineage identifiers, collector health updates, retries, timeouts, rate limiting, and explicit unresolved/error states. `SEC_EDGAR_USER_AGENT` is required before outbound SEC access; the collector does not guess issuer mappings or run an unbounded market-wide sweep from a user request.

SEC ticker maps can be ingested through the canonical source pipeline. Symbol-specific SEC submissions and XBRL facts can be run through the protected `sources.ingestSecCompany` procedure and are exposed to the market profile through `market.secFilings`. SEC source records are recognized by the unified filing adapter and retain raw payload, normalized payload, source URL, parser version, retrieval time, freshness, and checksum metadata.

## Live smoke evidence

The live AAPL probe completed successfully on 2026-08-18 at 17:55:41 UTC using the public SEC endpoints:

| Result | Value |
|---|---|
| Status | fresh |
| Resolved ticker | AAPL |
| CIK | 0000320193 |
| Company | Apple Inc. |
| Recent submissions parsed | 1,000 |
| XBRL facts parsed | 24,009 |

This validates transport, compliant request identification, ticker resolution, submissions schema parsing, facts schema parsing, and the normalized collector contract. It does not validate exchange-grade real-time quotes, options, order books, or institutional flows.

## Regional source boundaries

The registry now exposes official source families for the US, UK, Canada, Australia, Japan, Singapore, Hong Kong, Germany, and France. SEC is the first runnable market-specific collector. Other markets remain explicitly catalog-validated or access/schema-gated until issuer resolution, machine-readable payloads, licensing, freshness semantics, and parser regression fixtures are validated. No unsupported region is promoted to fully live.

| Market | Current state | Primary source family | Not claimed |
|---|---|---|---|
| US | Catalog-validated; runnable SEC issuer collector | SEC EDGAR submissions and XBRL | Real-time quotes, options, tape, institutional flows |
| UK | Catalog-validated | FCA National Storage Mechanism | Machine-readable runtime parser and market data |
| Canada | Catalog-validated | SEDAR+ | Automated issuer resolution and market data |
| Australia | Catalog-validated | ASX company announcements | Price redistribution and live quote feed |
| Japan | Access-gated | JPX TDnet | Free live API; paid API is not assumed |
| Singapore | Catalog-validated | SGX disclosures | Runtime parser and quote licensing |
| Hong Kong | Catalog-validated | HKEXnews | Bilingual runtime parser and market data |
| Germany | Catalog-validated | EU ESEF / ESMA | Generic EU company feed |
| France | Catalog-validated | EU ESEF / AMF | Country-specific automated filing parser |

## Verification

TypeScript, lint, backend build, Expo web export with 35 static routes, and 16 focused tests passed. Tests cover SEC ticker resolution, accession URL construction, XBRL flattening, source catalog registration, unified SEC filing recognition, and regional collector gating.

The Expo build emitted a non-blocking warning that push-token change listening is not fully supported on web. The existing Local AI tracker also reports a temporary hosted-LLM usage-exhausted fallback; deterministic extraction remains the documented fallback and is unrelated to SEC collection.
