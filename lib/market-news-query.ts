/**
 * Per-market news search vocabulary.
 *
 * The defect this fixes: the topic query list was hardcoded to India ("India GDP growth",
 * "India bank NPA credit growth", "India solar wind renewable order" …), and every topic
 * source was tagged `market: "IN"` and built with `hl=en-IN&gl=IN&ceid=IN:en`. So the
 * topic-news surface for a French or Australian market was Indian topics from the Indian
 * edition.
 *
 * Topics are now market-neutral subjects, combined at build time with the market's own
 * search terms and news edition.
 *
 * Pure module: no I/O, so it is unit-testable.
 */
import { resolveMarketId, type MarketId } from "./market-regions";
import { newsEditionFor } from "./market-news-edition";

/** Boolean search terms that anchor a query to a market. */
export const MARKET_QUERY_TERMS: Record<MarketId, string> = {
  IN: "(India OR Indian OR NSE OR BSE OR Nifty OR Sensex OR RBI OR SEBI)",
  US: '("United States" OR US OR USA OR NYSE OR NASDAQ OR SEC OR "Federal Reserve")',
  GB: '(UK OR Britain OR British OR London OR LSE OR FCA OR "Bank of England")',
  CA: '(Canada OR Canadian OR TSX OR SEDAR OR "Bank of Canada")',
  AU: '(Australia OR Australian OR ASX OR ASIC OR "Reserve Bank of Australia")',
  JP: "(Japan OR Japanese OR JPX OR TSE OR BOJ)",
  SG: "(Singapore OR SGX OR MAS)",
  HK: "(Hong Kong OR HKEX OR SFC OR HKMA)",
  DE: "(Germany OR German OR Xetra OR BaFin OR Bundesbank)",
  FR: "(France OR French OR Euronext OR AMF OR \"Banque de France\")",
};

/** The search terms for a market, or an empty string for an unknown one. */
export function marketQueryTerms(marketId: string | null | undefined): string {
  const resolved = resolveMarketId(marketId);
  if (resolved === "UNKNOWN") return "";
  return MARKET_QUERY_TERMS[resolved as MarketId] ?? "";
}

/**
 * A market-neutral topic. The `query` is the subject only; the market's own terms are
 * added when the query is built.
 */
export type MarketTopic = {
  id: string;
  name: string;
  query: string;
  kind: string;
};

export const MARKET_TOPICS: readonly MarketTopic[] = [
  { id: "topic-gdp", name: "GDP", query: "GDP growth", kind: "macro" },
  { id: "topic-currency", name: "Currency", query: "currency exchange rate", kind: "macro" },
  { id: "topic-crude", name: "Crude oil", query: "crude oil Brent", kind: "macro" },
  { id: "topic-gold", name: "Gold", query: "gold price", kind: "macro" },
  { id: "topic-regulator", name: "Regulator action", query: "securities regulator order penalty", kind: "regulatory" },
  { id: "topic-derivatives", name: "Derivatives", query: "index options futures open interest", kind: "news" },
  { id: "topic-funds", name: "Funds", query: "mutual fund inflows", kind: "flows" },
  { id: "topic-startups", name: "Startups", query: "startup funding", kind: "news" },
  { id: "topic-banks", name: "Banks", query: "bank credit growth", kind: "news" },
  { id: "topic-autos", name: "Autos", query: "auto sales EV", kind: "news" },
  { id: "topic-energy", name: "Energy", query: "power sector capacity order", kind: "news" },
  { id: "topic-renewables", name: "Renewables", query: "solar wind renewable order", kind: "news" },
  { id: "topic-pharma", name: "Pharma", query: "pharma drug approval", kind: "news" },
  { id: "topic-technology", name: "Technology", query: "technology services deal win", kind: "news" },
  { id: "topic-mining", name: "Mining", query: "mining metals prices", kind: "news" },
  { id: "topic-realestate", name: "Real estate", query: "real estate sales", kind: "news" },
  { id: "topic-telecom", name: "Telecom", query: "telecom 5G", kind: "news" },
  { id: "topic-industrial", name: "Industrial", query: "industrial capex order", kind: "news" },
  { id: "topic-consumer", name: "Consumer", query: "consumer demand retail", kind: "news" },
  { id: "topic-logistics", name: "Logistics", query: "logistics freight shipping", kind: "news" },
  { id: "topic-semiconductors", name: "Semiconductors", query: "semiconductor chip fab", kind: "news" },
  { id: "topic-defence", name: "Defence", query: "defence order contract", kind: "news" },
  { id: "topic-space", name: "Space", query: "space satellite contract", kind: "news" },
  { id: "topic-fundraising", name: "Fundraising", query: "fundraising placement issue", kind: "corporate-action" },
];

/** The topics for a market (identical subjects; the market terms differ at query time). */
export function topicsForMarket(marketId: string | null | undefined): readonly MarketTopic[] {
  return resolveMarketId(marketId) === "UNKNOWN" ? [] : MARKET_TOPICS;
}

/**
 * Build a Google News RSS URL for a topic in a market, using that market's own edition.
 *
 * An unknown market returns null rather than an India-edition URL.
 */
export function topicFeedUrl(marketId: string | null | undefined, topic: MarketTopic): string | null {
  const resolved = resolveMarketId(marketId);
  if (resolved === "UNKNOWN") return null;
  const edition = newsEditionFor(resolved);
  if (!edition) return null;
  const terms = marketQueryTerms(resolved);
  const query = terms ? `${topic.query} ${terms}` : topic.query;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${edition.hl}&gl=${edition.gl}&ceid=${edition.ceid}`;
}
