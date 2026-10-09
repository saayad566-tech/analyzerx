import AsyncStorage from "@react-native-async-storage/async-storage";

export type LocalCacheEnvelope<T> = {
  version: 1;
  savedAt: string;
  source: "server" | "direct-provider" | "local";
  staleAfterSeconds: number;
  data: T;
};

export type LocalCacheRead<T> = {
  data: T | null;
  savedAt: string | null;
  source: LocalCacheEnvelope<T>["source"] | null;
  isStale: boolean;
};

export async function readLocalCache<T>(key: string, fallback: T | null = null): Promise<LocalCacheRead<T>> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return { data: fallback, savedAt: null, source: null, isStale: true };
    const parsed = JSON.parse(raw) as Partial<LocalCacheEnvelope<T>>;
    if (parsed.version !== 1 || typeof parsed.savedAt !== "string" || typeof parsed.staleAfterSeconds !== "number" || !("data" in parsed)) {
      return { data: fallback, savedAt: null, source: null, isStale: true };
    }
    const ageSeconds = Math.max(0, (Date.now() - new Date(parsed.savedAt).getTime()) / 1000);
    return {
      data: parsed.data as T,
      savedAt: parsed.savedAt,
      source: parsed.source === "direct-provider" || parsed.source === "local" || parsed.source === "server" ? parsed.source : "local",
      isStale: !Number.isFinite(ageSeconds) || ageSeconds > parsed.staleAfterSeconds,
    };
  } catch {
    return { data: fallback, savedAt: null, source: null, isStale: true };
  }
}

export async function writeLocalCache<T>(key: string, data: T, options: { source?: LocalCacheEnvelope<T>["source"]; staleAfterSeconds?: number } = {}) {
  const envelope: LocalCacheEnvelope<T> = {
    version: 1,
    savedAt: new Date().toISOString(),
    source: options.source ?? "server",
    staleAfterSeconds: options.staleAfterSeconds ?? 86_400,
    data,
  };
  try {
    await AsyncStorage.setItem(key, JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}

export async function removeLocalCache(key: string) {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // Local persistence is best effort; in-memory state remains authoritative.
  }
}
