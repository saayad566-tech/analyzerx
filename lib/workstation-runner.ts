import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export type RunnerStatus = "disconnected" | "pairing" | "paired" | "starting" | "idle" | "running" | "paused" | "degraded" | "offline" | "error";
export type RunnerJobStatus = "queued" | "running" | "completed" | "cancelled" | "failed";

export type RunnerJob = {
  id: string;
  taskType: string;
  modelId: string;
  status: RunnerJobStatus;
  stage: string;
  progress: number;
  createdAt: number;
  finishedAt?: number;
  cancelRequested?: boolean;
};

export type RunnerHardware = {
  platform: string;
  osVersion: string;
  python: string;
  architecture: string;
  cpuCount: number;
  memoryBytes: number | null;
  gpu: { status: string; backend: string };
  backends: string[];
  freeStorageBytes: number | null;
};

export type RunnerProvider = { provider: string; configured: boolean; masked: string; status: string; lastHealth: string | null };
export type RunnerState = { status: RunnerStatus; hardware: RunnerHardware; jobs: RunnerJob[]; providers: RunnerProvider[]; lastHeartbeat: number };

const TOKEN_KEY = "analyzerx.byoh.runner.token";
const URL_KEY = "analyzerx.byoh.runner.url";
const DEFAULT_URL = "http://127.0.0.1:8765";
const DISCOVERY_PORT = 37020;

export async function getRunnerConnection() {
  // The URL is not sensitive and stays in AsyncStorage; the token is a
  // credential and is held in the platform secure store, like the session token.
  const [url, token] = await Promise.all([AsyncStorage.getItem(URL_KEY), SecureStore.getItemAsync(TOKEN_KEY)]);
  return { url: url || DEFAULT_URL, token };
}

export async function saveRunnerConnection(url: string, token: string) {
  await AsyncStorage.setItem(URL_KEY, url.replace(/\/$/, ""));
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearRunnerConnection() {
  await AsyncStorage.removeItem(URL_KEY);
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

async function request<T>(path: string, init: RequestInit = {}) {
  const connection = await getRunnerConnection();
  const response = await fetch(`${connection.url}${path}`, {
    ...init,
    headers: { Accept: "application/json", "Content-Type": "application/json", ...(connection.token ? { Authorization: `Bearer ${connection.token}` } : {}), ...(init.headers ?? {}) },
  });
  if (!response.ok) throw new Error((await response.text()) || `Runner request failed (${response.status})`);
  return response.json() as Promise<T>;
}

export async function discoverRunners(timeoutMs = 900) {
  const empty: { service: string; version: string; url: string; hardware: RunnerHardware }[] = [];
  if (Platform.OS === "web") return empty;
  try {
    const module = await import("react-native-udp");
    const dgram = module.default ?? module;
    const socket = dgram.createSocket({ type: "udp4", reuseAddress: true });
    const found: { service: string; version: string; url: string; hardware: RunnerHardware }[] = [];
    await new Promise<void>((resolve) => {
      let settled = false;
      // Closing an already-closed or unbound socket throws; it is best-effort and must not block resolution.
      const finish = () => { if (!settled) { settled = true; try { socket.close(); } catch { /* already closed */ } resolve(); } };
      const timer = setTimeout(finish, timeoutMs);
      // A malformed broadcast from an unrelated service on the discovery port is expected and ignored.
      socket.on("message", (message: any) => { try { const payload = JSON.parse(message.toString()); if (payload.service === "AnalyzerX BYOH Runner" && payload.url && !found.some((item) => item.url === payload.url)) found.push(payload); } catch { /* not our broadcast */ } });
      socket.on("error", () => { clearTimeout(timer); finish(); });
      socket.bind(0, () => { try { socket.setBroadcast?.(true); socket.send("ANALYZERX_DISCOVER_V1", 0, 22, DISCOVERY_PORT, "255.255.255.255"); } catch { clearTimeout(timer); finish(); } });
    });
    return found;
  } catch {
    return empty;
  }
}

export function startPairing(url = DEFAULT_URL) {
  return fetch(`${url.replace(/\/$/, "")}/pair/start`, { method: "POST", headers: { Accept: "application/json" } }).then(async (response) => {
    if (!response.ok) throw new Error((await response.text()) || `Unable to start pairing (${response.status})`);
    return response.json() as Promise<{ nonce: string; expiresAt: number; runnerVersion: string; pairingUrl: string }>;
  });
}

export async function confirmPairing(url: string, nonce: string) {
  const response = await fetch(`${url.replace(/\/$/, "")}/pair/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nonce }) });
  if (!response.ok) throw new Error((await response.text()) || `Unable to confirm pairing (${response.status})`);
  const result = await response.json() as { token: string; hardware: RunnerHardware };
  await saveRunnerConnection(url, result.token);
  return result;
}

export async function getRunnerState() { return request<RunnerState>("/state"); }
export async function revokeRunner() { const result = await request<{ revoked: boolean }>("/pair/revoke", { method: "POST" }); await clearRunnerConnection(); return result; }
export async function setRunnerProviderKey(provider: string, key: string) { return request(`/providers/key`, { method: "POST", body: JSON.stringify({ provider, key }) }); }
export async function removeRunnerProviderKey(provider: string) { return request(`/providers/${encodeURIComponent(provider)}`, { method: "DELETE" }); }
export async function startRunnerJob(taskType: string, modelId: string, prompt = "") { return request<RunnerJob>("/jobs", { method: "POST", body: JSON.stringify({ task_type: taskType, model_id: modelId, prompt }) }); }
export async function cancelRunnerJob(jobId: string) { return request<RunnerJob>(`/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" }); }

export async function connectRunnerEvents(onEvent: (event: { type: string; job?: RunnerJob; status?: RunnerStatus }) => void) {
  const connection = await getRunnerConnection();
  if (!connection.token) return () => undefined;
  const wsUrl = connection.url.replace(/^http/, "ws") + `/events?token=${encodeURIComponent(connection.token)}`;
  const socket = new WebSocket(wsUrl);
  socket.onmessage = (message) => { try { onEvent(JSON.parse(message.data as string)); } catch { /* Ignore malformed runner events. */ } };
  return () => socket.close();
}
