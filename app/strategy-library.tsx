import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";

import { ScreenContainer } from "@/components/screen-container";
import { useMarketContext } from "@/lib/market-context";
import { getMarketProfile } from "@/lib/market-regions";
import { COMPLIANCE_NOTICE } from "@/lib/quant/compliance";
import { parseFundamentals } from "@/lib/quant/fundamentals-io";
import { describeRequirements, runLibraryEntry, runModel, RUNNABLE_MODELS, type LibraryRun, type MarketUniverse, type ModelRun } from "@/lib/quant/library-run";
import { MODEL_CATEGORIES, catalogueStats, modelsByCategory } from "@/lib/quant/model-catalogue";
import type { Fundamentals } from "@/lib/quant/fundamentals";
import { SUPPLY_CHAIN_THEMES, screenSupplyChain, themeRolesByLayer } from "@/lib/quant/supply-chain";
import { FAMILY_LABELS, STRATEGY_LIBRARY, findLibraryEntry, libraryByFamily, libraryStats, type LibraryEntry, type StrategyFamily } from "@/lib/quant/strategy-library";

const ink = "#09111F";
const panel = "#111C2D";
const raised = "#17253A";
const text = "#F4F7FB";
const muted = "#91A2B8";
const amber = "#F4B860";
const teal = "#4FD1C5";
const violet = "#A78BFA";
const coral = "#FB7185";
const divider = "#26364D";


/** A small, clearly-labelled synthetic universe so the screens can be exercised offline. */
function demoPriors(): Record<string, Fundamentals> {
  return {
    "DEMO-CHEAP": { symbol: "DEMO-CHEAP", netIncome: 70, totalAssets: 880, operatingCashFlow: 60, longTermDebt: 160, currentAssets: 420, currentLiabilities: 210, sharesOutstanding: 100, revenue: 860, grossProfit: 300, receivables: 180, costOfRevenue: 560, depreciation: 40, sellingGeneralAdmin: 80, propertyPlantEquipment: 260 },
    "DEMO-COOL": { symbol: "DEMO-COOL", netIncome: 90, totalAssets: 2_100, operatingCashFlow: 80, longTermDebt: 300, currentAssets: 900, currentLiabilities: 400, sharesOutstanding: 40, revenue: 1_900, grossProfit: 700, receivables: 300, costOfRevenue: 1_200, depreciation: 60, sellingGeneralAdmin: 150, propertyPlantEquipment: 500 },
  };
}

function demoUniverse(): MarketUniverse["companies"] {
  return [
    { symbol: "DEMO-CHEAP", name: "Demo Cheap Industrials", sector: "Capital goods", description: "industrial machinery and electrical equipment", price: 100, eps: 10, bookValuePerShare: 80, currentAssets: 500, currentLiabilities: 200, totalDebt: 100, equity: 400, marketCap: 1_000, netIncome: 80, ebit: 120, roic: 0.18, revenueGrowth: 0.14, epsGrowth: 0.16, operatingCashFlow: 75, totalAssets: 900 },
    { symbol: "DEMO-RICH", name: "Demo Expensive Tech", sector: "Semiconductor equipment", description: "lithography and wafer fab equipment", price: 400, eps: 4, bookValuePerShare: 40, marketCap: 8_000, netIncome: 80, ebit: 100, roic: 0.09, revenueGrowth: 0.22, epsGrowth: 0.05 },
    { symbol: "DEMO-COOL", name: "Demo Thermal Systems", sector: "Thermal management", description: "liquid cooling and heat exchangers for data centers", price: 60, eps: 3, bookValuePerShare: 25, marketCap: 2_400, netIncome: 120, ebit: 160, roic: 0.21, revenueGrowth: 0.31, epsGrowth: 0.28 },
    { symbol: "DEMO-POWER", name: "Demo Grid Utilities", sector: "Utilities", description: "power generation and transmission grid", price: 55, eps: 4, bookValuePerShare: 40, marketCap: 5_000, netIncome: 300, ebit: 420, roic: 0.11, revenueGrowth: 0.06, epsGrowth: 0.07 },
  ];
}

export default function StrategyLibraryScreen() {
  const { marketId } = useMarketContext();
  const [family, setFamily] = useState<StrategyFamily | "all" | "implemented">("implemented");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>("little-book-beats-market");
  const [raw, setRaw] = useState("");
  const [universe, setUniverse] = useState<MarketUniverse | null>(null);
  const [dataNote, setDataNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [themeId, setThemeId] = useState(SUPPLY_CHAIN_THEMES[0].id);
  const [busy, setBusy] = useState(false);

  const [modelId, setModelId] = useState<string>(RUNNABLE_MODELS[0]);

  const stats = useMemo(() => libraryStats(), []);
  const groups = useMemo(() => libraryByFamily(), []);
  const modelStats = useMemo(() => catalogueStats(), []);
  const modelGroups = useMemo(() => modelsByCategory(), []);
  const modelRun = useMemo<ModelRun | null>(() => runModel(modelId, { marketId, universe }), [modelId, marketId, universe]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = family === "all" ? STRATEGY_LIBRARY : family === "implemented" ? STRATEGY_LIBRARY.filter((entry) => entry.implemented) : STRATEGY_LIBRARY.filter((entry) => entry.family === family);
    if (!q) return pool;
    return pool.filter((entry) => `${entry.title} ${entry.author} ${entry.idea}`.toLowerCase().includes(q));
  }, [family, query]);

  const selected = selectedId ? findLibraryEntry(selectedId) : null;

  const run = useMemo<LibraryRun | null>(() => (selected ? runLibraryEntry(selected, { marketId, universe }) : null), [selected, marketId, universe]);

  const supplyChain = useMemo(() => screenSupplyChain(themeId, universe?.companies ?? []), [themeId, universe]);
  const theme = SUPPLY_CHAIN_THEMES.find((entry) => entry.id === themeId) ?? SUPPLY_CHAIN_THEMES[0];

  const loadFundamentals = (value: string, label: string) => {
    setError(null);
    setRaw(value);
    const parsed = parseFundamentals(value);
    if (parsed.status === "error") {
      setUniverse(null);
      setDataNote(null);
      setError(`Could not read the fundamentals: ${parsed.reason}`);
      return;
    }
    // Tag with the market active at load time; if the market later changes, the runner refuses.
    setUniverse({ marketId, companies: parsed.companies, priors: parsed.priors });
    const parts = [`${label}: ${parsed.companies.length} company record(s), tagged ${getMarketProfile(marketId).country}.`];
    if (parsed.dropped > 0) parts.push(`${parsed.dropped} record(s) dropped.`);
    parts.push(...parsed.notes);
    setDataNote(parts.join(" "));
  };

  const onPaste = async () => {
    const value = await Clipboard.getStringAsync();
    if (!value?.trim()) {
      setError("The clipboard is empty.");
      return;
    }
    loadFundamentals(value, "Pasted fundamentals");
  };

  const onDemo = () => {
    setRaw("");
    setUniverse({ marketId, companies: demoUniverse(), priors: demoPriors() });
    setError(null);
    setDataNote(`Demo universe: 4 synthetic company records, tagged ${getMarketProfile(marketId).country}. These are NOT real company figures — they exist only to exercise the screens.`);
  };

  const openInBacktest = (spec: NonNullable<LibraryEntry["implemented"]>["spec"]) => {
    if (!spec) return;
    setBusy(true);
    router.push({ pathname: "/quant-lab", params: { prompt: spec.name } });
    setBusy(false);
  };

  return (
    <ScreenContainer className="px-5" edges={["top", "left", "right", "bottom"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={21} color={text} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>STRATEGY LAB</Text>
            <Text style={styles.title}>Book Strategy Library</Text>
          </View>
        </View>

        {/* Mandatory compliance badge — deliberately first and not dismissible. */}
        <View style={styles.compliance}>
          <Ionicons name="shield-checkmark" size={15} color={amber} />
          <Text style={styles.complianceText}>{COMPLIANCE_NOTICE}</Text>
        </View>

        <View style={styles.marketRow}>
          <Ionicons name="globe-outline" size={13} color={teal} />
          <Text style={styles.marketText}>
            Active market: {getMarketProfile(marketId).country} ({getMarketProfile(marketId).exchanges.join(", ")})
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>CATALOGUE</Text>
          <Text style={styles.meta}>
            {stats.total} books catalogued · {stats.implemented} with runnable logic · {stats.referenceOnly} reference-only. A reference-only book has no algorithm implemented, so
            it is labelled as such rather than returning an empty screen that looks like a result.
          </Text>
          <TextInput value={query} onChangeText={setQuery} placeholder="Search title, author or idea" placeholderTextColor="#5C6B80" style={styles.input} autoCapitalize="none" autoCorrect={false} />
          <View style={styles.chipRow}>
            <Chip label={`Implemented (${stats.implemented})`} active={family === "implemented"} onPress={() => setFamily("implemented")} tone={teal} />
            <Chip label={`All (${stats.total})`} active={family === "all"} onPress={() => setFamily("all")} />
            {groups.map((group) => (
              <Chip key={group.family} label={`${FAMILY_LABELS[group.family].split(" ")[0]} (${group.entries.length})`} active={family === group.family} onPress={() => setFamily(group.family)} />
            ))}
          </View>
          <View style={styles.list}>
            {visible.slice(0, 40).map((entry) => (
              <Pressable key={entry.id} onPress={() => setSelectedId(entry.id)} style={({ pressed }) => [styles.row, entry.id === selectedId && styles.rowActive, pressed && styles.pressed]}>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle} numberOfLines={2}>{entry.title}</Text>
                  <Text style={styles.rowAuthor} numberOfLines={1}>{entry.author} · {FAMILY_LABELS[entry.family]}</Text>
                </View>
                <View style={[styles.badge, { borderColor: entry.implemented ? teal : "#3A4A61" }]}>
                  <Text style={[styles.badgeText, { color: entry.implemented ? teal : muted }]}>{entry.implemented ? "RUNNABLE" : "REFERENCE"}</Text>
                </View>
              </Pressable>
            ))}
            {visible.length > 40 ? <Text style={styles.note}>{visible.length - 40} more match — narrow the search.</Text> : null}
            {visible.length === 0 ? <Text style={styles.note}>Nothing matches that search.</Text> : null}
          </View>
        </View>

        {/* Fundamentals input */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>FUNDAMENTALS UNIVERSE</Text>
          <TextInput value={raw} onChangeText={(value) => loadFundamentals(value, "Pasted fundamentals")} placeholder='[{"symbol":"ACME","price":100,"eps":10,"bookValuePerShare":80,...}]' placeholderTextColor="#5C6B80" multiline style={styles.textArea} autoCapitalize="none" autoCorrect={false} />
          <View style={styles.rowGap}>
            <SmallButton icon="clipboard-outline" label="Paste from clipboard" onPress={() => void onPaste()} />
            <SmallButton icon="flask-outline" label="Load demo universe" onPress={onDemo} tone={violet} />
          </View>
          <Text style={styles.note}>
            Include a nested `prior` object on a record to enable the period-over-period models (Piotroski F-Score, Beneish M-Score).
          </Text>
          {dataNote ? <Text style={styles.note}>{dataNote}</Text> : null}
        </View>

        {/* Education panel + result */}
        {selected ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>EDUCATION &amp; RESULT</Text>
            <Text style={styles.detailTitle}>{selected.title}</Text>
            <Text style={styles.detailAuthor}>{selected.author} · {FAMILY_LABELS[selected.family]}</Text>
            <Text style={styles.detailIdea}>{selected.idea}</Text>
            <Text style={styles.detailMeta}>{describeRequirements(selected)}</Text>
            {selected.implemented ? (
              <View style={styles.metricRow}>
                {selected.implemented.metrics.map((metric) => (
                  <View key={metric} style={styles.metricPill}><Text style={styles.metricPillText}>{metric}</Text></View>
                ))}
              </View>
            ) : null}

            {run?.kind === "unavailable" ? <Text style={styles.warn}>{run.reason}</Text> : null}

            {run?.kind === "spec" ? (
              <View style={styles.resultBlock}>
                <Text style={styles.resultHeading}>Rule set (price-driven)</Text>
                <Text style={styles.mono}>{run.spec.name}</Text>
                <SmallButton icon="play-outline" label="Open in Backtest" onPress={() => openInBacktest(selected.implemented?.spec)} tone={amber} />
                {busy ? <ActivityIndicator color={amber} /> : null}
              </View>
            ) : null}

            {run?.kind === "screen" ? (
              <View style={styles.resultBlock}>
                <Text style={styles.resultHeading}>Screening rationale — {run.passed} of {run.evaluated} passed every criterion</Text>
                {run.outcomes.slice(0, 12).map((outcome) => (
                  <View key={outcome.symbol} style={styles.screenRow}>
                    <View style={styles.screenHead}>
                      <Text style={styles.screenSymbol}>{outcome.symbol}</Text>
                      <Text style={[styles.screenScore, { color: outcome.passed ? teal : muted }]}>{outcome.passedCount}/{outcome.total}</Text>
                    </View>
                    {outcome.criteria.map((criterion) => (
                      <Text key={criterion.key} style={styles.criterion}>
                        <Text style={{ color: criterion.passed ? teal : coral }}>{criterion.passed ? "✓" : "✗"} </Text>
                        {criterion.label} — {criterion.value === null ? "not evaluable" : criterion.value.toFixed(3)} ({criterion.threshold})
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            ) : null}

            {run?.kind === "rank" ? (
              <View style={styles.resultBlock}>
                <Text style={styles.resultHeading}>Magic Formula ranking — ROIC rank + earnings-yield rank, lowest combined wins</Text>
                {run.ranked.slice(0, 12).map((row, index) => (
                  <Text key={row.symbol} style={styles.mono}>
                    {index + 1}. {row.symbol} — ROIC #{row.roicRank}, yield #{row.earningsYieldRank}, combined {row.combinedRank}, score {row.score.toFixed(1)}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Quantitative model catalogue and runner */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>MODEL CATALOGUE — {modelStats.implemented} OF {modelStats.total} RUNNABLE</Text>
          <Text style={styles.meta}>
            Every entry carries its actual formula. A model marked NOT IMPLEMENTED is one this engine does not run; it is labelled rather than given a plausible-looking formula.
          </Text>
          <View style={styles.chipRow}>
            {[...RUNNABLE_MODELS].map((id) => (
              <Chip key={id} label={id} active={id === modelId} onPress={() => setModelId(id)} tone={teal} />
            ))}
          </View>
          {modelRun?.kind === "unavailable" ? <Text style={styles.warn}>{modelRun.reason}</Text> : null}
          {modelRun?.kind === "scores" ? (
            <View style={styles.resultBlock}>
              <Text style={styles.resultHeading}>{modelRun.passed} of {modelRun.evaluated} passed · {modelRun.rows.length} scored</Text>
              {modelRun.rows.map((row) => (
                <View key={row.symbol} style={styles.screenRow}>
                  <View style={styles.screenHead}>
                    <Text style={styles.screenSymbol}>{row.symbol}</Text>
                    <Text style={[styles.screenScore, { color: row.passed ? teal : muted }]}>{row.headline}</Text>
                  </View>
                  {row.components.slice(0, 9).map((component) => (
                    <Text key={component.key} style={styles.criterion}>
                      <Text style={{ color: component.met ? teal : coral }}>{component.met ? "✓" : "✗"} </Text>
                      {component.label}{component.weight !== undefined ? ` (w ${component.weight})` : ""}
                      {component.value === null ? " — not evaluable" : ` — ${component.value.toFixed(3)}`}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          ) : null}
          {modelGroups.map((group) => (
            <View key={group.category} style={styles.resultBlock}>
              <Text style={styles.resultHeading}>{group.category} · {MODEL_CATEGORIES[group.category]}</Text>
              {group.models.map((model) => (
                <View key={model.id} style={styles.modelRow}>
                  <View style={[styles.badge, { borderColor: model.implemented ? teal : "#3A4A61" }]}>
                    <Text style={[styles.badgeText, { color: model.implemented ? teal : muted }]}>{model.implemented ? "RUNNABLE" : "NOT IMPL"}</Text>
                  </View>
                  <Text style={styles.modelText}>
                    <Text style={styles.modelName}>{model.name}</Text>
                    {"\n"}{model.formula}
                    {"\n"}{model.source}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>

        {/* Picks & shovels */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>PICKS &amp; SHOVELS — SUPPLY CHAIN</Text>
          <View style={styles.chipRow}>
            {SUPPLY_CHAIN_THEMES.map((entry) => (
              <Chip key={entry.id} label={entry.name} active={entry.id === themeId} onPress={() => setThemeId(entry.id)} tone={violet} />
            ))}
          </View>
          <Text style={styles.detailIdea}>{theme.description}</Text>
          {!universe ? <Text style={styles.note}>Load a fundamentals universe above — its sector and description text drives the classification.</Text> : null}
          {supplyChain ? (
            (["primary", "secondary", "tertiary"] as const).map((layer) => (
              <View key={layer} style={styles.resultBlock}>
                <Text style={styles.resultHeading}>{layer.toUpperCase()} layer — {themeRolesByLayer(theme)[layer].map((role) => role.label).join(", ")}</Text>
                {supplyChain.layers[layer].length === 0 ? (
                  <Text style={styles.note}>No candidate matched this layer.</Text>
                ) : (
                  supplyChain.layers[layer].map((item) => (
                    <Text key={item.candidate.symbol} style={styles.criterion}>
                      <Text style={{ color: teal }}>{item.candidate.symbol}</Text> — {item.candidate.name} · matched {item.matchedRoles.join(", ")} · confidence {item.confidence.toFixed(2)}
                    </Text>
                  ))
                )}
              </View>
            ))
          ) : null}
          {supplyChain && supplyChain.unmatched.length > 0 ? (
            <Text style={styles.note}>Unmatched (not force-fitted into a layer): {supplyChain.unmatched.map((item) => item.symbol).join(", ")}</Text>
          ) : null}
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={16} color={coral} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}

function Chip({ label, active, onPress, tone = amber }: { label: string; active: boolean; onPress: () => void; tone?: string }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && { borderColor: tone, backgroundColor: raised }]} accessibilityRole="button">
      <Text style={[styles.chipText, active && { color: tone }]}>{label}</Text>
    </Pressable>
  );
}

function SmallButton({ icon, label, onPress, tone = amber }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; tone?: string }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.smallButton, { borderColor: `${tone}55` }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={15} color={tone} />
      <Text style={[styles.smallButtonText, { color: tone }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 48 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 12 },
  headerCopy: { flex: 1 },
  back: { width: 42, height: 42, alignItems: "center", justifyContent: "center", backgroundColor: panel, borderWidth: 1, borderColor: divider, borderRadius: 14 },
  eyebrow: { color: amber, fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  title: { color: text, fontSize: 26, fontWeight: "800", letterSpacing: -0.6, marginTop: 4 },
  compliance: { flexDirection: "row", gap: 9, backgroundColor: "#2A2416", borderWidth: 1, borderColor: "#6B5527", borderRadius: 14, padding: 13, marginTop: 14 },
  complianceText: { flex: 1, color: "#F7D79D", fontSize: 10, lineHeight: 15, fontWeight: "700" },
  marketRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 12 },
  marketText: { color: teal, fontSize: 11, fontWeight: "700" },
  card: { backgroundColor: panel, borderWidth: 1, borderColor: divider, borderRadius: 18, padding: 15, marginTop: 14 },
  cardLabel: { color: amber, fontSize: 9, fontWeight: "900", letterSpacing: 1.2, marginBottom: 10 },
  meta: { color: muted, fontSize: 10.5, lineHeight: 16 },
  note: { color: "#8FA3B8", fontSize: 10, lineHeight: 15, marginTop: 8 },
  input: { backgroundColor: ink, borderWidth: 1, borderColor: divider, borderRadius: 12, color: text, fontSize: 12, paddingHorizontal: 11, paddingVertical: 10, marginTop: 11, minHeight: 42 },
  textArea: { minHeight: 84, backgroundColor: ink, borderWidth: 1, borderColor: divider, borderRadius: 12, color: text, fontSize: 10.5, lineHeight: 15, padding: 10, fontFamily: "monospace", textAlignVertical: "top" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 11 },
  chip: { borderWidth: 1, borderColor: "#2E3F58", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { color: muted, fontSize: 10, fontWeight: "700" },
  list: { marginTop: 12, gap: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: raised, borderRadius: 12, padding: 11, borderWidth: 1, borderColor: "transparent" },
  rowActive: { borderColor: amber },
  rowCopy: { flex: 1 },
  rowTitle: { color: text, fontSize: 12, fontWeight: "700" },
  rowAuthor: { color: muted, fontSize: 9.5, marginTop: 3 },
  badge: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 8, fontWeight: "900", letterSpacing: 0.5 },
  rowGap: { flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" },
  smallButton: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, backgroundColor: raised, borderRadius: 11, paddingHorizontal: 11, paddingVertical: 10, minHeight: 40, marginTop: 10 },
  smallButtonText: { fontSize: 11, fontWeight: "800" },
  pressed: { opacity: 0.78 },
  detailTitle: { color: text, fontSize: 16, fontWeight: "800" },
  detailAuthor: { color: amber, fontSize: 10.5, fontWeight: "700", marginTop: 3 },
  detailIdea: { color: "#C5D1DE", fontSize: 11.5, lineHeight: 17, marginTop: 9 },
  detailMeta: { color: muted, fontSize: 10, lineHeight: 15, marginTop: 8 },
  metricRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  metricPill: { backgroundColor: raised, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5 },
  metricPillText: { color: violet, fontSize: 9, fontWeight: "700" },
  warn: { color: "#F3B7C6", fontSize: 10.5, lineHeight: 16, marginTop: 11, backgroundColor: "#2A1520", borderWidth: 1, borderColor: "#5B2233", borderRadius: 11, padding: 10 },
  resultBlock: { marginTop: 14, borderTopWidth: 1, borderTopColor: "#1E2D42", paddingTop: 11 },
  resultHeading: { color: text, fontSize: 11, fontWeight: "800", marginBottom: 7 },
  mono: { color: "#B8C6D6", fontSize: 10, lineHeight: 15, fontFamily: "monospace", marginTop: 4 },
  screenRow: { marginTop: 10 },
  screenHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  screenSymbol: { color: text, fontSize: 12, fontWeight: "800" },
  screenScore: { fontSize: 11, fontWeight: "800" },
  criterion: { color: "#9FB0C4", fontSize: 9.5, lineHeight: 14, marginTop: 3 },
  modelRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderTopWidth: 1, borderTopColor: "#1E2D42", paddingVertical: 8 },
  modelText: { flex: 1, color: "#9FB0C4", fontSize: 9.5, lineHeight: 14 },
  modelName: { color: text, fontSize: 11, fontWeight: "800" },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#2A1520", borderWidth: 1, borderColor: "#5B2233", borderRadius: 12, padding: 11, marginTop: 14 },
  errorText: { flex: 1, color: "#F3B7C6", fontSize: 11, lineHeight: 16 },
});
