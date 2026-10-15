/**
 * Plain-English activity log — device layer.
 *
 * Records what the app did, and what went wrong, so a person can read it without a debugger.
 * Entries are held in memory and persisted to AsyncStorage (works on every platform); on native
 * they are also mirrored to the file `AI_RND_Activity_Log.txt` in the app's document directory,
 * refreshed on a short debounce so the file stays current without hammering storage.
 *
 * Nothing here throws. A logging failure must never become the failure it was recording.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import {
  ACTIVITY_LOG_FILENAME,
  ACTIVITY_LOG_LIMIT,
  formatLog,
  makeEntry,
  summarizeForIssue,
  trimEntries,
  type ActivityEntry,
  type ActivityLevel,
} from "./activity-log-core";

const STORE_KEY = "analyzerx.activity-log.v1";
const FLUSH_DEBOUNCE_MS = 1_500;

let cache: ActivityEntry[] | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let lastCrash: { message: string; at: string } | null = null;

type FileSystemModule = typeof import("expo-file-system/legacy");
async function getFileSystem(): Promise<FileSystemModule | null> {
  if (Platform.OS === "web") return null;
  try {
    return await import("expo-file-system/legacy");
  } catch {
    return null;
  }
}

async function load(): Promise<ActivityEntry[]> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    cache = Array.isArray(parsed) ? (parsed as ActivityEntry[]).filter(isEntry) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function isEntry(value: unknown): value is ActivityEntry {
  return Boolean(value) && typeof value === "object" && typeof (value as ActivityEntry).message === "string" && typeof (value as ActivityEntry).at === "string";
}

/** Absolute path to the on-device log file, or null when the platform has no file system. */
export async function activityLogFilePath(): Promise<string | null> {
  const fs = await getFileSystem();
  const root = fs?.documentDirectory ?? fs?.cacheDirectory ?? null;
  return root ? `${root}${ACTIVITY_LOG_FILENAME}` : null;
}

/** Write the whole log to the on-device file. Best effort; never throws. */
async function flushToFile(entries: ActivityEntry[]): Promise<void> {
  const fs = await getFileSystem();
  if (!fs) return;
  try {
    const path = await activityLogFilePath();
    if (!path) return;
    await fs.writeAsStringAsync(path, formatLog(entries));
  } catch {
    // The in-memory log and AsyncStorage copy remain authoritative.
  }
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void (async () => {
      const entries = await load();
      await AsyncStorage.setItem(STORE_KEY, JSON.stringify(entries)).catch(() => undefined);
      await flushToFile(entries);
    })();
  }, FLUSH_DEBOUNCE_MS);
  // Do not hold a Node process open in tests/SSR.
  (flushTimer as unknown as { unref?: () => void })?.unref?.();
}

/** Record one plain-English activity entry. Never throws. */
export async function logActivity(level: ActivityLevel, message: string, detail?: string): Promise<void> {
  try {
    const entries = await load();
    const next = trimEntries([...entries, makeEntry(level, message, detail)], ACTIVITY_LOG_LIMIT);
    cache = next;
    scheduleFlush();
  } catch {
    // ignore
  }
}

/** Record a crash in plain English and remember it for the diagnostics report. */
export async function logCrash(message: string, detail?: string): Promise<void> {
  lastCrash = { message, at: new Date().toISOString() };
  await logActivity("error", `Screen recovered after an error: ${message}`, detail);
}

/** The most recent crash recorded this session, if any. */
export function lastRecordedCrash(): { message: string; at: string } | null {
  return lastCrash;
}

/** Read the stored entries, oldest first. */
export async function readActivityLog(): Promise<ActivityEntry[]> {
  return (await load()).slice();
}

/** The whole log as readable text. */
export async function readActivityLogText(): Promise<string> {
  return formatLog(await load());
}

/** Force the pending entries to storage and the on-device file. */
export async function flushActivityLog(): Promise<void> {
  const entries = await load();
  await AsyncStorage.setItem(STORE_KEY, JSON.stringify(entries)).catch(() => undefined);
  await flushToFile(entries);
}

/** Empty the log (memory, storage and the on-device file). */
export async function clearActivityLog(): Promise<void> {
  cache = [];
  lastCrash = null;
  try {
    await AsyncStorage.removeItem(STORE_KEY);
    const fs = await getFileSystem();
    const path = await activityLogFilePath();
    if (fs && path) await fs.deleteAsync(path, { idempotent: true });
  } catch {
    // ignore
  }
}

/** Write the log to a shareable file and return its URI (native), or the text (web). */
export async function exportActivityLog(): Promise<{ uri: string | null; text: string }> {
  const entries = await load();
  const fs = await getFileSystem();
  const text = formatLog(entries);
  if (!fs) return { uri: null, text };
  try {
    const root = fs.documentDirectory ?? fs.cacheDirectory ?? null;
    if (!root) return { uri: null, text };
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const uri = `${root}analyzerx-activity-${stamp}.txt`;
    await fs.writeAsStringAsync(uri, text);
    return { uri, text };
  } catch {
    return { uri: null, text };
  }
}

/** Build a bug-report body from the log, for filing an issue. */
export async function buildIssueReport(options?: { appVersion?: string | null; market?: string | null }): Promise<{ title: string; body: string }> {
  return summarizeForIssue({ entries: await load(), crash: lastCrash, appVersion: options?.appVersion ?? null, market: options?.market ?? null });
}
