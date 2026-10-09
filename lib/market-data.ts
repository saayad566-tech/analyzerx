export type EventKind =
  | "Partnership"
  | "Large order"
  | "Capacity expansion"
  | "Strategic investment"
  | "Government order"
  | "Regulatory action"
  | "Results / guidance";

export type Confidence = "High" | "Medium" | "Low";
export type FactStatus = "Confirmed" | "AI inference";

export type MarketEvent = {
  id: string;
  time: string;
  dateLabel: string;
  kind: EventKind;
  title: string;
  companyA: string;
  symbolA: string;
  companyB?: string;
  symbolB?: string;
  relationship: string;
  value?: string;
  sector: string;
  location?: string;
  source: string;
  sourceUrl: string;
  sentiment: "Positive" | "Neutral" | "Negative";
  relevance: string;
  confidence: Confidence;
  score: number;
  status: FactStatus;
  storylineId: string;
  tags: string[];
};

export type Storyline = {
  id: string;
  title: string;
  subtitle: string;
  score: number;
  eventCount: number;
  window: string;
  entities: string[];
  status: "Developing" | "Confirmed" | "Watch";
};

export const events: MarketEvent[] = [
  {
    id: "evt-101",
    time: "14:05",
    dateLabel: "Today, 14:05",
    kind: "Strategic investment",
    title: "Strategic investment deepens green hydrogen relationship",
    companyA: "Larsen & Toubro",
    symbolA: "LT",
    companyB: "Waaree Energies",
    symbolB: "WAAREEENER",
    relationship: "invests in",
    value: "₹250 Cr",
    sector: "Renewable energy",
    location: "Gujarat",
    source: "BSE filing",
    sourceUrl: "https://www.bseindia.com/",
    sentiment: "Positive",
    relevance: "Strengthens the financing leg of an already active project chain.",
    confidence: "High",
    score: 91,
    status: "Confirmed",
    storylineId: "story-1",
    tags: ["investment", "hydrogen", "project finance"],
  },
  {
    id: "evt-100",
    time: "11:30",
    dateLabel: "Today, 11:30",
    kind: "Capacity expansion",
    title: "New electrolyser line added to fulfil announced order book",
    companyA: "Waaree Energies",
    symbolA: "WAAREEENER",
    relationship: "expands capacity because of order",
    value: "₹1,180 Cr capex",
    sector: "Renewable energy",
    location: "Sanand, Gujarat",
    source: "Company release",
    sourceUrl: "https://www.nseindia.com/",
    sentiment: "Positive",
    relevance: "A tangible follow-through event that links revenue visibility to capex.",
    confidence: "High",
    score: 87,
    status: "Confirmed",
    storylineId: "story-1",
    tags: ["capacity", "capex", "electrolyser"],
  },
  {
    id: "evt-099",
    time: "10:15",
    dateLabel: "Today, 10:15",
    kind: "Large order",
    title: "L&T places major green hydrogen equipment order",
    companyA: "Larsen & Toubro",
    symbolA: "LT",
    companyB: "Waaree Energies",
    symbolB: "WAAREEENER",
    relationship: "places order with",
    value: "₹500 Cr",
    sector: "Renewable energy",
    location: "Kandla, Gujarat",
    source: "NSE announcement",
    sourceUrl: "https://www.nseindia.com/",
    sentiment: "Positive",
    relevance: "High-value order with a mid-cap supplier; potential revenue inflection.",
    confidence: "High",
    score: 94,
    status: "Confirmed",
    storylineId: "story-1",
    tags: ["order", "large-cap → mid-cap", "green hydrogen"],
  },
  {
    id: "evt-098",
    time: "10:02",
    dateLabel: "Today, 10:02",
    kind: "Partnership",
    title: "L&T and Waaree sign electrolyser collaboration",
    companyA: "Larsen & Toubro",
    symbolA: "LT",
    companyB: "Waaree Energies",
    symbolB: "WAAREEENER",
    relationship: "partners with",
    sector: "Renewable energy",
    location: "India",
    source: "StockInsights.ai",
    sourceUrl: "https://stockinsights.ai/",
    sentiment: "Positive",
    relevance: "Earliest signal in the current relationship chain.",
    confidence: "Medium",
    score: 76,
    status: "Confirmed",
    storylineId: "story-1",
    tags: ["partnership", "electrolyser"],
  },
  {
    id: "evt-097",
    time: "09:42",
    dateLabel: "Today, 09:42",
    kind: "Government order",
    title: "Railway modernization tender moves to execution stage",
    companyA: "Titagarh Rail Systems",
    symbolA: "TITAGARH",
    companyB: "Indian Railways",
    relationship: "receives government order",
    value: "₹1,700 Cr",
    sector: "Capital goods",
    location: "Eastern India",
    source: "NSE announcement",
    sourceUrl: "https://www.nseindia.com/",
    sentiment: "Positive",
    relevance: "Large public-sector order with multi-year execution visibility.",
    confidence: "High",
    score: 89,
    status: "Confirmed",
    storylineId: "story-2",
    tags: ["railways", "government order"],
  },
];

export const storylines: Storyline[] = [
  {
    id: "story-1",
    title: "L&T ↔ Waaree: green hydrogen chain",
    subtitle: "Partnership → order → capacity → investment",
    score: 94,
    eventCount: 4,
    window: "24h",
    entities: ["LT", "WAAREEENER", "Kandla", "Sanand"],
    status: "Developing",
  },
  {
    id: "story-2",
    title: "Titagarh: rail execution cycle",
    subtitle: "Government order → manufacturing throughput",
    score: 89,
    eventCount: 2,
    window: "7d",
    entities: ["TITAGARH", "Indian Railways"],
    status: "Confirmed",
  },
  {
    id: "story-3",
    title: "Defence suppliers: order spillover",
    subtitle: "Prime contractor → tier-2 beneficiaries",
    score: 81,
    eventCount: 6,
    window: "30d",
    entities: ["HAL", "BEL", "MIDHANI"],
    status: "Watch",
  },
];

export const sectors = [
  { name: "Renewable energy", score: 92, activity: "6 linked events", color: "#F4B860", note: "Order-to-capex chains accelerating" },
  { name: "Capital goods", score: 84, activity: "4 linked events", color: "#4FD1C5", note: "Government order momentum" },
  { name: "Defence", score: 78, activity: "9 linked events", color: "#A78BFA", note: "Supplier discovery widening" },
  { name: "Railways", score: 74, activity: "3 linked events", color: "#FB7185", note: "Execution signals improving" },
];

export const filters = ["All events", "Large orders", "Partnerships", "Investments", "Government", "High confidence"];

export type FlowCategory = "FII" | "DII" | "Pro traders" | "Mutual funds" | "Stock buying" | "Options";

export type MarketFlow = {
  id: string;
  category: FlowCategory;
  entity: string;
  symbol?: string;
  action: "Buy" | "Sell" | "Long build-up" | "Short build-up";
  value: number;
  valueLabel: string;
  changeLabel: string;
  period: string;
  instrument?: string;
  sentiment: "Positive" | "Negative" | "Neutral";
  source: string;
  sourceDate: string;
  confidence: Confidence;
};

export const marketFlows: MarketFlow[] = [
  { id: "flow-1", category: "FII", entity: "Foreign Institutional Investors", action: "Buy", value: 1842, valueLabel: "₹1,842 Cr", changeLabel: "+₹2,410 Cr vs prior session", period: "Today · cash market", sentiment: "Positive", source: "NSE participant-wise data", sourceDate: "As of today, 15:30 IST", confidence: "High" },
  { id: "flow-2", category: "DII", entity: "Domestic Institutional Investors", action: "Buy", value: 1260, valueLabel: "₹1,260 Cr", changeLabel: "+₹680 Cr vs prior session", period: "Today · cash market", sentiment: "Positive", source: "NSE participant-wise data", sourceDate: "As of today, 15:30 IST", confidence: "High" },
  { id: "flow-3", category: "Pro traders", entity: "Proprietary desks", action: "Long build-up", value: 948, valueLabel: "₹948 Cr", changeLabel: "+18.4% open interest", period: "Today · index futures", instrument: "NIFTY futures", sentiment: "Positive", source: "Exchange derivatives summary", sourceDate: "As of today, 15:30 IST", confidence: "Medium" },
  { id: "flow-4", category: "Mutual funds", entity: "SBI Mutual Fund", symbol: "WAAREEENER", action: "Buy", value: 312, valueLabel: "₹312 Cr", changeLabel: "+0.42% holding change", period: "Latest disclosed portfolio", instrument: "Waaree Energies", sentiment: "Positive", source: "Fund portfolio disclosure", sourceDate: "Latest monthly disclosure", confidence: "High" },
  { id: "flow-5", category: "Stock buying", entity: "Larsen & Toubro", symbol: "LT", action: "Buy", value: 286, valueLabel: "₹286 Cr", changeLabel: "+2.1% delivery volume", period: "Today · cash market", instrument: "L&T", sentiment: "Positive", source: "NSE market activity", sourceDate: "As of today, 15:30 IST", confidence: "High" },
  { id: "flow-6", category: "Stock buying", entity: "Titagarh Rail Systems", symbol: "TITAGARH", action: "Buy", value: 214, valueLabel: "₹214 Cr", changeLabel: "+31% traded value", period: "Today · cash market", instrument: "Titagarh Rail Systems", sentiment: "Positive", source: "NSE market activity", sourceDate: "As of today, 15:30 IST", confidence: "High" },
  { id: "flow-7", category: "Options", entity: "Index options", action: "Long build-up", value: 176, valueLabel: "₹176 Cr premium", changeLabel: "PCR 1.12 · bullish skew", period: "Today · options activity", instrument: "NIFTY 24,800 calls", sentiment: "Positive", source: "Exchange derivatives summary", sourceDate: "As of today, 15:30 IST", confidence: "Medium" },
  { id: "flow-8", category: "Mutual funds", entity: "Nippon India MF", symbol: "HAL", action: "Sell", value: 98, valueLabel: "₹98 Cr", changeLabel: "-0.16% holding change", period: "Latest disclosed portfolio", instrument: "Hindustan Aeronautics", sentiment: "Negative", source: "Fund portfolio disclosure", sourceDate: "Latest monthly disclosure", confidence: "High" },
];
