import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import Ionicons from "react-native-vector-icons/Ionicons";

import { ScreenContainer } from "@/components/screen-container";
import { OperationProgressCard } from "@/components/operation-progress-card";
import {
  LOCAL_AI_MODELS,
  assessLocalAIModel,
  deleteLocalAIModel,
  formatBytes,
  getActiveLocalAIModelId,
  getLocalAIDeviceProfile,
  getLocalAIModelState,
  getLocalAIRuntime,
  pauseLocalAIModelDownload,
  recommendLocalAIModel,
  setActiveLocalAIModelId,
  type LocalAIDeviceProfile,
  type LocalAIModelId,
  type LocalAIState,
} from "@/lib/local-ai";
import { fireAndForget } from "@/lib/fire-and-forget";

const amber = "#F4B860";
const teal = "#4FD1C5";
const ink = "#F4F7FB";
const muted = "#91A2B8";
const panel = "#111C2D";
const border = "#26364D";

export default function LocalAIScreen() {
  const [device, setDevice] = useState<LocalAIDeviceProfile | null>(null);
  const [states, setStates] = useState<Partial<Record<LocalAIModelId, LocalAIState>>>({});
  const [progress, setProgress] = useState<Partial<Record<LocalAIModelId, number>>>({});
  const [busy, setBusy] = useState<LocalAIModelId | null>(null);
  const [loadedModel, setLoadedModel] = useState<LocalAIModelId | null>(null);
  const [search, setSearch] = useState("");
  const [modelMenuOpen, setModelMenuOpen] = useState(false);

  async function refresh() {
    const profile = await getLocalAIDeviceProfile();
    setDevice(profile);
    const entries = await Promise.all(LOCAL_AI_MODELS.map(async (model) => [model.id, await getLocalAIModelState(model.id)] as const));
    setStates(Object.fromEntries(entries) as Record<LocalAIModelId, LocalAIState | undefined>);
  }

  useEffect(() => {
    fireAndForget(refresh(), "refresh");
    fireAndForget(getActiveLocalAIModelId().then(setLoadedModel), "getActiveLocalAIModelId");
  }, []);

  const assessments = useMemo(() => (device ? recommendLocalAIModel(device) : []), [device]);
  const downloadedModels = useMemo(() => LOCAL_AI_MODELS.filter((model) => states[model.id]?.status === "downloaded"), [states]);
  const visibleModels = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return LOCAL_AI_MODELS;
    return LOCAL_AI_MODELS.filter((model) => `${model.displayName} ${model.description} ${model.capabilities.join(" ")} ${model.runtime}`.toLowerCase().includes(query));
  }, [search]);

  async function download(modelId: LocalAIModelId) {
    setBusy(modelId);
    try {
      const { downloadLocalAIModel } = await import("@/lib/local-ai");
      await downloadLocalAIModel(modelId, (value) => setProgress((current) => ({ ...current, [modelId]: value.progress })));
      await refresh();
      Alert.alert("Model downloaded", "The verified LiteRT-LM artifact is stored on this device. Select Load model to start on-device inference.");
    } catch (error) {
      Alert.alert("Local model unavailable", error instanceof Error ? error.message : "The model could not be downloaded.");
    } finally {
      setBusy(null);
    }
  }

  async function loadModel(modelId: LocalAIModelId) {
    if (!device?.nativeRuntimeAvailable) return;
    setBusy(modelId);
    try {
      const verifiedState = await getLocalAIModelState(modelId);
      if (verifiedState.status !== "downloaded" || !verifiedState.localUri) {
        await setActiveLocalAIModelId(null);
        setLoadedModel(null);
        await refresh();
        Alert.alert("Model needs downloading", "The model file is no longer available on this device. Download it again before loading Local AI.");
        return;
      }
      const runtime = getLocalAIRuntime();
      const previousModel = await getActiveLocalAIModelId();
      if (previousModel && previousModel !== modelId) await runtime.unload();
      await runtime.load(verifiedState.localUri, device.backend === "unknown" ? "cpu" : device.backend);
      await setActiveLocalAIModelId(modelId);
      setLoadedModel(modelId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The native runtime could not load this model.";
      if (/model file|selected model file|not available on this device/i.test(message)) {
        await setActiveLocalAIModelId(null);
        setLoadedModel(null);
        await refresh();
      }
      Alert.alert("Could not load model", message);
    } finally { setBusy(null); }
  }

  async function unloadModel(modelId: LocalAIModelId) {
    setBusy(modelId);
    try { await getLocalAIRuntime().unload(); await setActiveLocalAIModelId(null); setLoadedModel((current) => current === modelId ? null : current); } catch (error) { Alert.alert("Could not unload model", error instanceof Error ? error.message : "Please try again."); } finally { setBusy(null); }
  }

  async function remove(modelId: LocalAIModelId) {
    setBusy(modelId);
    try { await deleteLocalAIModel(modelId); await setActiveLocalAIModelId(null); await refresh(); } catch (error) { Alert.alert("Could not delete model", error instanceof Error ? error.message : "Please try again."); } finally { setBusy(null); }
  }

  return (
    <ScreenContainer className="px-4" edges={["top", "left", "right"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]} accessibilityLabel="Go back"><Ionicons name="chevron-back" size={20} color={ink} /></Pressable>
          <View style={styles.headerCopy}><Text style={styles.eyebrow}>LOCAL AI</Text><Text style={styles.title}>Use your own hardware</Text></View>
        </View>
        <View style={styles.hero}>
          <View style={styles.heroIcon}><Ionicons name="hardware-chip-outline" size={25} color={amber} /></View>
          <View style={styles.heroCopy}><Text style={styles.heroTitle}>Choose the right local model</Text><Text style={styles.heroBody}>Browse verified and runtime-pending model families. AnalyzerX only enables download when the artifact, runtime, device, and license path are verified.</Text></View>
        </View>
        <Pressable onPress={() => router.push("/marketplace")} style={({ pressed }) => [styles.telemetryButton, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Open finance tool marketplace"><View style={styles.telemetryIcon}><Ionicons name="storefront-outline" size={18} color={amber} /></View><View style={styles.telemetryCopy}><Text style={styles.telemetryTitle}>Finance tool marketplace</Text><Text style={styles.telemetryBody}>Install Android-compatible data, research, sentiment, report, and assistant tools.</Text></View><Ionicons name="chevron-forward" size={17} color={muted} /></Pressable>
        <View style={styles.searchBox}><Ionicons name="search-outline" size={18} color={muted} /><TextInput value={search} onChangeText={setSearch} placeholder="Search models or capabilities" placeholderTextColor={muted} style={styles.searchInput} autoCapitalize="none" autoCorrect={false} /></View>
        <View style={styles.statusCard}>
          <View style={styles.statusHeader}><Ionicons name={device?.nativeRuntimeAvailable ? "checkmark-circle" : "information-circle"} size={18} color={device?.nativeRuntimeAvailable ? teal : amber} /><Text style={styles.statusTitle}>{device?.nativeRuntimeAvailable ? "Running locally on your device" : "Native Local AI bridge not included in this build"}</Text></View>
          <Text style={styles.statusText}>{device ? `${device.platform.toUpperCase()} · ${device.modelName ?? "device model unavailable"} · ${device.totalMemoryBytes ? formatBytes(device.totalMemoryBytes) : "RAM unavailable"} · ${device.freeStorageBytes ? `${formatBytes(device.freeStorageBytes)} free` : "storage unavailable"}` : "Checking device capability…"}</Text>
          {!device?.nativeRuntimeAvailable ? <Text style={styles.warning}>Local inference is unavailable in this build, but the main Assistant remains usable in Auto or Connected mode with grounded market responses. Open Assistant below to continue.</Text> : null}
        </View>
        {busy ? <OperationProgressCard title={states[busy]?.status === "downloaded" ? "Loading Local AI runtime" : "Downloading verified local model"} description={states[busy]?.status === "downloaded" ? "AnalyzerX is checking the native runtime and loading the selected artifact into your device memory." : "The model stays on this device. AnalyzerX verifies the artifact before it can be used for inference."} stages={states[busy]?.status === "downloaded" ? [{ label: "Checking device compatibility", state: "complete" }, { label: "Loading native runtime", state: "active", detail: "Preparing on-device inference" }, { label: "Verifying first inference", state: "pending" }] : [{ label: "Checking device compatibility", state: "complete" }, { label: "Downloading verified artifact", state: "active", detail: `${Math.round((progress[busy] ?? 0) * 100)}% transferred` }, { label: "Verifying model artifact", state: "pending" }, { label: "Ready for Local mode", state: "pending" }]} elapsedLabel="Keep AnalyzerX open until this finishes" /> : null}
        <View style={styles.assistantCard}><View style={styles.assistantHeader}><View style={styles.assistantIcon}><Ionicons name="chatbubbles-outline" size={19} color={teal} /></View><View style={styles.assistantCopy}><Text style={styles.assistantTitle}>Assistant connection</Text><Text style={styles.assistantBody}>{loadedModel ? `${LOCAL_AI_MODELS.find((model) => model.id === loadedModel)?.displayName ?? loadedModel} is loaded for Local mode.` : "Load a verified model to enable Local mode."}</Text></View><View style={[styles.connectionDot, { backgroundColor: loadedModel && device?.nativeRuntimeAvailable ? teal : amber }]} /></View><Text style={styles.assistantMeta}>The Assistant supplies grounded market context first, then routes text or supported attachments to this loaded model. Automatic mode falls back to Connected mode when native inference is unavailable.</Text><Pressable onPress={() => setModelMenuOpen((open) => !open)} style={({ pressed }) => [styles.modelPicker, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Choose downloaded Local AI model"><View><Text style={styles.modelPickerLabel}>ACTIVE LOCAL MODEL</Text><Text style={styles.modelPickerValue}>{loadedModel ? LOCAL_AI_MODELS.find((model) => model.id === loadedModel)?.displayName ?? loadedModel : downloadedModels.length ? "Choose a downloaded model" : "No downloaded models"}</Text></View><Ionicons name={modelMenuOpen ? "chevron-up" : "chevron-down"} size={17} color={teal} /></Pressable>{modelMenuOpen ? <View style={styles.modelMenu}>{downloadedModels.length ? downloadedModels.map((model) => <Pressable key={model.id} onPress={() => { setModelMenuOpen(false); void loadModel(model.id); }} style={({ pressed }) => [styles.modelMenuItem, pressed && styles.pressed]}><View style={[styles.modelMenuDot, { backgroundColor: loadedModel === model.id ? teal : muted }]} /><Text style={styles.modelMenuText}>{model.displayName}</Text><Text style={styles.modelMenuStatus}>{loadedModel === model.id ? "LOADED" : "READY"}</Text></Pressable>) : <Text style={styles.modelMenuEmpty}>Download a verified model below to enable manual switching.</Text>}</View> : null}<Pressable onPress={() => router.push("/market-chat")} style={({ pressed }) => [styles.assistantButton, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Open AnalyzerX Assistant"><Ionicons name="arrow-forward-circle-outline" size={17} color={teal} /><Text style={styles.assistantButtonText}>Open Assistant</Text></Pressable></View>
        <Pressable onPress={() => router.push("/local-ai-telemetry")} style={({ pressed }) => [styles.telemetryButton, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Open Local AI telemetry">
          <View style={styles.telemetryIcon}><Ionicons name="pulse-outline" size={18} color={teal} /></View>
          <View style={styles.telemetryCopy}><Text style={styles.telemetryTitle}>Local AI telemetry</Text><Text style={styles.telemetryBody}>Review latency, throughput, success rate, battery context, and model history.</Text></View>
          <Ionicons name="chevron-forward" size={17} color={muted} />
        </Pressable>
        <Text style={styles.sectionLabel}>{search.trim() ? `Matching models · ${visibleModels.length}` : `Available model families · ${LOCAL_AI_MODELS.length}`}</Text>
        {visibleModels.map((model) => {
          const assessment = assessments.find((item) => item.model.id === model.id) ?? (device ? assessLocalAIModel(model, device) : null);
          const state = states[model.id];
          const isBusy = busy === model.id;
          const downloaded = state?.status === "downloaded";
          return <View key={model.id} style={styles.modelCard}>
            <View style={styles.modelHeader}><View><Text style={styles.modelTitle}>{model.displayName}</Text><Text style={styles.modelSubtitle}>{model.runtime} · {model.format.toUpperCase()} · {model.license}</Text></View>{assessment?.recommended ? <View style={styles.recommended}><Text style={styles.recommendedText}>RECOMMENDED</Text></View> : null}</View>
            <View style={styles.metrics}><View><Text style={styles.metricLabel}>DOWNLOAD</Text><Text style={styles.metricValue}>{model.sizeLabel}</Text></View><View><Text style={styles.metricLabel}>RAM TARGET</Text><Text style={styles.metricValue}>{model.recommendedRamBytes ? `${formatBytes(model.recommendedRamBytes)}+` : "Not verified"}</Text></View><View><Text style={styles.metricLabel}>CAPABILITIES</Text><Text style={styles.metricValue}>{model.capabilities.slice(0, 2).join(" · ")}</Text></View></View>
            {assessment && !assessment.eligible ? <View style={styles.reasons}>{assessment.reasons.slice(0, 3).map((reason) => <Text key={reason} style={styles.reason}>• {reason}</Text>)}</View> : null}
            {isBusy ? <View style={styles.progressWrap}><View style={[styles.progressBar, { width: `${Math.max(3, Math.round((progress[model.id] ?? 0) * 100))}%` }]} /><Text style={styles.progressText}>{Math.round((progress[model.id] ?? 0) * 100)}% downloaded</Text></View> : null}
            <View style={styles.actionRow}>{downloaded ? <><View style={styles.downloaded}><Ionicons name={loadedModel === model.id ? "radio-button-on" : "checkmark-circle"} size={17} color={loadedModel === model.id ? amber : teal} /><Text style={[styles.downloadedText, loadedModel === model.id && { color: amber }]}>{loadedModel === model.id ? "Loaded for on-device inference" : "Verified artifact on device"}</Text></View><View style={styles.actionButtons}>{loadedModel === model.id ? <Pressable onPress={() => void unloadModel(model.id)} disabled={isBusy} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}><Text style={styles.secondaryText}>Unload</Text></Pressable> : <Pressable onPress={() => void loadModel(model.id)} disabled={isBusy || !device?.nativeRuntimeAvailable} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, (!device?.nativeRuntimeAvailable || isBusy) && styles.disabled]}><Ionicons name="play-outline" size={17} color="#09111F" /><Text style={styles.primaryText}>{isBusy ? "Loading…" : "Load model"}</Text></Pressable>}<Pressable onPress={() => void remove(model.id)} disabled={isBusy || loadedModel === model.id} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed, loadedModel === model.id && styles.disabled]}><Text style={styles.secondaryText}>Delete</Text></Pressable></View></> : <View style={styles.downloadActionRow}><Pressable onPress={() => void download(model.id)} disabled={isBusy || !assessment?.eligible} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, (!assessment?.eligible || isBusy) && styles.disabled]}><Ionicons name={isBusy ? "pause-outline" : "download-outline"} size={17} color="#09111F" /><Text style={styles.primaryText}>{isBusy ? "Downloading…" : model.installability === "verified_installable" ? (state?.progress ? "Resume download" : "Download model") : model.installability === "requires_account" ? "Login required" : "Runtime pending"}</Text></Pressable>{isBusy ? <Pressable onPress={() => void pauseLocalAIModelDownload(model.id)} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}><Text style={styles.secondaryText}>Pause</Text></Pressable> : null}</View>}</View>
          </View>;
        })}
        <View style={styles.note}><Ionicons name="shield-checkmark-outline" size={17} color={teal} /><Text style={styles.noteText}>The main market workflows remain usable without local hardware. Auto mode uses Connected Assistant when native Local AI is unavailable; Local mode stays explicit and never pretends that an unverified model is loaded. Android native builds support load, stream, cancel, and unload only after the runtime and device gates pass.</Text></View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({ content: { paddingBottom: 50 }, searchBox: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: border, borderRadius: 13, backgroundColor: panel, paddingHorizontal: 12, marginTop: 12 }, searchInput: { flex: 1, color: ink, fontSize: 13, paddingVertical: 12 }, sectionLabel: { color: amber, fontSize: 10, fontWeight: "900", letterSpacing: 1.1, marginTop: 18, marginBottom: 2 }, header: { flexDirection: "row", alignItems: "center", gap: 11, paddingTop: 8, paddingBottom: 16 }, iconButton: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: border, backgroundColor: panel, alignItems: "center", justifyContent: "center" }, headerCopy: { flex: 1 }, eyebrow: { color: amber, fontSize: 10, fontWeight: "800", letterSpacing: 1.4 }, title: { color: ink, fontSize: 26, fontWeight: "900", marginTop: 2 }, hero: { flexDirection: "row", gap: 12, borderRadius: 17, borderWidth: 1, borderColor: "#66502D", backgroundColor: "#2A241C", padding: 15 }, heroIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: "#F4B86018", alignItems: "center", justifyContent: "center" }, heroCopy: { flex: 1 }, heroTitle: { color: ink, fontSize: 15, fontWeight: "900" }, heroBody: { color: muted, fontSize: 11, lineHeight: 16, marginTop: 5 }, assistantCard: { borderWidth: 1, borderColor: "#2D766F", borderRadius: 15, backgroundColor: "#102B31", padding: 13, marginTop: 12 }, assistantHeader: { flexDirection: "row", alignItems: "center", gap: 9 }, assistantIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: "#4FD1C518", alignItems: "center", justifyContent: "center" }, assistantCopy: { flex: 1 }, assistantTitle: { color: ink, fontSize: 12, fontWeight: "900" }, assistantBody: { color: muted, fontSize: 10, lineHeight: 14, marginTop: 3 }, connectionDot: { width: 9, height: 9, borderRadius: 5 }, assistantMeta: { color: muted, fontSize: 10, lineHeight: 15, marginTop: 9 }, modelPicker: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: "#4FD1C566", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, marginTop: 11 }, modelPickerLabel: { color: muted, fontSize: 8, fontWeight: "900", letterSpacing: 0.8 }, modelPickerValue: { color: ink, fontSize: 11, fontWeight: "900", marginTop: 3 }, modelMenu: { borderWidth: 1, borderColor: "#4FD1C566", borderRadius: 10, backgroundColor: "#0B2026", marginTop: 5, overflow: "hidden" }, modelMenuItem: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#4FD1C522" }, modelMenuDot: { width: 7, height: 7, borderRadius: 4 }, modelMenuText: { flex: 1, color: ink, fontSize: 10, fontWeight: "800" }, modelMenuStatus: { color: teal, fontSize: 8, fontWeight: "900" }, modelMenuEmpty: { color: muted, fontSize: 10, lineHeight: 14, padding: 11 }, assistantButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderWidth: 1, borderColor: "#4FD1C566", borderRadius: 10, paddingVertical: 9, marginTop: 11 }, assistantButtonText: { color: teal, fontSize: 11, fontWeight: "900" }, statusCard: { borderWidth: 1, borderColor: border, borderRadius: 15, backgroundColor: panel, padding: 13, marginTop: 12 }, telemetryButton: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: border, borderRadius: 14, backgroundColor: panel, padding: 12, marginTop: 10 }, telemetryIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: "#4FD1C518", alignItems: "center", justifyContent: "center" }, telemetryCopy: { flex: 1 }, telemetryTitle: { color: ink, fontSize: 12, fontWeight: "900" }, telemetryBody: { color: muted, fontSize: 10, lineHeight: 14, marginTop: 3 }, statusHeader: { flexDirection: "row", alignItems: "center", gap: 7 }, statusTitle: { color: ink, fontSize: 12, fontWeight: "900", flex: 1 }, statusText: { color: muted, fontSize: 10, marginTop: 7 }, warning: { color: amber, fontSize: 10, lineHeight: 15, marginTop: 7 }, modelCard: { borderWidth: 1, borderColor: border, borderRadius: 16, backgroundColor: panel, padding: 14, marginTop: 12 }, modelHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }, modelTitle: { color: ink, fontSize: 16, fontWeight: "900" }, modelSubtitle: { color: muted, fontSize: 10, marginTop: 4 }, recommended: { borderRadius: 7, backgroundColor: "#4FD1C518", borderWidth: 1, borderColor: teal + "66", paddingHorizontal: 7, paddingVertical: 5 }, recommendedText: { color: teal, fontSize: 8, fontWeight: "900" }, metrics: { flexDirection: "row", justifyContent: "space-between", marginTop: 15, paddingTop: 11, borderTopWidth: 1, borderTopColor: border }, metricLabel: { color: muted, fontSize: 8, fontWeight: "800", letterSpacing: 0.8 }, metricValue: { color: ink, fontSize: 12, fontWeight: "800", marginTop: 4 }, reasons: { backgroundColor: "#FB718512", borderRadius: 10, padding: 9, marginTop: 11 }, reason: { color: "#FDA4AF", fontSize: 10, lineHeight: 15 }, progressWrap: { marginTop: 12 }, progressBar: { height: 6, backgroundColor: teal, borderRadius: 3 }, progressText: { color: muted, fontSize: 9, marginTop: 5 }, actionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14 }, actionButtons: { flexDirection: "row", alignItems: "center", gap: 8 }, downloadActionRow: { flexDirection: "row", alignItems: "center", gap: 8 }, primaryButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: amber, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 10 }, primaryText: { color: "#09111F", fontSize: 11, fontWeight: "900" }, secondaryButton: { borderWidth: 1, borderColor: border, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 8 }, secondaryText: { color: muted, fontSize: 10, fontWeight: "800" }, downloaded: { flexDirection: "row", alignItems: "center", gap: 6 }, downloadedText: { color: teal, fontSize: 10, fontWeight: "800" }, note: { flexDirection: "row", gap: 8, borderRadius: 13, backgroundColor: "#17253A", padding: 13, marginTop: 14 }, noteText: { flex: 1, color: muted, fontSize: 10, lineHeight: 15 }, pressed: { opacity: 0.76 }, disabled: { opacity: 0.45 } });
