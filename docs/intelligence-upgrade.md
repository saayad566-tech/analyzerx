# Financial Intelligence Upgrade

## Current capability boundary

The application currently supports symbol search through the Indian Market API and Finnhub, scored and persisted news, official NSE source provenance, aggregate NSE FII/FPI and DII flows, push-token delivery, and lightweight local preferences. It does not yet have a durable price-history store, per-stock institutional positioning, mutual-fund holding history, bulk/block-deal history, options-chain history, user research memory, or outcome-based recommendation learning.

The NSE **Securities available for Trading** page is a verified universe source. It exposes downloadable official equity and SME CSV lists, plus additional security lists. The app should ingest those files through the controlled collector path, preserve the source URL, retrieval time, checksum, parser version, and raw payload, then use the normalized symbol directory for A–Z coverage. A provider failure or blocked route must produce an unavailable or stale state rather than a fabricated record.

## Proposed data layers

| Layer | Purpose | Verified inputs | Output |
|---|---|---|---|
| Universe registry | Track every supported NSE/BSE symbol | Official NSE equity/SME lists, validated BSE list, licensed cross-reference | Symbol, company name, exchange, ISIN, status, sector when sourced |
| Market observations | Price and volume history | Licensed OHLC provider; official reports where machine-readable | Timestamped OHLCV and freshness status |
| News events | News-to-price evidence | Finnhub, Google News RSS, configured providers, official filings | Headline, source URL, retrieved time, published time, sentiment, impact score |
| Positioning | Big-player and institutional behavior | NSE FII/FPI/DII, mutual-fund disclosures, official bulk/block deals, promoter/shareholding filings, licensed options data | Participant, instrument, action, quantity/value, report date, provenance |
| Research memory | Durable analyst context | User watchlists, notes, reviewed articles, prior explanations, recommendation outcomes | Append-only research observations and feedback records |
| Intelligence views | Explainable analysis | Joined observations across horizons | Weekly, monthly, quarterly, and multi-year summaries with confidence and gaps |

## Low-latency policy

“Low latency” is bounded by provider availability, market hours, rate limits, and exchange publication schedules. The service should use parallel provider requests, bounded timeouts, retry with backoff, response caching, deduplication, and freshness telemetry. It must not bypass CAPTCHA, WAF, robots, authentication, licensing, or exchange access controls. The UI should show retrieval age and provider status beside every live value.

## Self-improvement and self-learning policy

Self-improvement should mean a controlled feedback loop, not uncontrolled autonomous model training. The system can learn which sources, catalysts, and explanations users review; measure whether a news event was followed by a price move over each horizon; calibrate confidence; and improve ranking weights after validation. Raw facts, source records, scores, recommendations, and later outcomes must remain separately stored so the system can explain what changed and avoid rewriting history.

No recommendation should be presented as a guaranteed result. A recommendation requires a minimum evidence set, source freshness, a confidence estimate, and a visible list of missing inputs. If price history, positioning data, or a verified source is unavailable, the recommendation state must be `insufficient_evidence` rather than a guessed BUY or SELL signal.

## Big-player positioning definition

The initial positioning model should distinguish **aggregate institutional flows** from **security-level positioning**. FII/FPI and DII totals do not prove that a particular stock was bought. Security-level signals may be added only from verified bulk/block deals, mutual-fund portfolio disclosures, shareholding filings, promoter pledges, foreign-investment limits, and licensed options/open-interest data. Each record should carry participant type, action, instrument, quantity or value, report date, source URL, retrieval time, and freshness status.

## Multi-horizon analysis

| Horizon | Minimum evidence | Example output |
|---|---|---|
| Week | News events, daily OHLCV, immediate flow/deal records | Event count, return after event, volume change, short-term confidence |
| Month | Daily OHLCV, all relevant news and positioning records | Cumulative return, catalyst persistence, institutional trend |
| Quarter | Quarterly filings/results, shareholding and fund disclosures, price history | Earnings and ownership trend, valuation context when verified |
| Multi-year | Annual filings, annualized fundamentals, corporate actions, long price history | Structural thesis, execution history, regime changes, thesis invalidation |

## Implementation options

| Approach | Tradeoffs | Cost | Setup complexity |
|---|---|---:|---:|
| Incremental server-first upgrade | Fastest delivery; depends on configured providers and exchange publication schedules; strongest auditability | Existing hosting and provider costs | Medium |
| Full research warehouse and feature store | Best long-term memory, backtesting, and calibration; requires more storage, migrations, monitoring, and licensed history | Higher storage/provider cost | High |
| Lightweight client-only memory | Quick notes and watchlist UX; cannot deliver true 24/7 collection or reliable multi-year joins | Lowest | Low |

The recommended sequence is to start with the server-first foundation, then add the warehouse components after verified price-history and positioning feeds are connected. The client should consume evidence packets rather than calculate authoritative scores from fixtures.
