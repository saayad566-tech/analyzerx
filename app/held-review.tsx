import { useMemo } from "react";
import { Alert, FlatList, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import Ionicons from "react-native-vector-icons/Ionicons";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { useMarketContext } from "@/lib/market-context";
import { trpc } from "@/lib/trpc";

const amber = "#F4B860";
const teal = "#4FD1C5";
const coral = "#FB7185";
const muted = "#91A2B8";

function readableReason(reason: string) {
  return reason.replaceAll("_", " ").replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export default function HeldReviewScreen() {
  const colors = useColors();
  const { market } = useMarketContext();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const held = trpc.news.held.useQuery({ marketId: market.id, status: "held", limit: 100 }, { enabled: isAuthenticated, retry: false, refetchOnWindowFocus: true });
  const review = trpc.news.reviewHeld.useMutation({ onSuccess: () => { void held.refetch(); } });
  const articles = useMemo(() => held.data ?? [], [held.data]);

  const decide = (id: string, decision: "approved" | "dismissed", headline: string) => {
    const action = decision === "approved" ? "Approve and publish" : "Dismiss permanently";
    Alert.alert(action, decision === "approved" ? "This article will be added to the verified feed and marked as manually approved." : "This removes the article from the review queue without publishing it.", [{ text: "Cancel", style: "cancel" }, { text: action, style: decision === "dismissed" ? "destructive" : "default", onPress: () => review.mutate({ marketId: market.id, id, decision, note: decision === "approved" ? "Approved by user after evidence review." : "Dismissed by user after evidence review." }) }]);
  };

  if (authLoading) return <ScreenContainer className="px-5"><Text style={styles.loading}>Checking account access…</Text></ScreenContainer>;
  if (!isAuthenticated) return <ScreenContainer className="px-5"><View style={styles.header}><Pressable onPress={() => router.back()} style={styles.iconButton} accessibilityLabel="Go back"><Ionicons name="arrow-back" size={20} color={colors.foreground} /></Pressable><View style={styles.headerCopy}><Text style={styles.eyebrow}>NEWS GOVERNANCE</Text><Text style={[styles.title, { color: colors.foreground }]}>Held for Review</Text></View></View><View style={styles.empty}><Ionicons name="lock-closed-outline" size={32} color={amber} /><Text style={styles.emptyTitle}>Sign in to review held articles</Text><Text style={styles.emptyText}>Blocked articles are retained with their evidence and separated by market. Sign in to inspect or approve them.</Text></View></ScreenContainer>;

  return <ScreenContainer className="px-5"><View style={styles.header}><Pressable onPress={() => router.back()} style={styles.iconButton} accessibilityLabel="Go back"><Ionicons name="arrow-back" size={20} color={colors.foreground} /></Pressable><View style={styles.headerCopy}><Text style={styles.eyebrow}>NEWS GOVERNANCE · {market.country.toUpperCase()}</Text><Text style={[styles.title, { color: colors.foreground }]}>Held for Review</Text></View><View style={styles.count}><Text style={styles.countText}>{articles.length}</Text></View></View><Text style={styles.subtitle}>These stories were not published automatically. Review the evidence before deciding whether to publish.</Text><View style={styles.policy}><Ionicons name="shield-checkmark-outline" size={17} color={teal} /><Text style={styles.policyText}>Automatic publication remains fail-closed. Manual approval is labeled in the feed and does not retrain the gate immediately.</Text></View><FlatList data={articles} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} refreshing={held.isFetching} onRefresh={() => void held.refetch()} ListEmptyComponent={<View style={styles.empty}><Ionicons name="checkmark-done-outline" size={32} color={teal} /><Text style={styles.emptyTitle}>No held articles</Text><Text style={styles.emptyText}>Newly blocked stories with ambiguous names, missing issuer evidence, or wrong-market context will appear here.</Text></View>} renderItem={({ item }) => <View style={styles.card}><View style={styles.cardTop}><View style={styles.reasonPill}><Ionicons name="alert-circle-outline" size={13} color={amber} /><Text style={styles.reason}>{readableReason(item.holdReason)}</Text></View><Text style={styles.score}>{item.score}/100</Text></View><Text style={styles.headline}>{item.headline}</Text><Text style={styles.meta}>{item.symbol ?? "Market context"} · {item.source} · {new Date(item.publishedAt).toLocaleString()}</Text><Text style={styles.sectionLabel}>Why it was held</Text>{stringList(item.reasons).map((reason, index) => <Text key={`${item.id}-reason-${index}`} style={styles.reasonLine}>• {reason}</Text>)}<View style={styles.evidenceRow}><Text style={styles.evidence}>Classification: {item.classification}</Text><Text style={styles.evidence}>Confidence: {item.confidence}</Text></View><Pressable onPress={() => Linking.openURL(item.url)} style={({ pressed }) => [styles.sourceLink, pressed && styles.pressed]} accessibilityRole="link"><Text style={styles.sourceLinkText}>Open original source</Text><Ionicons name="open-outline" size={14} color={teal} /></Pressable><View style={styles.actions}><Pressable onPress={() => decide(item.id, "dismissed", item.headline)} disabled={review.isPending} style={({ pressed }) => [styles.dismissButton, pressed && styles.pressed]} accessibilityRole="button"><Ionicons name="close-circle-outline" size={16} color={coral} /><Text style={styles.dismissText}>Dismiss</Text></Pressable><Pressable onPress={() => decide(item.id, "approved", item.headline)} disabled={review.isPending} style={({ pressed }) => [styles.approveButton, pressed && styles.pressed]} accessibilityRole="button"><Ionicons name="checkmark-circle-outline" size={16} color="#09111F" /><Text style={styles.approveText}>Approve & publish</Text></Pressable></View></View>} /></ScreenContainer>;
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 10 },
  iconButton: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#111C2D", alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1 },
  eyebrow: { color: amber, fontSize: 9, letterSpacing: 1.2, fontWeight: "800" },
  title: { fontSize: 28, fontWeight: "900", marginTop: 3 },
  count: { minWidth: 34, height: 30, paddingHorizontal: 8, borderRadius: 10, backgroundColor: amber, alignItems: "center", justifyContent: "center" },
  countText: { color: "#09111F", fontWeight: "900", fontSize: 13 },
  subtitle: { color: muted, fontSize: 11, lineHeight: 17, marginTop: 12 },
  policy: { flexDirection: "row", gap: 8, alignItems: "flex-start", padding: 12, borderRadius: 13, borderWidth: 1, borderColor: teal + "55", backgroundColor: teal + "12", marginTop: 14 },
  policyText: { flex: 1, color: "#BDEDE8", fontSize: 10, lineHeight: 15 },
  list: { paddingTop: 14, paddingBottom: 42, gap: 12 },
  card: { padding: 15, borderRadius: 17, borderWidth: 1, borderColor: "#2F4058", backgroundColor: "#111C2D" },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  reasonPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: amber + "18", borderWidth: 1, borderColor: amber + "55" },
  reason: { color: amber, fontSize: 9, fontWeight: "800" },
  score: { color: muted, fontSize: 11, fontWeight: "800" },
  headline: { color: "#F4F7FB", fontSize: 16, lineHeight: 22, fontWeight: "800", marginTop: 13 },
  meta: { color: muted, fontSize: 9, lineHeight: 14, marginTop: 7 },
  sectionLabel: { color: amber, fontSize: 9, letterSpacing: 1, fontWeight: "800", marginTop: 14, marginBottom: 5 },
  reasonLine: { color: "#D5E2EF", fontSize: 10, lineHeight: 16 },
  evidenceRow: { flexDirection: "row", gap: 10, marginTop: 11, flexWrap: "wrap" },
  evidence: { color: muted, fontSize: 9 },
  sourceLink: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 13 },
  sourceLinkText: { color: teal, fontSize: 10, fontWeight: "800" },
  actions: { flexDirection: "row", gap: 9, marginTop: 15 },
  dismissButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 40, borderRadius: 10, borderWidth: 1, borderColor: coral + "66", backgroundColor: coral + "12" },
  dismissText: { color: coral, fontSize: 10, fontWeight: "800" },
  approveButton: { flex: 1.35, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 40, borderRadius: 10, backgroundColor: amber },
  approveText: { color: "#09111F", fontSize: 10, fontWeight: "900" },
  empty: { alignItems: "center", paddingHorizontal: 25, paddingVertical: 60, gap: 8 },
  emptyTitle: { color: "#F4F7FB", fontSize: 16, fontWeight: "800", textAlign: "center" },
  emptyText: { color: muted, fontSize: 11, lineHeight: 17, textAlign: "center" },
  loading: { color: muted, marginTop: 40, textAlign: "center" },
  pressed: { opacity: 0.72 },
});
