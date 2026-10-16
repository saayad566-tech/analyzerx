/**
 * Filesystem adapter for the Forge Shelf artifact store.
 *
 * Delegates to the shared platform adapter (`@/lib/platform/file-system`, backed by
 * react-native-fs). It previously imported `expo-file-system/legacy`, which was removed during the
 * Expo-to-bare migration, so downloads and reads threw at runtime.
 */
import {
  EncodingType,
  cacheDirectory,
  createDownloadResumable,
  deleteAsync,
  documentDirectory,
  makeDirectoryAsync,
  readAsStringAsync,
} from "@/lib/platform/file-system";

export async function getArtifactRoot(): Promise<string> {
  return documentDirectory || cacheDirectory || "";
}

export async function artifactPath(toolId: string, artifactId: string): Promise<string> {
  const root = await getArtifactRoot();
  return `${root}analyzerx-forgeshelf/${toolId}/${artifactId.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
}

export async function artifactDirectory(toolId: string): Promise<string> {
  const root = await getArtifactRoot();
  return `${root}analyzerx-forgeshelf/${toolId}`;
}

export async function makeDirectory(path: string): Promise<void> {
  await makeDirectoryAsync(path, { intermediates: true });
}

export async function download(url: string, target: string, onProgress?: (written: number, expected: number) => void): Promise<string> {
  const task = createDownloadResumable(url, target, undefined, (event) =>
    onProgress?.(event.totalBytesWritten, event.totalBytesExpectedToWrite));
  const result = await task.downloadAsync();
  if (!result?.uri) throw new Error("The artifact download did not return a local file.");
  return result.uri;
}

export async function readBase64(uri: string): Promise<string> {
  return readAsStringAsync(uri, { encoding: EncodingType.Base64 });
}

export async function remove(path: string): Promise<void> {
  await deleteAsync(path, { idempotent: true });
}
