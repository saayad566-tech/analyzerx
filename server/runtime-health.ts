import { getAllCollectorHealth } from "./collector-runtime";
import { getProviderRegistry } from "./provider-registry";

export type RuntimeHealthStatus = "ready" | "degraded" | "unavailable";

function readinessFrom(count: number): RuntimeHealthStatus {
  return count > 0 ? "ready" : "unavailable";
}

export function getRuntimeHealth() {
  const providers = getProviderRegistry();
  const collectors = getAllCollectorHealth();
  const enabledProviders = providers.filter((provider) => provider.enabled);
  const configuredProviders = enabledProviders.filter(
    (provider) => provider.status === "configured" || provider.status === "connector_validated",
  );
  const rejectedProviders = enabledProviders.filter(
    (provider) => provider.runtimeStatus === "rejected");
  const healthyCollectors = collectors.filter(
    (collector) => !collector.lastError && !collector.blockedReason,
  );
  const llmConfigured = Boolean(
    process.env.BUILT_IN_FORGE_API_URL && process.env.BUILT_IN_FORGE_API_KEY,
  );
  const databaseConfigured = Boolean(process.env.DATABASE_URL);

  return {
    contractVersion: 1,
    checkedAt: new Date().toISOString(),
    releaseVersion: process.env.ANALYZERX_RELEASE_VERSION ?? "development",
    api: { status: "ready" as const },
    services: {
      database: {
        status: databaseConfigured ? ("ready" as const) : ("unavailable" as const),
        configured: databaseConfigured,
      },
      llm: {
        status: llmConfigured ? ("ready" as const) : ("unavailable" as const),
        configured: llmConfigured,
      },
      providers: {
        status: readinessFrom(configuredProviders.length),
        enabled: enabledProviders.length,
        configured: configuredProviders.length,
        rejected: rejectedProviders.length,
      },
      collectors: {
        status: readinessFrom(healthyCollectors.length),
        total: collectors.length,
        healthyOrIdle: healthyCollectors.length,
      },
    },
    featureFlags: {
      nativeLocalAI: process.env.ANALYZERX_ENABLE_NATIVE_LOCAL_AI !== "false",
    },
  };
}
