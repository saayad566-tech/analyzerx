/**
 * Push delivery orchestration.
 *
 * Reads device tokens in cursor order, sends them in provider-sized pages, classifies the result,
 * retries transient failures with backoff + jitter, and deactivates tokens the provider reports as
 * unregistered. Nothing here charges money: the Expo transport and FCM HTTP v1 are both free.
 *
 * The HTTP transport is injected, so the entire delivery loop — paging, retry, classification,
 * dead-token cleanup — is unit-testable with a stub transport and no network.
 */
import {
  EXPO_PUSH_BATCH_SIZE,
  FCM_SEND_CONCURRENCY,
  MAX_PUSH_PAGES,
  classifyExpoTickets,
  classifyFcmMessage,
  chunkTokens,
  emptyOutcome,
  isRetryableStatus,
  mergeOutcomes,
  pushBackoffMs,
  pushBatchLimit,
  retryAfterMs,
  tokenMatchesProvider,
  type PushBatchOutcome,
  type PushProvider,
} from "./push-batching";

export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
export const FCM_SEND_URL = (projectId: string) => `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`;

export type PushNotification = {
  title: string;
  body: string;
  /** Extra data carried with the push. FCM requires string values; they are coerced. */
  data?: Record<string, unknown>;
};

export type PushHttpResponse = {
  ok: boolean;
  status: number;
  headers?: { get(name: string): string | null };
  json?: () => Promise<unknown>;
};

export type PushTransport = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<PushHttpResponse>;

export type Sleep = (ms: number) => Promise<void>;
const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export type RetryOptions = { attempts?: number; sleep?: Sleep; isRetryable?: (error: unknown) => boolean; onRetry?: (attempt: number, delayMs: number, reason: string) => void };

/**
 * Run `fn`, retrying transient failures with exponential backoff + jitter.
 * `fn` should signal a retryable failure by throwing an error carrying `retryable = true`.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, Math.floor(options.attempts ?? 3));
  const sleep = options.sleep ?? realSleep;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const retryable = options.isRetryable ? options.isRetryable(error) : isRetryableError(error);
      if (!retryable || attempt === attempts) throw error;
      const delay = retryDelayFrom(error) ?? pushBackoffMs(attempt);
      options.onRetry?.(attempt, delay, error instanceof Error ? error.message : String(error));
      await sleep(delay);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** An error that knows whether it is worth retrying, and how long to wait. */
export class PushRequestError extends Error {
  constructor(message: string, readonly retryable: boolean, readonly retryAfterMs: number | null = null, readonly status: number | null = null) {
    super(message);
    this.name = "PushRequestError";
  }
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof PushRequestError) return error.retryable;
  // Unknown errors (network, DNS, abort) are treated as transient.
  return true;
}

function retryDelayFrom(error: unknown): number | null {
  return error instanceof PushRequestError ? error.retryAfterMs : null;
}

function asStringData(data: Record<string, unknown> | undefined): Record<string, string> | undefined {
  if (!data) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) out[key] = typeof value === "string" ? value : JSON.stringify(value);
  return out;
}

/** Send one page of Expo tokens. */
export async function sendExpoPage(transport: PushTransport, tokens: string[], notification: PushNotification, options: RetryOptions = {}): Promise<PushBatchOutcome> {
  if (tokens.length === 0) return emptyOutcome();
  const body = JSON.stringify(tokens.map((to) => ({ to, sound: "default", title: notification.title, body: notification.body, data: notification.data ?? {} })));
  let response: PushHttpResponse;
  try {
    response = await withRetry(async () => {
      const result = await transport(EXPO_PUSH_URL, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body });
      if (!result.ok && isRetryableStatus(result.status)) {
        throw new PushRequestError(`Expo push returned HTTP ${result.status}`, true, retryAfterMs(result.headers?.get("retry-after") ?? null), result.status);
      }
      return result;
    }, options);
  } catch (error) {
    const outcome = emptyOutcome();
    const retryable = isRetryableError(error);
    outcome.errors.push(error instanceof Error ? error.message : String(error));
    (retryable ? outcome.retryableTokens : outcome.failedTokens).push(...tokens);
    return outcome;
  }
  if (!response.ok) {
    const outcome = emptyOutcome();
    outcome.errors.push(`Expo push returned HTTP ${response.status}`);
    (isRetryableStatus(response.status) ? outcome.retryableTokens : outcome.failedTokens).push(...tokens);
    return outcome;
  }
  let payload: unknown = null;
  try {
    payload = response.json ? await response.json() : null;
  } catch {
    payload = null;
  }
  return classifyExpoTickets(tokens, payload);
}

/** Send one page of FCM tokens, with bounded concurrency and per-token retry. */
export async function sendFcmPage(
  transport: PushTransport,
  tokens: string[],
  notification: PushNotification,
  options: RetryOptions & { accessToken: string; projectId: string; concurrency?: number } ,
): Promise<PushBatchOutcome> {
  if (tokens.length === 0) return emptyOutcome();
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? FCM_SEND_CONCURRENCY));
  const url = FCM_SEND_URL(options.projectId);
  const data = asStringData(notification.data);
  const outcome = emptyOutcome();

  for (const group of chunkTokens(tokens, concurrency)) {
    const settled = await Promise.all(
      group.map(async (token) => {
        const message: Record<string, unknown> = { token, notification: { title: notification.title, body: notification.body } };
        if (data) message.data = data;
        try {
          const response = await withRetry(async () => {
            const result = await transport(url, { method: "POST", headers: { Authorization: `Bearer ${options.accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ message }) });
            if (isRetryableStatus(result.status)) {
              throw new PushRequestError(`FCM returned HTTP ${result.status}`, true, retryAfterMs(result.headers?.get("retry-after") ?? null), result.status);
            }
            return result;
          }, options);
          let body: unknown = null;
          try {
            body = response.json ? await response.json() : null;
          } catch {
            body = null;
          }
          return { token, result: classifyFcmMessage(response.status, body) };
        } catch (error) {
          return { token, result: { status: "retryable" as const, reason: error instanceof Error ? error.message : String(error) } };
        }
      }),
    );
    for (const { token, result } of settled) {
      if (result.status === "delivered") outcome.delivered += 1;
      else if (result.status === "dead") outcome.deadTokens.push(token);
      else if (result.status === "retryable") outcome.retryableTokens.push(token);
      else outcome.invalidTokens.push(token);
      if (result.status !== "delivered" && !outcome.errors.includes(result.reason)) outcome.errors.push(result.reason);
    }
  }
  return outcome;
}

export type DeliverySummary = PushBatchOutcome & {
  provider: PushProvider;
  pages: number;
  /** Tokens the provider reported as unregistered and that were deactivated in the store. */
  deactivated: number;
  /** True when nothing was sent because no token matched the provider. */
  noRecipients: boolean;
};

export type DeliveryDeps = {
  provider: PushProvider;
  transport: PushTransport;
  /** Read one cursor page of enabled tokens, ordered ascending by token. */
  readPage: (cursor: string | null, limit: number) => Promise<{ token: string }[]>;
  /** Mark tokens as no longer enabled. Returns how many rows changed. */
  deactivate: (tokens: string[]) => Promise<number>;
  notification: PushNotification;
  /** FCM only. */
  accessToken?: string;
  projectId?: string;
  maxPages?: number;
  concurrency?: number;
  sleep?: Sleep;
  retry?: RetryOptions;
  onLog?: (level: "info" | "warning" | "error", message: string) => void;
};

/**
 * Deliver one notification to every registered device, in bounded pages.
 *
 * Cursor pagination (not offset) is used so deactivating dead tokens mid-run can never cause a
 * later page to skip a live device.
 */
export async function deliverPush(deps: DeliveryDeps): Promise<DeliverySummary> {
  const limit = pushBatchLimit(deps.provider);
  const maxPages = Math.max(1, Math.floor(deps.maxPages ?? MAX_PUSH_PAGES));
  const summary: DeliverySummary = { ...emptyOutcome(), provider: deps.provider, pages: 0, deactivated: 0, noRecipients: true };
  let cursor: string | null = null;

  for (let page = 0; page < maxPages; page += 1) {
    let rows: { token: string }[];
    try {
      rows = await deps.readPage(cursor, limit);
    } catch (error) {
      summary.errors.push(`Could not read the push-token page: ${error instanceof Error ? error.message : String(error)}`);
      deps.onLog?.("error", "Push delivery stopped: the device-token page could not be read.");
      break;
    }
    if (rows.length === 0) break;
    summary.pages += 1;
    // Advance the cursor before sending, so a failed send can never stall the loop.
    cursor = rows[rows.length - 1].token;

    const tokens = rows.map((row) => row.token).filter((token) => tokenMatchesProvider(token, deps.provider));
    if (tokens.length > 0) {
      summary.noRecipients = false;
      let outcome: PushBatchOutcome;
      if (deps.provider === "fcm" && deps.accessToken && deps.projectId) {
        outcome = await sendFcmPage(deps.transport, tokens, deps.notification, { ...deps.retry, sleep: deps.sleep, accessToken: deps.accessToken, projectId: deps.projectId, concurrency: deps.concurrency });
      } else if (deps.provider === "expo") {
        outcome = await sendExpoPage(deps.transport, tokens, deps.notification, { ...deps.retry, sleep: deps.sleep });
      } else {
        outcome = emptyOutcome();
        outcome.errors.push("FCM is selected but no access token or project id is available.");
        outcome.retryableTokens.push(...tokens);
      }
      const merged = mergeOutcomes(summary, outcome);
      Object.assign(summary, merged);
    }

    if (rows.length < limit) break;
  }

  if (summary.deadTokens.length > 0) {
    try {
      summary.deactivated = await deps.deactivate(summary.deadTokens);
      deps.onLog?.("info", `Deactivated ${summary.deactivated} push token(s) the push service reported as unregistered.`);
    } catch (error) {
      summary.errors.push(`Could not deactivate dead tokens: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return summary;
}

/** Convenience: the batch size a provider uses, exposed for callers that log it. */
export function providerBatchSize(provider: PushProvider): number {
  return provider === "expo" ? EXPO_PUSH_BATCH_SIZE : pushBatchLimit(provider);
}
