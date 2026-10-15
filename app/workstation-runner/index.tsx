import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { ScreenContainer } from "@/components/screen-container";
import { cancelRunnerJob, confirmPairing, connectRunnerEvents, discoverRunners, getRunnerConnection, getRunnerState, revokeRunner, startPairing, startRunnerJob, type RunnerState } from "@/lib/workstation-runner";
import { useRouter } from "@/lib/navigation/router";
import QRCode from "react-native-qrcode-svg";
import { fireAndForget } from "@/lib/fire-and-forget";

const amber = "#F4B860";
const teal = "#4FD1C5";
const coral = "#FB7185";
const text = "#F4F7FB";
const muted = "#91A2B8";
const surface = "#111C2D";
const border = "#26364D";

export default function WorkstationRunnerScreen() {
  const router = useRouter();
  const [runnerUrl, setRunnerUrl] = useState("http://127.0.0.1:8765");
  const [state, setState] = useState<RunnerState | null>(null);
  const [pairNonce, setPairNonce] = useState<string | null>(null);
  const [pairingUrl, setPairingUrl] = useState<string | null>(null);
  const [status, setStatus] = useState("Not paired");
  const [error, setError] = useState<string | null>(null);
  const [startingJob, setStartingJob] = useState(false);
  const [providerName, setProviderName] = useState("OpenAI-compatible");
  const [providerKey, setProviderKey] = useState("");
  const [discovered, setDiscovered] = useState<{ service: string; version: string; url: string; hardware: { architecture: string } }[]>([]);
  const [discovering, setDiscovering] = useState(false);

  const refresh = async () => {
    try { setState(await getRunnerState()); setStatus("Connected"); setError(null); }
    catch (cause) { setStatus("Offline"); setError(cause instanceof Error ? cause.message : "Runner is not reachable"); }
  };

  useEffect(() => {
    fireAndForget(getRunnerConnection().then((connection) => { setRunnerUrl(connection.url); if (connection.token) void refresh(); }), "getRunnerConnection");
  }, []);
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    void connectRunnerEvents((event) => {
      if (event.job) setState((current) => current ? { ...current, jobs: current.jobs.map((job) => job.id === event.job?.id ? event.job : job) } : current);
      if (event.status) setStatus(event.status);
    }).then((stop) => { cleanup = stop; });
    return () => cleanup?.();
  }, []);

  const activeJob = useMemo(() => state?.jobs.find((job) => job.status === "running" || job.status === "queued"), [state?.jobs]);
  const progress = Math.round((activeJob?.progress ?? 0) * 100);

  const findNearby = async () => {
    try { setDiscovering(true); setError(null); setDiscovered(await discoverRunners()); if (!discovered.length) setStatus("No nearby runner found"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "LAN discovery failed"); }
    finally { setDiscovering(false); }
  };
  const pair = async () => {
    try { setError(null); const result = await startPairing(runnerUrl); setPairNonce(result.nonce); setPairingUrl(result.pairingUrl); setStatus("Pairing started — scan or confirm on workstation"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to start pairing"); }
  };
  const confirm = async () => {
    if (!pairNonce) return;
    try { await confirmPairing(runnerUrl, pairNonce); setPairNonce(null); setPairingUrl(null); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to confirm pairing"); }
  };
  const runJob = async () => {
    try { setStartingJob(true); setError(null); const job = await startRunnerJob("assistant", "local-default", "Run a local AnalyzerX assistant health check"); setState((current) => current ? { ...current, jobs: [job, ...current.jobs] } : current); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to start local job"); }
    finally { setStartingJob(false); }
  };
  const disconnect = async () => { try { await revokeRunner(); setState(null); setStatus("Revoked"); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to revoke runner"); } };
  const saveProviderKey = async () => {
    if (!providerKey.trim()) { setError("Enter a provider key on this trusted workstation connection."); return; }
    try { setError(null); await import("@/lib/workstation-runner").then(({ setRunnerProviderKey }) => setRunnerProviderKey(providerName, providerKey.trim())); setProviderKey(""); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save provider key"); }
  };

  return <ScreenContainer className="px-5" edges={["top", "left", "right", "bottom"]}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}><Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel="Go back"><Ionicons name="arrow-back" size={21} color={text} /></Pressable><View style={{ flex: 1 }}><Text style={styles.eyebrow}>LOCAL WORKSPACE</Text><Text style={styles.title}>Workstation Runner</Text></View><View style={[styles.statusPill, { borderColor: status === "Connected" || status === "running" ? teal : amber }]}><View style={[styles.dot, { backgroundColor: status === "Connected" || status === "running" ? teal : amber }]} /><Text style={[styles.statusText, { color: status === "Connected" || status === "running" ? teal : amber }]}>{status}</Text></View></View>
      <View style={styles.hero}><View style={styles.heroIcon}><Ionicons name="hardware-chip-outline" size={25} color={amber} /></View><View style={{ flex: 1 }}><Text style={styles.heroTitle}>BYOH local AI host</Text><Text style={styles.heroText}>Run models and provider calls on your own workstation. API keys stay there and are never bundled into AnalyzerX.</Text></View></View>
      <View style={styles.card}><Text style={styles.label}>WORKSTATION ADDRESS</Text><TextInput value={runnerUrl} onChangeText={setRunnerUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="http://127.0.0.1:8765" placeholderTextColor="#607088" style={styles.input} /><View style={styles.actionRow}><Pressable onPress={pair} style={styles.primaryButton}><Ionicons name="link-outline" size={17} color="#09111F" /><Text style={styles.primaryText}>Pair workstation</Text></Pressable><Pressable onPress={() => void findNearby()} style={styles.secondaryButton}><Ionicons name="wifi-outline" size={17} color={amber} /><Text style={styles.secondaryText}>{discovering ? "Searching" : "Find nearby"}</Text></Pressable><Pressable onPress={() => void refresh()} style={styles.secondaryButton}><Ionicons name="refresh-outline" size={17} color={amber} /><Text style={styles.secondaryText}>Refresh</Text></Pressable></View>{discovered.length ? <View style={styles.discoveryBox}><Text style={styles.pairTitle}>Nearby runners</Text>{discovered.map((item) => <Pressable key={item.url} onPress={() => { setRunnerUrl(item.url); setStatus("Runner selected"); }} style={styles.discoveryRow}><View style={{ flex: 1 }}><Text style={styles.providerName}>{item.url}</Text><Text style={styles.muted}>{item.hardware.architecture} · runner {item.version}</Text></View><Ionicons name="chevron-forward" size={16} color={amber} /></Pressable>)}</View> : null}{pairNonce ? <View style={styles.pairBox}><Text style={styles.pairTitle}>Scan this code or confirm the nonce on the workstation</Text>{pairingUrl ? <QRCode value={pairingUrl} size={154} backgroundColor="#FFFFFF" color="#09111F" /> : null}<Text style={styles.pairCode}>{pairNonce}</Text><Text style={styles.muted}>Expires in about two minutes. The QR code contains only a temporary pairing address and nonce.</Text><Pressable onPress={() => void confirm()} style={styles.secondaryButton}><Text style={styles.secondaryText}>Confirm pairing</Text></Pressable></View> : null}</View>
      {state ? <><View style={styles.metrics}><Metric label="Runner" value={state.status} /><Metric label="CPU" value={`${state.hardware.cpuCount} cores`} /><Metric label="Backend" value={state.hardware.backends.join(", ")} /><Metric label="Jobs" value={`${state.jobs.length}`} /></View><View style={styles.card}><View style={styles.sectionHeader}><View><Text style={styles.label}>ACTIVE EXECUTION</Text><Text style={styles.sectionTitle}>{activeJob ? activeJob.stage : "Runner is ready"}</Text></View><Pressable onPress={() => void runJob()} disabled={startingJob} style={[styles.primaryButton, startingJob && { opacity: 0.5 }]}><Ionicons name="play-outline" size={16} color="#09111F" /><Text style={styles.primaryText}>{startingJob ? "Starting" : "Run AI"}</Text></Pressable></View>{activeJob ? <><View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View><View style={styles.progressMeta}><Text style={styles.muted}>{progress}% · {activeJob.modelId}</Text><Pressable onPress={() => void cancelRunnerJob(activeJob.id)}><Text style={styles.cancel}>Cancel</Text></Pressable></View></> : <Text style={styles.muted}>Start a local health-check job to verify the workstation execution path.</Text>}</View><View style={styles.card}><Text style={styles.label}>PROVIDER STATUS</Text>{state.providers.length ? state.providers.map((provider) => <View key={provider.provider} style={styles.providerRow}><View style={{ flex: 1 }}><Text style={styles.providerName}>{provider.provider}</Text><Text style={styles.muted}>{provider.masked}</Text></View><Text style={[styles.providerStatus, { color: provider.configured ? teal : muted }]}>{provider.status}</Text></View>) : <Text style={styles.muted}>No workstation provider keys configured.</Text>}<TextInput value={providerName} onChangeText={setProviderName} autoCapitalize="none" placeholder="Provider name" placeholderTextColor="#607088" style={styles.input} /><TextInput value={providerKey} onChangeText={setProviderKey} autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder="API key (stored on workstation)" placeholderTextColor="#607088" style={styles.input} /><Pressable onPress={() => void saveProviderKey()} style={styles.secondaryButton}><Ionicons name="key-outline" size={15} color={amber} /><Text style={styles.secondaryText}>Save key on workstation</Text></Pressable><Text style={styles.keyNote}>The key is sent only to the paired runner and is never returned to the app.</Text></View><Pressable onPress={() => void disconnect()} style={styles.revokeButton}><Ionicons name="unlink-outline" size={17} color={coral} /><Text style={styles.revokeText}>Revoke workstation pairing</Text></Pressable></> : <View style={styles.empty}><Ionicons name="wifi-outline" size={28} color={amber} /><Text style={styles.emptyTitle}>Connect your own hardware</Text><Text style={styles.muted}>Install the Python runner on your workstation, enter its local address, and pair it here. No hosted backend is required for local inference.</Text></View>}
      {error ? <View style={styles.error}><Ionicons name="warning-outline" size={17} color={coral} /><Text style={styles.errorText}>{error}</Text></View> : null}
      <Text style={styles.disclaimer}>Local mode keeps prompts, models, and workstation API keys on your paired hardware. Connected mode is optional and is clearly labeled when used.</Text>
    </ScrollView>
  </ScreenContainer>;
}

function Metric({ label, value }: { label: string; value: string }) { return <View style={styles.metric}><Text style={styles.label}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>; }

const styles = StyleSheet.create({ content: { paddingBottom: 48 }, header: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 8, paddingBottom: 18 }, back: { width: 42, height: 42, borderRadius: 13, backgroundColor: surface, borderWidth: 1, borderColor: border, alignItems: "center", justifyContent: "center" }, eyebrow: { color: amber, fontSize: 10, fontWeight: "800", letterSpacing: 1.3 }, title: { color: text, fontSize: 27, fontWeight: "800", marginTop: 2 }, statusPill: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 5 }, dot: { width: 6, height: 6, borderRadius: 3 }, statusText: { fontSize: 8, fontWeight: "900" }, hero: { flexDirection: "row", gap: 12, backgroundColor: "#162639", borderWidth: 1, borderColor: "#315064", borderRadius: 17, padding: 15, marginBottom: 12 }, heroIcon: { width: 44, height: 44, borderRadius: 13, backgroundColor: "#273B45", alignItems: "center", justifyContent: "center" }, heroTitle: { color: text, fontSize: 15, fontWeight: "800" }, heroText: { color: muted, fontSize: 11, lineHeight: 16, marginTop: 4 }, card: { backgroundColor: surface, borderWidth: 1, borderColor: border, borderRadius: 16, padding: 14, marginBottom: 12 }, label: { color: amber, fontSize: 9, letterSpacing: 1.1, fontWeight: "900" }, input: { height: 45, borderWidth: 1, borderColor: border, borderRadius: 10, paddingHorizontal: 12, color: text, marginTop: 8, backgroundColor: "#0B1422" }, actionRow: { flexDirection: "row", gap: 8, marginTop: 10 }, primaryButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: amber, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }, primaryText: { color: "#09111F", fontSize: 11, fontWeight: "900" }, secondaryButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: "#76572D", borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9 }, secondaryText: { color: amber, fontSize: 11, fontWeight: "800" }, pairBox: { backgroundColor: "#17253A", borderRadius: 11, padding: 11, marginTop: 11, gap: 8, alignItems: "center" }, discoveryBox: { backgroundColor: "#17253A", borderRadius: 11, padding: 11, marginTop: 11 }, discoveryRow: { flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderTopColor: border, paddingVertical: 10, marginTop: 5 }, pairTitle: { color: text, fontSize: 11, fontWeight: "800" }, pairCode: { color: teal, fontSize: 15, fontWeight: "800", letterSpacing: 1 }, metrics: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }, metric: { minWidth: "47%", flexGrow: 1, backgroundColor: surface, borderWidth: 1, borderColor: border, borderRadius: 13, padding: 11 }, metricValue: { color: text, fontSize: 14, fontWeight: "800", marginTop: 5 }, sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, sectionTitle: { color: text, fontSize: 16, fontWeight: "800", marginTop: 4 }, progressTrack: { height: 8, borderRadius: 4, backgroundColor: "#26364D", overflow: "hidden", marginTop: 15 }, progressFill: { height: "100%", borderRadius: 4, backgroundColor: teal }, progressMeta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 7 }, muted: { color: muted, fontSize: 10, lineHeight: 15 }, cancel: { color: coral, fontSize: 10, fontWeight: "800" }, providerRow: { flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderTopColor: border, paddingVertical: 10, marginTop: 7 }, providerName: { color: text, fontSize: 12, fontWeight: "800" },   providerStatus: { fontSize: 10, fontWeight: "800" }, keyNote: { color: "#6E7D92", fontSize: 9, lineHeight: 14, marginTop: 8 }, empty: { alignItems: "center", backgroundColor: surface, borderWidth: 1, borderColor: border, borderRadius: 16, padding: 24, marginBottom: 12, gap: 8 }, emptyTitle: { color: text, fontSize: 15, fontWeight: "800" }, error: { flexDirection: "row", gap: 8, backgroundColor: "#3A1B2A", borderWidth: 1, borderColor: "#7A3048", borderRadius: 12, padding: 12, marginBottom: 12 }, errorText: { color: "#FDA4AF", flex: 1, fontSize: 10, lineHeight: 15 }, revokeButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderWidth: 1, borderColor: "#FB718566", borderRadius: 11, paddingVertical: 11, marginBottom: 18 }, revokeText: { color: coral, fontWeight: "800", fontSize: 11 }, disclaimer: { color: "#6E7D92", fontSize: 10, lineHeight: 15, textAlign: "center" } });
