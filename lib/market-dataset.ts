/**
 * Market-scoped datasets — the single source of truth for per-market seed content.
 *
 * The defect this module fixes: `lib/market-data.ts` holds India-only fixtures, and Live Events,
 * Sectors and Market Flows imported them unconditionally, so selecting the United States still
 * showed Indian companies, ₹ values and NSE flows.
 *
 * Rule enforced here: {@link datasetForMarket} returns **only** the requested market's rows. A
 * market with no curated dataset returns `supported: false` with empty collections and an honest
 * notice — it never falls back to another market's data.
 *
 * Live, source-backed data continues to arrive through the tRPC providers and (for bulk market
 * data) through the resource-pack installer in `lib/resource-packs`. These datasets are the
 * deterministic, offline seed that keeps every screen meaningful before live data connects.
 */
import {
  events as indiaEvents,
  filters as indiaFilters,
  marketFlows as indiaFlows,
  sectors as indiaSectors,
  storylines as indiaStorylines,
  type FlowCategory,
  type MarketEvent,
  type MarketFlow,
  type SectorSummary,
  type Storyline,
} from "./market-data";
import { MARKET_PROFILES, type MarketId } from "./market-regions";

/** A ranked sector opportunity shown on the Sectors screen. Research signal, not a forecast. */
export type SectorOpportunity = {
  name: string;
  buying: number;
  fii: number;
  dii: number;
  catalyst: string;
  risk: string;
  evidence: string;
  color: string;
};

export type MarketDataset = {
  marketId: MarketId;
  /** False when the market has no curated dataset; collections are then empty. */
  supported: boolean;
  /** Human-readable provenance / limitation note for the dataset. */
  notice: string;
  events: MarketEvent[];
  storylines: Storyline[];
  sectors: SectorSummary[];
  /** Ranked sector opportunities for the Sectors screen, scoped to this market. */
  opportunities: SectorOpportunity[];
  flows: MarketFlow[];
  /** Flow categories that actually apply to this market (drives the tab strip). */
  flowCategories: FlowCategory[];
  /** Event filter chips that apply to this market. */
  eventFilters: string[];
};

// --- United States ----------------------------------------------------------------------------

const usEvents: MarketEvent[] = [
  {
    id: "us-evt-201",
    time: "15:40",
    dateLabel: "Today, 15:40",
    kind: "Capacity expansion",
    title: "Hyperscaler commits to a second AI data-centre campus",
    companyA: "Microsoft",
    symbolA: "MSFT",
    companyB: "Vertiv Holdings",
    symbolB: "VRT",
    relationship: "expands capacity with",
    value: "$1.4B capex",
    sector: "Data-center infrastructure",
    location: "Texas",
    source: "Company release",
    sourceUrl: "https://www.microsoft.com/investor",
    sentiment: "Positive",
    relevance: "Links a large-cap buyer to a mid-cap thermal/power supplier with multi-year visibility.",
    confidence: "High",
    score: 90,
    status: "Confirmed",
    storylineId: "us-story-1",
    tags: ["capacity", "ai-infrastructure", "capex"],
  },
  {
    id: "us-evt-200",
    time: "13:05",
    dateLabel: "Today, 13:05",
    kind: "Large order",
    title: "Thermal-management order awarded for the new campus",
    companyA: "Microsoft",
    symbolA: "MSFT",
    companyB: "Vertiv Holdings",
    symbolB: "VRT",
    relationship: "places order with",
    value: "$620M",
    sector: "Data-center infrastructure",
    location: "Texas",
    source: "SEC 8-K",
    sourceUrl: "https://www.sec.gov/edgar/search/",
    sentiment: "Positive",
    relevance: "High-value order with a mid-cap supplier; potential revenue inflection.",
    confidence: "High",
    score: 88,
    status: "Confirmed",
    storylineId: "us-story-1",
    tags: ["order", "large-cap -> mid-cap", "cooling"],
  },
  {
    id: "us-evt-199",
    time: "11:20",
    dateLabel: "Today, 11:20",
    kind: "Partnership",
    title: "Multi-year supply collaboration announced",
    companyA: "Microsoft",
    symbolA: "MSFT",
    companyB: "Vertiv Holdings",
    symbolB: "VRT",
    relationship: "partners with",
    sector: "Data-center infrastructure",
    location: "United States",
    source: "Company release",
    sourceUrl: "https://www.vertiv.com/en-us/about/news-and-insights/",
    sentiment: "Positive",
    relevance: "Earliest signal in the current supply chain.",
    confidence: "Medium",
    score: 77,
    status: "Confirmed",
    storylineId: "us-story-1",
    tags: ["partnership", "supply-chain"],
  },
  {
    id: "us-evt-198",
    time: "10:10",
    dateLabel: "Today, 10:10",
    kind: "Results / guidance",
    title: "Semiconductor supplier raises full-year outlook",
    companyA: "NVIDIA",
    symbolA: "NVDA",
    relationship: "issues guidance",
    sector: "Semiconductors",
    location: "United States",
    source: "SEC 8-K",
    sourceUrl: "https://www.sec.gov/edgar/search/",
    sentiment: "Positive",
    relevance: "Guidance raise with read-through to the accelerator supply chain.",
    confidence: "High",
    score: 86,
    status: "Confirmed",
    storylineId: "us-story-2",
    tags: ["guidance", "semiconductors"],
  },
  {
    id: "us-evt-197",
    time: "09:35",
    dateLabel: "Today, 09:35",
    kind: "Government order",
    title: "Federal award for grid-modernization equipment",
    companyA: "Quanta Services",
    symbolA: "PWR",
    companyB: "U.S. Department of Energy",
    relationship: "receives government award",
    value: "$310M",
    sector: "Electrical infrastructure",
    location: "United States",
    source: "Agency announcement",
    sourceUrl: "https://www.energy.gov/",
    sentiment: "Positive",
    relevance: "Public-sector award with multi-year execution visibility.",
    confidence: "High",
    score: 83,
    status: "Confirmed",
    storylineId: "us-story-3",
    tags: ["grid", "government-award"],
  },
];

const usStorylines: Storyline[] = [
  {
    id: "us-story-1",
    title: "MSFT <-> VRT: AI data-centre buildout",
    subtitle: "Partnership -> order -> capacity -> capex",
    score: 90,
    eventCount: 3,
    window: "24h",
    entities: ["MSFT", "VRT", "Texas"],
    status: "Developing",
  },
  {
    id: "us-story-2",
    title: "NVDA: accelerator supply chain",
    subtitle: "Guidance raise -> supplier read-through",
    score: 86,
    eventCount: 1,
    window: "7d",
    entities: ["NVDA"],
    status: "Watch",
  },
  {
    id: "us-story-3",
    title: "PWR: grid modernization cycle",
    subtitle: "Federal award -> execution throughput",
    score: 83,
    eventCount: 1,
    window: "30d",
    entities: ["PWR", "U.S. Department of Energy"],
    status: "Confirmed",
  },
];

const usSectors: SectorSummary[] = [
  { name: "Semiconductors", score: 91, activity: "7 linked events", color: "#F4B860", note: "Guidance raises across the accelerator chain" },
  { name: "Data-center infrastructure", score: 86, activity: "5 linked events", color: "#4FD1C5", note: "Power and cooling demand accelerating" },
  { name: "Electrical infrastructure", score: 79, activity: "4 linked events", color: "#A78BFA", note: "Grid awards improving visibility" },
  { name: "Financials", score: 72, activity: "6 linked events", color: "#FB7185", note: "Rate-sensitive positioning mixed" },
];

const usFlows: MarketFlow[] = [
  { id: "us-flow-1", marketId: "US", category: "Institutional", entity: "Large-cap institutional net flow", action: "Buy", value: 2140, valueLabel: "$2,140M", changeLabel: "+$410M vs prior session", period: "Today · consolidated tape", sentiment: "Positive", source: "Consolidated tape aggregate", sourceDate: "As of today, 16:00 ET", confidence: "High" },
  { id: "us-flow-2", marketId: "US", category: "ETF", entity: "Broad-market ETF creations", action: "Buy", value: 1380, valueLabel: "$1,380M", changeLabel: "+$260M vs prior session", period: "Today · primary market", sentiment: "Positive", source: "ETF creation/redemption aggregate", sourceDate: "As of today, 16:00 ET", confidence: "High" },
  { id: "us-flow-3", marketId: "US", category: "Insider", entity: "Form 4 net insider activity", action: "Sell", value: 260, valueLabel: "$260M", changeLabel: "-0.9x vs 30-day average", period: "Trailing 3 sessions", instrument: "Open-market dispositions", sentiment: "Negative", source: "SEC Form 4 filings", sourceDate: "Trailing 3 sessions", confidence: "Medium" },
  { id: "us-flow-4", marketId: "US", category: "Options", entity: "Index options", action: "Long build-up", value: 190, valueLabel: "$190M premium", changeLabel: "Put/call 0.94 · balanced skew", period: "Today · options activity", instrument: "SPX near-dated", sentiment: "Neutral", source: "Listed-options aggregate", sourceDate: "As of today, 16:00 ET", confidence: "Medium" },
  { id: "us-flow-5", marketId: "US", category: "Stock buying", entity: "Microsoft", symbol: "MSFT", action: "Buy", value: 340, valueLabel: "$340M", changeLabel: "+1.4% closing-auction imbalance", period: "Today · cash market", instrument: "MSFT", sentiment: "Positive", source: "Consolidated tape", sourceDate: "As of today, 16:00 ET", confidence: "High" },
  { id: "us-flow-6", marketId: "US", category: "Stock buying", entity: "Vertiv Holdings", symbol: "VRT", action: "Buy", value: 128, valueLabel: "$128M", changeLabel: "+6.2% traded value", period: "Today · cash market", instrument: "VRT", sentiment: "Positive", source: "Consolidated tape", sourceDate: "As of today, 16:00 ET", confidence: "High" },
  { id: "us-flow-7", marketId: "US", category: "Retail", entity: "Retail order-flow imbalance", action: "Buy", value: 410, valueLabel: "$410M net", changeLabel: "+8.1% vs 20-day average", period: "Today · off-exchange", sentiment: "Positive", source: "Off-exchange aggregate", sourceDate: "As of today, 16:00 ET", confidence: "Medium" },
];

const US_DATASET: MarketDataset = {
  marketId: "US",
  supported: true,
  notice: "Curated United States seed dataset. Live source-backed events, flows and filings arrive through the connected providers (SEC EDGAR and licensed feeds); figures shown here are the deterministic offline seed, not a live quote.",
  events: usEvents,
  storylines: usStorylines,
  sectors: usSectors,
  opportunities: [
    { name: "Semiconductors", buying: 91, fii: 62, dii: 48, catalyst: "Guidance raises across the accelerator chain", risk: "Cycle and valuation sensitivity", evidence: "NVDA outlook raise and supplier read-through", color: "#F4B860" },
    { name: "Data-center infrastructure", buying: 86, fii: 58, dii: 51, catalyst: "Power and cooling demand accelerating", risk: "Capex timing", evidence: "MSFT -> VRT order and capacity storyline", color: "#4FD1C5" },
    { name: "Electrical infrastructure", buying: 79, fii: 47, dii: 55, catalyst: "Grid awards improving visibility", risk: "Permitting and execution timing", evidence: "PWR federal award signal", color: "#A78BFA" },
    { name: "Financials", buying: 72, fii: 41, dii: 60, catalyst: "Rate-sensitive positioning", risk: "Credit and rate path", evidence: "6 connected events in the current window", color: "#FB7185" },
  ],
  flows: usFlows,
  flowCategories: ["Institutional", "ETF", "Insider", "Options", "Stock buying", "Retail"],
  eventFilters: ["All events", "Large orders", "Partnerships", "Guidance", "Government", "High confidence"],
};

// --- India ------------------------------------------------------------------------------------

const INDIA_DATASET: MarketDataset = {
  marketId: "IN",
  supported: true,
  notice: "Curated India seed dataset. Live source-backed news, filings and institutional flows arrive through NSE/BSE/SEBI collectors and the connected providers; figures shown here are the deterministic offline seed, not a live quote.",
  events: indiaEvents,
  storylines: indiaStorylines,
  sectors: indiaSectors,
  opportunities: [
    { name: "Renewable energy", buying: 92, fii: 68, dii: 54, catalyst: "Order-to-capex chain active", risk: "Valuation sensitivity", evidence: "LT -> WAAREE order and capacity storyline", color: "#F4B860" },
    { name: "Capital goods", buying: 84, fii: 51, dii: 73, catalyst: "Government order visibility", risk: "Execution timing", evidence: "Titagarh government order signal", color: "#4FD1C5" },
    { name: "Defence", buying: 78, fii: 44, dii: 66, catalyst: "Supplier network widening", risk: "Policy / tender timing", evidence: "9 connected events in the current window", color: "#A78BFA" },
    { name: "Railways", buying: 74, fii: 39, dii: 58, catalyst: "Multi-year order pipeline", risk: "Order concentration", evidence: "Execution-stage tender activity", color: "#FB7185" },
  ],
  flows: indiaFlows.map((flow) => ({ ...flow, marketId: "IN" as MarketId })),
  flowCategories: ["FII", "DII", "Pro traders", "Mutual funds", "Stock buying", "Options"],
  eventFilters: indiaFilters,
};

const DATASETS: Partial<Record<MarketId, MarketDataset>> = { IN: INDIA_DATASET, US: US_DATASET };

/** A safe, empty dataset used for markets without curated content. */
function unsupportedDataset(marketId: MarketId): MarketDataset {
  const profile = MARKET_PROFILES.find((candidate) => candidate.id === marketId);
  const country = profile?.country ?? marketId;
  return {
    marketId,
    supported: false,
    notice: `No curated ${country} dataset is bundled yet. AnalyzerX does not substitute another market's content. Connect a verified ${country} source (see Data Truth) or install the ${marketId} resource pack to populate this market.`,
    events: [],
    storylines: [],
    sectors: [],
    opportunities: [],
    flows: [],
    flowCategories: [],
    eventFilters: ["All events"],
  };
}

/**
 * The dataset for a market.
 *
 * Market isolation guarantee: this returns the requested market's dataset only. An unknown or
 * uncurated market yields an empty, explicitly-unsupported dataset — never another market's rows.
 */
export function datasetForMarket(marketId: MarketId | null | undefined): MarketDataset {
  if (!marketId) return unsupportedDataset("IN");
  const known = MARKET_PROFILES.some((profile) => profile.id === marketId);
  if (!known) return unsupportedDataset(marketId);
  return DATASETS[marketId] ?? unsupportedDataset(marketId);
}

/** Every market id that has a curated, supported dataset. */
export function supportedDatasetMarkets(): MarketId[] {
  return MARKET_PROFILES.map((profile) => profile.id).filter((id) => DATASETS[id]?.supported === true);
}

/**
 * Assert that a collection of market-tagged rows belongs to exactly one market.
 * Used by tests and by any consumer that must prove isolation.
 */
export function assertRowsBelongToMarket<T extends { marketId?: MarketId }>(rows: T[], marketId: MarketId): { isolated: boolean; offenders: number } {
  const offenders = rows.filter((row) => row.marketId !== undefined && row.marketId !== marketId).length;
  return { isolated: offenders === 0, offenders };
}
