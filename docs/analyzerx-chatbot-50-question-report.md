# AnalyzerX Chatbot — 50-Question QA Report

Generated: 2026-08-17T21:30:06.100Z

## Result

The black-box test completed **50/50 questions** with valid HTTP responses, non-empty answers, documented confidence, limitations, and allowlisted action types. Average latency was **2238 ms**. Invalid actions: **0**. Action distribution: **navigate: 6; filter_news: 3; open_report: 3**.

All 50 responses used the deterministic fallback engine during this run because the hosted reasoning model was unavailable. This proves the chatbot endpoint and safe fallback are operational, but it does not prove hosted-model availability. The response contract correctly exposed that limitation rather than pretending the model ran.

## Coverage

| Domain | Questions | Passed | Average latency | Actions | Deterministic fallback |
|---|---:|---:|---:|---:|---:|
| App guidance | 10 | 10 | 28 ms | 8 | 10 |
| Personal/general | 10 | 10 | 6 ms | 0 | 10 |
| Stock research | 10 | 10 | 7305 ms | 1 | 10 |
| News | 10 | 10 | 3586 ms | 2 | 10 |
| Multi-asset | 5 | 5 | 209 ms | 0 | 5 |
| Troubleshooting | 5 | 5 | 318 ms | 1 | 5 |

## Findings

The first run showed a functional but unhelpful failure mode: app-guidance and general questions waited for provider work and then received the same generic market summary. The deterministic intent layer now answers navigation, flows, history, screenshot, voice, PDF, education, and safe-risk prompts locally with high confidence and allowlisted actions where appropriate. This reduces latency for those questions and avoids unnecessary provider calls.

Stock, news, and multi-asset questions continue through the grounded data path and retain source, freshness, confidence, and limitation fields. When the hosted model is unavailable, the deterministic research fallback remains explicit. No financial transaction action is exposed.

## Remaining limitation

The test environment returned deterministic fallback responses for all 50 questions because the hosted reasoning model was unavailable due to the existing usage-exhausted state. A separate model-availability run is required when the provider is restored to validate model-generated wording and multimodal interpretation.
