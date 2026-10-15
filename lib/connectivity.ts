import { getApiBaseUrl } from "@/constants/oauth";

/**
 * Explicit connectivity probe.
 *
 * The app is on-device first, so most flows work with no network at all. But the
 * lifecycle machine still needs to know when the device is genuinely offline so
 * it can show cached content instead of an error. This module probes the
 * configured API origin: any HTTP response (even a 404/405) proves the host is
 * reachable; only a network-level failure counts as offline. When no origin is
 * configured the result is `unknown`, and the app stays on local data.
 */

export type ConnectivityState = "online" | "offline" | "unknown";

export type ConnectivityProbe = () => Promise<ConnectivityState>;

const DEFAULT_TIMEOUT_MS = 5_000;

export async function probeApiReachability(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<ConnectivityState> {
  let base: string;
  try {
    base = getApiBaseUrl();
  } catch {
    return "unknown";
  }
  if (!base || !/^https?:\/\//i.test(base)) return "unknown";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // HEAD keeps the probe cheap; a resolved promise (any status) means the
    // network path is up. A thrown error means DNS/connection failure.
    await fetch(base, { method: "HEAD", signal: controller.signal });
    return "online";
  } catch {
    return "offline";
  } finally {
    clearTimeout(timer);
  }
}
