import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeModules, Platform } from "react-native";
import * as Battery from "expo-battery";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as SecureStore from "expo-secure-store";
import { localAIInferenceSamplesToCsv } from "./local-ai-telemetry-core";
import type { LocalAIInferenceSample } from "./local-ai-telemetry-core";

export { localAIInferenceSamplesToCsv, summarizeLocalAIInference } from "./local-ai-telemetry-core";
export type { LocalAIInferenceSample } from "./local-ai-telemetry-core";

const TELEMETRY_KEY = "analyzerx.local-ai.telemetry.v1";
const RETENTION_KEY = "analyzerx.local-ai.telemetry.retention.v1";
export const LOCAL_AI_RETENTION_OPTIONS = [25, 50, 100, 250] as const;
export type LocalAIRetentionLimit = typeof LOCAL_AI_RETENTION_OPTIONS[number];
const DEFAULT_RETENTION: LocalAIRetentionLimit = 100;
const BACKUP_KEY = "analyzerx.local-ai.telemetry.backup-key.v1";

export async function getLocalAIPowerSnapshot(): Promise<Pick<LocalAIInferenceSample, "batteryLevel" | "isCharging">> {
  if (Platform.OS === "web") return { batteryLevel: null, isCharging: null };
  try {
    if (!(await Battery.isAvailableAsync())) return { batteryLevel: null, isCharging: null };
    const [batteryLevel, batteryState] = await Promise.all([Battery.getBatteryLevelAsync(), Battery.getBatteryStateAsync()]);
    return { batteryLevel: batteryLevel >= 0 ? batteryLevel : null, isCharging: batteryState === Battery.BatteryState.CHARGING || batteryState === Battery.BatteryState.FULL };
  } catch {
    return { batteryLevel: null, isCharging: null };
  }
}

type NativeDeviceTelemetry = { usedMemoryBytes?: number; thermalStatus?: string };

export async function getLocalAIDeviceTelemetrySnapshot(): Promise<Pick<LocalAIInferenceSample, "batteryLevel" | "isCharging" | "memoryBytes" | "thermalStatus">> {
  const power = await getLocalAIPowerSnapshot();
  if (Platform.OS === "web" || !NativeModules.AnalyzerXLocalAI?.getDeviceTelemetry) return { ...power, memoryBytes: null, thermalStatus: "unavailable" };
  try {
    const native = await NativeModules.AnalyzerXLocalAI.getDeviceTelemetry() as NativeDeviceTelemetry;
    return { ...power, memoryBytes: typeof native.usedMemoryBytes === "number" ? native.usedMemoryBytes : null, thermalStatus: native.thermalStatus ?? "unknown" };
  } catch {
    return { ...power, memoryBytes: null, thermalStatus: "unavailable" };
  }
}

export async function getLocalAIRetentionLimit(): Promise<LocalAIRetentionLimit> {
  const value = await AsyncStorage.getItem(RETENTION_KEY);
  const parsed = Number(value);
  return LOCAL_AI_RETENTION_OPTIONS.includes(parsed as LocalAIRetentionLimit) ? parsed as LocalAIRetentionLimit : DEFAULT_RETENTION;
}

export async function setLocalAIRetentionLimit(limit: LocalAIRetentionLimit): Promise<void> {
  await AsyncStorage.setItem(RETENTION_KEY, String(limit));
  const existing = await loadLocalAIInferenceSamples();
  await AsyncStorage.setItem(TELEMETRY_KEY, JSON.stringify(existing.slice(-limit)));
}

export async function clearLocalAIInferenceSamples(): Promise<void> {
  await AsyncStorage.removeItem(TELEMETRY_KEY);
}

export async function recordLocalAIInference(sample: LocalAIInferenceSample): Promise<void> {
  const existing = await loadLocalAIInferenceSamples();
  const limit = await getLocalAIRetentionLimit();
  await AsyncStorage.setItem(TELEMETRY_KEY, JSON.stringify([...existing, sample].slice(-limit)));
}

export async function loadLocalAIInferenceSamples(): Promise<LocalAIInferenceSample[]> {
  const value = await AsyncStorage.getItem(TELEMETRY_KEY);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isTelemetrySample) : [];
  } catch {
    return [];
  }
}

function bytesToBase64(bytes: Uint8Array): string { return btoa(String.fromCharCode(...bytes)); }
function base64ToBytes(value: string): Uint8Array { return Uint8Array.from(atob(value), (character) => character.charCodeAt(0)); }

async function getTelemetryBackupKey(): Promise<CryptoKey> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || !globalThis.crypto?.getRandomValues) throw new Error("Authenticated device encryption is unavailable in this build.");
  let encoded = await SecureStore.getItemAsync(BACKUP_KEY);
  if (!encoded) { const raw = new Uint8Array(32); globalThis.crypto.getRandomValues(raw); encoded = bytesToBase64(raw); await SecureStore.setItemAsync(BACKUP_KEY, encoded, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }); }
  return subtle.importKey("raw", base64ToBytes(encoded) as unknown as ArrayBuffer, "AES-GCM", false, ["encrypt"]);
}

export async function exportEncryptedLocalAITelemetryBackup(samples?: LocalAIInferenceSample[]): Promise<{ uri: string; shared: boolean }> {
  const backupSamples = samples ?? await loadLocalAIInferenceSamples();
  const root = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!root) throw new Error("Device file storage is unavailable.");
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || !globalThis.crypto?.getRandomValues) throw new Error("Authenticated device encryption is unavailable in this build.");
  const iv = new Uint8Array(12); globalThis.crypto.getRandomValues(iv);
  const key = await getTelemetryBackupKey();
  const plaintext = new TextEncoder().encode(JSON.stringify({ version: 1, createdAt: new Date().toISOString(), samples: backupSamples }));
  const ciphertext = await subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  const uri = `${root}analyzerx-local-ai-telemetry-${new Date().toISOString().replace(/[:.]/g, "-")}.encrypted.json`;
  await FileSystem.writeAsStringAsync(uri, JSON.stringify({ version: 1, algorithm: "AES-GCM", iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) }), { encoding: FileSystem.EncodingType.UTF8 });
  const canShare = await Sharing.isAvailableAsync().catch(() => false);
  if (canShare) await Sharing.shareAsync(uri, { mimeType: "application/json", dialogTitle: "Back up encrypted AnalyzerX Local AI telemetry" });
  return { uri, shared: canShare };
}

export async function exportLocalAIInferenceCsv(samples?: LocalAIInferenceSample[]): Promise<{ uri: string; shared: boolean }> {
  const exportSamples = samples ?? await loadLocalAIInferenceSamples();
  const root = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!root) throw new Error("Device file storage is unavailable.");
  const uri = `${root}analyzerx-local-ai-telemetry-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
  await FileSystem.writeAsStringAsync(uri, localAIInferenceSamplesToCsv(exportSamples), { encoding: FileSystem.EncodingType.UTF8 });
  const canShare = await Sharing.isAvailableAsync().catch(() => false);
  if (canShare) {
    await Sharing.shareAsync(uri, { mimeType: "text/csv", dialogTitle: "Export AnalyzerX Local AI telemetry" });
  }
  return { uri, shared: canShare };
}

function isTelemetrySample(value: unknown): value is LocalAIInferenceSample {
  if (!value || typeof value !== "object") return false;
  const sample = value as Partial<LocalAIInferenceSample>;
  return typeof sample.modelId === "string" && typeof sample.durationMs === "number" && typeof sample.tokenCount === "number" && typeof sample.success === "boolean";
}
