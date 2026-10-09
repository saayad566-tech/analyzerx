# Indian Stock Market API Findings

Source: https://github.com/0xramm/Indian-Stock-Market-API

The repository README documents an MIT-licensed, no-key REST API with base URL `http://65.0.104.9/`, NSE as the default exchange, and optional `.NS` / `.BO` suffixes. The documented search endpoint is `GET /search?q={query}` and returns `results[]` entries containing `symbol`, `company_name`, `match_type`, and exchange-specific API URLs. The documented stock endpoint is `GET /stock?symbol={SYMBOL}&res=num|val` and returns `data` fields including `company_name`, `last_price`, `change`, `percent_change`, `previous_close`, `open`, `day_high`, `day_low`, `year_high`, `year_low`, `volume`, `market_cap`, `pe_ratio`, `dividend_yield`, `book_value`, `earnings_per_share`, `sector`, `industry`, `currency`, `last_update`, and `timestamp`.

Live validation on 2026-08-17 found the documented HTTP endpoint returned an empty response for `RELIANCE`, and the HTTPS variant failed TLS connection. The adapter must therefore preserve an explicit unavailable/error state and must not claim live data until the endpoint responds with valid JSON. Existing keyed Indian API, Finnhub, India Stock MCP, Screener.in, and Yahoo fallback sources remain separate and can provide partial results in parallel.
