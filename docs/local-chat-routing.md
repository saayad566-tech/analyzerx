# AnalyzerX local chat routing

## Request flow

1. The Assistant stores a user-selected runtime mode locally: `Auto`, `Local model`, or `Connected`.
2. The Local AI screen persists the loaded model ID after a verified artifact is loaded. Loading another model first unloads the previous active runtime.
3. In `Local model` mode, the client calls `chat.ground` to retrieve fundamentals, verified news, tracked market items, multi-asset signals, sources, and freshness metadata.
4. The client builds a bounded prompt containing the user question and grounded context, then calls `getLocalAIRuntime().stream()` on the selected native Android model.
5. Local responses are rendered with evidence and freshness metadata. Local text inference cannot execute navigation actions or process image/audio attachments in this release.
6. In `Connected` mode, the existing `chat.ask` route uses the server-grounded hosted model and supports multimodal attachments and allowlisted app actions.
7. In `Auto` mode, AnalyzerX uses local text inference only when a model is selected, the native bridge is available, and there are no attachments. Otherwise it uses the connected route.

## Safety boundary

The local model is not allowed to answer current-news or government-announcement questions from its weights alone. The server remains responsible for retrieving current evidence. The local model receives only the bounded grounded context and is instructed to state when evidence is unavailable. No financial transaction tool is exposed to local inference.

## Android release requirements

The JavaScript route is testable in the web preview, but actual local generation requires a native Android build containing the LiteRT-LM bridge. Before release, compile the generated Android project, install on an arm64 device, download Gemma 4 E2B, load it, send a text question in Local mode, verify token events, cancel a long response, unload it, and switch to Gemma 4 E4B. The other catalog families remain disabled until their Android adapters and artifacts are separately verified.
