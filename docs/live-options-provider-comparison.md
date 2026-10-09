# Live Indian Options-Data Provider Research

## Evidence captured

| Provider | Documented coverage | Authentication/deployment | Important constraint | Source |
|---|---|---|---|---|
| DhanHQ | Full option chain across NSE/BSE/MCX with OI, Greeks, volume, bid/ask, LTP, IV, and expiry list | Access token plus client ID; REST API | Option-chain rate limit is one unique request every 3 seconds | [Dhan Option Chain](https://dhanhq.co/docs/v2/option-chain/) |
| Upstox | Put/call chain for an underlying and expiry with PCR, strike, spot, LTP, volume, OI, bid/ask, and Greeks including IV, delta, theta, gamma, vega | OAuth/Bearer access token; REST API | MCX option chain is documented as unavailable on this endpoint; instrument keys and expiry are required | [Upstox Put/Call Option Chain](https://upstox.com/developer/api-documentation/get-pc-option-chain/) |
| TrueData | Real-time NSE F&O option chain and Greeks; REST and WebSocket APIs; supported Python/Node/JavaScript and web/mobile delivery | Commercial/vendor onboarding and subscription | Terms restrict use to the licensed subscriber and require compliant data termination; redistribution/display terms must be confirmed for AnalyzerX | [TrueData Market Data API](https://www.truedata.in/products/marketdataapi) |
| Global Datafeeds | Real-time, historical, snapshot, delayed, entire exchange, option chain, and Greeks for NSE/NFO, BSE/BFO, MCX; REST, WebSocket, FIX and other APIs | Commercial/vendor onboarding and subscription | Vendor terms restrict use to the licensed subscriber and require exchange-compliant termination; public display/redistribution needs explicit approval | [Global Datafeeds APIs](https://globaldatafeeds.in/apis/) |
| NSE public page | Browser-visible option-chain page | No supported server API contract established for AnalyzerX | Public webpage is not a reliable production machine-readable feed; scraping can be blocked or non-compliant | [NSE Option Chain](https://www.nseindia.com/option-chain) |

## Recommendation

For the lowest-friction broker API path, Upstox is the clearest alternative to Angel One because its official documentation exposes a direct put/call option-chain endpoint with OAuth/Bearer authentication and the exact fields AnalyzerX needs. Dhan remains a strong fit and already matches AnalyzerX’s adapter contract, but its session must be correctly authorized. For production-grade low-latency full-market coverage, TrueData or Global Datafeeds are more appropriate because they explicitly offer option-chain and Greeks feeds over REST/WebSocket, but they require commercial onboarding and confirmation that AnalyzerX’s public display and multi-user use are licensed.

AnalyzerX should implement a provider-neutral adapter with this precedence: licensed commercial feed when configured; authenticated broker API (Dhan or Upstox) when connected; official exchange page only as a reference or manual source; and truthful auth-required/stale/unavailable states when no compliant live source is available. Free web scraping should not be used as a claimed real-time production feed.
