# NSE FII/FPI and DII Adapter

The server procedure `market.institutionalFlows` retrieves the latest institutional-flow report from `NSE_FII_DII_REPORT_URL` when an authorized direct NSE CSV endpoint is configured. If that variable is not configured, it uses the repository-listed NSE-sourced research endpoint at `NSE_FII_DII_API_URL`, defaulting to `https://fii-diidata.mrchartist.com/api/data`. The UI labels this path as **NSE via intermediary** and does not present it as a direct NSE feed.

The parser accepts JSON keys such as `fii_buy`, `fii_sell`, `fii_net`, `dii_buy`, `dii_sell`, and `dii_net`, plus common date aliases. It also accepts CSV files with participant, buy, sell, net, and date columns. Net is taken from the reported value when available; otherwise it is derived as buy minus sell.

Freshness is calculated using business-day distance rather than elapsed clock hours. A report dated today or the immediately previous business day is `fresh`. A valid older report is `stale` and remains visible with its report date and age. Missing or malformed dates produce `unavailable`, while network, timeout, HTTP, and parse failures produce `error`. No fixture values are relabeled as live when the report is unavailable.

Market Flows uses the adapter for the aggregate FII/FPI + DII summary and participant comparison when usable values are returned. Company-level cards and options signals remain separately labeled. Sector Intelligence displays the NSE report freshness context but does not convert aggregate flows into sector-level live rankings; that requires a separate sector dataset.

## Configuration

| Variable | Purpose |
|---|---|
| `NSE_FII_DII_REPORT_URL` | Optional authorized direct NSE CSV endpoint |
| `NSE_FII_DII_API_URL` | Optional NSE-sourced JSON intermediary endpoint |

The adapter uses a bounded request timeout and returns structured error state so provider outages do not break other app screens.
