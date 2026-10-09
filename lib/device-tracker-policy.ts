export const DEVICE_TRACKER_THERMAL_PAUSE_CELSIUS = 45;
export const DEVICE_TRACKER_DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

export type DeviceTrackerMode = "server-only" | "android-assist";
export type DeviceTrackerAvailability = "server-only" | "native-build-required" | "available";

export function getDeviceTrackerAvailability(platform: "android" | "ios" | "web", nativeModuleAvailable = false): DeviceTrackerAvailability {
  if (platform !== "android") return "server-only";
  return nativeModuleAvailable ? "available" : "native-build-required";
}

export function shouldPauseDeviceInference(temperatureCelsius: number | null | undefined): boolean {
  return typeof temperatureCelsius === "number" && Number.isFinite(temperatureCelsius) && temperatureCelsius >= DEVICE_TRACKER_THERMAL_PAUSE_CELSIUS;
}

export function getSafeDeviceTrackerIntervalMs(temperatureCelsius: number | null | undefined): number {
  return shouldPauseDeviceInference(temperatureCelsius) ? 10 * 60 * 1000 : DEVICE_TRACKER_DEFAULT_INTERVAL_MS;
}

export function getDeviceTrackerDisclosure(mode: DeviceTrackerMode): string {
  if (mode === "server-only") return "Server tracker is the reliable continuous path; device processing is off.";
  return "Android device assist is best-effort, user-started, battery-aware, and requires a custom native build. It does not guarantee 24/7 execution.";
}
