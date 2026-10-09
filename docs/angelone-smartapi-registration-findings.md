# Angel One SmartAPI Registration Findings

## Sources

1. Angel One SmartAPI compliance update: https://smartapi.angelone.in/smartapi/forum/topic/5254/important-updates-to-smartapi-in-compliance-with-sebi-guidelines/34?lang=en-GB
2. Angel One SmartAPI API-key guidance: https://www.angelone.in/knowledge-center/smartapi/how-to-generate-smartapi-key-and-install-python-on-your-machine
3. Angel One SmartAPI redirect-URI forum guidance: https://smartapi.angelone.in/smartapi/forum/topic/5548/invalid-redirect-uri
4. Angel One SmartAPI static-IP update: https://www.angelone.in/news/market-updates/what-s-changing-in-angel-one-smartapi-access-from-april-1-2026

## Findings

The SmartAPI registration form requires a redirect URL that belongs to the application’s actual authentication callback. The current AnalyzerX `https://manus.im/app/...` management URL is not an AnalyzerX backend callback and must not be registered as the Angel One redirect target. AnalyzerX currently has Dhan derivatives integration, but no implemented Angel One SmartAPI callback route or Angel One credentials adapter was found in the app code; therefore an Angel One callback path must be implemented before a final redirect value can be truthfully supplied.

The current official compliance guidance distinguishes order-related API activity from read-only market-data usage. Orders must originate from a static IP that is registered/whitelisted with Angel One. For non-order APIs, the compliance update indicates that a static IP is not mandatory, although the SmartAPI registration form may still request a primary IP. A managed serverless/WebDev deployment does not provide a guaranteed fixed outbound egress IP for Angel One allowlisting, so the production backend would need a fixed-egress VM, NAT gateway, or other server with a documented static public IP before enabling order placement. AnalyzerX should remain read-only for market data unless that infrastructure exists.

The example `12.345.678.90` is not a valid IP because octets cannot exceed 255; it is only a visual placeholder. The form must receive the real public IPv4 address of the backend that will call Angel One. A developer’s phone, home Wi-Fi, or current browser IP is not a reliable production backend IP and should not be registered for a server-side integration.

## Safe registration implication for AnalyzerX

Do not submit the form with the Manus management URL or an invented IP. For a read-only Angel One market-data integration, first implement and deploy a callback such as `https://<AnalyzerX-production-domain>/api/angelone/oauth/callback`, then register that exact URL and use the real fixed backend egress IP if SmartAPI requires one. Postback URL should remain blank until AnalyzerX implements and verifies an Angel One webhook receiver. If the current deployment cannot provide fixed egress, use a fixed-egress backend for Angel One or keep the provider disabled; do not claim the integration is live.
