/**
 * Natural-language screener panel.
 *
 * The engine (`lib/nl-screener.ts`) existed and was tested but had no UI. This is that
 * UI: type a sentence, see exactly how it was read, then run it.
 *
 * Two deliberate behaviours:
 *
 *  - The parse is shown BEFORE the run. A screener that silently misreads "RSI above 70"
 *    as "below" is worse than one that refuses, so the conditions are restated in words
 *    and anything unrecognised is listed rather than dropped.
 *  - Only the selected market's own seed symbols are screened, using that market's own
 *    price history. No symbol from another market is substituted.
 */
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { trpc } from "@/lib/trpc";
import { useMarketContext } from "@/lib/market-context";
import { seedUniverseForMarket } from "@/lib/market-universe";
import { parseScreen, runScreen, EXAMPLE_SCREENS, type ScreenerCandidate, type EvaluationResult } from "@/lib/nl-screener";

const amber = "#F4B860";
const teal = "#4FD1C5";
const coral = "#FB7185";
const violet = "#A78BFA";

/** Bounded so a run costs a handful of requests, not the whole universe. */
const MAX_CANDIDATES = 6;

export function NaturalLanguageScreenerPanel() {
  const { market, marketId } = useMarketContext();
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);

  const parsed = useMemo(() => (submitted ? parseScreen(submitted) : null), [submitted]);

  const symbols = useMemo(() => seedUniverseForMarket(marketId).slice(0, MAX_CANDIDATES), [marketId]);

  // One history query per candidate symbol, for the selected market only.
  const histories = trpc.useQueries((t) =>
    symbols.map((symbol) => t.market.history({ symbol, range: "6mo", interval: "1d", marketId }, { enabled: Boolean(submitted), retry: false, staleTime: 120_000 })),
  );

  const candidates: ScreenerCandidate[] = useMemo(
    () =>
      symbols.map((symbol, index) => ({
        symbol,
        marketId,
        bars: (histories[index]?.data?.bars ?? []) as ScreenerCandidate["bars"],
      })),
    [symbols, histories, marketId],
  );

  const results: EvaluationResult[] = useMemo(
    () => (parsed && parsed.conditions.length ? runScreen(parsed, candidates.filter((candidate) => candidate.bars.length)) : []),
    [parsed, candidates],
  );

  const loading = submitted !== null && histories.some((entry) => entry.isLoading);
  const anyBars = candidates.some((candidate) => candidate.bars.length > 0);

  const run = useCallback(() => {
    const next = query.trim();
    if (next) setSubmitted(next);
  }, [query]);

  const matched = results.filter((result) => result.matched);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>PLAIN-ENGLISH SCREEN</Text>
          <Text style={styles.title}>Describe what you are looking for</Text>
          <Text style={styles.note}>
            Write conditions in ordinary words. AnalyzerX reads them into explicit rules, shows you exactly how it read them, then checks this market's own symbols.
          </Text>
        </View>
        <Ionicons name="funnel-outline" size={22} color={amber} />
      </View>

      <View style={styles.inputRow}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={run}
          placeholder="RSI below 30 and price above 200-day EMA"
          placeholderTextColor="#6E7D92"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={styles.input}
          accessibilityLabel="Screen in plain English"
        />
        <Pressable onPress={run} disabled={!query.trim()} style={[styles.runButton, !query.trim() && styles.disabled]} accessibilityRole="button" accessibilityLabel="Run screen">
          <Text style={styles.runText}>Read</Text>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.exampleRow}>
        {EXAMPLE_SCREENS.map((example) => (
          <Pressable key={example} onPress={() => { setQuery(example); setSubmitted(example); }} style={styles.exampleChip} accessibilityRole="button" accessibilityLabel={`Use example ${example}`}>
            <Text style={styles.exampleText}>{example}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* The parse, shown before the result, so a misreading is visible. */}
      {parsed ? (
        <View style={styles.parseBlock}>
          <Text style={styles.parseTitle}>READ AS</Text>
          {parsed.conditions.length ? (
            parsed.conditions.map((condition, index) => (
              <View key={`${condition.source}-${index}`} style={styles.conditionRow}>
                <Ionicons name="checkmark-circle-outline" size={14} color={teal} />
                <Text style={styles.conditionText}>
                  {condition.indicator ?? condition.subject}
                  {condition.period ? ` (${condition.period})` : ""}
                  {condition.secondary ? ` vs ${condition.secondary}` : ""}{" "}
                  <Text style={styles.conditionComparator}>{condition.comparator}</Text>{" "}
                  {condition.lineVsLine ? <Text style={styles.conditionComparator}>the {condition.secondary ?? "line"}</Text> : condition.value}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.unparsed}>No conditions were recognised in that sentence.</Text>
          )}
          {parsed.unparsed.length ? (
            <View style={styles.unparsedBlock}>
              <Ionicons name="alert-circle-outline" size={14} color={coral} />
              <Text style={styles.unparsed}>
                Not understood, and therefore not used: {parsed.unparsed.join(" · ")}
              </Text>
            </View>
          ) : null}
          {parsed.conditions.length ? <Text style={styles.summary}>Runs as: {parsed.summary}</Text> : null}
        </View>
      ) : null}

      {/* Results */}
      {parsed && parsed.conditions.length ? (
        <View style={styles.resultsBlock}>
          <View style={styles.resultsHeader}>
            <Text style={styles.resultsTitle}>
              {loading ? "Checking…" : `${matched.length} of ${results.length} match`}
            </Text>
            <Text style={styles.resultsScope}>{symbols.length} symbols · {market.country}</Text>
          </View>
          {loading ? <ActivityIndicator color={amber} style={styles.spinner} /> : null}
          {!loading && !anyBars ? (
            <Text style={styles.emptyText}>
              No price history came back for this market's symbols, so nothing could be evaluated. AnalyzerX shows no result rather than another market's.
            </Text>
          ) : null}
          {!loading
            ? results.map((result) => (
                <View key={result.symbol} style={[styles.resultRow, result.matched && styles.resultRowMatch]}>
                  <View style={styles.resultTop}>
                    <Text style={[styles.resultSymbol, result.matched && { color: teal }]}>{result.symbol}</Text>
                    <Text style={styles.resultCount}>
                      {result.passedCount}/{result.outcomes.length} passed
                      {result.undefinedCount ? ` · ${result.undefinedCount} undefined` : ""}
                    </Text>
                  </View>
                  {result.outcomes.map((outcome, index) => (
                    <Text key={index} style={[styles.outcomeText, outcome.passed === true ? styles.pass : outcome.passed === false ? styles.fail : styles.unknown]}>
                      {outcome.passed === true ? "✓" : outcome.passed === false ? "✕" : "?"} {outcome.detail}
                    </Text>
                  ))}
                </View>
              ))
            : null}
          <Text style={styles.footnote}>
            A "?" means the indicator had too few bars to be defined, so the symbol was excluded rather than counted as a match.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 14, padding: 14, borderRadius: 16, backgroundColor: "#111C2D", borderWidth: 1, borderColor: "#26364D" },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  headerCopy: { flex: 1 },
  eyebrow: { color: amber, fontSize: 9, letterSpacing: 1.1, fontWeight: "800" },
  title: { color: "#F4F7FB", fontSize: 16, fontWeight: "800", marginTop: 4 },
  note: { color: "#91A2B8", fontSize: 10, lineHeight: 15, marginTop: 5 },
  inputRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  input: { flex: 1, minWidth: 0, height: 42, borderRadius: 10, backgroundColor: "#0B1423", borderWidth: 1, borderColor: "#31435B", color: "#F4F7FB", paddingHorizontal: 11, fontSize: 12 },
  runButton: { borderRadius: 10, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", backgroundColor: amber },
  runText: { color: "#09111F", fontSize: 11, fontWeight: "900" },
  disabled: { opacity: 0.45 },
  exampleRow: { gap: 7, paddingVertical: 11 },
  exampleChip: { borderWidth: 1, borderColor: "#31435B", borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "#0E1A2A" },
  exampleText: { color: "#91A2B8", fontSize: 9 },
  parseBlock: { marginTop: 4, paddingTop: 11, borderTopWidth: 1, borderTopColor: "#26364D" },
  parseTitle: { color: "#6E7D92", fontSize: 8, letterSpacing: 1, fontWeight: "900", marginBottom: 7 },
  conditionRow: { flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 4 },
  conditionText: { color: "#F4F7FB", fontSize: 11, flex: 1 },
  conditionComparator: { color: amber, fontWeight: "900" },
  unparsedBlock: { flexDirection: "row", gap: 7, alignItems: "flex-start", marginTop: 9, padding: 9, borderRadius: 9, backgroundColor: "#2C1823", borderWidth: 1, borderColor: "#6C3045" },
  unparsed: { color: "#E4A9B8", fontSize: 10, lineHeight: 15, flex: 1 },
  summary: { color: teal, fontSize: 10, marginTop: 9 },
  resultsBlock: { marginTop: 13, paddingTop: 11, borderTopWidth: 1, borderTopColor: "#26364D" },
  resultsHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  resultsTitle: { color: "#F4F7FB", fontSize: 13, fontWeight: "800" },
  resultsScope: { color: "#6E7D92", fontSize: 9 },
  spinner: { marginTop: 12 },
  emptyText: { color: "#91A2B8", fontSize: 10, lineHeight: 15, marginTop: 10 },
  resultRow: { marginTop: 10, padding: 11, borderRadius: 11, backgroundColor: "#0E1A2A", borderWidth: 1, borderColor: "#26364D" },
  resultRowMatch: { borderColor: "#2D5657", backgroundColor: "#102B2C" },
  resultTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 },
  resultSymbol: { color: "#F4F7FB", fontSize: 12, fontWeight: "900" },
  resultCount: { color: "#6E7D92", fontSize: 9 },
  outcomeText: { fontSize: 10, lineHeight: 15, marginTop: 3 },
  pass: { color: teal },
  fail: { color: coral },
  unknown: { color: violet },
  footnote: { color: "#6E7D92", fontSize: 9, lineHeight: 14, marginTop: 12 },
});
