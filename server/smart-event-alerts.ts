export type AlertLevel = "critical" | "high" | "medium" | "low";
export type EligibilityStatus = "eligible" | "potential" | "no-longer-eligible";
export type SmartEventType = "order" | "partnership" | "acquisition" | "joint-venture" | "capacity-expansion" | "project-finance" | "fundraising" | "government-order" | "export-order" | "new-customer" | "ownership-change" | "corporate-action" | "custom";
export type MarketCapBand = "mega-cap" | "large-cap" | "mid-cap" | "small-cap" | "micro-cap" | "unknown";

export interface MonitoringRule {
  id: string;
  title: string;
  query: string;
  eventTypes: SmartEventType[];
  customerMarketCaps?: MarketCapBand[];
  supplierMarketCaps?: MarketCapBand[];
  sectors?: string[];
  countryFrom?: string;
  countryTo?: string;
  minOrderValueInrCr?: number;
  minOrderToRevenuePct?: number;
  minOrderToMarketCapPct?: number;
  minCapacityMw?: number;
  minFundingInrCr?: number;
  minConfidence?: number;
  watchSymbols?: string[];
  watchSectors?: string[];
  instant?: boolean;
}

export interface EventEvidence {
  source: string;
  url: string;
  publishedAt: string;
  retrievedAt: string;
  period?: string | null;
  status: "verified" | "partial" | "stale" | "unavailable";
  excerpt?: string | null;
}

export interface SmartEventChain {
  id: string;
  eventType: SmartEventType;
  customerSymbol?: string | null;
  customerName?: string | null;
  customerMarketCapBand?: MarketCapBand;
  supplierSymbol?: string | null;
  supplierName?: string | null;
  supplierMarketCapBand?: MarketCapBand;
  supplierSector?: string | null;
  countryFrom?: string | null;
  countryTo?: string | null;
  orderValueInrCr?: number | null;
  orderToRevenuePct?: number | null;
  orderToMarketCapPct?: number | null;
  capacityMw?: number | null;
  fundingInrCr?: number | null;
  executionPeriod?: string | null;
  purpose?: string | null;
  historicalRelationship?: "new" | "repeat" | "unknown";
  repeatOrderCount?: number | null;
  expectedRevenueImpact?: "high" | "medium" | "low" | "unknown";
  evidence: EventEvidence[];
  detectedAt: string;
  rawHeadline?: string | null;
}

export interface EventScore {
  score: number;
  level: AlertLevel;
  confidence: number;
  factors: Array<{ label: string; points: number; reason: string }>;
}

export interface EligibilityResult {
  symbol: string;
  companyName: string;
  status: EligibilityStatus;
  matchScore: number;
  event: SmartEventChain;
  score: EventScore;
  reason: string;
  whySeeingThis: string;
  supportingEvidence: EventEvidence[];
  dataTimestamp: string;
  source: string;
}

export interface SmartAlertDiscovery {
  marketId?: string;
  marketLabel?: string;
  rule: MonitoringRule;
  eligibleStocks: EligibilityResult[];
  counts: { eligible: number; potential: number; noLongerEligible: number };
  generatedAt: string;
  sort: "match-score" | "order-value" | "order-revenue" | "market-cap-impact" | "latest-event" | "sector" | "potential-impact";
}

const normalize = (value: string) => value.toLowerCase().replace(/[–—→]/g, " ").replace(/[^a-z0-9%₹.>+-]+/g, " ").replace(/\s+/g, " ").trim();
const firstNumber = (value: string) => {
  const match = value.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : undefined;
};
const has = (text: string, terms: string[]) => terms.some((term) => text.includes(term));

export function normalizeMonitoringQuery(query: string, id = `smart-${Date.now()}`): MonitoringRule {
  const text = normalize(query);
  const eventTypes: SmartEventType[] = [];
  if (has(text, ["order", "contract", "purchase order"])) eventTypes.push(text.includes("government") || text.includes("tender") ? "government-order" : text.includes("export") ? "export-order" : "order");
  if (has(text, ["partnership", "strategic collaboration", "mou"])) eventTypes.push("partnership");
  if (has(text, ["acquisition", "acquire"])) eventTypes.push("acquisition");
  if (has(text, ["joint venture", " jv "])) eventTypes.push("joint-venture");
  if (has(text, ["capacity", "mw", "manufacturing expansion", "greenfield"])) eventTypes.push("capacity-expansion");
  if (has(text, ["finance", "funding", "fundraise", "investment"])) eventTypes.push(has(text, ["funding", "fundraise"]) ? "fundraising" : "project-finance");
  if (has(text, ["promoter", "shareholding"])) eventTypes.push("ownership-change");
  if (has(text, ["corporate action", "split", "bonus", "dividend"])) eventTypes.push("corporate-action");
  const minOrderValueInrCr = text.includes("cr") ? firstNumber(text) : undefined;
  const percentMatches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((match) => Number(match[1]));
  const largeToSmall = ((text.includes("large cap") || text.includes("large-cap")) && (text.includes("small cap") || text.includes("small-cap"))) || has(text, ["large company to listed smaller"]);
  const midToSmall = (text.includes("mid cap") || text.includes("mid-cap")) && (text.includes("small cap") || text.includes("small-cap"));
  const renewable = has(text, ["renewable", "solar", "wind", "clean energy"]);
  return {
    id,
    title: query.length > 64 ? `${query.slice(0, 61)}…` : query,
    query,
    eventTypes: eventTypes.length ? [...new Set(eventTypes)] : ["custom"],
    customerMarketCaps: largeToSmall ? ["large-cap", "mega-cap"] : midToSmall ? ["mid-cap"] : undefined,
    supplierMarketCaps: largeToSmall || midToSmall ? ["small-cap", "micro-cap"] : undefined,
    sectors: renewable ? ["Renewable Energy"] : undefined,
    minOrderValueInrCr,
    minOrderToRevenuePct: percentMatches.length ? percentMatches[0] : undefined,
    minCapacityMw: text.includes("mw") ? firstNumber(text) : undefined,
    minFundingInrCr: text.includes("fund") && text.includes("cr") ? firstNumber(text) : undefined,
    minConfidence: 0.7,
    instant: has(text, ["notify", "alert", "tell me"]),
  };
}

export function deduplicateEventChains(events: SmartEventChain[]): SmartEventChain[] {
  const groups = new Map<string, SmartEventChain>();
  for (const event of events) {
    const key = [event.eventType, event.customerSymbol ?? "", event.supplierSymbol ?? "", event.orderValueInrCr ?? "", event.capacityMw ?? "", (event.purpose ?? "").toLowerCase().slice(0, 60)].join("|");
    const existing = groups.get(key);
    if (!existing) { groups.set(key, event); continue; }
    const evidence = [...existing.evidence, ...event.evidence].filter((item, index, list) => list.findIndex((candidate) => candidate.url === item.url) === index);
    groups.set(key, { ...existing, evidence, detectedAt: existing.detectedAt > event.detectedAt ? existing.detectedAt : event.detectedAt, rawHeadline: existing.rawHeadline ?? event.rawHeadline });
  }
  return [...groups.values()];
}

export function scoreSmartEvent(event: SmartEventChain): EventScore {
  const factors: EventScore["factors"] = [];
  const verified = event.evidence.filter((item) => item.status === "verified").length;
  const stale = event.evidence.some((item) => item.status === "stale");
  if (event.orderValueInrCr !== null && event.orderValueInrCr !== undefined) factors.push({ label: "Order value", points: Math.min(25, Math.round(event.orderValueInrCr / 100)), reason: `Reported order value ₹${event.orderValueInrCr.toLocaleString("en-IN")} Cr.` });
  if (event.orderToRevenuePct !== null && event.orderToRevenuePct !== undefined) factors.push({ label: "Revenue materiality", points: Math.min(25, Math.round(event.orderToRevenuePct / 2)), reason: `Order represents ${event.orderToRevenuePct.toFixed(1)}% of reported revenue.` });
  if (event.customerMarketCapBand && event.supplierMarketCapBand && event.customerMarketCapBand !== "unknown" && event.supplierMarketCapBand !== "unknown") {
    const crossCap = ["mega-cap", "large-cap"].includes(event.customerMarketCapBand) && ["small-cap", "micro-cap"].includes(event.supplierMarketCapBand);
    factors.push({ label: "Company-size relationship", points: crossCap ? 18 : 8, reason: crossCap ? "Large customer to smaller listed supplier relationship detected." : "Customer and supplier size bands are available." });
  }
  if (event.expectedRevenueImpact === "high") factors.push({ label: "Potential revenue impact", points: 15, reason: "Source-backed event context indicates high potential revenue impact." });
  if (event.historicalRelationship === "repeat") factors.push({ label: "Repeat relationship", points: 7, reason: `${event.repeatOrderCount ?? 1} prior related event(s) are linked.` });
  if (event.supplierSector) factors.push({ label: "Sector context", points: 5, reason: `${event.supplierSector} sector context is attached.` });
  const evidencePoints = verified ? Math.min(8, verified * 4) : 0;
  factors.push({ label: "Evidence quality", points: evidencePoints, reason: verified ? `${verified} verified source(s) support the event.` : "No verified source evidence attached." });
  const score = Math.max(0, Math.min(100, factors.reduce((sum, factor) => sum + factor.points, 0) - (stale ? 8 : 0)));
  const confidence = Math.max(0, Math.min(1, (verified * 0.25) + (event.customerSymbol && event.supplierSymbol ? 0.25 : 0) + (event.orderValueInrCr !== null && event.orderValueInrCr !== undefined ? 0.2 : 0) + (stale ? 0 : 0.2)));
  const level: AlertLevel = score >= 85 ? "critical" : score >= 70 ? "high" : score >= 45 ? "medium" : "low";
  return { score, level, confidence, factors };
}

export function evaluateEligibility(rule: MonitoringRule, event: SmartEventChain): EligibilityResult | null {
  const supplier = event.supplierSymbol ?? event.supplierName;
  if (!supplier) return null;
  const typeMatch = rule.eventTypes.includes("custom") || rule.eventTypes.includes(event.eventType);
  const customerBandMatch = !rule.customerMarketCaps?.length || (event.customerMarketCapBand ? rule.customerMarketCaps.includes(event.customerMarketCapBand) : false);
  const supplierBandMatch = !rule.supplierMarketCaps?.length || (event.supplierMarketCapBand ? rule.supplierMarketCaps.includes(event.supplierMarketCapBand) : false);
  const sectorMatch = !rule.sectors?.length || (event.supplierSector ? rule.sectors.some((sector) => event.supplierSector?.toLowerCase().includes(sector.toLowerCase())) : false);
  const valueMatch = rule.minOrderValueInrCr === undefined || (event.orderValueInrCr !== null && event.orderValueInrCr !== undefined && event.orderValueInrCr >= rule.minOrderValueInrCr);
  const revenueMatch = rule.minOrderToRevenuePct === undefined || (event.orderToRevenuePct !== null && event.orderToRevenuePct !== undefined && event.orderToRevenuePct >= rule.minOrderToRevenuePct);
  const capacityMatch = rule.minCapacityMw === undefined || (event.capacityMw !== null && event.capacityMw !== undefined && event.capacityMw >= rule.minCapacityMw);
  const confidence = scoreSmartEvent(event).confidence;
  const confidenceMatch = rule.minConfidence === undefined || confidence >= rule.minConfidence;
  const required = [typeMatch, customerBandMatch, supplierBandMatch, sectorMatch, valueMatch, revenueMatch, capacityMatch, confidenceMatch];
  const completeMatch = required.every(Boolean);
  const missing = [!typeMatch && "event type", !customerBandMatch && "customer market-cap", !supplierBandMatch && "supplier market-cap", !sectorMatch && "sector", !valueMatch && "order value", !revenueMatch && "order/revenue", !capacityMatch && "capacity", !confidenceMatch && "confidence"].filter(Boolean) as string[];
  const score = scoreSmartEvent(event);
  const status: EligibilityStatus = completeMatch ? "eligible" : missing.length <= 2 ? "potential" : "no-longer-eligible";
  const companyName = event.supplierName ?? event.supplierSymbol ?? "Unknown company";
  const reason = completeMatch ? `Matches ${rule.title}: ${event.eventType.replace(/-/g, " ")} evidence satisfies all active conditions.` : `Partial match; missing or unconfirmed conditions: ${missing.join(", ")}.`;
  const whySeeingThis = `${companyName} is shown because ${event.customerName ?? event.customerSymbol ?? "an identified customer"} → ${event.eventType.replace(/-/g, " ")} → ${companyName}${event.orderValueInrCr ? `, ₹${event.orderValueInrCr.toLocaleString("en-IN")} Cr` : ""}${event.supplierSector ? ` in ${event.supplierSector}` : ""}. ${reason}`;
  return { symbol: event.supplierSymbol ?? "UNKNOWN", companyName, status, matchScore: score.score, event, score, reason, whySeeingThis, supportingEvidence: event.evidence, dataTimestamp: event.detectedAt, source: event.evidence[0]?.source ?? "Unavailable" };
}

export function discoverEligibleStocks(rule: MonitoringRule, events: SmartEventChain[], sort: SmartAlertDiscovery["sort"] = "match-score"): SmartAlertDiscovery {
  const results = deduplicateEventChains(events).map((event) => evaluateEligibility(rule, event)).filter((item): item is EligibilityResult => Boolean(item));
  const sorted = [...results].sort((a, b) => {
    if (sort === "order-value") return (b.event.orderValueInrCr ?? -1) - (a.event.orderValueInrCr ?? -1);
    if (sort === "order-revenue") return (b.event.orderToRevenuePct ?? -1) - (a.event.orderToRevenuePct ?? -1);
    if (sort === "latest-event") return b.event.detectedAt.localeCompare(a.event.detectedAt);
    if (sort === "sector") return (a.event.supplierSector ?? "").localeCompare(b.event.supplierSector ?? "");
    if (sort === "potential-impact") return ({ high: 3, medium: 2, low: 1, unknown: 0 }[b.event.expectedRevenueImpact ?? "unknown"] - { high: 3, medium: 2, low: 1, unknown: 0 }[a.event.expectedRevenueImpact ?? "unknown"]);
    return b.matchScore - a.matchScore;
  });
  return { rule, eligibleStocks: sorted, counts: { eligible: sorted.filter((item) => item.status === "eligible").length, potential: sorted.filter((item) => item.status === "potential").length, noLongerEligible: sorted.filter((item) => item.status === "no-longer-eligible").length }, generatedAt: new Date().toISOString(), sort };
}

export function smartAlertTemplates(): MonitoringRule[] {
  return [
    normalizeMonitoringQuery("Notify me when a large-cap company places a major order with a small-cap renewable company.", "large-to-small-renewable"),
    normalizeMonitoringQuery("Track renewable-energy capacity expansions.", "renewable-capacity"),
    normalizeMonitoringQuery("Alert me when an order is greater than 10% of annual revenue.", "material-order"),
    normalizeMonitoringQuery("Track government orders going to listed companies.", "government-orders"),
  ];
}
