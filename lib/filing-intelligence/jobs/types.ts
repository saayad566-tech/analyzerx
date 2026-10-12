/**
 * Job types (Prompt 5, sections 2 and 4).
 *
 * Every job records the same set of facts, and the set is deliberately wide
 * because the integrity rule depends on it: a failed check must never advance
 * the latest successful check timestamp, which is only enforceable if the
 * successful check time and the failure are recorded separately.
 */

export type JobKind =
  | "source_health_check"
  | "filing_discovery"
  | "document_retrieval"
  | "extraction"
  | "validation"
  | "report_generation"
  | "failure_recovery";

export const JOB_KINDS: JobKind[] = [
  "source_health_check",
  "filing_discovery",
  "document_retrieval",
  "extraction",
  "validation",
  "report_generation",
  "failure_recovery",
];

export function jobKindLabel(kind: JobKind): string {
  switch (kind) {
    case "source_health_check":
      return "Source health check";
    case "filing_discovery":
      return "Filing discovery";
    case "document_retrieval":
      return "Document retrieval";
    case "extraction":
      return "Extraction";
    case "validation":
      return "Validation";
    case "report_generation":
      return "Report generation";
    case "failure_recovery":
      return "Failure recovery";
  }
}

export type JobState =
  | "queued"
  | "running"
  | "succeeded"
  | "failed" // retryable
  | "dead_letter"; // retries exhausted, reported rather than silently dropped

export function jobStateLabel(state: JobState): string {
  switch (state) {
    case "queued":
      return "Queued";
    case "running":
      return "Running";
    case "succeeded":
      return "Succeeded";
    case "failed":
      return "Failed, will retry";
    case "dead_letter":
      return "Failed, retries exhausted";
  }
}

export type JobResult = "ok" | "no_change" | "error" | "blocked" | "skipped_duplicate";

export type JobRecord = {
  /** The idempotency key. Two jobs with the same key are the same job. */
  jobId: string;
  kind: JobKind;
  /** The source this job acts on, when it acts on one. */
  sourceId: string | null;
  marketId: string;
  state: JobState;
  /** ISO timestamps. */
  queuedUtc: string;
  startedUtc: string | null;
  finishedUtc: string | null;
  result: JobResult | null;
  /** What the run actually observed. */
  documentsDiscovered: number;
  documentsProcessed: number;
  duplicatesSkipped: number;
  /** Errors and the retry count, so a repeated failure is visible. */
  error: string | null;
  retryCount: number;
  /** When this job may next run, after a backoff. */
  nextAttemptUtc: string | null;
  /**
   * The latest VERIFIED source check time. A failed run never advances it.
   */
  latestVerifiedCheckUtc: string | null;
  /** How fresh the data is, in plain language. */
  freshness: string | null;
  /** True when the run failed, for quick filtering. */
  failed: boolean;
};

export type JobDefinition = {
  kind: JobKind;
  sourceId: string | null;
  marketId: string;
  /** Extra key parts, so two discovery runs for different companies differ. */
  scope?: string;
  /** The scheduled frequency, in minutes. */
  intervalMinutes: number;
  /** The maximum number of retries before the job is dead-lettered. */
  maxRetries: number;
};

/**
 * The idempotency key. A job is identified by what it acts on and for which
 * scope, so re-queueing the same work is a no-op rather than a second job.
 */
export function idempotencyKey(definition: Pick<JobDefinition, "kind" | "sourceId" | "marketId" | "scope">): string {
  return [definition.kind, definition.marketId, definition.sourceId ?? "all", definition.scope ?? "default"].join("::");
}

/** A run's outcome, as a job reports it. */
export type JobOutcome = {
  result: JobResult;
  documentsDiscovered?: number;
  documentsProcessed?: number;
  duplicatesSkipped?: number;
  error?: string | null;
  /** The check time to record, ONLY on a genuinely successful check. */
  verifiedCheckUtc?: string | null;
};
