import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "@/lib/navigation/router";
import Ionicons from "react-native-vector-icons/Ionicons";

import { ScreenContainer } from "@/components/screen-container";
import { MarketScopeChip } from "@/components/market-scope-chip";
import { useMarketContext } from "@/lib/market-context";
import { trpc } from "@/lib/trpc";
import { getResearchEvidenceNavigation } from "@/lib/research-evidence-navigation";
import { useAuth } from "@/hooks/use-auth";
import { OperationProgressCard } from "@/components/operation-progress-card";

const gold = "#F4B860";
const teal = "#4FD1C5";
const muted = "#91A2B8";

type ResearchAgentView = { agentType: string; status: string; confidence: string; claims: { text?: string }[]; evidenceIds?: string[] };
type ResearchResultView = { runId: string; symbol: string | null; confidence: string; status: string; answer: string; agents: ResearchAgentView[]; contradictions: { claimGroup: string; severity: string; explanation: string }[]; evidence: { id: string; kind: string; label: string; source: string; freshness: string }[]; limitations: string[] };

const agentLabels: Record<string, string> = {
  news: "News extraction",
  sentiment: "Sentiment",
  technicals: "Technicals",
  fundamentals: "Fundamentals",
  filings: "Filings",
  flows: "Institutional flows",
  macro: "Macro context",
  risk: "Risk and contradictions",
};

export default function ResearchDeskScreen() {
  const { marketId, market } = useMarketContext();
  const { isAuthenticated } = useAuth();
  const [symbol, setSymbol] = useState("RELIANCE");
  const [question, setQuestion] = useState("Run a deep research desk review");
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [activeRunIsPersisted, setActiveRunIsPersisted] = useState(false);
  const [result, setResult] = useState<ResearchResultView | null>(null);
  const run = trpc.researchDesk.runOwned.useMutation({ onSuccess: (data) => { setResult(data); setActiveRunId(data.runId); setActiveRunIsPersisted(true); } });
  const runGuest = trpc.researchDesk.run.useMutation({ onSuccess: (data) => { setResult(data); setActiveRunId(data.runId); setActiveRunIsPersisted(false); } });
  const runs = trpc.researchDesk.listOwned.useQuery({ limit: 8, marketId: "ALL" }, { enabled: isAuthenticated });
  const status = trpc.researchDesk.status.useQuery({ runId: activeRunId ?? "pending" }, { enabled: Boolean(activeRunId && activeRunIsPersisted), refetchInterval: activeRunId && activeRunIsPersisted ? 4000 : false });
  const retry = trpc.researchDesk.retry.useMutation({ onSuccess: (data) => { setResult(data); setActiveRunId(data.runId); } });
  const cancel = trpc.researchDesk.cancel.useMutation({ onSuccess: () => status.refetch() });
  const exportReport = trpc.researchDesk.exportOwned.useQuery({ runId: activeRunId ?? "pending", format: "md" }, { enabled: false });
  const coverage = useMemo(() => {
    if (!result) return { completed: 0, degraded: 0, unavailable: 0 };
    return result.agents.reduce((acc: { completed: number; degraded: number; unavailable: number }, agent: ResearchAgentView) => {
      if (agent.status === "completed") acc.completed += 1;
      else if (agent.status === "unavailable") acc.unavailable += 1;
      else acc.degraded += 1;
      return acc;
    }, { completed: 0, degraded: 0, unavailable: 0 });
  }, [result]);

  useEffect(() => {
    const stored = status.data?.run?.resultJson;
    if (stored) { try { setResult(JSON.parse(stored)); } catch { /* protected server payload; leave the last valid result visible */ } }
  }, [status.data?.run?.resultJson]);
  const startResearch = () => {
    const request = { message: question.trim() || "Run a deep research desk review", symbol: symbol.trim().toUpperCase() || undefined, marketId, depth: "deep" as const, runtimePreference: "auto" as const };
    if (isAuthenticated) run.mutate(request);
    else runGuest.mutate(request);
  };
  const exportMarkdown = async () => { if (!activeRunId) return; const response = await exportReport.refetch(); if (response.data?.content && typeof window !== "undefined") { const blob = new Blob([response.data.content], { type: "text/markdown" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = response.data.fileName; anchor.click(); URL.revokeObjectURL(url); } };

  return <ScreenContainer className="px-5" containerClassName="bg-background">
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View><Text style={styles.eyebrow}>MULTI-AGENT RESEARCH DESK</Text><Text style={styles.title}>Research Desk</Text><Text style={styles.subtitle}>Specialist lanes review the same evidence, then expose coverage and gaps before synthesis.</Text></View>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.close, pressed && styles.pressed]}><Ionicons name="close" size={19} color="#F4F7FB" /></Pressable>
      </View>
      <MarketScopeChip />
      <View style={styles.scopeCard}><Text style={styles.scopeLabel}>SELECTED MARKET</Text><Text style={styles.scopeTitle}>{market.country} · {market.currency}</Text><Text style={styles.scopeBody}>{market.exchanges.join(" · ")} · {market.coverage}</Text></View>
      <View style={styles.controls}>
        <Text style={styles.sectionTitle}>Research request</Text>
        <TextInputLike value={symbol} onChangeText={setSymbol} placeholder="Symbol, e.g. RELIANCE" />
        <TextInputLike value={question} onChangeText={setQuestion} placeholder="What should the desk investigate?" multiline />
        <Pressable onPress={startResearch} disabled={run.isPending || runGuest.isPending} style={({ pressed }) => [styles.primary, (run.isPending || runGuest.isPending) && styles.disabled, pressed && styles.pressed]}>{run.isPending || runGuest.isPending ? <ActivityIndicator color="#09111F" /> : <><Ionicons name="sparkles-outline" size={16} color="#09111F" /><Text style={styles.primaryText}>Run specialist desk</Text></>}</Pressable>
      </View>
      {run.isPending || runGuest.isPending ? <OperationProgressCard title="Research Desk is assembling evidence" description="Specialist lanes are checking market data, news, filings, flows, and research context. A partial result will identify any unavailable lane instead of inventing coverage." stages={[{ label: "Preparing request", state: "complete" }, { label: "Collecting source evidence", state: "active", detail: "Checking only the sources required for this request" }, { label: "Comparing specialist lanes", state: "pending" }, { label: "Writing the source-backed summary", state: "pending" }]} elapsedLabel="You can keep this screen open" /> : null}
      {run.error || runGuest.error ? <View style={styles.error}><Ionicons name="warning-outline" size={17} color="#FCA5A5" /><Text style={styles.errorText}>{(run.error ?? runGuest.error)?.message}</Text></View> : null}
      {!isAuthenticated ? <Text style={styles.guestNote}>Guest research is source-backed but is not saved to your account. Sign in to keep runs, retry them later, and export from history.</Text> : null}
      {runs.data?.length ? <View style={styles.history}><Text style={styles.sectionTitle}>Persisted runs</Text>{runs.data.slice(0, 5).map((item: { id: string; symbol: string | null; status: string; marketId: string; attemptCount: number }) => <Pressable key={item.id} onPress={() => { setActiveRunId(item.id); setActiveRunIsPersisted(true); }} style={({ pressed }) => [styles.historyRow, pressed && styles.pressed]}><View style={styles.agentCopy}><Text style={styles.agentName}>{item.symbol ?? "Market-wide"} · {item.status}</Text><Text style={styles.agentMeta}>{item.marketId} · attempt {item.attemptCount}</Text></View><Ionicons name="chevron-forward" size={15} color={muted} /></Pressable>)}</View> : null}
      {activeRunId && activeRunIsPersisted ? <View style={styles.actionRow}><Pressable onPress={() => retry.mutate({ runId: activeRunId })} disabled={retry.isPending} style={styles.secondary}><Ionicons name="refresh" size={14} color={gold} /><Text style={styles.secondaryText}>Retry</Text></Pressable><Pressable onPress={() => cancel.mutate({ runId: activeRunId })} disabled={cancel.isPending} style={styles.secondary}><Ionicons name="stop-circle-outline" size={14} color="#FCA5A5" /><Text style={[styles.secondaryText, { color: "#FCA5A5" }]}>Cancel</Text></Pressable><Pressable onPress={exportMarkdown} disabled={exportReport.isFetching} style={styles.secondary}><Ionicons name="download-outline" size={14} color={teal} /><Text style={[styles.secondaryText, { color: teal }]}>Markdown</Text></Pressable></View> : null}
      {status.data?.run?.status === "running" ? <View style={styles.error}><ActivityIndicator color={gold} /><Text style={styles.errorText}>Recovering and polling the persisted run…</Text></View> : null}
      {result ? <>
        <View style={styles.summary}><View style={styles.summaryHeader}><View><Text style={styles.eyebrow}>RUN {result.runId}</Text><Text style={styles.summaryTitle}>{result.symbol ?? "Market-wide"} · {result.confidence} confidence</Text></View><View style={styles.statusPill}><Text style={styles.statusText}>{result.status.toUpperCase()}</Text></View></View><Text style={styles.answer}>{result.answer}</Text><View style={styles.coverageRow}><Metric label="Completed" value={coverage.completed} color={teal} /><Metric label="Degraded" value={coverage.degraded} color={gold} /><Metric label="Unavailable" value={coverage.unavailable} color="#FCA5A5" /></View></View>
        <Text style={styles.sectionTitle}>Specialist lanes</Text>
        <View style={styles.card}>{result.agents.map((agent) => <View key={agent.agentType} style={styles.agentRow}><View style={[styles.agentIcon, agent.status === "completed" ? styles.agentGood : agent.status === "unavailable" ? styles.agentUnavailable : styles.agentDegraded]}><Ionicons name={agent.status === "completed" ? "checkmark" : agent.status === "unavailable" ? "remove" : "alert-outline"} size={15} color="#09111F" /></View><View style={styles.agentCopy}><Text style={styles.agentName}>{agentLabels[agent.agentType] ?? agent.agentType}</Text><Text style={styles.agentMeta}>{agent.status} · {agent.confidence} confidence · {agent.claims.length} claim(s)</Text>{agent.claims[0]?.text ? <Text style={styles.claim} numberOfLines={3}>{agent.claims[0].text}</Text> : null}</View></View>)}</View>
        {result.contradictions.length ? <><Text style={styles.sectionTitle}>Review caveats</Text><View style={styles.card}>{result.contradictions.map((item) => <View key={item.claimGroup} style={styles.caveat}><Ionicons name="git-compare-outline" size={15} color={gold} /><View style={styles.agentCopy}><Text style={styles.agentName}>{item.claimGroup} · {item.severity}</Text><Text style={styles.claim}>{item.explanation}</Text></View></View>)}</View></> : null}
        <Text style={styles.sectionTitle}>Evidence index</Text><View style={styles.card}>{result.evidence.length ? result.evidence.slice(0, 12).map((item) => { const navigation = getResearchEvidenceNavigation(item); const open = () => { if (navigation.type === "route") router.push(navigation.href); else if (navigation.type === "external") void Linking.openURL(navigation.url); }; return <Pressable key={item.id} onPress={navigation.type === "unavailable" ? undefined : open} disabled={navigation.type === "unavailable"} style={({ pressed }) => [styles.evidenceRow, pressed && styles.pressed, navigation.type === "unavailable" && styles.evidenceDisabled]}><View style={styles.evidenceBadge}><Text style={styles.evidenceBadgeText}>{item.kind.slice(0, 3).toUpperCase()}</Text></View><View style={styles.agentCopy}><Text style={styles.agentName}>{item.label}</Text><Text style={styles.agentMeta}>{item.source} · {item.freshness}</Text><Text style={styles.evidenceAction}>{navigation.label}</Text></View><Ionicons name={navigation.type === "external" ? "open-outline" : navigation.type === "route" ? "chevron-forward" : "remove-circle-outline"} size={15} color={navigation.type === "unavailable" ? muted : gold} /></Pressable>; }) : <Text style={styles.empty}>No evidence records were returned for this run.</Text>}</View>
        {result.limitations.length ? <Text style={styles.disclaimer}>{result.limitations.join(" ")}</Text> : null}
      </> : <View style={styles.emptyHero}><Ionicons name="layers-outline" size={27} color={gold} /><Text style={styles.emptyTitle}>Run a research desk review</Text><Text style={styles.emptyBody}>The first framework slice uses deterministic, source-backed specialist lanes. It does not claim coverage when filings, flows, quotes, or macro data are unavailable.</Text></View>}
    </ScrollView>
  </ScreenContainer>;
}

function TextInputLike({ value, onChangeText, placeholder, multiline = false }: { value: string; onChangeText: (value: string) => void; placeholder: string; multiline?: boolean }) {
  return <View style={[styles.input, multiline && styles.inputLarge]}><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#6E7D92" style={styles.inputText} multiline={multiline} /></View>;
}

function Metric({ label, value, color }: { label: string; value: number; color: string }) { return <View style={styles.metric}><Text style={[styles.metricValue, { color }]}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }


const styles = StyleSheet.create({
  content: { paddingBottom: 40 }, guestNote: { color: muted, fontSize: 10, lineHeight: 15, marginTop: 10 }, header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", paddingTop: 18, paddingBottom: 20 }, eyebrow: { color: gold, fontSize: 9, fontWeight: "800", letterSpacing: 1.3 }, title: { color: "#F4F7FB", fontSize: 29, fontWeight: "800", marginTop: 5 }, subtitle: { color: muted, fontSize: 12, lineHeight: 18, marginTop: 7, maxWidth: 280 }, close: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#111C2D", borderWidth: 1, borderColor: "#26364D" }, scopeCard: { padding: 14, borderRadius: 15, backgroundColor: "#171B32", borderWidth: 1, borderColor: "#3A3563", marginTop: 14 }, scopeLabel: { color: gold, fontSize: 9, fontWeight: "800", letterSpacing: 1.2 }, scopeTitle: { color: "#F4F7FB", fontSize: 17, fontWeight: "800", marginTop: 6 }, scopeBody: { color: muted, fontSize: 10, marginTop: 4 }, controls: { padding: 14, borderRadius: 15, backgroundColor: "#111C2D", borderWidth: 1, borderColor: "#26364D", marginTop: 14, gap: 9 }, sectionTitle: { color: "#F4F7FB", fontSize: 16, fontWeight: "800", marginTop: 23, marginBottom: 10 }, input: { minHeight: 44, justifyContent: "center", borderRadius: 10, borderWidth: 1, borderColor: "#2C4058", backgroundColor: "#0D1727", paddingHorizontal: 12 }, inputLarge: { minHeight: 74, paddingVertical: 10, justifyContent: "flex-start" }, inputText: { color: "#F4F7FB", fontSize: 12, lineHeight: 18 }, primary: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 10, backgroundColor: gold }, primaryText: { color: "#09111F", fontSize: 12, fontWeight: "800" }, disabled: { opacity: 0.7 }, pressed: { opacity: 0.72 }, error: { flexDirection: "row", gap: 8, padding: 12, borderRadius: 12, backgroundColor: "#3A1E2B", marginTop: 14 }, errorText: { flex: 1, color: "#FCA5A5", fontSize: 11, lineHeight: 16 }, summary: { padding: 15, borderRadius: 16, backgroundColor: "#111C2D", borderWidth: 1, borderColor: "#2B5260", marginTop: 20 }, summaryHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }, summaryTitle: { color: "#F4F7FB", fontSize: 17, fontWeight: "800", marginTop: 5 }, statusPill: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8, backgroundColor: "#123B3D" }, statusText: { color: teal, fontSize: 9, fontWeight: "900" }, answer: { color: "#D9E4F0", fontSize: 12, lineHeight: 19, marginTop: 13 }, coverageRow: { flexDirection: "row", gap: 18, marginTop: 15 }, metric: { alignItems: "flex-start" }, metricValue: { fontSize: 22, fontWeight: "900" }, metricLabel: { color: muted, fontSize: 9, marginTop: 2 }, card: { padding: 12, borderRadius: 15, backgroundColor: "#111C2D", borderWidth: 1, borderColor: "#26364D" }, agentRow: { flexDirection: "row", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#22324A" }, agentIcon: { width: 27, height: 27, borderRadius: 9, alignItems: "center", justifyContent: "center" }, agentGood: { backgroundColor: teal }, agentUnavailable: { backgroundColor: "#667085" }, agentDegraded: { backgroundColor: gold }, agentCopy: { flex: 1 }, agentName: { color: "#F4F7FB", fontSize: 11, fontWeight: "800" }, agentMeta: { color: muted, fontSize: 9, marginTop: 3 }, claim: { color: "#A5B7C7", fontSize: 10, lineHeight: 15, marginTop: 5 }, caveat: { flexDirection: "row", gap: 8, paddingVertical: 9 }, evidenceRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "#22324A" }, evidenceBadge: { width: 34, height: 26, borderRadius: 7, alignItems: "center", justifyContent: "center", backgroundColor: "#2B2549" }, evidenceBadgeText: { color: gold, fontSize: 8, fontWeight: "900" }, emptyHero: { alignItems: "center", padding: 26, borderRadius: 16, backgroundColor: "#111C2D", borderWidth: 1, borderColor: "#26364D", marginTop: 20 }, emptyTitle: { color: "#F4F7FB", fontSize: 17, fontWeight: "800", marginTop: 10 }, emptyBody: { color: muted, fontSize: 11, lineHeight: 17, textAlign: "center", marginTop: 7 },   empty: { color: muted, fontSize: 11, lineHeight: 16 }, history: { marginTop: 7 }, historyRow: { flexDirection: "row", alignItems: "center", paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "#22324A" }, actionRow: { flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" }, secondary: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: "#2C4058", borderRadius: 9, paddingHorizontal: 11, paddingVertical: 9, backgroundColor: "#0D1727" }, secondaryText: { color: gold, fontSize: 10, fontWeight: "800" }, evidenceAction: { color: gold, fontSize: 9, fontWeight: "800", marginTop: 5 }, evidenceDisabled: { opacity: 0.6 }, disclaimer: { color: "#6E7D92", fontSize: 9, lineHeight: 14, marginTop: 18 },
});
