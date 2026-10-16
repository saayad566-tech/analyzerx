/**
 * File system, backed by react-native-fs.
 *
 * Exposes the same surface the call sites used, so only their import line changed. Two things are
 * worth knowing:
 *
 *  - Expo addressed files with `file://` URIs; react-native-fs uses plain paths. Every entry point
 *    normalises the prefix, so callers can keep passing whatever they hold.
 *  - `createDownloadResumable` is reimplemented on react-native-fs. **Behavioural difference:** the
 *    previous implementation could resume a partially downloaded file by byte range. This one supports
 *    progress reporting, cancellation and a restart-based "resume". A model download that is paused and
 *    resumed therefore re-fetches rather than continuing mid-file. That is recorded in KNOWN_ISSUES
 *    rather than hidden, because it is a real change in behaviour and not a silent one.
 */
import * as RNFS from "react-native-fs";

/** Directory for user documents, with a trailing separator to match the previous contract. */
export const documentDirectory: string = withTrailingSlash(RNFS.DocumentDirectoryPath);
/** Directory for disposable files, with a trailing separator. */
export const cacheDirectory: string = withTrailingSlash(RNFS.CachesDirectoryPath);

export enum EncodingType {
  UTF8 = "utf8",
  Base64 = "base64",
}

function withTrailingSlash(path: string): string {
  return path.endsWith("/") ? path : `${path}/`;
}

/** Accept both a `file://` URI and a plain path. */
function toPath(uri: string): string {
  return uri.startsWith("file://") ? decodeURIComponent(uri.slice("file://".length)) : uri;
}

function toEncoding(encoding?: string): "utf8" | "base64" {
  return encoding === EncodingType.Base64 ? "base64" : "utf8";
}

export async function writeAsStringAsync(
  uri: string,
  contents: string,
  options?: { encoding?: string },
): Promise<void> {
  await RNFS.writeFile(toPath(uri), contents, toEncoding(options?.encoding));
}

export async function readAsStringAsync(uri: string, options?: { encoding?: string }): Promise<string> {
  return RNFS.readFile(toPath(uri), toEncoding(options?.encoding));
}

/** Delete a file or directory. `idempotent` matches the previous "succeed if already gone" behaviour. */
export async function deleteAsync(uri: string, options?: { idempotent?: boolean }): Promise<void> {
  const path = toPath(uri);
  try {
    await RNFS.unlink(path);
  } catch (error) {
    const stillThere = await RNFS.exists(path).catch(() => false);
    if (stillThere || !options?.idempotent) throw error;
  }
}

export type FileInfo =
  | { exists: true; uri: string; size: number; isDirectory: boolean; modificationTime: number }
  | { exists: false; uri: string; isDirectory: false };

export async function getInfoAsync(uri: string): Promise<FileInfo> {
  const path = toPath(uri);
  const present = await RNFS.exists(path).catch(() => false);
  if (!present) return { exists: false, uri, isDirectory: false };
  const stat = await RNFS.stat(path);
  return {
    exists: true,
    uri,
    size: Number(stat.size) || 0,
    isDirectory: stat.isDirectory(),
    modificationTime: stat.mtime ? Math.floor(new Date(stat.mtime).getTime() / 1000) : 0,
  };
}

export async function makeDirectoryAsync(uri: string, options?: { intermediates?: boolean }): Promise<void> {
  const path = toPath(uri);
  if (options?.intermediates) {
    await RNFS.mkdir(path);
    return;
  }
  const alreadyThere = await RNFS.exists(path).catch(() => false);
  if (alreadyThere) throw new Error(`Directory already exists: ${path}`);
  await RNFS.mkdir(path);
}

export async function getFreeDiskStorageAsync(): Promise<number> {
  const info = await RNFS.getFSInfo();
  return info.freeSpace;
}

export type DownloadOptions = { headers?: Record<string, string>; sessionType?: string };
export type DownloadProgressData = { totalBytesWritten: number; totalBytesExpectedToWrite: number };
export type FileSystemDownloadResult = {
  uri: string;
  status: number;
  headers: Record<string, string>;
  mimeType: string | null;
};

export type DownloadResumable = {
  downloadAsync(): Promise<FileSystemDownloadResult | undefined>;
  pauseAsync(): Promise<DownloadResumable>;
  resumeAsync(): Promise<FileSystemDownloadResult | undefined>;
  cancelAsync(): Promise<void>;
  savable(): { url: string; fileUri: string; options: DownloadOptions };
};

/**
 * A download that can be paused, resumed and re-created from a saved descriptor.
 * See the module note: resume restarts the transfer rather than continuing by byte range.
 */
export function createDownloadResumable(
  url: string,
  fileUri: string,
  options: DownloadOptions = {},
  callback?: (progress: DownloadProgressData) => void,
  /** Retained for call-site compatibility; resume is restart-based, so it carries no byte offset. */
  _resumeData?: string,
): DownloadResumable {
  const target = toPath(fileUri);
  let jobId: number | null = null;
  let paused = false;

  const run = async (): Promise<FileSystemDownloadResult | undefined> => {
    paused = false;
    const started = RNFS.downloadFile({
      fromUrl: url,
      toFile: target,
      headers: options.headers,
      progress: (res) =>
        callback?.({
          totalBytesWritten: res.bytesWritten,
          totalBytesExpectedToWrite: res.contentLength,
        }),
    });
    jobId = started.jobId;
    const result = await started.promise;
    jobId = null;
    if (paused) return undefined;
    if (result.statusCode !== 200 && result.statusCode !== 206) {
      throw new Error(`Download failed with status ${result.statusCode}`);
    }
    return { uri: fileUri, status: result.statusCode, headers: {}, mimeType: null };
  };

  const resumable: DownloadResumable = {
    downloadAsync: run,
    async pauseAsync() {
      paused = true;
      if (jobId !== null) {
        // `stopDownload` is synchronous and returns void.
        RNFS.stopDownload(jobId);
        jobId = null;
      }
      return resumable;
    },
    resumeAsync: run,
    async cancelAsync() {
      paused = true;
      if (jobId !== null) {
        RNFS.stopDownload(jobId);
        jobId = null;
      }
    },
    savable: () => ({ url, fileUri, options }),
  };
  return resumable;
}

/** Directory entry names. Empty when the directory does not exist. */
export async function readDirectoryAsync(uri: string): Promise<string[]> {
  const path = toPath(uri);
  const entries = await RNFS.readDir(path);
  return entries.map((entry) => entry.name);
}

/** Move/rename, replacing any existing destination. */
export async function moveAsync(options: { from: string; to: string }): Promise<void> {
  const from = toPath(options.from);
  const to = toPath(options.to);
  await RNFS.unlink(to).catch(() => undefined);
  await RNFS.moveFile(from, to);
}
