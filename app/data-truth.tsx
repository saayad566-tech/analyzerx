import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMemo, useState } from "react";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";

const amber = "#F4B860";
const teal = "#4FD1C5";
const coral = "#FB7185";
const ink = "#F4F7FB";
const muted = "#91A2B8";
const panel = "#111C2D";
const border = "#26364D";

function statusColor(status: string) {
  if (status === "ready") return teal;
  if (status === "blocked" || status === "unavailable") return coral;
  return amber;
}

function evidenceCopy(category: string) {
  if (category === "reported") return "Directly reported by the cited source.";
  if (category === "derived") return "Calculated from source-backed observations.";
  if (category === "estimated") return "Estimated because one or more reported inputs are incomplete.";
  return "Inferred interpretation; verify the original evidence before acting.";
}

export default function DataTruthScreen() {
  const capabilities = trpc.capabilities.list.useQuery(undefined, { staleTime: 60_000, retry: false });
  const sources = trpc.sources.list.useQuery(undefined, { staleTime: 60_000, retry: false });
  const rows = useMemo(() => capabilities.data ?? [], [capabilities.data]);
  const ready = rows.filter((item) => item.status === "ready").length;
  const partial = rows.filter((item) => item.status === "partial" || item.status === "page-snapshot").length;
  const unavailable = rows.filter((item) => item.status === "blocked" || item.status === "unavailable").length;
  const queryError = capabilities.error || sources.error;
  const [marketFilter, setMarketFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [freshnessFilter, setFreshnessFilter] = useState("ALL");
  const [confidenceFilter, setConfidenceFilter] = useState("ALL");
  const [sortMode, setSortMode] = useState<"name" | "freshness-fast" | "freshness-slow" | "status">("name");
  const filteredRows = useMemo(() => {
    const statusRank: Record<string, number> = { blocked: 0, unavailable: 1, "page-snapshot": 2, partial: 3, ready: 4 };
    const freshnessRank: Record<string, number> = { intraday: 0, "event-driven": 1, daily: 2, fortnightly: 3, monthly: 4, quarterly: 5, annual: 6, unknown: 7 };
    return rows.filter((item) => {
      const marketMatch = marketFilter === "ALL" || (marketFilter === "INDIA" && item.organization === "NSE") || (marketFilter === "GLOBAL" && item.organization !== "NSE");
      const statusMatch = statusFilter === "ALL" || item.status === statusFilter;
      const freshnessMatch = freshnessFilter === "ALL" || item.cadence === freshnessFilter;
      const policy = item.confidencePolicy.toLowerCase();
      const confidenceMatch = confidenceFilter === "ALL" || policy.includes(confidenceFilter.toLowerCase());
      return marketMatch && statusMatch && freshnessMatch && confidenceMatch;
    }).sort((a, b) => {
      if (sortMode === "status") return (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9) || a.datasetKey.localeCompare(b.datasetKey);
      if (sortMode === "freshness-fast") return (freshnessRank[a.cadence] ?? 9) - (freshnessRank[b.cadence] ?? 9) || a.datasetKey.localeCompare(b.datasetKey);
      if (sortMode === "freshness-slow") return (freshnessRank[b.cadence] ?? 9) - (freshnessRank[a.cadence] ?? 9) || a.datasetKey.localeCompare(b.datasetKey);
      return a.datasetKey.localeCompare(b.datasetKey);
    });
  }, [confidenceFilter, freshnessFilter, marketFilter, rows, sortMode, statusFilter]);
  const filterOptions = (values: string[], active: string, onChange: (value: string) => void) => <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterContent}>{values.map((value) => <Pressable key={value} onPress={() => onChange(value)} style={[styles.filterChip, active === value && styles.filterChipActive]}><Text style={[styles.filterChipText, active === value && styles.filterChipTextActive]}>{value.replace(/-/g, " ").toUpperCase()}</Text></Pressable>)}</ScrollView>;

  return (
    <ScreenContainer containerClassName="bg-background" className="px-5" edges={["top", "left", "right", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={20} color={ink} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>ANALYZERX / DATA TRUTH</Text>
            <Text style={styles.title}>Coverage & evidence</Text>
          </View>
          <View style={styles.livePill}><View style={styles.liveDot} /><Text style={styles.liveText}>SOURCE LED</Text></View>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroIcon}><Ionicons name="shield-checkmark-outline" size={24} color={amber} /></View>
          <View style={styles.heroCopy}><Text style={styles.heroTitle}>Know what the platform knows</Text><Text style={styles.heroBody}>AnalyzerX separates verified, partial, derived, estimated, and unavailable information. No unsupported live claim is promoted to a fact.</Text></View>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}><Text style={styles.summaryLabel}>READY</Text><Text style={[styles.summaryValue, { color: teal }]}>{ready}</Text><Text style={styles.summaryHint}>source-backed routes</Text></View>
          <View style={styles.summaryCard}><Text style={styles.summaryLabel}>PARTIAL</Text><Text style={[styles.summaryValue, { color: amber }]}>{partial}</Text><Text style={styles.summaryHint}>periodic or bounded</Text></View>
          <View style={styles.summaryCard}><Text style={styles.summaryLabel}>UNAVAILABLE</Text><Text style={[styles.summaryValue, { color: coral }]}>{unavailable}</Text><Text style={styles.summaryHint}>not claimed as live</Text></View>
        </View>

        {capabilities.isLoading || sources.isLoading ? <ActivityIndicator color={teal} style={styles.loader} /> : null}
        {queryError ? <View style={styles.errorBox}><Text style={styles.errorTitle}>Truth center temporarily unavailable</Text><Text style={styles.errorBody}>The registry could not be loaded. Existing research screens keep their own bounded fallback states; retry when the backend is reachable.</Text></View> : null}

        <Text style={styles.sectionTitle}>Dataset coverage</Text>
        <Text style={styles.sectionHint}>Filter by country scope, status, freshness SLA, or confidence policy. {filteredRows.length} of {rows.length} datasets shown.</Text>
        <Text style={styles.filterLabel}>COUNTRY SCOPE</Text>
        {filterOptions(["ALL", "INDIA", "GLOBAL"], marketFilter, setMarketFilter)}
        <Text style={styles.filterLabel}>STATUS</Text>
        {filterOptions(["ALL", "ready", "partial", "page-snapshot", "blocked", "unavailable"], statusFilter, setStatusFilter)}
        <Text style={styles.filterLabel}>FRESHNESS SLA</Text>
        {filterOptions(["ALL", "intraday", "event-driven", "daily", "fortnightly", "monthly", "quarterly", "annual", "unknown"], freshnessFilter, setFreshnessFilter)}
        <Text style={styles.filterLabel}>CONFIDENCE POLICY</Text>
        {filterOptions(["ALL", "reported", "derived", "estimated", "inferred"], confidenceFilter, setConfidenceFilter)}
        <Text style={styles.filterLabel}>SORT</Text>
        {filterOptions(["name", "freshness-fast", "freshness-slow", "status"], sortMode, (value) => setSortMode(value as "name" | "freshness-fast" | "freshness-slow" | "status"))}
        {filteredRows.map((item) => {
          const color = statusColor(item.status);
          return <View key={item.datasetKey} style={styles.capabilityCard}>
            <View style={styles.cardHeader}><View style={styles.cardCopy}><Text style={styles.cardTitle}>{item.datasetKey.replace(/-/g, " ")}</Text><Text style={styles.cardMeta}>{item.sourceName} · {item.organization} · {item.entityScope}</Text></View><View style={[styles.statusPill, { borderColor: `${color}66`, backgroundColor: `${color}16` }]}><View style={[styles.statusDot, { backgroundColor: color }]} /><Text style={[styles.statusText, { color }]}>{item.status.toUpperCase()}</Text></View></View>
            <View style={styles.detailGrid}><View style={styles.detailBox}><Text style={styles.detailLabel}>CADENCE</Text><Text style={styles.detailValue}>{item.cadence}</Text></View><View style={styles.detailBox}><Text style={styles.detailLabel}>ACCESS</Text><Text style={styles.detailValue}>{item.accessMode}</Text></View><View style={styles.detailBox}><Text style={styles.detailLabel}>FRESHNESS</Text><Text style={styles.detailValue}>{item.freshnessSla}</Text></View></View>
            <Text style={styles.confidence}><Text style={styles.detailLabel}>CONFIDENCE POLICY  </Text>{item.confidencePolicy}</Text>
            <Text style={styles.limitation}><Text style={styles.detailLabel}>BOUNDARY  </Text>{item.limitations}</Text>
            <View style={styles.consumerRow}><Text style={styles.consumerLabel}>USED BY</Text><Text style={styles.consumerText}>{item.intelligenceConsumers.join(" · ")}</Text></View>
          </View>;
        })}

        <Text style={styles.sectionTitle}>Evidence language</Text>
        <View style={styles.legendCard}>
          {["reported", "derived", "estimated", "inferred"].map((kind) => <View key={kind} style={styles.legendRow}><View style={[styles.legendDot, { backgroundColor: kind === "reported" ? teal : kind === "inferred" ? coral : amber }]} /><View style={styles.legendCopy}><Text style={styles.legendTitle}>{kind.toUpperCase()}</Text><Text style={styles.legendText}>{evidenceCopy(kind)}</Text></View></View>)}
        </View>

        <Text style={styles.sectionTitle}>Registered sources</Text>
        <Text style={styles.sectionHint}>Source metadata is descriptive. A configured source can still be in cooldown, unauthorized, delayed, or schema-blocked state.</Text>
        {(sources.data ?? []).slice(0, 30).map((source) => <View key={source.key} style={styles.sourceRow}><View style={styles.sourceIcon}><Ionicons name="link-outline" size={15} color={amber} /></View><View style={styles.sourceCopy}><Text style={styles.sourceName}>{source.name}</Text><Text style={styles.sourceMeta}>{source.organization} · {source.cadence} · {source.configured ? "configured" : "not configured"}</Text></View></View>)}

        <View style={styles.footer}><Ionicons name="information-circle-outline" size={16} color={muted} /><Text style={styles.footerText}>AnalyzerX is a research-intelligence platform. Verify decision-relevant facts against the original filing, exchange report, or authorized provider response.</Text></View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 36 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 18, paddingBottom: 18 },
  backButton: { width: 36, height: 36, borderRadius: 12, backgroundColor: panel, borderWidth: 1, borderColor: border, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1 },
  eyebrow: { color: amber, fontSize: 10, letterSpacing: 1.3, fontWeight: "800" },
  title: { color: ink, fontSize: 25, lineHeight: 31, fontWeight: "800", marginTop: 3 },
  livePill: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: `${teal}66`, backgroundColor: `${teal}16`, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: teal },
  liveText: { color: teal, fontSize: 8, fontWeight: "900" },
  hero: { flexDirection: "row", gap: 12, backgroundColor: "#101F2B", borderWidth: 1, borderColor: "#28505A", borderRadius: 17, padding: 15, marginBottom: 14 },
  heroIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: "#17333B", alignItems: "center", justifyContent: "center" },
  heroCopy: { flex: 1 },
  heroTitle: { color: ink, fontSize: 15, fontWeight: "800" },
  heroBody: { color: muted, fontSize: 11, lineHeight: 17, marginTop: 5 },
  summaryRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
  summaryCard: { flex: 1, backgroundColor: panel, borderWidth: 1, borderColor: border, borderRadius: 14, padding: 11 },
  summaryLabel: { color: muted, fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  summaryValue: { fontSize: 23, fontWeight: "900", marginTop: 5 },
  summaryHint: { color: muted, fontSize: 9, marginTop: 2 },
  loader: { marginVertical: 24 },
  errorBox: { backgroundColor: `${coral}16`, borderWidth: 1, borderColor: `${coral}66`, borderRadius: 14, padding: 14, marginBottom: 16 },
  errorTitle: { color: coral, fontWeight: "800" },
  errorBody: { color: muted, fontSize: 11, lineHeight: 17, marginTop: 5 },
  sectionTitle: { color: ink, fontSize: 17, fontWeight: "800", marginTop: 14 },
  filterLabel: { color: amber, fontSize: 8, fontWeight: "900", letterSpacing: 0.9, marginTop: 10, marginBottom: 5 },
  filterScroll: { marginBottom: 1 },
  filterContent: { gap: 6, paddingBottom: 2 },
  filterChip: { borderWidth: 1, borderColor: border, backgroundColor: panel, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7 },
  filterChipActive: { backgroundColor: amber, borderColor: amber },
  filterChipText: { color: muted, fontSize: 8, fontWeight: "900" },
  filterChipTextActive: { color: "#09111F" },
  sectionHint: { color: muted, fontSize: 11, lineHeight: 17, marginTop: 5, marginBottom: 10 },
  capabilityCard: { backgroundColor: panel, borderWidth: 1, borderColor: border, borderRadius: 16, padding: 14, marginBottom: 10 },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  cardCopy: { flex: 1 },
  cardTitle: { color: ink, fontSize: 14, fontWeight: "800", textTransform: "capitalize" },
  cardMeta: { color: muted, fontSize: 10, marginTop: 4 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 8, fontWeight: "900" },
  detailGrid: { flexDirection: "row", gap: 7, marginTop: 12 },
  detailBox: { flex: 1, backgroundColor: "#17253A", borderRadius: 9, padding: 8 },
  detailLabel: { color: amber, fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
  detailValue: { color: ink, fontSize: 10, marginTop: 4, textTransform: "capitalize" },
  confidence: { color: muted, fontSize: 10, lineHeight: 16, marginTop: 11 },
  limitation: { color: muted, fontSize: 10, lineHeight: 16, marginTop: 7 },
  consumerRow: { borderTopWidth: 1, borderTopColor: border, marginTop: 10, paddingTop: 9 },
  consumerLabel: { color: teal, fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  consumerText: { color: muted, fontSize: 9, lineHeight: 14, marginTop: 4 },
  legendCard: { backgroundColor: panel, borderWidth: 1, borderColor: border, borderRadius: 16, padding: 13, marginBottom: 16 },
  legendRow: { flexDirection: "row", gap: 9, paddingVertical: 8 },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  legendCopy: { flex: 1 },
  legendTitle: { color: ink, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  legendText: { color: muted, fontSize: 10, lineHeight: 15, marginTop: 2 },
  sourceRow: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: border },
  sourceIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: "#17253A", alignItems: "center", justifyContent: "center" },
  sourceCopy: { flex: 1 },
  sourceName: { color: ink, fontSize: 11, fontWeight: "800" },
  sourceMeta: { color: muted, fontSize: 9, marginTop: 3 },
  footer: { flexDirection: "row", gap: 8, alignItems: "flex-start", marginTop: 22, paddingHorizontal: 4 },
  footerText: { color: muted, fontSize: 10, lineHeight: 15, flex: 1 },
});
