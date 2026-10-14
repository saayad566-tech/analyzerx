import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMemo } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
import { useMarketContext } from "@/lib/market-context";

const amber = "#F4B860";
const teal = "#4FD1C5";
const coral = "#FB7185";
const muted = "#91A2B8";
const border = "#26364D";
const panel = "#111C2D";
const elevated = "#17253A";

/** Matches the archive contract in lib/news-archive.ts plus the router fields. */
type StoredArticle = {
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

/** Always-readable date; never the literal text "Invalid Date". */
function formatFullDate(value: string | null | undefined): string {
  if (!value) return "Date not supplied by the source";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Date not supplied by the source";
  return parsed.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toneFor(sentiment: StoredArticle["sentiment"]): string {
  if (sentiment === "Positive") return teal;
  if (sentiment === "Negative") return coral;
  return muted;
}

export default function NewsDetailScreen() {
  const { market } = useMarketContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  // The detail screen reads the same on-device archive the list uses and looks
  // the story up by id, so it needs no procedure the typed router does not
  // already expose.
  // Scoped to the selected market, so a story can only be opened from the
  // market it belongs to.
  const { marketId } = useMarketContext();
  const archiveQuery = trpc.news.archive.useQuery(
    { marketId: market.id, days: 365, limit: 500, archiveOrder: "Newest first", page: 0 },
    { staleTime: 60_000, retry: false },
  );
  const articleQuery = archiveQuery;
  const article = useMemo<StoredArticle | null>(() => {
    const rows = (archiveQuery.data?.articles ?? []) as StoredArticle[];
    return rows.find((row) => row.id === id) ?? null;
  }, [archiveQuery.data, id]);

  if (articleQuery.isLoading) {
    return (
      <ScreenContainer className="px-5">
        <View style={styles.state}>
          <Ionicons name="cloud-download-outline" size={26} color={teal} />
          <Text style={styles.stateTitle}>Loading story…</Text>
          <Text style={styles.stateText}>Reading this article from the on-device archive.</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (articleQuery.isError || !article) {
    return (
      <ScreenContainer className="px-5">
        <View style={styles.state}>
          <Ionicons name="warning-outline" size={26} color={coral} />
          <Text style={styles.stateTitle}>Story unavailable</Text>
          <Text style={styles.stateText}>
            This article is not in the archive and could not be fetched live. It may have been
            pruned, or the source may be unreachable right now. Nothing was deleted.
          </Text>
          <Pressable
            onPress={() => router.back()}
            style={styles.stateButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={styles.stateButtonText}>Go back</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  const tone = toneFor(article.sentiment);

  return (
    <ScreenContainer className="px-5">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.metaRow}>
          <Text style={styles.when}>{formatFullDate(article.published_at)}</Text>
          <View style={[styles.toneChip, { borderColor: `${tone}66` }]}>
            <Text style={[styles.toneText, { color: tone }]}>{article.sentiment}</Text>
          </View>
        </View>

        <Text style={styles.headline}>{article.headline}</Text>

        <View style={styles.sourceRow}>
          <Ionicons name="newspaper-outline" size={14} color={muted} />
          <Text style={styles.sourceText}>{article.source}</Text>
          {article.symbol ? (
            <Pressable
              onPress={() =>
                router.push({ pathname: "/company/[symbol]", params: { symbol: article.symbol } })
              }
              style={styles.symbolPill}
              accessibilityRole="button"
              accessibilityLabel={`Open ${article.symbol}`}
            >
              <Text style={styles.symbolText}>{article.symbol}</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.impactCard}>
          <View>
            <Text style={styles.impactLabel}>IMPACT SCORE</Text>
            <Text style={styles.impactValue}>{article.impact_score}</Text>
          </View>
          <View style={styles.impactNote}>
            <Text style={styles.impactNoteText}>
              Scored from the headline and summary by the on-device classifier. It is a reading aid,
              not investment advice.
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Summary</Text>
          <Text style={styles.body}>{article.summary || "The source supplied no summary for this story."}</Text>
        </View>

        {article.key_entities?.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Entities</Text>
            <View style={styles.entityRow}>
              {article.key_entities.map((entity) => (
                <View key={entity} style={styles.entityPill}>
                  <Text style={styles.entityPillText}>{entity}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Provenance</Text>
          <View style={styles.provenanceRow}>
            <Text style={styles.provenanceLabel}>Publisher</Text>
            <Text style={styles.provenanceValue}>{article.source}</Text>
          </View>
          <View style={styles.provenanceRow}>
            <Text style={styles.provenanceLabel}>Published</Text>
            <Text style={styles.provenanceValue}>{formatFullDate(article.published_at)}</Text>
          </View>
          <View style={styles.provenanceRow}>
            <Text style={styles.provenanceLabel}>Impact</Text>
            <Text style={styles.provenanceValue}>
              {article.impact_score}/100 · {article.high_impact ? "high impact" : "standard"}
            </Text>
          </View>
        </View>

        {article.url ? (
          <Pressable
            onPress={() => void Linking.openURL(article.url)}
            style={styles.openButton}
            accessibilityRole="button"
            accessibilityLabel="Open the original article"
          >
            <Ionicons name="open-outline" size={17} color="#09111F" />
            <Text style={styles.openButtonText}>Read the original article</Text>
          </Pressable>
        ) : (
          <Text style={styles.stateText}>
            This source did not supply a link, so the original cannot be opened.
          </Text>
        )}

        <Text style={styles.disclaimer}>
          Source-grounded news summary. AnalyzerX does not invent facts; anything the source did not
          state is marked as unavailable.
        </Text>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 48, paddingTop: 12 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  when: { color: amber, fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },
  toneChip: { borderWidth: 1, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3 },
  toneText: { fontSize: 9, fontWeight: "800" },
  headline: { color: "#F4F7FB", fontSize: 22, fontWeight: "800", lineHeight: 30, marginTop: 12 },
  sourceRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 12, flexWrap: "wrap" },
  sourceText: { color: muted, fontSize: 12, flexShrink: 1 },
  symbolPill: { backgroundColor: elevated, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  symbolText: { color: amber, fontSize: 10, fontWeight: "900" },
  impactCard: {
    flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: elevated,
    borderWidth: 1, borderColor: border, borderRadius: 14, padding: 14, marginTop: 16,
  },
  impactLabel: { color: muted, fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  impactValue: { color: amber, fontSize: 26, fontWeight: "900", marginTop: 2 },
  impactNote: { flex: 1 },
  impactNoteText: { color: muted, fontSize: 10, lineHeight: 15 },
  section: { marginTop: 20 },
  sectionTitle: { color: "#F4F7FB", fontSize: 15, fontWeight: "800", marginBottom: 7 },
  body: { color: "#C5D1DE", fontSize: 14, lineHeight: 22 },
  entityRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  entityPill: { backgroundColor: panel, borderWidth: 1, borderColor: border, borderRadius: 7, paddingHorizontal: 9, paddingVertical: 5 },
  entityPillText: { color: amber, fontSize: 10, fontWeight: "800" },
  provenanceRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 },
  provenanceLabel: { color: muted, fontSize: 12 },
  provenanceValue: { color: "#C5D1DE", fontSize: 12, flex: 1, textAlign: "right" },
  openButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    height: 50, borderRadius: 14, backgroundColor: amber, marginTop: 24,
  },
  openButtonText: { color: "#09111F", fontSize: 14, fontWeight: "800" },
  disclaimer: { color: muted, fontSize: 10, lineHeight: 15, marginTop: 18 },
  state: {
    alignItems: "center", gap: 9, backgroundColor: panel, borderWidth: 1,
    borderColor: border, borderRadius: 16, padding: 22, marginTop: 24,
  },
  stateTitle: { color: "#F4F7FB", fontSize: 16, fontWeight: "800", textAlign: "center" },
  stateText: { color: muted, fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 4 },
  stateButton: {
    marginTop: 14, borderWidth: 1, borderColor: amber, borderRadius: 10,
    paddingHorizontal: 18, paddingVertical: 10,
  },
  stateButtonText: { color: amber, fontSize: 13, fontWeight: "800" },
});
