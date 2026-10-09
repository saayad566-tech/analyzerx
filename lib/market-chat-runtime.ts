import type { MarketChatRuntimeMode } from "./local-preferences";

export type MarketChatEngine = "local" | "connected" | "blocked";

// Qwen3 0.6B LiteRT rejects inputs at 2048 tokens. Keep a conservative margin.
export const LOCAL_MODEL_INPUT_TOKEN_BUDGET = 1400;
export const LOCAL_MODEL_INPUT_CHAR_BUDGET = 5600;

export function estimatePromptTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function compactText(text: string, maxChars: number): string {
  return text.replace(/\s+/g, " ").trim().slice(0, maxChars);
}

export function compactLocalContext(context: string, maxChars = LOCAL_MODEL_INPUT_CHAR_BUDGET): { context: string; wasTrimmed: boolean } {
  const source = compactText(context, context.length);
  if (source.length <= maxChars && estimatePromptTokens(source) <= LOCAL_MODEL_INPUT_TOKEN_BUDGET) return { context: source, wasTrimmed: false };
  const head = Math.floor(maxChars * 0.68);
  const tail = maxChars - head;
  return { context: `${source.slice(0, head)} … [context shortened for local model] … ${source.slice(-tail)}`, wasTrimmed: true };
}

export function buildLocalGeneralPrompt(question: string, modelName: string): { prompt: string; wasTrimmed: boolean; estimatedTokens: number } {
  const prompt = `You are the private AnalyzerX local assistant running as ${compactText(modelName, 80)}. Answer the user briefly and helpfully. This is general conversation without verified live market context. Do not invent current prices, news, filings, or forecasts. If live data is requested, explain that connected evidence is required. Do not output JSON, actions, or markdown fences.\n\nUSER QUESTION:\n${compactText(question || "Please ask a question.", 800)}`;
  return { prompt, wasTrimmed: false, estimatedTokens: estimatePromptTokens(prompt) };
}

export function buildBoundedLocalPrompt(question: string, context: string, modelName: string, grounded: boolean): { prompt: string; wasTrimmed: boolean; estimatedTokens: number } {
  if (!grounded) return buildLocalGeneralPrompt(question, modelName);
  const compact = compactLocalContext(context);
  const prompt = `You are the private AnalyzerX local assistant running as ${compactText(modelName, 80)}. Answer clearly and briefly using ONLY the verified context for current prices, news, filings, or forecasts. Never invent current prices, news, filings, government announcements, or future outcomes. If evidence is absent, say so. Do not output JSON, actions, or markdown fences.\n\nUSER QUESTION:\n${compactText(question || "Summarize the supplied context.", 800)}\n\nVERIFIED CONTEXT:\n${compact.context}`;
  const estimatedTokens = estimatePromptTokens(prompt);
  if (estimatedTokens >= 1900) {
    const tighterContext = compactLocalContext(compact.context, 4200).context;
    const tighterPrompt = prompt.replace(compact.context, tighterContext);
    return { prompt: tighterPrompt, wasTrimmed: true, estimatedTokens: estimatePromptTokens(tighterPrompt) };
  }
  return { prompt, wasTrimmed: compact.wasTrimmed, estimatedTokens };
}

export function isGeneralChatQuestion(question: string): boolean {
  return !/(price|quote|stock|share|ticker|market|news|headline|filing|earnings|result|dividend|valuation|p\/?e|crypto|bitcoin|gold|forex|fii|dii|chart|technical|fundamental|company|latest|today|current|recent)/i.test(question);
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

export function buildLocalGroundedPrompt(question: string, groundedContext: string, modelName: string): string {
  return buildBoundedLocalPrompt(question, groundedContext, modelName, true).prompt;
}

export function isCurrentDataQuestion(question: string): boolean {
  return /(latest|today|current|recent|now|price|news|headline|filing|earnings|quote|forecast)/i.test(question);
}

export function localPromptNotice(wasTrimmed: boolean): string | undefined {
  return wasTrimmed ? "Local mode shortened older context to stay within the model's 2048-token limit." : undefined;
}