import { ProxyAgent, setGlobalDispatcher } from "undici";
const px = process.env.https_proxy ?? process.env.HTTPS_PROXY ?? process.env.http_proxy ?? process.env.HTTP_PROXY;
if (px) setGlobalDispatcher(new ProxyAgent(px));

import { createJobStore, enqueueJob, startJob, completeJob, dueJobs, isDuplicate, recordProcessed, summariseJobs, deadLetters, describeFreshness } from "../lib/filing-intelligence/jobs/engine";
import { defaultDefinitionsForMarket, assessDue } from "../lib/filing-intelligence/jobs/scheduler";
import { CONNECTORS } from "../lib/filing-intelligence/connectors/registry";
import { sourcesForMarket } from "../lib/filing-intelligence/markets/registry";
import { estimateAllScales, feasibilityBoundary } from "../lib/filing-intelligence/jobs/cost";
import { newFilingNotification, planNotifications, DEFAULT_NOTIFICATION_PREFERENCES } from "../lib/filing-intelligence/jobs/notifications";
import { monitoringStatement } from "../lib/filing-intelligence/jobs/modes";
import { renderRunbook } from "../lib/filing-intelligence/jobs/runbook";

const UA = "AnalyzerX/1.0 (filing-intelligence)";

async function main() {
  console.log("=== monitoring mode ===\n");
  console.log(" ", monitoringStatement(), "\n");

  console.log("=== job engine: discovery through a real connector ===\n");
  const marketId = "IN";
  const sourceIds = sourcesForMarket(marketId).filter((s) => s.hasAdapter).map((s) => s.sourceId);
  const definitions = defaultDefinitionsForMarket(marketId, sourceIds, "acme");

  let store = createJobStore();
  for (const definition of definitions) {
    const enqueued = enqueueJob(store, definition, new Date());
    store = enqueued.store;
  }
  console.log(`  enqueued ${store.jobs.length} jobs for ${sourceIds.length} sources`);

  // Idempotency: enqueue the same set again and confirm nothing was added.
  const before = store.jobs.length;
  for (const definition of definitions) store = enqueueJob(store, definition, new Date()).store;
  console.log(`  re-enqueue added ${store.jobs.length - before} jobs (idempotent)`);

  const due = dueJobs(store, new Date());
  console.log(`  due now: ${due.length}\n`);

  for (const job of due) {
    const connector = CONNECTORS.find((c) => c.terms.sourceId === job.sourceId);
    store = startJob(store, job.jobId, new Date());
    if (!connector) {
      const done = completeJob(store, job.jobId, { result: "blocked", error: "No connector is registered for this source." }, { maxRetries: 3 }, { jitter: () => 1 });
      store = done.store;
      console.log(`  ${job.sourceId} [${job.kind}] -> blocked (no connector)`);
      continue;
    }

    let discovered = 0;
    let processed = 0;
    let skipped = 0;
    let error: string | null = null;
    try {
      const result = await connector.fetchFilings({ limit: 20 }, "user_initiated");
      if (result.status === "ok" || result.status === "empty") {
        discovered = result.filings.length;
        for (const filing of result.filings) {
          if (isDuplicate(store, { documentId: filing.externalId, sha256: filing.contentSha256 })) {
            skipped += 1;
            continue;
          }
          store = recordProcessed(store, { documentId: filing.externalId, sha256: filing.contentSha256 });
          processed += 1;
        }
      } else {
        error = result.message;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    const done = completeJob(
      store,
      job.jobId,
      error
        ? { result: "error", error, documentsDiscovered: discovered, documentsProcessed: processed, duplicatesSkipped: skipped }
        : { result: "ok", documentsDiscovered: discovered, documentsProcessed: processed, duplicatesSkipped: skipped, verifiedCheckUtc: new Date().toISOString() },
      { maxRetries: 3 },
      { jitter: () => 1 },
    );
    store = done.store;
    const state = done.job.state;
    console.log(`  ${job.sourceId} [${job.kind}] -> ${state}: discovered=${discovered} processed=${processed} duplicates=${skipped}${error ? ` error="${error.slice(0, 60)}"` : ""}`);
  }

  console.log("\n=== job summary ===");
  const summary = summariseJobs(store);
  console.log(`  total=${summary.total} deadLettered=${summary.deadLettered} failed=${summary.failed}`);
  console.log("  by state:", summary.byState.map((e) => `${e.state}:${e.count}`).join(", "));
  console.log("  latest verified check per source:");
  for (const entry of summary.latestVerifiedBySource) {
    console.log(`    ${entry.sourceId}: ${entry.latestVerifiedCheckUtc ?? "none recorded"} — ${describeFreshness(entry.latestVerifiedCheckUtc)}`);
  }
  console.log(`  dead letters: ${deadLetters(store).length}`);

  console.log("\n=== notifications (opt-in, deduplicated) ===");
  const event = newFilingNotification({ marketId: "IN", sourceId: "nse_corporate_announcements", companyName: "Acme Ltd", title: "Board meeting outcome", publishedAt: new Date().toISOString(), documentId: "NSE-1", sha256: "abc" });
  const off = planNotifications([event], DEFAULT_NOTIFICATION_PREFERENCES, []);
  console.log(`  with notifications off: ${off.notifications.length} planned, suppressed because "${off.suppressed[0]?.reason}"`);
  const on = planNotifications([event], { ...DEFAULT_NOTIFICATION_PREFERENCES, enabled: true }, []);
  const again = planNotifications([event], { ...DEFAULT_NOTIFICATION_PREFERENCES, enabled: true }, on.notifications.map((n) => n.dedupeKey));
  console.log(`  with notifications on:  ${on.notifications.length} planned, repeat suppressed because "${again.suppressed[0]?.reason}"`);

  console.log("\n=== zero-cost estimate ===");
  for (const estimate of estimateAllScales()) {
    console.log(`  ${String(estimate.scale).padStart(4)} companies: ${String(estimate.requestsPerDay.total).padStart(5)} requests/day (feed ${estimate.requestsPerDay.feedSources}, per-company ${estimate.requestsPerDay.perCompanySources}), ${estimate.bandwidthPerDayLabel}/day, ${estimate.storageLabel} stored`);
  }
  const boundary = feasibilityBoundary();
  console.log("\n  where zero cost stops:");
  for (const item of boundary.stopsAt) console.log(`    - ${item}`);

  console.log("\n=== scheduling tiers ===");
  for (const tier of ["regulatory", "financial_results", "announcements", "prices"] as const) {
    const assessment = assessDue(tier, null);
    console.log(`  ${tier}: ${assessment.reason}`);
  }

  console.log(`\n=== runbook (${renderRunbook().split("\n").length} lines) ===`);
  console.log(renderRunbook().split("\n").slice(0, 8).join("\n"));
}

main().catch((error) => {
  console.error("verify failed:", error);
  process.exit(1);
});
