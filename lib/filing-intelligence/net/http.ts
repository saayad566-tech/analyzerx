/**
 * Network and data safety (Phase 5).
 *
 * Every outbound request in the connector layer goes through `safeFetch`, so
 * the guarantees hold in one place rather than being re-implemented per source:
 *
 *   - HTTPS only, and only to an approved host.
 *   - Redirects followed manually, with each hop re-checked, so a redirect
 *     cannot walk the client off the approved domain or onto a private address.
 *   - A request timeout and a bounded response size.
 *   - Content-type validation against what the source is expected to return.
 *   - A per-source rate limiter honouring the source's documented limit.
 *   - Exponential backoff with jitter, honouring Retry-After.
 *   - Bounded retries and a circuit breaker, so a failing source is not hammered.
 *
 * Nothing here rotates identities, keys or addresses to get around a source's
 * restrictions; a refusal is reported as a refusal.
 */

/* ------------------------------------------------------------------ *
 * URL safety
 * ------------------------------------------------------------------ */

const PRIVATE_HOST = /^(localhost|127\.|0\.0\.0\.0|\[::1\]|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/;

export function resolveHost(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isAllowedHost(url: string, approvedDomains: string[]): { allowed: boolean; reason: string } {
  const host = resolveHost(url);
  if (!host) return { allowed: false, reason: `Only https URLs with a parseable host are fetched ("${url}").` };
  if (PRIVATE_HOST.test(host)) return { allowed: false, reason: `Refused a private or loopback destination (${host}).` };
  const approved = approvedDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
  if (!approved) return { allowed: false, reason: `Host "${host}" is not on the approved domain list.` };
  return { allowed: true, reason: `Host "${host}" is approved.` };
}

/* ------------------------------------------------------------------ *
 * Rate limiting
 * ------------------------------------------------------------------ */

export type RateLimit = {
  requestsPerWindow: number | null;
  windowSeconds: number | null;
  minDelayMs: number | null;
  honoursRetryAfter: boolean;
};

/**
 * A per-source rate limiter. It records the times of recent requests and
 * refuses to send one that would exceed the source's documented limit, rather
 * than sending it and hoping.
 */
export class RateLimiter {
  private readonly stamps: number[] = [];

  constructor(private readonly rule: RateLimit) {}

  /** Milliseconds to wait before the next request may be sent, or 0. */
  delayUntilAllowed(now = Date.now()): number {
    const { requestsPerWindow, windowSeconds, minDelayMs } = this.rule;
    let wait = 0;
    if (minDelayMs && this.stamps.length) {
      const since = now - this.stamps[this.stamps.length - 1];
      if (since < minDelayMs) wait = Math.max(wait, minDelayMs - since);
    }
    if (requestsPerWindow && windowSeconds) {
      const windowMs = windowSeconds * 1000;
      const recent = this.stamps.filter((stamp) => now - stamp < windowMs);
      if (recent.length >= requestsPerWindow) {
        wait = Math.max(wait, windowMs - (now - recent[0]));
      }
    }
    return wait;
  }

  record(now = Date.now()): void {
    this.stamps.push(now);
    // Keep the list bounded; anything older than an hour cannot affect a limit.
    const cutoff = now - 3_600_000;
    while (this.stamps.length && this.stamps[0] < cutoff) this.stamps.shift();
  }

  /** Remaining requests in the current window, when a limit is documented. */
  remaining(now = Date.now()): number | null {
    if (!this.rule.requestsPerWindow || !this.rule.windowSeconds) return null;
    const windowMs = this.rule.windowSeconds * 1000;
    const recent = this.stamps.filter((stamp) => now - stamp < windowMs).length;
    return Math.max(0, this.rule.requestsPerWindow - recent);
  }
}

/* ------------------------------------------------------------------ *
 * Circuit breaker
 * ------------------------------------------------------------------ */

/**
 * Opens after a run of consecutive failures, so a source that is down is not
 * hammered. Half-opens after the cooldown to allow a single probe.
 */
export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;

  constructor(
    private readonly threshold = 4,
    private readonly cooldownMs = 60_000,
  ) {}

  isOpen(now = Date.now()): boolean {
    if (this.openedAt === null) return false;
    if (now - this.openedAt >= this.cooldownMs) return false; // half-open: allow a probe
    return true;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.openedAt = null;
  }

  recordFailure(now = Date.now()): void {
    this.failures += 1;
    if (this.failures >= this.threshold) this.openedAt = now;
  }

  get failureCount(): number {
    return this.failures;
  }
}

/* ------------------------------------------------------------------ *
 * Backoff
 * ------------------------------------------------------------------ */

/** Exponential backoff with full jitter, optionally overridden by Retry-After. */
export function backoffDelay(attempt: number, options: { baseMs?: number; maxMs?: number; jitter?: () => number; retryAfterMs?: number | null } = {}): number {
  if (options.retryAfterMs && options.retryAfterMs > 0) {
    return Math.min(options.retryAfterMs, options.maxMs ?? 30_000);
  }
  const base = options.baseMs ?? 400;
  const max = options.maxMs ?? 8_000;
  const exponential = Math.min(max, base * 2 ** attempt);
  const jitter = options.jitter ? options.jitter() : Math.random();
  return Math.round(exponential * (0.5 + jitter * 0.5));
}

/** Parse a Retry-After header in either of its two permitted forms. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = new Date(value.trim());
  if (!Number.isNaN(date.getTime())) return Math.max(0, date.getTime() - now);
  return null;
}

/* ------------------------------------------------------------------ *
 * safeFetch
 * ------------------------------------------------------------------ */

export type FetchPolicy = {
  approvedDomains: string[];
  rateLimit: RateLimit;
  acceptedContentTypes: string[];
  timeoutMs?: number;
  maxBytes?: number;
  maxRetries?: number;
  maxRedirects?: number;
};

export type SafeFetchOutcome =
  | { ok: true; status: number; contentType: string; text: string; url: string; attempts: number; bytes: number }
  | { ok: false; kind: "blocked" | "rate_limited" | "timeout" | "http" | "size" | "content_type" | "redirect" | "circuit_open" | "network"; error: string; status: number | null; attempts: number };

export type SafeFetchDeps = {
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  limiter?: RateLimiter;
  breaker?: CircuitBreaker;
  /** Injected jitter so tests are deterministic. */
  jitter?: () => number;
  userAgent?: string;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Fetch a resource under every Phase 5 guarantee. Returns a typed outcome
 * rather than throwing, so a caller always gets a reportable result.
 */
export async function safeFetch(url: string, policy: FetchPolicy, deps: SafeFetchDeps = {}): Promise<SafeFetchOutcome> {
  const doFetch = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? defaultSleep;
  const now = deps.now ?? (() => Date.now());
  const limiter = deps.limiter ?? new RateLimiter(policy.rateLimit);
  const breaker = deps.breaker ?? new CircuitBreaker();
  const timeoutMs = policy.timeoutMs ?? 20_000;
  const maxBytes = policy.maxBytes ?? 8_000_000;
  const maxRetries = policy.maxRetries ?? 2;
  const maxRedirects = policy.maxRedirects ?? 3;
  const userAgent = deps.userAgent ?? "AnalyzerX/1.0 (filing-intelligence)";

  if (breaker.isOpen(now())) {
    return { ok: false, kind: "circuit_open", error: "The circuit breaker is open after repeated failures; the source is not being retried yet.", status: null, attempts: 0 };
  }

  let attempts = 0;
  let target = url;
  let redirects = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const wait = limiter.delayUntilAllowed(now());
    if (wait > 0) await sleep(wait);

    const check = isAllowedHost(target, policy.approvedDomains);
    if (!check.allowed) {
      return { ok: false, kind: "blocked", error: check.reason, status: null, attempts };
    }

    attempts += 1;
    limiter.record(now());
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await doFetch(target, {
        signal: controller.signal,
        redirect: "manual",
        headers: { Accept: policy.acceptedContentTypes.join(","), "User-Agent": userAgent },
      });
    } catch (error) {
      clearTimeout(timer);
      const message = error instanceof Error ? error.message : String(error);
      breaker.recordFailure(now());
      if (attempt < maxRetries) {
        await sleep(backoffDelay(attempt, { jitter: deps.jitter }));
        continue;
      }
      return { ok: false, kind: "timeout", error: `Request to the source failed: ${message}`, status: null, attempts };
    }
    clearTimeout(timer);

    // Manual redirect handling, so every hop is re-checked.
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        breaker.recordFailure(now());
        return { ok: false, kind: "redirect", error: `HTTP ${response.status} without a Location header.`, status: response.status, attempts };
      }
      redirects += 1;
      if (redirects > maxRedirects) {
        breaker.recordFailure(now());
        return { ok: false, kind: "redirect", error: `Exceeded the ${maxRedirects}-redirect limit.`, status: response.status, attempts };
      }
      target = new URL(location, target).toString();
      const hop = isAllowedHost(target, policy.approvedDomains);
      if (!hop.allowed) {
        breaker.recordFailure(now());
        return { ok: false, kind: "redirect", error: `A redirect left the approved domain: ${hop.reason}`, status: response.status, attempts };
      }
      attempt -= 1; // a redirect is not a retry
      continue;
    }

    if (response.status === 401 || response.status === 403) {
      breaker.recordFailure(now());
      return { ok: false, kind: "blocked", error: `HTTP ${response.status}: the source refused the request. This is an access decision, not a transient failure.`, status: response.status, attempts };
    }

    if (response.status === 429) {
      const retryAfterMs = policy.rateLimit.honoursRetryAfter ? parseRetryAfter(response.headers.get("retry-after"), now()) : null;
      breaker.recordFailure(now());
      if (attempt < maxRetries) {
        await sleep(backoffDelay(attempt, { jitter: deps.jitter, retryAfterMs }));
        continue;
      }
      return { ok: false, kind: "rate_limited", error: "The source returned HTTP 429 and the retry budget is exhausted.", status: 429, attempts };
    }

    if (!response.ok) {
      breaker.recordFailure(now());
      if (response.status >= 500 && attempt < maxRetries) {
        await sleep(backoffDelay(attempt, { jitter: deps.jitter }));
        continue;
      }
      return { ok: false, kind: "http", error: `HTTP ${response.status} from the source.`, status: response.status, attempts };
    }

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (policy.acceptedContentTypes.length && !policy.acceptedContentTypes.some((type) => contentType.includes(type.toLowerCase()))) {
      breaker.recordFailure(now());
      return { ok: false, kind: "content_type", error: `Unexpected content type "${contentType || "none"}" for this source.`, status: response.status, attempts };
    }

    const declaredLength = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      breaker.recordFailure(now());
      return { ok: false, kind: "size", error: `The declared response size (${declaredLength} bytes) exceeds the ${maxBytes}-byte ceiling.`, status: response.status, attempts };
    }

    const text = await response.text();
    if (text.length > maxBytes) {
      breaker.recordFailure(now());
      return { ok: false, kind: "size", error: `The response exceeded the ${maxBytes}-byte ceiling and was discarded.`, status: response.status, attempts };
    }

    breaker.recordSuccess();
    return { ok: true, status: response.status, contentType, text, url: target, attempts, bytes: text.length };
  }

  return { ok: false, kind: "network", error: "The retry budget was exhausted.", status: null, attempts };
}
