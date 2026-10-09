import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "market-event-intelligence.research-usage.v1";
const MAX_EVENTS = 250;

export type ResearchHistoryType = "session" | "search" | "news_open" | "analysis_open" | "export" | "watchlist" | "recommendation" | "alert" | "report" | "search_select" | "feature_discovery" | "onboarding_step" | "onboarding_dismiss" | "news_feedback";

export type ResearchUsageEvent = {
  type: ResearchHistoryType;
  symbol?: string;
  route?: string;
  createdAt: string;
};

export type ResearchHistoryEntry = ResearchUsageEvent & {
  id: string;
  title?: string;
  detail?: string;
  source?: string;
  status?: string;
};

export type ResearchUsageSummary = {
  sessions: number;
  searches: number;
  newsReads: number;
  analyses: number;
  exports: number;
  watchlistActions: number;
  lastActiveAt: string | null;
  topSymbols: string[];
};

async function readEvents(): Promise<ResearchUsageEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) as unknown : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is ResearchUsageEvent => Boolean(item && typeof item === "object" && typeof (item as ResearchUsageEvent).type === "string" && typeof (item as ResearchUsageEvent).createdAt === "string")) : [];
  } catch {
    return [];
  }
}

export async function recordResearchEvent(event: Omit<ResearchUsageEvent, "createdAt"> & Partial<Pick<ResearchHistoryEntry, "title" | "detail" | "source" | "status">>) {
  const events = await readEvents();
  events.push({ ...event, symbol: event.symbol?.trim().toUpperCase(), createdAt: new Date().toISOString() });
  try { await AsyncStorage.setItem(KEY, JSON.stringify(events.slice(-MAX_EVENTS))); } catch { /* local analytics is best effort */ }
}

export async function loadResearchHistory(options: { type?: ResearchHistoryType; symbol?: string; limit?: number } = {}): Promise<ResearchHistoryEntry[]> {
  const events = await readEvents();
  const symbol = options.symbol?.trim().toUpperCase();
  return events
    .map((event, index) => ({ ...event, id: `${event.createdAt}-${index}` } as ResearchHistoryEntry))
    .filter((event) => (!options.type || event.type === options.type) && (!symbol || event.symbol === symbol))
    .reverse()
    .slice(0, Math.min(250, Math.max(1, options.limit ?? 100)));
}

export async function clearResearchHistory() {
  try { await AsyncStorage.removeItem(KEY); } catch { /* best effort */ }
}

export async function loadResearchUsageSummary(): Promise<ResearchUsageSummary> {
  const events = await readEvents();
  const counts = (type: ResearchUsageEvent["type"]) => events.filter((event) => event.type === type).length;
  const symbolCounts = new Map<string, number>();
  for (const event of events) if (event.symbol) symbolCounts.set(event.symbol, (symbolCounts.get(event.symbol) ?? 0) + 1);
  const topSymbols = [...symbolCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([symbol]) => symbol);
  return { sessions: counts("session"), searches: counts("search"), newsReads: counts("news_open"), analyses: counts("analysis_open"), exports: counts("export"), watchlistActions: counts("watchlist"), lastActiveAt: events.at(-1)?.createdAt ?? null, topSymbols };
}
