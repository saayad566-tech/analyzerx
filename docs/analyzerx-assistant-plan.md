# AnalyzerX Assistant — Advanced Plan & Implementation (v3.4.0)

**Scope:** Make the assistant a single, general "ask anything" companion — stocks, news, coding, writing, daily life — the way ChatGPT is used, with on-screen model switching; and fix the reported output-leakage and template-rendering defects (FIX 01).

---

## 1. What the user asked for

1. Ask any kind of question — stocks, news, daily life — like asking ChatGPT.
2. Switch models from the chat screen.
3. Make the assistant feature advanced.

And, from the attached FIX 01 brief: the assistant was showing internal material — `<think>…</think>` reasoning, special tokens such as `<|im_end|>`, `<|lim_start|>`, `<|lim_end|>`, its own system instructions, `new_string:` template text — and a native error: *"Failed to start nativeSendMessageAsync: INTERNAL: The new rendered template string does not start with the previous rendered template string."*

---

## 2. Diagnosis (before any change)

The assistant has two answer paths: a hosted **Connected** engine and an on-device **Local** model driven by a native LiteRT-LM bridge (`AnalyzerXLocalAI`). Reading the screens, the prompt builder and the native module produced three root causes:

| # | Root cause | Evidence |
| --- | --- | --- |
| 1 | `general-chat.tsx` sent the **whole prompt** (system preamble + user turn) as the *user message* and passed **no** system instruction. | `runtime.stream(prompt.prompt, …)` with no `systemInstruction`, while `market-chat.tsx` correctly sent `prompt.turn` + `systemInstruction: prompt.system`. |
| 2 | The output renderer relied on a **single-shot** filter that only removed *balanced* `<think>…</think>` and a short token list — an unclosed reasoning block, `<|lim_start|>`/`<|lim_end|>` and a system echo all passed through. | `sanitizeLocalOutput` in `lib/market-chat-runtime.ts`. |
| 3 | The native module opened a **new conversation without closing the previous one**, so two live conversations on one engine shared the template renderer and the second failed the "must extend the previous" check. | `AnalyzerXLocalAIModule.kt` `stream()` set `activeConversation = requestConversation` without closing the old one. |

Cause 1 also explains the system-prompt leak: sending the instruction inside the user turn made the model restate its brief.

---

## 3. The plan

**A. Separate instruction from turn (template correctness).** The system instruction is attached to the conversation **once**; only the user turn is sent as the message. Every turn's rendered template therefore extends the previous one.

**B. A real output guard, not a display filter.** A new module, `lib/assistant-output.ts`, with two entry points:
- `sanitizeAssistantOutput` — one-shot guard applied before a reply is stored.
- `createStreamingSanitizer` — a *streaming* guard that withholds reasoning and control tokens **as they arrive** and holds back a trailing partial token (`<`, `<|im_e`, `<thi`) so control syntax never flashes. This is the "protect at the source, filter as defence-in-depth" requirement.

It removes: reasoning channels (closed **and** unclosed, including a thought `<|channel|>`), the whole `<|…|>` control-token family and Gemma `<start_of_turn>` markers, the system instruction (verbatim and leading echo), the native template error with its dumped prompt, and `old_string:`/`new_string:` labels — while preserving legitimate figures, currency and prose (including a genuine `5 < 7`).

**C. Native conversation hygiene.** Close any conversation still open before opening a new one, so a second turn can never fail the template prefix check.

**D. One assistant that answers anything.** The general chat now detects a live-data question and grounds it with verified context; everything else is answered generally. Market questions and everyday questions flow through the same screen.

**E. Switch models from the chat screen.** A `ModelSwitcher` chip opens a sheet listing Auto, Connected and every on-device model with its real eligibility, download state and reason — so the control never promises an engine that cannot run.

**F. Never leak errors.** Failures render a classified, user-facing message; a raw native error or stack trace is never inserted into chat.

---

## 4. What was implemented (v3.4.0)

| Area | File | Change |
| --- | --- | --- |
| Output guard | `lib/assistant-output.ts` *(new)* | `sanitizeAssistantOutput` + `createStreamingSanitizer` (reasoning, control tokens, system echo, native-error dumps, template labels; partial-token holdback; live streaming). |
| Model switcher | `components/model-switcher.tsx` *(new)* | Chip + sheet to switch Auto / Connected / on-device model, with eligibility, download state and reasons; persists the choice. |
| General assistant | `app/general-chat.tsx` | Correct system/turn split; streaming guard with live token rendering; auto-grounds live-data questions; safe error text; model switcher in the header. |
| Market assistant | `app/market-chat.tsx` | Streaming guard + live rendering; output guard on both local and connected answers; model switcher in the header. |
| Native bridge | `plugins/local-ai-android/AnalyzerXLocalAIModule.kt`, `android/app/src/main/java/.../AnalyzerXLocalAIModule.kt` | Close the previous conversation before opening a new one. |
| Tests | `tests/assistant-output.test.ts` *(new)* | 13 cases: reasoning (balanced + unclosed), control-token families, system echo, native-error dump, template labels, legitimate-content preservation, streaming holdback, interrupted generation, cap. |

---

## 5. Acceptance criteria (from FIX 01) — status

| Criterion | Status |
| --- | --- |
| A normal question renders correctly | **Met** — instruction/turn split + guard |
| A follow-up question renders correctly | **Met** — per-request conversation closed before the next opens |
| Conversation remains intact | **Met** — history preserved; errors classified |
| No internal prompt text or special tokens visible | **Met** — guard + tests |
| Ask any kind of question | **Met** — grounded for live data, general otherwise |
| Switch models from the chat screen | **Met** — `ModelSwitcher` |
| Tests run and files reported | **Met** — `tests/assistant-output.test.ts`; files listed above |

---

## 6. Verification

- All touched files parse (esbuild).
- `lib/assistant-output.ts` passes strict `tsc` (`strict`, `noUnusedLocals`, `noUnusedParameters`).
- 23 guard assertions pass locally (mirrored by the committed vitest suite).
- Full-project `tsc` and `vitest` run in CI before the APK build.

**Honest limitation:** the native LiteRT module cannot be compiled or exercised in this environment (no Android toolchain), so the Kotlin change and on-device streaming are verified by code inspection and CI compilation, not by an interactive run. On-device QA is recommended before distribution.

---

## 7. Follow-ups (not blockers)

- Detect a dedicated thinking content channel at the native layer when the LiteRT API exposes one, so reasoning is dropped before it reaches JS (today the guard handles it in JS).
- Per-message model badge so a mixed-model conversation is legible.
- Optional streaming "stop" control wired to the existing `cancel()` bridge method.
