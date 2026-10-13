/**
 * AnalyzerX application lifecycle state machine.
 *
 * Every screen otherwise invents its own ad-hoc "loading / error / empty"
 * booleans, so the app has no single answer to "what state are we in?". This
 * module defines the seven deterministic states the product needs and a pure
 * reducer that maps them, so the whole app reacts to one model.
 *
 * The reducer is pure and side-effect free: given the same model, event and
 * clock reading it always produces the same next model. Persistence and OS
 * event wiring live in `app-lifecycle.tsx`.
 */

/** The seven explicit application states. No implicit "undefined" state exists. */
export type AppLifecycleState =
  | "uninitialized"
  | "loading"
  | "ready"
  | "offline"
  | "empty-data"
  | "error"
  | "reconnecting";

/** OS-level visibility, mapped from React Native's `AppStateStatus`. */
export type AppVisibility = "active" | "background" | "inactive" | "unknown";

export type AppLifecycleEvent =
  | { type: "BOOTSTRAP_START" }
  | { type: "BOOTSTRAP_SUCCESS"; hasData: boolean }
  | { type: "BOOTSTRAP_EMPTY" }
  | { type: "BOOTSTRAP_FAILURE"; message: string }
  | { type: "CONNECTIVITY_LOST" }
  | { type: "RECONNECT_START" }
  | { type: "RECONNECT_SUCCESS"; hasData: boolean }
  | { type: "RECONNECT_FAILURE"; message: string }
  | { type: "DATA_EMPTY" }
  | { type: "DATA_AVAILABLE" }
  | { type: "RESET" };

export type AppLifecycleModel = {
  state: AppLifecycleState;
  /** Human-readable last failure, or null. Never a raw stack. */
  lastError: string | null;
  /** Number of failure/reconnect attempts observed — drives backoff in callers. */
  retryCount: number;
  /** Epoch-ms of the most recent transition; 0 for the pristine model. */
  lastTransitionAt: number;
};

export const INITIAL_APP_LIFECYCLE: AppLifecycleModel = {
  state: "uninitialized",
  lastError: null,
  retryCount: 0,
  lastTransitionAt: 0,
};

/**
 * Declared transition table — the single source of truth for which state may
 * follow which. `canTransition` and the reducer both honour it.
 */
export const APP_LIFECYCLE_TRANSITIONS: Record<AppLifecycleState, readonly AppLifecycleState[]> = {
  uninitialized: ["loading", "error", "offline"],
  loading: ["ready", "empty-data", "error", "offline"],
  ready: ["loading", "offline", "empty-data", "reconnecting", "error"],
  "empty-data": ["loading", "ready", "offline", "reconnecting", "error"],
  error: ["loading", "offline", "reconnecting", "ready", "empty-data"],
  offline: ["reconnecting", "loading", "ready", "empty-data", "error"],
  reconnecting: ["ready", "empty-data", "error", "offline", "loading"],
};

export function canTransition(from: AppLifecycleState, to: AppLifecycleState): boolean {
  return from === to || APP_LIFECYCLE_TRANSITIONS[from].includes(to);
}

export type AppLifecycleDescriptor = {
  label: string;
  /** Whether cached/previous content should remain on screen. */
  keepsContent: boolean;
  /** Whether the state should block the screen with a loader. */
  isBlocking: boolean;
  /** Whether the user can interact with data in this state. */
  isInteractive: boolean;
};

const DESCRIPTORS: Record<AppLifecycleState, AppLifecycleDescriptor> = {
  uninitialized: { label: "Starting", keepsContent: false, isBlocking: true, isInteractive: false },
  loading: { label: "Loading", keepsContent: false, isBlocking: true, isInteractive: false },
  ready: { label: "Ready", keepsContent: true, isBlocking: false, isInteractive: true },
  offline: { label: "Offline — showing saved data", keepsContent: true, isBlocking: false, isInteractive: true },
  "empty-data": { label: "No data yet", keepsContent: true, isBlocking: false, isInteractive: true },
  error: { label: "Something went wrong", keepsContent: true, isBlocking: false, isInteractive: true },
  reconnecting: { label: "Reconnecting", keepsContent: true, isBlocking: false, isInteractive: true },
};

export function describeAppLifecycle(state: AppLifecycleState): AppLifecycleDescriptor {
  return DESCRIPTORS[state];
}

/** True for states where a spinner over cached content is appropriate. */
export function isBusy(state: AppLifecycleState): boolean {
  return state === "loading" || state === "reconnecting" || state === "uninitialized";
}

/**
 * Pure reducer. `now` is injected so transitions are deterministic and testable;
 * callers pass `Date.now()` at the call site.
 */
export function reduceAppLifecycle(
  model: AppLifecycleModel,
  event: AppLifecycleEvent,
  now: number = Date.now(),
): AppLifecycleModel {
  const move = (state: AppLifecycleState, lastError: string | null = null, retryCount = model.retryCount): AppLifecycleModel => {
    // Idempotent: an event that changes nothing returns the same object, so
    // repeated reports (e.g. "ready") never trigger re-renders or write loops.
    if (state === model.state && lastError === model.lastError && retryCount === model.retryCount) return model;
    if (!canTransition(model.state, state)) return model;
    return { state, lastError, retryCount, lastTransitionAt: now };
  };

  switch (event.type) {
    case "RESET":
      return { ...INITIAL_APP_LIFECYCLE, lastTransitionAt: now };
    case "BOOTSTRAP_START":
      return move("loading", null, 0);
    case "BOOTSTRAP_SUCCESS":
      return move(event.hasData ? "ready" : "empty-data", null);
    case "BOOTSTRAP_EMPTY":
      return move("empty-data", null);
    case "BOOTSTRAP_FAILURE":
      return move("error", event.message, model.retryCount + 1);
    case "CONNECTIVITY_LOST":
      return model.state === "uninitialized" ? model : move("offline", model.lastError);
    case "RECONNECT_START":
      return move("reconnecting", null, model.retryCount + 1);
    case "RECONNECT_SUCCESS":
      return move(event.hasData ? "ready" : "empty-data", null);
    case "RECONNECT_FAILURE":
      return move("offline", event.message, model.retryCount + 1);
    case "DATA_EMPTY":
      return model.state === "ready" ? move("empty-data", null) : model;
    case "DATA_AVAILABLE":
      return move("ready", null);
    default:
      return model;
  }
}

/** Exponential backoff (ms) for retry attempts, capped — pure and deterministic. */
export function retryDelayMs(retryCount: number, base = 750, cap = 30_000): number {
  const safeCount = Math.max(0, Math.floor(retryCount));
  return Math.min(cap, base * 2 ** safeCount);
}
