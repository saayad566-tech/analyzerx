import { describe, expect, it } from "vitest";

import {
  APP_INVENTORY,
  APP_TABS,
  findScreens,
  inventorySummary,
  screenById,
  tabOrderLabel,
} from "../lib/app-inventory";
import {
  buildAppAwarenessAnswer,
  detectAppIntent,
  isAnswerableFromAppInventory,
  isAppDataQuestion,
  resolveAppTargets,
} from "../lib/assistant-app-awareness";

describe("app inventory", () => {
  it("holds the eight real bottom-navigation tabs, in order", () => {
    expect(APP_TABS.length).toBe(8);
    expect(APP_TABS.map((tab) => tab.label)).toEqual([
      "Live", "Stories", "Graph", "Sectors", "Flows", "Screener", "Assistant", "Alerts",
    ]);
  });

  it("has no duplicate ids and every entry is complete", () => {
    const ids = APP_INVENTORY.map((screen) => screen.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const screen of APP_INVENTORY) {
      expect(screen.route.startsWith("/")).toBe(true);
      expect(screen.label.length).toBeGreaterThan(1);
      expect(screen.summary.length).toBeGreaterThan(20);
      expect(screen.aliases.length).toBeGreaterThan(0);
    }
  });

  it("looks screens up by id", () => {
    expect(screenById("flows")?.route).toBe("/(tabs)/flows");
    expect(screenById("nope")).toBeNull();
  });

  it("finds screens by alias and by label", () => {
    expect(findScreens("flows")[0].id).toBe("flows");
    expect(findScreens("fii dii")[0].id).toBe("flows");
    expect(findScreens("screener")[0].id).toBe("screener");
    expect(findScreens("")[0]).toBeUndefined();
  });

  it("renders the tab order and a summary", () => {
    expect(tabOrderLabel()).toContain("Flows");
    expect(inventorySummary()).toMatch(/8 tabs/);
  });
});

describe("assistant app awareness — the reported defect", () => {
  it('answers "Show me where Market Flows is" with the Flows tab', () => {
    const answer = buildAppAwarenessAnswer("Show me where Market Flows is");
    expect(answer).not.toBeNull();
    expect(answer?.intent).toBe("where");
    expect(answer?.screens[0].id).toBe("flows");
    expect(answer?.answer).toMatch(/bottom navigation/i);
    expect(answer?.answer).toContain("Flows");
  });

  it("never says live market data is required for a navigation question", () => {
    for (const question of ["Show me where Market Flows is", "Where is the screener?", "where are alerts"]) {
      const answer = buildAppAwarenessAnswer(question);
      expect(answer?.answer ?? "").not.toMatch(/live (market )?data (is )?(required|needed)/i);
      expect(answer?.answer ?? "").not.toMatch(/\bnot (?:available|connected)\b/i);
    }
  });

  it('routes "Open Market Flows" to the Flows route', () => {
    const answer = buildAppAwarenessAnswer("Open Market Flows");
    expect(answer?.intent).toBe("open");
    expect(answer?.route).toBe("/(tabs)/flows");
  });

  it('explains "What does Market Flows do?" from verified app info', () => {
    const answer = buildAppAwarenessAnswer("What does Market Flows do?");
    expect(answer?.intent).toBe("explain");
    expect(answer?.answer).toMatch(/FII|DII|capital flows/i);
    expect(answer?.screens[0].id).toBe("flows");
  });

  it("resolves a range of screens", () => {
    expect(buildAppAwarenessAnswer("where is the screener")?.screens[0].id).toBe("screener");
    expect(buildAppAwarenessAnswer("go to the assistant")?.route).toBe("/(tabs)/assistant");
    expect(buildAppAwarenessAnswer("what is the macro context screen for")?.screens[0].id).toBe("macro-context");
    expect(buildAppAwarenessAnswer("which tab has alerts")?.screens[0].id).toBe("alerts");
    expect(buildAppAwarenessAnswer("how do I open the deep score")?.screens[0].id).toBe("deep-score");
  });

  it("lists the screens when asked what it can do", () => {
    const answer = buildAppAwarenessAnswer("what can you do");
    expect(answer?.intent).toBe("list");
    expect(answer?.screens.length).toBe(8);
    expect(answer?.answer).toMatch(/bottom navigation/i);
  });

  it("admits when it cannot match a target, rather than guessing", () => {
    const answer = buildAppAwarenessAnswer("where is the quantum widget");
    expect(answer).not.toBeNull();
    expect(answer?.screens).toEqual([]);
    expect(answer?.answer).toMatch(/could not match/i);
  });
});

describe("assistant app awareness — knowledge is not live data", () => {
  it("does NOT intercept genuinely data-dependent questions", () => {
    for (const question of [
      "Show me Australian market news",
      "what is the price of AAPL",
      "US market earnings this week",
      "NIFTY chart for the last month",
      "latest filings for Reliance",
    ]) {
      expect(buildAppAwarenessAnswer(question)).toBeNull();
      expect(isAnswerableFromAppInventory(question)).toBe(false);
    }
  });

  it("does NOT intercept general or unrelated questions", () => {
    for (const question of ["what is a P/E ratio", "tell me a joke about the market", "explain compound interest", ""]) {
      expect(buildAppAwarenessAnswer(question)).toBeNull();
    }
  });

  it("classifies data questions and app questions differently", () => {
    expect(isAppDataQuestion("Show me Australian market news")).toBe(true);
    expect(isAppDataQuestion("where is market flows")).toBe(false);
    expect(detectAppIntent("Show me Australian market news")).toBe("none");
    expect(detectAppIntent("where is market flows")).toBe("where");
    expect(detectAppIntent("open the flows tab")).toBe("open");
  });

  it("does not treat a data question as navigation even when it names a screen", () => {
    // "screener" names a screen, but this is asking for live data.
    expect(buildAppAwarenessAnswer("show me screener results for US market stocks")).toBeNull();
  });

  it("resolves targets by whole-word match, not exact string equality", () => {
    expect(resolveAppTargets("Show me where Market Flows is")[0].id).toBe("flows");
    expect(resolveAppTargets("can you open the sector page")[0].id).toBe("sector-detail");
    expect(resolveAppTargets("nothing relevant here")).toEqual([]);
  });
});
