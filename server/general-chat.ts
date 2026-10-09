import { invokeLLM } from "./_core/llm";

export type GeneralChatMessage = { role: "user" | "assistant"; content: string };

export type GeneralChatResponse = {
  answer: string;
  engine: "connected";
  runtimeModel: string;
  limitations: string[];
};

function safeHistory(history: GeneralChatMessage[]) {
  return history.slice(-20).map((item) => ({
    role: item.role,
    content: item.content.replace(/\s+/g, " ").trim().slice(0, 1_000),
  })).filter((item) => item.content.length > 0);
}

function safeProviderMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/401|403|unauthori[sz]ed|api key|forbidden/i.test(message)) return "The hosted AI service rejected the request. Try again later or use Local mode.";
  if (/429|rate limit|too many requests/i.test(message)) return "The hosted AI service is temporarily rate-limited. Try again shortly or use Local mode.";
  if (/timeout|timed out|network|fetch|connect|socket|5\\d\\d/i.test(message)) return "The hosted AI service was unreachable. Try again later or use Local mode.";
  return "The hosted AI service returned an invalid response. Try again.";
}

export async function answerGeneralChat(message: string, history: GeneralChatMessage[] = []): Promise<GeneralChatResponse> {
  const cleanMessage = message.replace(/\s+/g, " ").trim().slice(0, 2_000);
  if (!cleanMessage) throw new Error("A message is required");
  const runtimeModel = "gpt-5-mini";
  try {
    const response = await invokeLLM({
      model: runtimeModel,
      messages: [
        { role: "system", content: "You are AnalyzerX General Assistant, a helpful general-purpose chatbot. Answer questions about coding, writing, explanations, planning, brainstorming, education, and everyday topics directly and concisely. You may acknowledge uncertainty. Do not claim live facts, current prices, current news, or current events unless they are supplied as verified evidence. Do not provide personalized financial, medical, legal, or tax decisions. Do not output JSON, hidden reasoning, chat-template markers, or markdown fences." },
        ...safeHistory(history),
        { role: "user", content: cleanMessage },
      ],
      maxTokens: 900,
    });
    const raw = response.choices[0]?.message?.content;
    const answer = typeof raw === "string" ? raw.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<\|(?:im_(?:start|end)|assistant|user|system|end_of_text)\|>/gi, "").trim() : "";
    if (!answer) throw new Error("The hosted AI returned an empty response");
    return { answer, engine: "connected", runtimeModel, limitations: ["This is general-purpose assistance and is not a live market-data feed."] };
  } catch (error) {
    throw new Error(safeProviderMessage(error));
  }
}
