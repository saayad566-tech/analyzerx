/**
 * Lets the Assistant answer questions about the app itself, without needing live data.
 *
 * The defect this fixes: asked "Show me where Market Flows is", the Assistant answered
 * that live market data was required. A navigation question was being routed to the
 * data path, so it could never be answered.
 *
 * This module classifies the question first. A question about where a feature is, how
 * to open it, or what it does is answered from the verified app inventory with no data
 * call at all. A genuinely data-dependent question ("Show Australian market news") is
 * deliberately NOT intercepted and falls through to the normal pipeline.
 *
 * Pure and testable: no React, no network, no model.
 */

import { APP_INVENTORY, APP_TABS, type AppScreen, inventorySummary, tabOrderLabel } from "./app-inventory";

export type AppIntent = "where" | "open" | "explain" | "list" | "none";

const WHERE_CUES = /\b(where(?:'s| is| are)?|how do i (?:get to|find|reach|open)|show me where|locate|find the|which tab|what tab)\b/;
const OPEN_CUES = /\b(?:open|go to|navigate to|take me to|jump to|launch|switch to)\b/;
const EXPLAIN_CUES = /\b(?:what does .* do|what is .* for|what's .* for|how do i use|explain (?:the )?.*(?:screen|tab|page|feature)|what is the .* (?:screen|tab|page)|tell me about the .* (?:screen|tab|page|feature))\b/;
const LIST_CUES = /\b(?:what can you do|what screens|which screens|list (?:the )?(?:tabs|screens)|what tabs|app features|what features|what can this app do)\b/;

/** Words that mark a question as being about live financial data rather than the app. */
const DATA_WORDS = /\b(?:news|headline|price|prices|quote|quotes|earnings|results|financials|chart|performance|filings?|dividend|valuation|p\/e|pe ratio)\b/;
const MARKET_WORDS = /\b(?:market|country|stock|stocks|share|shares|nifty|sensex|index|indices|s&p|nasdaq|ftse)\b/;

/** True when the question is asking for live market data, not about the app itself. */
export function isAppDataQuestion(question: string): boolean {
  const q = question.toLowerCase();
  return DATA_WORDS.test(q) && MARKET_WORDS.test(q);
}

/**
 * Classify a question's intent toward the app.
 *
 * "none" means this module should not answer — the caller continues down its normal
 * path. That is the important case: it is how a data question stays a data question.
 */
export function detectAppIntent(question: string): AppIntent {
  const q = question.trim().toLowerCase();
  if (!q) return "none";
  if (LIST_CUES.test(q)) return "list";
  const navCue = WHERE_CUES.test(q) || OPEN_CUES.test(q);
  // A data question with no navigation cue is left alone.
  if (isAppDataQuestion(q) && !navCue) return "none";
  if (OPEN_CUES.test(q)) return "open";
  if (WHERE_CUES.test(q)) return "where";
  if (EXPLAIN_CUES.test(q)) return "explain";
  return "none";
}

/**
 * The screens a question refers to, best match first.
 *
 * Matching is by the longest screen name or alias that appears in the question as a
 * whole word, rather than by exact string equality. "Show me where Market Flows is"
 * therefore matches the alias "market flows" (12 chars) and resolves to Flows, even
 * though the sentence carries extra words. Longer matches win, so a specific phrase
 * beats a generic one.
 */
export function resolveAppTargets(question: string, limit = 3): AppScreen[] {
  const q = question.toLowerCase();
  if (!q.trim()) return [];
  const scored = APP_INVENTORY.map((screen) => {
    let best = -1;
    const candidates = [screen.label.toLowerCase(), ...screen.aliases.map((alias) => alias.toLowerCase())];
    for (const candidate of candidates) {
      if (candidate.length < 3) continue;
      const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`\\b${escaped}\\b`).test(q)) best = Math.max(best, candidate.length);
    }
    return { screen, score: best };
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.screen.label.localeCompare(b.screen.label));
  return scored.slice(0, Math.max(0, limit)).map((entry) => entry.screen);
}

export type AppAnswer = {
  intent: AppIntent;
  /** The reply text, ready to show. */
  answer: string;
  /** A route to navigate to, when the intent was to open a screen. */
  route?: string;
  /** The screens the answer refers to. */
  screens: AppScreen[];
};

function tabPosition(screen: AppScreen): string {
  const index = APP_TABS.findIndex((tab) => tab.id === screen.id);
  if (index < 0) return "";
  return `tab ${index + 1} of ${APP_TABS.length}`;
}

function describeLocation(screen: AppScreen): string {
  if (screen.kind !== "tab") {
    return `"${screen.label}" is a screen inside the app, not a bottom-navigation tab. It opens from the relevant section rather than the tab bar.`;
  }
  return `"${screen.label}" is in the bottom navigation — ${tabPosition(screen)}. The tab bar reads: ${tabOrderLabel()}.`;
}

/**
 * Produce an answer about the app, or null when the question is not about the app.
 *
 * A null return is not a failure: it means the caller should handle the question
 * normally. This module only ever answers what the inventory can support.
 */
export function buildAppAwarenessAnswer(question: string): AppAnswer | null {
  const intent = detectAppIntent(question);
  if (intent === "none") return null;

  if (intent === "list") {
    return {
      intent,
      answer: [
        `AnalyzerX has ${inventorySummary()}`,
        "",
        "Bottom navigation, left to right:",
        ...APP_TABS.map((tab, index) => `${index + 1}. ${tab.label} — ${tab.summary}`),
        "",
        "You can ask me to open any of these, for example \"open the screener\" or \"where is Market Flows\".",
      ].join("\n"),
      screens: APP_TABS,
    };
  }

  const screens = resolveAppTargets(question);
  if (!screens.length) {
    // We recognised the intent but not the target — say so honestly rather than guess.
    return {
      intent,
      answer: `I could not match that to a screen I know about. The bottom navigation is: ${tabOrderLabel()}. Ask me about one of those, or rephrase with the screen name.`,
      screens: [],
    };
  }

  const primary = screens[0];
  const others = screens.slice(1);

  if (intent === "open") {
    return {
      intent,
      answer: `Opening ${primary.label}. ${primary.summary}`,
      route: primary.route,
      screens,
    };
  }

  if (intent === "where") {
    return {
      intent,
      answer: [
        describeLocation(primary),
        primary.summary,
        primary.marketAware ? "It follows your selected market." : "It is not market-specific.",
        others.length ? `It may also be what you meant by: ${others.map((s) => s.label).join(", ")}.` : "",
      ].filter(Boolean).join(" "),
      screens,
    };
  }

  // explain
  return {
    intent,
    answer: [
      `${primary.label}: ${primary.summary}`,
      primary.marketAware ? "Its content follows the market you have selected." : "It is not market-specific.",
      `You can find it ${primary.kind === "tab" ? `in the bottom navigation (${tabPosition(primary)})` : "from within the app"}.`,
    ].join(" "),
    screens,
  };
}

/** True when this question can be answered from the app inventory alone, with no data. */
export function isAnswerableFromAppInventory(question: string): boolean {
  return buildAppAwarenessAnswer(question) !== null;
}

/** Every screen id, for consistency checks in tests. */
export function inventoryIds(): string[] {
  return APP_INVENTORY.map((screen) => screen.id);
}
