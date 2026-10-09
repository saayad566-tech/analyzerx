/**
 * Provider chain: redundancy and failover for every capability.
 *
 * Each capability is served by an ordered list of independent providers. The
 * chain tries them in order and returns the first acceptable result, recording
 * what was tried, what failed and how long each took. If every provider fails
 * the chain degrades honestly (a null value plus the full attempt log) rather
 * than inventing a number — and the ops screens can show exactly which link is
 * down.
 *
 * News-style capabilities use `runMerge` instead: every provider that answers is
 * combined, so one feed going dark only narrows coverage instead of blanking it.
 */
import { nowIso, type SourceStatus } from "./core";

export type ChainAttempt = {
  key: string;
  name: string;
  ok: boolean;
  latencyMs: number;
  items: number;
  error?: string;
};

export type ChainOutcome<T> = {
  value: T | null;
  provider: string | null;
  attempts: ChainAttempt[];
  degraded: boolean;
};

export type ChainLink<T> = {
  key: string;
  name: string;
  run: () => Promise<T | null>;
};

export type MergeOutcome<T> = {
  items: T[];
  providers: Array<{ key: string; name: string; status: SourceStatus; items: number; latencyMs: number }>;
  attempts: ChainAttempt[];
  degraded: boolean;
};

type LinkHealth = { status: SourceStatus; lastSuccessAt: string | null; lastError: string | null; latencyMs: number | null; consecutiveFailures: number; lastAttemptAt: number | null };

const health = new Map<string, LinkHealth>();

/** Circuit breaker: after this many consecutive failures a link is skipped for a
 *  cooldown instead of costing every request a full timeout. It is retried once
 *  the cooldown expires, and if every link is open the breaker is ignored so the
 *  capability can still recover rather than going permanently dark. */
const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 60_000;

function circuitOpen(key: string) {
  const entry = health.get(key);
  if (!entry || entry.consecutiveFailures < FAILURE_THRESHOLD || entry.lastAttemptAt === null) return false;
  return Date.now() - entry.lastAttemptAt < COOLDOWN_MS;
}

export function recordLink(key: string, ok: boolean, latencyMs: number, error?: unknown) {
  const previous = health.get(key);
  health.set(key, {
    status: ok ? "live" : "error",
    lastSuccessAt: ok ? nowIso() : previous?.lastSuccessAt ?? null,
    lastError: ok ? null : String(error).slice(0, 240),
    latencyMs,
    consecutiveFailures: ok ? 0 : (previous?.consecutiveFailures ?? 0) + 1,
    lastAttemptAt: Date.now(),
  });
}

export function linkHealth(key: string) {
  return health.get(key) ?? { status: "live" as SourceStatus, lastSuccessAt: null, lastError: null, latencyMs: null, consecutiveFailures: 0, lastAttemptAt: null };
}

export function allLinkHealth() {
  return [...health.entries()].map(([key, value]) => ({ key, ...value }));
}

function isUsable<T>(value: T | null | undefined): value is T {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** Try providers in order; first acceptable result wins. */
export async function runChain<T>(
  links: ChainLink<T>[],
  options: { accept?: (value: T | null) => boolean } = {},
): Promise<ChainOutcome<T>> {
  const accept = options.accept ?? isUsable;
  const attempts: ChainAttempt[] = [];

  // Skip links that are in cooldown — unless that would skip everything.
  const openLinks = links.filter((link) => circuitOpen(link.key));
  const usableLinks = openLinks.length === links.length ? links : links.filter((link) => !circuitOpen(link.key));
  for (const link of openLinks) {
    if (usableLinks.includes(link)) continue;
    attempts.push({ key: link.key, name: link.name, ok: false, latencyMs: 0, items: 0, error: "circuit open after repeated failures; retried after cooldown" });
  }

  for (const link of usableLinks) {
    const started = Date.now();
    try {
      const value = await link.run();
      const latencyMs = Date.now() - started;
      const usable = accept(value as T | null);
      attempts.push({
        key: link.key,
        name: link.name,
        ok: usable,
        latencyMs,
        items: Array.isArray(value) ? value.length : usable ? 1 : 0,
        ...(usable ? {} : { error: "provider returned no usable data" }),
      });
      recordLink(link.key, usable, latencyMs, usable ? undefined : "no usable data");
      if (usable) {
        return { value: value as T, provider: link.key, attempts, degraded: attempts.some((a) => !a.ok) };
      }
    } catch (error) {
      const latencyMs = Date.now() - started;
      attempts.push({ key: link.key, name: link.name, ok: false, latencyMs, items: 0, error: String(error).slice(0, 200) });
      recordLink(link.key, false, latencyMs, error);
    }
  }

  return { value: null, provider: null, attempts, degraded: true };
}

/** Run every provider that can answer and combine the results (news, lists). */
export async function runMerge<T>(
  links: ChainLink<T[]>[],
  options: { key?: (item: T) => string; limit?: number } = {},
): Promise<MergeOutcome<T>> {
  const keyOf = options.key ?? ((item: T) => JSON.stringify(item));
  const openLinks = links.filter((link) => circuitOpen(link.key));
  const activeLinks = openLinks.length === links.length ? links : links.filter((link) => !circuitOpen(link.key));
  const skipped = openLinks.filter((link) => !activeLinks.includes(link));
  const settled = await Promise.all(
    activeLinks.map(async (link) => {
      const started = Date.now();
      try {
        const items = (await link.run()) ?? [];
        const latencyMs = Date.now() - started;
        recordLink(link.key, items.length > 0, latencyMs, items.length ? undefined : "empty feed");
        return { link, items, latencyMs, error: null as string | null };
      } catch (error) {
        const latencyMs = Date.now() - started;
        recordLink(link.key, false, latencyMs, error);
        return { link, items: [] as T[], latencyMs, error: String(error).slice(0, 200) };
      }
    }),
  );

  const seen = new Map<string, T>();
  for (const result of settled) {
    for (const item of result.items) {
      const key = keyOf(item);
      if (!seen.has(key)) seen.set(key, item);
    }
  }
  const merged = [...seen.values()].slice(0, options.limit ?? 400);
  return {
    items: merged,
    providers: [
      ...settled.map((r) => ({
      key: r.link.key,
      name: r.link.name,
        status: r.error ? ("error" as SourceStatus) : r.items.length ? ("live" as SourceStatus) : ("unavailable" as SourceStatus),
        items: r.items.length,
        latencyMs: r.latencyMs,
      })),
      ...skipped.map((link) => ({ key: link.key, name: link.name, status: "unavailable" as SourceStatus, items: 0, latencyMs: 0 })),
    ],
    attempts: [
      ...settled.map((r) => ({ key: r.link.key, name: r.link.name, ok: !r.error && r.items.length > 0, latencyMs: r.latencyMs, items: r.items.length, ...(r.error ? { error: r.error } : {}) })),
      ...skipped.map((link) => ({ key: link.key, name: link.name, ok: false, latencyMs: 0, items: 0, error: "circuit open after repeated failures; retried after cooldown" })),
    ],
    degraded: settled.some((r) => r.error || r.items.length === 0) || skipped.length > 0,
  };
}
