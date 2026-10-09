export type MarketCapBand = "penny-micro-cap" | "small-cap" | "mid-cap" | "large-cap" | "unknown";

export type MarketCapConvention = {
  marketId: string;
  currency: string;
  unit: string;
  thresholds: { small: number; mid: number; large: number };
  effectiveFrom: string;
  note: string;
};

const CONVENTIONS: Record<string, MarketCapConvention> = {
  IN: { marketId: "IN", currency: "INR", unit: "crore", thresholds: { small: 5_000, mid: 20_000, large: 100_000 }, effectiveFrom: "2026-01-01", note: "AnalyzerX research bands; exchange and regulator classifications may differ." },
  US: { marketId: "US", currency: "USD", unit: "USD", thresholds: { small: 2_000_000_000, mid: 10_000_000_000, large: 200_000_000_000 }, effectiveFrom: "2026-01-01", note: "Market-cap bands use a transparent AnalyzerX convention and are not an exchange listing category." },
  GB: { marketId: "GB", currency: "GBP", unit: "GBP", thresholds: { small: 250_000_000, mid: 2_000_000_000, large: 10_000_000_000 }, effectiveFrom: "2026-01-01", note: "Market-cap bands use a transparent AnalyzerX convention and are not an exchange listing category." },
  CA: { marketId: "CA", currency: "CAD", unit: "CAD", thresholds: { small: 250_000_000, mid: 2_000_000_000, large: 10_000_000_000 }, effectiveFrom: "2026-01-01", note: "Market-cap bands use a transparent AnalyzerX convention and are not an exchange listing category." },
  AU: { marketId: "AU", currency: "AUD", unit: "AUD", thresholds: { small: 500_000_000, mid: 2_000_000_000, large: 10_000_000_000 }, effectiveFrom: "2026-01-01", note: "Market-cap bands use a transparent AnalyzerX convention and are not an exchange listing category." },
  JP: { marketId: "JP", currency: "JPY", unit: "JPY", thresholds: { small: 50_000_000_000, mid: 300_000_000_000, large: 3_000_000_000_000 }, effectiveFrom: "2026-01-01", note: "Market-cap bands use a transparent AnalyzerX convention and are not an exchange listing category." },
  SG: { marketId: "SG", currency: "SGD", unit: "SGD", thresholds: { small: 500_000_000, mid: 2_000_000_000, large: 10_000_000_000 }, effectiveFrom: "2026-01-01", note: "Market-cap bands use a transparent AnalyzerX convention and are not an exchange listing category." },
  HK: { marketId: "HK", currency: "HKD", unit: "HKD", thresholds: { small: 2_000_000_000, mid: 10_000_000_000, large: 100_000_000_000 }, effectiveFrom: "2026-01-01", note: "Market-cap bands use a transparent AnalyzerX convention and are not an exchange listing category." },
  DE: { marketId: "DE", currency: "EUR", unit: "EUR", thresholds: { small: 250_000_000, mid: 2_000_000_000, large: 10_000_000_000 }, effectiveFrom: "2026-01-01", note: "Market-cap bands use a transparent AnalyzerX convention and are not an exchange listing category." },
  FR: { marketId: "FR", currency: "EUR", unit: "EUR", thresholds: { small: 250_000_000, mid: 2_000_000_000, large: 10_000_000_000 }, effectiveFrom: "2026-01-01", note: "Market-cap bands use a transparent AnalyzerX convention and are not an exchange listing category." },
};

export function getMarketCapConvention(marketId: string) { return CONVENTIONS[marketId] ?? { marketId, currency: "Unknown", unit: "Unknown", thresholds: { small: 0, mid: 0, large: 0 }, effectiveFrom: "2026-01-01", note: "No market-specific convention is configured; classification is unavailable." }; }

export function classifyMarketCap(marketId: string, marketCap: number | null | undefined): MarketCapBand {
  if (typeof marketCap !== "number" || !Number.isFinite(marketCap) || marketCap <= 0) return "unknown";
  const convention = getMarketCapConvention(marketId);
  if (!convention.thresholds.small) return "unknown";
  if (marketCap < convention.thresholds.small) return "penny-micro-cap";
  if (marketCap < convention.thresholds.mid) return "small-cap";
  if (marketCap < convention.thresholds.large) return "mid-cap";
  return "large-cap";
}

export function marketCapBandLabel(band: MarketCapBand) { return band === "penny-micro-cap" ? "Penny / Micro-cap" : band === "small-cap" ? "Small-cap" : band === "mid-cap" ? "Mid-cap" : band === "large-cap" ? "Large-cap" : "Unknown / Unclassified"; }
