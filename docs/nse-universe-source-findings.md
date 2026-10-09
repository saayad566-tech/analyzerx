# NSE Universe Source Findings

Verified on 17 Aug 2026 from the official NSE Securities available for Trading page:

- Equity segment CSV: https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv
- SME segment CSV: https://nsearchives.nseindia.com/emerge/corporates/content/SME_EQUITY_L.csv
- Reference page: https://www.nseindia.com/static/market-data/securities-available-for-trading

The page labels these as official downloadable lists. The collector must preserve the source URL, retrieval timestamp, raw CSV, checksum, parser version, and freshness status. This supports a verified A–Z universe registry but does not by itself provide price history, fundamentals, institutional ownership, or recommendations.

## Live validation

The official equity CSV was fetched successfully and normalized to 2,565 NSE equity securities on 17 Aug 2026. The official SME CSV returned HTTP 403 from this environment, so SME coverage is reported as a source error rather than guessed or silently merged. The universe endpoint therefore returns partial results with an explicit errors array and retains the successful equity source provenance.
