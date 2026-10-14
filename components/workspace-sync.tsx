import { useEffect, useRef, useState } from "react";
import { useMarketContext } from "@/lib/market-context";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import { loadAlertNotificationPreferences, loadAlertState, loadSavedScreens, loadWatchlist } from "@/lib/local-preferences";
import { getWorkspaceSyncSnapshot, hydrateWorkspaceSyncSnapshot, setWorkspaceSyncSnapshot, subscribeWorkspaceSync } from "@/lib/workspace-sync-state";

export function WorkspaceSync() {
  const { marketId } = useMarketContext();
  const { user, isAuthenticated } = useAuth();
  const syncedForUser = useRef<number | null>(null);
  const [retryNonce, setRetryNonce] = useState(getWorkspaceSyncSnapshot().retryNonce);
  const watchlistUpsert = trpc.account.watchlistUpsert.useMutation();
  const screenUpsert = trpc.account.savedScreenUpsert.useMutation();
  const prefsUpsert = trpc.account.notificationPreferencesUpsert.useMutation();
  const alertRuleUpsert = trpc.account.alertRuleUpsert.useMutation();

  useEffect(() => { void hydrateWorkspaceSyncSnapshot(); const unsubscribe = subscribeWorkspaceSync(() => setRetryNonce(getWorkspaceSyncSnapshot().retryNonce)); return () => { unsubscribe(); }; }, []);

  useEffect(() => {
    if (!isAuthenticated || !user || (syncedForUser.current === user.id && retryNonce === 0)) return;
    setWorkspaceSyncSnapshot({ status: "syncing", lastAttemptAt: new Date().toISOString(), error: null });
    syncedForUser.current = user.id;
    let cancelled = false;
    void Promise.all([loadWatchlist(marketId), loadSavedScreens(marketId), loadAlertNotificationPreferences(), loadAlertState()]).then(async ([watchlist, screens, preferences, localAlertState]) => {
      if (cancelled) return;
      const conflicts = [] as { kind: "watchlist" | "saved-screen" | "alert-preference" | "alert-rule"; key: string; detail: string; resolution: "local" | "server" | "merged" | "pending" }[];

      await Promise.all(watchlist.map((symbol) => watchlistUpsert.mutateAsync({ symbol }).catch(() => undefined)));
      await Promise.all(screens.map((screen) => screenUpsert.mutateAsync({ name: screen.name, filters: screen.filters }).catch(() => undefined)));
      await prefsUpsert.mutateAsync({ enabled: preferences.enabled, minimumScore: preferences.minimumScore, channels: preferences.channels, quietHoursEnabled: preferences.quietHoursEnabled, quietStart: preferences.quietStart, quietEnd: preferences.quietEnd, timezone: preferences.timezone, quietHoursOverrideForCritical: preferences.quietHoursOverrideForCritical }).catch(() => undefined);
      await Promise.all((localAlertState ?? []).map((enabled, index) => alertRuleUpsert.mutateAsync({ id: `legacy-local-${index}`, title: `Legacy local rule ${index + 1}`, query: enabled ? "legacy-local-enabled" : "legacy-local-disabled", enabled }).catch(() => undefined)));
      setWorkspaceSyncSnapshot({ status: conflicts.length ? "partial" : "synced", lastSuccessAt: new Date().toISOString(), conflicts });
    }).catch((error: unknown) => { setWorkspaceSyncSnapshot({ status: "failed", error: error instanceof Error ? error.message : "Sync failed" }); });
    return () => { cancelled = true; };
  }, [alertRuleUpsert, isAuthenticated, prefsUpsert, retryNonce, screenUpsert, user, watchlistUpsert]);

  return null;
}
