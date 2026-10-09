import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/use-auth";

const amber = "#F4B860";
const teal = "#4FD1C5";
const coral = "#FB7185";

function openNotification(path: string | null, paramsJson: string | null) {
  if (!path) return;
  const allowed = ["/article/[id]", "/company/[symbol]", "/alert-result/[id]", "/recommendation/[id]", "/flows", "/reports"];
  if (!allowed.includes(path)) return;
  let params: Record<string, string> = {};
  if (paramsJson) {
    try {
      const parsed = JSON.parse(paramsJson) as Record<string, unknown>;
      params = Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === "string")) as Record<string, string>;
    } catch {
      params = {};
    }
  }
  router.push({ pathname: path as never, params });
}

export default function NotificationsScreen() {
  const { isAuthenticated } = useAuth();
  const [cursor, setCursor] = useState<string | undefined>();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const query = trpc.account.notifications.useQuery({ limit: 30, cursor, unreadOnly }, { enabled: isAuthenticated, retry: false, staleTime: 30_000 });
  const readMutation = trpc.account.notificationRead.useMutation({ onSuccess: () => void query.refetch() });
  const readAllMutation = trpc.account.notificationsReadAll.useMutation({ onSuccess: () => void query.refetch() });
  const items = useMemo(() => query.data?.items ?? [], [query.data?.items]);

  return (
    <ScreenContainer className="px-5">
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={query.isFetching} onRefresh={() => void query.refetch()} tintColor={amber} />}
        contentContainerStyle={styles.content}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>INBOX</Text>
            <Text style={styles.title}>Notifications</Text>
            <Text style={styles.subtitle}>{query.data?.unreadCount ?? 0} unread · evidence-linked updates</Text>
          </View>
          <Pressable style={styles.closeButton} onPress={() => router.back()} accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={20} color={amber} />
          </Pressable>
        </View>
        <View style={styles.toolbar}>
          <Pressable style={[styles.filterChip, !unreadOnly && styles.filterChipActive]} onPress={() => { setUnreadOnly(false); setCursor(undefined); }}><Text style={[styles.filterText, !unreadOnly && styles.filterTextActive]}>All</Text></Pressable>
          <Pressable style={[styles.filterChip, unreadOnly && styles.filterChipActive]} onPress={() => { setUnreadOnly(true); setCursor(undefined); }}><Text style={[styles.filterText, unreadOnly && styles.filterTextActive]}>Unread</Text></Pressable>
          <Pressable style={styles.readAllButton} disabled={readAllMutation.isPending || !query.data?.unreadCount} onPress={() => readAllMutation.mutate()}><Text style={styles.readAllText}>{readAllMutation.isPending ? "Saving…" : "Mark all read"}</Text></Pressable>
        </View>
        {!isAuthenticated ? <View style={styles.stateCard}><Ionicons name="lock-closed-outline" size={23} color={amber} /><Text style={styles.stateTitle}>Sign in to sync your inbox</Text><Text style={styles.stateText}>Push alerts can still appear on this device, but durable notification history requires an authenticated account.</Text></View> : query.isLoading ? <View style={styles.stateCard}><Ionicons name="sync-outline" size={23} color={amber} /><Text style={styles.stateTitle}>Loading your inbox…</Text><Text style={styles.stateText}>Checking saved news, flow, alert, and research updates.</Text></View> : query.error ? <View style={styles.stateCard}><Ionicons name="warning-outline" size={23} color={coral} /><Text style={styles.stateTitle}>Inbox temporarily unavailable</Text><Text style={styles.stateText}>Your previous notifications are safe. Pull to refresh when the connection is restored.</Text></View> : items.length === 0 ? <View style={styles.stateCard}><Ionicons name="notifications-off-outline" size={23} color={teal} /><Text style={styles.stateTitle}>{unreadOnly ? "No unread notifications" : "No notifications yet"}</Text><Text style={styles.stateText}>New verified news, alert transitions, flow evidence, and report events will appear here.</Text></View> : items.map((item) => {
          const unread = !item.readAt;
          return <Pressable key={item.id} style={[styles.item, unread && styles.itemUnread]} onPress={() => { if (unread) readMutation.mutate({ id: item.id }); openNotification(item.deepLinkPath, item.deepLinkParamsJson); }}>
            <View style={[styles.icon, { backgroundColor: unread ? amber + "22" : "#17253A" }]}><Ionicons name={unread ? "sparkles-outline" : "checkmark-done-outline"} size={19} color={unread ? amber : "#91A2B8"} /></View>
            <View style={styles.itemCopy}><View style={styles.itemTop}><Text style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>{unread ? <View style={styles.unreadDot} /> : null}</View><Text style={styles.itemBody} numberOfLines={3}>{item.body}</Text><Text style={styles.itemMeta}>{item.marketId}{item.symbol ? ` · ${item.symbol}` : ""} · {new Date(item.createdAt).toLocaleString()}</Text>{item.deepLinkPath ? <Text style={styles.evidenceLink}>Open evidence ›</Text> : <Text style={styles.evidenceMuted}>Evidence saved</Text>}</View>
          </Pressable>;
        })}
        {query.data?.nextCursor ? <Pressable style={styles.moreButton} onPress={() => setCursor(query.data?.nextCursor ?? undefined)}><Text style={styles.moreText}>Load older notifications</Text><Ionicons name="chevron-down" size={16} color={amber} /></Pressable> : null}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 48 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingTop: 12 },
  eyebrow: { color: amber, fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  title: { color: "#F4F7FB", fontSize: 31, fontWeight: "800", marginTop: 4 },
  subtitle: { color: "#91A2B8", fontSize: 12, marginTop: 6 },
  closeButton: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, borderColor: "#26364D", backgroundColor: "#111C2D", alignItems: "center", justifyContent: "center" },
  toolbar: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 20, marginBottom: 12 },
  filterChip: { borderWidth: 1, borderColor: "#26364D", borderRadius: 10, paddingHorizontal: 13, paddingVertical: 8, backgroundColor: "#111C2D" },
  filterChipActive: { backgroundColor: amber, borderColor: amber },
  filterText: { color: "#91A2B8", fontSize: 11, fontWeight: "800" },
  filterTextActive: { color: "#09111F" },
  readAllButton: { marginLeft: "auto", paddingVertical: 8, paddingHorizontal: 4 },
  readAllText: { color: teal, fontSize: 11, fontWeight: "800" },
  item: { flexDirection: "row", gap: 12, borderWidth: 1, borderColor: "#26364D", borderRadius: 16, padding: 13, marginBottom: 10, backgroundColor: "#111C2D" },
  itemUnread: { borderColor: amber + "66", backgroundColor: "#17253A" },
  icon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  itemCopy: { flex: 1 },
  itemTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  itemTitle: { flex: 1, color: "#F4F7FB", fontSize: 14, lineHeight: 19, fontWeight: "800" },
  unreadDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: amber, marginTop: 5 },
  itemBody: { color: "#B8C6D6", fontSize: 12, lineHeight: 18, marginTop: 5 },
  itemMeta: { color: "#6E7D92", fontSize: 10, marginTop: 8 },
  evidenceLink: { color: amber, fontSize: 10, fontWeight: "800", marginTop: 7 },
  evidenceMuted: { color: "#6E7D92", fontSize: 10, marginTop: 7 },
  stateCard: { alignItems: "center", borderWidth: 1, borderColor: "#26364D", borderRadius: 16, backgroundColor: "#111C2D", padding: 22, marginTop: 10 },
  stateTitle: { color: "#F4F7FB", fontSize: 15, fontWeight: "800", textAlign: "center", marginTop: 10 },
  stateText: { color: "#91A2B8", fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 7 },
  moreButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderWidth: 1, borderColor: amber + "66", borderRadius: 12, paddingVertical: 12, marginTop: 4 },
  moreText: { color: amber, fontSize: 11, fontWeight: "800" },
});
