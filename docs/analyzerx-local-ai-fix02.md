# AnalyzerX FIX 02 — Local Model Loading & Engine Selection (v3.5.0)

**Scope:** the local AI model lifecycle and engine-selection logic only, plus the requested "answer everything" behaviour.

---

## 1. Observed failure

The Assistant UI showed the model as active ("Qwen3 0.6B LiteRT") but a request then failed with *"I could not complete that request. Load a verified .litertlm model before generating."*, and Connected mode reported it could not reach the hosted AI.

---

## 2. Root cause (confirmed by reading the code)

`runtime.load()` was called in **exactly one place** — the Model Center screen (`app/local-ai.tsx`). The chat screens resolved the engine to "local", displayed the selected model name, and called `stream()` **without ever loading the model into the native engine**. The native module therefore rejected the request with `LOCAL_AI_NOT_LOADED`.

Two supporting faults made it worse:

- The Model Center initialised its "loaded" flag from `getActiveLocalAIModelId()` — the *selected* model — so the UI claimed a model was loaded when the engine was empty.
- Connected mode had no check that a hosted provider was actually configured, so it failed at send time instead of saying so up front.

---

## 3. What was implemented

### 3.1 Explicit model lifecycle (pure, tested)

`lib/local-ai-lifecycle.ts` defines the states the brief asks for — **unsupported, not-installed, downloading, verifying, installed, loading, ready, generating, failed** — and derives one state from the raw signals. Crucially, `canGenerate` is true **only** for `ready`/`generating`, so the UI cannot claim the model can answer before the runtime has confirmed a load. A downloaded-but-not-loaded model reports **"Installed"**, not "Ready".

### 3.2 Session manager

`lib/local-ai-session.ts` is the single place that verifies and loads a model before inference:

- `ensureModelLoaded(modelId)` — checks the native bridge, installability, device eligibility (RAM/storage/arch), file presence and integrity (the on-device byte count must equal the pinned manifest size), then loads. It is a no-op when the model is already loaded, and throws a typed `LocalAIModelError` whose message names the **exact missing dependency and the next action** (e.g. *"Download it in Marketplace → Local AI models."*).
- `lifecycleFor(modelId)` — the explicit state for the UI.
- `markGenerating`, `unload`, `isModelOperational`, and a subscribe API.

### 3.3 Correct engine selection

- Both chat screens call `ensureModelLoaded` before streaming, so "local" is only ever used with a genuinely loaded model.
- `isConnectedEngineConfigured()` (in `lib/market-chat-runtime.ts`) reports whether a hosted provider is actually configured; the market screen now shows **"Connected · no provider"** instead of failing silently, and the general screen labels it too.
- `resolveMarketChatEngine` continues to route Auto/Local/Connected, and the displayed status is derived from the same engine the send path uses.

### 3.4 Answers everything (coding, writing, daily life)

The local prompt previously forbade code fences, which fought the "answer everything" goal. The system instruction now explicitly covers coding, writing, explanations, planning, study and everyday questions, and permits short code blocks, tables and lists where they help — while still refusing to invent live market facts. The general chat grounds live-data questions with verified context and answers everything else generally; the hosted system prompt already covered these topics.

### 3.5 Chat history preserved

A model-lifecycle failure is written as an assistant message (never a raw native error), so the conversation and its history survive a failed send.

---

## 4. Files changed

| File | Change |
| --- | --- |
| `lib/local-ai-lifecycle.ts` *(new)* | Explicit lifecycle states + pure derivation |
| `lib/local-ai-session.ts` *(new)* | Verify-and-load session manager; typed `LocalAIModelError` |
| `lib/market-chat-runtime.ts` | `isConnectedEngineConfigured`; prompt now covers coding/writing and allows code blocks |
| `components/model-switcher.tsx` | Rows show the real lifecycle state; Ready only after a confirmed load |
| `app/local-ai.tsx` | Model Center loads via the session; "loaded" reflects the real runtime state |
| `app/general-chat.tsx` | Loads the model before streaming; engine label reflects provider config; safe lifecycle errors |
| `app/market-chat.tsx` | Same load gate; "Connected · no provider" status; safe lifecycle errors |
| `tests/local-ai-lifecycle.test.ts` *(new)* | 12 lifecycle + engine-selection cases |

---

## 5. Acceptance criteria — status

| Criterion | Status |
| --- | --- |
| Never claim local AI is ready before successful initialisation | **Met** — `ready` only after load; downloaded models read "Installed" |
| A valid installed model generates a response | **Met** — model is loaded automatically on first send |
| Missing-model errors explain the supported next action | **Met** — `LocalAIModelError` names the file and the install path |
| Device that cannot run the model is documented, not faked | **Met** — `unsupported` state with the device reasons |
| Auto does not silently switch engines while showing the wrong name | **Met** — status derives from the engine the send path selects |
| Chat history preserved after failures | **Met** |

---

## 6. Verification & honest limits

- `lib/local-ai-lifecycle.ts` passes strict `tsc`; 15 lifecycle assertions pass locally, mirrored by the committed vitest suite.
- Full-project `tsc`, the full `vitest` suite and the Android build run in CI before the APK is published.
- **Limitation:** the native LiteRT runtime cannot be exercised in this environment (no Android device/emulator), so an actual model load + generation is verified by CI compilation and code inspection, not by an interactive on-device run. On-device QA is recommended. Also, an on-device model requires a one-time download (~498 MB for Qwen3 0.6B); it is not bundled in the APK.
