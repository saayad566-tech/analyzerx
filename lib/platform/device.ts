/** Device facts, backed by react-native-device-info. */
import DeviceInfo from "react-native-device-info";

export const modelName: string | null = DeviceInfo.getModel();
export const brand: string | null = DeviceInfo.getBrand();
export const osName: string = DeviceInfo.getSystemName();
export const osVersion: string = DeviceInfo.getSystemVersion();
export const deviceName: string | null = DeviceInfo.getDeviceNameSync();
export const isDevice = true;
export const totalMemory: number | null = DeviceInfo.getTotalMemorySync();
export const supportedCpuArchitectures: string[] = DeviceInfo.supportedAbisSync();
