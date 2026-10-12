import type { MarketChatRuntimeMode } from "./local-preferences";

export type MarketChatEngine = "local" | "connected" | "blocked";

/**
 * Fallback context window when a model's real window is unknown. This is the
 * Qwen3 0.6B LiteRT limit, which is the smallest model in the catalogue.
 */
export const DEFAULT_LOCAL_CONTEXT_TOKENS = 2048;

// Retained for callers that predate per-model budgets.
export const LOCAL_MODEL_INPUT_TOKEN_BUDGET = 1400;
export const LOCAL_MODEL_INPUT_CHAR_BUDGET = 5600;

/**
 * Input budget for a model, derived from its real context window instead of one
 * global assumption. The previous code trimmed every model to ~1,400 tokens, so
 * an 8K-context multimodal model was given a 0.6B model's budget. The reserve
 * leaves room for the chat template, the instruction and the reply.
 */
export function localInputBudget(contextTokens?: number | null): { tokens: number; chars: number } {
  const requested = typeof contextTokens === "number" && Number.isFinite(contextTokens) && contextTokens > 0
    ? contextTokens
    : DEFAULT_LOCAL_CONTEXT_TOKENS;
  const window = Math.max(1024, Math.min(32768, Math.floor(requested)));
  const tokens = Math.max(512, Math.floor(window * 0.55));
  return { tokens, chars: tokens * 4 };
}

export function estimatePromptTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function compactText(text: string, maxChars: number): string {
  return text.replace(/\s+/g, " ").trim().slice(0, maxChars);
}

export function compactLocalContext(context: string, maxChars = LOCAL_MODEL_INPUT_CHAR_BUDGET, maxTokens = LOCAL_MODEL_INPUT_TOKEN_BUDGET): { context: string; wasTrimmed: boolean } {
  const source = compactText(context, context.length);
  if (source.length <= maxChars && estimatePromptTokens(source) <= maxTokens) return { context: source, wasTrimmed: false };
  const head = Math.floor(maxChars * 0.68);
  const tail = maxChars - head;
  return { context: `${source.slice(0, head)} … [context shortened for local model] … ${source.slice(-tail)}`, wasTrimmed: true };
}

export function buildLocalGeneralPrompt(
  question: string,
  modelName: string,
  contextTokens?: number | null,
): { prompt: string; wasTrimmed: boolean; estimatedTokens: number } {
  const budget = localInputBudget(contextTokens);
  const prompt = [
    `You are AnalyzerX Assistant, a helpful, knowledgeable AI assistant running privately on this device as ${compactText(modelName, 80)}.`,
    "Answer whatever the user asks, the way a good general assistant would: accurate, direct, and complete.",
    "Write in clear prose with short paragraphs. Use a short bulleted list only when a list genuinely helps.",
    "You have no live market feed in this mode. Never state current prices, live news, filings, or future outcomes as fact. If the user asks for those, say plainly that verified connected data is required, then help with everything else you can.",
    "If you are unsure, say so rather than guessing. Do not output JSON or code fences.",
    "",
    "USER:",
    compactText(question || "Please ask a question.", Math.max(400, budget.chars - 1200)),
  ].join("\n");
  return { prompt, wasTrimmed: false, estimatedTokens: estimatePromptTokens(prompt) };
}

export function buildBoundedLocalPrompt(
  question: string,
  context: string,
  modelName: string,
  grounded: boolean,
  contextTokens?: number | null,
): { prompt: string; wasTrimmed: boolean; estimatedTokens: number } {
  if (!grounded) return buildLocalGeneralPrompt(question, modelName, contextTokens);
  const budget = localInputBudget(contextTokens);
  const compact = compactLocalContext(context, budget.chars, budget.tokens);
  const prompt = [
    `You are AnalyzerX Assistant running privately on this device as ${compactText(modelName, 80)}.`,
    "Use the VERIFIED CONTEXT below for any current prices, news, filings, or forecasts, and use the figures exactly as given.",
    "Answer the user's actual question directly and completely. If part of the question is general knowledge rather than current data, answer that part normally.",
    "If the context does not contain what is needed, say so plainly instead of guessing.",
    "Never invent prices, news, filings, government announcements, or future outcomes. Do not output JSON or code fences.",
    "",
    "USER QUESTION:",
    compactText(question || "Summarize the supplied context.", Math.max(400, Math.floor(budget.chars * 0.25))),
    "",
    "VERIFIED CONTEXT:",
    compact.context,
  ].join("\n");
  const estimatedTokens = estimatePromptTokens(prompt);
  if (estimatedTokens >= budget.tokens) {
    const tighter = compactLocalContext(compact.context, Math.floor(budget.chars * 0.7), Math.floor(budget.tokens * 0.7)).context;
    const tighterPrompt = prompt.replace(compact.context, tighter);
    return { prompt: tighterPrompt, wasTrimmed: true, estimatedTokens: estimatePromptTokens(tighterPrompt) };
  }
  return { prompt, wasTrimmed: compact.wasTrimmed, estimatedTokens };
}

/**
 * A question is "general" unless it is actually asking for live state. The
 * previous version treated any question containing a market word as needing
 * verified data, so "What is a P/E ratio?" or "Tell me a joke about the market"
 * were pushed to the data path and answered with an empty context.
 */
export function isGeneralChatQuestion(question: string): boolean {
  return !isCurrentDataQuestion(question);
}

export function classifyAssistantFailure(error: unknown): "CONTEXT_LIMIT" | "NETWORK" | "TIMEOUT" | "AUTH" | "RATE_LIMIT" | "BAD_RESPONSE" | "NATIVE_RUNTIME" | "UNKNOWN" {
  const message = error instanceof Error ? error.message : String(error);
  if (/token ids|context|too long|max(imum)? number of tokens|2048/i.test(message)) return "CONTEXT_LIMIT";
  if (/timeout|timed out|abort/i.test(message)) return "TIMEOUT";
  if (/401|403|unauthori[sz]ed|forbidden|api key/i.test(message)) return "AUTH";
  if (/429|rate limit|too many requests/i.test(message)) return "RATE_LIMIT";
  if (/network|fetch|connect|socket|econn|5\\d\\d/i.test(message)) return "NETWORK";
  if (/json|schema|empty response|malformed/i.test(message)) return "BAD_RESPONSE";
  if (/native|litert|runtime|bridge/i.test(message)) return "NATIVE_RUNTIME";
  return "UNKNOWN";
}

export function formatAssistantFailure(error: unknown): string {
  const code = classifyAssistantFailure(error);
  if (code === "CONTEXT_LIMIT") return "The local model context was shortened automatically. Please retry; your conversation is preserved.";
  if (code === "NETWORK" || code === "TIMEOUT") return "The connected AI service was unreachable. AnalyzerX will use a safe local or verified-data fallback when available.";
  if (code === "AUTH") return "The connected AI service rejected the request. No private token was exposed; try Local mode or retry later.";
  if (code === "RATE_LIMIT") return "The connected AI service is temporarily rate-limited. Try again shortly or use Local mode.";
  if (code === "NATIVE_RUNTIME") return "The local model runtime is unavailable in this build. Connected mode or verified-data fallback is available.";
  return "The assistant could not complete that request. Your conversation is preserved.";
}

export function trimLocalHistory(messages: { role: string; content: string }[], maxChars = 6000): { role: "user" | "assistant"; content: string }[] {
  let remaining = maxChars;
  const selected: { role: "user" | "assistant"; content: string }[] = [];
  for (const message of [...messages].reverse()) {
    if (remaining <= 0) break;
    const content = compactText(message.content, Math.min(1_000, remaining));
    if (!content) continue;
    selected.unshift({ role: message.role === "assistant" ? "assistant" : "user", content });
    remaining -= content.length;
  }
  return selected;
}

export function sanitizeLocalOutput(answer: string): string {
  return answer
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<\|im_(?:start|end)\|>/gi, "")
    .replace(/<\|(?:assistant|user|system)\|>/gi, "")
    .replace(/<\|end_of_text\|>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function resolveMarketChatEngine(input: {
  mode: MarketChatRuntimeMode;
  activeModelId: string | null;
  nativeRuntimeAvailable: boolean;
  hasAttachments: boolean;
  supportsAttachments?: boolean;
}): MarketChatEngine {
  if (input.mode === "connected") return "connected";
  if (input.mode === "local") {
    // A managed/stable APK may not contain the experimental native bridge. Keep
    // Local mode usable by routing safely to the same hosted/deterministic
    // assistant path instead of leaving the user at an unavailable dead end.
    if (!input.activeModelId || !input.nativeRuntimeAvailable || (input.hasAttachments && !input.supportsAttachments)) return "connected";
    return "local";
  }
  if (input.activeModelId && input.nativeRuntimeAvailable && (!input.hasAttachments || input.supportsAttachments)) return "local";
  return "connected";
}

export function buildLocalGroundedPrompt(question: string, groundedContext: string, modelName: string, contextTokens?: number | null): string {
  return buildBoundedLocalPrompt(question, groundedContext, modelName, true, contextTokens).prompt;
}

export function isCurrentDataQuestion(question: string): boolean {
  const q = question.toLowerCase();
  // Explicit "right now" framing.
  if (/\b(latest|today|current|currently|right now|recent|recently|live|as of|this (?:week|month|quarter|year)|now|yesterday)\b/.test(q)) return true;
  // A request for a specific live value, rather than a definition or explanation.
  const liveNoun = /\b(price|quote|news|headline|filing|earnings|results?|dividend yield|valuation|forecast|chart|fii|dii|holdings?|stake|market cap)\b/.test(q);
  const asksForValue = /\b(what(?:'s| is| are)|how much|how many|tell me|show me|give me|list|report)\b/.test(q);
  const explains = /\b(what is a|what are|explain|meaning of|define|how do i|how does|why does|difference between)\b/.test(q);
  return liveNoun && asksForValue && !explains;
}

export function localPromptNotice(wasTrimmed: boolean, contextTokens?: number | null): string | undefined {
  if (!wasTrimmed) return undefined;
  return `Local mode shortened the context to stay within this model's ${localInputBudget(contextTokens).tokens.toLocaleString("en-IN")}-token input budget.`;
}