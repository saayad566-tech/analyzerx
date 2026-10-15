/** Battery facts, backed by react-native-device-info. */
import DeviceInfo from "react-native-device-info";

export const BatteryState = {
  UNKNOWN: "unknown",
  UNPLUGGED: "unplugged",
  CHARGING: "charging",
  FULL: "full",
} as const;

export async function isAvailableAsync(): Promise<boolean> {
  return true;
}

export async function getBatteryLevelAsync(): Promise<number> {
  const level = await DeviceInfo.getBatteryLevel();
  return typeof level === "number" && Number.isFinite(level) ? level : -1;
}

export async function getBatteryStateAsync(): Promise<string> {
  const charging = await DeviceInfo.isBatteryCharging();
  if (!charging) return BatteryState.UNPLUGGED;
  const level = await DeviceInfo.getBatteryLevel();
  return level >= 0.999 ? BatteryState.FULL : BatteryState.CHARGING;
}
