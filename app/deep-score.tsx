import { useEffect, useState } from "react";
import { useMarketContext } from "@/lib/market-context";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { ScreenContainer } from "@/components/screen-container";
import { KeyboardAwareScrollView } from "@/components/keyboard-aware-scroll-view";
import { SkeletonList } from "@/components/skeleton";
import { AnimatedPressable } from "@/components/motion";
import { trpc } from "@/lib/trpc";

/**
 * Institutional Deep Score (Engine A).
 *
 * Renders the composite, confidence, grade, pillar breakdown, per-metric
 * explainability, risk-overlay penalties and unavailable metrics — and states
 * plainly whether percentiles came from sector peers or the labelled absolute
 * anchors, so the number is never presented as more than it is.
 */

const colors = { background: "#07101F", panel: "#111C2D", border: "#26364D", text: "#F4F7FB", muted: "#91A2B8", amber: "#F4B860", teal: "#4FD1C5", coral: "#FB7185" };

function gradeColor(grade: string): string {
  if (grade === "A+" || grade === "A") return colors.teal;
  if (grade === "B") return colors.amber;
  if (grade === "Provisional") return colors.muted;
  return colors.coral;
}

export default function DeepScoreScreen() {
  const { market } = useMarketContext();
  const params = useLocalSearchParams<{ symbol?: string }>();
  const initialSymbol = typeof params.symbol === "string" ? params.symbol.trim().toUpperCase() : "";
  const [symbol, setSymbol] = useState(initialSymbol);
  const deepScore = trpc.scoring.deepScore.useMutation();
  const data = deepScore.data;

  // Score the symbol handed over from the company screen on first open.
  useEffect(() => {
    if (initialSymbol) deepScore.mutate({ symbol: initialSymbol, marketId: market.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = () => {
    const clean = symbol.trim().toUpperCase();
    if (!clean) return;
    deepScore.mutate({ symbol: clean, marketId: market.id });
  };

  return (
    <ScreenContainer className="px-5" edges={["top", "left", "right", "bottom"]}>
      <KeyboardAwareScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={21} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>INSTITUTIONAL SCORING</Text>
            <Text style={styles.title}>Deep Score</Text>
          </View>
        </View>

        <View style={styles.hero}>
          <Ionicons name="analytics-outline" size={22} color={colors.amber} />
          <Text style={styles.heroText}>
            A multi-pillar, sector-relative fundamental and technical score with a confidence value and a full explanation. Every number is reproducible from a versioned config — no black box.
          </Text>
        </View>

        <View style={styles.searchRow}>
          <TextInput
            value={symbol}
            onChangeText={setSymbol}
            placeholder="Try RELIANCE, TCS, HDFCBANK…"
            placeholderTextColor={colors.muted}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={run}
            style={styles.input}
          />
          <AnimatedPressable haptic="medium" onPress={run} disabled={!symbol.trim() || deepScore.isPending} style={[styles.runButton, (!symbol.trim() || deepScore.isPending) && styles.disabled]}>
            <Ionicons name="flash-outline" size={16} color="#09111F" />
            <Text style={styles.runText}>{deepScore.isPending ? "Scoring…" : "Score"}</Text>
          </AnimatedPressable>
        </View>

        {deepScore.isPending ? <SkeletonList rows={4} /> : null}

        {deepScore.error ? (
          <View style={styles.error}><Ionicons name="warning-outline" size={17} color={colors.coral} /><Text style={styles.errorText}>{deepScore.error.message}</Text></View>
        ) : null}

        {data ? (
          <>
            <View style={styles.scoreCard}>
              <View style={styles.scoreTop}>
                <View>
                  <Text style={styles.scoreSymbol}>{data.resolvedSymbol}</Text>
                  <Text style={styles.scoreName} numberOfLines={1}>{data.companyName}</Text>
                  <Text style={styles.scoreMarket}>{data.market.exchange} · {data.market.currency}</Text>
                </View>
                <View style={styles.scoreValueWrap}>
                  <Text style={[styles.scoreValue, { color: gradeColor(data.result.grade) }]}>{data.result.score === null ? "—" : Math.round(data.result.score)}</Text>
                  <Text style={[styles.scoreGrade, { color: gradeColor(data.result.grade) }]}>{data.result.grade}</Text>
                </View>
              </View>
              <Text style={styles.scoreMeaning}>{data.result.gradeMeaning}</Text>
              <View style={styles.metricsRow}>
                <Metric label="CONFIDENCE" value={`${Math.round(data.result.confidence * 100)}%`} />
                <Metric label="PRE-OVERLAY" value={data.result.preOverlayScore === null ? "—" : `${Math.round(data.result.preOverlayScore)}`} />
                <Metric label="OVERLAY" value={`${data.result.overlayTotal}`} />
                <Metric label="ENGINE" value={`v${data.result.configVersion}`} />
              </View>
            </View>

            <Text style={styles.note}>
              {data.result.peerSource === "sector"
                ? "Percentiles are sector-relative (peer samples supplied)."
                : data.result.peerSource === "mixed"
                  ? "Percentiles mix sector peers and absolute anchors."
                  : "No sector peer store is connected yet, so percentiles use the engine's labelled absolute anchors — treat the score as indicative, not sector-relative."}
            </Text>

            <Text style={styles.sectionLabel}>PILLARS</Text>
            <View style={styles.card}>
              {data.result.pillars.map((pillar) => (
                <View key={pillar.key} style={styles.pillarRow}>
                  <View style={styles.pillarHead}>
                    <Text style={styles.pillarName}>{pillar.label}</Text>
                    <Text style={styles.pillarScore}>{pillar.score === null ? "—" : Math.round(pillar.score)}</Text>
                  </View>
                  <View style={styles.barTrack}><View style={[styles.barFill, { width: `${Math.max(2, pillar.score ?? 0)}%` }]} /></View>
                  <Text style={styles.pillarMeta}>{pillar.metricsAvailable}/{pillar.metricsTotal} metrics · weight {(pillar.weight * 100).toFixed(0)}% · confidence {Math.round(pillar.confidence * 100)}%</Text>
                </View>
              ))}
            </View>

            {data.result.overlayPenalties.length ? (
              <>
                <Text style={styles.sectionLabel}>RISK OVERLAY</Text>
                <View style={styles.card}>
                  {data.result.overlayPenalties.map((penalty) => (
                    <View key={penalty.id} style={styles.overlayRow}>
                      <Text style={[styles.overlayPenalty, { color: colors.coral }]}>{penalty.penalty}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.overlayLabel}>{penalty.label}</Text>
                        <Text style={styles.overlayDesc}>{penalty.description}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            <Text style={styles.sectionLabel}>WHAT DRIVES THE SCORE</Text>
            <View style={styles.card}>
              {data.result.contributions.filter((item) => item.available).slice(0, 12).map((item) => (
                <View key={item.key} style={styles.contributionRow}>
                  <Text style={styles.contributionName} numberOfLines={1}>{item.label}</Text>
                  <Text style={styles.contributionRaw}>{item.rawValue === null ? "—" : item.rawValue.toLocaleString()}</Text>
                  <Text style={[styles.contributionPct, { color: (item.contribution ?? 0) >= 0 ? colors.teal : colors.coral }]}>
                    {item.contribution >= 0 ? "+" : ""}{item.contribution.toFixed(1)}
                  </Text>
                </View>
              ))}
            </View>

            {data.result.unavailable.length ? (
              <>
                <Text style={styles.sectionLabel}>NOT SCORED</Text>
                <View style={styles.card}>
                  {data.result.unavailable.slice(0, 12).map((item) => (
                    <Text key={item.key} style={styles.unavailableLine}>• {item.label}: {item.reason}</Text>
                  ))}
                </View>
              </>
            ) : null}

            <Text style={styles.disclaimer}>
              This is educational analytics, not investment advice or a buy/sell recommendation. Verify every figure against the latest official filings.
            </Text>
          </>
        ) : null}
      </KeyboardAwareScrollView>
    </ScreenContainer>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 48 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 8, paddingBottom: 16 },
  back: { width: 42, height: 42, borderRadius: 13, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  eyebrow: { color: colors.amber, fontSize: 10, fontWeight: "900", letterSpacing: 1.3 },
  title: { color: colors.text, fontSize: 27, fontWeight: "900", marginTop: 2 },
  hero: { flexDirection: "row", gap: 12, backgroundColor: "#162639", borderWidth: 1, borderColor: "#315064", borderRadius: 17, padding: 15, marginBottom: 14 },
  heroText: { flex: 1, color: colors.muted, fontSize: 11, lineHeight: 16 },
  searchRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  input: { flex: 1, height: 46, borderWidth: 1, borderColor: colors.border, borderRadius: 11, paddingHorizontal: 12, color: colors.text, backgroundColor: "#0B1422", fontSize: 13 },
  runButton: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.amber, borderRadius: 11, paddingHorizontal: 16, justifyContent: "center" },
  runText: { color: "#09111F", fontSize: 12, fontWeight: "900" },
  disabled: { opacity: 0.45 },
  error: { flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: "#2A1A22", borderWidth: 1, borderColor: "#FB718566", borderRadius: 12, padding: 12, marginBottom: 12 },
  errorText: { flex: 1, color: "#FDA4AF", fontSize: 11, lineHeight: 16 },
  scoreCard: { borderWidth: 1, borderColor: "#2D766F", backgroundColor: "#102B31", borderRadius: 18, padding: 16, marginBottom: 12 },
  scoreTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  scoreSymbol: { color: colors.text, fontSize: 18, fontWeight: "900" },
  scoreName: { color: colors.muted, fontSize: 11, marginTop: 3, maxWidth: 200 },
  scoreMarket: { color: colors.muted, fontSize: 10, marginTop: 3 },
  scoreValueWrap: { alignItems: "flex-end" },
  scoreValue: { fontSize: 42, fontWeight: "900", lineHeight: 46 },
  scoreGrade: { fontSize: 13, fontWeight: "900", letterSpacing: 1 },
  scoreMeaning: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 10 },
  metricsRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#2D766F" },
  metric: { alignItems: "center" },
  metricLabel: { color: colors.muted, fontSize: 8, fontWeight: "800", letterSpacing: 0.7 },
  metricValue: { color: colors.text, fontSize: 13, fontWeight: "900", marginTop: 4 },
  note: { color: colors.muted, fontSize: 10, lineHeight: 15, marginBottom: 6 },
  sectionLabel: { color: colors.amber, fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginTop: 18, marginBottom: 8 },
  card: { borderWidth: 1, borderColor: colors.border, backgroundColor: "#0D1728", borderRadius: 16, padding: 14, gap: 10 },
  pillarRow: { gap: 6 },
  pillarHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  pillarName: { color: colors.text, fontSize: 12, fontWeight: "800", flex: 1 },
  pillarScore: { color: colors.text, fontSize: 13, fontWeight: "900" },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: "#1B2A40", overflow: "hidden" },
  barFill: { height: 6, borderRadius: 3, backgroundColor: colors.teal },
  pillarMeta: { color: colors.muted, fontSize: 9 },
  overlayRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  overlayPenalty: { fontSize: 14, fontWeight: "900", width: 34 },
  overlayLabel: { color: colors.text, fontSize: 11, fontWeight: "800" },
  overlayDesc: { color: colors.muted, fontSize: 9, lineHeight: 13, marginTop: 2 },
  contributionRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  contributionName: { flex: 1, color: colors.text, fontSize: 11, fontWeight: "700" },
  contributionRaw: { color: colors.muted, fontSize: 10, width: 80, textAlign: "right" },
  contributionPct: { fontSize: 11, fontWeight: "900", width: 48, textAlign: "right" },
  unavailableLine: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  disclaimer: { color: "#6E7D92", fontSize: 9, lineHeight: 14, textAlign: "center", marginTop: 20 },
});
