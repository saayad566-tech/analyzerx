# ForgeShelf Marketplace Audit

## Current state

AnalyzerX already has a marketplace route and a typed catalog in `lib/marketplace.ts`. The catalog includes data connectors, technical analysis, FinBERT, SEC filing research, the Local Assistant, Android sync, local sentiment, report reading, and institutional-flow parsing. It declares platform, backend, RAM, storage, version, release channel, runtime, artifact, license, attribution, source URL, safety note, and the AnalyzerX capability served.

Compatibility scoring is also present. It compares platform, backend, memory, storage, release channel, and redistribution status. The current UI exposes search and category chips, a recommended library, fit score, runtime, capability, source/safety details, and a host pairing concept.

## Functional gaps

The current install button is intentionally non-functional: verified tools show a host-not-connected alert, while candidate/runtime-pending tools only show requirements. There is no installed inventory, download state, checksum progress, update flow, uninstall flow, local model activation, device capability capture, or real connection from an installed tool to the Assistant. The screen title is generic “Finance tools,” so it does not communicate a broad app-store-like library.

## Product decision

Use **ForgeShelf** as the marketplace name. ForgeShelf is distinct from Google Play/App Store and communicates a curated place where users “forge” local research capability. The experience should retain Google Play’s installed-management pattern—library, updates, per-item details, update policy—and Google AI Studio’s capability-first pattern—models/tools, clear “try/use,” SDK/runtime details, and remixable workflows—while remaining limited to open-source or explicitly AnalyzerX-owned local runtimes.

## Release safety boundary

The first release should make installation truly functional for AnalyzerX-owned TypeScript tools and downloadable, checksum-pinned local model artifacts when a native host bridge is available. Unsupported device installs must be clearly disabled rather than simulated. Repository code must never be executed directly from a catalog entry; only signed/verified packages with declared permissions and rollback metadata can be installed.
