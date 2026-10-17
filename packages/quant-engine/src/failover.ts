/**
 * Multi-source failover and API-key rotation.
 *
 * The product must not stall when a provider is rate-limited, out of credit, or down. This is the
 * runtime layer that keeps it up: a pool of keys per provider, immediate rotation on a rate limit,
 * failover to the next provider (including a free/local one) when a whole provider is exhausted, and
 * per-key quota and health tracking so a cooled-down key returns to the pool on its own.
 *
 * It is a faithful port of the `multi-source-failover` skill's engine, in TypeScript so the app can
 * use it directly.
 *
 * Scope, deliberately: it rotates keys **you own** and honours `Retry-After` and each provider's
 * terms. It does **not** evade anti-abuse — no user-agent spoofing, no IP rotation to dodge blocks, no
 * CAPTCHA bypass. Backoff and rotation are reliability engineering; detection evasion is not.
 *
 * The clock and the sleep are injected, so the whole engine is deterministic under test and never
 * needs a real timer.
 */

export type ProviderConfig = {
  name: string;
  /** The keys you own for this provider, in priority order. */
  keys: string[];
  /** Minimum spacing between calls to this provider, in ms. */
  minIntervalMs?: number;
  /** Ceiling for exponential backoff, in ms. Default 30_000. */
  maxBackoffMs?: number;
  /** A free / local fallback provider. Expected to be slower; used last if listed last. */
  free?: boolean;
};

export type TransportResult = {
  value: unknown;
  /** Remaining quota reported by the provider (e.g. an `X-Remaining` header), or omitted. */
  remaining?: number;
};

/** Perform one call with one key. Throw `RateLimited` / `ProviderDown` to drive the engine. */
export type Transport = (key: string, payload: unknown) => Promise<TransportResult>;

export class RateLimited extends Error {
  constructor(public readonly retryAfterMs?: number, message = "rate limited") {
    super(message);
    this.name = "RateLimited";
  }
}

export class ProviderDown extends Error {
  constructor(message = "provider down") {
    super(message);
    this.name = "ProviderDown";
  }
}

export type Attempt = { provider: string; key: string; reason: string };

export class AllProvidersFailed extends Error {
  constructor(public readonly attempts: Attempt[]) {
    super(`All providers failed (${attempts.length} attempt(s))`);
    this.name = "AllProvidersFailed";
  }
}

export type KeyReport = {
  provider: string;
  /** Masked — the raw key is never exposed, not even in a health report. */
  key: string;
  remaining: number | null;
  cooldownRemainingMs: number;
  successes: number;
  failures: number;
  lastLatencyMs: number | null;
  available: boolean;
};

export type EngineOptions = {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Jitter source for backoff, in [0,1). Injected so tests are deterministic. */
  jitter?: () => number;
  /** Fallback cooldown when a rate limit carries no `Retry-After`. Default 5_000. */
  defaultCooldownMs?: number;
};

type KeyState = {
  provider: string;
  key: string;
  remaining: number | null;
  cooldownUntil: number;
  successes: number;
  failures: number;
  lastLatencyMs: number | null;
  /** `null` means "never called". A numeric sentinel would collide with a clock that starts at 0. */
  lastCallAt: number | null;
};

const DEFAULT_MAX_BACKOFF_MS = 30_000;
const DEFAULT_COOLDOWN_MS = 5_000;

/** Show only the tail of a key, so a report can identify one without leaking it. */
export function maskKey(key: string): string {
  if (key.length <= 4) return "****";
  return `****${key.slice(-4)}`;
}

export class FailoverEngine {
  private readonly states: KeyState[] = [];
  private readonly configs: ProviderConfig[] = [];
  private readonly transports = new Map<string, Transport>();
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly jitter: () => number;
  private readonly defaultCooldownMs: number;

  constructor(
    providers: { config: ProviderConfig; transport: Transport }[],
    options: EngineOptions = {},
  ) {
    this.now = options.now ?? (() => Date.now());
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.jitter = options.jitter ?? Math.random;
    this.defaultCooldownMs = options.defaultCooldownMs ?? DEFAULT_COOLDOWN_MS;
    for (const { config, transport } of providers) {
      this.configs.push(config);
      this.transports.set(config.name, transport);
      for (const key of config.keys) {
        this.states.push({
          provider: config.name,
          key,
          remaining: null,
          cooldownUntil: 0,
          successes: 0,
          failures: 0,
          lastLatencyMs: null,
          lastCallAt: null,
        });
      }
    }
  }

  private keysOf(provider: string): KeyState[] {
    return this.states.filter((s) => s.provider === provider);
  }

  private isAvailable(state: KeyState): boolean {
    return state.cooldownUntil <= this.now();
  }

  /** Exponential backoff with jitter, capped. */
  private backoffMs(attempt: number, cap: number): number {
    const base = Math.min(cap, 500 * 2 ** Math.max(0, attempt - 1));
    return base / 2 + this.jitter() * (base / 2);
  }

  private async throttle(config: ProviderConfig, state: KeyState): Promise<void> {
    const interval = config.minIntervalMs ?? 0;
    if (interval <= 0 || state.lastCallAt === null) return;
    const since = this.now() - state.lastCallAt;
    if (since < interval) {
      await this.sleep(interval - since);
    }
  }

  /**
   * Make one call, rotating keys and failing over providers as needed.
   * Throws `AllProvidersFailed` (with the per-attempt detail) when everything is exhausted —
   * the caller must surface that, never fabricate a result.
   */
  async call(payload: unknown): Promise<{ value: unknown; provider: string; key: string }> {
    const attempts: Attempt[] = [];
    let attemptNo = 0;

    for (const config of this.configs) {
      const transport = this.transports.get(config.name);
      if (!transport) continue;
      const cap = config.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;

      // Snapshot the keys so a cooldown set mid-loop does not shift the iteration.
      const keys = this.keysOf(config.name);
      let providerDown = false;

      for (const state of keys) {
        if (providerDown) break;
        if (!this.isAvailable(state)) {
          attempts.push({ provider: config.name, key: maskKey(state.key), reason: "cooling down" });
          continue;
        }
        attemptNo += 1;
        await this.throttle(config, state);
        const started = this.now();
        state.lastCallAt = started;
        try {
          const result = await transport(state.key, payload);
          state.successes += 1;
          state.lastLatencyMs = this.now() - started;
          if (typeof result.remaining === "number") state.remaining = result.remaining;
          return { value: result.value, provider: config.name, key: state.key };
        } catch (err) {
          state.failures += 1;
          state.lastLatencyMs = this.now() - started;
          if (err instanceof RateLimited) {
            const wait = err.retryAfterMs && err.retryAfterMs > 0 ? err.retryAfterMs : this.backoffMs(attemptNo, cap);
            state.cooldownUntil = this.now() + Math.min(cap, wait);
            state.remaining = 0;
            attempts.push({ provider: config.name, key: maskKey(state.key), reason: `rate limited; cooling ${Math.round(Math.min(cap, wait))}ms` });
            continue; // rotate to the next key immediately
          }
          if (err instanceof ProviderDown) {
            attempts.push({ provider: config.name, key: maskKey(state.key), reason: "provider down; failing over" });
            providerDown = true; // stop trying this provider's other keys
            break;
          }
          attempts.push({ provider: config.name, key: maskKey(state.key), reason: err instanceof Error ? err.message : "unknown error" });
          continue;
        }
      }
    }

    throw new AllProvidersFailed(attempts);
  }

  /** Per-key health, quota and counters. Keys are masked. */
  report(): KeyReport[] {
    const now = this.now();
    return this.states.map((s) => ({
      provider: s.provider,
      key: maskKey(s.key),
      remaining: s.remaining,
      cooldownRemainingMs: Math.max(0, s.cooldownUntil - now),
      successes: s.successes,
      failures: s.failures,
      lastLatencyMs: s.lastLatencyMs,
      available: this.isAvailable(s),
    }));
  }
}
