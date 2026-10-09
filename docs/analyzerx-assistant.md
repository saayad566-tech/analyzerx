# AnalyzerX Assistant

AnalyzerX now exposes a privacy-aware assistant across the Market Chat screen. Users can ask plain-English questions about supported stock, market, crypto, gold, and forex context; upload a screenshot or chart; record a short voice question; and request navigation, news filtering, or a research report.

## Runtime behavior

The client keeps chat history locally and sends only the current bounded request to the server. Text-only requests use the fast text model; image/audio requests use the available multimodal model. The live built-in catalog was checked during implementation and currently exposes `gpt-5-mini`, `gemini-3-flash-preview`, other GPT/Claude/Gemini models, but **does not expose Gemma 4 E2B**. The app therefore does not falsely label the current runtime as Gemma. A future native Gemma adapter can implement the same shared assistant contract without changing the UI or action validator.

## Multimodal limits

The app accepts at most two attachments per request. Images are passed as bounded data URLs and audio is passed as an audio file URL payload. Unsupported MIME types, oversized inputs, empty questions, and arbitrary attachments are rejected or routed to the deterministic fallback. The assistant never claims to have read an attachment if the multimodal model fails.

## Safe actions

The assistant may return only one of the following actions: navigate to an allowlisted AnalyzerX route, open a selected-symbol report, or filter selected-symbol news by sentiment. The client executes these actions locally after displaying an action badge. No trade, payment, credential, account mutation, or external side effect is exposed to the assistant.

## Evidence policy

Market claims are grounded in the existing fundamentals, verified selected-symbol news, recent tracked news, and multi-asset timing signals. Responses retain sources, data timestamp, confidence, and limitations. If the reasoning model is unavailable, the system returns a deterministic source-aware summary rather than fabricated analysis.
