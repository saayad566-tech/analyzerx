# AnalyzerX Governance Foundation

## Implemented slice

AnalyzerX now exposes a Data Truth Center at `/data-truth`, reachable from Account. It reads the existing capability and source registries through public tRPC queries and presents dataset status, source organization, access mode, cadence, freshness SLA, confidence policy, intelligence consumers, and limitations.

The screen separates ready, partial/page-snapshot, and blocked/unavailable capabilities. It also explains reported, derived, estimated, and inferred evidence language. This is intentionally descriptive: a registered or configured provider may still be in cooldown, unauthorized, delayed, or schema-blocked state.

## Preservation boundaries

No existing provider adapter, score calculation, database table, user-ownership procedure, or source ingestion rule was replaced. The route reuses existing contracts and fails with a bounded unavailable state if the registry query cannot be loaded.

## Verification

TypeScript passed. The focused capability-registry and admin-authorization suite passed with five tests. Expo lint passed. Mobile visual verification passed for `/data-truth` and `/account` at a 390×844 viewport.

## Next governance work

The next slice should formalize the canonical score contract and completeness dimensions, then expose provider freshness, latency, payload-hash, schema-drift, replay, and dead-letter observability. No unsupported live coverage should be promoted while those contracts are being expanded.
