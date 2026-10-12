/**
 * Notifications (Prompt 5, section 5).
 *
 * Optional, opt-in, deduplicated and user-controlled. A notification is only
 * planned when the user has asked for that kind, and a document is never
 * announced twice, because a duplicate notification is the fastest way to make
 * a user switch notifications off entirely.
 */

export type NotificationKind = "new_filing" | "processing_failure";

export type NotificationPreferences = {
  enabled: boolean;
  newFilings: boolean;
  processingFailures: boolean;
  /** Markets the user wants to hear about. Empty means all selected markets. */
  marketIds: string[];
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: false, // opt-in, so nothing is sent until the user asks
  newFilings: true,
  processingFailures: true,
  marketIds: [],
};

export type PlannedNotification = {
  kind: NotificationKind;
  /** The deduplication key, so the same event is never announced twice. */
  dedupeKey: string;
  title: string;
  body: string;
  marketId: string;
  sourceId: string | null;
  createdAtUtc: string;
};

export type NotificationPlan = {
  notifications: PlannedNotification[];
  /** What was suppressed, and why. */
  suppressed: { dedupeKey: string; reason: string }[];
};

/**
 * Plan the notifications for a set of events.
 *
 * A disabled preference suppresses silently, a duplicate key is suppressed with
 * its reason recorded, and a market the user did not ask for is suppressed too.
 */
export function planNotifications(
  events: { kind: NotificationKind; marketId: string; sourceId: string | null; title: string; body: string; dedupeKey: string }[],
  preferences: NotificationPreferences,
  alreadySent: Iterable<string>,
  now = new Date(),
): NotificationPlan {
  const sent = new Set(alreadySent);
  const notifications: PlannedNotification[] = [];
  const suppressed: { dedupeKey: string; reason: string }[] = [];

  if (!preferences.enabled) {
    return { notifications: [], suppressed: events.map((event) => ({ dedupeKey: event.dedupeKey, reason: "Notifications are switched off." })) };
  }

  for (const event of events) {
    if (event.kind === "new_filing" && !preferences.newFilings) {
      suppressed.push({ dedupeKey: event.dedupeKey, reason: "The user has not opted in to new-filing notifications." });
      continue;
    }
    if (event.kind === "processing_failure" && !preferences.processingFailures) {
      suppressed.push({ dedupeKey: event.dedupeKey, reason: "The user has not opted in to failure notifications." });
      continue;
    }
    if (preferences.marketIds.length && !preferences.marketIds.includes(event.marketId)) {
      suppressed.push({ dedupeKey: event.dedupeKey, reason: `The user has not asked for notifications from market ${event.marketId}.` });
      continue;
    }
    if (sent.has(event.dedupeKey)) {
      suppressed.push({ dedupeKey: event.dedupeKey, reason: "This event has already been announced." });
      continue;
    }
    sent.add(event.dedupeKey);
    notifications.push({
      kind: event.kind,
      dedupeKey: event.dedupeKey,
      title: event.title,
      body: event.body,
      marketId: event.marketId,
      sourceId: event.sourceId,
      createdAtUtc: now.toISOString(),
    });
  }

  return { notifications, suppressed };
}

/**
 * The deduplication key for a new filing.
 * Derived from the filing's own identity, so the same filing announced from two
 * paths still produces one notification.
 */
export function filingNotificationKey(sourceId: string, documentId: string | null, sha256: string | null): string {
  return `filing::${sourceId}::${documentId ?? sha256 ?? "unknown"}`;
}

/** The deduplication key for a failure, scoped to the job so a retry re-announces once. */
export function failureNotificationKey(jobId: string, retryCount: number): string {
  return `failure::${jobId}::${retryCount}`;
}

/** A notification for a newly discovered filing. */
export function newFilingNotification(input: {
  marketId: string;
  sourceId: string;
  companyName: string | null;
  title: string;
  publishedAt: string | null;
  documentId: string | null;
  sha256: string | null;
}): { kind: NotificationKind; marketId: string; sourceId: string; title: string; body: string; dedupeKey: string } {
  return {
    kind: "new_filing",
    marketId: input.marketId,
    sourceId: input.sourceId,
    title: input.companyName ? `New filing: ${input.companyName}` : "New filing",
    body: `${input.title}${input.publishedAt ? ` — published ${input.publishedAt}` : ""}`,
    dedupeKey: filingNotificationKey(input.sourceId, input.documentId, input.sha256),
  };
}

/**
 * A notification for a material failure.
 *
 * Only a dead-lettered job is material enough to notify; a job that will retry
 * is not, because a retry that succeeds would make the alert noise.
 */
export function processingFailureNotification(input: {
  marketId: string;
  sourceId: string | null;
  jobId: string;
  retryCount: number;
  error: string;
}): { kind: NotificationKind; marketId: string; sourceId: string | null; title: string; body: string; dedupeKey: string } {
  return {
    kind: "processing_failure",
    marketId: input.marketId,
    sourceId: input.sourceId,
    title: "A filing check failed",
    body: `${input.sourceId ?? "A source"} could not be checked after ${input.retryCount} attempts: ${input.error}`,
    dedupeKey: failureNotificationKey(input.jobId, input.retryCount),
  };
}
