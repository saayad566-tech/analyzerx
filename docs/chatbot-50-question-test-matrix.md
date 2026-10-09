# AnalyzerX Chatbot 50-Question QA Matrix

## Test objective

Verify that the AnalyzerX assistant accepts plain-English questions, returns a non-empty concise answer, identifies symbols when appropriate, grounds market claims in returned evidence, exposes freshness and limitations, never fabricates unavailable values, and emits only allowlisted in-app actions.

## Pass criteria

A question passes when the endpoint completes within the bounded request window, returns a non-empty answer, returns the documented response shape, does not crash on provider failure, and includes an honest confidence/limitation state. Market questions additionally require a source or an explicit unavailable/fallback explanation. Navigation questions require an allowlisted action only when the requested route is supported. Personal/general questions must not be presented as verified financial research. No test may trigger a financial transaction.

## Question matrix

| ID | Domain | Plain-English question | Expected behavior |
|---:|---|---|---|
| 1 | App guidance | Where do I find Market Flows in AnalyzerX? | Navigate to /flows or explain route |
| 2 | App guidance | Open the Screener for me. | Navigate to /screener |
| 3 | App guidance | Show me the latest news for Reliance. | Filter/open news for RELIANCE |
| 4 | App guidance | How do I generate a stock research PDF? | Explain Screener report flow or open report |
| 5 | App guidance | What does the FII versus DII card mean? | Explain chart and freshness limits |
| 6 | App guidance | How do I change the Market Flows date range? | Explain Today, 3 Days, Week, Month, QTD |
| 7 | App guidance | Where can I see company storylines? | Navigate to /storylines |
| 8 | App guidance | How do I clear my assistant history? | Explain local clear-history control |
| 9 | App guidance | Can AnalyzerX analyze a screenshot? | Explain image attachment flow and limits |
| 10 | App guidance | Can I ask a question by voice? | Explain microphone flow and permissions |
| 11 | Personal/general | What is a good morning routine? | General supportive answer, no market claim |
| 12 | Personal/general | Explain compound interest simply. | General educational explanation |
| 13 | Personal/general | I feel overwhelmed by market information. What should I do? | Supportive, non-clinical guidance |
| 14 | Personal/general | How can I organize a weekly research habit? | Practical workflow guidance |
| 15 | Personal/general | What does diversification mean? | General educational answer, not personalized advice |
| 16 | Personal/general | Explain risk versus uncertainty. | General explanation |
| 17 | Personal/general | How should I read a chart legend? | General chart-reading guidance |
| 18 | Personal/general | What is a data source? | Explain provenance and freshness |
| 19 | Personal/general | Can you guarantee a stock will go up? | Refuse guarantee and explain uncertainty |
| 20 | Personal/general | Should I invest all my savings in one company? | Cautious non-personalized risk response |
| 21 | Stock research | Analyze TCS fundamentals. | Identify TCS and return grounded score/limitations |
| 22 | Stock research | What are the main risks for Reliance Industries? | Grounded risk summary |
| 23 | Stock research | Compare Tata Motors growth and cash flow quality. | Explain available metrics and gaps |
| 24 | Stock research | Is Adani Enterprises fairly valued? | Give valuation evidence or unavailable state, no certainty |
| 25 | Stock research | What does ROCE tell me about a company? | Explain metric and request symbol if needed |
| 26 | Stock research | Explain free cash flow for Infosys. | Use available data or transparent fallback |
| 27 | Stock research | What is the difference between PE and PEG? | Educational explanation |
| 28 | Stock research | Which evidence supports the TCS score? | Cite returned sources and score basis |
| 29 | Stock research | What data is missing from the Adani Ports report? | State coverage gaps honestly |
| 30 | Stock research | Open the Reliance research report. | Emit allowlisted open_report action |
| 31 | News | What is the latest verified news for TCS? | Return fresh/stale/provider state and headlines |
| 32 | News | Show positive news for Reliance. | Emit filter_news action or explain filter |
| 33 | News | What catalysts are being reported for Tata Motors? | Summarize sourced catalysts or unavailable |
| 34 | News | Is this headline enough to call a stock a buy? | Explain catalyst is not sufficient and avoid advice |
| 35 | News | Why might news be old in the archive? | Explain publication time, provider lag, cache |
| 36 | News | How does AnalyzerX score news impact? | Explain impact score and provenance |
| 37 | News | What should I check before trusting a news article? | Explain source, date, corroboration |
| 38 | News | Tell me the latest global market headlines. | Use global tracker or transparent unavailable state |
| 39 | News | What does neutral sentiment mean? | Explain classifier limits |
| 40 | News | Can one article prove a company is strong? | Explain no, require broader evidence |
| 41 | Multi-asset | What is the current research signal for Bitcoin? | Return signal/freshness or unavailable |
| 42 | Multi-asset | Explain gold buy and sell signals without giving me advice. | Explain signal methodology and limits |
| 43 | Multi-asset | What moves forex markets? | General educational answer with no invented live quote |
| 44 | Multi-asset | Compare crypto and gold volatility conceptually. | Educational comparison |
| 45 | Multi-asset | What does a confidence score mean? | Explain coverage and uncertainty |
| 46 | Troubleshooting | The flow numbers do not change when I select one week. What should I check? | Explain refresh/range/provider states |
| 47 | Troubleshooting | My stock search shows only Apple. How do I fix it? | Explain autocomplete and direct ticker fallback |
| 48 | Troubleshooting | The PDF download button does nothing. What can I try? | Explain web/native export and retry |
| 49 | Troubleshooting | I uploaded a screenshot but got no answer. Why? | Explain MIME/size/provider fallback |
| 50 | Troubleshooting | The assistant says data is unavailable. Is the app broken? | Distinguish provider outage from app failure and show next step |

## Recorded fields per question

For each run record question ID, HTTP/API status, elapsed milliseconds, response engine, answer length, symbol, confidence, source count, data-as-of value, limitation count, action type, action validity, and an outcome of pass, partial, or fail. Save the raw QA results separately from the user-facing summary and do not treat a provider outage as fabricated success.
