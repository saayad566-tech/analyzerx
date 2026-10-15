/**
 * Push batching, provider selection and error classification — pure core.
 *
 * Two free transports are supported and neither costs anything to run:
 *   - `expo`  — Expo's push service (`exp.host`), the transport AnalyzerX already used.
 *   - `fcm`   — Firebase Cloud Messaging HTTP v1, which needs the operator's own Firebase
 *               service-account credentials but has no per-message charge.
 *
 * Everything here is pure and dependency-free so the delivery arithmetic and error classification
 * are unit-testable without a database, a network or a device.
 */

export type PushProvider = "expo" | "fcm";

/** Maximum messages per request, per provider (their documented limits). */
export const PUSH_BATCH_LIMIT: Record<PushProvider, number> = { expo: 100, fcm: 500 };

/** Expo rejects a request carrying more than this many messages. */
export const EXPO_PUSH_BATCH_SIZE = PUSH_BATCH_LIMIT.expo;

/** FCM HTTP v1 messages are sent one per token; this is the page size we schedule them in. */
export const FCM_PAGE_SIZE = PUSH_BATCH_LIMIT.fcm;

/** How many FCM sends may be in flight at once inside a page. */
export const FCM_SEND_CONCURRENCY = 20;

/** Safety bound on how many pages a single notification will page through. */
export const MAX_PUSH_PAGES = 1_000;

/** Upper bound on how many tokens one page may read. */
export const PUSH_TOKEN_PAGE_LIMIT_MAX = 1_000;

/** Default page size for a token read. */
export const PUSH_TOKEN_PAGE_LIMIT_DEFAULT = 500;

/** Maximum backoff delay for a retried push request. */
export const PUSH_MAX_BACKOFF_MS = 8_000;

// --- provider selection -------------------------------------------------------------------------

/**
 * Choose the free transport to use. FCM is used only when the operator has configured Firebase
 * credentials; otherwise the free Expo service is used. There is no paid path.
 */
export function selectPushProvider(config: { fcmConfigured: boolean }): PushProvider {
  return config.fcmConfigured ? "fcm" : "expo";
}

export function pushBatchLimit(provider: PushProvider): number {
  return PUSH_BATCH_LIMIT[provider] ?? EXPO_PUSH_BATCH_SIZE;
}

// --- token shape --------------------------------------------------------------------------------

/** Expo device tokens look like `ExponentPushToken[xxxxxxxx]`. */
export function isExpoPushToken(token: string): boolean {
  return token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[");
}

/**
 * FCM registration tokens are long opaque strings of URL-safe characters. Anything that is clearly
 * an Expo token, or too short to be a registration token, is rejected rather than sent and failed.
 */
export function isFcmToken(token: string): boolean {
  return token.length >= 20 && !isExpoPushToken(token) && /^[A-Za-z0-9_:.\-]+$/.test(token);
}

export function tokenMatchesProvider(token: string, provider: PushProvider): boolean {
  return provider === "expo" ? isExpoPushToken(token) : isFcmToken(token);
}

// --- paging arithmetic --------------------------------------------------------------------------

/** Clamp a limit: a missing or unparseable value falls back; an out-of-range one is bounded. */
function clampLimit(value: number | undefined): number {
  if (value === undefined || Number.isNaN(value)) return PUSH_TOKEN_PAGE_LIMIT_DEFAULT;
  if (value === Number.POSITIVE_INFINITY) return PUSH_TOKEN_PAGE_LIMIT_MAX;
  if (value === Number.NEGATIVE_INFINITY) return 1;
  return Math.min(PUSH_TOKEN_PAGE_LIMIT_MAX, Math.max(1, Math.floor(value)));
}

/** Clamp an offset: never negative, never non-finite (both fall back to the first page). */
function clampOffset(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

/** Clamp caller-supplied paging into a safe range (never zero, never negative, never unbounded). */
export function normalizePushTokenPage(options: { limit?: number; offset?: number } = {}): { limit: number; offset: number } {
  return { limit: clampLimit(options.limit), offset: clampOffset(options.offset) };
}

/** The offset for a given page index (0-based). */
export function pageOffset(page: number, pageSize = EXPO_PUSH_BATCH_SIZE): number {
  const safePage = Number.isFinite(page) ? Math.max(0, Math.floor(page)) : 0;
  return safePage * pageSize;
}

/** Split tokens into pages of at most `pageSize`. */
export function chunkTokens(tokens: string[], pageSize: number): string[][] {
  const size = Number.isFinite(pageSize) ? Math.max(1, Math.floor(pageSize)) : EXPO_PUSH_BATCH_SIZE;
  const pages: string[][] = [];
  for (let i = 0; i < tokens.length; i += size) pages.push(tokens.slice(i, i + size));
  return pages;
}

// --- backoff ------------------------------------------------------------------------------------

/** Exponential backoff with jitter, capped. `attempt` is 1-based. */
export function pushBackoffMs(attempt: number, cap = PUSH_MAX_BACKOFF_MS): number {
  const safeAttempt = Number.isFinite(attempt) ? Math.max(1, Math.floor(attempt)) : 1;
  const base = Math.min(cap, 500 * 2 ** (safeAttempt - 1));
  return base + Math.floor(Math.random() * 250);
}

/** Parse a `Retry-After` header (seconds or HTTP date) into a capped delay, or null. */
export function retryAfterMs(headerValue: string | null | undefined, cap = PUSH_MAX_BACKOFF_MS): number | null {
  if (!headerValue) return null;
  const seconds = Number(headerValue);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, cap);
  const date = Date.parse(headerValue);
  if (Number.isFinite(date)) return Math.min(Math.max(0, date - Date.now()), cap);
  return null;
}

/** True for the transient HTTP classes that are worth retrying. */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || (status >= 500 && status <= 599);
}

// --- outcomes -----------------------------------------------------------------------------------

/** The result of sending one page of tokens. */
export type PushBatchOutcome = {
  /** Tokens the provider accepted. */
  delivered: number;
  /** Tokens the provider says are no longer registered — safe to deactivate. */
  deadTokens: string[];
  /** Tokens that failed transiently — worth another attempt later. */
  retryableTokens: string[];
  /** Tokens that are permanently unusable (malformed, wrong project). */
  invalidTokens: string[];
  /** Tokens that failed for an unclassified reason. */
  failedTokens: string[];
  /** Human-readable, non-identifying reasons. */
  errors: string[];
};

export function emptyOutcome(): PushBatchOutcome {
  return { delivered: 0, deadTokens: [], retryableTokens: [], invalidTokens: [], failedTokens: [], errors: [] };
}

export function mergeOutcomes(...outcomes: PushBatchOutcome[]): PushBatchOutcome {
  const merged = emptyOutcome();
  for (const outcome of outcomes) {
    merged.delivered += outcome.delivered;
    merged.deadTokens.push(...outcome.deadTokens);
    merged.retryableTokens.push(...outcome.retryableTokens);
    merged.invalidTokens.push(...outcome.invalidTokens);
    merged.failedTokens.push(...outcome.failedTokens);
    merged.errors.push(...outcome.errors);
  }
  return merged;
}

/** Expo error codes that mean the device will never accept a push again. */
const EXPO_DEAD_CODES = new Set(["DeviceNotRegistered"]);
/** Expo error codes that are worth retrying. */
const EXPO_RETRYABLE_CODES = new Set(["MessageRateExceeded", "DeviceMessageRateExceeded", "MessageTooBig"]);

type ExpoTicket = { status?: unknown; id?: unknown; message?: unknown; details?: { error?: unknown } | null };

/**
 * Classify an Expo push response.
 *
 * Expo answers HTTP 200 with a positional `data` array, one ticket per submitted token. A ticket
 * with `details.error === "DeviceNotRegistered"` means that token is dead and must be deactivated.
 */
export function classifyExpoTickets(tokens: string[], payload: unknown): PushBatchOutcome {
  const outcome = emptyOutcome();
  const data = (payload && typeof payload === "object" && "data" in payload ? (payload as { data?: unknown }).data : undefined);
  const tickets: ExpoTicket[] = Array.isArray(data) ? (data as ExpoTicket[]) : data && typeof data === "object" ? [data as ExpoTicket] : [];
  if (tickets.length === 0) {
    outcome.errors.push("The push service returned no tickets.");
    outcome.failedTokens.push(...tokens);
    return outcome;
  }
  for (let i = 0; i < tokens.length; i += 1) {
    const ticket = tickets[i];
    if (!ticket) {
      outcome.failedTokens.push(tokens[i]);
      continue;
    }
    if (ticket.status === "ok") {
      outcome.delivered += 1;
      continue;
    }
    const code = typeof ticket.details?.error === "string" ? ticket.details.error : typeof ticket.message === "string" ? ticket.message : "";
    if (EXPO_DEAD_CODES.has(code)) outcome.deadTokens.push(tokens[i]);
    else if (EXPO_RETRYABLE_CODES.has(code)) outcome.retryableTokens.push(tokens[i]);
    else outcome.failedTokens.push(tokens[i]);
    if (code && !outcome.errors.includes(code)) outcome.errors.push(code);
  }
  return outcome;
}

/** FCM error codes that mean the device will never accept a push again. */
const FCM_DEAD_CODES = new Set(["UNREGISTERED", "NOT_REGISTERED"]);
/** FCM error codes that are worth retrying. */
const FCM_RETRYABLE_CODES = new Set(["UNAVAILABLE", "INTERNAL", "QUOTA_EXCEEDED", "DEVICE_MESSAGE_RATE_EXCEEDED", "TOPIC_MESSAGE_RATE_EXCEEDED"]);

export type FcmMessageResult =
  | { status: "delivered" }
  | { status: "dead"; reason: string }
  | { status: "retryable"; reason: string }
  | { status: "invalid"; reason: string };

/**
 * Classify a single FCM HTTP v1 response.
 *
 * FCM returns HTTP 200 with a message `name` on success, or an error body whose `details` carries
 * an `errorCode` (e.g. `UNREGISTERED`). HTTP status is also considered, because a 404 with
 * `UNREGISTERED` is how FCM reports a removed installation.
 */
export function classifyFcmMessage(httpStatus: number, body: unknown): FcmMessageResult {
  const errorCode = extractFcmErrorCode(body);
  if (errorCode && FCM_DEAD_CODES.has(errorCode)) return { status: "dead", reason: errorCode };
  if (errorCode && FCM_RETRYABLE_CODES.has(errorCode)) return { status: "retryable", reason: errorCode };
  if (httpStatus === 404 && errorCode === null) return { status: "dead", reason: "NOT_FOUND" };
  if (errorCode) return { status: "invalid", reason: errorCode };
  if (isRetryableStatus(httpStatus)) return { status: "retryable", reason: `HTTP ${httpStatus}` };
  if (httpStatus >= 200 && httpStatus < 300) return { status: "delivered" };
  return { status: "invalid", reason: `HTTP ${httpStatus}` };
}

/** Pull `details[].errorCode` (or `error.status`) out of an FCM error body. */
export function extractFcmErrorCode(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const error = (body as { error?: unknown }).error;
  if (!error || typeof error !== "object") return null;
  const details = (error as { details?: unknown }).details;
  if (Array.isArray(details)) {
    for (const detail of details) {
      const code = detail && typeof detail === "object" ? (detail as { errorCode?: unknown }).errorCode : undefined;
      if (typeof code === "string" && code) return code;
    }
  }
  const status = (error as { status?: unknown }).status;
  return typeof status === "string" && status ? status : null;
}
