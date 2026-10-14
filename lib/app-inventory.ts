/**
 * Machine-readable inventory of AnalyzerX's own screens.
 *
 * The defect this fixes: asked "Show me where Market Flows is", the Assistant replied
 * that live market data was required. It had no model of the app it lives in — it
 * treated a navigation question as a data question.
 *
 * This inventory is the source of truth the Assistant reasons over. Entries are taken
 * from the real `app/` route tree and the real tab titles in `app/(tabs)/_layout.tsx`,
 * not invented. It is deliberately data-only: no React, no I/O, so it is testable and
 * cannot drift into being a second implementation of the UI.
 */

export type ScreenKind = "tab" | "screen";

export type AppScreen = {
  /** Stable id, used by the resolver and in tests. */
  id: string;
  /** Expo Router route, exactly as navigation expects it. */
  route: string;
  /** The label the user actually sees. */
  label: string;
  kind: ScreenKind;
  /** What this screen does, in one plain sentence. */
  summary: string;
  /** Other names a user might use for it. */
  aliases: string[];
  /** True when the screen's content changes with the selected market. */
  marketAware: boolean;
};

/** The eight bottom-navigation tabs, with their real titles. */
export const APP_TABS: AppScreen[] = [
  { id: "live", route: "/(tabs)", label: "Live", kind: "tab", summary: "The main dashboard: a live market snapshot, top movers, and the latest market news for the selected market.", aliases: ["home", "dashboard", "live market", "market overview", "market snapshot", "main"], marketAware: true },
  { id: "storylines", route: "/(tabs)/storylines", label: "Stories", kind: "tab", summary: "Connected market storylines — events grouped into developing narratives with a score and confidence.", aliases: ["stories", "storyline", "narratives", "story"], marketAware: true },
  { id: "graph", route: "/(tabs)/graph", label: "Graph", kind: "tab", summary: "A relationship graph of entities and the events that connect them.", aliases: ["graph", "network", "relationships", "map"], marketAware: true },
  { id: "sectors", route: "/(tabs)/sectors", label: "Sectors", kind: "tab", summary: "Sector and industry analysis with scores for the selected market.", aliases: ["sectors", "sector", "industry", "industries"], marketAware: true },
  { id: "flows", route: "/(tabs)/flows", label: "Flows", kind: "tab", summary: "Institutional capital flows: FII and DII net buying and selling, with a like-for-like comparison across periods. Availability depends on the selected market.", aliases: ["flows", "market flows", "capital flows", "fii", "dii", "institutional flows", "money flow", "fund flows"], marketAware: true },
  { id: "screener", route: "/(tabs)/screener", label: "Screener", kind: "tab", summary: "Filter and rank instruments by fundamentals and price criteria for the selected market.", aliases: ["screener", "screen", "filter", "stock screener", "scanner"], marketAware: true },
  { id: "assistant", route: "/(tabs)/assistant", label: "Assistant", kind: "tab", summary: "The AI research co-pilot: ask about a company, a market, a chart, or an app feature.", aliases: ["assistant", "chat", "ai", "copilot", "co-pilot", "chatbot", "market chat"], marketAware: true },
  { id: "alerts", route: "/(tabs)/alerts", label: "Alerts", kind: "tab", summary: "Price and event alerts you have set, and their triggered results.", aliases: ["alerts", "alert", "notifications", "price alerts", "watch"], marketAware: true },
];

/** Non-tab screens reachable from within the app. */
export const APP_SCREENS_ONLY: AppScreen[] = [
  { id: "market-country", route: "/market-country", label: "Market & Country", kind: "screen", summary: "Choose the primary market. Shows each market's live categories and what is gated.", aliases: ["market country", "market selector", "choose market", "switch market", "change market", "settings market", "country"], marketAware: false },
  { id: "company", route: "/company/[symbol]", label: "Company timeline", kind: "screen", summary: "A single instrument's profile, latest price, event timeline and connected entities.", aliases: ["company", "company detail", "instrument", "stock detail", "company timeline"], marketAware: true },
  { id: "filings", route: "/filings", label: "Filings", kind: "screen", summary: "Regulatory filings and announcements, with forms, accessions and XBRL trends.", aliases: ["filings", "filing", "disclosures", "announcements", "sec filings", "regulatory"], marketAware: true },
  { id: "deep-score", route: "/deep-score", label: "Deep Score", kind: "screen", summary: "The institutional scoring view: pillars, confidence and red flags for a symbol.", aliases: ["deep score", "score", "scoring", "rating", "institutional score"], marketAware: true },
  { id: "sector-detail", route: "/sector/[name]", label: "Sector detail", kind: "screen", summary: "One sector's constituents, score and supporting events.", aliases: ["sector detail", "sector page"], marketAware: true },
  { id: "news-detail", route: "/news/[id]", label: "News article", kind: "screen", summary: "A single news item with its source, timestamp and relevance.", aliases: ["news article", "article", "news detail"], marketAware: true },
  { id: "macro-context", route: "/macro-context", label: "Public Macro Context", kind: "screen", summary: "Public macro indicators — rates, periods, units and freshness.", aliases: ["macro", "macro context", "macroeconomic", "indicators", "economy"], marketAware: true },
  { id: "research-desk", route: "/research-desk", label: "Research Desk", kind: "screen", summary: "Saved research, comparisons and evidence navigation.", aliases: ["research desk", "research", "saved research"], marketAware: true },
  { id: "research-workspace", route: "/research-workspace", label: "Research Workspace", kind: "screen", summary: "A working area for building and comparing research.", aliases: ["research workspace", "workspace"], marketAware: true },
  { id: "history", route: "/history", label: "History", kind: "screen", summary: "Your recent activity and archive exports.", aliases: ["history", "recent", "archive", "past"], marketAware: true },
  { id: "local-ai", route: "/local-ai", label: "Local AI", kind: "screen", summary: "On-device model management: download, verify and select a local model.", aliases: ["local ai", "on-device model", "local model", "model download", "offline ai"], marketAware: false },
  { id: "local-ai-telemetry", route: "/local-ai-telemetry", label: "Local AI Telemetry", kind: "screen", summary: "Local inference telemetry and export.", aliases: ["telemetry", "local ai telemetry", "inference stats"], marketAware: false },
  { id: "data-truth", route: "/data-truth", label: "Data Truth", kind: "screen", summary: "What the app can and cannot verify about its own data.", aliases: ["data truth", "data status", "coverage", "what works"], marketAware: false },
  { id: "appearance", route: "/appearance", label: "Appearance", kind: "screen", summary: "Theme and display settings.", aliases: ["appearance", "theme", "dark mode", "light mode", "display"], marketAware: false },
  { id: "account", route: "/account", label: "Account", kind: "screen", summary: "Your account and preferences.", aliases: ["account", "profile", "settings"], marketAware: false },
  { id: "notifications", route: "/notifications", label: "Notifications", kind: "screen", summary: "Notification settings and delivery.", aliases: ["notifications", "notification settings", "push"], marketAware: false },
  { id: "marketplace", route: "/marketplace", label: "Marketplace", kind: "screen", summary: "Available extensions and add-ons.", aliases: ["marketplace", "add-ons", "extensions", "store"], marketAware: false },
  { id: "support", route: "/support", label: "Support", kind: "screen", summary: "Help, documentation and contact options for getting unstuck.", aliases: ["support", "help", "contact"], marketAware: false },
];

/** Every screen the app exposes. */
export const APP_INVENTORY: AppScreen[] = [...APP_TABS, ...APP_SCREENS_ONLY];

/** Look a screen up by its id. */
export function screenById(id: string): AppScreen | null {
  return APP_INVENTORY.find((screen) => screen.id === id) ?? null;
}

/**
 * Find screens matching a free-text query, best match first.
 *
 * Ranking: exact label, exact alias, alias prefix, label prefix, then substring on
 * either. Longer alias matches win over shorter ones, so "market flows" beats a bare
 * "flow" style match.
 */
export function findScreens(query: string, limit = 3): AppScreen[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const score = (screen: AppScreen): number => {
    const label = screen.label.toLowerCase();
    if (label === needle) return 0;
    let best = -1;
    for (const alias of screen.aliases) {
      const a = alias.toLowerCase();
      if (a === needle) best = best === -1 ? 1 : Math.min(best, 1);
      else if (a.startsWith(needle)) best = best === -1 ? 2 : Math.min(best, 2);
    }
    if (best !== -1) return best;
    if (label.startsWith(needle)) return 3;
    if (label.includes(needle)) return 4;
    for (const alias of screen.aliases) if (alias.toLowerCase().includes(needle)) return 5;
    return -1;
  };
  return APP_INVENTORY
    .map((screen) => ({ screen, rank: score(screen) }))
    .filter((entry) => entry.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.screen.label.localeCompare(b.screen.label))
    .slice(0, Math.max(0, limit))
    .map((entry) => entry.screen);
}

/** How the bottom navigation reads, left to right — used when explaining location. */
export function tabOrderLabel(): string {
  return APP_TABS.map((tab) => tab.label).join(" · ");
}

/** A compact description of the app for a prompt or an "what can you do" answer. */
export function inventorySummary(): string {
  return `${APP_TABS.length} tabs (${tabOrderLabel()}) and ${APP_SCREENS_ONLY.length} further screens.`;
}
