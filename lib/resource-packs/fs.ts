/**
 * Filesystem adapter for the resource-pack runtime.
 *
 * Delegates to the shared platform adapter (`@/lib/platform/file-system`, backed by
 * react-native-fs) so the installer never touches a platform module directly. Every operation is
 * failure-tolerant and returns honest results rather than throwing where a caller can recover.
 *
 * This previously imported `expo-file-system/legacy`, which was removed during the Expo-to-bare
 * migration, so every call threw at runtime. The platform adapter replaced it.
 *
 * Web has no writable document directory, so the adapter reports availability and the installer
 * degrades to the bundled seed (see `fallback.ts`).
 */
import {
  EncodingType,
  cacheDirectory,
  deleteAsync,
  documentDirectory,
  getFreeDiskStorageAsync,
  getInfoAsync,
  makeDirectoryAsync,
  moveAsync,
  readAsStringAsync,
  readDirectoryAsync,
  writeAsStringAsync,
} from "@/lib/platform/file-system";

/** Root directory for downloaded market packs. Empty string when the platform has none. */
export async function packRoot(): Promise<string> {
  const base = documentDirectory || cacheDirectory || "";
  return base ? `${base}analyzerx-packs/` : "";
}

/** True when the platform has a writable, persistent directory for packs. */
export async function isPersistentStorageAvailable(): Promise<boolean> {
  return (await packRoot()).length > 0;
}

export async function ensureDir(path: string): Promise<void> {
  await makeDirectoryAsync(path, { intermediates: true });
}

export async function exists(path: string): Promise<boolean> {
  const info = await getInfoAsync(path);
  return info.exists;
}

/** List entry names inside a directory; empty when it does not exist. */
export async function listDir(path: string): Promise<string[]> {
  try {
    return await readDirectoryAsync(path);
  } catch {
    return [];
  }
}

export async function readBase64(path: string): Promise<string> {
  return readAsStringAsync(path, { encoding: EncodingType.Base64 });
}

export async function writeBase64(path: string, base64: string): Promise<void> {
  await writeAsStringAsync(path, base64, { encoding: EncodingType.Base64 });
}

export async function deletePath(path: string): Promise<void> {
  await deleteAsync(path, { idempotent: true });
}

/** Move/rename a path, replacing any existing destination. */
export async function move(from: string, to: string): Promise<void> {
  await moveAsync({ from, to });
}

/** Free disk space in bytes, or null when unavailable (web). */
export async function freeStorageBytes(): Promise<number | null> {
  try {
    return await getFreeDiskStorageAsync();
  } catch {
    return null;
  }
}

/** Size in bytes of a file, or null when it does not exist. */
export async function fileSize(path: string): Promise<number | null> {
  try {
    const info = await getInfoAsync(path);
    if (!info.exists) return null;
    return typeof info.size === "number" ? info.size : null;
  } catch {
    return null;
  }
}
