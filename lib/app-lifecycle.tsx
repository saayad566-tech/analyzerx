import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

import {
  INITIAL_APP_LIFECYCLE,
  describeAppLifecycle,
  isBusy,
  reduceAppLifecycle,
  retryDelayMs,
  type AppLifecycleEvent,
  type AppLifecycleModel,
  type AppVisibility,
} from "@/lib/app-state";
import { probeApiReachability, type ConnectivityProbe, type ConnectivityState } from "@/lib/connectivity";

const LIFECYCLE_STORAGE_KEY = "analyzerx.app-lifecycle.v1";
/** Bump when the persisted envelope shape changes; migration lives in reviveModel. */
const LIFECYCLE_SCHEMA_VERSION = 2;
/** How often to re-probe reachability while the app is active. */
const CONNECTIVITY_POLL_MS = 30_000;

/** A best-effort async task (a disk flush or a cache trim). */
export type LifecycleTask = () => void | Promise<void>;

export type AppLifecycleContextValue = {
  model: AppLifecycleModel;
  state: AppLifecycleModel["state"];
  /** True for loading/reconnecting/uninitialized — show a loader over content. */
  busy: boolean;
  descriptor: ReturnType<typeof describeAppLifecycle>;
  visibility: AppVisibility;
  isBackgrounded: boolean;
  lastError: string | null;
  retryCount: number;
  /** Move to `loading` to begin the initial data load. */
  beginLoading: () => void;
  /** Primary data is available and rendered. */
  reportReady: () => void;
  /** The load completed but produced no records. */
  reportEmpty: () => void;
  /** A recoverable failure occurred; message is shown verbatim. */
  reportError: (message: string) => void;
  /** Connectivity was lost while cached content is on screen. */
  reportOffline: () => void;
  /** Retry with deterministic exponential backoff. */
  retry: () => void;
  /** Register an async write-flush to run when the app is backgrounded. */
  registerFlush: (task: LifecycleTask) => () => void;
  /** Register a cache-trim to run under OS memory pressure. */
  registerTrim: (task: LifecycleTask) => () => void;
  /** Force every registered writer to flush now. */
  flushNow: () => Promise<void>;
  /** Latest known reachability of the configured API origin. */
  connectivity: ConnectivityState;
  /** Probe reachability now and reconcile the lifecycle state. */
  checkConnectivity: () => Promise<ConnectivityState>;
  /** Replace the reachability probe (e.g. a NetInfo adapter or a test double). */
  setConnectivityProbe: (probe: ConnectivityProbe) => void;
};

const AppLifecycleContext = createContext<AppLifecycleContextValue | null>(null);

const VALID_STATES: ReadonlyArray<AppLifecycleModel["state"]> = [
  "uninitialized",
  "loading",
  "ready",
  "offline",
  "empty-data",
  "error",
  "reconnecting",
];

function toVisibility(status: AppStateStatus): AppVisibility {
  if (status === "active") return "active";
  if (status === "background") return "background";
  if (status === "inactive") return "inactive";
  return "unknown";
}

/** Coerce a persisted blob back into a trusted model, or return null. */
function reviveModel(raw: string | null): AppLifecycleModel | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    // Envelope v2+ stores { schema, model }; v1 stored the bare model. Both are
    // accepted so an upgrade never loses the restored state.
    const envelope = parsed as { schema?: unknown; model?: unknown };
    const candidate = envelope && typeof envelope === "object" && typeof envelope.schema === "number" ? envelope.model : parsed;
    const saved = candidate as Partial<AppLifecycleModel>;
    if (!saved || typeof saved.state !== "string" || !VALID_STATES.includes(saved.state as AppLifecycleModel["state"])) return null;
    const state = saved.state === "loading" || saved.state === "reconnecting" || saved.state === "uninitialized"
      ? "ready"
      : (saved.state as AppLifecycleModel["state"]);
    return {
      state,
      lastError: typeof saved.lastError === "string" ? saved.lastError : null,
      retryCount: typeof saved.retryCount === "number" && Number.isFinite(saved.retryCount) ? saved.retryCount : 0,
      lastTransitionAt: typeof saved.lastTransitionAt === "number" ? saved.lastTransitionAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function AppLifecycleProvider({ children }: { children: React.ReactNode }) {
  const [model, setModel] = useState<AppLifecycleModel>(INITIAL_APP_LIFECYCLE);
  const [visibility, setVisibility] = useState<AppVisibility>("unknown");
  const [hydrated, setHydrated] = useState(false);
  const flushTasks = useRef(new Set<LifecycleTask>());
  const trimTasks = useRef(new Set<LifecycleTask>());
  const modelRef = useRef(model);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectivityProbe = useRef<ConnectivityProbe>(probeApiReachability);
  const [connectivity, setConnectivity] = useState<ConnectivityState>("unknown");
  modelRef.current = model;

  const dispatch = useCallback((event: AppLifecycleEvent) => {
    setModel((current) => reduceAppLifecycle(current, event));
  }, []);

  const runTasks = useCallback(async (tasks: Set<LifecycleTask>) => {
    await Promise.all([...tasks].map(async (task) => {
      try {
        await task();
      } catch {
        // Flushes and trims are best-effort; a failure never blocks backgrounding.
      }
    }));
  }, []);

  const flushNow = useCallback(() => runTasks(flushTasks.current), [runTasks]);

  // Rehydrate the last known lifecycle before first paint to avoid layout shift.
  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(LIFECYCLE_STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;
        const revived = reviveModel(raw);
        if (revived) setModel(revived);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Start the initial load only if rehydration did not already restore a resting state.
  useEffect(() => {
    if (!hydrated) return;
    if (modelRef.current.state === "uninitialized") dispatch({ type: "BOOTSTRAP_START" });
  }, [dispatch, hydrated]);

  // Persist on every significant transition (post-rehydration only), inside a
  // versioned envelope so future shape changes can migrate safely.
  useEffect(() => {
    if (!hydrated) return;
    const envelope = { schema: LIFECYCLE_SCHEMA_VERSION, model };
    void AsyncStorage.setItem(LIFECYCLE_STORAGE_KEY, JSON.stringify(envelope)).catch(() => undefined);
  }, [hydrated, model]);

  // OS lifecycle: background flushes, foreground reconnect, memory-pressure trims.
  useEffect(() => {
    setVisibility(toVisibility(AppState.currentState));
    const changeSubscription = AppState.addEventListener("change", (status) => {
      const next = toVisibility(status);
      setVisibility(next);
      if (next === "background" || next === "inactive") {
        void flushNow();
      }
      if (next === "active") {
        const current = modelRef.current.state;
        if (current === "offline" || current === "error") dispatch({ type: "RECONNECT_START" });
      }
    });
    const memorySubscription = AppState.addEventListener("memoryWarning", () => {
      void (async () => {
        await flushNow();
        await runTasks(trimTasks.current);
      })();
    });
    return () => {
      changeSubscription.remove();
      memorySubscription.remove();
    };
  }, [dispatch, flushNow, runTasks]);

  // Explicit connectivity: probe on startup and while active, and reconcile the
  // lifecycle so the UI shows cached content the moment the network drops.
  const checkConnectivity = useCallback(async (): Promise<ConnectivityState> => {
    const result = await connectivityProbe.current().catch(() => "unknown" as ConnectivityState);
    setConnectivity(result);
    const current = modelRef.current.state;
    if (result === "offline" && current !== "uninitialized") dispatch({ type: "CONNECTIVITY_LOST" });
    else if (result === "online" && (current === "offline" || current === "reconnecting")) dispatch({ type: "RECONNECT_SUCCESS", hasData: true });
    return result;
  }, [dispatch]);

  const setConnectivityProbe = useCallback((probe: ConnectivityProbe) => {
    connectivityProbe.current = probe;
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void checkConnectivity();
  }, [checkConnectivity, hydrated]);

  useEffect(() => {
    if (visibility !== "active") return;
    void checkConnectivity();
    const interval = setInterval(() => { void checkConnectivity(); }, CONNECTIVITY_POLL_MS);
    return () => clearInterval(interval);
  }, [checkConnectivity, visibility]);

  useEffect(() => () => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
  }, []);

  const beginLoading = useCallback(() => dispatch({ type: "BOOTSTRAP_START" }), [dispatch]);
  const reportReady = useCallback(() => dispatch({ type: "BOOTSTRAP_SUCCESS", hasData: true }), [dispatch]);
  const reportEmpty = useCallback(() => dispatch({ type: "BOOTSTRAP_EMPTY" }), [dispatch]);
  const reportError = useCallback((message: string) => dispatch({ type: "BOOTSTRAP_FAILURE", message }), [dispatch]);
  const reportOffline = useCallback(() => dispatch({ type: "CONNECTIVITY_LOST" }), [dispatch]);

  const retry = useCallback(() => {
    const delay = retryDelayMs(modelRef.current.retryCount);
    dispatch({ type: "RECONNECT_START" });
    if (retryTimer.current) clearTimeout(retryTimer.current);
    // Safety net: if no data layer reports success/failure within the backoff
    // window, surface an honest offline state instead of hanging on "reconnecting".
    retryTimer.current = setTimeout(() => {
      if (modelRef.current.state === "reconnecting") {
        dispatch({ type: "RECONNECT_FAILURE", message: "The reconnect attempt did not complete." });
      }
    }, delay);
  }, [dispatch]);

  const registerFlush = useCallback((task: LifecycleTask) => {
    flushTasks.current.add(task);
    return () => {
      flushTasks.current.delete(task);
    };
  }, []);

  const registerTrim = useCallback((task: LifecycleTask) => {
    trimTasks.current.add(task);
    return () => {
      trimTasks.current.delete(task);
    };
  }, []);

  const value = useMemo<AppLifecycleContextValue>(() => ({
    model,
    state: model.state,
    busy: isBusy(model.state),
    descriptor: describeAppLifecycle(model.state),
    visibility,
    isBackgrounded: visibility === "background",
    lastError: model.lastError,
    retryCount: model.retryCount,
    beginLoading,
    reportReady,
    reportEmpty,
    reportError,
    reportOffline,
    retry,
    registerFlush,
    registerTrim,
    flushNow,
    connectivity,
    checkConnectivity,
    setConnectivityProbe,
  }), [beginLoading, checkConnectivity, connectivity, flushNow, model, registerFlush, registerTrim, reportEmpty, reportError, reportOffline, reportReady, retry, setConnectivityProbe, visibility]);

  return <AppLifecycleContext.Provider value={value}>{children}</AppLifecycleContext.Provider>;
}

/** Access the app-wide lifecycle. Must be used inside `AppLifecycleProvider`. */
export function useAppLifecycle(): AppLifecycleContextValue {
  const context = useContext(AppLifecycleContext);
  if (!context) throw new Error("useAppLifecycle must be used within an AppLifecycleProvider");
  return context;
}
