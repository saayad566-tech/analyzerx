import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "@/lib/navigation/router";
import Ionicons from "react-native-vector-icons/Ionicons";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
import { clearGeneralChatHistory, loadGeneralChatHistory, loadMarketChatRuntimeMode, saveGeneralChatHistory, type LocalChatMessage, type MarketChatRuntimeMode } from "@/lib/local-preferences";
import { buildLocalGeneralPrompt, resolveMarketChatEngine, sanitizeLocalOutput, trimLocalHistory } from "@/lib/market-chat-runtime";
import { getActiveLocalAIModelId, getLocalAIModel, getLocalAIRuntime, type LocalAIModelId } from "@/lib/local-ai";
import { fireAndForget } from "@/lib/fire-and-forget";

const colors = { background: "#07101F", panel: "#111C2D", border: "#26364D", text: "#F4F7FB", muted: "#91A2B8", amber: "#F4B860", teal: "#4FD1C5", coral: "#FB7185" };
type GeneralItem = LocalChatMessage & { id: string; error?: boolean };

export default function GeneralChatScreen() {
  const [messages, setMessages] = useState<GeneralItem[]>([]);
  const [draft, setDraft] = useState("");
  const [runtimeMode, setRuntimeMode] = useState<MarketChatRuntimeMode>("auto");
  const [activeModelId, setActiveModelId] = useState<LocalAIModelId | null>(null);
  const [activeModel, setActiveModel] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const general = trpc.chat.general.useMutation();
  const runtime = getLocalAIRuntime();
  const engine = resolveMarketChatEngine({ mode: runtimeMode, activeModelId, nativeRuntimeAvailable: runtime.isAvailable, hasAttachments: false });

  const refreshModel = useCallback(() => {
    fireAndForget(getActiveLocalAIModelId().then((id) => { setActiveModelId(id); setActiveModel(id ? getLocalAIModel(id).displayName : null); }), "getActiveLocalAIModelId");
  }, []);

  useEffect(() => {
    fireAndForget(loadGeneralChatHistory().then((saved) => { setMessages(saved.map((item, index) => ({ ...item, id: `saved-${index}` }))); setHydrated(true); }), "loadGeneralChatHistory");
    fireAndForget(loadMarketChatRuntimeMode().then(setRuntimeMode), "loadMarketChatRuntimeMode");
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
        const prompt = buildLocalGeneralPrompt(question, activeModel ?? "the selected local model");
        let answer = "";
        await runtime.stream(prompt.prompt, (token) => { answer += token; });
        const cleanAnswer = sanitizeLocalOutput(answer);
        if (!cleanAnswer) throw new Error("The local model returned an empty response.");
        const assistant: GeneralItem = { id: `assistant-${Date.now()}`, role: "assistant", content: cleanAnswer };
        const completed = [...next, assistant]; setMessages(completed); await saveGeneralChatHistory(completed);
      } else {
        const response = await general.mutateAsync({ message: question, history: trimLocalHistory(prior) });
        const assistant: GeneralItem = { id: `assistant-${Date.now()}`, role: "assistant", content: response.answer };
        const completed = [...next, assistant]; setMessages(completed); await saveGeneralChatHistory(completed);
      }
    } catch (error) {
      const failure: GeneralItem = { id: `error-${Date.now()}`, role: "assistant", content: error instanceof Error ? error.message : "The assistant could not complete that request.", error: true };
      const completed = [...next, failure]; setMessages(completed); await saveGeneralChatHistory(completed);
    } finally { setLoading(false); }
  }

  async function clearHistory() { await clearGeneralChatHistory(); setMessages([]); }

  return (
    <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-background" className="px-4">
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.iconButton} accessibilityLabel="Go back"><Ionicons name="chevron-back" size={22} color={colors.text} /></Pressable>
          <View style={styles.headerCopy}><Text style={styles.eyebrow}>ANALYZERX GENERAL CHAT</Text><Text style={styles.title}>Ask anything</Text></View>
          <Pressable onPress={() => void clearHistory()} style={styles.iconButton} accessibilityLabel="Clear general chat"><Ionicons name="trash-outline" size={20} color={colors.muted} /></Pressable>
        </View>
        <View style={styles.banner}><Text style={styles.bannerTitle}>General-purpose assistant</Text><Text style={styles.bannerText}>Coding, writing, explanations, planning, and everyday questions. Live market facts still require verified market evidence.</Text><Text style={[styles.engine, { color: engine === "local" ? colors.teal : colors.amber }]}>{engine === "local" ? `Local · ${activeModel ?? "model ready"}` : "Connected · hosted AI"}</Text></View>
        <FlatList data={messages} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} renderItem={({ item }) => <View style={[styles.bubble, item.role === "user" ? styles.userBubble : styles.assistantBubble]}><Text style={styles.role}>{item.role === "user" ? "YOU" : "ANALYZERX"}</Text><Text style={[styles.message, item.error && { color: colors.coral }]}>{item.content}</Text></View>} ListEmptyComponent={<Text style={styles.empty}>Start with any question. AnalyzerX will keep this conversation separate from your market research history.</Text>} />
        {loading && <View style={styles.loading}><ActivityIndicator color={colors.amber} /><Text style={styles.loadingText}>Thinking with {engine === "local" ? "Local AI" : "Connected AI"}…</Text></View>}
        <View style={styles.composer}><TextInput value={draft} onChangeText={setDraft} placeholder="Ask about coding, writing, ideas, or anything else…" placeholderTextColor={colors.muted} style={styles.input} multiline maxLength={2_000} editable={!loading} onSubmitEditing={() => void sendMessage()} returnKeyType="send" /><Pressable onPress={() => void sendMessage()} disabled={!draft.trim() || loading} style={[styles.send, (!draft.trim() || loading) && styles.disabled]}><Ionicons name="arrow-up" size={22} color={colors.background} /></Pressable></View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 }, header: { flexDirection: "row", alignItems: "center", paddingVertical: 12, gap: 12 }, headerCopy: { flex: 1 }, eyebrow: { color: colors.amber, fontSize: 11, fontWeight: "800", letterSpacing: 1.4 }, title: { color: colors.text, fontSize: 25, fontWeight: "800" }, iconButton: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }, banner: { backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 16, gap: 7 }, bannerTitle: { color: colors.text, fontSize: 16, fontWeight: "800" }, bannerText: { color: colors.muted, lineHeight: 20 }, engine: { fontSize: 12, fontWeight: "800" }, list: { paddingVertical: 16, gap: 10, flexGrow: 1 }, bubble: { borderRadius: 18, padding: 14, maxWidth: "92%", gap: 6 }, userBubble: { alignSelf: "flex-end", backgroundColor: "#203A55" }, assistantBubble: { alignSelf: "flex-start", backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border }, role: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1 }, message: { color: colors.text, fontSize: 16, lineHeight: 23 }, empty: { color: colors.muted, textAlign: "center", marginTop: 40, lineHeight: 22 }, loading: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 10 }, loadingText: { color: colors.muted }, composer: { flexDirection: "row", alignItems: "flex-end", gap: 10, paddingVertical: 10 }, input: { flex: 1, minHeight: 52, maxHeight: 130, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, color: colors.text, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 }, send: { width: 52, height: 52, borderRadius: 16, backgroundColor: colors.amber, alignItems: "center", justifyContent: "center" }, disabled: { opacity: 0.4 } });
