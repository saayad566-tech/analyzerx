/**
 * HTTP transport for the resource-pack runtime.
 *
 * Uses the global `fetch` available in React Native, web, and Node, wrapped with a hard timeout,
 * bounded retries with exponential backoff and jitter, and `Retry-After` handling for 429/503.
 * Every failure is surfaced as a typed {@link TransportError} so the installer can decide whether
 * to retry, fall back to a mirror, or report an honest failure.
 */
import { bytesToUtf8 } from "./bytes";

export class TransportError extends Error {
  constructor(message: string, readonly status: number | null, readonly url: string, readonly retryable: boolean) {
    super(message);
    this.name = "TransportError";
  }
}

export type GetBytesOptions = {
  timeoutMs?: number;
  retries?: number;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** Called before each retry with the attempt number (1-based) and the delay in ms. */
  onRetry?: (attempt: number, delayMs: number, reason: string) => void;
};

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRIES = 3;
const MAX_BACKOFF_MS = 8_000;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function backoffMs(attempt: number): number {
  const base = Math.min(MAX_BACKOFF_MS, 500 * 2 ** (attempt - 1));
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || (status >= 500 && status <= 599);
}

function retryAfterMs(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, MAX_BACKOFF_MS);
  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.min(Math.max(0, date - Date.now()), MAX_BACKOFF_MS);
  return null;
}

/** GET a URL and return its bytes. Retries transient failures. */
export async function getBytes(url: string, options: GetBytesOptions = {}): Promise<Uint8Array> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAttempts = (options.retries ?? DEFAULT_RETRIES) + 1;
  let lastError: TransportError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const onExternalAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onExternalAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { method: "GET", signal: controller.signal, headers: options.headers });
      if (!response.ok) {
        const retryable = isRetryableStatus(response.status);
        const error = new TransportError(`HTTP ${response.status} for ${url}`, response.status, url, retryable);
        if (!retryable || attempt === maxAttempts) throw error;
        lastError = error;
        const delay = retryAfterMs(response) ?? backoffMs(attempt);
        options.onRetry?.(attempt, delay, `HTTP ${response.status}`);
        await sleep(delay, options.signal);
        continue;
      }
      const buffer = await response.arrayBuffer();
      return new Uint8Array(buffer);
    } catch (caught) {
      if (options.signal?.aborted) throw caught;
      const isAbort = caught instanceof Error && caught.name === "AbortError";
      const error = caught instanceof TransportError ? caught : new TransportError(isAbort ? `Request timed out after ${timeoutMs} ms` : (caught instanceof Error ? caught.message : String(caught)), null, url, true);
      if (!error.retryable || attempt === maxAttempts) throw error;
      lastError = error;
      const delay = backoffMs(attempt);
      options.onRetry?.(attempt, delay, error.message);
      await sleep(delay, options.signal);
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onExternalAbort);
    }
  }
  throw lastError ?? new TransportError(`Request to ${url} failed`, null, url, false);
}

/** GET a URL and parse it as JSON. */
export async function getJson<T = unknown>(url: string, options: GetBytesOptions = {}): Promise<T> {
  const bytes = await getBytes(url, options);
  try {
    return JSON.parse(bytesToUtf8(bytes)) as T;
  } catch (caught) {
    throw new TransportError(`Response from ${url} was not valid JSON: ${caught instanceof Error ? caught.message : String(caught)}`, null, url, false);
  }
}
