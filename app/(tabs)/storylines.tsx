import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
import { useMarketContext } from "@/lib/market-context";

const amber = "#F4B860";
const teal = "#4FD1C5";
const violet = "#A78BFA";
const coral = "#FB7185";
const muted = "#91A2B8";
const border = "#26364D";
const panel = "#111C2D";
const elevated = "#17253A";

type ProjectedStoryline = {
  id: string;
  title: string;
  subtitle: string;
  score: number;
  entities: string[];
  events: { id: string; time: string; kind: string; title: string; symbol?: string | null }[];
};

/** Matches the archive contract in lib/news-archive.ts plus the router fields. */
type ArchiveArticle = {
  id: string;
  symbol: string;
  headline: string;
  summary: string;
  source: string;
  url: string;
  sentiment: "Positive" | "Neutral" | "Negative";
  impact_score: number;
  high_impact: boolean;
  published_at: string;
  actionable_impact: string;
  key_entities: string[];
};

/** Day windows the archive endpoint accepts. */
const ARCHIVE_DAYS = [30, 90, 180, 270, 365] as const;

const WINDOW_OPTIONS = [
  { label: "24h", lookbackDays: 1 },
  { label: "7d", lookbackDays: 7 },
  { label: "30d", lookbackDays: 30 },
  { label: "90d", lookbackDays: 90 },
  { label: "180d", lookbackDays: 180 },
  { label: "1y", lookbackDays: 365 },
] as const;

/**
 * A date that is always readable. The previous screen called
 * new Date(event.eventAt).toLocaleDateString() against a payload that did not
 * carry eventAt, so most rows rendered the literal text "Invalid Date".
 */
function formatWhen(value: string | Date | null | undefined): string {
  if (!value) return "Date not supplied";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Date not supplied";
  const now = Date.now();
  const diffMs = now - parsed.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function sentimentTone(value: ArchiveArticle["sentiment"]): { color: string; label: string } {
  if (value === "Positive") return { color: teal, label: "Positive" };
  if (value === "Negative") return { color: coral, label: "Negative" };
  return { color: muted, label: "Neutral" };
}

export default function StorylinesScreen() {
  const [selectedWindow, setSelectedWindow] = useState<number>(30);
  const [mode, setMode] = useState<"news" | "storylines">("news");

  const eventsQuery = trpc.events.latest.useQuery(
    { limit: 200, lookbackDays: selectedWindow },
    { staleTime: 60_000, retry: false },
  );

  // The phone's own archive: it reaches back to the first day collection ran,
  // so this list carries both recent and older news rather than a live window.
  // news.archive accepts only 30/90/180/270/365 day windows, so query the
  // nearest window that covers the selection and then narrow it precisely.
  const archiveDays = ARCHIVE_DAYS.find((value) => value >= selectedWindow) ?? 365;
  // The archive is scoped to the selected market, so a story from another
  // market never appears here.
  const { marketId } = useMarketContext();
  const archiveQuery = trpc.news.archive.useQuery(
    { days: archiveDays, limit: 300, archiveOrder: "Newest first", page: 0, marketId },
    { staleTime: 60_000, retry: false },
  );

  const articles = useMemo<ArchiveArticle[]>(() => {
    const rows = (archiveQuery.data?.articles ?? []) as ArchiveArticle[];
    // Narrow the fetched window to the one the user actually selected.
    const cutoff = Date.now() - selectedWindow * 86_400_000;
    const withinWindow = rows.filter((article) => {
      const parsed = article.published_at ? new Date(article.published_at).getTime() : Number.NaN;
      return Number.isNaN(parsed) ? true : parsed >= cutoff;
    });
    return [...withinWindow].sort((left, right) => {
      const a = new Date(left.published_at).getTime();
      const b = new Date(right.published_at).getTime();
      const safeA = Number.isNaN(a) ? 0 : a;
      const safeB = Number.isNaN(b) ? 0 : b;
      return safeB - safeA;
    });
  }, [archiveQuery.data, selectedWindow]);

  const projectedStorylines = useMemo<ProjectedStoryline[]>(() => {
    const grouped = new Map<string, ProjectedStoryline>();
    for (const event of eventsQuery.data ?? []) {
      const id = event.storylineKey ?? `storyline:${event.symbol ?? "unknown"}`;
      const current =
        grouped.get(id) ??
        { id, title: event.title, subtitle: event.summary, score: 0, entities: [], events: [] };
      current.score = Math.max(current.score, event.impactScore);
      current.subtitle = current.subtitle || event.summary;
      if (event.symbol && !current.entities.includes(event.symbol)) current.entities.push(event.symbol);
      current.events.push({
        id: event.id,
        time: formatWhen(event.eventAt),
        kind: event.eventType,
        title: event.title,
        symbol: event.symbol,
      });
      grouped.set(id, current);
    }
    return [...grouped.values()].sort((left, right) => right.score - left.score);
  }, [eventsQuery.data]);

  const windowLabel =
    WINDOW_OPTIONS.find((option) => option.lookbackDays === selectedWindow)?.label ?? "selected";
  const newsLoading = archiveQuery.isLoading || archiveQuery.isFetching;

  return (
    <ScreenContainer className="px-5">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.eyebrow}>NEWS & RELATIONSHIPS</Text>
            <Text style={styles.title}>Stories</Text>
          </View>
          <Pressable
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel="Refresh news"
            onPress={() => {
              void archiveQuery.refetch();
              void eventsQuery.refetch();
            }}
          >
            <Ionicons name="refresh-outline" size={19} color="#F4F7FB" />
          </Pressable>
        </View>
        <Text style={styles.subtitle}>
          Every headline the tracker has collected on this device, newest first. Tap any story to
          read it in full.
        </Text>

        <View style={styles.modeRow}>
          {([
            { key: "news", label: "All news" },
            { key: "storylines", label: "Storylines" },
          ] as const).map((option) => (
            <Pressable
              key={option.key}
              onPress={() => setMode(option.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === option.key }}
              style={[styles.modeChip, mode === option.key && styles.modeChipActive]}
            >
              <Text style={[styles.modeText, mode === option.key && styles.modeTextActive]}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.windowRow}>
          {WINDOW_OPTIONS.map((option) => (
            <Pressable
              key={option.label}
              onPress={() => setSelectedWindow(option.lookbackDays)}
              accessibilityRole="button"
              accessibilityState={{ selected: selectedWindow === option.lookbackDays }}
              style={[styles.windowChip, selectedWindow === option.lookbackDays && styles.windowActive]}
            >
              <Text
                style={[
                  styles.windowText,
                  selectedWindow === option.lookbackDays && styles.windowTextActive,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {newsLoading && mode === "news" ? (
          <View style={styles.collectionStatus}>
            <Ionicons name="cloud-download-outline" size={15} color={teal} />
            <Text style={styles.collectionStatusText}>
              Collecting {windowLabel} of news from the archive on this device…
            </Text>
          </View>
        ) : null}

        {mode === "news" ? (
          archiveQuery.isError ? (
            <View style={styles.empty}>
              <Ionicons name="warning-outline" size={28} color={coral} />
              <Text style={styles.emptyTitle}>News could not be loaded</Text>
              <Text style={styles.emptyText}>
                The on-device archive did not respond. Nothing was deleted; pull refresh to retry.
              </Text>
            </View>
          ) : articles.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="newspaper-outline" size={28} color={amber} />
              <Text style={styles.emptyTitle}>
                {newsLoading ? "Loading news…" : "No news in this window"}
              </Text>
              <Text style={styles.emptyText}>
                {newsLoading
                  ? "Reading the on-device archive and topping it up from live sources."
                  : `Nothing was collected in the last ${windowLabel}. Try a wider window.`}
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.resultCount}>
                {articles.length} {articles.length === 1 ? "story" : "stories"} · {windowLabel}
              </Text>
              {articles.map((article) => {
                const tone = sentimentTone(article.sentiment);
                return (
                  <Pressable
                    key={article.id}
                    onPress={() =>
                      router.push({ pathname: "/news/[id]", params: { id: article.id } })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Read: ${article.headline}`}
                    style={({ pressed }) => [styles.newsCard, pressed && styles.pressed]}
                  >
                    <View style={styles.newsMetaRow}>
                      <Text style={styles.newsWhen}>{formatWhen(article.published_at)}</Text>
                      <Text style={styles.newsSource} numberOfLines={1}>
                        {article.source}
                      </Text>
                    </View>
                    <Text style={styles.newsHeadline} numberOfLines={3}>
                      {article.headline}
                    </Text>
                    <View style={styles.newsFooter}>
                      <View style={[styles.toneChip, { borderColor: `${tone.color}66` }]}>
                        <Text style={[styles.toneText, { color: tone.color }]}>{tone.label}</Text>
                      </View>
                      <View style={styles.impactChip}>
                        <Text style={styles.impactText}>{article.impact_score}</Text>
                        <Text style={styles.impactCaption}>IMPACT</Text>
                      </View>
                      {article.symbol ? (
                        <Pressable
                          onPress={() =>
                            router.push({
                              pathname: "/company/[symbol]",
                              params: { symbol: article.symbol },
                            })
                          }
                          style={styles.symbolPill}
                        >
                          <Text style={styles.symbolText}>{article.symbol}</Text>
                        </Pressable>
                      ) : null}
                      <View style={styles.spacer} />
                      <Ionicons name="chevron-forward" size={16} color={muted} />
                    </View>
                  </Pressable>
                );
              })}
            </>
          )
        ) : projectedStorylines.length ? (
          projectedStorylines.map((story, index) => {
            const storyEvents = story.events;
            const primarySymbol = story.entities[0];
            return (
              <Pressable
                key={story.id}
                onPress={() =>
                  primarySymbol &&
                  router.push({ pathname: "/company/[symbol]", params: { symbol: primarySymbol } })
                }
                style={({ pressed }) => [styles.storyCard, pressed && styles.pressed]}
              >
                <View style={styles.storyTop}>
                  <View
                    style={[
                      styles.storyIndex,
                      { backgroundColor: index === 0 ? `${amber}20` : `${violet}20` },
                    ]}
                  >
                    <Text
                      style={[styles.storyIndexText, { color: index === 0 ? amber : violet }]}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </Text>
                  </View>
                  <View style={styles.storyHeaderCopy}>
                    <Text style={styles.storyTitle}>{story.title}</Text>
                    <Text style={styles.storySubtitle}>{story.subtitle}</Text>
                  </View>
                  <View style={styles.scoreBox}>
                    <Text style={styles.scoreNumber}>{story.score}</Text>
                    <Text style={styles.scoreCaption}>SCORE</Text>
                  </View>
                </View>
                <View style={styles.timeline}>
                  {storyEvents
                    .slice()
                    .reverse()
                    .map((event, eventIndex) => (
                      <View key={event.id} style={styles.timelineRow}>
                        <View style={styles.timelineRail}>
                          <View
                            style={[
                              styles.timelineDot,
                              { backgroundColor: eventIndex === 0 ? amber : teal },
                            ]}
                          />
                          {eventIndex < storyEvents.length - 1 && <View style={styles.railLine} />}
                        </View>
                        <View style={styles.timelineCopy}>
                          <View style={styles.timelineMeta}>
                            <Text style={styles.timelineTime}>{event.time}</Text>
                            <Text style={styles.timelineKind}>{event.kind}</Text>
                          </View>
                          <Text style={styles.timelineTitle}>{event.title}</Text>
                        </View>
                      </View>
                    ))}
                </View>
                <View style={styles.storyFooter}>
                  <View style={styles.entityRow}>
                    {story.entities.slice(0, 4).map((entity) => (
                      <Pressable
                        key={entity}
                        onPress={() =>
                          router.push({ pathname: "/company/[symbol]", params: { symbol: entity } })
                        }
                        style={styles.entityPill}
                      >
                        <Text style={styles.entityPillText}>{entity}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <Ionicons name="arrow-forward" size={17} color={muted} />
                </View>
              </Pressable>
            );
          })
        ) : (
          <View style={styles.empty}>
            <Ionicons name="git-network-outline" size={28} color={amber} />
            <Text style={styles.emptyTitle}>
              {eventsQuery.isLoading ? "Loading verified storylines…" : "No storylines in this window"}
            </Text>
            <Text style={styles.emptyText}>
              {eventsQuery.isLoading
                ? "The tracker is loading source-backed event projections."
                : "Storylines appear once verified news or filing events are projected."}
            </Text>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 42 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 12 },
  eyebrow: { color: amber, fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  title: { color: "#F4F7FB", fontSize: 32, fontWeight: "800", letterSpacing: -1, marginTop: 5 },
  subtitle: { color: muted, fontSize: 13, lineHeight: 19, marginTop: 10 },
  iconButton: {
    width: 42, height: 42, borderRadius: 14, borderWidth: 1, borderColor: border,
    backgroundColor: panel, alignItems: "center", justifyContent: "center",
  },
  modeRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  modeChip: {
    flex: 1, borderWidth: 1, borderColor: border, borderRadius: 10,
    paddingVertical: 10, alignItems: "center", backgroundColor: panel,
  },
  modeChipActive: { backgroundColor: amber, borderColor: amber },
  modeText: { color: muted, fontSize: 12, fontWeight: "800" },
  modeTextActive: { color: "#09111F" },
  windowRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10, marginBottom: 4 },
  windowChip: {
    borderWidth: 1, borderColor: border, borderRadius: 9,
    paddingHorizontal: 13, paddingVertical: 7, backgroundColor: panel,
  },
  windowActive: { backgroundColor: `${teal}22`, borderColor: teal },
  windowText: { color: muted, fontSize: 11, fontWeight: "700" },
  windowTextActive: { color: teal },
  collectionStatus: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 10 },
  collectionStatusText: { color: teal, fontSize: 11 },
  resultCount: { color: muted, fontSize: 11, fontWeight: "700", marginTop: 12, marginBottom: 8 },
  newsCard: {
    backgroundColor: panel, borderWidth: 1, borderColor: border, borderRadius: 15,
    padding: 14, marginBottom: 10,
  },
  pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  newsMetaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  newsWhen: { color: amber, fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  newsSource: { color: muted, fontSize: 10, flex: 1 },
  newsHeadline: { color: "#F4F7FB", fontSize: 15, fontWeight: "700", lineHeight: 21, marginTop: 7 },
  newsFooter: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 11 },
  toneChip: { borderWidth: 1, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3 },
  toneText: { fontSize: 9, fontWeight: "800" },
  impactChip: { flexDirection: "row", alignItems: "baseline", gap: 4 },
  impactText: { color: "#F4F7FB", fontSize: 13, fontWeight: "800" },
  impactCaption: { color: muted, fontSize: 8, fontWeight: "800", letterSpacing: 0.6 },
  symbolPill: { backgroundColor: elevated, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4 },
  symbolText: { color: amber, fontSize: 9, fontWeight: "900" },
  spacer: { flex: 1 },
  empty: {
    alignItems: "center", gap: 8, backgroundColor: panel, borderWidth: 1,
    borderColor: border, borderRadius: 16, padding: 22, marginTop: 16,
  },
  emptyTitle: { color: "#F4F7FB", fontSize: 15, fontWeight: "800", textAlign: "center" },
  emptyText: { color: muted, fontSize: 12, lineHeight: 18, textAlign: "center" },
  storyCard: {
    backgroundColor: panel, borderWidth: 1, borderColor: border, borderRadius: 16,
    padding: 15, marginTop: 12,
  },
  storyTop: { flexDirection: "row", alignItems: "flex-start", gap: 11 },
  storyIndex: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  storyIndexText: { fontSize: 12, fontWeight: "900" },
  storyHeaderCopy: { flex: 1 },
  storyTitle: { color: "#F4F7FB", fontSize: 15, fontWeight: "800", lineHeight: 20 },
  storySubtitle: { color: muted, fontSize: 11, lineHeight: 16, marginTop: 4 },
  scoreBox: { alignItems: "flex-end" },
  scoreNumber: { color: amber, fontSize: 19, fontWeight: "900" },
  scoreCaption: { color: muted, fontSize: 8, fontWeight: "800", letterSpacing: 0.6 },
  timeline: { marginTop: 13 },
  timelineRow: { flexDirection: "row", gap: 10 },
  timelineRail: { alignItems: "center", width: 12 },
  timelineDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  railLine: { flex: 1, width: 1, backgroundColor: border, marginTop: 3 },
  timelineCopy: { flex: 1, paddingBottom: 12 },
  timelineMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  timelineTime: { color: teal, fontSize: 10, fontWeight: "800" },
  timelineKind: { color: muted, fontSize: 9, textTransform: "uppercase", letterSpacing: 0.5 },
  timelineTitle: { color: "#C5D1DE", fontSize: 12, lineHeight: 17, marginTop: 3 },
  storyFooter: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderTopWidth: 1, borderTopColor: border, marginTop: 6, paddingTop: 11,
  },
  entityRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  entityPill: { backgroundColor: elevated, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  entityPillText: { color: amber, fontSize: 9, fontWeight: "900" },
});
