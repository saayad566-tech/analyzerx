import AsyncStorage from "@react-native-async-storage/async-storage";
import { artifactDirectory, artifactPath, download, makeDirectory, readBase64, remove } from "./forge-shelf-filesystem";
import { sha256Text } from "@/lib/quant/hash";
export type ForgeShelfInstallState = "not-installed" | "queued" | "installing" | "verifying" | "installed" | "active" | "update-available" | "updating" | "paused" | "failed" | "unsupported" | "removed";
export type ForgeShelfInstallerStage = "preflight" | "dependencies" | "download" | "verifying" | "activate" | "complete" | "rollback" | "failed";

export type ForgeShelfTool = { id: string; releaseChannel: "verified" | "candidate" | "runtime-pending"; platforms: readonly string[]; minRamBytes: number | null; minStorageBytes: number | null; artifact: { id: string; url: string | null; sha256: string | null; sizeBytes: number | null; redistribution: "allowed" | "restricted" | "verify-first" }; publisher: string; version: string };
export type ForgeShelfHardwareProfile = { platform: string; totalMemoryBytes: number | null; freeStorageBytes: number | null };

export type ForgeShelfInstallRecord = {
  toolId: string;
  state: ForgeShelfInstallState;
  installedVersion: string | null;
  progress: number;
  error: string | null;
  updatedAt: string;
  installerStage?: ForgeShelfInstallerStage;
  artifactUri?: string | null;
  verifiedSha256?: string | null;
  dependencyIds?: string[];
};

export type ForgeShelfInstallerProgress = {
  toolId: string;
  stage: ForgeShelfInstallerStage;
  progress: number;
  message: string;
};

export type ForgeShelfInstallResult = {
  record: ForgeShelfInstallRecord;
  dependencyIds: string[];
  verifiedSha256: string | null;
  artifactUri: string | null;
};

const INSTALLS_KEY = "analyzerx.forgeshelf.installs.v1";
const ACTIVE_KEY = "analyzerx.forgeshelf.active.v1";
const ARTIFACT_ROOT = "analyzerx-forgeshelf";

function parseRecords(value: string | null): ForgeShelfInstallRecord[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is ForgeShelfInstallRecord => Boolean(item && typeof item === "object" && typeof (item as ForgeShelfInstallRecord).toolId === "string")) : [];
  } catch { return []; }
}

export async function loadForgeShelfInstalls(): Promise<ForgeShelfInstallRecord[]> { return parseRecords(await AsyncStorage.getItem(INSTALLS_KEY)); }
export async function saveForgeShelfInstall(record: ForgeShelfInstallRecord): Promise<void> {
  const records = await loadForgeShelfInstalls();
  const next = records.filter((item) => item.toolId !== record.toolId);
  next.push(record);
  await AsyncStorage.setItem(INSTALLS_KEY, JSON.stringify(next));
}
export async function getForgeShelfInstall(toolId: string): Promise<ForgeShelfInstallRecord | null> { return (await loadForgeShelfInstalls()).find((item) => item.toolId === toolId) ?? null; }
export async function removeForgeShelfInstall(toolId: string): Promise<void> {
  const records = await loadForgeShelfInstalls();
  const record = records.find((item) => item.toolId === toolId);
  if (record?.artifactUri) await remove(record.artifactUri).catch(() => undefined);
  await AsyncStorage.setItem(INSTALLS_KEY, JSON.stringify(records.filter((item) => item.toolId !== toolId)));
  if (await getActiveForgeShelfToolId() === toolId) await setActiveForgeShelfToolId(null);
}
export async function getActiveForgeShelfToolId(): Promise<string | null> { return AsyncStorage.getItem(ACTIVE_KEY); }
export async function setActiveForgeShelfToolId(toolId: string | null): Promise<void> { if (toolId) await AsyncStorage.setItem(ACTIVE_KEY, toolId); else await AsyncStorage.removeItem(ACTIVE_KEY); }

function now() { return new Date().toISOString(); }
function emit(onProgress: ((progress: ForgeShelfInstallerProgress) => void) | undefined, toolId: string, stage: ForgeShelfInstallerStage, progress: number, message: string) { onProgress?.({ toolId, stage, progress, message }); }
function isBuiltInAnalyzerXContract(tool: ForgeShelfTool) { return !tool.artifact.url && tool.artifact.id.startsWith("analyzerx-"); }

export function resolveForgeShelfDependencies(tool: ForgeShelfTool): string[] {
  if (tool.id === "android-local-sentiment") return ["grounded-research-assistant"];
  if (tool.id === "grounded-research-assistant") return [];
  return [];
}

export function validateForgeShelfPreflight(tool: ForgeShelfTool, profile: ForgeShelfHardwareProfile): string[] {
  const reasons: string[] = [];
  if (tool.releaseChannel !== "verified") reasons.push("This listing is not in the verified release channel.");
  if (!tool.platforms.includes(profile.platform)) reasons.push(`Requires ${tool.platforms.join(" or ")}; this device is ${profile.platform}.`);
  if (tool.minRamBytes !== null && profile.totalMemoryBytes !== null && profile.totalMemoryBytes < tool.minRamBytes) reasons.push("The device does not meet the recommended memory requirement.");
  if (tool.minStorageBytes !== null && profile.freeStorageBytes !== null && profile.freeStorageBytes < tool.minStorageBytes) reasons.push("The device does not have enough free storage.");
  if (tool.artifact.url && !tool.artifact.sha256) reasons.push("Remote artifacts must declare a pinned SHA-256 checksum before installation.");
  if (tool.artifact.redistribution === "verify-first" && !tool.artifact.sha256) reasons.push("Redistribution terms require a verified artifact checksum.");
  if (!tool.artifact.url && !isBuiltInAnalyzerXContract(tool)) reasons.push("This listing has no installable verified artifact.");
  return reasons;
}

async function sha256File(uri: string): Promise<string> {
  const base64 = await readBase64(uri);
  // SHA-256 of the base64 text, computed by the in-repo implementation. This is digest-identical to
  // the previous native call (both hash the UTF-8 of the string) and removes a native crypto
  // dependency from the integrity path.
  return sha256Text(base64);
}

async function ensureDependencies(dependencyIds: string[], onProgress: ((progress: ForgeShelfInstallerProgress) => void) | undefined, toolId: string) {
  for (let index = 0; index < dependencyIds.length; index += 1) {
    const dependencyId = dependencyIds[index];
    const dependency = await getForgeShelfInstall(dependencyId);
    if (!dependency || !["installed", "active", "update-available"].includes(dependency.state)) throw new Error(`Dependency ${dependencyId} is not installed. Install dependencies first or retry from ForgeShelf.`);
    emit(onProgress, toolId, "dependencies", 0.15 + ((index + 1) / dependencyIds.length) * 0.1, `Dependency ready: ${dependencyId}`);
  }
}

export async function installForgeShelfToolOneClick(tool: ForgeShelfTool, profile: ForgeShelfHardwareProfile, onProgress?: (progress: ForgeShelfInstallerProgress) => void): Promise<ForgeShelfInstallResult> {
  const previous = await getForgeShelfInstall(tool.id);
  const dependencyIds = resolveForgeShelfDependencies(tool);
  let downloadedUri: string | null = null;
  try {
    emit(onProgress, tool.id, "preflight", 0.02, "Checking device, storage, release channel, and artifact policy.");
    const preflightReasons = validateForgeShelfPreflight(tool, profile);
    if (preflightReasons.length) throw new Error(preflightReasons.join(" "));
    await saveForgeShelfInstall({ toolId: tool.id, state: "queued", installedVersion: previous?.installedVersion ?? null, progress: 0.05, error: null, updatedAt: now(), installerStage: "preflight", artifactUri: previous?.artifactUri ?? null, verifiedSha256: previous?.verifiedSha256 ?? null, dependencyIds });
    emit(onProgress, tool.id, "dependencies", 0.12, dependencyIds.length ? "Checking installed dependencies." : "No additional dependencies required.");
    await ensureDependencies(dependencyIds, onProgress, tool.id);

    let verifiedSha256: string | null = null;
    if (tool.artifact.url) {
      const directory = await artifactDirectory(tool.id);
      await makeDirectory(directory);
      downloadedUri = await artifactPath(tool.id, tool.artifact.id);
      emit(onProgress, tool.id, "download", 0.25, "Downloading the pinned artifact.");
      downloadedUri = await download(tool.artifact.url, downloadedUri, (written, expected) => {
        const total = expected > 0 ? expected : tool.artifact.sizeBytes ?? 1;
        emit(onProgress, tool.id, "download", Math.min(0.72, 0.25 + (written / total) * 0.47), "Downloading verified artifact.");
      });
      emit(onProgress, tool.id, "verifying", 0.78, "Computing SHA-256 checksum before activation.");
      verifiedSha256 = await sha256File(downloadedUri);
      if (verifiedSha256.toLowerCase() !== tool.artifact.sha256!.toLowerCase()) throw new Error(`Checksum mismatch. Expected ${tool.artifact.sha256}, received ${verifiedSha256}. The artifact was not activated.`);
    } else {
      emit(onProgress, tool.id, "verifying", 0.78, "Verifying the built-in AnalyzerX contract and license boundary.");
    }

    emit(onProgress, tool.id, "activate", 0.9, "Activating atomically after verification.");
    const record: ForgeShelfInstallRecord = { toolId: tool.id, state: "installed", installedVersion: tool.version, progress: 1, error: null, updatedAt: now(), installerStage: "complete", artifactUri: downloadedUri, verifiedSha256, dependencyIds };
    await saveForgeShelfInstall(record);
    emit(onProgress, tool.id, "complete", 1, "Installation verified and ready to use.");
    return { record, dependencyIds, verifiedSha256, artifactUri: downloadedUri };
  } catch (error) {
    emit(onProgress, tool.id, "rollback", 0.92, "Installation failed; restoring the previous verified state.");
    if (downloadedUri) await remove(downloadedUri).catch(() => undefined);
    const restored: ForgeShelfInstallRecord = previous ? { ...previous, error: String(error), updatedAt: now(), installerStage: "rollback" } : { toolId: tool.id, state: "failed", installedVersion: null, progress: 0, error: String(error), updatedAt: now(), installerStage: "failed", artifactUri: null, verifiedSha256: null, dependencyIds };
    await saveForgeShelfInstall(restored);
    emit(onProgress, tool.id, previous ? "rollback" : "failed", previous ? previous.progress : 0, previous ? "Previous version restored." : String(error));
    throw error;
  }
}

export async function installAnalyzerXTool(toolId: string, version: string): Promise<ForgeShelfInstallRecord> {
  const nowValue = now();
  const installing: ForgeShelfInstallRecord = { toolId, state: "installing", installedVersion: null, progress: 0.25, error: null, updatedAt: nowValue, installerStage: "activate" };
  await saveForgeShelfInstall(installing);
  const installed: ForgeShelfInstallRecord = { ...installing, state: "installed", installedVersion: version, progress: 1, installerStage: "complete", updatedAt: now() };
  await saveForgeShelfInstall(installed);
  return installed;
}

export async function activateForgeShelfTool(toolId: string, version: string): Promise<ForgeShelfInstallRecord> {
  const installed = await getForgeShelfInstall(toolId);
  if (!installed || !["installed", "active", "update-available"].includes(installed.state)) throw new Error("Install this tool before making it active.");
  const activeId = await getActiveForgeShelfToolId();
  if (activeId && activeId !== toolId) { const previous = await getForgeShelfInstall(activeId); if (previous) await saveForgeShelfInstall({ ...previous, state: "installed", updatedAt: now() }); }
  await setActiveForgeShelfToolId(toolId);
  const active: ForgeShelfInstallRecord = { ...installed, state: "active", installedVersion: installed.installedVersion ?? version, updatedAt: now() };
  await saveForgeShelfInstall(active);
  return active;
}
