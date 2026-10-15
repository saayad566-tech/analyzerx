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

