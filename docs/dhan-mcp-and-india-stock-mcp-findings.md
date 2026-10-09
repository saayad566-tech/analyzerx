# Dhan MCP and India Stock MCP Findings

## Dhan official MCP

The supplied endpoint `https://mcp.dhan.co/mcp` is reachable but returns `{"error":"invalid_token","error_description":"Authentication required"}` without an authenticated token. Dhan’s official documentation states that its native MCP connects an authenticated Dhan account to MCP-compatible clients and exposes read and trading capabilities, including portfolio management, market data, option chains, alerts, margin calculations, and order actions. The documentation describes per-session permission scopes and explicit consent for trading actions, with order confirmation required before place/modify/cancel operations and LIMIT-by-default guardrails.

Official sources: [Dhan MCP documentation](https://docs.dhanhq.co/mcp/) and [DhanHQ documentation](https://docs.dhanhq.co/).

## India Stock MCP repository

The supplied repository `https://github.com/Akhilgovind02/india-stock-mcp` is an MIT-licensed Node.js MCP server. Its README describes 16 tools covering quotes, historical data, symbol search, fundamentals, stock comparison, indices, market status, gainers/losers, corporate actions, options chains, IPOs, mutual-fund search/NAV/details/comparison, and a portfolio-summary calculator.

The repository uses Yahoo Finance (`yahoo-finance2`) for quotes, history, fundamentals, and search; `nse-bse-api` for market status, indices, corporate actions, IPOs, and options; `mfapi.in` for mutual-fund NAV/search; and `mfdata.in` as an optional fund-details source. The README explicitly warns that Yahoo quotes may be delayed, NSE may rate-limit or block requests, and free public data may be incomplete or wrong. It also notes that the built-in NIFTY 50 list requires periodic maintenance.

No user credentials were supplied, and no connector was created or enabled. The repository was inspected as source only; its code was not executed. The Dhan MCP endpoint should not be enabled until the user explicitly authorizes the connector and provides or completes the required Dhan authentication flow. Any future market-data adapter must preserve source labels, timestamp/freshness, provider failure states, licensing boundaries, and must not treat delayed Yahoo data as low-latency live trading data.

## Integration verification

The India Stock MCP adapter was added as a server-side read-only provider with normalized snapshot, historical-data, and symbol-search routes. A live RELIANCE smoke test returned both quote and fundamentals payloads without provider errors. The app labels this source as `India Stock MCP`, marks the boundary `read-only`, and reports freshness as unknown because the underlying free/public sources may be delayed.

The Dhan connector was created at `https://mcp.dhan.co/mcp` and authenticated successfully. Tool discovery returned read and trading tool groups. A single read-only symbol-search call for RELIANCE/NSE returned 40 matches, including `RELIANCE-EQ` with security ID `2885`. No order, alert, portfolio mutation, or other write operation was called.
