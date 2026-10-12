/**
 * Job engine (Prompt 5, sections 2 and 4).
 *
 * The engine is a set of pure functions over an immutable store, so every rule
 * is testable without a clock or a network. It provides:
 *
 *   - idempotency: enqueueing the same work twice yields one job;
 *   - bounded retries with exponential backoff and jitter;
 *   - a dead-letter state, so an exhausted job is reported rather than dropped;
 *   - duplicate suppression, by document identity and by content hash;
 *   - and the integrity rule the prompt insists on: a failed check never
 *     advances the latest successful check timestamp.
 *
 * That last rule is enforced in one place, in `completeJob`, so no caller can
 * accidentally advance health on a failure.
 */

import { idempotencyKey, type JobDefinition, type JobOutcome, type JobRecord } from "./types";

export type JobStore = {
  jobs: JobRecord[];
  /** Document identities already processed, for duplicate suppression. */
  processedDocumentIds: string[];
  /** Content hashes already processed. */
  processedHashes: string[];
};

export function createJobStore(): JobStore {
  return { jobs: [], processedDocumentIds: [], processedHashes: [] };
}

/** Exponential backoff with full jitter, bounded so it cannot grow without limit. */
export function backoffMs(retryCount: number, options: { baseMs?: number; maxMs?: number; jitter?: () => number } = {}): number {
  const base = options.baseMs ?? 30_000;
  const max = options.maxMs ?? 6 * 60 * 60_000; // six hours
  const exponential = Math.min(max, base * 2 ** retryCount);
  const jitter = options.jitter ? options.jitter() : Math.random();
  // Full jitter between 50% and 100% of the exponential value, so a fleet of
  // jobs does not retry in lockstep.
  return Math.round(exponential * (0.5 + jitter * 0.5));
}

export type EnqueueResult = {
  store: JobStore;
  job: JobRecord;
  /** False when the job already existed, so the caller did not create work. */
  created: boolean;
};

/**
 * Enqueue a job, idempotently.
 *
 * The idempotency key is derived from what the job acts on, so a duplicate
 * request finds the existing job and returns it rather than creating a second.
 */
export function enqueueJob(store: JobStore, definition: JobDefinition, now = new Date()): EnqueueResult {
  const jobId = idempotencyKey(definition);
  const existing = store.jobs.find((job) => job.jobId === jobId);
  if (existing) return { store, job: existing, created: false };

  const job: JobRecord = {
    jobId,
    kind: definition.kind,
    sourceId: definition.sourceId,
    marketId: definition.marketId,
    state: "queued",
    queuedUtc: now.toISOString(),
    startedUtc: null,
    finishedUtc: null,
    result: null,
    documentsDiscovered: 0,
    documentsProcessed: 0,
    duplicatesSkipped: 0,
    error: null,
    retryCount: 0,
    nextAttemptUtc: now.toISOString(),
    latestVerifiedCheckUtc: null,
    freshness: null,
    failed: false,
  };
  return { store: { ...store, jobs: [...store.jobs, job] }, job, created: true };
}

/** Jobs that are due to run now. A job in flight is never due. */
export function dueJobs(store: JobStore, now = new Date()): JobRecord[] {
  return store.jobs.filter((job) => {
    if (job.state !== "queued" && job.state !== "failed") return false;
    if (!job.nextAttemptUtc) return true;
    return new Date(job.nextAttemptUtc).getTime() <= now.getTime();
  });
}

/** Mark a job as running, so a second worker cannot pick it up. */
export function startJob(store: JobStore, jobId: string, now = new Date()): JobStore {
  return {
    ...store,
    jobs: store.jobs.map((job) => (job.jobId === jobId ? { ...job, state: "running", startedUtc: now.toISOString() } : job)),
  };
}

/** Recover jobs left running by a process that died, so they are retried. */
export function recoverStuckJobs(store: JobStore, staleAfterMs = 10 * 60_000, now = new Date()): { store: JobStore; recovered: string[] } {
  const recovered: string[] = [];
  const jobs = store.jobs.map((job) => {
    if (job.state !== "running" || !job.startedUtc) return job;
    const age = now.getTime() - new Date(job.startedUtc).getTime();
    if (age < staleAfterMs) return job;
    recovered.push(job.jobId);
    return {
      ...job,
      state: "failed" as const,
      error: "The process stopped while this job was running.",
      retryCount: job.retryCount + 1,
      nextAttemptUtc: now.toISOString(),
      failed: true,
    };
  });
  return { store: { ...store, jobs }, recovered };
}

export type CompleteResult = {
  store: JobStore;
  job: JobRecord;
  /** True when the job moved to the dead-letter state. */
  deadLettered: boolean;
};

/**
 * Record a job's outcome.
 *
 * The integrity rule lives here: `latestVerifiedCheckUtc` advances only when the
 * result is `ok` and a verified time was supplied. On any other result the
 * previous verified time is carried forward unchanged, so a failure can never
 * make a source look fresher than it is.
 */
export function completeJob(
  store: JobStore,
  jobId: string,
  outcome: JobOutcome,
  definition: { maxRetries: number },
  options: { now?: Date; jitter?: () => number } = {},
): CompleteResult {
  const now = options.now ?? new Date();
  const existing = store.jobs.find((job) => job.jobId === jobId);
  if (!existing) throw new Error(`No job "${jobId}" exists to complete.`);

  const succeeded = outcome.result === "ok" || outcome.result === "no_change" || outcome.result === "skipped_duplicate";
  const verifiedAdvance = outcome.result === "ok" && outcome.verifiedCheckUtc ? outcome.verifiedCheckUtc : null;

  if (succeeded) {
    const job: JobRecord = {
      ...existing,
      state: "succeeded",
      finishedUtc: now.toISOString(),
      result: outcome.result,
      documentsDiscovered: outcome.documentsDiscovered ?? existing.documentsDiscovered,
      documentsProcessed: outcome.documentsProcessed ?? existing.documentsProcessed,
      duplicatesSkipped: outcome.duplicatesSkipped ?? existing.duplicatesSkipped,
      error: outcome.error ?? null,
      // A success does not advance the verified time unless it supplied one.
      latestVerifiedCheckUtc: verifiedAdvance ?? existing.latestVerifiedCheckUtc,
      freshness: verifiedAdvance ? `Checked at ${verifiedAdvance}` : existing.freshness,
      nextAttemptUtc: null,
      failed: false,
    };
    return { store: { ...store, jobs: store.jobs.map((entry) => (entry.jobId === jobId ? job : entry)) }, job, deadLettered: false };
  }

  // A failure or a block. The verified check time is explicitly carried over.
  const retryCount = existing.retryCount + 1;
  const exhausted = retryCount > definition.maxRetries;
  const job: JobRecord = {
    ...existing,
    state: exhausted ? "dead_letter" : "failed",
    finishedUtc: now.toISOString(),
    result: outcome.result,
    documentsDiscovered: outcome.documentsDiscovered ?? existing.documentsDiscovered,
    documentsProcessed: outcome.documentsProcessed ?? existing.documentsProcessed,
    duplicatesSkipped: outcome.duplicatesSkipped ?? existing.duplicatesSkipped,
    error: outcome.error ?? "The job failed without a stated reason.",
    retryCount,
    // NEVER advanced on a failure.
    latestVerifiedCheckUtc: existing.latestVerifiedCheckUtc,
    freshness: existing.freshness,
    nextAttemptUtc: exhausted ? null : new Date(now.getTime() + backoffMs(retryCount, { jitter: options.jitter })).toISOString(),
    failed: true,
  };
  return { store: { ...store, jobs: store.jobs.map((entry) => (entry.jobId === jobId ? job : entry)) }, job, deadLettered: exhausted };
}

/**
 * Duplicate suppression.
 *
 * A document is a duplicate when its source-scoped identity or its content hash
 * has already been processed. Two documents sharing only a title are not
 * duplicates, because a title is not an identity.
 */
export function isDuplicate(store: JobStore, document: { documentId: string | null; sha256: string | null }): boolean {
  if (document.documentId && store.processedDocumentIds.includes(document.documentId)) return true;
  if (document.sha256 && store.processedHashes.includes(document.sha256)) return true;
  return false;
}

export function recordProcessed(store: JobStore, document: { documentId: string | null; sha256: string | null }): JobStore {
  return {
    ...store,
    processedDocumentIds: document.documentId ? [...new Set([...store.processedDocumentIds, document.documentId])] : store.processedDocumentIds,
    processedHashes: document.sha256 ? [...new Set([...store.processedHashes, document.sha256])] : store.processedHashes,
  };
}

/** The dead-letter list, for reporting rather than silent loss. */
export function deadLetters(store: JobStore): JobRecord[] {
  return store.jobs.filter((job) => job.state === "dead_letter");
}

export type JobSummary = {
  total: number;
  byState: { state: string; count: number }[];
  deadLettered: number;
  failed: number;
  /** The most recent verified check across all jobs, per source. */
  latestVerifiedBySource: { sourceId: string; latestVerifiedCheckUtc: string | null }[];
};

export function summariseJobs(store: JobStore): JobSummary {
  const states = new Map<string, number>();
  for (const job of store.jobs) states.set(job.state, (states.get(job.state) ?? 0) + 1);

  const bySource = new Map<string, string | null>();
  for (const job of store.jobs) {
    if (!job.sourceId) continue;
    const current = bySource.get(job.sourceId) ?? null;
    if (job.latestVerifiedCheckUtc && (!current || job.latestVerifiedCheckUtc > current)) {
      bySource.set(job.sourceId, job.latestVerifiedCheckUtc);
    } else if (!bySource.has(job.sourceId)) {
      bySource.set(job.sourceId, current);
    }
  }

  return {
    total: store.jobs.length,
    byState: [...states.entries()].map(([state, count]) => ({ state, count })).sort((a, b) => b.count - a.count || a.state.localeCompare(b.state)),
    deadLettered: store.jobs.filter((job) => job.state === "dead_letter").length,
    failed: store.jobs.filter((job) => job.failed).length,
    latestVerifiedBySource: [...bySource.entries()].map(([sourceId, latestVerifiedCheckUtc]) => ({ sourceId, latestVerifiedCheckUtc })),
  };
}

/** How fresh a source's data is, in plain language, or that it is unknown. */
export function describeFreshness(latestVerifiedCheckUtc: string | null, now = new Date(), staleAfterHours = 48): string {
  if (!latestVerifiedCheckUtc) return "Freshness unknown: no successful check has been recorded.";
  const checked = new Date(latestVerifiedCheckUtc);
  if (Number.isNaN(checked.getTime())) return "Freshness unknown: the recorded check time could not be read.";
  const hours = (now.getTime() - checked.getTime()) / 3_600_000;
  if (hours <= 1) return "Fresh: checked within the last hour.";
  if (hours <= staleAfterHours) return `Fresh: checked ${Math.round(hours)} hours ago.`;
  return `Stale: the last successful check was ${Math.round(hours / 24)} days ago, beyond the ${staleAfterHours}-hour window.`;
}
