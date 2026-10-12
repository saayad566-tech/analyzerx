import { describe, expect, it } from "vitest";

import {
  assessDue,
  backoffMs,
  canReliablyRun,
  completeJob,
  costTable,
  createJobStore,
  deadLetters,
  defaultDefinitionsForMarket,
  DEFAULT_NOTIFICATION_PREFERENCES,
  describeFreshness,
  dueJobs,
  enqueueJob,
  estimateAllScales,
  estimateCost,
  feasibilityBoundary,
  filingNotificationKey,
  idempotencyKey,
  isDuplicate,
  MINIMUM_INTERVAL_MINUTES,
  MODE_A,
  MODE_B,
  MODE_A_CAPABILITIES,
  monitoringStatement,
  newFilingNotification,
  planNotifications,
  processingFailureNotification,
  recordProcessed,
  recoverStuckJobs,
  renderRunbook,
  RUNBOOK,
  RUNBOOK_LIMITS,
  schedulableAtZeroCost,
  SCHEDULES,
  scheduleForCategory,
  scheduleForTier,
  startJob,
  summariseJobs,
  type JobDefinition,
} from "../lib/filing-intelligence";

const NOW = new Date("2026-10-12T12:00:00.000Z");
const definition: JobDefinition = { kind: "filing_discovery", sourceId: "nse_corporate_announcements", marketId: "IN", scope: "announcements:default", intervalMinutes: 60, maxRetries: 3 };

describe("job engine: idempotency", () => {
  it("turns a repeated enqueue into one job", () => {
    const first = enqueueJob(createJobStore(), definition, NOW);
    expect(first.created).toBe(true);
    const second = enqueueJob(first.store, definition, new Date("2026-10-12T12:05:00.000Z"));
    expect(second.created).toBe(false);
    expect(second.store.jobs).toHaveLength(1);
    expect(second.job.jobId).toBe(first.job.jobId);
  });

  it("treats a different scope as a different job", () => {
    const first = enqueueJob(createJobStore(), definition, NOW);
    const other = enqueueJob(first.store, { ...definition, scope: "regulatory:default" }, NOW);
    expect(other.created).toBe(true);
    expect(other.store.jobs).toHaveLength(2);
  });

  it("builds a key from what the job acts on", () => {
    expect(idempotencyKey({ kind: "filing_discovery", marketId: "IN", sourceId: "nse_corporate_announcements", scope: "x" })).toBe(
      "filing_discovery::IN::nse_corporate_announcements::x",
    );
    expect(idempotencyKey({ kind: "filing_discovery", marketId: "IN", sourceId: null })).toBe("filing_discovery::IN::all::default");
  });
});

describe("job engine: retries, backoff and dead-lettering", () => {
  it("computes a bounded exponential backoff with jitter", () => {
    expect(backoffMs(0, { jitter: () => 1, baseMs: 1000 })).toBe(1000);
    expect(backoffMs(1, { jitter: () => 1, baseMs: 1000 })).toBe(2000);
    expect(backoffMs(2, { jitter: () => 1, baseMs: 1000 })).toBe(4000);
    // Bounded: it never grows past the ceiling.
    expect(backoffMs(40, { jitter: () => 1, baseMs: 1000 })).toBeLessThanOrEqual(6 * 60 * 60_000);
  });

  it("jitters so a fleet does not retry in lockstep", () => {
    expect(backoffMs(3, { jitter: () => 0, baseMs: 1000 })).toBeLessThan(backoffMs(3, { jitter: () => 1, baseMs: 1000 }));
  });

  it("marks a failure as retryable and schedules the next attempt", () => {
    const { store, job } = enqueueJob(createJobStore(), definition, NOW);
    const started = startJob(store, job.jobId, NOW);
    const result = completeJob(started, job.jobId, { result: "error", error: "HTTP 503" }, definition, { now: NOW, jitter: () => 1 });
    expect(result.job.state).toBe("failed");
    expect(result.job.retryCount).toBe(1);
    expect(result.job.error).toBe("HTTP 503");
    expect(result.job.nextAttemptUtc).toBeTruthy();
    expect(result.deadLettered).toBe(false);
  });

  it("dead-letters a job once its retries are exhausted, rather than dropping it", () => {
    let { store, job } = enqueueJob(createJobStore(), definition, NOW);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      store = startJob(store, job.jobId, NOW);
      const result = completeJob(store, job.jobId, { result: "error", error: `attempt ${attempt}` }, definition, { now: NOW, jitter: () => 1 });
      store = result.store;
      job = result.job;
    }
    expect(job.state).toBe("dead_letter");
    expect(job.retryCount).toBe(4);
    expect(deadLetters(store).map((entry) => entry.jobId)).toEqual([job.jobId]);
    expect(summariseJobs(store).deadLettered).toBe(1);
  });

  it("recovers a job left running by a terminated process", () => {
    const { store, job } = enqueueJob(createJobStore(), definition, NOW);
    const started = startJob(store, job.jobId, new Date("2026-10-12T11:00:00.000Z"));
    const recovered = recoverStuckJobs(started, 10 * 60_000, NOW);
    expect(recovered.recovered).toContain(job.jobId);
    expect(recovered.store.jobs[0].state).toBe("failed");
    expect(recovered.store.jobs[0].retryCount).toBe(1);
    expect(recovered.store.jobs[0].error).toMatch(/process stopped/i);
  });

  it("leaves a job that is still within its window alone", () => {
    const { store, job } = enqueueJob(createJobStore(), definition, NOW);
    const started = startJob(store, job.jobId, new Date("2026-10-12T11:58:00.000Z"));
    expect(recoverStuckJobs(started, 10 * 60_000, NOW).recovered).toEqual([]);
  });
});

describe("job engine: a failed check never advances the verified timestamp", () => {
  it("keeps the previous verified time when a check fails", () => {
    let { store, job } = enqueueJob(createJobStore(), definition, NOW);
    // A first successful check establishes the verified time.
    store = startJob(store, job.jobId, NOW);
    const ok = completeJob(store, job.jobId, { result: "ok", verifiedCheckUtc: "2026-10-12T11:00:00.000Z" }, definition, { now: NOW });
    expect(ok.job.latestVerifiedCheckUtc).toBe("2026-10-12T11:00:00.000Z");

    // A later failure must NOT advance it.
    store = startJob(ok.store, job.jobId, new Date("2026-10-12T13:00:00.000Z"));
    const failed = completeJob(store, job.jobId, { result: "error", error: "timeout", verifiedCheckUtc: "2026-10-12T13:00:00.000Z" }, definition, {
      now: new Date("2026-10-12T13:00:00.000Z"),
      jitter: () => 1,
    });
    expect(failed.job.latestVerifiedCheckUtc).toBe("2026-10-12T11:00:00.000Z");
    expect(failed.job.failed).toBe(true);
  });

  it("does not advance the verified time on a blocked check", () => {
    const { store, job } = enqueueJob(createJobStore(), definition, NOW);
    const started = startJob(store, job.jobId, NOW);
    const blocked = completeJob(started, job.jobId, { result: "blocked", error: "the source refused the request" }, definition, { now: NOW, jitter: () => 1 });
    expect(blocked.job.latestVerifiedCheckUtc).toBeNull();
    expect(blocked.job.state).toBe("failed");
  });

  it("advances it only when a success supplies a verified time", () => {
    const { store, job } = enqueueJob(createJobStore(), definition, NOW);
    const started = startJob(store, job.jobId, NOW);
    const noTime = completeJob(started, job.jobId, { result: "ok" }, definition, { now: NOW });
    expect(noTime.job.latestVerifiedCheckUtc).toBeNull();

    const withTime = completeJob(noTime.store, job.jobId, { result: "ok", verifiedCheckUtc: "2026-10-12T12:00:00.000Z" }, definition, { now: NOW });
    expect(withTime.job.latestVerifiedCheckUtc).toBe("2026-10-12T12:00:00.000Z");
  });

  it("reports freshness honestly, including when it is unknown", () => {
    expect(describeFreshness(null)).toMatch(/Freshness unknown/);
    expect(describeFreshness("2026-10-12T11:30:00.000Z", NOW)).toMatch(/Fresh/);
    expect(describeFreshness("2026-10-01T00:00:00.000Z", NOW)).toMatch(/Stale/);
    expect(describeFreshness("not a date", NOW)).toMatch(/Freshness unknown/);
  });
});

describe("job engine: duplicate suppression", () => {
  it("suppresses a repeat by document identity and by content hash", () => {
    const store = recordProcessed(createJobStore(), { documentId: "NSE-123", sha256: "abc" });
    expect(isDuplicate(store, { documentId: "NSE-123", sha256: null })).toBe(true);
    expect(isDuplicate(store, { documentId: null, sha256: "abc" })).toBe(true);
    expect(isDuplicate(store, { documentId: "NSE-999", sha256: "zzz" })).toBe(false);
  });

  it("does not treat two documents sharing only a title as duplicates", () => {
    const store = recordProcessed(createJobStore(), { documentId: "A", sha256: "aaa" });
    // A different identity and different bytes, so it is a genuinely new document.
    expect(isDuplicate(store, { documentId: "B", sha256: "bbb" })).toBe(false);
  });

  it("counts duplicates skipped on the job record", () => {
    const { store, job } = enqueueJob(createJobStore(), definition, NOW);
    const started = startJob(store, job.jobId, NOW);
    const done = completeJob(started, job.jobId, { result: "ok", duplicatesSkipped: 4, documentsProcessed: 1, verifiedCheckUtc: NOW.toISOString() }, definition, { now: NOW });
    expect(done.job.duplicatesSkipped).toBe(4);
    expect(done.job.documentsProcessed).toBe(1);
  });
});

describe("job engine: due jobs and summary", () => {
  it("reports a job as due, then not due while it is running", () => {
    const { store, job } = enqueueJob(createJobStore(), definition, NOW);
    expect(dueJobs(store, NOW).map((entry) => entry.jobId)).toEqual([job.jobId]);
    const running = startJob(store, job.jobId, NOW);
    expect(dueJobs(running, NOW)).toEqual([]);
  });

  it("summarises states and per-source verified times", () => {
    const { store, job } = enqueueJob(createJobStore(), definition, NOW);
    const started = startJob(store, job.jobId, NOW);
    const done = completeJob(started, job.jobId, { result: "ok", verifiedCheckUtc: NOW.toISOString() }, definition, { now: NOW });
    const summary = summariseJobs(done.store);
    expect(summary.total).toBe(1);
    expect(summary.latestVerifiedBySource[0].sourceId).toBe("nse_corporate_announcements");
    expect(summary.latestVerifiedBySource[0].latestVerifiedCheckUtc).toBe(NOW.toISOString());
  });
});

describe("scheduling: cadence inside source limits", () => {
  it("defines four tiers with a rationale and a source limit", () => {
    expect(SCHEDULES).toHaveLength(4);
    for (const schedule of SCHEDULES) {
      expect(schedule.rationale.length).toBeGreaterThan(20);
      expect(schedule.withinSourceLimit.length).toBeGreaterThan(10);
      expect(schedule.intervalMinutes).toBeGreaterThanOrEqual(MINIMUM_INTERVAL_MINUTES);
    }
  });

  it("never polls continuously or aggressively", () => {
    for (const schedule of SCHEDULES) {
      expect(schedule.intervalMinutes).toBeGreaterThanOrEqual(15);
    }
  });

  it("orders the cadences by how fast the data changes", () => {
    expect(scheduleForTier("announcements").intervalMinutes).toBeLessThan(scheduleForTier("financial_results").intervalMinutes);
    expect(scheduleForTier("financial_results").intervalMinutes).toBeLessThan(scheduleForTier("regulatory").intervalMinutes);
  });

  it("maps a data category to its schedule", () => {
    expect(scheduleForCategory("corporate_announcements")?.tier).toBe("announcements");
    expect(scheduleForCategory("regulatory_orders")?.tier).toBe("regulatory");
    expect(scheduleForCategory("quarterly_results")?.tier).toBe("financial_results");
  });

  it("refuses to schedule prices at zero cost, and says why", () => {
    expect(schedulableAtZeroCost("live_prices").schedulable).toBe(false);
    expect(schedulableAtZeroCost("live_prices").reason).toMatch(/licensed feed/i);
    expect(schedulableAtZeroCost("corporate_announcements").schedulable).toBe(true);
  });

  it("assesses due-ness and reports the wait", () => {
    expect(assessDue("announcements", null, NOW).due).toBe(true);
    const recent = new Date(NOW.getTime() - 10 * 60_000).toISOString();
    const notDue = assessDue("announcements", recent, NOW);
    expect(notDue.due).toBe(false);
    expect(notDue.minutesUntilDue).toBeGreaterThan(0);
    const old = new Date(NOW.getTime() - 3 * 3_600_000).toISOString();
    expect(assessDue("announcements", old, NOW).due).toBe(true);
    expect(assessDue("announcements", "not a date", NOW).due).toBe(true);
  });

  it("builds default definitions for a market's sources", () => {
    const definitions = defaultDefinitionsForMarket("IN", ["nse_corporate_announcements"]);
    expect(definitions.length).toBe(4); // three discovery tiers plus a health check
    expect(definitions.some((entry) => entry.kind === "source_health_check")).toBe(true);
    expect(definitions.every((entry) => entry.marketId === "IN")).toBe(true);
  });
});

describe("execution modes: the limitation is stated, not implied", () => {
  it("implements Mode A and not Mode B", () => {
    expect(MODE_A.implemented).toBe(true);
    expect(MODE_B.implemented).toBe(false);
    expect(MODE_B.appUsableWithout).toBe(true);
  });

  it("does not offer background execution it cannot provide", () => {
    expect(canReliablyRun("background_task").can).toBe(false);
    expect(canReliablyRun("background_task").reason).toMatch(/no run happens while the app is closed/i);
    expect(canReliablyRun("on_open").can).toBe(true);
    expect(canReliablyRun("manual_refresh").can).toBe(true);
  });

  it("names the background capability as unavailable in the capability list", () => {
    const background = MODE_A_CAPABILITIES.find((entry) => entry.id === "background_task")!;
    expect(background.available).toBe(false);
    expect(background.provider).toMatch(/not bundled/i);
  });

  it("states the monitoring position plainly", () => {
    const statement = monitoringStatement();
    expect(statement).toMatch(/Mode A only/);
    expect(statement).toMatch(/No check runs while the app is closed/);
    expect(statement).toMatch(/Mode B.*not implemented/i);
  });

  it("lists the limitations of each mode", () => {
    expect(MODE_A.limitations.join(" ")).toMatch(/does not guarantee exact scheduled execution/i);
    expect(MODE_B.limitations.join(" ")).toMatch(/not implemented/i);
  });
});

describe("notifications: opt-in, deduplicated, user-controlled", () => {
  const event = newFilingNotification({ marketId: "IN", sourceId: "nse_corporate_announcements", companyName: "Acme Ltd", title: "Board meeting outcome", publishedAt: "2026-10-12T10:00:00.000Z", documentId: "NSE-1", sha256: "abc" });

  it("sends nothing while notifications are switched off", () => {
    const plan = planNotifications([event], DEFAULT_NOTIFICATION_PREFERENCES, [], NOW);
    expect(plan.notifications).toEqual([]);
    expect(plan.suppressed[0].reason).toMatch(/switched off/i);
  });

  it("plans a notification once notifications are enabled", () => {
    const plan = planNotifications([event], { ...DEFAULT_NOTIFICATION_PREFERENCES, enabled: true }, [], NOW);
    expect(plan.notifications).toHaveLength(1);
    expect(plan.notifications[0].title).toMatch(/Acme Ltd/);
  });

  it("never announces the same filing twice", () => {
    const prefs = { ...DEFAULT_NOTIFICATION_PREFERENCES, enabled: true };
    const first = planNotifications([event], prefs, [], NOW);
    const second = planNotifications([event], prefs, first.notifications.map((entry) => entry.dedupeKey), NOW);
    expect(second.notifications).toEqual([]);
    expect(second.suppressed[0].reason).toMatch(/already been announced/i);
  });

  it("derives the key from the filing's identity, not its title", () => {
    expect(filingNotificationKey("nse", "NSE-1", "abc")).toBe(filingNotificationKey("nse", "NSE-1", "different-hash"));
    expect(filingNotificationKey("nse", "NSE-1", null)).not.toBe(filingNotificationKey("nse", "NSE-2", null));
  });

  it("respects a per-kind opt-out", () => {
    const plan = planNotifications([event], { ...DEFAULT_NOTIFICATION_PREFERENCES, enabled: true, newFilings: false }, [], NOW);
    expect(plan.notifications).toEqual([]);
    expect(plan.suppressed[0].reason).toMatch(/not opted in/i);
  });

  it("respects a market filter", () => {
    const plan = planNotifications([event], { ...DEFAULT_NOTIFICATION_PREFERENCES, enabled: true, marketIds: ["US"] }, [], NOW);
    expect(plan.notifications).toEqual([]);
    expect(plan.suppressed[0].reason).toMatch(/market IN/);
  });

  it("keys a failure notification by retry, so a retry re-announces once", () => {
    const first = processingFailureNotification({ marketId: "IN", sourceId: "nse", jobId: "j1", retryCount: 3, error: "timeout" });
    const second = processingFailureNotification({ marketId: "IN", sourceId: "nse", jobId: "j1", retryCount: 4, error: "timeout" });
    expect(first.dedupeKey).not.toBe(second.dedupeKey);
    expect(first.body).toMatch(/could not be checked after 3 attempts/);
  });
});

describe("zero-cost estimate and its feasibility boundary", () => {
  it("estimates volume at all three scales", () => {
    const estimates = estimateAllScales();
    expect(estimates.map((entry) => entry.scale)).toEqual([10, 100, 1000]);
    for (const estimate of estimates) {
      expect(estimate.requestsPerDay.total).toBeGreaterThan(0);
      expect(estimate.bandwidthPerDayBytes).toBeGreaterThan(0);
      expect(estimate.storageBytes).toBeLessThanOrEqual(64_000_000);
    }
  });

  it("shows that feed requests do not grow with company count", () => {
    const ten = estimateCost(10);
    const thousand = estimateCost(1000);
    // The feed sources serve every company in one request, so this is flat.
    expect(thousand.requestsPerDay.feedSources).toBe(ten.requestsPerDay.feedSources);
    // Only per-company sources scale.
    expect(thousand.requestsPerDay.perCompanySources).toBeGreaterThan(ten.requestsPerDay.perCompanySources);
  });

  it("states where the zero-cost design stops being feasible", () => {
    const boundary = feasibilityBoundary();
    expect(boundary.stopsAt.join(" ")).toMatch(/app is closed/);
    expect(boundary.stopsAt.join(" ")).toMatch(/licensed provider/);
    expect(boundary.wouldRequire.length).toBeGreaterThan(0);
    // No provider quota is invented: no hosting provider is named as a quota
    // source, and no "N free" allowance is asserted.
    const serialised = JSON.stringify(boundary);
    expect(serialised).not.toMatch(/\b(?:AWS|Azure|GCP|Vercel|Render|Railway|Supabase|Firebase)\b/i);
    expect(serialised).not.toMatch(/\b\d+\s*(?:GB|MB|requests?|invocations?)\s*(?:free|included|allowance)/i);
  });

  it("renders a cost table", () => {
    const table = costTable();
    expect(table).toMatch(/10 companies/);
    expect(table).toMatch(/1000 companies/);
  });
});

describe("runbook", () => {
  it("covers the failures the prompt names", () => {
    const ids = RUNBOOK.map((entry) => entry.id);
    for (const required of ["source_outage", "throttling", "process_termination", "interrupted_download", "duplicate_jobs", "bad_extraction", "stale_source", "invalid_response", "credential_expiry", "incorrect_report", "deployment"]) {
      expect(ids).toContain(required);
    }
  });

  it("gives every entry an action, a recovery and a confirmation", () => {
    for (const entry of RUNBOOK) {
      expect(entry.immediateAction.length).toBeGreaterThan(0);
      expect(entry.recovery.length).toBeGreaterThan(0);
      expect(entry.confirmation.length).toBeGreaterThan(10);
    }
  });

  it("marks the steps that need something the build does not have", () => {
    const credentials = RUNBOOK.find((entry) => entry.id === "credential_expiry")!;
    expect(credentials.dependency).toBeTruthy();
    expect(credentials.dependency).toMatch(/not the client bundle/);
  });

  it("states its own limits rather than overstating them", () => {
    expect(RUNBOOK_LIMITS.join(" ")).toMatch(/No step in this runbook requires a paid service/);
    expect(RUNBOOK_LIMITS.join(" ")).toMatch(/Monitoring while the app is closed is not available/);
  });

  it("renders as text", () => {
    const rendered = renderRunbook();
    expect(rendered).toContain("ANALYZERX MONITORING RUNBOOK");
    expect(rendered).toContain("A source is unreachable");
  });
});

describe("acceptance: a new filing is detected and processed through the engine", () => {
  it("runs discovery, suppresses the duplicate, and advances the verified time only on success", () => {
    let store = createJobStore();
    const discovery: JobDefinition = { kind: "filing_discovery", sourceId: "nse_corporate_announcements", marketId: "IN", scope: "announcements:acme", intervalMinutes: 60, maxRetries: 2 };

    // First run: a new filing arrives.
    let { store: afterEnqueue, job } = enqueueJob(store, discovery, NOW);
    store = startJob(afterEnqueue, job.jobId, NOW);
    const first = completeJob(store, job.jobId, { result: "ok", documentsDiscovered: 1, documentsProcessed: 1, verifiedCheckUtc: NOW.toISOString() }, discovery, { now: NOW });
    store = recordProcessed(first.store, { documentId: "NSE-77", sha256: "hash77" });
    expect(first.job.documentsProcessed).toBe(1);
    expect(first.job.latestVerifiedCheckUtc).toBe(NOW.toISOString());

    // Second run: the same filing is seen again and skipped.
    store = startJob(store, job.jobId, new Date("2026-10-12T13:00:00.000Z"));
    const duplicate = isDuplicate(store, { documentId: "NSE-77", sha256: "hash77" });
    expect(duplicate).toBe(true);
    const second = completeJob(store, job.jobId, { result: "skipped_duplicate", duplicatesSkipped: 1 }, discovery, { now: new Date("2026-10-12T13:00:00.000Z") });
    expect(second.job.duplicatesSkipped).toBe(1);
    // A skipped duplicate is not a successful check, so the verified time is unchanged.
    expect(second.job.latestVerifiedCheckUtc).toBe(NOW.toISOString());

    // Third run: the source fails, and the verified time must not move.
    store = startJob(second.store, job.jobId, new Date("2026-10-12T14:00:00.000Z"));
    const failed = completeJob(store, job.jobId, { result: "error", error: "HTTP 503" }, discovery, { now: new Date("2026-10-12T14:00:00.000Z"), jitter: () => 1 });
    expect(failed.job.latestVerifiedCheckUtc).toBe(NOW.toISOString());
    expect(describeFreshness(failed.job.latestVerifiedCheckUtc, new Date("2026-10-12T15:00:00.000Z"))).toMatch(/Fresh/);
  });
});
