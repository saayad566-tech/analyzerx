import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";

const amber = "#F4B860";
const teal = "#4FD1C5";
const violet = "#A78BFA";
type ProjectedStoryline = { id: string; title: string; subtitle: string; score: number; entities: string[]; events: { id: string; time: string; kind: string; title: string; symbol?: string | null }[] };
const WINDOW_OPTIONS = [{ label: "24h", lookbackDays: 1 }, { label: "7d", lookbackDays: 7 }, { label: "30d", lookbackDays: 30 }, { label: "90d", lookbackDays: 90 }, { label: "180d", lookbackDays: 180 }, { label: "1y", lookbackDays: 365 }] as const;

export default function StorylinesScreen() {
  const [selectedWindow, setSelectedWindow] = useState(30);
  const eventsQuery = trpc.events.latest.useQuery({ limit: 200, lookbackDays: selectedWindow }, { staleTime: 60_000, retry: false });
  const projectedStorylines = useMemo<ProjectedStoryline[]>(() => {
    const grouped = new Map<string, ProjectedStoryline>();
    for (const event of eventsQuery.data ?? []) {
      const id = event.storylineKey ?? `storyline:${event.symbol ?? "unknown"}`;
      const current = grouped.get(id) ?? { id, title: event.title, subtitle: event.summary, score: 0, entities: [], events: [] };
      current.score = Math.max(current.score, event.impactScore);
      current.subtitle = current.subtitle || event.summary;
      if (event.symbol && !current.entities.includes(event.symbol)) current.entities.push(event.symbol);
      current.events.push({ id: event.id, time: new Date(event.eventAt).toLocaleDateString(), kind: event.eventType, title: event.title, symbol: event.symbol });
      grouped.set(id, current);
    }
    return [...grouped.values()].sort((left, right) => right.score - left.score);
  }, [eventsQuery.data]);
  return (
    <ScreenContainer className="px-5">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.headerRow}><View><Text style={styles.eyebrow}>RELATIONSHIP ENGINE</Text><Text style={styles.title}>Storylines</Text></View><Pressable style={styles.iconButton}><Ionicons name="funnel-outline" size={19} color="#F4F7FB" /></Pressable></View>
        <Text style={styles.subtitle}>Signals that belong together, not headlines that happen to be close.</Text>
        <View style={styles.windowRow}>{WINDOW_OPTIONS.map((window) => <Pressable key={window.label} onPress={() => setSelectedWindow(window.lookbackDays)} accessibilityRole="button" accessibilityState={{ selected: selectedWindow === window.lookbackDays }} style={[styles.windowChip, selectedWindow === window.lookbackDays && styles.windowActive]}><Text style={[styles.windowText, selectedWindow === window.lookbackDays && styles.windowTextActive]}>{window.label}</Text></Pressable>)}</View>{eventsQuery.isFetching ? <View style={styles.collectionStatus}><Ionicons name="cloud-download-outline" size={15} color={teal} /><Text style={styles.collectionStatusText}>Collecting {WINDOW_OPTIONS.find((window) => window.lookbackDays === selectedWindow)?.label ?? "selected"} event history…</Text></View> : null}
        {projectedStorylines.length ? projectedStorylines.map((story, index) => {
          const storyEvents = story.events;
          const primarySymbol = story.entities[0];
          return <Pressable key={story.id} onPress={() => primarySymbol && router.push({ pathname: "/company/[symbol]", params: { symbol: primarySymbol } })} style={({ pressed }) => [styles.storyCard, pressed && styles.pressed]}><View style={styles.storyTop}><View style={[styles.storyIndex, { backgroundColor: index === 0 ? amber + "20" : violet + "20" }]}><Text style={[styles.storyIndexText, { color: index === 0 ? amber : violet }]}>{String(index + 1).padStart(2, "0")}</Text></View><View style={styles.storyHeaderCopy}><Text style={styles.storyTitle}>{story.title}</Text><Text style={styles.storySubtitle}>{story.subtitle}</Text></View><View style={styles.scoreBox}><Text style={styles.scoreNumber}>{story.score}</Text><Text style={styles.scoreCaption}>SCORE</Text></View></View><View style={styles.timeline}>{storyEvents.slice().reverse().map((event, eventIndex) => <View key={event.id} style={styles.timelineRow}><View style={styles.timelineRail}><View style={[styles.timelineDot, { backgroundColor: eventIndex === 0 ? amber : teal }]} />{eventIndex < storyEvents.length - 1 && <View style={styles.railLine} />}</View><View style={styles.timelineCopy}><View style={styles.timelineMeta}><Text style={styles.timelineTime}>{event.time}</Text><Text style={styles.timelineKind}>{event.kind}</Text></View><Text style={styles.timelineTitle}>{event.title}</Text></View></View>)}</View><View style={styles.storyFooter}><View style={styles.entityRow}>{story.entities.slice(0, 4).map((entity) => <Pressable key={entity} onPress={() => router.push({ pathname: "/company/[symbol]", params: { symbol: entity } })} style={styles.entityPill}><Text style={styles.entityPillText}>{entity}</Text></Pressable>)}</View><Ionicons name="arrow-forward" size={17} color="#91A2B8" /></View></Pressable>;
        }) : <View style={styles.empty}><Ionicons name="git-network-outline" size={28} color={amber} /><Text style={styles.emptyTitle}>{eventsQuery.isLoading ? "Loading verified storylines…" : "No persisted storylines yet"}</Text><Text style={styles.emptyText}>{eventsQuery.isLoading ? "The tracker is loading source-backed event projections." : "Storylines appear after verified news or filing events are projected."}</Text></View>}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 42 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 12 },
  eyebrow: { color: amber, fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  title: { color: "#F4F7FB", fontSize: 32, fontWeight: "800", letterSpacing: -1, marginTop: 5 },
  subtitle: { color: "#91A2B8", fontSize: 14, lineHeight: 20, marginTop: 12, maxWidth: 310 },
  iconButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center", backgroundColor: "#111C2D", borderWidth: 1, borderColor: "#26364D", borderRadius: 14 },
  windowRow: { flexDirection: "row", gap: 8, marginTop: 20, marginBottom: 18 },
  windowChip: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: "#26364D" },
  windowActive: { backgroundColor: amber, borderColor: amber },
  windowText: { color: "#91A2B8", fontSize: 12, fontWeight: "700" },
  windowTextActive: { color: "#09111F" },
  collectionStatus: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "#102B2C", borderWidth: 1, borderColor: "#2D5657", borderRadius: 10, padding: 9, marginBottom: 14 },
  collectionStatusText: { color: teal, fontSize: 10, fontWeight: "700" },
  storyCard: { backgroundColor: "#111C2D", borderRadius: 19, borderWidth: 1, borderColor: "#26364D", padding: 16, marginBottom: 13 },
  pressed: { opacity: 0.78 },
  storyTop: { flexDirection: "row", alignItems: "flex-start" },
  storyIndex: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  storyIndexText: { fontSize: 12, fontWeight: "800" },
  storyHeaderCopy: { flex: 1, paddingHorizontal: 10 },
  storyTitle: { color: "#F4F7FB", fontSize: 15, lineHeight: 19, fontWeight: "800" },
  storySubtitle: { color: "#91A2B8", fontSize: 11, marginTop: 4 },
  scoreBox: { alignItems: "flex-end" },
  scoreNumber: { color: amber, fontSize: 19, fontWeight: "800" },
  scoreCaption: { color: "#6E7D92", fontSize: 8, letterSpacing: 0.9, marginTop: 1 },
  timeline: { marginTop: 18 },
  timelineRow: { flexDirection: "row" },
  timelineRail: { width: 18, alignItems: "center" },
  timelineDot: { width: 8, height: 8, borderRadius: 4, zIndex: 1 },
  railLine: { position: "absolute", top: 8, bottom: -1, width: 1, backgroundColor: "#31435B" },
  timelineCopy: { flex: 1, paddingLeft: 8, paddingBottom: 15 },
  timelineMeta: { flexDirection: "row", gap: 7, alignItems: "center" },
  timelineTime: { color: amber, fontSize: 10, fontWeight: "800" },
  timelineKind: { color: "#6E7D92", fontSize: 10 },
  timelineTitle: { color: "#C5D1DE", fontSize: 12, lineHeight: 17, marginTop: 4 },
  storyFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 12, borderTopWidth: 1, borderTopColor: "#26364D" },
  entityRow: { flexDirection: "row", gap: 6, flex: 1 },
  entityPill: { backgroundColor: "#17253A", paddingHorizontal: 7, paddingVertical: 5, borderRadius: 6 },
  entityPillText: { color: "#91A2B8", fontSize: 9, fontWeight: "700" },
  empty: { backgroundColor: "#111C2D", borderRadius: 16, borderWidth: 1, borderColor: "#26364D", padding: 24, alignItems: "center", marginTop: 18 },
  emptyTitle: { color: "#F4F7FB", fontSize: 15, fontWeight: "800", marginTop: 10 },
  emptyText: { color: "#91A2B8", fontSize: 11, lineHeight: 17, textAlign: "center", marginTop: 6 },
});
