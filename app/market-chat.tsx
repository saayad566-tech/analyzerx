import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Animated, Easing, FlatList, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { ScreenContainer } from "@/components/screen-container";
import { Skeleton, SkeletonList } from "@/components/skeleton";
import { AnimatedPressable } from "@/components/motion";
import { ModelSwitcher } from "@/components/model-switcher";
import { trpc } from "@/lib/trpc";
import { clearMarketChatHistory, loadMarketChatHistory, loadMarketChatRuntimeMode, saveMarketChatHistory, saveMarketChatRuntimeMode, type LocalChatMessage, type MarketChatRuntimeMode } from "@/lib/local-preferences";
import type { AnalyzerXAction, MarketChatAttachment } from "@/server/market-chat";
import { getActiveLocalAIModelId, getLocalAIModel, getLocalAIRuntime, type LocalAIModelId } from "@/lib/local-ai";
import { buildBoundedLocalPrompt, formatAssistantFailure, isConnectedEngineConfigured, isGeneralChatQuestion, isCurrentDataQuestion, localPromptNotice, resolveMarketChatEngine, trimLocalHistory } from "@/lib/market-chat-runtime";
import { createStreamingSanitizer, sanitizeAssistantOutput } from "@/lib/assistant-output";
import { LocalAIModelError, localAISession } from "@/lib/local-ai-session";
import { getLocalAIDeviceTelemetrySnapshot, recordLocalAIInference } from "@/lib/local-ai-telemetry";
import { MarketScopeChip } from "@/components/market-scope-chip";
import { useMarketContext } from "@/lib/market-context";

const amber = "#F4B860";
const teal = "#4FD1C5";
const coral = "#FB7185";
const ink = "#F4F7FB";
const muted = "#91A2B8";
const panel = "#111C2D";
const border = "#26364D";

type ChatItem = LocalChatMessage & { id: string; confidence?: "high" | "medium" | "low"; symbol?: string | null; sources?: { label: string; detail: string; url?: string }[]; dataAsOf?: string | null; limitations?: string[]; suggestedQuestions?: string[]; action?: AnalyzerXAction | null; attachmentLabel?: string; retryQuestion?: string; retryAttachments?: PendingAttachment[] };

type PendingAttachment = MarketChatAttachment & { id: string; label: string; previewUri?: string; sourceUri?: string };
const starterQuestions = ["Analyze TCS fundamentals", "What are the latest risks for RELIANCE?", "Show me where Market Flows is and explain FII vs DII"];

async function uriToDataUrl(uri: string, mimeType: string) {
  if (uri.startsWith("data:")) return uri;
  if (Platform.OS !== "web") {
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    return `data:${mimeType};base64,${base64}`;
  }
  const response = await fetch(uri);
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the selected file"));
    reader.readAsDataURL(blob);
  });
}

export default function MarketChatScreen() {
  const { marketId } = useMarketContext();
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [activeLocalModelId, setActiveLocalModelId] = useState<LocalAIModelId | null>(null);
  const [activeLocalModel, setActiveLocalModel] = useState<string | null>(null);
  const [runtimeMode, setRuntimeMode] = useState<MarketChatRuntimeMode>("auto");
  const [localStreaming, setLocalStreaming] = useState(false);
  const chat = trpc.chat.ask.useMutation();
  const ground = trpc.chat.ground.useMutation();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  useEffect(() => {
    void loadMarketChatHistory().then((saved) => { setMessages(saved.map((item, index) => ({ ...item, id: `saved-${index}` }))); setHydrated(true); });
    void loadMarketChatRuntimeMode().then(setRuntimeMode);
  }, []);

  const refreshRuntimeSelection = useCallback(() => {
    void getActiveLocalAIModelId().then((modelId) => { setActiveLocalModelId(modelId); setActiveLocalModel(modelId ? getLocalAIModel(modelId).displayName : null); });
  }, []);

  useFocusEffect(useCallback(() => {
    refreshRuntimeSelection();
    return undefined;
  }, [refreshRuntimeSelection]));

  const nativeRuntimeAvailable = getLocalAIRuntime().isAvailable;
  const effectiveEngine = resolveMarketChatEngine({ mode: runtimeMode, activeModelId: activeLocalModelId, nativeRuntimeAvailable, hasAttachments: false });
  const runtimeStatus = effectiveEngine === "local"
    ? { label: "Local AI", detail: activeLocalModel ?? "verified local model", color: teal, icon: "hardware-chip-outline" as const }
    : effectiveEngine === "connected"
      ? (isConnectedEngineConfigured()
        ? { label: runtimeMode === "local" || runtimeMode === "auto" ? "Connected fallback" : "Connected", detail: "hosted evidence engine", color: amber, icon: "cloud-outline" as const }
        : { label: "Connected · no provider", detail: "no hosted provider is configured", color: coral, icon: "cloud-outline" as const })
      : { label: "Unavailable", detail: "choose Connected or load Local AI", color: coral, icon: "warning-outline" as const };
  const runtimeOpacity = useRef(new Animated.Value(1)).current;
  const previousEngine = useRef(effectiveEngine);

  useEffect(() => {
    if (previousEngine.current === effectiveEngine) return;
    previousEngine.current = effectiveEngine;
    runtimeOpacity.setValue(0.35);
    Animated.timing(runtimeOpacity, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [effectiveEngine, runtimeOpacity]);

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 0.8, selectionLimit: 1 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    try {
      const mimeType = asset.mimeType ?? "image/jpeg";
      const dataUrl = await uriToDataUrl(asset.uri, mimeType);
      setAttachments((current) => [...current, { id: `image-${Date.now()}`, kind: "image" as const, dataUrl, mimeType, label: "Screenshot or chart", previewUri: asset.uri, sourceUri: asset.uri }].slice(-2));
    } catch (error) { Alert.alert("Could not attach image", error instanceof Error ? error.message : "Please try again."); }
  }

  async function toggleRecording() {
    if (recorderState.isRecording) {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) return;
      try {
        const dataUrl = await uriToDataUrl(uri, "audio/m4a");
        setAttachments((current) => [...current, { id: `audio-${Date.now()}`, kind: "audio" as const, dataUrl, mimeType: "audio/mp4", label: "Voice question", sourceUri: uri }].slice(-2));
      } catch (error) { Alert.alert("Could not attach audio", error instanceof Error ? error.message : "Please try again."); }
      return;
    }
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) { Alert.alert("Microphone permission needed", "Allow microphone access to ask AnalyzerX by voice."); return; }
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
  }

  function executeAnalyzerXAction(action: AnalyzerXAction | null | undefined) {
    if (!action) return;
    if (action.type === "navigate") router.push({ pathname: action.route, params: action.params });
    if (action.type === "open_report") router.push({ pathname: "/screener", params: { symbol: action.symbol } });
    if (action.type === "filter_news") router.push({ pathname: "/", params: { symbol: action.symbol, sentiment: action.sentiment ?? "" } });
  }

  async function chooseRuntimeMode(mode: MarketChatRuntimeMode) {
    if (mode === "local" && (!activeLocalModelId || !nativeRuntimeAvailable)) {
      setRuntimeMode("local");
      await saveMarketChatRuntimeMode("local");
      return;
    }
    setRuntimeMode(mode);
    await saveMarketChatRuntimeMode(mode);
  }

  async function toggleRuntimeFromHeader() {
    if (runtimeMode === "local") {
      await chooseRuntimeMode("connected");
      return;
    }
    if (activeLocalModelId && nativeRuntimeAvailable) {
      await chooseRuntimeMode("local");
      return;
    }
    await chooseRuntimeMode("connected");
  }

  async function sendMessage(value = draft, attachmentOverride?: PendingAttachment[], retryFailureId?: string) {
    const question = value.trim();
    const attachmentSnapshot = attachmentOverride ?? attachments;
    if ((!question && attachmentSnapshot.length === 0) || chat.isPending || ground.isPending || localStreaming || recorderState.isRecording) return;
    const selectedRuntime = getLocalAIRuntime();
    const selectedManifest = activeLocalModelId ? getLocalAIModel(activeLocalModelId) : null;
    const supportsAttachments = attachmentSnapshot.every((item) => Boolean(item.sourceUri) && (item.kind === "image" ? Boolean(selectedManifest?.capabilities.includes("vision")) : Boolean(selectedManifest?.capabilities.includes("audio"))));
    const baseEngine = resolveMarketChatEngine({ mode: runtimeMode, activeModelId: activeLocalModelId, nativeRuntimeAvailable: selectedRuntime.isAvailable, hasAttachments: attachmentSnapshot.length > 0, supportsAttachments });
    const localCanServe = Boolean(selectedRuntime.isAvailable && activeLocalModelId) && (!attachmentSnapshot.length || supportsAttachments);
    // In Auto mode prefer the local model whenever one can serve the request: it
    // answers general questions AND market questions grounded in verified
    // context. Only fall back to the deterministic connected path when no local
    // model is ready, so a market question no longer dead-ends.
    const engine = runtimeMode === "auto" ? (localCanServe ? "local" : "connected") : baseEngine;
    if (engine === "blocked") {
      Alert.alert("Assistant unavailable", "Choose Auto or Connected mode and try again.");
      return;
    }
    const useLocal = engine === "local";
    const userMessage: ChatItem = { id: `user-${Date.now()}`, role: "user", content: question || "Please analyze the attached input.", attachmentLabel: attachmentSnapshot.length ? attachmentSnapshot.map((item) => item.label).join(" + ") : undefined };
    const baseMessages = retryFailureId ? messages.filter((item) => item.id !== retryFailureId) : messages;
    const next = retryFailureId ? baseMessages : [...baseMessages, userMessage];
    setMessages(next); setDraft(""); setAttachments([]);
    try {
      if (useLocal) {
        const generalQuestion = isGeneralChatQuestion(question);
        const grounded = generalQuestion ? null : await ground.mutateAsync({ message: question || "Summarize the supplied market context.", marketId });
        const modelId = activeLocalModelId;
        if (!modelId) throw new LocalAIModelError("No on-device model is selected.", "Choose a model in the switcher, or use Connected mode.");
        // Load (or confirm) the model before inference so the UI never claims a
        // model is ready while the native engine is empty.
        await localAISession.ensureModelLoaded(modelId);
        localAISession.markGenerating(true);
        setLocalStreaming(true);
        const startedAt = Date.now();
        const telemetrySnapshot = await getLocalAIDeviceTelemetrySnapshot();
        let answer = "";
        let tokenCount = 0;
        const localInputs = attachmentSnapshot.length ? { imagePath: attachmentSnapshot.find((item) => item.kind === "image")?.sourceUri, audioPath: attachmentSnapshot.find((item) => item.kind === "audio")?.sourceUri } : undefined;
        const localPrompt = buildBoundedLocalPrompt(question, grounded?.context ?? "", activeLocalModel ?? "the selected local model", !generalQuestion, selectedManifest?.contextTokens ?? null);
        // Stream through the output guard so reasoning and control tokens are
        // withheld as they arrive, and render tokens live.
        const guard = createStreamingSanitizer({ systemInstruction: localPrompt.system, maxChars: 8000 });
        const assistantId = `assistant-${Date.now()}`;
        setMessages((current) => [...current, { id: assistantId, role: "assistant", content: "" }]);
        try {
          await selectedRuntime.stream(localPrompt.turn, (token) => { const safe = guard.push(token); if (safe) { answer += safe; setMessages((current) => current.map((item) => (item.id === assistantId ? { ...item, content: answer } : item))); } tokenCount += token.trim().split(/\\s+/).filter(Boolean).length; }, { ...localInputs, systemInstruction: localPrompt.system });
          await recordLocalAIInference({ modelId: activeLocalModelId ?? "unknown", startedAt: new Date(startedAt).toISOString(), durationMs: Date.now() - startedAt, tokenCount, backend: selectedRuntime.kind, success: true, ...telemetrySnapshot });
        } catch (localError) {
          await recordLocalAIInference({ modelId: activeLocalModelId ?? "unknown", startedAt: new Date(startedAt).toISOString(), durationMs: Date.now() - startedAt, tokenCount, backend: selectedRuntime.kind, success: false, errorCode: localError instanceof Error ? localError.name : "LOCAL_AI_ERROR", ...telemetrySnapshot });
          throw localError;
        }
        const tail = guard.flush();
        if (tail) answer += tail;
        const sanitizedAnswer = sanitizeAssistantOutput(answer, { systemInstruction: localPrompt.system });
        if (!sanitizedAnswer) throw new Error("The local model returned an empty response.");
        const assistantMessage: ChatItem = { id: assistantId, role: "assistant", content: sanitizedAnswer, confidence: "medium", symbol: grounded?.symbol ?? null, sources: grounded?.sources ?? [], dataAsOf: grounded?.dataAsOf ?? null, limitations: [`Generated by ${activeLocalModel ?? "the selected local model"}${generalQuestion ? " for general chat." : " from bounded verified context."}`, ...(localPromptNotice(localPrompt.wasTrimmed, selectedManifest?.contextTokens ?? null) ? [localPromptNotice(localPrompt.wasTrimmed, selectedManifest?.contextTokens ?? null)!] : []), "Local inference does not execute app actions; use Connected mode for navigation actions and as a fallback when native multimodal processing is unavailable."] };
        const completed = [...next, assistantMessage]; setMessages(completed); await saveMarketChatHistory(completed);
      } else {
        const response = await chat.mutateAsync({ message: question, marketId, history: trimLocalHistory(baseMessages.slice(-8).map(({ role, content }) => ({ role: role as "user" | "assistant", content })) as { role: "user" | "assistant"; content: string }[]), attachments: attachmentSnapshot.map(({ id: _id, label: _label, previewUri: _previewUri, sourceUri: _sourceUri, ...item }) => item) });
        const assistantMessage: ChatItem = { id: `assistant-${Date.now()}`, role: "assistant", content: sanitizeAssistantOutput(response.answer), confidence: response.confidence, symbol: response.symbol, sources: response.sources, dataAsOf: response.dataAsOf, limitations: response.limitations, suggestedQuestions: response.suggestedQuestions, action: response.action };
        const completed = [...next, assistantMessage]; setMessages(completed); await saveMarketChatHistory(completed);
        if (response.action) executeAnalyzerXAction(response.action);
      }
    } catch (error) {
      // The failure text is a classified, user-facing message. Raw runtime errors can
      // embed the entire prompt (including chat-template tokens), so the message is
      // never taken verbatim from the thrown error.
      const failure: ChatItem = { id: `error-${Date.now()}`, role: "assistant", content: error instanceof LocalAIModelError ? `${error.userMessage} ${error.nextAction}` : formatAssistantFailure(error), confidence: "low", limitations: [useLocal ? `The local model (${activeLocalModel ?? "the selected model"}) could not complete this request. Your conversation is preserved; retry, or switch to Connected mode.` : "Connected mode could not complete this request. Your conversation is preserved."], retryQuestion: question, retryAttachments: attachmentSnapshot };
      const completed = [...next, failure]; setMessages(completed); await saveMarketChatHistory(completed);
    } finally {
      localAISession.markGenerating(false);
      setLocalStreaming(false);
    }
  }

  async function clearHistory() { await clearMarketChatHistory(); setMessages([]); }

  return (
    <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-background" className="px-4" keyboardAware={false}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}>
                  <View style={styles.header}>

          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]} accessibilityLabel="Go back"><Ionicons name="chevron-back" size={20} color={ink} /></Pressable>
          <View style={styles.headerCopy}><Text style={styles.eyebrow}>ANALYZERX ASSISTANT</Text><Text style={styles.title}>Ask anything</Text></View>
          <Pressable onPress={() => router.push("/general-chat")} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]} accessibilityLabel="Open General Chat"><Ionicons name="chatbubble-ellipses-outline" size={19} color={teal} /></Pressable>
          <Animated.View style={{ opacity: runtimeOpacity }}><Pressable onPress={() => void toggleRuntimeFromHeader()} style={({ pressed }) => [styles.runtimeStatus, { borderColor: runtimeStatus.color + "66", backgroundColor: runtimeStatus.color + "14" }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`Runtime status ${runtimeStatus.label}. Tap to switch mode`}><Ionicons name={runtimeStatus.icon} size={14} color={runtimeStatus.color} /><View><Text style={[styles.runtimeStatusLabel, { color: runtimeStatus.color }]}>{runtimeStatus.label}</Text><Text style={styles.runtimeStatusDetail} numberOfLines={1}>{runtimeStatus.detail}</Text></View></Pressable></Animated.View>
          <Pressable onPress={() => router.push("/local-ai")} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]} accessibilityLabel="Open Local AI model settings"><Ionicons name="hardware-chip-outline" size={19} color={amber} /></Pressable>
          <Pressable onPress={() => void clearHistory()} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]} accessibilityLabel="Clear local assistant history"><Ionicons name="trash-outline" size={19} color={muted} /></Pressable>
        </View>
        <MarketScopeChip compact />
        <View style={styles.disclaimer}><Ionicons name="sparkles-outline" size={17} color={amber} /><Text style={styles.disclaimerText}>Plain English market help for stocks, crypto, gold, forex, charts, screenshots, and app navigation. {activeLocalModel ? `Selected local model: ${activeLocalModel}. ` : "No local model is loaded. "}Current-news answers still require verified connected evidence; the assistant never invents live facts.</Text></View>
        <View style={styles.modeRow}><Text style={styles.modeLabel}>ENGINE</Text>{(["auto", "local", "connected"] as MarketChatRuntimeMode[]).map((mode) => <Pressable key={mode} onPress={() => void chooseRuntimeMode(mode)} style={({ pressed }) => [styles.modeButton, runtimeMode === mode && styles.modeButtonActive, pressed && styles.pressed]}><Text style={[styles.modeText, runtimeMode === mode && styles.modeTextActive]}>{mode === "auto" ? "Auto" : mode === "local" ? "Local model" : "Connected"}</Text></Pressable>)}</View>
        <View style={{ paddingBottom: 8 }}>
          <ModelSwitcher
            mode={runtimeMode}
            activeModelId={activeLocalModelId}
            onChange={(nextSelection) => {
              setRuntimeMode(nextSelection.mode);
              setActiveLocalModelId(nextSelection.activeModelId);
              setActiveLocalModel(nextSelection.activeModelId ? getLocalAIModel(nextSelection.activeModelId).displayName : null);
            }}
          />
        </View>
        {!hydrated ? <View style={styles.loader}><SkeletonList rows={3} /></View> : null}
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={messages.length ? styles.messageContent : styles.emptyContent}
          showsVerticalScrollIndicator={false}
          initialNumToRender={12}
          maxToRenderPerBatch={8}
          windowSize={7}
          updateCellsBatchingPeriod={50}
          removeClippedSubviews
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<View style={styles.emptyState}><View style={styles.brainIcon}><Ionicons name="sparkles" size={28} color={amber} /></View><Text style={styles.emptyTitle}>Your research co-pilot</Text><Text style={styles.emptyBody}>Ask about a stock or market, upload a chart or error screenshot, or hold the microphone to explain what you need.</Text><View style={styles.suggestionStack}>{starterQuestions.map((question) => <Pressable key={question} onPress={() => void sendMessage(question)} style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}><Text style={styles.suggestionText}>{question}</Text><Ionicons name="arrow-forward" size={15} color={teal} /></Pressable>)}</View></View>}
          renderItem={({ item }) => <View style={[styles.messageRow, item.role === "user" ? styles.userRow : styles.assistantRow]}><View style={[styles.bubble, item.role === "user" ? styles.userBubble : styles.assistantBubble]}><Text style={styles.roleLabel}>{item.role === "user" ? "YOU" : `ANALYZERX${item.symbol ? ` · ${item.symbol}` : ""}`}</Text>{item.attachmentLabel ? <View style={styles.attachmentBadge}><Ionicons name="attach" size={13} color={teal} /><Text style={styles.attachmentText}>{item.attachmentLabel}</Text></View> : null}<Text style={styles.messageText}>{item.content}</Text>{item.role === "assistant" && item.confidence ? <Text style={[styles.metaText, { color: item.confidence === "high" ? teal : item.confidence === "medium" ? amber : coral }]}>{item.confidence.toUpperCase()} CONFIDENCE{item.dataAsOf ? ` · DATA ${new Date(item.dataAsOf).toLocaleString()}` : ""}</Text> : null}{item.action ? <View style={styles.actionBadge}><Ionicons name="flash-outline" size={14} color={amber} /><Text style={styles.actionText}>Action executed: {item.action.type.replaceAll("_", " ")}</Text></View> : null}{item.sources?.length ? <View style={styles.sourceList}><Text style={styles.sourceHeading}>EVIDENCE USED</Text>{item.sources.slice(0, 4).map((source) => <View key={`${item.id}-${source.label}`} style={styles.sourceRow}><View style={styles.sourceDot} /><View style={styles.sourceCopy}><Text style={styles.sourceLabel}>{source.label}</Text><Text style={styles.sourceDetail} numberOfLines={2}>{source.detail}</Text></View></View>)}</View> : null}{item.limitations?.length ? <View style={styles.limitations}><Text style={styles.limitationHeading}>LIMITATIONS</Text><Text style={styles.limitationText}>{item.limitations.slice(0, 2).join(" · ")}</Text></View> : null}{item.retryQuestion ? <Pressable onPress={() => void sendMessage(item.retryQuestion, item.retryAttachments ?? [], item.id)} disabled={chat.isPending || ground.isPending || localStreaming} style={({ pressed }) => [styles.retryButton, pressed && styles.pressed, (chat.isPending || ground.isPending || localStreaming) && styles.disabled]} accessibilityRole="button" accessibilityLabel="Retry failed assistant request"><Ionicons name="refresh-outline" size={15} color={amber} /><Text style={styles.retryText}>Retry request</Text></Pressable> : null}{item.suggestedQuestions?.length ? <View style={styles.followUps}><Text style={styles.sourceHeading}>TRY NEXT</Text>{item.suggestedQuestions.slice(0, 3).map((question) => <Pressable key={`${item.id}-${question}`} onPress={() => void sendMessage(question)} style={({ pressed }) => [styles.followUp, pressed && styles.pressed]}><Text style={styles.followUpText}>{question}</Text></Pressable>)}</View> : null}</View></View>}
        />
        {chat.isPending || ground.isPending || localStreaming ? <View style={styles.typing}><Skeleton width={16} height={16} radius={8} /><Text style={styles.typingText}>{localStreaming ? `Streaming from ${activeLocalModel ?? "local model"} over grounded evidence…` : "Reading connected evidence and preparing a concise answer…"}</Text></View> : null}
        {attachments.length ? <View style={styles.attachmentTray}>{attachments.map((item) => <View key={item.id} style={styles.pendingAttachment}>{item.previewUri ? <Image source={{ uri: item.previewUri }} style={styles.preview} /> : <Ionicons name="mic-outline" size={18} color={teal} />}<Text style={styles.pendingText}>{item.label}</Text><Pressable onPress={() => setAttachments((current) => current.filter((entry) => entry.id !== item.id))} accessibilityLabel={`Remove ${item.label}`}><Ionicons name="close-circle" size={17} color={muted} /></Pressable></View>)}</View> : null}
        <View style={styles.composer}><Pressable onPress={() => void pickImage()} disabled={chat.isPending || ground.isPending || localStreaming || attachments.length >= 2} style={({ pressed }) => [styles.toolButton, pressed && styles.pressed, attachments.length >= 2 && styles.disabled]} accessibilityLabel="Attach screenshot or chart"><Ionicons name="image-outline" size={19} color={teal} /></Pressable><Pressable onPress={() => void toggleRecording()} disabled={chat.isPending || ground.isPending || localStreaming} style={({ pressed }) => [styles.toolButton, recorderState.isRecording && styles.recording, pressed && styles.pressed]} accessibilityLabel={recorderState.isRecording ? "Stop voice recording" : "Record voice question"}><Ionicons name={recorderState.isRecording ? "stop" : "mic-outline"} size={19} color={recorderState.isRecording ? "#FFFFFF" : teal} /></Pressable><TextInput value={draft} onChangeText={setDraft} placeholder={recorderState.isRecording ? "Recording voice question…" : "Ask about a company, market, chart, or app feature…"} placeholderTextColor="#6E7D92" style={styles.input} multiline maxLength={2_000} returnKeyType="send" onSubmitEditing={() => void sendMessage()} /><AnimatedPressable haptic="medium" onPress={() => void sendMessage()} disabled={(!draft.trim() && attachments.length === 0) || chat.isPending || recorderState.isRecording} style={[styles.sendButton, ((!draft.trim() && attachments.length === 0) || chat.isPending || ground.isPending || localStreaming || recorderState.isRecording) && styles.disabled]} accessibilityRole="button" accessibilityLabel="Send assistant question"><Ionicons name="arrow-up" size={19} color="#09111F" /></AnimatedPressable></View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 }, header: { flexDirection: "row", alignItems: "center", gap: 11, paddingTop: 8, paddingBottom: 14 }, iconButton: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: border, backgroundColor: panel, alignItems: "center", justifyContent: "center" }, runtimeStatus: { flexDirection: "row", alignItems: "center", gap: 5, maxWidth: 125, borderWidth: 1, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 5 }, runtimeStatusLabel: { fontSize: 8, fontWeight: "900", letterSpacing: 0.4 }, runtimeStatusDetail: { color: muted, fontSize: 7, marginTop: 1, maxWidth: 88 }, headerCopy: { flex: 1 }, eyebrow: { color: amber, fontSize: 10, fontWeight: "800", letterSpacing: 1.4 }, title: { color: ink, fontSize: 26, fontWeight: "900", marginTop: 2 }, disclaimer: { flexDirection: "row", gap: 9, alignItems: "flex-start", borderWidth: 1, borderColor: border, borderRadius: 14, backgroundColor: panel, padding: 12, marginBottom: 8 }, modeRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }, modeLabel: { color: muted, fontSize: 9, fontWeight: "900", letterSpacing: 1, marginRight: 2 }, modeButton: { borderWidth: 1, borderColor: border, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 7, backgroundColor: panel }, modeButtonActive: { borderColor: amber, backgroundColor: amber + "20" }, modeText: { color: muted, fontSize: 10, fontWeight: "800" }, modeTextActive: { color: amber }, disclaimerText: { flex: 1, color: muted, fontSize: 11, lineHeight: 16 }, loader: { marginVertical: 8 }, list: { flex: 1 }, messageContent: { paddingVertical: 8, gap: 10 }, emptyContent: { flexGrow: 1, justifyContent: "center", paddingVertical: 20 }, emptyState: { alignItems: "center", paddingHorizontal: 8 }, brainIcon: { width: 62, height: 62, borderRadius: 22, backgroundColor: amber + "18", borderWidth: 1, borderColor: amber + "55", alignItems: "center", justifyContent: "center", marginBottom: 16 }, emptyTitle: { color: ink, fontSize: 21, fontWeight: "900", textAlign: "center" }, emptyBody: { color: muted, fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 8, maxWidth: 330 }, suggestionStack: { width: "100%", gap: 8, marginTop: 20 }, suggestion: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: border, backgroundColor: panel, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }, suggestionText: { flex: 1, color: ink, fontSize: 12, lineHeight: 17 }, messageRow: { width: "100%", flexDirection: "row" }, userRow: { justifyContent: "flex-end" }, assistantRow: { justifyContent: "flex-start" }, bubble: { maxWidth: "94%", borderRadius: 16, padding: 13, borderWidth: 1 }, userBubble: { backgroundColor: "#20364C", borderColor: "#36546D", borderBottomRightRadius: 5 }, assistantBubble: { backgroundColor: panel, borderColor: border, borderBottomLeftRadius: 5 }, roleLabel: { color: muted, fontSize: 9, fontWeight: "800", letterSpacing: 1, marginBottom: 6 }, messageText: { color: ink, fontSize: 14, lineHeight: 21 }, metaText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.7, marginTop: 10 }, attachmentBadge: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 7 }, attachmentText: { color: teal, fontSize: 10, fontWeight: "800" }, actionBadge: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 9, backgroundColor: amber + "18", padding: 8, marginTop: 10 }, actionText: { color: amber, fontSize: 10, fontWeight: "800" }, sourceList: { borderTopWidth: 1, borderTopColor: border, marginTop: 11, paddingTop: 10, gap: 8 }, sourceHeading: { color: amber, fontSize: 9, fontWeight: "900", letterSpacing: 1 }, sourceRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" }, sourceDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: teal, marginTop: 5 }, sourceCopy: { flex: 1 }, sourceLabel: { color: ink, fontSize: 11, fontWeight: "800" }, sourceDetail: { color: muted, fontSize: 10, lineHeight: 14, marginTop: 2 }, limitations: { backgroundColor: coral + "12", borderWidth: 1, borderColor: coral + "38", borderRadius: 10, padding: 9, marginTop: 10 }, limitationHeading: { color: coral, fontSize: 9, fontWeight: "900", letterSpacing: 1 }, limitationText: { color: muted, fontSize: 10, lineHeight: 14, marginTop: 3 }, followUps: { gap: 6, marginTop: 11 }, followUp: { borderWidth: 1, borderColor: border, borderRadius: 9, paddingVertical: 8, paddingHorizontal: 9 }, followUpText: { color: teal, fontSize: 11, lineHeight: 15 }, retryButton: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, borderWidth: 1, borderColor: amber + "66", backgroundColor: amber + "14", borderRadius: 9, paddingVertical: 8, paddingHorizontal: 10, marginTop: 10 }, retryText: { color: amber, fontSize: 10, fontWeight: "900" }, typing: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 7 }, typingText: { color: muted, fontSize: 10, flex: 1 }, attachmentTray: { gap: 6, paddingVertical: 6 }, pendingAttachment: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: panel, borderWidth: 1, borderColor: border, borderRadius: 10, padding: 7 }, preview: { width: 28, height: 28, borderRadius: 6 }, pendingText: { color: ink, fontSize: 11, flex: 1 }, composer: { flexDirection: "row", alignItems: "flex-end", gap: 7, paddingVertical: 9, borderTopWidth: 1, borderTopColor: border }, toolButton: { width: 38, height: 44, borderRadius: 13, backgroundColor: panel, borderWidth: 1, borderColor: border, alignItems: "center", justifyContent: "center" }, recording: { backgroundColor: coral, borderColor: coral }, input: { flex: 1, minHeight: 44, maxHeight: 110, borderWidth: 1, borderColor: border, backgroundColor: panel, color: ink, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 11, fontSize: 13, lineHeight: 18 }, sendButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: amber, alignItems: "center", justifyContent: "center" }, pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] }, disabled: { opacity: 0.45 },
});
