# Dhan Contract Findings

## Sources reviewed

1. Dhan sandbox API documentation: https://sandbox.dhan.co/v2
2. Official DhanHQ Python SDK repository: https://github.com/dhan-oss/DhanHQ-py
3. Official Dhan API docs referenced by the SDK: https://api.dhan.co/v2/
4. Dhan option-chain guide referenced by the current adapter: https://dhanhq.co/docs/v2/option-chain/

## Findings

The supplied sandbox URL is the Dhan API documentation host and advertises `https://sandbox.dhan.co/v2` as its generated server URL. The official SDK README identifies the production API documentation host as `https://api.dhan.co/v2/` and the repository as the official Python client. The repository page is currently a v2.3.0 release-candidate branch/repository state, so production use should stay on the stable documented API contract unless a specific SDK release is intentionally pinned.

Dhan MCP tool discovery confirms that `market_data_agent_tool` supports `expirylist` and `optionchain`, with payloads shaped as `{UnderlyingScrip, UnderlyingSeg}` and `{UnderlyingScrip, UnderlyingSeg, Expiry}`. The MCP search tool resolves RELIANCE on NSE to security ID `2885` and the equity segment `NSE_EQ`. A live MCP expiry-list probe with that correct mapping returned `Unauthorized`, which indicates an authentication/session problem rather than a symbol-mapping problem.

AnalyzerX currently uses the same core Dhan REST paths (`/v2/optionchain/expirylist` and `/v2/optionchain`) and the correct RELIANCE mapping, but it expects server-side `DHAN_ACCESS_TOKEN` and `DHAN_CLIENT_ID`. An enabled Dhan MCP connector does not automatically populate those server environment variables. Therefore, activating live option data requires either valid server-side read-only Dhan credentials or an explicit backend bridge to an authenticated Dhan MCP session. The app must continue to show `auth_required` and source guidance until authentication succeeds; sandbox or static reference pages must never be presented as live option values.

## Implementation implication

The adapter should support an explicit `DHAN_API_BASE_URL` mode with production default `https://api.dhan.co`, optional sandbox testing only when explicitly configured, structured auth error classification, and tests for correct URL selection, headers, security-ID mapping, expiry parsing, and `auth_required` behavior.
