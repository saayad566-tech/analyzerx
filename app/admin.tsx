import { useMemo } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "@/lib/navigation/router";
import Ionicons from "react-native-vector-icons/Ionicons";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";

const teal = "#4FD1C5";
const amber = "#F4B860";
const coral = "#FB7185";
const ink = "#F4F7FB";
const muted = "#91A2B8";
const panel = "#111C2D";
const border = "#26364D";

function freshness(lastSuccessAt: string | null) {
  if (!lastSuccessAt) return { label: "NO SUCCESS YET", color: amber };
  const age = Date.now() - new Date(lastSuccessAt).getTime();
  if (!Number.isFinite(age)) return { label: "UNKNOWN", color: amber };
  if (age <= 15 * 60_000) return { label: "FRESH", color: teal };
  if (age <= 24 * 60 * 60_000) return { label: "AGING", color: amber };
  return { label: "STALE", color: coral };
}

export default function AdminScreen() {
  const collectors = trpc.sources.nseCollectors.useQuery(undefined, { staleTime: 60_000, retry: false });
  const health = trpc.sources.health.useQuery(undefined, { refetchInterval: 30_000, retry: false });
  const providers = trpc.providers.list.useQuery(undefined, { staleTime: 60_000, retry: false });
  const providerHealth = trpc.providers.health.useQuery(undefined, { refetchInterval: 30_000, retry: false });
  const providerHistory = trpc.providers.history.useQuery({ limit: 20 }, { refetchInterval: 60_000, retry: false });
  const gdeltBudget = trpc.providers.gdeltBudget.useQuery(undefined, { refetchInterval: 15_000, retry: false });
  const webResearch = trpc.providers.webResearch.useQuery(undefined, { staleTime: 60_000, retry: false });
  const capabilityMatrix = trpc.capabilities.matrix.useQuery(undefined, { staleTime: 60_000, retry: false });
  const runCollector = trpc.sources.runNseCollector.useMutation({ onSuccess: () => health.refetch() });
  const runProvider = trpc.providers.runNow.useMutation({ onSuccess: () => { void providerHealth.refetch(); void providers.refetch(); } });
  const healthByKey = useMemo(() => new Map((health.data ?? []).map((item) => [item.key, item])), [health.data]);
  const blocked = (collectors.data ?? []).filter((item) => item.status === "blocked-unresolved-download");
  const errors = (health.data ?? []).filter((item) => item.lastError);
  const rejectedProviders = (providers.data ?? []).filter((item) => item.runtimeStatus === "rejected");
  const providerHealthById = useMemo(() => new Map((providerHealth.data ?? []).map((item) => [item.id, item])), [providerHealth.data]);
  const queryErrors = [collectors.error, health.error, providers.error, providerHealth.error, providerHistory.error, gdeltBudget.error, webResearch.error, capabilityMatrix.error].filter(Boolean);
  const adminAccessBlocked = queryErrors.some((error) => {
    const code = (error as { data?: { code?: string } } | undefined)?.data?.code;
    return code === "UNAUTHORIZED" || code === "FORBIDDEN";
  });
  const formatLatency = (value: number | null | undefined) => typeof value === "number" ? `${value} ms` : "No sample";
  const formatSuccess = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : "No successful response yet";

  return (
    <ScreenContainer containerClassName="bg-background" className="px-5">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={20} color={ink} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>OPERATIONS / PROVENANCE</Text>
            <Text style={styles.title}>Collector health</Text>
          </View>
          <View style={styles.livePill}><View style={styles.liveDot} /><Text style={styles.liveText}>LIVE</Text></View>
        </View>

        <View style={styles.explainer}>
          <Text style={styles.explainerTitle}>Exchange data operations</Text>
          <Text style={styles.explainerBody}>This view reports only observed collector state. Freshness is derived from the last successful run; blocked routes remain blocked until an authorized official mechanism is validated.</Text>
        </View>

        {collectors.isLoading || health.isLoading || providers.isLoading || providerHealth.isLoading || providerHistory.isLoading || gdeltBudget.isLoading || webResearch.isLoading || capabilityMatrix.isLoading ? <ActivityIndicator color={teal} style={styles.loader} /> : null}
        {adminAccessBlocked ? <View style={styles.errorBox}><Text style={styles.errorTitle}>Admin access required</Text><Text style={styles.errorBody}>Sign in with an administrator account to view provider telemetry, run collectors, or trigger provider actions. Public research data remains available elsewhere in AnalyzerX.</Text></View> : null}
        {queryErrors.length > 0 && !adminAccessBlocked ? <View style={styles.errorBox}><Text style={styles.errorTitle}>Operations data unavailable</Text><Text style={styles.errorBody}>The server did not return one or more operations datasets. Retry after the backend is reachable; no provider action was triggered.</Text></View> : null}

        {(collectors.data ?? []).map((collector) => {
          const item = healthByKey.get(collector.key);
          const freshnessState = freshness(item?.lastSuccessAt ?? null);
          const statusColor = collector.status === "blocked-unresolved-download" ? coral : item?.lastError ? coral : freshnessState.color;
          return <View key={collector.key} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardCopy}><Text style={styles.cardTitle}>{collector.dataset}</Text><Text style={styles.cardKey}>{collector.key}</Text></View>
              <View style={[styles.statusPill, { borderColor: statusColor + "66", backgroundColor: statusColor + "16" }]}><View style={[styles.statusDot, { backgroundColor: statusColor }]} /><Text style={[styles.statusText, { color: statusColor }]}>{collector.status === "blocked-unresolved-download" ? "BLOCKED" : item?.running ? "RUNNING" : freshnessState.label}</Text></View>
            </View>
            <Text style={styles.description}>{collector.limitation}</Text>
            <View style={styles.metricRow}><View><Text style={styles.metricLabel}>LAST SUCCESS</Text><Text style={styles.metricValue}>{item?.lastSuccessAt ? new Date(item.lastSuccessAt).toLocaleString() : "Not available"}</Text></View><View><Text style={styles.metricLabel}>RECORDS</Text><Text style={styles.metricValue}>{item?.recordsCollected ?? 0}</Text></View><View><Text style={styles.metricLabel}>API ERRORS</Text><Text style={styles.metricValue}>{item?.apiErrors ?? 0}</Text></View></View>
            {item?.lastError ? <Text style={styles.errorLine}>Latest error: {item.lastError}</Text> : null}
            {collector.status === "blocked-unresolved-download" ? <Text style={styles.blockedLine}>Blocked until the current official dynamic download mechanism is validated.</Text> : null}
            {collector.status !== "blocked-unresolved-download" ? <Pressable onPress={() => runCollector.mutate({ key: collector.key })} disabled={runCollector.isPending} style={({ pressed }) => [styles.runButton, pressed && styles.pressed, runCollector.isPending && styles.disabled]} accessibilityRole="button" accessibilityLabel={`Run ${collector.dataset}`}><Ionicons name="refresh" size={15} color="#09111F" /><Text style={styles.runText}>{runCollector.isPending ? "RUNNING…" : "RUN NOW"}</Text></Pressable> : null}
          </View>;
        })}

        <View style={styles.section}><Text style={styles.sectionTitle}>Provider status</Text><Text style={styles.sectionHint}>Credentials and runtime rejection state</Text></View>
        {(providers.data ?? []).filter((item) => item.domain === "news" || item.domain === "market-data").map((provider) => { const displayStatus = provider.runtimeStatus ?? provider.status; return <View key={provider.id} style={styles.providerRow}><View style={styles.providerCopy}><Text style={styles.providerName}>{provider.name}</Text><Text style={styles.providerNote}>{provider.notes}</Text></View><Text style={[styles.providerStatus, { color: displayStatus === "configured" || displayStatus === "healthy" ? teal : displayStatus === "rejected" ? coral : muted }]}>{displayStatus.replace("_", " ").toUpperCase()}</Text></View>; })}
        {rejectedProviders.length ? <View style={styles.warningBox}><Text style={styles.warningTitle}>Provider retry notice</Text><Text style={styles.warningBody}>A provider returned an error, but it remains isolated and eligible for a later retry. Other providers continue independently; review the latest error and credentials without disabling the rest of the pipeline.</Text></View> : null}

        <View style={styles.section}><Text style={styles.sectionTitle}>Provider telemetry</Text><Text style={styles.sectionHint}>Observed request latency and most recent successful response</Text></View>
        {providers.isLoading || providerHealth.isLoading ? <ActivityIndicator color={teal} style={styles.loader} /> : (providers.data ?? []).map((provider) => {
          const runtime = providerHealthById.get(provider.id);
          const state = runtime?.status ?? (provider.enabled ? "configured, not sampled" : "disabled");
          const stateColor = runtime?.status === "healthy" ? teal : runtime?.status === "rejected" ? coral : amber;
          return <View key={`telemetry-${provider.id}`} style={styles.telemetryCard}>
            <View style={styles.cardHeader}><View style={styles.cardCopy}><Text style={styles.providerName}>{provider.name}</Text><Text style={styles.cardKey}>{provider.domain} · {provider.id}</Text></View><Text style={[styles.providerStatus, { color: stateColor }]}>{state.toUpperCase()}</Text></View>
            <View style={styles.telemetryMetrics}><View style={styles.telemetryMetric}><Text style={styles.metricLabel}>LATENCY</Text><Text style={styles.metricValue}>{formatLatency(runtime?.latencyMs)}</Text></View><View style={styles.telemetryMetric}><Text style={styles.metricLabel}>LAST SUCCESS</Text><Text style={styles.metricValue}>{formatSuccess(runtime?.lastSuccessAt)}</Text></View><View style={styles.telemetryMetric}><Text style={styles.metricLabel}>LAST CHECK</Text><Text style={styles.metricValue}>{formatSuccess(runtime?.lastCheckedAt)}</Text></View><View style={styles.telemetryMetric}><Text style={styles.metricLabel}>PAYLOAD AT</Text><Text style={styles.metricValue}>{formatSuccess(runtime?.lastPayloadAt)}</Text></View></View>
            <View style={styles.circuitRow}><Text style={styles.telemetryNote}>{runtime?.circuitState ? `Circuit ${runtime.circuitState}${runtime.cooldownUntil ? ` · retry after ${formatSuccess(runtime.cooldownUntil)}` : ""}` : "Circuit closed · no cooldown"}</Text><Pressable onPress={() => runProvider.mutate({ providerId: provider.id, symbol: "RELIANCE" })} disabled={runProvider.isPending} style={({ pressed }) => [styles.providerRunButton, pressed && styles.pressed, runProvider.isPending && styles.disabled]} accessibilityRole="button" accessibilityLabel={`Run ${provider.name} now`}><Ionicons name="play" size={13} color="#09111F" /><Text style={styles.runText}>{runProvider.isPending ? "RUNNING…" : "RUN NOW"}</Text></Pressable></View>
            {runtime?.lastError ? <Text style={styles.errorLine}>Latest error: {runtime.lastError}</Text> : <Text style={styles.telemetryNote}>{runtime ? "Latest request completed without an error." : "No runtime request has sampled this provider yet."}</Text>}
            {runtime?.lastPayloadPreview ? <View style={styles.previewBox}><Text style={styles.metricLabel}>LAST SUCCESSFUL PAYLOAD PREVIEW</Text><Text selectable style={styles.previewText} numberOfLines={8}>{runtime.lastPayloadPreview}</Text></View> : <Text style={styles.telemetryNote}>No successful payload preview is available yet.</Text>}
          </View>;
        })}

        <View style={styles.section}><Text style={styles.sectionTitle}>GDELT request budget</Text><Text style={styles.sectionHint}>Adaptive no-key news fallback budget and cooldown telemetry</Text></View>
        {gdeltBudget.data ? <View style={styles.providerRow}><View style={styles.providerCopy}><Text style={styles.providerName}>{gdeltBudget.data.remaining} requests remaining · {gdeltBudget.data.requestsInWindow}/{gdeltBudget.data.maxRequestsPerWindow} used</Text><Text style={styles.providerNote}>{gdeltBudget.data.nextAllowedAt ? `Cooldown until ${new Date(gdeltBudget.data.nextAllowedAt).toLocaleString()}` : "No adaptive cooldown active"} · failures {gdeltBudget.data.consecutiveFailures}</Text></View><Text style={[styles.providerStatus, { color: gdeltBudget.data.nextAllowedAt ? amber : teal }]}>{gdeltBudget.data.nextAllowedAt ? "COOLDOWN" : "READY"}</Text></View> : null}

        <View style={styles.section}><Text style={styles.sectionTitle}>Persisted provider history</Text><Text style={styles.sectionHint}>Last 20 observed Run Now outcomes; retained for 30 days</Text></View>
        {(providerHistory.data ?? []).map((item) => <View key={item.id} style={styles.providerRow}><View style={styles.providerCopy}><Text style={styles.providerName}>{item.providerId} · {item.status.toUpperCase()}</Text><Text style={styles.providerNote}>{new Date(item.checkedAt).toLocaleString()} · {item.latencyMs ?? "—"} ms · circuit {item.circuitState}</Text></View><Text style={[styles.providerStatus, { color: item.status === "healthy" ? teal : item.status === "rejected" ? coral : amber }]}>{item.successAt ? "SUCCESS" : "FAILURE"}</Text></View>)}

        <View style={styles.section}><Text style={styles.sectionTitle}>Web research providers</Text><Text style={styles.sectionHint}>Optional enrichment only; official exchange sources remain primary</Text></View>
        {(webResearch.data ?? []).map((provider) => <View key={provider.id} style={styles.providerRow}><View style={styles.providerCopy}><Text style={styles.providerName}>{provider.name}</Text><Text style={styles.providerNote}>{provider.notes}</Text></View><Text style={[styles.providerStatus, { color: provider.status === "configured" || provider.status === "connector_validated" ? teal : provider.status === "rejected" ? coral : amber }]}>{provider.status.replace("_", " ").toUpperCase()}</Text></View>)}

        <View style={styles.section}><Text style={styles.sectionTitle}>Capability matrix</Text><Text style={styles.sectionHint}>Every registered dataset must show where it is stored, analyzed, and displayed</Text></View>
        {(capabilityMatrix.data ?? []).map((item) => {
          const stateColor = item.status === "ready" ? teal : item.status === "blocked" || item.status === "unavailable" ? coral : amber;
          return <View key={item.dataset} style={styles.capabilityRow}>
            <View style={styles.providerCopy}><Text style={styles.providerName}>{item.dataset}</Text><Text style={styles.providerNote}>{item.source} · {item.feature}</Text><Text style={styles.capabilityNote}>{item.uiDisplayed ? item.routeQuery ?? "UI route mapped" : "Internal only"}</Text></View>
            <View style={styles.capabilityBadges}><Text style={[styles.capabilityStatus, { color: stateColor }]}>{item.status.toUpperCase()}</Text><Text style={[styles.capabilityStatus, { color: item.uiDisplayed ? teal : coral }]}>{item.uiDisplayed ? "UI" : "NO UI"}</Text></View>
          </View>;
        })}

        <View style={styles.section}><Text style={styles.sectionTitle}>Known limitations</Text><Text style={styles.sectionHint}>{blocked.length} blocked dataset route{blocked.length === 1 ? "" : "s"} · {errors.length} active error{errors.length === 1 ? "" : "s"}</Text></View>
        <View style={styles.limitations}><Text style={styles.limitationText}>No CAPTCHA, WAF, robots, authentication, or licensing controls are bypassed. Dynamic bhavcopy, delivery, bulk-deal, and block-deal downloads remain unavailable until current official routes are confirmed.</Text></View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 32 },
  header: { flexDirection: "row", alignItems: "center", paddingTop: 18, paddingBottom: 18, gap: 12 },
  backButton: { width: 36, height: 36, borderRadius: 12, backgroundColor: panel, borderWidth: 1, borderColor: border, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1 },
  eyebrow: { color: teal, fontSize: 10, letterSpacing: 1.4, fontWeight: "800" },
  title: { color: ink, fontSize: 25, lineHeight: 31, fontWeight: "800", marginTop: 4 },
  livePill: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: teal + "55", backgroundColor: teal + "16", paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: teal },
  liveText: { color: teal, fontSize: 9, fontWeight: "800" },
  explainer: { backgroundColor: "#0D1728", borderRadius: 16, borderWidth: 1, borderColor: border, padding: 15, marginBottom: 15 },
  explainerTitle: { color: ink, fontSize: 14, fontWeight: "800" },
  explainerBody: { color: muted, fontSize: 12, lineHeight: 18, marginTop: 7 },
  loader: { marginVertical: 24 },
  errorBox: { backgroundColor: coral + "16", borderWidth: 1, borderColor: coral + "66", borderRadius: 14, padding: 14, marginBottom: 14 },
  errorTitle: { color: coral, fontWeight: "800" },
  errorBody: { color: muted, fontSize: 12, lineHeight: 17, marginTop: 5 },
  card: { backgroundColor: panel, borderRadius: 17, borderWidth: 1, borderColor: border, padding: 15, marginBottom: 12 },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  cardCopy: { flex: 1 },
  cardTitle: { color: ink, fontSize: 15, fontWeight: "800" },
  cardKey: { color: muted, fontSize: 10, marginTop: 3 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 7, paddingVertical: 5, borderRadius: 7, borderWidth: 1 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 9, fontWeight: "800" },
  description: { color: muted, fontSize: 12, lineHeight: 17, marginTop: 10 },
  metricRow: { flexDirection: "row", gap: 14, borderTopWidth: 1, borderTopColor: border, marginTop: 13, paddingTop: 11 },
  metricLabel: { color: muted, fontSize: 8, letterSpacing: 0.8, fontWeight: "800" },
  metricValue: { color: ink, fontSize: 11, fontWeight: "700", marginTop: 4 },
  errorLine: { color: coral, fontSize: 11, lineHeight: 16, marginTop: 10 },
  blockedLine: { color: amber, fontSize: 11, lineHeight: 16, marginTop: 10 },
  runButton: { backgroundColor: amber, borderRadius: 10, height: 38, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 13 },
  runText: { color: "#09111F", fontSize: 11, fontWeight: "800" },
  pressed: { opacity: 0.76, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.5 },
  section: { marginTop: 14, marginBottom: 10 },
  sectionTitle: { color: ink, fontSize: 18, fontWeight: "800" },
  sectionHint: { color: muted, fontSize: 11, marginTop: 3 },
  providerRow: { backgroundColor: panel, borderRadius: 14, borderWidth: 1, borderColor: border, padding: 13, marginBottom: 8, flexDirection: "row", gap: 10, alignItems: "flex-start" },
  providerCopy: { flex: 1 },
  providerName: { color: ink, fontSize: 13, fontWeight: "800" },
  providerNote: { color: muted, fontSize: 10, lineHeight: 15, marginTop: 4 },
  providerStatus: { fontSize: 9, fontWeight: "800", maxWidth: 110, textAlign: "right" },
  telemetryCard: { backgroundColor: panel, borderRadius: 14, borderWidth: 1, borderColor: border, padding: 13, marginBottom: 8 },
  telemetryMetrics: { flexDirection: "row", gap: 12, marginTop: 12 },
  circuitRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 12 },
  providerRunButton: { backgroundColor: amber, borderRadius: 9, minHeight: 32, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  previewBox: { backgroundColor: "#0B1525", borderRadius: 10, borderWidth: 1, borderColor: border, padding: 10, marginTop: 11 },
  previewText: { color: "#B9C7D8", fontSize: 10, lineHeight: 14, fontFamily: "monospace", marginTop: 6 },
  telemetryMetric: { flex: 1 },
  telemetryNote: { color: muted, fontSize: 10, lineHeight: 15, marginTop: 9 },
  warningBox: { backgroundColor: coral + "16", borderWidth: 1, borderColor: coral + "55", borderRadius: 14, padding: 13, marginTop: 5 },
  warningTitle: { color: coral, fontWeight: "800", fontSize: 13 },
  warningBody: { color: muted, fontSize: 11, lineHeight: 16, marginTop: 5 },
  capabilityRow: { backgroundColor: panel, borderRadius: 14, borderWidth: 1, borderColor: border, padding: 13, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 10 },
  capabilityBadges: { alignItems: "flex-end", gap: 5 },
  capabilityStatus: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  capabilityNote: { color: muted, fontSize: 10, marginTop: 4 },
  limitations: { backgroundColor: "#0D1728", borderWidth: 1, borderColor: border, borderRadius: 14, padding: 13 },
  limitationText: { color: muted, fontSize: 11, lineHeight: 17 },
});
