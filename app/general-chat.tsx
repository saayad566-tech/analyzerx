import { useCallback, useEffect, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";
import { keyboardAvoidingBehavior } from "@/lib/keyboard-avoidance";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "@/components/screen-container";
import { Skeleton } from "@/components/skeleton";
import { AnimatedPressable } from "@/components/motion";
import { ModelSwitcher } from "@/components/model-switcher";
import { trpc } from "@/lib/trpc";
import { useMarketContext } from "@/lib/market-context";
import { clearGeneralChatHistory, loadGeneralChatHistory, loadMarketChatRuntimeMode, saveGeneralChatHistory, type LocalChatMessage, type MarketChatRuntimeMode } from "@/lib/local-preferences";
import { buildBoundedLocalPrompt, formatAssistantFailure, isConnectedEngineConfigured, isCurrentDataQuestion, resolveMarketChatEngine, trimLocalHistory } from "@/lib/market-chat-runtime";
import { createStreamingSanitizer, sanitizeAssistantOutput } from "@/lib/assistant-output";
import { LocalAIModelError, localAISession } from "@/lib/local-ai-session";
import { getActiveLocalAIModelId, getLocalAIModel, getLocalAIRuntime, type LocalAIModelId } from "@/lib/local-ai";

const colors = { background: "#07101F", panel: "#111C2D", border: "#26364D", text: "#F4F7FB", muted: "#91A2B8", amber: "#F4B860", teal: "#4FD1C5", coral: "#FB7185" };
type GeneralItem = LocalChatMessage & { id: string; error?: boolean };

export default function GeneralChatScreen() {
  // This composer used `behavior={Platform.OS === "ios" ? "padding" : undefined}`,
  // the pre-edge-to-edge assumption: with edge-to-edge the Android window no longer
  // resizes, so KAV received no behaviour and the composer sat UNDER the keyboard.
  // The real keyboard height is read from the Keyboard API and applied as padding,
  // exactly as the market chat composer already does.
  const keyboardInset = useKeyboardInset();
  const [messages, setMessages] = useState<GeneralItem[]>([]);
  const [draft, setDraft] = useState("");
  const [runtimeMode, setRuntimeMode] = useState<MarketChatRuntimeMode>("auto");
  const [activeModelId, setActiveModelId] = useState<LocalAIModelId | null>(null);
  const [activeModel, setActiveModel] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const { marketId } = useMarketContext();
  const general = trpc.chat.general.useMutation();
  const ground = trpc.chat.ground.useMutation();
  const runtime = getLocalAIRuntime();
  const engine = resolveMarketChatEngine({ mode: runtimeMode, activeModelId, nativeRuntimeAvailable: runtime.isAvailable, hasAttachments: false });

  const refreshModel = useCallback(() => {
    void getActiveLocalAIModelId().then((id) => { setActiveModelId(id); setActiveModel(id ? getLocalAIModel(id).displayName : null); });
  }, []);

  useEffect(() => {
    void loadGeneralChatHistory().then((saved) => { setMessages(saved.map((item, index) => ({ ...item, id: `saved-${index}` }))); setHydrated(true); });
    void loadMarketChatRuntimeMode().then(setRuntimeMode);
  }, []);
  useFocusEffect(useCallback(() => { refreshModel(); return undefined; }, [refreshModel]));

  async function sendMessage() {
    const question = draft.trim();
    if (!question || loading || !hydrated) return;
    const user: GeneralItem = { id: `user-${Date.now()}`, role: "user", content: question };
    const prior = messages;
    const next = [...prior, user];
    setMessages(next); setDraft(""); setLoading(true);
    try {
      const useLocal = engine === "local";
      if (useLocal) {
        const modelId = activeModelId;
        if (!modelId) throw new LocalAIModelError("No on-device model is selected.", "Choose a model in the switcher above, or use Connected mode.");
        // Load (or confirm) the model before inference. The UI must never claim
        // a model is ready until the native runtime has actually loaded it.
        await localAISession.ensureModelLoaded(modelId);
        // One assistant that answers anything: live-data questions are grounded
        // with verified context, everything else is answered generally.
        const needsLiveData = isCurrentDataQuestion(question);
        const grounded = needsLiveData ? await ground.mutateAsync({ message: question, marketId }) : null;
        const prompt = buildBoundedLocalPrompt(
          question,
          grounded?.context ?? "",
          activeModel ?? "the selected local model",
          Boolean(grounded),
          activeModelId ? getLocalAIModel(activeModelId).contextTokens : null,
        );
        const guard = createStreamingSanitizer({ systemInstruction: prompt.system, maxChars: 8000 });
        const assistantId = `assistant-${Date.now()}`;
        let answer = "";
        localAISession.markGenerating(true);
        setMessages((current) => [...current, { id: assistantId, role: "assistant", content: "" }]);
        // The system instruction is attached to the conversation ONCE and only
        // the user turn is sent. Sending the whole prompt as the user message
        // made the model echo its instructions and broke the native template
        // ("new rendered template does not start with the previous").
        await runtime.stream(
          prompt.turn,
          (token) => {
            const safe = guard.push(token);
            if (!safe) return;
            answer += safe;
            setMessages((current) => current.map((item) => (item.id === assistantId ? { ...item, content: answer } : item)));
          },
          { systemInstruction: prompt.system },
        );
        const tail = guard.flush();
        if (tail) answer += tail;
        const cleanAnswer = sanitizeAssistantOutput(answer, { systemInstruction: prompt.system });
        if (!cleanAnswer) throw new Error("The local model returned an empty response.");
        const completed: GeneralItem[] = [...next, { id: assistantId, role: "assistant", content: cleanAnswer }];
        setMessages(completed); await saveGeneralChatHistory(completed);
      } else {
        const response = await general.mutateAsync({ message: question, history: trimLocalHistory(prior) });
        const assistant: GeneralItem = { id: `assistant-${Date.now()}`, role: "assistant", content: sanitizeAssistantOutput(response.answer) };
        const completed = [...next, assistant]; setMessages(completed); await saveGeneralChatHistory(completed);
      }
    } catch (error) {
      // Never surface a raw native error or stack trace in the chat. A model
      // lifecycle failure carries its own safe, specific message and next step.
      const content = error instanceof LocalAIModelError ? `${error.userMessage} ${error.nextAction}` : formatAssistantFailure(error);
      const failure: GeneralItem = { id: `error-${Date.now()}`, role: "assistant", content, error: true };
      const completed = [...next, failure]; setMessages(completed); await saveGeneralChatHistory(completed);
    } finally { localAISession.markGenerating(false); setLoading(false); }
  }

  async function clearHistory() { await clearGeneralChatHistory(); setMessages([]); }

  return (
    <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-background" className="px-4" keyboardAware={false}>
      <KeyboardAvoidingView style={[styles.flex, keyboardInset > 0 && { paddingBottom: keyboardInset }]} behavior={keyboardAvoidingBehavior(Platform.OS)} keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.iconButton} accessibilityLabel="Go back"><Ionicons name="chevron-back" size={22} color={colors.text} /></Pressable>
          <View style={styles.headerCopy}><Text style={styles.eyebrow}>ANALYZERX GENERAL CHAT</Text><Text style={styles.title}>Ask anything</Text></View>
          <Pressable onPress={() => void clearHistory()} style={styles.iconButton} accessibilityLabel="Clear general chat"><Ionicons name="trash-outline" size={20} color={colors.muted} /></Pressable>
        </View>
        <View style={styles.switcherRow}>
          <ModelSwitcher
            mode={runtimeMode}
            activeModelId={activeModelId}
            onChange={(nextSelection) => {
              setRuntimeMode(nextSelection.mode);
              setActiveModelId(nextSelection.activeModelId);
              setActiveModel(nextSelection.activeModelId ? getLocalAIModel(nextSelection.activeModelId).displayName : null);
            }}
          />
        </View>
        <View style={styles.banner}><Text style={styles.bannerTitle}>Ask anything</Text><Text style={styles.bannerText}>Stocks, news, coding, writing, explanations, planning, and everyday questions — like a general assistant, with live market facts grounded in verified evidence. Switch models from the chip above.</Text><Text style={[styles.engine, { color: engine === "local" ? colors.teal : isConnectedEngineConfigured() ? colors.amber : colors.coral }]}>{engine === "local" ? `Local · ${activeModel ?? "model ready"}` : isConnectedEngineConfigured() ? "Connected · hosted AI" : "Connected · no provider configured"}</Text></View>
        <FlatList data={messages} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} initialNumToRender={12} maxToRenderPerBatch={8} windowSize={7} updateCellsBatchingPeriod={50} removeClippedSubviews keyboardShouldPersistTaps="handled" renderItem={({ item }) => <View style={[styles.bubble, item.role === "user" ? styles.userBubble : styles.assistantBubble]}><Text style={styles.role}>{item.role === "user" ? "YOU" : "ANALYZERX"}</Text><Text style={[styles.message, item.error && { color: colors.coral }]}>{item.content}</Text></View>} ListEmptyComponent={<Text style={styles.empty}>Start with any question. AnalyzerX will keep this conversation separate from your market research history.</Text>} />
        {loading && <View style={styles.loading}><Skeleton width={20} height={20} radius={10} /><Text style={styles.loadingText}>Thinking with {engine === "local" ? "Local AI" : "Connected AI"}…</Text></View>}
        <View style={styles.composer}><TextInput value={draft} onChangeText={setDraft} placeholder="Ask about coding, writing, ideas, or anything else…" placeholderTextColor={colors.muted} style={styles.input} multiline maxLength={2_000} editable={!loading} onSubmitEditing={() => void sendMessage()} returnKeyType="send" /><AnimatedPressable haptic="medium" onPress={() => void sendMessage()} disabled={!draft.trim() || loading} style={[styles.send, (!draft.trim() || loading) && styles.disabled]}><Ionicons name="arrow-up" size={22} color={colors.background} /></AnimatedPressable></View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 }, switcherRow: { flexDirection: "row", paddingBottom: 10 }, header: { flexDirection: "row", alignItems: "center", paddingVertical: 12, gap: 12 }, headerCopy: { flex: 1 }, eyebrow: { color: colors.amber, fontSize: 11, fontWeight: "800", letterSpacing: 1.4 }, title: { color: colors.text, fontSize: 25, fontWeight: "800" }, iconButton: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }, banner: { backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 16, gap: 7 }, bannerTitle: { color: colors.text, fontSize: 16, fontWeight: "800" }, bannerText: { color: colors.muted, lineHeight: 20 }, engine: { fontSize: 12, fontWeight: "800" }, list: { paddingVertical: 16, gap: 10, flexGrow: 1 }, bubble: { borderRadius: 18, padding: 14, maxWidth: "92%", gap: 6 }, userBubble: { alignSelf: "flex-end", backgroundColor: "#203A55" }, assistantBubble: { alignSelf: "flex-start", backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border }, role: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1 }, message: { color: colors.text, fontSize: 16, lineHeight: 23 }, empty: { color: colors.muted, textAlign: "center", marginTop: 40, lineHeight: 22 }, loading: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 10 }, loadingText: { color: colors.muted }, composer: { flexDirection: "row", alignItems: "flex-end", gap: 10, paddingVertical: 10 }, input: { flex: 1, minHeight: 52, maxHeight: 130, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, color: colors.text, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 }, send: { width: 52, height: 52, borderRadius: 16, backgroundColor: colors.amber, alignItems: "center", justifyContent: "center" }, disabled: { opacity: 0.4 } });
