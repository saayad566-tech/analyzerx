
# Smart Event Alerts live wiring

AnalyzerX now has a server-side `smartAlerts.discover` query. It reads the existing tracked-news store, applies a configurable 1–180 day historical window, resolves tracked symbols through the existing fundamental-analysis pipeline, extracts order/contract/partnership/acquisition/capacity/financing event chains, links explicit customer entities only when a ticker or approved alias is present, derives market-cap bands and order-to-revenue/order-to-market-cap ratios from the existing quantitative metrics, deduplicates through the existing Smart Event Alerts evaluator, and returns eligible, potential, or no-longer-eligible results with source, timestamp, evidence excerpt, confidence, matched conditions, and explanation.

The existing Alerts screen now refreshes this live discovery query every 60 seconds when a user opens an eligible-stock view. It displays loading, live-unavailable, verified-match, and no-match states without example or fabricated results.

The current live ingestion seam is the verified tracked-news store, which is populated by configured Finnhub, optional news providers, RSS, and the existing tracker. NSE/BSE/company-IR filing payloads are used as verified evidence when they enter that store; protected or unavailable direct endpoints are not bypassed. An event without an explicit second entity or a verifiable financial input remains unavailable or potential rather than being promoted to eligible. Historical backfill currently uses the configured news archive/tracked store and is bounded by the requested lookback window.
