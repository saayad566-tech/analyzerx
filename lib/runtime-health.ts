import AsyncStorage from "@react-native-async-storage/async-storage";

export type RuntimeReadiness = "ready" | "degraded" | "unavailable";

export type RuntimeHealthSnapshot = {
  contractVersion: number;
  checkedAt: string;
  releaseVersion: string;
  api: { status: "ready" };
  services: {
    database: { status: RuntimeReadiness; configured: boolean };
    llm: { status: RuntimeReadiness; configured: boolean };
    providers: {
      status: RuntimeReadiness;
      enabled: number;
      configured: number;
      rejected: number;
    };
    collectors: {
      status: RuntimeReadiness;
      total: number;
      healthyOrIdle: number;
    };
  };
  featureFlags: { nativeLocalAI: boolean };
};

const RUNTIME_HEALTH_CACHE_KEY = "analyzerx.runtime-health.v1";

export async function saveRuntimeHealth(snapshot: RuntimeHealthSnapshot) {
  await AsyncStorage.setItem(RUNTIME_HEALTH_CACHE_KEY, JSON.stringify(snapshot));
}

export async function loadRuntimeHealth(): Promise<RuntimeHealthSnapshot | null> {
  const raw = await AsyncStorage.getItem(RUNTIME_HEALTH_CACHE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<RuntimeHealthSnapshot>;
    if (
      parsed.contractVersion !== 1 ||
      typeof parsed.checkedAt !== "string" ||
      !parsed.services ||
      !parsed.featureFlags
    ) {
      return null;
    }
    return parsed as RuntimeHealthSnapshot;
  } catch {
    return null;
  }
}
