import { getSourceRecordsForSymbol } from "./db";
import { ingestSecCompany } from "./sec-edgar-ingestion";

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;
let lastRunAt: string | null = null;
let lastSuccessAt: string | null = null;
let lastError: string | null = null;
let lastResults: Array<Record<string, unknown>> = [];

function configuredSymbols(): string[] { return [...new Set<string>((process.env.SEC_EDGAR_SYMBOLS ?? "").split(",").map((value: string) => value.trim().toUpperCase()).filter((value: string) => /^[A-Z0-9.-]{1,20}$/.test(value)))].slice(0, 100); }
function intervalMs() { return Math.max(300_000, Number(process.env.SEC_EDGAR_INTERVAL_MS ?? 900_000)); }

async function knownAccessions(symbol: string): Promise<Set<string>> {
  const records = await getSourceRecordsForSymbol("US", symbol, 2000);
  return new Set(records.filter((record) => record.sourceKey === "sec-edgar-submissions" && record.externalId).map((record) => record.externalId as string));
}

export function getSecSchedulerStatus() { return { enabled: configuredSymbols().length > 0, running: Boolean(timer), pollInProgress: running, intervalMs: intervalMs(), symbols: configuredSymbols(), lastRunAt, lastSuccessAt, lastError, lastResults }; }

export async function pollSecSourcesNow() {
  if (running) return { skipped: true, reason: "SEC poll already in progress", status: getSecSchedulerStatus() };
  const symbols = configuredSymbols();
  if (symbols.length === 0) return { skipped: true, reason: "SEC_EDGAR_SYMBOLS is not configured", status: getSecSchedulerStatus() };
  running = true; lastRunAt = new Date().toISOString(); lastError = null;
  try {
    const results = await Promise.allSettled(symbols.map(async (symbol) => {
      const known = await knownAccessions(symbol);
      return ingestSecCompany(symbol, known.size ? { excludeAccessions: known } : {});
    }));
    lastResults = results.map((result, index) => result.status === "fulfilled" ? { symbol: symbols[index], status: result.value.status, recordsStored: result.value.recordsStored, newAccessions: result.value.newAccessions?.length ?? 0 } : { symbol: symbols[index], status: "error", error: String(result.reason) });
    const failures = lastResults.filter((result) => result.status === "error").length;
    if (failures === 0) lastSuccessAt = new Date().toISOString();
    else lastError = `${failures} SEC symbol collection(s) failed`;
    return { skipped: false, results: lastResults, status: getSecSchedulerStatus() };
  } finally { running = false; }
}

export function startSecScheduler() {
  if (timer || configuredSymbols().length === 0) return;
  const interval = intervalMs();
  timer = setInterval(() => { void pollSecSourcesNow(); }, interval);
  void pollSecSourcesNow();
  console.log(`[SECEdgar] started with ${interval}ms interval for ${configuredSymbols().join(", ")}`);
}
