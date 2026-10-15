import { getMarketProfile, type MarketId } from "./market-regions";

export type StockSearchResult = {
  symbol: string;
  name: string;
  sector: string;
  exchange: string;
  source: string;
};

export function normalizeStockSymbol(value: string) {
  return value.trim().toUpperCase().replace(/^(NSE|BSE):/, "").replace(/\.(NS|BO)$/, "");
}

export function isValidDirectStockSymbol(value: string) {
  const symbol = normalizeStockSymbol(value);
  return symbol.length >= 1 && symbol.length <= 20 && /^[A-Z0-9.-]+$/.test(symbol) ? symbol : null;
}

export function createDirectStockResultForMarket(value: string, marketId: MarketId): StockSearchResult | null {
  const symbol = isValidDirectStockSymbol(value);
  if (!symbol) return null;
  const market = getMarketProfile(marketId);
  return { symbol, name: symbol, sector: `${market.country} equities`, exchange: market.exchanges[0] ?? "Unknown", source: "Market-aware direct lookup" };
}

export function matchesStockQuery(stock: Pick<StockSearchResult, "symbol" | "name">, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  return `${stock.name} ${stock.symbol}`.toLowerCase().includes(normalizedQuery);
}

export function rankStockMatches(stocks: StockSearchResult[], query: string, limit = 12) {
  const normalizedQuery = query.trim().toLowerCase();
  const unique = new Map<string, StockSearchResult>();

  stocks.forEach((stock) => {
    const symbol = normalizeStockSymbol(stock.symbol);
    if (!symbol || !stock.name.trim()) return;
    const normalized = { ...stock, symbol };
    if (!matchesStockQuery(normalized, normalizedQuery)) return;
    const key = `${symbol}:${stock.name.toLowerCase()}`;
    if (!unique.has(key)) unique.set(key, normalized);
  });

  return [...unique.values()]
    .sort((left, right) => {
      const leftSymbol = left.symbol.toLowerCase();
      const rightSymbol = right.symbol.toLowerCase();
      const leftStarts = normalizedQuery && (leftSymbol.startsWith(normalizedQuery) || left.name.toLowerCase().startsWith(normalizedQuery)) ? 0 : 1;
      const rightStarts = normalizedQuery && (rightSymbol.startsWith(normalizedQuery) || right.name.toLowerCase().startsWith(normalizedQuery)) ? 0 : 1;
      return leftStarts - rightStarts || left.name.localeCompare(right.name);
    })
    .slice(0, limit);
}
