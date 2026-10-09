import { getProviderHealthFor } from "./provider-health";

export type ProviderDomain = "news" | "market-data" | "macro" | "corporate-risk" | "alerts" | "web-research";
export type ProviderStatus = "configured" | "needs_secret" | "not_implemented" | "rejected" | "connector_validated";

export type ProviderDescriptor = {
  id: string;
  name: string;
  domain: ProviderDomain;
  sourceUrl: string;
  requiredSecret?: string;
  requiredSecrets?: string[];
  status: ProviderStatus;
  enabled: boolean;
  runtimeStatus?: "healthy" | "rejected" | "unavailable";
  lastError?: string | null;
  notes: string;
};

const descriptors: ProviderDescriptor[] = [
  { id: "finnhub", name: "Finnhub", domain: "news", sourceUrl: "https://finnhub.io/docs/api", requiredSecret: "FINNHUB_API_KEY", status: process.env.FINNHUB_API_KEY ? "configured" : "needs_secret", enabled: true, notes: "Current company-news and quote provider." },
  { id: "firecrawl", name: "Firecrawl", domain: "web-research", sourceUrl: "https://docs.firecrawl.dev/", status: "connector_validated", enabled: false, notes: "Firecrawl MCP is connected for agent-side search and scraping validation. Server-side app ingestion stays disabled until a project API credential or supported runtime adapter is configured." },
  { id: "tinyfish", name: "TinyFish", domain: "web-research", sourceUrl: "https://docs.tinyfish.ai/", requiredSecret: "TINYFISH_API_KEY", status: process.env.TINYFISH_API_KEY ? "rejected" : "needs_secret", enabled: false, notes: "Optional web-agent fallback. The current credential smoke test returned HTTP 403, documented by TinyFish as insufficient credits or no active subscription; it is not used for production data until access is confirmed." },
  { id: "google-news-rss", name: "Google News RSS", domain: "news", sourceUrl: "https://news.google.com/rss", status: "configured", enabled: process.env.ENABLE_GOOGLE_NEWS_RSS !== "false", notes: "No-key aggregated RSS discovery source. Search syntax and freshness are undocumented; links are Google News redirects and must retain provenance." },
  { id: "gdelt", name: "GDELT DOC 2.0", domain: "news", sourceUrl: "https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/", status: "configured", enabled: true, notes: "No-key global news discovery substitute. Coverage and freshness vary by source; it is not a licensed real-time exchange feed and must retain article URL provenance." },
  { id: "indian-api", name: "Indian Market API", domain: "market-data", sourceUrl: "https://github.com/0xramm/Indian-Stock-Market-API", requiredSecret: "INDIAN_API_KEY", status: process.env.INDIAN_API_KEY ? "configured" : "needs_secret", enabled: true, notes: "Current NSE/BSE adapter." },
  { id: "dhan-mcp", name: "Dhan MCP / Option Chain", domain: "market-data", sourceUrl: "https://mcp.dhan.co/mcp", requiredSecret: "DHAN_ACCESS_TOKEN", status: process.env.DHAN_ACCESS_TOKEN ? "configured" : "needs_secret", enabled: true, notes: "Read-only DhanHQ option-chain adapter for expiry, OI, volume, IV, Greeks, PCR, and max-pain. Dhan Data API permission and a valid access token are required; no order or trading route is enabled." },
  { id: "angelone-smartapi", name: "Angel One SmartAPI / Option Chain", domain: "market-data", sourceUrl: "https://github.com/angel-one/smartapi-python", requiredSecret: "ANGELONE_ACCESS_TOKEN", requiredSecrets: ["ANGELONE_API_KEY", "ANGELONE_CLIENT_ID", "ANGELONE_ACCESS_TOKEN", "ANGELONE_CLIENT_LOCAL_IP", "ANGELONE_CLIENT_PUBLIC_IP", "ANGELONE_CLIENT_MAC_ADDRESS"], status: "needs_secret", enabled: true, notes: "Optional authenticated read-only fallback for option Greeks, PCR, OI buildup, and normalized option-chain rows. Requires server-side SmartAPI session credentials and registered client network metadata; no order route is enabled." },
  { id: "marketaux", name: "MarketAux", domain: "news", sourceUrl: "https://www.marketaux.com/documentation", requiredSecret: "MARKETAUX_API_TOKEN", status: process.env.MARKETAUX_API_TOKEN ? "configured" : "needs_secret", enabled: Boolean(process.env.MARKETAUX_API_TOKEN), notes: "Ticker-tagged global finance news and sentiment." },
  { id: "newsapi", name: "NewsAPI", domain: "news", sourceUrl: "https://newsapi.org/docs/endpoints/everything", requiredSecret: "NEWS_API_KEY", status: process.env.NEWS_API_KEY && process.env.ENABLE_NEWS_API === "true" ? "configured" : "needs_secret", enabled: process.env.NEWS_API_KEY !== undefined && process.env.ENABLE_NEWS_API === "true", notes: "Broad article discovery; provider terms and plan limits apply. Enable only after validating the key." },
  { id: "newsdata", name: "NewsData.io", domain: "news", sourceUrl: "https://newsdata.io/documentation", requiredSecret: "NEWSDATA_API_KEY", status: process.env.NEWSDATA_API_KEY ? "configured" : "needs_secret", enabled: Boolean(process.env.NEWSDATA_API_KEY), notes: "Optional breaking-news fallback." },
  { id: "gnews", name: "GNews", domain: "news", sourceUrl: "https://gnews.io/docs/v4", requiredSecret: "GNEWS_API_KEY", status: process.env.GNEWS_API_KEY ? "configured" : "needs_secret", enabled: Boolean(process.env.GNEWS_API_KEY), notes: "Optional search and recent-news fallback." },
  { id: "newsflash", name: "Newsflash", domain: "news", sourceUrl: "https://newsflash.sh/docs", requiredSecret: "NEWSFLASH_API_KEY", status: "not_implemented", enabled: false, notes: "Reserved for a future corroborated event adapter after endpoint validation." },
  { id: "nasdaq-data-link", name: "Nasdaq Data Link", domain: "market-data", sourceUrl: "https://docs.data.nasdaq.com/docs/getting-started", requiredSecret: "NASDAQ_DATA_LINK_API_KEY", status: process.env.NASDAQ_DATA_LINK_API_KEY ? "configured" : "needs_secret", enabled: false, notes: "Supplementary global and macro datasets; dataset licensing varies." },
  { id: "statistics-of-world", name: "Statistics of the World", domain: "macro", sourceUrl: "https://statisticsoftheworld.com/api-docs", status: "not_implemented", enabled: false, notes: "Candidate macro context source; requires endpoint validation before use." },
  { id: "opencorporates", name: "OpenCorporates", domain: "corporate-risk", sourceUrl: "https://api.opencorporates.com/documentation/API-Reference", requiredSecret: "OPENCORPORATES_API_KEY", status: process.env.OPENCORPORATES_API_KEY ? "configured" : "needs_secret", enabled: false, notes: "Candidate entity and director-linking source." },
  { id: "opensanctions", name: "OpenSanctions", domain: "corporate-risk", sourceUrl: "https://www.opensanctions.org/docs/api/", status: "not_implemented", enabled: false, notes: "Candidate sanctions/PEP risk source; do not infer risk without confirmed matches." },
  { id: "telegram", name: "Telegram Bot", domain: "alerts", sourceUrl: "https://core.telegram.org/bots/api", requiredSecret: "TELEGRAM_BOT_TOKEN", status: process.env.TELEGRAM_BOT_TOKEN ? "configured" : "needs_secret", enabled: Boolean(process.env.TELEGRAM_BOT_TOKEN), notes: "Optional high-impact alert channel." },
  { id: "discord", name: "Discord", domain: "alerts", sourceUrl: "https://discord.com/developers/docs/intro", requiredSecret: "DISCORD_WEBHOOK_URL", status: process.env.DISCORD_WEBHOOK_URL ? "configured" : "needs_secret", enabled: Boolean(process.env.DISCORD_WEBHOOK_URL), notes: "Optional high-impact webhook channel." },
];

export function getProviderRegistry(): ProviderDescriptor[] {
  return descriptors.map((provider) => {
    const runtimeHealth = getProviderHealthFor(provider.id);
    const configuredStatus = provider.requiredSecrets
      ? provider.requiredSecrets.every((key) => Boolean(process.env[key])) ? "configured" : provider.status
      : provider.requiredSecret && process.env[provider.requiredSecret] ? "configured" : provider.status;
    return {
      ...provider,
      status: configuredStatus,
      enabled: provider.enabled || runtimeHealth?.status === "rejected",
      runtimeStatus: runtimeHealth?.status,
      lastError: runtimeHealth?.lastError ?? null,
      notes: runtimeHealth?.status === "rejected"
        ? `${provider.notes} Latest attempt failed, but the provider remains enabled for isolated retry: ${runtimeHealth.lastError ?? "authentication or permission failure"}.`
        : provider.notes,
    };
  });
}

export function getConfiguredProviders(domain?: ProviderDomain) {
  return getProviderRegistry().filter((provider) => provider.enabled && provider.status === "configured" && (!domain || provider.domain === domain));
}
