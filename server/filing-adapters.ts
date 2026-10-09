import type { SourceRecord } from "../drizzle/schema";

export type UnifiedFiling = {
  id: string;
  symbol: string | null;
  title: string;
  filingType: string;
  sourceKey: string;
  sourceUrl: string;
  publishedAt: string | null;
  reportDate: string | null;
  retrievedAt: string;
  freshnessStatus: SourceRecord["freshnessStatus"];
  parserVersion: string;
  evidenceStatus: "verified" | "partial" | "unavailable";
  summary: string;
  payload: Record<string, unknown>;
};

const officialSource = /^(nse|bse|sebi|company-ir|investor-relations|sec-edgar|sec-company-facts)/i;
const allowedRecordTypes = /announcement|corporate|filing|result|action|shareholding|board|meeting|official-source-page|sec-/i;

function parsePayload(record: SourceRecord): Record<string, unknown> {
  if (!record.normalizedPayload) return {};
  try { const value = JSON.parse(record.normalizedPayload) as unknown; return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; } catch { return {}; }
}
function iso(value: unknown) { if (typeof value !== "string") return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }

export function normalizeValidatedFiling(record: SourceRecord): UnifiedFiling | null {
  if (!officialSource.test(record.sourceKey) && !officialSource.test(record.sourceUrl)) return null;
  if (!allowedRecordTypes.test(record.recordType) && !record.title) return null;
  const payload = parsePayload(record);
  const title = String(payload.title ?? record.title ?? record.documentName ?? "Official filing").trim();
  if (!title || !record.sourceUrl) return null;
  const summary = String(payload.description ?? payload.summary ?? record.documentName ?? record.recordType).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 2_000);
  const evidenceStatus = record.freshnessStatus === "fresh" && title !== "Official filing" ? "verified" : record.freshnessStatus === "error" || record.freshnessStatus === "unavailable" ? "unavailable" : "partial";
  return { id: record.id, symbol: record.symbol?.toUpperCase() ?? null, title, filingType: record.recordType, sourceKey: record.sourceKey, sourceUrl: record.sourceUrl, publishedAt: iso(payload.publishedAt) ?? record.publishedAt?.toISOString() ?? null, reportDate: record.reportDate?.toISOString() ?? null, retrievedAt: record.retrievedAt.toISOString(), freshnessStatus: record.freshnessStatus, parserVersion: record.parserVersion, evidenceStatus, summary, payload };
}

export function parseNseFiling(record: SourceRecord): UnifiedFiling | null { return /^nse/i.test(record.sourceKey) || /nseindia\.com/i.test(record.sourceUrl) ? normalizeValidatedFiling(record) : null; }
export function parseBseFiling(record: SourceRecord): UnifiedFiling | null { return /^bse/i.test(record.sourceKey) || /bseindia\.com/i.test(record.sourceUrl) ? normalizeValidatedFiling(record) : null; }
export function parseCompanyIrFiling(record: SourceRecord): UnifiedFiling | null { return /company-ir|investor-relations/i.test(record.sourceKey) || /investor.?relations/i.test(record.sourceUrl) ? normalizeValidatedFiling(record) : null; }
export function parseSecFiling(record: SourceRecord): UnifiedFiling | null { return /^sec-edgar|^sec-company-facts/i.test(record.sourceKey) || /sec\.gov/i.test(record.sourceUrl) ? normalizeValidatedFiling(record) : null; }

export function filterFilingsForSymbol(records: SourceRecord[], symbol: string): UnifiedFiling[] {
  const normalized = symbol.toUpperCase();
  return records.flatMap((record) => {
    const filing = normalizeValidatedFiling(record);
    if (!filing) return [];
    const text = `${filing.symbol ?? ""} ${filing.title} ${filing.summary}`.toUpperCase();
    return filing.symbol === normalized || text.includes(normalized) ? [filing] : [];
  });
}


export function isValidatedMachineReadableFiling(record: SourceRecord) {
  if (!record.normalizedPayload || !record.sourceUrl) return false;
  try {
    const parsed = JSON.parse(record.normalizedPayload) as Record<string, unknown>;
    const hasTitle = typeof parsed.title === "string" || typeof parsed.headline === "string" || Boolean(record.title);
    const hasDate = typeof parsed.publishedAt === "string" || typeof parsed.reportDate === "string" || Boolean(record.publishedAt) || Boolean(record.reportDate);
    return hasTitle && hasDate && record.freshnessStatus === "fresh";
  } catch {
    return false;
  }
}
