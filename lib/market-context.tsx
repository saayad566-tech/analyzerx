import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/use-auth";
import { DEFAULT_MARKET_ID, getMarketProfile, type MarketId, type MarketProfile } from "@/lib/market-regions";
import { fireAndForget } from "@/lib/fire-and-forget";

const MARKET_PREFERENCE_KEY = "analyzerx.market.primary.v1";
const MARKET_META_KEY = "analyzerx.market.primary.meta.v1";
type LocalMarketMeta = { marketId: MarketId; updatedAt: string; revision: number };

type MarketContextValue = {
  market: MarketProfile;
  marketId: MarketId;
  ready: boolean;
  syncStatus: "local" | "syncing" | "synced" | "conflict";
  setMarketId: (id: MarketId) => Promise<void>;
};

const MarketContext = createContext<MarketContextValue | null>(null);

function validMarketId(value: string | null | undefined): MarketId {
  return getMarketProfile(value).id;
}

export function MarketProvider({ children }: PropsWithChildren) {
  const { isAuthenticated } = useAuth();
  const [marketId, setMarketIdState] = useState<MarketId>(DEFAULT_MARKET_ID);
  const [localMeta, setLocalMeta] = useState<LocalMarketMeta>({ marketId: DEFAULT_MARKET_ID, updatedAt: new Date(0).toISOString(), revision: 1 });
  const [ready, setReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<MarketContextValue["syncStatus"]>("local");
  const remotePreference = trpc.account.marketPreference.useQuery(undefined, { enabled: isAuthenticated, staleTime: 30_000, retry: false });
  const syncMutation = trpc.account.marketPreferenceSync.useMutation();

  useEffect(() => {
    let active = true;
    void Promise.all([AsyncStorage.getItem(MARKET_PREFERENCE_KEY), AsyncStorage.getItem(MARKET_META_KEY)]).then(([value, metaValue]) => {
      if (!active) return;
      const selected = validMarketId(value);
      let meta: LocalMarketMeta = { marketId: selected, updatedAt: new Date(0).toISOString(), revision: 1 };
      try {
        const parsed = metaValue ? JSON.parse(metaValue) as Partial<LocalMarketMeta> : null;
        if (parsed && typeof parsed.updatedAt === "string" && Number.isFinite(parsed.revision)) meta = { marketId: validMarketId(parsed.marketId), updatedAt: parsed.updatedAt, revision: Math.max(1, parsed.revision ?? 1) };
      } catch { /* malformed local metadata is safely replaced */ }
      setMarketIdState(selected);
      setLocalMeta(meta);
      setReady(true);
    }).catch(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!ready || !isAuthenticated || remotePreference.isLoading || remotePreference.isError) return;
    const remote = remotePreference.data;
    if (!remote) {
      setSyncStatus("syncing");
      fireAndForget(syncMutation.mutateAsync({ marketId: localMeta.marketId, clientUpdatedAt: localMeta.updatedAt, clientRevision: localMeta.revision, clientWriter: "device" }).then((result) => setSyncStatus(result.conflict ? "conflict" : "synced")).catch(() => setSyncStatus("local")), "syncMutation.mutateAsync");
      return;
    }
    const remoteTime = new Date(remote.clientUpdatedAt).getTime();
    const localTime = new Date(localMeta.updatedAt).getTime();
    const remoteWins = remoteTime > localTime || (remoteTime === localTime && remote.revision >= localMeta.revision);
    if (remoteWins) {
      const nextId = validMarketId(remote.marketId);
      const nextMeta = { marketId: nextId, updatedAt: new Date(remote.clientUpdatedAt).toISOString(), revision: remote.revision } satisfies LocalMarketMeta;
      setMarketIdState(nextId);
      setLocalMeta(nextMeta);
      fireAndForget(AsyncStorage.multiSet([[MARKET_PREFERENCE_KEY, nextId], [MARKET_META_KEY, JSON.stringify(nextMeta)]]), "AsyncStorage.multiSet");
      setSyncStatus(remote.conflictCount > 0 ? "conflict" : "synced");
    } else if (remote.marketId !== localMeta.marketId || remote.revision !== localMeta.revision) {
      setSyncStatus("syncing");
      fireAndForget(syncMutation.mutateAsync({ marketId: localMeta.marketId, clientUpdatedAt: localMeta.updatedAt, clientRevision: localMeta.revision, clientWriter: "device" }).then((result) => setSyncStatus(result.conflict ? "conflict" : "synced")).catch(() => setSyncStatus("local")), "syncMutation.mutateAsync");
    } else {
      setSyncStatus(remote.conflictCount > 0 ? "conflict" : "synced");
    }
  }, [isAuthenticated, localMeta, ready, remotePreference.data, remotePreference.isError, remotePreference.isLoading, syncMutation]);

  const setMarketId = useCallback(async (id: MarketId) => {
    const nextId = validMarketId(id);
    const nextMeta: LocalMarketMeta = { marketId: nextId, updatedAt: new Date().toISOString(), revision: localMeta.revision + 1 };
    setMarketIdState(nextId);
    setLocalMeta(nextMeta);
    setSyncStatus(isAuthenticated ? "syncing" : "local");
    try { await AsyncStorage.multiSet([[MARKET_PREFERENCE_KEY, nextId], [MARKET_META_KEY, JSON.stringify(nextMeta)]]); } catch { /* in-memory state remains authoritative */ }
    if (isAuthenticated) {
      try {
        const result = await syncMutation.mutateAsync({ marketId: nextId, clientUpdatedAt: nextMeta.updatedAt, clientRevision: nextMeta.revision, clientWriter: "device" });
        setSyncStatus(result.conflict ? "conflict" : "synced");
      } catch { setSyncStatus("local"); }
    }
  }, [isAuthenticated, localMeta.revision, syncMutation]);

  const value = useMemo(() => ({ market: getMarketProfile(marketId), marketId, ready, syncStatus, setMarketId }), [marketId, ready, setMarketId, syncStatus]);
  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>;
}

export function useMarketContext() {
  const context = useContext(MarketContext);
  if (!context) throw new Error("useMarketContext must be used inside MarketProvider");
  return context;
}
