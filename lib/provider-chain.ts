/**
 * Provider fallback chain.
 *
 * The requirement: a data category must be served by many sources, so that when one
 * is slow, rate-limited or failing, another supplies the answer — and when none can,
 * the caller gets an honest "unavailable" rather than stale or wrong-market data.
 *
 * This module is the reusable engine for that. It is deliberately pure with respect
 * to the data: it knows nothing about markets, quotes or news, so it can wrap any
 * source list without becoming a second source of truth.
 *
 * Guarantees:
 *  - Each source gets its own bounded timeout; a slow source cannot stall the chain.
 *  - A source that throws, times out, or returns a value the validator rejects is
 *    skipped and recorded, never used.
 *  - The first VALID result wins. Validation is mandatory — a chain without a
 *    validator would happily return wrong-market data.
 *  - When every source fails, the result is `exhausted` with `value: null`. The
 *    caller must show an unavailable state; it must never substitute another market.
 */

export type ChainSource<T> = {
  /** Stable identifier, used in the attempt report and for provenance. */
  id: string;
  run: () => Promise<T>;
};

export type ChainAttempt = {
  id: string;
  status: "used" | "rejected" | "failed" | "timed-out";
  durationMs: number;
  reason?: string;
};

export type ChainResult<T> = {
  value: T | null;
  /** The source that actually supplied the value, or null when exhausted. */
  sourceId: string | null;
  attempts: ChainAttempt[];
  exhausted: boolean;
  /** Total wall-clock time spent across all attempts. */
  totalMs: number;
};

export type ChainOptions<T> = {
  /** REQUIRED: decides whether a source's result is usable. */
  validate: (value: T) => boolean;
  /** Per-source timeout. Default 6000 ms. */
  timeoutMs?: number;
  /** Cap on how many sources to try. Default: all of them. */
  maxAttempts?: number;
  /** Injectable clock, for deterministic tests. */
  now?: () => number;
};

/** Run `promise` but give up after `timeoutMs`, so a slow source cannot block the chain. */
async function withTimeout<T>(run: () => Promise<T>, timeoutMs: number): Promise<{ ok: true; value: T } | { ok: false; timedOut: boolean; error: unknown }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race([
      run(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("provider-timeout")), timeoutMs);
      }),
    ]);
    return { ok: true, value };
  } catch (error) {
    const timedOut = error instanceof Error && error.message === "provider-timeout";
    return { ok: false, timedOut, error };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Try each source in order until one returns a value the validator accepts.
 * Sources are tried sequentially: the chain exists to survive failure, not to
 * stampede every provider at once.
 */
export async function runWithFallback<T>(sources: readonly ChainSource<T>[], options: ChainOptions<T>): Promise<ChainResult<T>> {
  const now = options.now ?? (() => Date.now());
  const timeoutMs = options.timeoutMs ?? 6000;
  const limit = options.maxAttempts ?? sources.length;
  const attempts: ChainAttempt[] = [];
  const startedAt = now();

  for (const source of sources.slice(0, Math.max(0, limit))) {
    const attemptStart = now();
    const outcome = await withTimeout(source.run, timeoutMs);
    const durationMs = now() - attemptStart;

    if (!outcome.ok) {
      attempts.push({
        id: source.id,
        status: outcome.timedOut ? "timed-out" : "failed",
        durationMs,
        reason: outcome.timedOut ? `No response within ${timeoutMs} ms.` : "The source threw an error.",
      });
      continue;
    }

    let valid = false;
    try {
      valid = options.validate(outcome.value);
    } catch {
      valid = false;
    }

    if (!valid) {
      attempts.push({ id: source.id, status: "rejected", durationMs, reason: "The response did not pass validation." });
      continue;
    }

    attempts.push({ id: source.id, status: "used", durationMs });
    return { value: outcome.value, sourceId: source.id, attempts, exhausted: false, totalMs: now() - startedAt };
  }

  return { value: null, sourceId: null, attempts, exhausted: true, totalMs: now() - startedAt };
}

/** Human-readable summary for a status line, so failures are visible rather than silent. */
export function describeChainResult<T>(result: ChainResult<T>): string {
  if (!result.exhausted && result.sourceId) {
    const failures = result.attempts.filter((attempt) => attempt.status !== "used").length;
    return failures === 0
      ? `Served by ${result.sourceId}.`
      : `Served by ${result.sourceId} after ${failures} source${failures === 1 ? "" : "s"} failed or were rejected.`;
  }
  const parts = result.attempts.map((attempt) => `${attempt.id} (${attempt.status})`);
  return parts.length === 0
    ? "No source is configured for this category."
    : `Every configured source failed: ${parts.join(", ")}. The value is unavailable rather than substituted.`;
}

/**
 * Build a chain from a list of candidate sources, dropping any whose `run` is not a
 * function. Used where a market's source list is partly configured.
 */
export function buildChain<T>(sources: readonly { id: string; run?: (() => Promise<T>) | null }[]): ChainSource<T>[] {
  return sources
    .filter((source): source is ChainSource<T> => typeof source.run === "function" && Boolean(source.id))
    .map((source) => ({ id: source.id, run: source.run }));
}
