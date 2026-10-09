import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/hooks/use-auth";
import { router } from "expo-router";
import { trpc } from "@/lib/trpc";
import { Ionicons } from "@expo/vector-icons";

import { ScreenContainer } from "@/components/screen-container";
import { loadRecentSearches, loadSavedScreens, loadWatchlist, type SavedScreen } from "@/lib/local-preferences";
import { MarketScopeChip } from "@/components/market-scope-chip";

const amber = "#F4B860";
const teal = "#4FD1C5";

function Action({ icon, label, route }: { icon: keyof typeof Ionicons.glyphMap; label: string; route: "/screener" | "/alerts" | "/flows" | "/sectors" | "/storylines" | "/research-desk" }) {
  return <Pressable onPress={() => router.push(route)} style={({ pressed }) => [styles.action, pressed && styles.pressed]}><Ionicons name={icon} size={16} color={teal} /><Text style={styles.actionText}>{label}</Text><Ionicons name="chevron-forward" size={15} color="#6E7D92" /></Pressable>;
}

export default function ResearchWorkspaceScreen() {
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [savedScreens, setSavedScreens] = useState<SavedScreen[]>([]);
  const { isAuthenticated } = useAuth();
  const ownedWatchlist = trpc.account.watchlist.useQuery(undefined, { enabled: isAuthenticated, retry: false, staleTime: 60_000 });
  const ownedScreens = trpc.account.savedScreens.useQuery(undefined, { enabled: isAuthenticated, retry: false, staleTime: 60_000 });
  const serverWatchlist = (ownedWatchlist.data ?? []).map((item) => item.symbol);
  const effectiveWatchlist = isAuthenticated && ownedWatchlist.data ? serverWatchlist : watchlist;
  const effectiveSavedScreens = isAuthenticated && ownedScreens.data ? ownedScreens.data : savedScreens;
  const latestSymbol = recentSearches[0] ?? effectiveWatchlist[0] ?? null;
  const financialAnalysis = trpc.market.fundamentals.useQuery({ symbol: latestSymbol ?? "RELIANCE" }, { enabled: Boolean(latestSymbol), retry: false, staleTime: 60_000 });
  const watchlistEvidence = trpc.market.watchlistEvidence.useQuery({ symbols: effectiveWatchlist.length ? effectiveWatchlist : ["RELIANCE"] }, { enabled: effectiveWatchlist.length > 0, retry: false, staleTime: 60_000 });
  const watchlistEventCounts = useMemo(() => new Map((watchlistEvidence.data ?? []).map((item) => [item.symbol, item.events.length])), [watchlistEvidence.data]);
  const openFinancialAnalysis = (symbol: string) => router.push({ pathname: "/screener", params: { symbol } });

  useEffect(() => {
    void Promise.all([loadRecentSearches(), loadWatchlist(), loadSavedScreens()]).then(([recent, savedWatchlist, screens]) => {
      setRecentSearches(recent);
      setWatchlist(savedWatchlist);
      setSavedScreens(screens);
    });
  }, []);

  return <ScreenContainer className="px-5" containerClassName="bg-background">
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <View style={styles.header}><View><Text style={styles.eyebrow}>AI RESEARCH COCKPIT</Text><Text style={styles.title}>Research Workspace</Text><Text style={styles.subtitle}>A durable home for the investigations you return to.</Text></View><Pressable onPress={() => router.back()} style={styles.close}><Ionicons name="close" size={19} color="#F4F7FB" /></Pressable></View><MarketScopeChip />
      <View style={styles.hero}><View style={styles.heroIcon}><Ionicons name="sparkles-outline" size={21} color={amber} /></View><Text style={styles.heroTitle}>Turn signals into a repeatable process</Text><Text style={styles.heroBody}>Jump from a saved symbol to fundamentals, flows, sectors, storylines, news, and alerts without losing your place. All local items remain explicit and editable.</Text><Pressable onPress={() => router.push("/screener")} style={styles.primary}><Text style={styles.primaryText}>Start new investigation</Text><Ionicons name="arrow-forward" size={16} color="#09111F" /></Pressable></View>
      {latestSymbol ? <View style={styles.analysisCard}><View style={styles.analysisHeader}><View><Text style={styles.eyebrow}>LATEST FINANCIAL ANALYSIS</Text><Text style={styles.analysisTitle}>{financialAnalysis.data?.companyName ?? latestSymbol}</Text><Text style={styles.analysisMeta}>{financialAnalysis.data?.resolvedSymbol ?? latestSymbol} · {financialAnalysis.isLoading ? "Building source-backed analysis…" : financialAnalysis.data ? `${financialAnalysis.data.coverage.score}/100 coverage` : "Analysis unavailable"}</Text></View><View style={styles.analysisScore}><Text style={styles.analysisScoreValue}>{financialAnalysis.data?.score ?? "—"}</Text><Text style={styles.analysisScoreLabel}>/ 100</Text></View></View>{financialAnalysis.isLoading ? <Text style={styles.analysisBody}>Retrieving financial health, profitability, growth, cash flow, valuation, moat, risks, and evidence.</Text> : financialAnalysis.data ? <><Text style={styles.verdict}>{financialAnalysis.data.verdict}</Text><View style={styles.pillarGrid}>{financialAnalysis.data.categories.map((category) => <View key={category.key} style={styles.pillar}><Text style={styles.pillarLabel}>{category.label}</Text><Text style={styles.pillarScore}>{category.score}/{category.max}</Text></View>)}</View><Text style={styles.analysisBody}>Cash flow: {financialAnalysis.data.metrics.operatingCashFlow.basis} · Fair value: {financialAnalysis.data.fairValue.basis} · {financialAnalysis.data.coverage.verified} verified, {financialAnalysis.data.coverage.estimated} estimated, {financialAnalysis.data.coverage.unavailable} unavailable sections.</Text><Pressable onPress={() => openFinancialAnalysis(latestSymbol)} style={styles.primary}><Text style={styles.primaryText}>Open full financial analysis</Text><Ionicons name="arrow-forward" size={16} color="#09111F" /></Pressable></> : <Text style={styles.analysisBody}>The financial-analysis service did not return a verified result. Cached workspace items remain available; retry from the full analysis route.</Text>}</View> : null}
      <Text style={styles.sectionTitle}>Fast intelligence routes</Text>
      <View style={styles.stack}><Action icon="search-outline" label="Global stock research" route="/screener" /><Action icon="notifications-outline" label="Catalyst and risk alerts" route="/alerts" /><Action icon="swap-horizontal-outline" label="Institutional market flows" route="/flows" /><Action icon="grid-outline" label="Sector opportunity radar" route="/sectors" /><Action icon="git-network-outline" label="Storylines and relationships" route="/storylines" /><Action icon="sparkles-outline" label="Multi-agent Research Desk" route="/research-desk" /></View>
      <View style={styles.sectionRow}><Text style={styles.sectionTitle}>Recent symbols</Text><Text style={styles.count}>{recentSearches.length}</Text></View>
      <View style={styles.card}>{recentSearches.length ? recentSearches.map((symbol) => <Pressable key={symbol} onPress={() => openFinancialAnalysis(symbol)} style={({ pressed }) => [styles.symbolRow, pressed && styles.pressed]}><View style={styles.symbolBadge}><Text style={styles.symbolBadgeText}>{symbol.slice(0, 3)}</Text></View><Text style={styles.symbolText}>{symbol}</Text><Text style={styles.symbolHint}>Re-open analysis</Text><Ionicons name="chevron-forward" size={15} color="#6E7D92" /></Pressable>) : <Text style={styles.empty}>No recent searches yet. Start with a symbol to build your research memory.</Text>}</View>
      <View style={styles.sectionRow}><Text style={styles.sectionTitle}>Watchlist triage</Text><Text style={styles.count}>{effectiveWatchlist.length}</Text></View>
      <View style={styles.card}>{effectiveWatchlist.length ? <View style={styles.chips}>{effectiveWatchlist.map((symbol) => <Pressable key={symbol} onPress={() => openFinancialAnalysis(symbol)} style={styles.watchChip}><Text style={styles.watchText}>{symbol}</Text><Text style={styles.watchEvidence}>{watchlistEventCounts.get(symbol) ?? 0} events</Text></Pressable>)}</View> : <Text style={styles.empty}>Your watchlist is empty. Add symbols from a research result when conviction is still forming.</Text>}</View>
      <View style={styles.sectionRow}><Text style={styles.sectionTitle}>Saved screens</Text><Text style={styles.count}>{effectiveSavedScreens.length}</Text></View>
      <View style={styles.card}>{effectiveSavedScreens.length ? effectiveSavedScreens.map((screen) => <View key={screen.name} style={styles.savedRow}><View><Text style={styles.savedName}>{screen.name}</Text><Text style={styles.savedMeta}>{"filters" in screen ? screen.filters.join(" · ") : (() => { try { const filters = JSON.parse(screen.filtersJson) as unknown; return Array.isArray(filters) ? filters.join(" · ") : "Saved filter set"; } catch { return "Saved filter set"; } })()}</Text></View><Text style={styles.savedDate}>{new Date(screen.createdAt).toLocaleDateString()}</Text></View>) : <Text style={styles.empty}>No saved screens yet. Save a screen after refining the multibagger filters.</Text>}</View>
      <Text style={styles.disclaimer}>{isAuthenticated ? "Authenticated workspace: watchlists and saved screens are owned by this account, with local guest items kept separate." : "Guest workspace data is stored locally in this device session. Sign in to sync watchlists, saved screens, alerts, and research ownership."} Research outputs remain source-aware; unavailable data is not treated as a signal.</Text>
    </ScrollView>
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 40 },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", paddingTop: 18, paddingBottom: 20 },
  eyebrow: { color: amber, fontSize: 9, fontWeight: "800", letterSpacing: 1.4 },
  title: { color: "#F4F7FB", fontSize: 29, fontWeight: "800", marginTop: 5 },
  subtitle: { color: "#91A2B8", fontSize: 12, lineHeight: 18, marginTop: 7, maxWidth: 280 },
  close: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#111C2D", borderWidth: 1, borderColor: "#26364D" },
  hero: { padding: 16, borderRadius: 18, backgroundColor: "#171B32", borderWidth: 1, borderColor: "#3A3563", marginBottom: 24 },
  heroIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#2B2549", marginBottom: 12 },
  heroTitle: { color: "#F4F7FB", fontSize: 17, fontWeight: "800" },
  heroBody: { color: "#A5B7C7", fontSize: 11, lineHeight: 17, marginTop: 7 },
  analysisCard: { padding: 16, borderRadius: 18, backgroundColor: "#111C2D", borderWidth: 1, borderColor: "#2B5260", marginBottom: 24 },
  analysisHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  analysisTitle: { color: "#F4F7FB", fontSize: 17, fontWeight: "800", marginTop: 5, maxWidth: 230 },
  analysisMeta: { color: "#91A2B8", fontSize: 10, marginTop: 5 },
  analysisScore: { alignItems: "center", justifyContent: "center", minWidth: 58, minHeight: 58, borderRadius: 16, backgroundColor: "#123B3D", borderWidth: 1, borderColor: "#2B6D6A" },
  analysisScoreValue: { color: teal, fontSize: 24, fontWeight: "900" },
  analysisScoreLabel: { color: "#91A2B8", fontSize: 9, fontWeight: "800" },
  verdict: { color: amber, fontSize: 13, lineHeight: 18, fontWeight: "800", marginTop: 14 },
  pillarGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  pillar: { width: "48%", padding: 10, borderRadius: 11, backgroundColor: "#17283A", borderWidth: 1, borderColor: "#263F54" },
  pillarLabel: { color: "#A5B7C7", fontSize: 9, lineHeight: 13, fontWeight: "700" },
  pillarScore: { color: "#F4F7FB", fontSize: 15, fontWeight: "900", marginTop: 4 },
  analysisBody: { color: "#A5B7C7", fontSize: 10, lineHeight: 16, marginTop: 12 },
  primary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 15, paddingVertical: 11, borderRadius: 11, backgroundColor: amber },
  primaryText: { color: "#09111F", fontSize: 12, fontWeight: "800" },
  sectionTitle: { color: "#F4F7FB", fontSize: 16, fontWeight: "800" },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 24, marginBottom: 10 },
  count: { color: amber, fontSize: 12, fontWeight: "800" },
  stack: { gap: 8, marginTop: 11 },
  action: { flexDirection: "row", alignItems: "center", gap: 10, padding: 13, borderRadius: 13, backgroundColor: "#111C2D", borderWidth: 1, borderColor: "#26364D" },
  actionText: { flex: 1, color: "#D9E4F0", fontSize: 12, fontWeight: "700" },
  card: { padding: 12, borderRadius: 15, backgroundColor: "#111C2D", borderWidth: 1, borderColor: "#26364D" },
  symbolRow: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "#22324A" },
  symbolBadge: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: "#123B3D" },
  symbolBadgeText: { color: teal, fontSize: 9, fontWeight: "800" },
  symbolText: { color: "#F4F7FB", fontSize: 12, fontWeight: "800" },
  symbolHint: { flex: 1, color: "#6E7D92", fontSize: 9 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  watchChip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 9, backgroundColor: "#2B2549", borderWidth: 1, borderColor: "#51478A" },
  watchText: { color: "#E5DFFF", fontSize: 11, fontWeight: "800" },
  watchEvidence: { color: "#A5B7C7", fontSize: 8, marginTop: 3 },
  savedRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#22324A" },
  savedName: { color: "#F4F7FB", fontSize: 12, fontWeight: "800" },
  savedMeta: { color: "#6E7D92", fontSize: 9, marginTop: 3 },
  savedDate: { color: "#91A2B8", fontSize: 9 },
  empty: { color: "#91A2B8", fontSize: 11, lineHeight: 16 },
  disclaimer: { color: "#6E7D92", fontSize: 9, lineHeight: 14, marginTop: 20, marginBottom: 10 },
  pressed: { opacity: 0.7 },
});
