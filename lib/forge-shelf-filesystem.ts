type FileSystemModule = typeof import("expo-file-system/legacy");

async function getFileSystem(): Promise<FileSystemModule> {
  return import("expo-file-system/legacy");
}

export async function getArtifactRoot(): Promise<string> {
  const fileSystem = await getFileSystem();
  return fileSystem.documentDirectory ?? fileSystem.cacheDirectory ?? "";
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
  const fileSystem = await getFileSystem();
  await fileSystem.makeDirectoryAsync(path, { intermediates: true });
}

export async function download(url: string, target: string, onProgress?: (written: number, expected: number) => void): Promise<string> {
  const fileSystem = await getFileSystem();
  const task = fileSystem.createDownloadResumable(url, target, undefined, (event) => onProgress?.(event.totalBytesWritten, event.totalBytesExpectedToWrite));
  const result = await task.downloadAsync();
  if (!result?.uri) throw new Error("The artifact download did not return a local file.");
  return result.uri;
}

export async function readBase64(uri: string): Promise<string> {
  const fileSystem = await getFileSystem();
  return fileSystem.readAsStringAsync(uri, { encoding: fileSystem.EncodingType.Base64 });
}

export async function remove(path: string): Promise<void> {
  const fileSystem = await getFileSystem();
  await fileSystem.deleteAsync(path, { idempotent: true });
}
