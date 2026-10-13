import { useEffect } from "react";

import { useAppLifecycle } from "@/lib/app-lifecycle";
import { trpc } from "@/lib/trpc";
import { saveRuntimeHealth, type RuntimeHealthSnapshot } from "@/lib/runtime-health";

/**
 * Refreshes the safe backend readiness snapshot after launch. Screens keep their
 * own feature-level errors; this probe never blocks navigation or replaces data.
 */
export function RuntimeReadinessProbe() {
  const lifecycle = useAppLifecycle();
  const { reportReady, reportOffline } = lifecycle;
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

  // Drive the app-wide lifecycle from the real readiness signal: a successful
  // probe means the runtime is up, a failed probe means we are offline and the
  // cached/on-device content should stay on screen.
  useEffect(() => {
    if (runtimeHealth.data) reportReady();
    else if (runtimeHealth.isError) reportOffline();
  }, [reportOffline, reportReady, runtimeHealth.data, runtimeHealth.isError]);

  return null;
}
