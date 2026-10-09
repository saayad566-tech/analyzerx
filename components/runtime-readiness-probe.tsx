import { useEffect } from "react";

import { trpc } from "@/lib/trpc";
import { saveRuntimeHealth, type RuntimeHealthSnapshot } from "@/lib/runtime-health";

/**
 * Refreshes the safe backend readiness snapshot after launch. Screens keep their
 * own feature-level errors; this probe never blocks navigation or replaces data.
 */
export function RuntimeReadinessProbe() {
  const runtimeHealth = trpc.runtime.health.useQuery(undefined, {
    retry: 1,
    retryDelay: 750,
    staleTime: 60_000,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!runtimeHealth.data) return;
    void saveRuntimeHealth(runtimeHealth.data as RuntimeHealthSnapshot).catch(
      () => undefined,
    );
  }, [runtimeHealth.data]);

  return null;
}
