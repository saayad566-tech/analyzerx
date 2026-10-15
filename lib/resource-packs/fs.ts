/**
 * Filesystem adapter for the resource-pack runtime.
 *
 * Thin wrapper over `expo-file-system/legacy` (the API the rest of AnalyzerX already uses) so the
 * installer never touches a platform module directly. Every operation is failure-tolerant and
 * returns honest results rather than throwing where a caller can recover.
 *
 * Web has no writable document directory, so the adapter reports availability and the installer
 * degrades to the bundled seed (see `fallback.ts`).
 */
type FileSystemModule = typeof import("expo-file-system/legacy");

let cached: FileSystemModule | null = null;

async function getFileSystem(): Promise<FileSystemModule> {
  if (!cached) cached = await import("expo-file-system/legacy");
  return cached;
}

/** Root directory for downloaded market packs. Empty string when the platform has none. */
export async function packRoot(): Promise<string> {
  const fs = await getFileSystem();
  const base = fs.documentDirectory ?? fs.cacheDirectory ?? "";
  return base ? `${base}analyzerx-packs/` : "";
}

/** True when the platform has a writable, persistent directory for packs. */
export async function isPersistentStorageAvailable(): Promise<boolean> {
  return (await packRoot()).length > 0;
}

export async function ensureDir(path: string): Promise<void> {
  const fs = await getFileSystem();
  await fs.makeDirectoryAsync(path, { intermediates: true });
}

export async function exists(path: string): Promise<boolean> {
  const fs = await getFileSystem();
  const info = await fs.getInfoAsync(path);
  return info.exists;
}

/** List entry names inside a directory; empty when it does not exist. */
export async function listDir(path: string): Promise<string[]> {
  const fs = await getFileSystem();
  try {
    return await fs.readDirectoryAsync(path);
  } catch {
    return [];
  }
}

export async function readBase64(path: string): Promise<string> {
  const fs = await getFileSystem();
  return fs.readAsStringAsync(path, { encoding: fs.EncodingType.Base64 });
}

export async function writeBase64(path: string, base64: string): Promise<void> {
  const fs = await getFileSystem();
  await fs.writeAsStringAsync(path, base64, { encoding: fs.EncodingType.Base64 });
}

export async function deletePath(path: string): Promise<void> {
  const fs = await getFileSystem();
  await fs.deleteAsync(path, { idempotent: true });
}

/** Move/rename a path, replacing any existing destination. */
export async function move(from: string, to: string): Promise<void> {
  const fs = await getFileSystem();
  await fs.deleteAsync(to, { idempotent: true }).catch(() => undefined);
  await fs.moveAsync({ from, to });
}

/** Free disk space in bytes, or null when unavailable (web). */
export async function freeStorageBytes(): Promise<number | null> {
  const fs = await getFileSystem();
  if (typeof fs.getFreeDiskStorageAsync !== "function") return null;
  try {
    return await fs.getFreeDiskStorageAsync();
  } catch {
    return null;
  }
}

/** Size in bytes of a file, or null when it does not exist. */
export async function fileSize(path: string): Promise<number | null> {
  const fs = await getFileSystem();
  try {
    const info = await fs.getInfoAsync(path);
    if (!info.exists) return null;
    return typeof info.size === "number" ? info.size : null;
  } catch {
    return null;
  }
}
