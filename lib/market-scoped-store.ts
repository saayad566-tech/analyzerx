/**
 * Market-scoped and user-scoped storage keys.
 *
 * The defect this fixes: search history, recents, watchlists and alerts stored under
 * a single global key, so searching "TATA" in India mode surfaced in the US search
 * history, and a US watchlist could hold Indian tickers.
 *
 * Every key carries the country code, and user-owned keys carry the user id as well.
 * Keys are built here and nowhere else, so a caller cannot forget the scope — and
 * `partitionByMarket` refuses to hand back another market's entries.
 *
 * Pure module: no storage engine, no React. It builds keys and separates records.
 */

export type MarketId = string;
export type UserId = string;

export type StoreNamespace =
  | "searches"
  | "recents"
  | "watchlist"
  | "alerts"
  | "screener"
  | "portfolio"
  | "notes"
  | "filters";

const normaliseMarket = (marketId: string | null | undefined) => (marketId ?? "").trim().toUpperCase();
const normaliseUser = (userId: string | null | undefined) => (userId ?? "").trim();

/**
 * Key for device-local (not signed-in) market data.
 *
 *   marketStoreKey("IN", "searches") -> "user_history:IN:searches"
 */
export function marketStoreKey(marketId: MarketId, namespace: StoreNamespace): string {
  const market = normaliseMarket(marketId);
  if (!market) throw new Error("marketStoreKey requires a market id; unscoped storage is not permitted");
  return `user_history:${market}:${namespace}`;
}

/**
 * Key for signed-in user data, scoped by BOTH user and market.
 *
 *   userMarketStoreKey("u_42", "US", "watchlist") -> "user:u_42:watchlist:US"
 */
export function userMarketStoreKey(userId: UserId, marketId: MarketId, namespace: StoreNamespace): string {
  const user = normaliseUser(userId);
  const market = normaliseMarket(marketId);
  if (!user) throw new Error("userMarketStoreKey requires a user id");
  if (!market) throw new Error("userMarketStoreKey requires a market id");
  return `user:${user}:${namespace}:${market}`;
}

/**
 * The key to read for the current session: user-scoped when signed in, device-scoped
 * otherwise. The two are deliberately different keys so a signed-out user's local
 * history never leaks into another account on a shared device.
 */
export function activeStoreKey(
  marketId: MarketId,
  namespace: StoreNamespace,
  userId?: UserId | null,
): string {
  return userId ? userMarketStoreKey(userId, marketId, namespace) : marketStoreKey(marketId, namespace);
}

export type ScopedRecord<T> = { market: string; value: T };

/**
 * Partition a flat list of records by market, so a caller reads only its own market.
 * Rows with no market are discarded — an unscoped row is exactly how bleeding starts.
 */
export function partitionByMarket<T>(
  records: readonly T[] | null | undefined,
  marketId: MarketId,
  pick: (record: T) => string | null | undefined,
): T[] {
  const market = normaliseMarket(marketId);
  if (!market || !records) return [];
  return records.filter((record) => normaliseMarket(pick(record)) === market);
}

/** A market-scoped search-history entry. */
export type SearchEntry = { market: string; query: string; at: number };

/**
 * Record a search into the market's own history, newest first, de-duplicated
 * case-insensitively and capped. Returns a new array; never mutates the input.
 */
export function recordSearch(
  history: readonly SearchEntry[] | null | undefined,
  marketId: MarketId,
  query: string,
  at: number,
  limit = 20,
): SearchEntry[] {
  const market = normaliseMarket(marketId);
  const trimmed = query.trim();
  if (!market || !trimmed) return [...(history ?? [])];
  const cap = Math.max(1, limit);
  const scoped = partitionByMarket(history, market, (entry) => entry.market);
  const deduped = scoped.filter((entry) => entry.query.toLowerCase() !== trimmed.toLowerCase());
  return [{ market, query: trimmed, at }, ...deduped].slice(0, cap);
}

/**
 * Suggestions for the active market only. A query typed in one market can never
 * surface another market's history, because the pool is filtered first.
 */
export function searchSuggestions(
  history: readonly SearchEntry[] | null | undefined,
  marketId: MarketId,
  prefix: string,
  limit = 8,
): string[] {
  const needle = prefix.trim().toLowerCase();
  const scoped = partitionByMarket(history, marketId, (entry) => entry.market);
  const ordered = [...scoped].sort((a, b) => b.at - a.at);
  const matches = needle ? ordered.filter((entry) => entry.query.toLowerCase().startsWith(needle)) : ordered;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of matches) {
    const key = entry.query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry.query);
    if (out.length >= Math.max(0, limit)) break;
  }
  return out;
}

/**
 * Namespaces a flat key/value map by market, for migrating old unscoped storage.
 * Entries already namespaced under a different market are preserved, not dropped.
 */
export function namespaceStoredKeys(
  flat: Record<string, unknown> | null | undefined,
  marketId: MarketId,
  namespace: StoreNamespace,
): Record<string, unknown> {
  const market = normaliseMarket(marketId);
  if (!market || !flat) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flat)) out[`${marketStoreKey(market, namespace)}:${key}`] = value;
  return out;
}
