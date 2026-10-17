import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { router } from "@/lib/navigation/router";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
import { useMarketContext } from "@/lib/market-context";
import { datasetForMarket } from "@/lib/market-dataset";
import {
  Divider,
  EmptyState,
  Meter,
  Pill,
  SectionHeader,
  Sparkline,
  Stat,
  Surface,
} from "@/components/ui/premium";
import { color, radius, space, type } from "@/lib/design/tokens";

export default function SectorsScreen() {
  const { marketId } = useMarketContext();
  const dataset = useMemo(() => datasetForMarket(marketId), [marketId]);
  const [rankingMode, setRankingMode] = useState<"buying" | "fii" | "dii">("buying");
  const institutionalQuery = trpc.market.institutionalFlows.useQuery({ marketId }, { retry: false, staleTime: 60_000 });
  const rankedProfiles = useMemo(
    () => [...dataset.opportunities].sort((a, b) => b[rankingMode] - a[rankingMode]),
    [dataset.opportunities, rankingMode],
  );
  const strongestFlow = dataset.flows.slice().sort((a, b) => b.value - a.value)[0];

  // The hero used to show a hardcoded 82/100 with a fixed "+7 pts" note and a fixed sparkline, which
  // presented invented numbers as a live signal. It is derived from the sector scores the dataset
  // actually carries. No week-on-week delta is shown because no historical series exists to compute
  // one — showing one would be fabricating a figure.
  const marketSignal = useMemo(() => {
    const scores = dataset.sectors.map((sector) => sector.score);
    if (scores.length === 0) return null;
    const mean = scores.reduce((sum, value) => sum + value, 0) / scores.length;
    return {
      score: Math.round(mean),
      spark: scores,
      above: scores.filter((value) => value >= 80).length,
      total: scores.length,
      spread: Math.round(Math.max(...scores) - Math.min(...scores)),
    };
  }, [dataset.sectors]);

  const flowStatus = institutionalQuery.data?.status;
  const flowTone = flowStatus === "fresh" ? "confirmed" : flowStatus === "stale" ? "accent" : "alert";
  const flowLabel = institutionalQuery.isLoading
    ? "Loading"
    : (institutionalQuery.data?.freshnessLabel ?? "Unavailable");

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <SectionHeader
          eyebrow="Pattern map"
          title="Sectors"
          trailing={
            <Pressable
              onPress={() =>
                setRankingMode((current) => (current === "buying" ? "fii" : current === "fii" ? "dii" : "buying"))
              }
              accessibilityLabel="Cycle sector ranking"
              style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.72 }]}
            >
              <Ionicons name="options-outline" size={19} color={color.text} />
            </Pressable>
          }
        />
        <Text style={styles.subtitle}>
          Where buying is strongest, institutional capital is concentrating, and upcoming catalysts are forming.
        </Text>

        {!dataset.supported ? (
          <EmptyState title={dataset.notice} detail="This market has no curated sector dataset." tone="alert" />
        ) : null}

        {/* The subject of the screen: one figure, the market-wide signal. */}
        <Surface level="high" pad="xl" style={styles.hero}>
          <View style={styles.heroRow}>
            <Stat
              label="Market-wide signal"
              value={marketSignal ? String(marketSignal.score) : "--"}
              unit="/ 100"
              tint={color.score}
              note={
                marketSignal
                  ? `${marketSignal.above} of ${marketSignal.total} sectors above 80 · spread ${marketSignal.spread}`
                  : "No sector scores for this market"
              }
            />
            {marketSignal ? <Sparkline values={marketSignal.spark} tint={color.score} height={72} /> : null}
          </View>
        </Surface>

        <Surface level="card" pad="lg" style={styles.radar}>
          <SectionHeader
            eyebrow="Opportunity radar"
            title="Category strength"
            trailing={<Pill label="Research signal" tone="confirmed" dot />}
          />
          <Text style={styles.radarNote}>
            Rankings combine observed buying flows, institutional concentration, event momentum and catalyst
            evidence. They are not guaranteed returns.
          </Text>

          <View style={styles.statusRow}>
            <Pill label={`NSE FII/FPI + DII · ${flowLabel}`} tone={flowTone} dot />
            <Text style={styles.statusText}>
              Sector scores remain research signals until sector-level live data is connected.
            </Text>
          </View>

          <View style={styles.tabs}>
            {([["buying", "Strong buying"], ["fii", "FII weight"], ["dii", "DII weight"]] as const).map(([key, label]) => {
              const active = rankingMode === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setRankingMode(key)}
                  style={[styles.tab, active && styles.tabActive]}
                >
                  <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          {rankedProfiles.map((profile, index) => (
            <View key={profile.name} style={styles.opportunityRow}>
              <View style={[styles.rankBadge, { backgroundColor: `${profile.color}22` }]}>
                <Text style={[styles.rankText, { color: profile.color }]}>{String(index + 1).padStart(2, "0")}</Text>
              </View>
              <View style={styles.opportunityCopy}>
                <View style={styles.opportunityTitleRow}>
                  <Text style={styles.opportunityName}>{profile.name}</Text>
                  <Text style={[styles.opportunityScore, { color: profile.color }]}>{profile[rankingMode]}</Text>
                </View>
                <Meter value={profile[rankingMode]} tint={profile.color} />
                <Text style={styles.opportunityEvidence}>{profile.evidence}</Text>
                <View style={styles.opportunityMeta}>
                  <Text style={[styles.meta, { color: color.confirmed }]}>Catalyst · {profile.catalyst}</Text>
                  <Text style={[styles.meta, { color: color.alert }]}>Risk · {profile.risk}</Text>
                </View>
              </View>
            </View>
          ))}

          <Divider />
          <View style={styles.flowCallout}>
            <Ionicons name="flash-outline" size={15} color={color.score} />
            <Text style={styles.flowCalloutText}>
              {strongestFlow
                ? `Largest observed signal: ${strongestFlow.category} · ${strongestFlow.entity} · ${strongestFlow.valueLabel}`
                : `No flow signal for ${dataset.marketId} yet.`}
            </Text>
          </View>
        </Surface>

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Active sectors</Text>
          <Text style={styles.sectionHint}>
            {dataset.supported ? `${dataset.marketId} seed dataset` : "Unavailable"}
          </Text>
        </View>

        {dataset.sectors.map((sector) => (
          <Pressable
            key={sector.name}
            onPress={() => router.push({ pathname: "/sector/[name]", params: { name: sector.name } })}
            style={({ pressed }) => [styles.sectorCard, pressed && { opacity: 0.72 }]}
          >
            <View style={[styles.sectorDot, { backgroundColor: sector.color }]} />
            <View style={styles.sectorCopy}>
              <Text style={styles.sectorName}>{sector.name}</Text>
              <Text style={styles.sectorNote}>{sector.note}</Text>
              <Meter value={sector.score} tint={sector.color} caption={sector.activity} />
            </View>
            <View style={styles.sectorScore}>
              <Text style={[styles.scoreNumber, { color: sector.color }]}>{sector.score}</Text>
              <Ionicons name="chevron-forward" size={17} color={color.textFaint} />
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.xl, paddingBottom: space.huge },
  iconButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.md,
  },
  subtitle: { ...type.body, color: color.textMuted, marginTop: space.md },
  hero: { marginTop: space.xl, borderColor: color.borderStrong },
  heroRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: space.lg },
  radar: { marginTop: space.xl },
  radarNote: { ...type.caption, color: color.textMuted, lineHeight: 16 },
  statusRow: { gap: space.sm, marginTop: space.md },
  statusText: { ...type.micro, color: color.textFaint, fontWeight: "600", letterSpacing: 0.2 },
  tabs: { flexDirection: "row", gap: space.sm, paddingVertical: space.md },
  tab: {
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  tabActive: { backgroundColor: color.accent, borderColor: color.accent },
  tabText: { ...type.micro, color: color.textMuted },
  tabTextActive: { color: color.onAccent },
  opportunityRow: { flexDirection: "row", gap: space.md, marginBottom: space.md },
  rankBadge: { width: 28, height: 28, borderRadius: radius.xs, alignItems: "center", justifyContent: "center" },
  rankText: { ...type.micro },
  opportunityCopy: { flex: 1, gap: space.xs },
  opportunityTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  opportunityName: { ...type.label, color: color.text },
  opportunityScore: { ...type.figure, fontSize: 15, lineHeight: 18 },
  opportunityEvidence: { ...type.caption, color: color.textMuted, marginTop: space.xs },
  opportunityMeta: { flexDirection: "row", gap: space.sm, flexWrap: "wrap", marginTop: space.xs },
  meta: { ...type.micro, fontWeight: "700" },
  flowCallout: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.md },
  flowCalloutText: { ...type.micro, color: color.score, flex: 1 },
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginTop: space.xxl,
    marginBottom: space.md,
  },
  sectionTitle: { ...type.title, color: color.text },
  sectionHint: { ...type.micro, color: color.textFaint },
  sectorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.lg,
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    marginBottom: space.md,
  },
  sectorDot: { width: 10, height: 10, borderRadius: 5 },
  sectorCopy: { flex: 1, gap: space.xs },
  sectorName: { ...type.label, color: color.text },
  sectorNote: { ...type.micro, color: color.textMuted, fontWeight: "600", letterSpacing: 0.2 },
  sectorScore: { alignItems: "flex-end", gap: space.sm },
  scoreNumber: { ...type.figure, fontSize: 18, lineHeight: 22 },
});
