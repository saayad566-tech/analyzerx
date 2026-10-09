export type CollectorHealth = {
  key: string;
  running: boolean;
  lastStartedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  recordsCollected: number;
  duplicateCount: number;
  parsingErrors: number;
  apiErrors: number;
  blockedReason: string | null;
};

const health = new Map<string, CollectorHealth>();
const lastRequestAt = new Map<string, number>();

export const DEFAULT_RETRY_COUNT = 2;
export const DEFAULT_RATE_LIMIT_MS = 2_000;

export function getCollectorHealth(key: string): CollectorHealth {
  return health.get(key) ?? {
    key,
    running: false,
    lastStartedAt: null,
    lastSuccessAt: null,
    lastError: null,
    recordsCollected: 0,
    duplicateCount: 0,
    parsingErrors: 0,
    apiErrors: 0,
    blockedReason: null,
  };
}

export function markCollectorStarted(key: string) {
  const current = getCollectorHealth(key);
  health.set(key, { ...current, running: true, lastStartedAt: new Date().toISOString(), lastError: null });
}

export function markCollectorSuccess(key: string, recordsCollected: number, duplicateCount = 0) {
  const current = getCollectorHealth(key);
  health.set(key, { ...current, running: false, lastSuccessAt: new Date().toISOString(), lastError: null, recordsCollected: current.recordsCollected + recordsCollected, duplicateCount: current.duplicateCount + duplicateCount });
}

export function markCollectorFailure(key: string, error: unknown, blockedReason?: string) {
  const current = getCollectorHealth(key);
  const message = error instanceof Error ? error.message : String(error);
  health.set(key, { ...current, running: false, lastError: message, apiErrors: current.apiErrors + 1, blockedReason: blockedReason ?? current.blockedReason });
}

export function markCollectorParsingError(key: string, error: unknown) {
  const current = getCollectorHealth(key);
  health.set(key, { ...current, parsingErrors: current.parsingErrors + 1, lastError: error instanceof Error ? error.message : String(error) });
}

export function getAllCollectorHealth() {
  return [...health.values()];
}

export async function waitForRateLimit(key: string, minimumIntervalMs = DEFAULT_RATE_LIMIT_MS) {
  const now = Date.now();
  const previous = lastRequestAt.get(key) ?? 0;
  const waitMs = Math.max(0, minimumIntervalMs - (now - previous));
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  lastRequestAt.set(key, Date.now());
}

export async function fetchWithRetry(url: string, init: RequestInit, options: { key: string; retries?: number; timeoutMs?: number; rateLimitMs?: number }) {
  const retries = options.retries ?? DEFAULT_RETRY_COUNT;
  const timeoutMs = options.timeoutMs ?? 15_000;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    await waitForRateLimit(options.key, options.rateLimitMs);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (response.ok || attempt === retries || (response.status >= 400 && response.status < 500 && response.status !== 429)) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
  }
  throw lastError instanceof Error ? lastError : new Error("Source request failed");
}
