const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 8;
const MAX_BACKOFF_MS = 10 * 60_000;
let windowStartedAt = Date.now();
let requestsInWindow = 0;
let consecutiveFailures = 0;
let nextAllowedAt = 0;
let lastStatus: number | null = null;
let lastError: string | null = null;
let lastRequestAt: string | null = null;

function refreshWindow(now = Date.now()) {
  if (now - windowStartedAt >= WINDOW_MS) {
    windowStartedAt = now;
    requestsInWindow = 0;
  }
}

export function getGdeltBudgetStatus() {
  refreshWindow();
  return { windowStartedAt: new Date(windowStartedAt).toISOString(), windowMs: WINDOW_MS, requestsInWindow, maxRequestsPerWindow: MAX_REQUESTS_PER_WINDOW, remaining: Math.max(0, MAX_REQUESTS_PER_WINDOW - requestsInWindow), nextAllowedAt: nextAllowedAt > Date.now() ? new Date(nextAllowedAt).toISOString() : null, consecutiveFailures, lastStatus, lastError, lastRequestAt };
}

export function reserveGdeltRequest() {
  const now = Date.now();
  refreshWindow(now);
  if (nextAllowedAt > now) throw new Error(`GDELT adaptive cooldown until ${new Date(nextAllowedAt).toISOString()}`);
  if (requestsInWindow >= MAX_REQUESTS_PER_WINDOW) {
    nextAllowedAt = windowStartedAt + WINDOW_MS;
    throw new Error(`GDELT request budget exhausted until ${new Date(nextAllowedAt).toISOString()}`);
  }
  requestsInWindow += 1;
  lastRequestAt = new Date(now).toISOString();
}

export function recordGdeltSuccess(status = 200) {
  consecutiveFailures = 0;
  nextAllowedAt = 0;
  lastStatus = status;
  lastError = null;
}

export function recordGdeltFailure(error: unknown, status?: number) {
  consecutiveFailures += 1;
  lastStatus = status ?? null;
  lastError = error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240);
  const retryable = status === 429 || status === 408 || (typeof status === "number" && status >= 500) || /timeout|abort|ECONNRESET|fetch failed/i.test(lastError);
  if (retryable) {
    const backoff = Math.min(MAX_BACKOFF_MS, Math.max(15_000, 15_000 * 2 ** Math.min(consecutiveFailures - 1, 5)));
    nextAllowedAt = Date.now() + backoff;
  }
}
