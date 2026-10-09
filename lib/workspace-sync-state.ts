import AsyncStorage from "@react-native-async-storage/async-storage";

export type WorkspaceSyncStatus = "idle" | "syncing" | "synced" | "partial" | "failed";
export type WorkspaceSyncConflict = { kind: "watchlist" | "saved-screen" | "alert-preference" | "alert-rule"; key: string; detail: string; resolution: "local" | "server" | "merged" | "pending" };
export type WorkspaceSyncSnapshot = { status: WorkspaceSyncStatus; lastAttemptAt: string | null; lastSuccessAt: string | null; error: string | null; conflicts: WorkspaceSyncConflict[]; retryNonce: number };

const KEY = "analyzerx.workspace-sync.snapshot.v1";
const listeners = new Set<() => void>();
let snapshot: WorkspaceSyncSnapshot = { status: "idle", lastAttemptAt: null, lastSuccessAt: null, error: null, conflicts: [], retryNonce: 0 };

export function getWorkspaceSyncSnapshot() { return snapshot; }
export function subscribeWorkspaceSync(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); }
export function setWorkspaceSyncSnapshot(patch: Partial<WorkspaceSyncSnapshot>) { snapshot = { ...snapshot, ...patch }; listeners.forEach((listener) => listener()); void AsyncStorage.setItem(KEY, JSON.stringify(snapshot)).catch(() => undefined); }
export async function hydrateWorkspaceSyncSnapshot() { try { const raw = await AsyncStorage.getItem(KEY); if (raw) snapshot = { ...snapshot, ...(JSON.parse(raw) as Partial<WorkspaceSyncSnapshot>) }; } catch { /* best effort */ } listeners.forEach((listener) => listener()); }
export function requestWorkspaceSyncRetry() { setWorkspaceSyncSnapshot({ status: "idle", error: null, retryNonce: snapshot.retryNonce + 1 }); }
export function resolveWorkspaceSyncConflict(index: number, resolution: WorkspaceSyncConflict["resolution"]) { const conflicts = snapshot.conflicts.map((item, itemIndex) => itemIndex === index ? { ...item, resolution } : item); setWorkspaceSyncSnapshot({ conflicts }); }
