# Free and Open-Access Indian Options Data Findings

## Conclusion

There is no dependable, unrestricted, exchange-authorized free WebSocket feed that guarantees full Indian live option-chain data for a public multi-user application. The closest free route is a Python client such as `nsepython` communicating with publicly available NSE web APIs, or a carefully controlled server-side retrieval of the official NSE option-chain page. These routes can work for research experiments and low-frequency fallback, but they are not equivalent to a licensed low-latency production feed: NSE can change endpoints, require cookies/headers, rate-limit, return WAF/CAPTCHA responses, and impose terms on automated access.

## Free/open-source candidates

| Source | What it provides | Safe AnalyzerX use | Main limitation |
|---|---|---|---|
| `nsepython` | Python wrapper for publicly available NSE/NIFTY REST data; has a server edition | Use as a bounded server-side research fallback with low request frequency, cache, provenance, and clear stale/unavailable states | Not an exchange SLA or guaranteed public API; endpoint changes and blocks can break it; verify NSE terms before redistribution |
| Official NSE Option Chain page | Public browser option-chain view with index/symbol, expiry, strike, refresh, and CSV controls | Use as a reference/manual fallback or carefully validated page snapshot | Dynamic page, anti-bot/WAF risk, no stable supported backend API contract confirmed |
| GitHub open-source scripts | Examples for parsing NSE pages or broker APIs | Use code patterns only after security, license, source, and endpoint validation | A GitHub repository is not a data entitlement; many scripts depend on blocked/private endpoints or require a broker API |
| Yahoo Finance / public global feeds | Some global option chains | Use for supported global instruments only, not as a substitute for NSE F&O coverage | Indian NSE option coverage is incomplete or inconsistent; not a reliable Indian live source |

## Recommended free-tier architecture

AnalyzerX can add a `free_nse_reference` provider that calls a server-side `nsepython`/validated NSE adapter at a conservative interval, caches the last successful response, computes PCR and max pain only from the returned strike/OI rows, records `sourceUrl`, `retrievedAt`, `providerStatus`, `parserVersion`, and `isStale`, and stops retrying when it detects 403, 429, CAPTCHA, or schema drift. The UI must label the result as `NSE public reference`, show the retrieval time, and display `stale` or `unavailable` when the source cannot be verified.

This free provider should never be used as a low-latency WebSocket claim. For minute-level or tick-level public display, AnalyzerX needs an authorized broker API or licensed vendor such as Dhan, Upstox, TrueData, or Global Datafeeds. Calculated Greeks can be derived from valid prices, expiry, spot, volatility, and interest-rate inputs, but derived Greeks must be labeled `derived`; they must not be presented as exchange-provided Greeks.

## Sources

1. [NSE Option Chain](https://www.nseindia.com/option-chain)
2. [NSEPython on PyPI](https://pypi.org/project/nsepython/)
3. [GitHub option-chain topic](https://github.com/topics/option-chain)
4. [Dhan Option Chain API](https://dhanhq.co/docs/v2/option-chain/)
5. [Upstox Put/Call Option Chain](https://upstox.com/developer/api-documentation/get-pc-option-chain/)
