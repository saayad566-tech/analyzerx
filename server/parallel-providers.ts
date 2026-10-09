export type ParallelProviderStatus = "used" | "failed" | "not-configured" | "circuit-open";

import { isProviderCircuitOpen, markProviderHealthy, markProviderRejected, markProviderUnavailable } from "./provider-health";

export type ParallelProviderResult<T> = {
  id: string;
  tier: "primary" | "secondary" | "web-fallback" | "derived";
  status: ParallelProviderStatus;
  value?: T;
  error?: string;
  elapsedMs: number;
};

export type ParallelProviderTask<T> = {
  id: string;
  tier: Exclude<ParallelProviderResult<T>["tier"], "derived">;
  enabled: boolean;
  run: () => Promise<T>;
};

export async function runProvidersInParallel<T>(tasks: ParallelProviderTask<T>[], timeoutMs = 12_000): Promise<ParallelProviderResult<T>[]> {
  return Promise.all(tasks.map(async (task) => {
    const startedAt = Date.now();
    if (!task.enabled) {
      markProviderUnavailable(task.id, "Provider is not configured or disabled", null);
      return { id: task.id, tier: task.tier, status: "not-configured" as const, elapsedMs: 0 };
    }
    if (isProviderCircuitOpen(task.id)) {
      return { id: task.id, tier: task.tier, status: "circuit-open" as const, error: "Provider circuit is open during cooldown", elapsedMs: 0 };
    }
    try {
      const value = await Promise.race([
        task.run(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Provider timed out after ${timeoutMs}ms`)), timeoutMs)),
      ]);
      const elapsedMs = Date.now() - startedAt;
      markProviderHealthy(task.id, elapsedMs, value);
      return { id: task.id, tier: task.tier, status: "used" as const, value, elapsedMs };
    } catch (error) {
      const elapsedMs = Date.now() - startedAt;
      markProviderRejected(task.id, error, elapsedMs);
      return { id: task.id, tier: task.tier, status: "failed" as const, error: error instanceof Error ? error.message : String(error), elapsedMs };
    }
  }));
}
