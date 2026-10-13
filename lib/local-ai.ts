import { NativeEventEmitter, NativeModules, Platform } from "react-native";
import * as Device from "expo-device";
import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";

export * from "./local-ai-policy";
import { verifyModelArtifact, type IntegrityResult } from "./local-ai-integrity";
import {
  assessLocalAIModel,
  getLocalAIModel,
  LOCAL_AI_MODELS,
  type LocalAIBackend,
  type LocalAIDeviceProfile,
  type LocalAIModelId,
  type LocalAIModelManifest,
} from "./local-ai-policy";

export type LocalAIStatus = "native_unavailable" | "not_downloaded" | "downloaded" | "loaded" | "error";

export interface LocalAIState {
  modelId: LocalAIModelId;
  status: LocalAIStatus;
  localUri: string | null;
  downloadedBytes: number;
  progress: number;
  error: string | null;
  /** Result of the integrity check, when one has been performed. */
  integrity?: IntegrityResult | null;
}

export interface LocalAIInputFiles {
  imagePath?: string;
  audioPath?: string;
}

export interface LocalAIRuntime {
  readonly kind: "litert-lm-android";
  readonly isAvailable: boolean;
  load(modelPath: string, backend: LocalAIBackend): Promise<void>;
  unload(): Promise<void>;
  cancel(): Promise<void>;
  /**
   * `systemInstruction` is attached to the conversation itself and must NOT be
   * repeated inside `prompt`: the runtime requires each turn's rendered
   * template to extend the previous one, so a repeated preamble fails the
   * second turn of a session.
   */
  stream(prompt: string, onToken: (token: string) => void, inputs?: LocalAIInputFiles & { systemInstruction?: string }): Promise<void>;
}

const RESUME_KEY_PREFIX = "analyzerx.local-ai.resume.";
const ACTIVE_MODEL_KEY = "analyzerx.local-ai.active-model";
const activeDownloads: Partial<Record<LocalAIModelId, FileSystem.DownloadResumable>> = {};

export async function getLocalAIDeviceProfile(): Promise<LocalAIDeviceProfile> {
  const freeStorageBytes = Platform.OS === "web" ? null : await FileSystem.getFreeDiskStorageAsync().catch(() => null);
  const totalMemoryBytes = Device.totalMemory ?? null;
  const cpuArchitectures = Device.supportedCpuArchitectures ?? [];
  const nativeRuntimeAvailable = Platform.OS === "android" && Boolean(NativeModules.AnalyzerXLocalAI);
  return {
    platform: Platform.OS,
    osVersion: Device.osVersion ?? null,
    modelName: Device.modelName ?? null,
    totalMemoryBytes,
    freeStorageBytes,
    cpuArchitectures,
    backend: nativeRuntimeAvailable ? "gpu" : "unknown",
    nativeRuntimeAvailable,
  };
}

function modelDirectory(model: LocalAIModelManifest): string {
  const root = FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? "";
  return `${root}analyzerx-local-ai/${model.id}`;
}

function modelFileUri(model: LocalAIModelManifest & { artifactFile: string }): string {
  return `${modelDirectory(model)}/${model.artifactFile}`;
}

type DownloadableLocalAIModel = LocalAIModelManifest & { artifactFile: string; artifactUrl: string; sizeBytes: number; requiredFreeStorageBytes: number; recommendedRamBytes: number };

function assertDownloadableModel(model: LocalAIModelManifest): DownloadableLocalAIModel {
  if (model.installability === "requires_account") {
    throw new Error(`${model.displayName} is restricted by its publisher and cannot be downloaded anonymously in AnalyzerX. Choose Qwen3 0.6B LiteRT or an available public LiteRT model instead.`);
  }
  if (model.installability !== "verified_installable" || !model.artifactFile || !model.artifactUrl || model.sizeBytes === null || model.requiredFreeStorageBytes === null || model.recommendedRamBytes === null) {
    throw new Error(`${model.displayName} is catalogued but its Android runtime adapter is not installed in this build yet.`);
  }
  if (model.format === "gguf" && !model.artifactChecksum) throw new Error(`${model.displayName} cannot be downloaded until a pinned SHA-256 artifact checksum is recorded.`);
  return model as DownloadableLocalAIModel;
}

function responseHeader(headers: Record<string, string>, name: string): string | null {
  const target = name.toLowerCase();
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === target);
  return key ? headers[key] ?? null : null;
}

function validateModelDownloadResponse(result: { status: number; mimeType: string | null; headers: Record<string, string> }, model: DownloadableLocalAIModel): void {
  if (result.status < 200 || result.status >= 300) {
    const providerMessage = responseHeader(result.headers, "x-error-message");
    throw new Error(`Model download was rejected by ${model.upstreamRepo} (HTTP ${result.status})${providerMessage ? `: ${providerMessage}` : ""}. Choose a public model or try again later.`);
  }
  const contentType = result.mimeType ?? responseHeader(result.headers, "content-type") ?? "";
  if (contentType && !/application\/(octet-stream|binary)|application\/x-/i.test(contentType)) {
    throw new Error(`Model download returned ${contentType} instead of a binary .litertlm artifact. The downloaded error page was discarded.`);
  }
}

export async function getLocalAIModelState(modelId: LocalAIModelId): Promise<LocalAIState> {
  const model = getLocalAIModel(modelId);
  if (model.installability !== "verified_installable" || !model.artifactFile || model.sizeBytes === null) {
    return { modelId, status: "not_downloaded", localUri: null, downloadedBytes: 0, progress: 0, error: null };
  }
  if (Platform.OS === "web") {
    return { modelId, status: "native_unavailable", localUri: null, downloadedBytes: 0, progress: 0, error: "Local model file management is available in the Android native build, not the web preview." };
  }
  const localUri = modelFileUri(model as LocalAIModelManifest & { artifactFile: string });
  const info = await FileSystem.getInfoAsync(localUri);
  const downloadedBytes = info.exists ? info.size ?? 0 : 0;
  // Size alone is not integrity: a right-length but corrupt file would pass it.
  // The verdict distinguishes checksum-verified from size-verified-only and is
  // never overstated.
  const integrity = info.exists
    ? verifyModelArtifact({
        expectedSizeBytes: model.sizeBytes,
        expectedChecksum: model.artifactChecksum?.value ?? null,
        actualSizeBytes: downloadedBytes,
        actualChecksum: await computeArtifactSha256(localUri),
      })
    : null;
  const complete = integrity?.ok === true;
  return {
    modelId,
    status: complete ? "downloaded" : "not_downloaded",
    localUri: info.exists ? localUri : null,
    downloadedBytes,
    progress: model.sizeBytes ? Math.min(1, downloadedBytes / model.sizeBytes) : 0,
    error: complete ? null : integrity && integrity.verdict !== "missing" ? integrity.reason : null,
    integrity,
  };
}

/**
 * Compute the artifact SHA-256 through the native bridge when it exposes one.
 * Returns null when no digest can be computed, so the caller reports
 * "size-verified only" rather than claiming a verification it did not perform.
 */
async function computeArtifactSha256(fileUri: string): Promise<string | null> {
  const nativeModule = NativeModules.AnalyzerXLocalAI as { sha256?: (path: string) => Promise<string | null> } | undefined;
  if (typeof nativeModule?.sha256 !== "function") return null;
  try {
    const digest = await nativeModule.sha256(fileUri);
    return typeof digest === "string" && digest.length > 0 ? digest : null;
  } catch {
    return null;
  }
}

export async function downloadLocalAIModel(
  modelId: LocalAIModelId,
  onProgress?: (progress: Pick<LocalAIState, "downloadedBytes" | "progress">) => void,
): Promise<string> {
  if (Platform.OS !== "android") throw new Error("Local Gemma AI is currently supported only in Android native builds.");
  // Prevent duplicate downloads when the user taps repeatedly.
  if (activeDownloads[modelId]) throw new Error("A download for this model is already in progress.");
  const model = assertDownloadableModel(getLocalAIModel(modelId));
  const device = await getLocalAIDeviceProfile();
  const assessment = assessLocalAIModel(model, device);
  if (!assessment.eligible) throw new Error(assessment.reasons.join(" "));

  const directory = modelDirectory(model);
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    const target = modelFileUri(model);
  const resumeKey = `${RESUME_KEY_PREFIX}${modelId}`;
  const savedResumeState = await AsyncStorage.getItem(resumeKey);
  const parsedResumeState = savedResumeState ? JSON.parse(savedResumeState) as { url: string; fileUri: string; options: FileSystem.DownloadOptions; resumeData?: string } : null;
  const download = FileSystem.createDownloadResumable(
    parsedResumeState?.url ?? model.artifactUrl,
    parsedResumeState?.fileUri ?? target,
    parsedResumeState?.options,
    (event) => {
      const downloadedBytes = event.totalBytesWritten;
      const totalBytes = event.totalBytesExpectedToWrite > 0 ? event.totalBytesExpectedToWrite : model.sizeBytes;
      onProgress?.({ downloadedBytes, progress: Math.min(1, downloadedBytes / totalBytes) });
    },
    parsedResumeState?.resumeData,
  );
  activeDownloads[modelId] = download;
  let clearResumeState = false;
  try {
    const result = await download.downloadAsync();
    if (!result?.uri) throw new Error("Model download did not return a local file.");
    try {
      validateModelDownloadResponse(result, model);
    } catch (error) {
      clearResumeState = true;
      await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => undefined);
      await AsyncStorage.removeItem(resumeKey);
      throw error;
    }
    const info = await FileSystem.getInfoAsync(result.uri);
    const actualSize = info.exists ? info.size ?? 0 : 0;
    // Integrity, not just length: verify against the pinned SHA-256 when a digest
    // can be computed, and refuse to keep a corrupt artifact.
    const integrity = verifyModelArtifact({
      expectedSizeBytes: model.sizeBytes,
      expectedChecksum: model.artifactChecksum?.value ?? null,
      actualSizeBytes: actualSize,
      actualChecksum: await computeArtifactSha256(result.uri),
    });
    if (!integrity.ok) {
      clearResumeState = true;
      await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => undefined);
      await AsyncStorage.removeItem(resumeKey);
      throw new Error(`Integrity check failed: ${integrity.reason} The artifact was discarded.`);
    }
    await AsyncStorage.removeItem(resumeKey);
    return result.uri;
  } catch (error) {
    if (clearResumeState) await AsyncStorage.removeItem(resumeKey);
    else {
      const resumeState = download.savable();
      if (resumeState) await AsyncStorage.setItem(resumeKey, JSON.stringify(resumeState));
    }
    throw error;
  } finally {
    delete activeDownloads[modelId];
  }
}

export async function pauseLocalAIModelDownload(modelId: LocalAIModelId): Promise<void> {
  const active = activeDownloads[modelId];
  if (!active) return;
  const pauseState = await active.pauseAsync();
  await AsyncStorage.setItem(`${RESUME_KEY_PREFIX}${modelId}`, JSON.stringify(pauseState));
}

export async function getActiveLocalAIModelId(): Promise<LocalAIModelId | null> {
  const value = await AsyncStorage.getItem(ACTIVE_MODEL_KEY);
  return value && LOCAL_AI_MODELS.some((model) => model.id === value) ? value as LocalAIModelId : null;
}

export async function setActiveLocalAIModelId(modelId: LocalAIModelId | null): Promise<void> {
  if (modelId) await AsyncStorage.setItem(ACTIVE_MODEL_KEY, modelId);
  else await AsyncStorage.removeItem(ACTIVE_MODEL_KEY);
}

export async function deleteLocalAIModel(modelId: LocalAIModelId): Promise<void> {
  const model = getLocalAIModel(modelId);
  await activeDownloads[modelId]?.cancelAsync().catch(() => undefined);
  delete activeDownloads[modelId];
  await AsyncStorage.removeItem(`${RESUME_KEY_PREFIX}${modelId}`);
  await FileSystem.deleteAsync(modelDirectory(model), { idempotent: true });
}

export function createUnavailableLocalAIRuntime(): LocalAIRuntime {
  return {
    kind: "litert-lm-android",
    isAvailable: false,
    async load() { throw new Error("The native LiteRT-LM Android bridge is not included in this build."); },
    async unload() {},
    async cancel() {},
    async stream() { throw new Error("The native LiteRT-LM Android bridge is not included in this build."); },
  };
}

export function getLocalAIRuntime(): LocalAIRuntime {
  if (Platform.OS !== "android" || !NativeModules.AnalyzerXLocalAI) return createUnavailableLocalAIRuntime();
  const nativeModule = NativeModules.AnalyzerXLocalAI as {
    load: (modelPath: string, backend: LocalAIBackend) => Promise<boolean>;
    unload: () => Promise<boolean>;
    cancel: () => Promise<boolean>;
    stream: (systemInstruction: string | null, prompt: string, imagePath?: string | null, audioPath?: string | null) => Promise<boolean>;
  };
  return {
    kind: "litert-lm-android",
    isAvailable: true,
    async load(modelPath, backend) { await nativeModule.load(modelPath, backend); },
    async unload() { await nativeModule.unload(); },
    async cancel() { await nativeModule.cancel(); },
    async stream(prompt, onToken, inputs) {
      const emitter = new NativeEventEmitter(NativeModules.AnalyzerXLocalAI);
      const subscription = emitter.addListener("AnalyzerXLocalAIToken", (payload: { text?: string }) => { if (payload.text) onToken(payload.text); });
      try { await nativeModule.stream(inputs?.systemInstruction ?? null, prompt, inputs?.imagePath ?? null, inputs?.audioPath ?? null); } finally { subscription.remove(); }
    },
  };
}
