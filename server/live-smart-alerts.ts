import { analyzeFundamentals, type FundamentalAnalysis } from "./fundamental-analysis";
import { getLatestTrackedNews, type ExtractedNews } from "./news-tracker";
import { getMarketProfile, type MarketId } from "../lib/market-regions";
import { getLatestSourceRecords, getSmartAlertResult, markSmartAlertNotified, upsertSmartAlertResult } from "./db";
import { notifyOwner } from "./_core/notification";
import { discoverEligibleStocks, type EventEvidence, type MarketCapBand, type MonitoringRule, type SmartAlertDiscovery, type SmartEventChain, type SmartEventType } from "../lib/smart-event-alerts";

export type LiveAlertProfile = Pick<FundamentalAnalysis, "resolvedSymbol" | "companyName" | "market" | "metrics" | "quantitativeMetrics" | "sources" | "asOf">;

const aliasToSymbol: Record<string, string> = {
  "larsen and toubro": "LT", "l&t": "LT", "reliance industries": "RELIANCE", "tata motors": "TATAMOTORS", "tata power": "TATAPOWER", "adani enterprises": "ADANIENT", "adani ports": "ADANIPORTS", "adani ports and special economic zone": "ADANIPORTS", "waaree energies": "WAAREEENER", "waareeener": "WAAREEENER", "ntpc": "NTPC", "nhpc": "NHPC", "jsw energy": "JSWENERGY", "tata steel": "TATASTEEL", "infosys": "INFY", "tcs": "TCS",
};
const commonWords = new Set(["THE", "AND", "FOR", "WITH", "FROM", "COMPANY", "LIMITED", "LTD", "INC", "PLC", "ORDER", "CONTRACT", "PROJECT", "ENERGY", "INDIA", "INDIAN", "GROUP", "NEW", "POWER"]);

function textOf(article: ExtractedNews) { return `${article.headline} ${article.summary} ${article.actionable_impact} ${article.key_entities.join(" ")}`; }
function cleanName(value: string) { return value.replace(/\s+/g, " ").replace(/[^\w&. -]/g, "").trim(); }
function sourceStatus(source: string): EventEvidence["status"] { return /nse|bse|sebi|exchange|company.?ir|investor.?relations|official filing|edgar|fca|sedar|asx|tdnet|sgx|hkex|esef|amf/i.test(source) ? "verified" : "partial"; }
function toInrCr(value: number | undefined) { if (value === undefined || !Number.isFinite(value) || value <= 0) return undefined; return value > 10_000_000 ? value / 10_000_000 : value; }
function metricValue(profile: LiveAlertProfile | undefined, key: string) { const value = profile?.quantitativeMetrics[key]?.value; return typeof value === "number" && Number.isFinite(value) ? value : undefined; }
function marketCapBand(profile: LiveAlertProfile | undefined): MarketCapBand {
  const cap = toInrCr(metricValue(profile, "marketCap"));
  if (cap === undefined || profile?.market.currency !== "INR") return "unknown";
  if (cap >= 200_000) return "mega-cap";
  if (cap >= 50_000) return "large-cap";
  if (cap >= 10_000) return "mid-cap";
  if (cap >= 1_000) return "small-cap";
  return "micro-cap";
}
function resolveSymbol(value: string, exclude?: string) {
  const normalized = value.trim().replace(/[()]/g, "").replace(/\.(NS|BO)$/i, "").toUpperCase();
  const alias = aliasToSymbol[value.trim().toLowerCase()] ?? aliasToSymbol[value.trim().toLowerCase().replace(/\s+/g, " ")];
  const symbol = alias ?? normalized;
  if (symbol === exclude || symbol.length < 2 || symbol.length > 18 || commonWords.has(symbol) || !/^[A-Z0-9&.-]+$/.test(symbol)) return undefined;
  return symbol;
}
function findCustomer(article: ExtractedNews) {
  for (const entity of article.key_entities) {
    const resolved = resolveSymbol(entity, article.symbol);
    if (resolved && (aliasToSymbol[entity.toLowerCase()] || /^[A-Z0-9.-]{2,12}$/.test(entity))) return { symbol: resolved, name: cleanName(entity) };
  }
  const explicit = textOf(article).match(/(?:from|by|with|between|customer|client)\s+([A-Z][A-Za-z&. ]{2,45})/i)?.[1];
  if (explicit) {
    const symbol = resolveSymbol(explicit, article.symbol);
    if (symbol) return { symbol, name: cleanName(explicit) };
  }
  return undefined;
}
function parseMoneyInrCr(text: string) {
  const match = text.replace(/,/g, "").match(/(?:₹|rs\.?|inr\s*)(\d+(?:\.\d+)?)\s*(?:cr|crore|crores|bn|billion|million)?/i);
  if (!match) return undefined;
  const amount = Number(match[1]);
  const unit = match[0].toLowerCase();
  if (!Number.isFinite(amount)) return undefined;
  if (/billion|\bbn\b/.test(unit)) return amount * 100;
  if (/million/.test(unit)) return amount / 10;
  return amount;
}
function parseCapacity(text: string) { const match = text.match(/(\d+(?:\.\d+)?)\s*(?:mw|megawatt|megawatts|gw|gigawatt)/i); if (!match) return undefined; const value = Number(match[1]); return /gw|gigawatt/i.test(match[0]) ? value * 1000 : value; }
function classifyEvent(article: ExtractedNews): SmartEventType {
  const text = textOf(article).toLowerCase();
  if (/government|tender|defence ministry|railway order/.test(text)) return "government-order";
  if (/export order|overseas order|international order/.test(text)) return "export-order";
  if (/acquisition|acquire|takeover/.test(text)) return "acquisition";
  if (/joint venture|\bjv\b/.test(text)) return "joint-venture";
  if (/partnership|strategic collaboration|mou/.test(text)) return "partnership";
  if (/fundrais|funding|raises capital|investment round/.test(text)) return "fundraising";
  if (/capacity|greenfield|manufacturing expansion|commissioned|megawatt|gigawatt/.test(text)) return "capacity-expansion";
  if (/project finance|financing|loan sanction/.test(text)) return "project-finance";
  if (/order|contract|purchase order|won|awarded/.test(text)) return "order";
  if (/promoter|shareholding|stake/.test(text)) return "ownership-change";
  if (/split|bonus|dividend|corporate action/.test(text)) return "corporate-action";
  return "custom";
}
function eventPurpose(article: ExtractedNews) { return cleanName(article.summary || article.headline).slice(0, 240) || null; }
function sourceRecordSymbol(title: string, explicit?: string | null) {
  if (explicit) return resolveSymbol(explicit);
  const lower = title.toLowerCase();
  for (const [alias, symbol] of Object.entries(aliasToSymbol)) if (lower.includes(alias)) return symbol;
  return undefined;
}
const MARKET_SOURCE_KEYS: Record<MarketId, RegExp> = { IN: /^(nse|bse|sebi|nsdl|amfi|company-ir|investor-relations)/i, US: /^sec-(edgar|company-facts)/i, GB: /^uk-fca/i, CA: /^ca-sedar/i, AU: /^au-asx/i, JP: /^jp-jpx/i, SG: /^sg-sgx/i, HK: /^hk-hkex/i, DE: /^eu-esef/i, FR: /^(eu-esef|fr-amf)/i };

export function officialRecordToArticle(record: Awaited<ReturnType<typeof getLatestSourceRecords>>[number], marketId: MarketId = "IN"): ExtractedNews | null {
  const sourcePattern = MARKET_SOURCE_KEYS[marketId] ?? MARKET_SOURCE_KEYS.IN;
  const official = sourcePattern.test(record.sourceKey) || /nse|bse|sebi|fca|sedar|asx|tdnet|sgx|hkex|esef|amf|investor.?relations|company.?ir/i.test(record.sourceUrl);
  if (!official || !record.title) return null;
  let payload: Record<string, unknown> = {};
  try { payload = record.normalizedPayload ? JSON.parse(record.normalizedPayload) as Record<string, unknown> : {}; } catch { payload = {}; }
  const title = String(payload.title ?? record.title).trim();
  const symbol = sourceRecordSymbol(title, record.symbol);
  if (!symbol) return null;
  const published = String(payload.publishedAt ?? record.publishedAt?.toISOString() ?? record.reportDate?.toISOString() ?? record.retrievedAt.toISOString());
  const summary = String(payload.description ?? payload.summary ?? record.documentName ?? "Official filing or announcement").replace(/<[^>]+>/g, " ").trim();
  return { id: `source-${record.id}`, symbol, headline: title, category: "Markets", summary: summary.slice(0, 800), key_entities: [symbol], sentiment: "Neutral", actionable_impact: record.recordType.replace(/-/g, " "), url: record.sourceUrl, source: record.sourceKey, published_at: published, impact_score: 0, high_impact: false };
}

export function extractLiveEventChain(article: ExtractedNews, profiles: Record<string, LiveAlertProfile>): SmartEventChain | null {
  const eventType = classifyEvent(article);
  const text = textOf(article);
  if (!["order", "government-order", "export-order", "capacity-expansion", "partnership", "acquisition", "joint-venture", "project-finance", "fundraising"].includes(eventType)) return null;
  const supplier = profiles[article.symbol] ?? profiles[article.symbol.toUpperCase()];
  const customer = findCustomer(article);
  if (!customer) return null;
  const customerProfile = profiles[customer.symbol];
  const orderValueInrCr = parseMoneyInrCr(text);
  const revenueInrCr = toInrCr(metricValue(supplier, "revenue"));
  const marketCapInrCr = toInrCr(metricValue(supplier, "marketCap"));
  const orderToRevenuePct = orderValueInrCr !== undefined && revenueInrCr ? (orderValueInrCr / revenueInrCr) * 100 : undefined;
  const orderToMarketCapPct = orderValueInrCr !== undefined && marketCapInrCr ? (orderValueInrCr / marketCapInrCr) * 100 : undefined;
  const evidence: EventEvidence = { source: article.source, url: article.url, publishedAt: article.published_at, retrievedAt: new Date().toISOString(), status: sourceStatus(article.source), excerpt: `${article.headline}${article.summary ? ` — ${article.summary}` : ""}`.slice(0, 500) };
  return { id: article.id, eventType, customerSymbol: customer.symbol, customerName: customer.name, customerMarketCapBand: marketCapBand(customerProfile), supplierSymbol: article.symbol, supplierName: supplier?.companyName ?? article.symbol, supplierMarketCapBand: marketCapBand(supplier), supplierSector: supplier?.market?.primaryFocus ? "Indian equities" : supplier?.market?.country ?? null, countryFrom: customerProfile?.market.country ?? null, countryTo: supplier?.market.country ?? null, orderValueInrCr: orderValueInrCr ?? null, orderToRevenuePct: orderToRevenuePct ?? null, orderToMarketCapPct: orderToMarketCapPct ?? null, capacityMw: parseCapacity(text) ?? null, fundingInrCr: /fund|capital|investment/i.test(text) ? orderValueInrCr ?? null : null, executionPeriod: text.match(/(?:within|over|by)\s+([^.;,]{3,30})/i)?.[1] ?? null, purpose: eventPurpose(article), historicalRelationship: "unknown", repeatOrderCount: null, expectedRevenueImpact: orderToRevenuePct === undefined ? "unknown" : orderToRevenuePct >= 25 ? "high" : orderToRevenuePct >= 10 ? "medium" : "low", evidence: [evidence], detectedAt: article.published_at, rawHeadline: article.headline };
}

export async function persistSmartAlertDiscovery(discovery: SmartAlertDiscovery, notify = true) {
  let persisted = 0;
  let notifications = 0;
  for (const item of discovery.eligibleStocks) {
    const id = `${discovery.rule.id}-${item.symbol}-${item.event.id}`.slice(0, 160);
    const previous = await getSmartAlertResult(id);
    await upsertSmartAlertResult({ id, ruleId: discovery.rule.id, ruleTitle: discovery.rule.title, symbol: item.symbol, status: item.status, matchScore: item.matchScore, eventJson: JSON.stringify(item.event), evidenceJson: JSON.stringify(item.supportingEvidence), reason: item.whySeeingThis, dataTimestamp: new Date(item.dataTimestamp), lastNotifiedAt: previous?.lastNotifiedAt ?? null });
    persisted += 1;
    const isNewlyEligible = item.status === "eligible" && previous?.status !== "eligible" && !previous?.lastNotifiedAt;
    if (notify && isNewlyEligible) {
      try {
        const delivered = await notifyOwner({ title: `Smart Alert: ${item.companyName} is eligible`, content: `${discovery.rule.title}. ${item.whySeeingThis} Evidence: ${item.source}.` });
        if (delivered) { await markSmartAlertNotified(id); notifications += 1; }
      } catch { /* notification service remains an explicit unavailable boundary */ }
    }
  }
  return { persisted, notifications, notificationState: notifications > 0 ? "delivered" : "unavailable-or-none" as const };
}

export async function discoverLiveSmartAlerts(rule: MonitoringRule, options: { lookbackDays?: number; limit?: number; sort?: SmartAlertDiscovery["sort"]; marketId?: MarketId } = {}): Promise<SmartAlertDiscovery> {
  const lookbackDays = Math.min(180, Math.max(1, options.lookbackDays ?? 30));
  const cutoff = Date.now() - lookbackDays * 86_400_000;
  const marketId = options.marketId ?? "IN";
  const market = getMarketProfile(marketId);
  const [trackedArticles, sourceRecords] = await Promise.all([getLatestTrackedNews(250), getLatestSourceRecords(400)]);
  const officialArticles = sourceRecords.map((record) => officialRecordToArticle(record, marketId)).filter((article): article is ExtractedNews => Boolean(article));
  const articles = [...trackedArticles, ...officialArticles];
  const filtered = articles.filter((article) => Date.parse(article.published_at) >= cutoff && (marketId === "IN" || article.source === "news-tracker" || sourceStatus(article.source) === "verified"));
  const symbols = [...new Set(filtered.map((article) => article.symbol).filter(Boolean))];
  const profiles: Record<string, LiveAlertProfile> = {};
  await Promise.all(symbols.slice(0, 30).map(async (symbol) => { try { const result = await analyzeFundamentals(symbol); profiles[symbol] = result; } catch { /* provider failures remain unavailable */ } }));
  const chains = filtered.map((article) => extractLiveEventChain(article, profiles)).filter((event): event is SmartEventChain => Boolean(event));
  const discovery = discoverEligibleStocks(rule, chains, options.sort ?? "match-score");
  return { ...discovery, eligibleStocks: discovery.eligibleStocks.slice(0, options.limit ?? 50), marketId, marketLabel: market.country };
}
