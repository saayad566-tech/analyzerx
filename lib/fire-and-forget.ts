/**
 * Fire-and-forget, without the silent failure.
 *
 * `void somePromise` marks the intent to not await, but it does **not** handle rejection: if the
 * promise rejects, it becomes an unhandled rejection that is swallowed or surfaced as a red box.
 * Wrapping the call here keeps the non-blocking behaviour and guarantees the failure is recorded.
 */
import { logActivity } from "@/lib/activity-log";

/**
 * Run an operation without awaiting it, recording any rejection to the activity log.
 *
 * @param operation the promise to run in the background
 * @param label a short name for the operation, used in the log entry
 */
export function fireAndForget(operation: Promise<unknown>, label = "background operation"): void {
  operation
    .catch((error: unknown) => {
      const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      // The logging call is itself fire-and-forget; a failure to log must not become a new rejection.
      return logActivity("warning", `${label} failed`, detail).catch(() => undefined);
    })
    .catch(() => undefined);
}

/**
 * Install a process-level guard so that a rejection which escapes a call site is still recorded
 * rather than lost. Returns a disposer, which keeps it testable.
 */
export function installUnhandledRejectionGuard(): () => void {
  const handler = (event: unknown) => {
    const reason = (event as { reason?: unknown })?.reason;
    const detail = reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason);
    fireAndForget(logActivity("error", "Unhandled promise rejection", detail).catch(() => undefined), "logActivity");
  };
  const scope = globalThis as unknown as {
    addEventListener?: (type: string, listener: (event: unknown) => void) => void;
    removeEventListener?: (type: string, listener: (event: unknown) => void) => void;
  };
  if (typeof scope.addEventListener !== "function") return () => undefined;
  scope.addEventListener("unhandledrejection", handler);
  return () => scope.removeEventListener?.("unhandledrejection", handler);
}
