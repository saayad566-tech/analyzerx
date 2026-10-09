# Angel One SmartAPI integration findings

## Official sources

1. [Angel One smartapi-python repository](https://github.com/angel-one/smartapi-python)
2. [Official SmartAPI Python README](https://raw.githubusercontent.com/angel-one/smartapi-python/main/README.md)
3. [Official SmartConnect source](https://raw.githubusercontent.com/angel-one/smartapi-python/main/SmartApi/smartConnect.py)

## Verified contract observations

The official Python SDK uses the production base URL `https://apiconnect.angelone.in`. Its documented session flow constructs `SmartConnect(api_key)`, generates a TOTP, calls `generateSession(client_code, PIN, totp)`, obtains `jwtToken`, then fetches a feed token. The SDK sends the JWT as a Bearer token and requires SmartAPI headers including `X-PrivateKey`, `X-UserType`, `X-SourceID`, `X-ClientLocalIP`, `X-ClientPublicIP`, and `X-MACAddress`.

The SDK source documents read-only market-data routes for option Greeks, put-call ratio, OI buildup, market quote, historical candles, and WebSocket V2. Relevant routes include `/rest/secure/angelbroking/marketData/v1/optionGreek`, `/rest/secure/angelbroking/marketData/v1/putCallRatio`, `/rest/secure/angelbroking/marketData/v1/OIBuildup`, and `/rest/secure/angelbroking/market/v1/quote`. The SDK README also demonstrates WebSocket V2 using `AUTH_TOKEN`, `API_KEY`, `CLIENT_CODE`, and `FEED_TOKEN`.

## AnalyzerX implementation boundary

AnalyzerX implements Angel One as an optional, authenticated, read-only fallback. It does not implement order placement, GTT, holdings, or trading actions. Missing credentials remain `auth_required`; HTTP 401/403, invalid sessions, rate limits, timeouts, and schema failures are isolated through the provider-health circuit breaker. The adapter attempts the documented optionGreek route and, when no normalized contracts are returned, can inspect the documented put-call-ratio route without presenting PCR-only data as a full option chain.

The adapter requires `ANGELONE_API_KEY`, `ANGELONE_CLIENT_ID`, `ANGELONE_ACCESS_TOKEN` (or `ANGELONE_JWT_TOKEN`), `ANGELONE_CLIENT_LOCAL_IP`, `ANGELONE_CLIENT_PUBLIC_IP`, and `ANGELONE_CLIENT_MAC_ADDRESS`. A JSON payload for the optionGreek request can be supplied through `ANGELONE_OPTION_GREEK_PAYLOAD_JSON`; no credentials or PIN/TOTP values are bundled in the client.

Because the exact optionGreek payload is account/instrument dependent and the current managed deployment does not provide a guaranteed static egress IP, the provider must remain disabled/auth-required until the user configures valid server-side secrets and an authorized SmartAPI registration. This source is therefore a fallback capability, not a claim that live Angel One data is active by default.
