# Global-to-India News Relevance

The news tracker now supplements symbol-specific feeds with a dedicated Google News RSS query for global events that can affect Indian equities. The query covers Indian-market anchors such as NSE, BSE, Nifty, Sensex, RBI, SEBI, GIFT Nifty, and INR together with global macro themes including US rates, crude oil, OPEC, inflation, China and Asia, tariffs, geopolitical risk, and global growth.

Articles are not imported solely because they are financial. The relevance layer requires an Indian-market anchor or a direct configured company/ticker match. It assigns an explainable relevance score using direct company matches, India-market anchors, macro themes, and sector themes. Articles below the inclusion threshold are rejected before they reach the tracker. The original provider, publisher, URL, and publication timestamp remain unchanged for provenance.

For selected-stock queries, global articles classified as market-level (`MARKET`) are associated with the requested symbol only after the relevance filter passes. This permits a stock feed to show relevant oil, rates, currency, geopolitical, or Asia-market stories while preserving the distinction between direct company news and broader market context.

The implementation uses the existing server-side Google News RSS adapter and optional provider framework. It does not use spreadsheet-only functions, bypass robots/WAF/CAPTCHA controls, or claim that a global headline proves a stock-specific price effect. The relevance score is a triage signal; impact scoring and original-source verification remain separate steps.
