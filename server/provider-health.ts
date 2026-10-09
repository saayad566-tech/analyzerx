export type ProviderHealthStatus = "healthy" | "rejected" | "unavailable";
export type ProviderCircuitState = "closed" | "open" | "half-open";
export type ProviderFailureClass = "rate-limit" | "payment-required" | "auth" | "server" | "timeout" | "network" | "schema" | "unknown";

export type ProviderHealth = {
  id: string;
  status: ProviderHealthStatus;
  circuitState: ProviderCircuitState;
  failureClass: ProviderFailureClass | null;
  consecutiveFailures: number;
  cooldownUntil: string | null;
  latencyMs: number | null;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastPayloadPreview: string | null;
  lastPayloadAt: string | null;
};

const health = new Map<string, ProviderHealth>();
const FAILURE_THRESHOLD = 3;
const MAX_PREVIEW_LENGTH = 4_000;

function current(id: string): ProviderHealth {
  return health.get(id) ?? {
    id,
    status: "unavailable",
    circuitState: "closed",
    failureClass: null,
    consecutiveFailures: 0,
    cooldownUntil: null,
    latencyMs: null,
    lastCheckedAt: null,
    lastSuccessAt: null,
    lastError: null,
    lastPayloadPreview: null,
    lastPayloadAt: null,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function classifyProviderError(error: unknown): ProviderFailureClass {
  const message = errorMessage(error).toLowerCase();
  if (/\b429\b|rate.?limit|too many requests|quota/.test(message)) return "rate-limit";
  if (/\b402\b|payment required|billing|subscription|quota exhausted/.test(message)) return "payment-required";
  if (/\b401\b|\b403\b|unauthori[sz]ed|forbidden|invalid api key|invalid token/.test(message)) return "auth";
  if (/\b5\d\d\b|bad gateway|service unavailable|upstream/.test(message)) return "server";
  if (/timeout|timed out|aborterror|aborted/.test(message)) return "timeout";
  if (/fetch failed|network|econn|enotfound|socket/.test(message)) return "network";
  if (/schema|invalid response|unexpected payload|parse/.test(message)) return "schema";
  return "unknown";
}

function cooldownMs(failureClass: ProviderFailureClass) {
  switch (failureClass) {
    case "payment-required": return 15 * 60_000;
    case "auth": return 15 * 60_000;
    case "rate-limit": return 60_000;
    case "server": return 30_000;
    case "timeout": return 20_000;
    case "network": return 20_000;
    case "schema": return 5 * 60_000;
    default: return 30_000;
  }
}

function sanitizePreview(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const redact = (input: unknown, depth = 0): unknown => {
    if (depth > 4) return "[depth limited]";
    if (Array.isArray(input)) return input.slice(0, 20).map((item) => redact(item, depth + 1));
    if (typeof input === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(input as Record<string, unknown>).slice(0, 80)) {
        result[key] = /token|api.?key|authorization|password|secret|credential/i.test(key) ? "[redacted]" : redact(item, depth + 1);
      }
      return result;
    }
    if (typeof input === "string" && input.length > 500) return `${input.slice(0, 500)}…`;
    return input;
  };
  try {
    const serialized = JSON.stringify(redact(value), null, 2);
    return serialized.length > MAX_PREVIEW_LENGTH ? `${serialized.slice(0, MAX_PREVIEW_LENGTH)}\n…[truncated]` : serialized;
  } catch {
    return "[payload could not be serialized]";
  }
}

export function isProviderCircuitOpen(id: string, now = Date.now()) {
  const item = current(id);
  if (item.circuitState !== "open" || !item.cooldownUntil) return false;
  const cooldownAt = new Date(item.cooldownUntil).getTime();
  return Number.isFinite(cooldownAt) && cooldownAt > now;
}

export function getProviderCircuitState(id: string) {
  const item = current(id);
  if (item.circuitState === "open" && item.cooldownUntil && new Date(item.cooldownUntil).getTime() <= Date.now()) {
    return "half-open" as const;
  }
  return item.circuitState;
}

export function markProviderRejected(id: string, error: unknown, latencyMs: number | null = null) {
  const previous = current(id);
  const failureClass = classifyProviderError(error);
  const failures = previous.consecutiveFailures + 1;
  const shouldOpen = failures >= FAILURE_THRESHOLD;
  const cooldownUntil = shouldOpen ? new Date(Date.now() + cooldownMs(failureClass)).toISOString() : previous.cooldownUntil;
  health.set(id, {
    ...previous,
    id,
    status: "rejected",
    circuitState: shouldOpen ? "open" : previous.circuitState === "open" ? "open" : "closed",
    failureClass,
    consecutiveFailures: failures,
    cooldownUntil,
    latencyMs,
    lastCheckedAt: new Date().toISOString(),
    lastError: errorMessage(error),
  });
}

export function markProviderUnavailable(id: string, error: unknown, latencyMs: number | null = null) {
  const previous = current(id);
  health.set(id, {
    ...previous,
    id,
    status: "unavailable",
    latencyMs,
    lastCheckedAt: new Date().toISOString(),
    lastError: errorMessage(error),
  });
}

export function markProviderHealthy(id: string, latencyMs: number | null = null, payload?: unknown) {
  const checkedAt = new Date().toISOString();
  const previous = current(id);
  health.set(id, {
    ...previous,
    id,
    status: "healthy",
    circuitState: "closed",
    failureClass: null,
    consecutiveFailures: 0,
    cooldownUntil: null,
    latencyMs,
    lastCheckedAt: checkedAt,
    lastSuccessAt: checkedAt,
    lastError: null,
    lastPayloadPreview: payload === undefined ? previous.lastPayloadPreview : sanitizePreview(payload),
    lastPayloadAt: payload === undefined ? previous.lastPayloadAt : checkedAt,
  });
}

export function getProviderHealth() {
  return [...health.values()].map((item) => ({ ...item, circuitState: getProviderCircuitState(item.id) }));
}

export function getProviderHealthFor(id: string) {
  const item = health.get(id);
  return item ? { ...item, circuitState: getProviderCircuitState(id) } : null;
}

export function resetProviderHealthForTests() {
  health.clear();
}
