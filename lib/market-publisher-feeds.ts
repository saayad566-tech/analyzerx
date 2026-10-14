/**
 * Per-market publisher feeds.
 *
 * The defect this fixes: every publisher feed in the catalog was tagged `market: "IN"` —
 * including Reuters, CNBC, the FT, the BBC, Nasdaq, MarketWatch, the ECB and the Federal
 * Reserve. So the news surface for every market was drawn from an Indian-tagged pool, and
 * a user on Australia, Japan or Germany was shown Indian financial press.
 *
 * Each supported market now has its own set of legitimate, publicly published RSS feeds
 * from outlets that actually cover that market. Global wires (Reuters, BBC, ECB, Fed) are
 * listed only under the markets they genuinely serve and are never substituted for a
 * market that has no feed of its own.
 *
 * Pure module: no I/O, so it is unit-testable.
 */
import { resolveMarketId, type MarketId } from "./market-regions";

export type PublisherFeed = {
  id: string;
  name: string;
  url: string;
  /** The market this feed reports on. */
  market: MarketId;
};

type FeedSeed = readonly [id: string, name: string, url: string];

const FEED_SEEDS: Record<MarketId, readonly FeedSeed[]> = {
  IN: [
    ["et-markets", "Economic Times · Markets", "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms"],
    ["et-companies", "Economic Times · Companies", "https://economictimes.indiatimes.com/industry/rssfeeds/13352306.cms"],
    ["moneycontrol-markets", "Moneycontrol · Markets", "https://www.moneycontrol.com/rss/marketreports.xml"],
    ["moneycontrol-business", "Moneycontrol · Business", "https://www.moneycontrol.com/rss/business.xml"],
    ["business-standard-markets", "Business Standard · Markets", "https://www.business-standard.com/rss/markets-106.rss"],
    ["livemint-markets", "Mint · Markets", "https://www.livemint.com/rss/markets"],
    ["thehindubusinessline", "The Hindu BusinessLine · Markets", "https://www.thehindubusinessline.com/markets/feeder/default.rss"],
    ["ndtvprofit-latest", "NDTV Profit · Latest", "https://feeds.feedburner.com/ndtvprofit-latest"],
    ["financial-express", "Financial Express · Market", "https://www.financialexpress.com/market/feed/"],
    ["cnbc-tv18", "CNBC-TV18 · Markets", "https://www.cnbctv18.com/commonfeeds/v1/eng/rss/market.xml"],
    ["bse-india", "BSE India · Announcements", "https://www.bseindia.com/rss"],
    ["rbi-press", "RBI · Press releases", "https://www.rbi.org.in/pressreleases_rss.xml"],
    ["sebi-news", "SEBI · News", "https://www.sebi.gov.in/sebirss.xml"],
  ],
  US: [
    ["cnbc-markets", "CNBC · Markets", "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258"],
    ["marketwatch", "MarketWatch · Top stories", "https://feeds.content.dowjones.io/public/rss/mw_topstories"],
    ["nasdaq-news", "Nasdaq · Markets", "https://www.nasdaq.com/feed/rssoutbound?category=Markets"],
    ["yahoo-finance-top", "Yahoo Finance · Top stories", "https://finance.yahoo.com/news/rssindex"],
    ["seekingalpha-market", "Seeking Alpha · Market news", "https://seekingalpha.com/market_currents.xml"],
    ["sec-edgar-rss", "SEC · Latest filings", "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=8-K&output=atom"],
    ["fed-press", "Federal Reserve · Press", "https://www.federalreserve.gov/feeds/press_all.xml"],
    ["reuters-business", "Reuters · Business", "https://feeds.reuters.com/reuters/businessNews"],
  ],
  GB: [
    ["ft-markets", "Financial Times · Markets", "https://www.ft.com/markets?format=rss"],
    ["bbc-business", "BBC · Business", "https://feeds.bbci.co.uk/news/business/rss.xml"],
    ["guardian-business", "The Guardian · Business", "https://www.theguardian.com/uk/business/rss"],
    ["boe-news", "Bank of England · News", "https://www.bankofengland.co.uk/rss/news"],
    ["lse-news", "London Stock Exchange · News", "https://www.londonstockexchange.com/news?tab=news-explorer"],
  ],
  CA: [
    ["globe-mail-business", "The Globe and Mail · Business", "https://www.theglobeandmail.com/arc/outboundfeeds/rss/category/business/?outputType=xml"],
    ["financial-post", "Financial Post", "https://financialpost.com/feed"],
    ["bank-of-canada", "Bank of Canada · Press", "https://www.bankofcanada.ca/content_type/press-releases/feed/"],
    ["yahoo-finance-ca", "Yahoo Finance Canada", "https://ca.finance.yahoo.com/news/rssindex"],
  ],
  AU: [
    ["abc-business", "ABC News · Business", "https://www.abc.net.au/news/feed/51892/rss.xml"],
    ["smh-business", "The Sydney Morning Herald · Business", "https://www.smh.com.au/rss/business.xml"],
    ["rba-media", "Reserve Bank of Australia · Media", "https://www.rba.gov.au/rss/rss-cb-media-releases.xml"],
    ["afr-markets", "Australian Financial Review · Markets", "https://www.afr.com/rss/feed/markets"],
  ],
  JP: [
    ["japantimes-business", "The Japan Times · Business", "https://www.japantimes.co.jp/feed/"],
    ["boj-whatsnew", "Bank of Japan · What's new", "https://www.boj.or.jp/en/rss/whatsnew.xml"],
    ["jpx-news", "JPX · News", "https://www.jpx.co.jp/english/rss/news.xml"],
  ],
  SG: [
    ["straitstimes-business", "The Straits Times · Business", "https://www.straitstimes.com/news/business/rss.xml"],
    ["cna-business", "CNA · Business", "https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6936"],
    ["mas-newsroom", "Monetary Authority of Singapore · Newsroom", "https://www.mas.gov.sg/rss/newsroom"],
    ["sgx-news", "SGX · News", "https://www.sgx.com/rss/news"],
  ],
  HK: [
    ["scmp-business", "South China Morning Post · Business", "https://www.scmp.com/rss/92/feed"],
    ["hkma-press", "HKMA · Press releases", "https://www.hkma.gov.hk/eng/news-and-media/press-releases/rss/"],
    ["hkex-news", "HKEX · News", "https://www.hkex.com.hk/rss/NewsReleases.xml"],
  ],
  DE: [
    ["dw-business", "Deutsche Welle · Business", "https://rss.dw.com/rdf/rss-en-bus"],
    ["bundesbank-press", "Deutsche Bundesbank · Press", "https://www.bundesbank.de/service/rss/en/press-releases.xml"],
    ["ecb-press", "ECB · Press", "https://www.ecb.europa.eu/rss/press.html"],
    ["boerse-frankfurt", "Börse Frankfurt · News", "https://www.boerse-frankfurt.de/rss/news"],
  ],
  FR: [
    ["france24-business", "France 24 · Business", "https://www.france24.com/en/business/rss"],
    ["lemonde-economie", "Le Monde · Économie", "https://www.lemonde.fr/economie/rss_full.xml"],
    ["banque-de-france", "Banque de France · Communiqués", "https://www.banque-france.fr/rss.xml"],
    ["amf-france", "AMF · Actualités", "https://www.amf-france.org/en/rss.xml"],
  ],
};

/** Every publisher feed, each tagged with the market it reports on. */
export const PUBLISHER_FEEDS: readonly PublisherFeed[] = (
  Object.entries(FEED_SEEDS) as Array<[MarketId, readonly FeedSeed[]]>
).flatMap(([market, seeds]) => seeds.map(([id, name, url]) => ({ id, name, url, market })));

/**
 * The publisher feeds for a market.
 *
 * An unknown or missing market returns an empty list — never the Indian feeds.
 */
export function publisherFeedsFor(marketId: string | null | undefined): PublisherFeed[] {
  const resolved = resolveMarketId(marketId);
  if (resolved === "UNKNOWN") return [];
  return PUBLISHER_FEEDS.filter((feed) => feed.market === resolved);
}

/** The RSS URLs for a market, in declaration order. */
export function publisherFeedUrlsFor(marketId: string | null | undefined): string[] {
  return publisherFeedsFor(marketId).map((feed) => feed.url);
}

/** How many feeds each market publishes. Useful for coverage reporting. */
export function publisherFeedCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const feed of PUBLISHER_FEEDS) counts[feed.market] = (counts[feed.market] ?? 0) + 1;
  return counts;
}
