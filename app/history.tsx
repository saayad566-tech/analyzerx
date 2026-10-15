import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { clearResearchHistory, loadResearchHistory, type ResearchHistoryEntry, type ResearchHistoryType } from "@/lib/research-analytics";
import { clearArchiveExportHistory, loadArchiveExportHistory, type ArchiveExportHistoryEntry } from "@/lib/local-preferences";
import type { IoniconName } from "@/lib/icon-names";

const amber = "#F4B860";
const teal = "#4FD1C5";
const muted = "#91A2B8";

type Filter = "all" | ResearchHistoryType;
const filters: { value: Filter; label: string; icon: IoniconName }[] = [
  { value: "all", label: "All", icon: "time-outline" },
  { value: "search", label: "Searches", icon: "search-outline" },
  { value: "news_open", label: "News", icon: "newspaper-outline" },
  { value: "recommendation", label: "Recommendations", icon: "sparkles-outline" },
  { value: "alert", label: "Alerts", icon: "notifications-outline" },
  { value: "analysis_open", label: "Analyses", icon: "analytics-outline" },
  { value: "report", label: "Reports", icon: "document-text-outline" },
  { value: "feature_discovery", label: "Discovery", icon: "compass-outline" },
];

const labels: Record<ResearchHistoryType, string> = {
  session: "Session",
  search: "Search",
  news_open: "News read",
  analysis_open: "Analysis",
  export: "Export",
  watchlist: "Watchlist",
  recommendation: "Recommendation",
  alert: "Alert",
  report: "Report",
  search_select: "Search selection",
  feature_discovery: "Feature discovery",
  onboarding_step: "Onboarding step",
  onboarding_dismiss: "Onboarding dismissed",
  news_feedback: "News relevance feedback",
};

export default function HistoryScreen() {
  const [filter, setFilter] = useState<Filter>("all");
  const [items, setItems] = useState<ResearchHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exportHistory, setExportHistory] = useState<ArchiveExportHistoryEntry[]>([]);

  const load = useCallback(async () => {
    const next = await loadResearchHistory({ type: filter === "all" ? undefined : filter, limit: 150 });
    setItems(next);
  }, [filter]);

  useEffect(() => { setLoading(true); void Promise.all([load(), loadArchiveExportHistory().then(setExportHistory)]).finally(() => setLoading(false)); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await Promise.all([load(), loadArchiveExportHistory().then(setExportHistory)]); setRefreshing(false); }, [load]);
  const subtitle = useMemo(() => filter === "all" ? "Your research trail stays on this device unless you are signed in." : `Showing ${filters.find((item) => item.value === filter)?.label.toLowerCase() ?? "activity"}.`, [filter]);

  const clear = () => Alert.alert("Clear local history?", "This removes the on-device activity timeline. Saved alerts and source records are not deleted.", [{ text: "Cancel", style: "cancel" }, { text: "Clear", style: "destructive", onPress: async () => { await clearResearchHistory(); setItems([]); } }]);
  const renderExport = (item: ArchiveExportHistoryEntry) => <View key={item.id} style={styles.exportRow}><View style={[styles.icon, { backgroundColor: item.status === "completed" ? "#132B35" : "#351D2A" }]}><Ionicons name={item.format === "pdf" ? "document-outline" : "document-text-outline"} size={17} color={item.status === "completed" ? teal : "#FB7185"} /></View><View style={styles.copy}><View style={styles.rowTop}><Text style={styles.type}>{item.format.toUpperCase()} archive</Text><Text style={styles.time}>{new Date(item.createdAt).toLocaleString()}</Text></View><Text style={styles.itemTitle} numberOfLines={1}>{item.fileName}</Text><Text style={styles.detail} numberOfLines={2}>{item.status === "completed" ? `${item.rowCount.toLocaleString()} verified item(s) · ${item.marketId}${item.symbol ? ` · ${item.symbol}` : ""}` : item.detail ?? "Export failed"}</Text></View></View>;
  const renderItem = ({ item }: { item: ResearchHistoryEntry }) => <Pressable style={({ pressed }) => [styles.row, pressed && styles.pressed]} onPress={() => item.route ? router.push(item.route as never) : undefined}><View style={styles.icon}><Ionicons name={filters.find((entry) => entry.value === item.type)?.icon ?? "time-outline"} size={17} color={teal} /></View><View style={styles.copy}><View style={styles.rowTop}><Text style={styles.type}>{labels[item.type]}</Text><Text style={styles.time}>{new Date(item.createdAt).toLocaleString()}</Text></View><Text style={styles.itemTitle} numberOfLines={2}>{item.title ?? item.symbol ?? "AnalyzerX activity"}</Text><Text style={styles.detail} numberOfLines={2}>{item.detail ?? item.source ?? item.route ?? "Local activity recorded"}{item.status ? ` · ${item.status}` : ""}</Text></View><Ionicons name="chevron-forward" size={16} color="#6E7D92" /></Pressable>;

  return <ScreenContainer className="px-5"><View style={styles.header}><Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel="Go back"><Ionicons name="arrow-back" size={20} color="#F4F7FB" /></Pressable><View style={styles.headerCopy}><Text style={styles.eyebrow}>WORKSPACE MEMORY</Text><Text style={styles.title}>History</Text></View><Pressable onPress={clear} style={styles.clear} accessibilityLabel="Clear local history"><Ionicons name="trash-outline" size={18} color={amber} /></Pressable></View><Text style={styles.subtitle}>{subtitle}</Text><View style={styles.exportSection}><View style={styles.exportHeader}><View><Text style={styles.exportTitle}>Archive download history</Text><Text style={styles.exportSubtitle}>Large-range CSV and PDF exports saved on this device</Text></View><Pressable onPress={async () => { await clearArchiveExportHistory(); setExportHistory([]); }} accessibilityLabel="Clear archive download history"><Ionicons name="trash-outline" size={16} color={amber} /></Pressable></View>{exportHistory.length ? exportHistory.map(renderExport) : <Text style={styles.detail}>No archive downloads yet.</Text>}</View><FlatList data={items} keyExtractor={item => item.id} renderItem={renderItem} contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={amber} />} ListHeaderComponent={<FlatList horizontal showsHorizontalScrollIndicator={false} data={filters} keyExtractor={(item) => item.value} contentContainerStyle={styles.filters} renderItem={({ item }) => <Pressable onPress={() => setFilter(item.value)} style={[styles.chip, filter === item.value && styles.chipActive]}><Ionicons name={item.icon} size={13} color={filter === item.value ? "#09111F" : muted} /><Text style={[styles.chipText, filter === item.value && styles.chipTextActive]}>{item.label}</Text></Pressable>} />} ListEmptyComponent={!loading ? <View style={styles.empty}><Ionicons name="time-outline" size={28} color={amber} /><Text style={styles.emptyTitle}>No history yet</Text><Text style={styles.emptyText}>Search a company, open a news item, run an analysis, create an alert, or export a report to build your timeline.</Text></View> : <View style={styles.empty}><Text style={styles.emptyText}>Loading activity…</Text></View>} /></ScreenContainer>;
}

  const styles = StyleSheet.create({ exportSection: { marginTop: 16, padding: 14, backgroundColor: "#111C2D", borderRadius: 16, borderWidth: 1, borderColor: "#26364D" }, exportHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }, exportTitle: { color: "#F4F7FB", fontSize: 14, fontWeight: "800" }, exportSubtitle: { color: muted, fontSize: 10, lineHeight: 14, marginTop: 3 }, exportRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 12, marginTop: 10, borderTopWidth: 1, borderTopColor: "#1E3047" }, header: { flexDirection: "row", alignItems: "center", paddingTop: 10, gap: 12 }, back: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#111C2D", alignItems: "center", justifyContent: "center" }, headerCopy: { flex: 1 }, clear: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#111C2D", alignItems: "center", justifyContent: "center" }, eyebrow: { color: amber, fontSize: 10, fontWeight: "800", letterSpacing: 1.4 }, title: { color: "#F4F7FB", fontSize: 30, fontWeight: "800", marginTop: 3 }, subtitle: { color: muted, fontSize: 11, lineHeight: 16, marginTop: 9 }, filters: { gap: 7, paddingVertical: 16 }, chip: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 9, borderWidth: 1, borderColor: "#26364D", backgroundColor: "#111C2D", paddingHorizontal: 10, paddingVertical: 8 }, chipActive: { backgroundColor: amber, borderColor: amber }, chipText: { color: muted, fontSize: 10, fontWeight: "800" }, chipTextActive: { color: "#09111F" }, list: { paddingBottom: 42 }, row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#1E3047" }, icon: { width: 36, height: 36, borderRadius: 11, backgroundColor: "#132B35", alignItems: "center", justifyContent: "center" }, copy: { flex: 1 }, rowTop: { flexDirection: "row", justifyContent: "space-between", gap: 8 }, type: { color: teal, fontSize: 10, fontWeight: "800" }, time: { color: "#6E7D92", fontSize: 9 }, itemTitle: { color: "#F4F7FB", fontSize: 13, fontWeight: "700", marginTop: 4 }, detail: { color: muted, fontSize: 10, lineHeight: 15, marginTop: 3 }, empty: { alignItems: "center", paddingHorizontal: 28, paddingVertical: 48, gap: 8 }, emptyTitle: { color: "#F4F7FB", fontSize: 16, fontWeight: "800" }, emptyText: { color: muted, textAlign: "center", fontSize: 11, lineHeight: 17 }, pressed: { opacity: 0.72 },
});
