/**
 * Deployment and recovery runbook (Prompt 5, acceptance criteria).
 *
 * A runbook is only useful if it says what to do when something breaks, so
 * every entry names the symptom, the immediate action, the recovery step and
 * how to confirm the system is healthy again.
 *
 * Nothing here invents an endpoint or a provider. Where a step depends on a
 * credential or a host that is not present, it says so.
 */

export type RunbookEntry = {
  id: string;
  title: string;
  symptom: string;
  immediateAction: string[];
  recovery: string[];
  confirmation: string;
  /** True when the step needs something the build does not have. */
  dependency: string | null;
};

export const RUNBOOK: RunbookEntry[] = [
  {
    id: "source_outage",
    title: "A source is unreachable",
    symptom: "A health check or discovery job fails with a network error or a non-2xx status.",
    immediateAction: [
      "Do not retry immediately; the engine has already scheduled a backoff with jitter.",
      "Check the coverage matrix: the source's last error and its last verified check are shown separately.",
    ],
    recovery: [
      "The engine retries up to the job's maximum, then dead-letters the job and reports it.",
      "The last verified check time is NOT advanced by a failure, so the source is shown as stale rather than healthy.",
      "If the failure persists, use the source's manual fallback from the coverage matrix.",
    ],
    confirmation: "A later job succeeds and the source's verified check time advances.",
    dependency: null,
  },
  {
    id: "throttling",
    title: "A source throttles the app",
    symptom: "HTTP 429, or repeated timeouts under load.",
    immediateAction: [
      "Stop the run; the rate limiter already refuses a request that would exceed the documented limit.",
      "If the source sent Retry-After, that value is honoured rather than the exponential delay.",
    ],
    recovery: [
      "Lower the cadence for that source's tier, or switch it to user-initiated only.",
      "Never rotate identities, keys or addresses to get around a limit.",
    ],
    confirmation: "Requests succeed again at the reduced cadence with no 429s.",
    dependency: null,
  },
  {
    id: "rate_limit_misconfigured",
    title: "A source's documented limit changes",
    symptom: "429s begin after a period of normal operation, or a source publishes new terms.",
    immediateAction: ["Reduce the tier's cadence to the new documented limit before the next run."],
    recovery: [
      "Update the source's rate-limit note and its schedule tier in the registry.",
      "Re-review the source's terms and record the review date.",
    ],
    confirmation: "The source returns 200s at the new cadence.",
    dependency: null,
  },
  {
    id: "process_termination",
    title: "Android terminates the process mid-run",
    symptom: "Jobs are left in the running state after the app is reopened.",
    immediateAction: ["The app recovers stuck jobs on the next launch; nothing needs to be done by hand."],
    recovery: [
      "A job left running beyond the staleness window is reset to failed with its retry count incremented.",
      "A partially downloaded document is discarded rather than parsed, because its bytes are incomplete.",
    ],
    confirmation: "No job remains in the running state after a launch, and the affected job retries.",
    dependency: null,
  },
  {
    id: "interrupted_download",
    title: "A document download is interrupted",
    symptom: "A retrieval job fails part-way, or a stored document's hash does not match.",
    immediateAction: ["Discard the partial bytes; never parse a document that was not fully retrieved."],
    recovery: ["The retrieval job retries on its backoff schedule and re-downloads from the source."],
    confirmation: "The document's recorded byte length and SHA-256 match the source's.",
    dependency: null,
  },
  {
    id: "duplicate_jobs",
    title: "The same work is queued twice",
    symptom: "Two requests for the same source and scope arrive close together.",
    immediateAction: ["Nothing; the idempotency key makes the second enqueue a no-op."],
    recovery: ["If a duplicate document is processed anyway, duplicate suppression by identity and hash skips it."],
    confirmation: "The job list shows one job per key, and the duplicates-skipped count rises.",
    dependency: null,
  },
  {
    id: "bad_extraction",
    title: "An extraction is wrong or incomplete",
    symptom: "The extraction quality is partial, garbled or unextractable, or a table is truncated.",
    immediateAction: ["Withhold any claim that depends on the unreadable portion, and mark the report incomplete."],
    recovery: [
      "When the parser version changes, the store queues every document extracted by the older version for reprocessing.",
      "The original bytes are retained, so reprocessing does not need a re-download.",
    ],
    confirmation: "The reprocessed extraction reports a clean quality and the withheld claims either validate or stay withheld with a reason.",
    dependency: null,
  },
  {
    id: "stale_source",
    title: "A source has not been checked successfully for a long time",
    symptom: "The coverage matrix shows the source as stale.",
    immediateAction: ["Do not present its data as fresh; the freshness line states the last verified check."],
    recovery: [
      "Run a manual refresh for that market.",
      "If it still fails, use the manual fallback and record the import.",
    ],
    confirmation: "The verified check time advances and the source returns to connected.",
    dependency: null,
  },
  {
    id: "invalid_response",
    title: "A source returns an invalid response",
    symptom: "A content-type mismatch, a body that is not the expected format, or a truncated payload.",
    immediateAction: ["Reject the response; do not parse it as if it were valid."],
    recovery: [
      "The format detector compares the declared content type with the file signature and reports a disagreement.",
      "A body over the size ceiling is discarded rather than processed.",
    ],
    confirmation: "The next run returns a response the detector accepts.",
    dependency: null,
  },
  {
    id: "credential_expiry",
    title: "A credential expires",
    symptom: "HTTP 401 from a source that requires authentication.",
    immediateAction: ["Mark the source blocked; a 401 is an access decision, not a transient failure, so it is not retried."],
    recovery: [
      "Replace the credential in the place it is configured. It is never stored in the client.",
      "If the source needs a key and no key may live in the app, the source stays blocked until a backend or a user-supplied key exists.",
    ],
    confirmation: "The source returns 200 and its verified check time advances.",
    dependency: "Sources requiring an api-key need a place to hold it that is not the client bundle.",
  },
  {
    id: "incorrect_report",
    title: "A published report is wrong",
    symptom: "A claim is traced to evidence that does not support it, or a figure is wrong.",
    immediateAction: ["Withhold the affected claim and mark the report incomplete rather than editing the figure."],
    recovery: [
      "Re-run validation; a claim that fails is withheld with its reasons recorded in the evidence audit.",
      "Re-run extraction if the error came from the parser.",
    ],
    confirmation: "The evidence audit lists the withheld claim with a reason, and no unsupported claim is published.",
    dependency: null,
  },
  {
    id: "deployment",
    title: "Deploying a new build",
    symptom: "Not a fault; the release procedure.",
    immediateAction: [
      "Run the type check and the test suite before pushing.",
      "Push the changed files, let CI build and sign the APK, and verify the artifact's SHA-256 against the published checksum.",
    ],
    recovery: ["If CI fails, read the failing step; the build is not published unless every step passes."],
    confirmation: "The published checksum matches the artifact byte for byte.",
    dependency: null,
  },
];

export function runbookEntry(id: string): RunbookEntry | undefined {
  return RUNBOOK.find((entry) => entry.id === id);
}

/** Render the runbook as plain text, for a documentation screen or a file. */
export function renderRunbook(): string {
  const lines: string[] = ["ANALYZERX MONITORING RUNBOOK", ""];
  for (const entry of RUNBOOK) {
    lines.push(`${entry.title}`);
    lines.push(`  Symptom:  ${entry.symptom}`);
    lines.push(`  Do now:   ${entry.immediateAction.join(" ")}`);
    lines.push(`  Recover:  ${entry.recovery.join(" ")}`);
    lines.push(`  Confirm:  ${entry.confirmation}`);
    if (entry.dependency) lines.push(`  Needs:    ${entry.dependency}`);
    lines.push("");
  }
  return lines.join("\n");
}

/** The runbook's stated limits, so the documentation does not overstate them. */
export const RUNBOOK_LIMITS = [
  "No step in this runbook requires a paid service.",
  "No step rotates an identity, a key or an address to defeat a source's limits.",
  "Monitoring while the app is closed is not available, and no runbook step pretends otherwise.",
  "Where a step needs a credential the build does not have, it is marked as a dependency rather than assumed.",
];
