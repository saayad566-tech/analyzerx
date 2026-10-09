import { createHash } from "node:crypto";
import { upsertFundamentalObservation, upsertMarketObservation } from "./db";
import { resolveEntity } from "./entities";
import type { FundamentalAnalysis } from "./fundamental-analysis";

function hash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function asNumber(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function sourceUrl(source: string) { return source.toLowerCase().includes("finnhub") ? "https://finnhub.io/docs/api" : source.toLowerCase().includes("indian") ? "https://github.com/0xramm/Indian-Stock-Market-API" : "https://www.nseindia.com/"; }

export async function persistProfileObservations(symbol: string, profile: { market?: unknown; fundamentals?: FundamentalAnalysis | null }) {
  const resolution = await resolveEntity(symbol);
  if (!resolution.entity) return { entity: null, marketStored: 0, fundamentalsStored: 0, resolution };
  const now = new Date();
  let marketStored = 0;
  let fundamentalsStored = 0;
  const market = profile.market as { quote?: Record<string, unknown> | null; source?: string } | null | undefined;
  const quote = market?.quote;
  const current = asNumber(quote?.current);
  if (current !== null) {
    const observedAt = typeof quote?.timestamp === "string" && !Number.isNaN(Date.parse(quote.timestamp)) ? new Date(quote.timestamp) : now;
    const source = market?.source ?? "market-profile";
    const payload = { symbol, quote, observedAt: observedAt.toISOString() };
    marketStored = Number(await upsertMarketObservation({ id: `market-${symbol}-${observedAt.toISOString().slice(0, 19)}`, entityId: resolution.entity.id, symbol: symbol.toUpperCase(), observationType: "quote", observedAt, period: "intraday", openValue: asNumber(quote?.open)?.toString() ?? null, highValue: asNumber(quote?.high)?.toString() ?? null, lowValue: asNumber(quote?.low)?.toString() ?? null, closeValue: current.toString(), volumeValue: asNumber(quote?.volume)?.toString() ?? null, changePercent: asNumber(quote?.changePercent)?.toString() ?? null, currency: typeof quote?.currency === "string" ? quote.currency : null, sourceKey: source.toLowerCase().replace(/[^a-z0-9]+/g, "-"), sourceUrl: sourceUrl(source), sourceRecordId: null, freshnessStatus: "fresh", confidenceScore: 75, dataHash: hash(payload), createdAt: now }));
  }
  const fundamentals = profile.fundamentals;
  if (fundamentals) {
    for (const [metricKey, metric] of Object.entries(fundamentals.metrics ?? {})) {
      const value = asNumber(metric?.value);
      if (value === null) continue;
      const observedAt = new Date(fundamentals.asOf);
      const period = metric.period ?? "latest";
      const payload = { symbol, metricKey, value, period, source: metric.source };
      const stored = await upsertFundamentalObservation({ id: `fundamental-${symbol}-${metricKey}-${period}`.slice(0, 128), entityId: resolution.entity.id, symbol: symbol.toUpperCase(), metricKey, metricValue: value.toString(), unit: null, period, periodEnd: null, observedAt: Number.isNaN(observedAt.getTime()) ? now : observedAt, sourceKey: metric.source.toLowerCase().replace(/[^a-z0-9]+/g, "-"), sourceUrl: sourceUrl(metric.source), sourceRecordId: null, freshnessStatus: "fresh", confidenceScore: metric.basis === "reported" ? 90 : metric.basis === "derived" ? 75 : 55, derivationStatus: metric.basis, dataHash: hash(payload), createdAt: now });
      fundamentalsStored += Number(stored);
    }
  }
  return { entity: resolution.entity, marketStored, fundamentalsStored, resolution };
}
