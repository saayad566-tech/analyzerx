# PROJECT_SPEC.md — AnalyzerX (market event intelligence)

## User requirements (verbatim intent, 2026-10-15)
1. Split code and assets into **separate GitHub repositories** (code repo stays light; market
   asset/data packs live in their own repo).
2. **Chunk large files** so nothing hits GitHub's per-file / per-release size limits.
3. **Dynamically download resources at runtime via a main file** (a manifest the app fetches,
   which tells it exactly which chunks to pull).
4. **Strict market isolation**: if the user selects India, *everything* in the app shows India;
   if they select USA, *everything* shows USA. No cross-contamination between markets.
5. Finish the pending work left by previous agents; maintain the app with its existing logic.

## What the product is
AnalyzerX — Expo/React Native (web + Android) market-event intelligence workspace. Screens:
Live Events, Storylines, Relationship Graph, Sectors, Market Flows, Screener, News, Filings,
Alerts, Assistant, Research Desk, Local AI, ForgeShelf, Marketplace.

## Confirmed defects found this session (the "errors" the user reports)
- `lib/market-data.ts` is **India-only fixture data** (₹ values, NSE/BSE, Indian companies) and is
  imported unconditionally by `app/(tabs)/index.tsx` (Live Events), `app/(tabs)/sectors.tsx`
  (Sectors) and `app/(tabs)/flows.tsx` (Flows fallback). Selecting USA still shows Indian content.
- `app/(tabs)/screener.tsx` falls back to the **IN** seed directory for every non-IN market.
- `server/routers.ts` → `market.institutionalFlows` is NSE/India-only but takes **no marketId**, so a
  US selection still surfaces Indian FII/DII flows.
- `server/routers.ts` → `graph.projection` takes **no marketId**, so the Relationship Graph mixes markets.
- No runtime resource-pack mechanism exists; asset distribution is a partial CI-only APK split hack.

## Constraints
- Free/open-source only. No new paid services. Keep every existing dependency; add none.
- Must not break existing functionality (regression is failure).
- Physical Android build/device QA and credentialed live providers remain environment-gated
  (no Android SDK/NDK/adb, no device, no provider secrets in this sandbox) — reported honestly.
