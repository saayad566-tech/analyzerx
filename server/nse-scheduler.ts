import { ingestCatalogSource } from "./source-ingestion";

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

export function getNseSchedulerStatus() {
  return { running: Boolean(timer), pollInProgress: running, intervalMs: Number(process.env.NSE_COLLECTOR_INTERVAL_MS ?? 300_000), collectors: ["nse-fii-dii", "nse-announcements-rss", "nse-announcements", "nse-actions", "nse-results", "nse-shareholding", "nse-board-meetings"] };
}

export async function pollNseSourcesNow() {
  if (running) return { skipped: true, reason: "poll already in progress" };
  running = true;
  try {
    const collectorKeys = ["nse-fii-dii", "nse-announcements-rss", "nse-announcements", "nse-actions", "nse-results", "nse-shareholding", "nse-board-meetings"];
    const results = await Promise.allSettled(collectorKeys.map((key) => ingestCatalogSource(key)));
    return { skipped: false, results: results.map((result) => result.status === "fulfilled" ? result.value : { status: "error", error: String(result.reason) }) };
  } finally {
    running = false;
  }
}

export function startNseScheduler() {
  if (timer) return;
  const intervalMs = Math.max(60_000, Number(process.env.NSE_COLLECTOR_INTERVAL_MS ?? 300_000));
  timer = setInterval(() => { void pollNseSourcesNow(); }, intervalMs);
  void pollNseSourcesNow();
  console.log(`[NSECollector] started with ${intervalMs}ms interval`);
}
