import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
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

function SourceCard({ label, item }: { label: string; item: { status: "live" | "stale" | "unavailable"; sourceUrl: string; observations: { period: string; value: number | null; unit: string | null; dimensions: Record<string, string> }[]; summary: { latestPeriod: string | null; latestValue: number | null; units: string[] }; freshness: { status: "fresh" | "stale" | "unavailable"; ageDays: number | null }; latencyMs: number | null; error: string | null } }) {
  const color = item.status === "live" ? teal : item.status === "stale" ? amber : coral;
  const latest = item.summary.latestValue === null ? "Unavailable" : `${item.summary.latestValue} ${item.summary.units[0] ?? ""}`.trim();
  return <View style={styles.card}>
    <View style={styles.cardHeader}><View style={styles.cardCopy}><Text style={styles.cardTitle}>{label}</Text><Text style={styles.cardSource}>{item.sourceUrl}</Text></View><View style={[styles.statusPill, { borderColor: `${color}99`, backgroundColor: `${color}16` }]}><View style={[styles.dot, { backgroundColor: color }]} /><Text style={[styles.statusText, { color }]}>{item.status.toUpperCase()}</Text></View></View>
    <View style={styles.metricRow}><View><Text style={styles.metricLabel}>LATEST VALUE</Text><Text style={styles.metricValue}>{latest}</Text></View><View><Text style={styles.metricLabel}>PERIOD</Text><Text style={styles.metricValue}>{item.summary.latestPeriod ?? "Unavailable"}</Text></View><View><Text style={styles.metricLabel}>FRESHNESS</Text><Text style={styles.metricValue}>{item.freshness.status === "unavailable" ? "Unavailable" : item.freshness.ageDays === null ? item.freshness.status : `${item.freshness.ageDays}d old`}</Text></View><View><Text style={styles.metricLabel}>LATENCY</Text><Text style={styles.metricValue}>{item.latencyMs === null ? "—" : `${item.latencyMs}ms`}</Text></View></View>
    {item.error ? <Text style={styles.error}>{item.error}</Text> : <Text style={styles.note}>Values are parsed from the public response with original period, unit, and dimension metadata preserved.</Text>}
    <View style={styles.actions}><Pressable onPress={() => void Linking.openURL(item.sourceUrl)} style={({ pressed }) => [styles.sourceButton, pressed && styles.pressed]}><Ionicons name="open-outline" size={14} color={amber} /><Text style={styles.sourceButtonText}>Open source</Text></Pressable>{item.observations.slice(-3).reverse().map((observation) => <Text key={`${observation.period}-${observation.value}`} style={styles.observation}>{observation.period} · {observation.value ?? "Unavailable"} {observation.unit ?? ""}</Text>)}</View>
  </View>;
}

export default function MacroContextScreen() {
  const context = trpc.sources.publicMacro.useQuery(undefined, { staleTime: 5 * 60_000, retry: false });
  return <ScreenContainer containerClassName="bg-background" className="px-5" edges={["top", "left", "right", "bottom"]}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}><Pressable onPress={() => router.back()} style={styles.backButton} accessibilityLabel="Go back"><Ionicons name="chevron-back" size={20} color={ink} /></Pressable><View style={styles.headerCopy}><Text style={styles.eyebrow}>RESEARCH / MACRO CONTEXT</Text><Text style={styles.title}>Public macro data</Text></View></View>
      <View style={styles.hero}><Ionicons name="globe-outline" size={24} color={amber} /><View style={styles.heroCopy}><Text style={styles.heroTitle}>ECB and OECD context</Text><Text style={styles.heroBody}>Open public datasets add rates, inflation, and structural context to research. They do not replace licensed quotes, company filings, or intraday market data.</Text></View></View>
      {context.isLoading ? <ActivityIndicator color={teal} style={styles.loader} /> : context.error ? <View style={styles.errorBox}><Text style={styles.errorTitle}>Macro sources unavailable</Text><Text style={styles.error}>{String(context.error.message ?? context.error)}</Text></View> : context.data ? <><Text style={styles.checked}>Checked {new Date(context.data.checkedAt).toLocaleString()}</Text><SourceCard label="European Central Bank · USD/EUR reference series" item={context.data.ecb} /><SourceCard label="OECD · public financial-market context" item={context.data.oecd} /></> : null}
    </ScrollView>
  </ScreenContainer>;
}

const styles = StyleSheet.create({ content: { paddingBottom: 36 }, header: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 18, paddingBottom: 18 }, backButton: { width: 36, height: 36, borderRadius: 12, backgroundColor: panel, borderWidth: 1, borderColor: border, alignItems: "center", justifyContent: "center" }, headerCopy: { flex: 1 }, eyebrow: { color: teal, fontSize: 10, letterSpacing: 1.3, fontWeight: "900" }, title: { color: ink, fontSize: 26, lineHeight: 31, fontWeight: "900", marginTop: 4 }, hero: { flexDirection: "row", gap: 12, backgroundColor: "#101F2B", borderWidth: 1, borderColor: "#28505A", borderRadius: 17, padding: 15 }, heroCopy: { flex: 1 }, heroTitle: { color: ink, fontSize: 15, fontWeight: "900" }, heroBody: { color: muted, fontSize: 11, lineHeight: 17, marginTop: 5 }, loader: { marginVertical: 26 }, checked: { color: muted, fontSize: 10, marginTop: 14, marginBottom: 2 }, card: { backgroundColor: panel, borderRadius: 17, borderWidth: 1, borderColor: border, padding: 15, marginTop: 12 }, cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 8 }, cardCopy: { flex: 1 }, cardTitle: { color: ink, fontSize: 15, fontWeight: "900" }, cardSource: { color: muted, fontSize: 9, lineHeight: 13, marginTop: 5 }, statusPill: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 5 }, dot: { width: 7, height: 7, borderRadius: 4 }, statusText: { fontSize: 8, fontWeight: "900" }, metricRow: { flexDirection: "row", justifyContent: "space-between", gap: 10, marginTop: 15 }, metricLabel: { color: muted, fontSize: 8, fontWeight: "900", letterSpacing: 0.7 }, metricValue: { color: ink, fontSize: 12, fontWeight: "800", marginTop: 4 }, note: { color: muted, fontSize: 10, lineHeight: 15, marginTop: 11 }, error: { color: coral, fontSize: 10, lineHeight: 15, marginTop: 10 }, actions: { marginTop: 12, gap: 7 }, sourceButton: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 5 }, sourceButtonText: { color: amber, fontSize: 10, fontWeight: "900" }, observation: { color: muted, fontSize: 10 }, errorBox: { backgroundColor: `${coral}16`, borderWidth: 1, borderColor: `${coral}66`, borderRadius: 14, padding: 14, marginTop: 16 }, errorTitle: { color: coral, fontWeight: "900" }, pressed: { opacity: 0.75 } });
