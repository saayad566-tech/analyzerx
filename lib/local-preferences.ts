import AsyncStorage from "@react-native-async-storage/async-storage";

const ALERTS_KEY = "market-event-intelligence.alerts.enabled";
const RECENT_SEARCHES_KEY = "market-event-intelligence.screener.recent-searches";
const SAVED_SCREENS_KEY = "market-event-intelligence.screener.saved-screens";
const WATCHLIST_KEY = "market-event-intelligence.screener.watchlist";

export type SavedScreen = { name: string; filters: string[]; createdAt: string };

export function parseAlertState(raw: string | null): [boolean, boolean] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== 2 || parsed.some((value) => typeof value !== "boolean")) return null;
    return parsed as [boolean, boolean];
  } catch {
    return null;
  }
}

export function mergeRecentSearches(symbol: string, current: string[]): string[] {
  const normalized = symbol.trim().toUpperCase();
  if (!normalized) return current.slice(0, 5);
  return [normalized, ...current.filter((item) => item !== normalized)].slice(0, 5);
}

export async function loadAlertState(): Promise<[boolean, boolean] | null> {
  try {
    return parseAlertState(await AsyncStorage.getItem(ALERTS_KEY));
  } catch {
    return null;
  }
}

export async function saveAlertState(value: [boolean, boolean]) {
  try {
    await AsyncStorage.setItem(ALERTS_KEY, JSON.stringify(value));
  } catch {
    // Persistence is best-effort; the in-memory state remains authoritative for this session.
  }
}

export async function loadRecentSearches(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
}

export async function loadSavedScreens(): Promise<SavedScreen[]> {
  try {
    const raw = await AsyncStorage.getItem(SAVED_SCREENS_KEY);
    const parsed = raw ? JSON.parse(raw) as unknown : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is SavedScreen => Boolean(item && typeof item === "object" && typeof (item as SavedScreen).name === "string" && Array.isArray((item as SavedScreen).filters))).slice(0, 10) : [];
  } catch { return []; }
}

export async function saveSavedScreen(screen: SavedScreen, current: SavedScreen[]) {
  const next = [screen, ...current.filter((item) => item.name !== screen.name)].slice(0, 10);
  try { await AsyncStorage.setItem(SAVED_SCREENS_KEY, JSON.stringify(next)); } catch { /* best effort */ }
}

export async function loadWatchlist(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(WATCHLIST_KEY);
    const parsed = raw ? JSON.parse(raw) as unknown : [];
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string").slice(0, 30) : [];
  } catch { return []; }
}

export async function saveWatchlist(symbols: string[]) {
  try { await AsyncStorage.setItem(WATCHLIST_KEY, JSON.stringify([...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))].slice(0, 30))); } catch { /* best effort */ }
}

export async function saveRecentSearch(symbol: string, current: string[]) {
  const next = mergeRecentSearches(symbol, current);
  if (next.length === 0) return;
  try {
    await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  } catch {
    // Persistence is best-effort; search and analysis continue without it.
  }
}


const MARKET_CHAT_HISTORY_KEY = "market-event-intelligence.market-chat.history.v1";
const GENERAL_CHAT_HISTORY_KEY = "market-event-intelligence.general-chat.history.v1";
const MARKET_CHAT_RUNTIME_MODE_KEY = "market-event-intelligence.market-chat.runtime-mode.v1";
export type MarketChatRuntimeMode = "auto" | "local" | "connected";
export type LocalChatMessage = { role: "user" | "assistant"; content: string };

export async function loadMarketChatHistory(): Promise<LocalChatMessage[]> {
  try {
    const raw = await AsyncStorage.getItem(MARKET_CHAT_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) as unknown : [];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is LocalChatMessage => Boolean(item && typeof item === "object" && ((item as LocalChatMessage).role === "user" || (item as LocalChatMessage).role === "assistant") && typeof (item as LocalChatMessage).content === "string")).slice(-20)
      : [];
  } catch {
    return [];
  }
}

export async function saveMarketChatHistory(messages: LocalChatMessage[]) {
  try {
    await AsyncStorage.setItem(MARKET_CHAT_HISTORY_KEY, JSON.stringify(messages.slice(-20).map((item) => ({ role: item.role, content: item.content.slice(0, 2_000) }))));
  } catch {
    // Chat remains functional when local persistence is unavailable.
  }
}

export async function clearMarketChatHistory() {
  try { await AsyncStorage.removeItem(MARKET_CHAT_HISTORY_KEY); } catch { /* best effort */ }
}

export async function loadGeneralChatHistory(): Promise<LocalChatMessage[]> {
  try {
    const raw = await AsyncStorage.getItem(GENERAL_CHAT_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) as unknown : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is LocalChatMessage => Boolean(item && typeof item === "object" && ((item as LocalChatMessage).role === "user" || (item as LocalChatMessage).role === "assistant") && typeof (item as LocalChatMessage).content === "string")).slice(-20) : [];
  } catch { return []; }
}

export async function saveGeneralChatHistory(messages: LocalChatMessage[]) {
  try { await AsyncStorage.setItem(GENERAL_CHAT_HISTORY_KEY, JSON.stringify(messages.slice(-20).map((item) => ({ role: item.role, content: item.content.slice(0, 2_000) })))); } catch { /* best effort */ }
}

export async function clearGeneralChatHistory() {
  try { await AsyncStorage.removeItem(GENERAL_CHAT_HISTORY_KEY); } catch { /* best effort */ }
}

export async function loadMarketChatRuntimeMode(): Promise<MarketChatRuntimeMode> {
  try {
    const value = await AsyncStorage.getItem(MARKET_CHAT_RUNTIME_MODE_KEY);
    return value === "local" || value === "connected" ? value : "auto";
  } catch {
    return "auto";
  }
}

export async function saveMarketChatRuntimeMode(mode: MarketChatRuntimeMode) {
  try { await AsyncStorage.setItem(MARKET_CHAT_RUNTIME_MODE_KEY, mode); } catch { /* best effort */ }
}

export async function ensureMarketChatRuntimeMode(): Promise<MarketChatRuntimeMode> {
  try {
    const existing = await AsyncStorage.getItem(MARKET_CHAT_RUNTIME_MODE_KEY);
    if (existing === "local" || existing === "connected" || existing === "auto") return existing;
    await AsyncStorage.setItem(MARKET_CHAT_RUNTIME_MODE_KEY, "auto");
  } catch { /* best effort; runtime resolver still falls back to auto */ }
  return "auto";
}


export type AlertChannel = "in-app" | "push" | "email" | "telegram" | "whatsapp";
export type AlertNotificationPreferences = {
  enabled: boolean;
  minimumScore: number;
  channels: Record<AlertChannel, boolean>;
  quietHoursEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  timezone: string;
  quietHoursOverrideForCritical: boolean;
};

const ALERT_NOTIFICATION_PREFS_KEY = "market-event-intelligence.alerts.notification-preferences.v1";
export const DEFAULT_ALERT_NOTIFICATION_PREFERENCES: AlertNotificationPreferences = {
  enabled: true,
  minimumScore: 70,
  channels: { "in-app": true, push: true, email: false, telegram: false, whatsapp: false },
  quietHoursEnabled: false,
  quietStart: "22:00",
  quietEnd: "07:00",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  quietHoursOverrideForCritical: false,
};

export async function loadAlertNotificationPreferences(): Promise<AlertNotificationPreferences> {
  try {
    const raw = await AsyncStorage.getItem(ALERT_NOTIFICATION_PREFS_KEY);
    const parsed = raw ? JSON.parse(raw) as Partial<AlertNotificationPreferences> : {};
    return { ...DEFAULT_ALERT_NOTIFICATION_PREFERENCES, ...parsed, channels: { ...DEFAULT_ALERT_NOTIFICATION_PREFERENCES.channels, ...(parsed.channels ?? {}) } };
  } catch { return DEFAULT_ALERT_NOTIFICATION_PREFERENCES; }
}

export async function saveAlertNotificationPreferences(value: AlertNotificationPreferences) {
  try { await AsyncStorage.setItem(ALERT_NOTIFICATION_PREFS_KEY, JSON.stringify(value)); } catch { /* best effort */ }
}

export function isWithinQuietHours(now: Date, preferences: AlertNotificationPreferences): boolean {
  if (!preferences.quietHoursEnabled || preferences.quietStart === preferences.quietEnd) return false;
  const minutes = (value: string) => { const [hours, mins] = value.split(":").map(Number); return hours * 60 + mins; };
  const current = now.getHours() * 60 + now.getMinutes();
  const start = minutes(preferences.quietStart);
  const end = minutes(preferences.quietEnd);
  return start < end ? current >= start && current < end : current >= start || current < end;
}


const ARCHIVE_EXPORT_HISTORY_KEY = "market-event-intelligence.archive-export-history.v1";
export type ArchiveExportHistoryEntry = { id: string; fileName: string; format: "csv" | "pdf"; marketId: string; symbol?: string; startDate?: string; endDate?: string; rowCount: number; createdAt: string; status: "completed" | "failed"; detail?: string };

export async function loadArchiveExportHistory(): Promise<ArchiveExportHistoryEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(ARCHIVE_EXPORT_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) as unknown : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is ArchiveExportHistoryEntry => Boolean(item && typeof item === "object" && typeof (item as ArchiveExportHistoryEntry).id === "string" && ((item as ArchiveExportHistoryEntry).format === "csv" || (item as ArchiveExportHistoryEntry).format === "pdf"))).slice(0, 50) : [];
  } catch { return []; }
}

export async function saveArchiveExportHistory(entry: ArchiveExportHistoryEntry) {
  try {
    const current = await loadArchiveExportHistory();
    await AsyncStorage.setItem(ARCHIVE_EXPORT_HISTORY_KEY, JSON.stringify([entry, ...current.filter((item) => item.id !== entry.id)].slice(0, 50)));
  } catch { /* best effort; export result remains available to the user */ }
}

export async function clearArchiveExportHistory() {
  try { await AsyncStorage.removeItem(ARCHIVE_EXPORT_HISTORY_KEY); } catch { /* best effort */ }
}
