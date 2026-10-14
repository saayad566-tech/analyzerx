import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { ScreenContainer } from "@/components/screen-container";
import { PriceChart, type OverlaySpec, type PaneSpec } from "@/components/price-chart";
import { trpc } from "@/lib/trpc";
import { useMarketContext } from "@/lib/market-context";
import { INDICATORS, type IndicatorId } from "@/lib/indicators";
import { CHART_TIMEFRAMES, type TimeframeId } from "@/lib/chart-timeframes";
import { normalizeStockSymbol } from "@/lib/stock-search";

const amber = "#F4B860";
const teal = "#4FD1C5";
const violet = "#A78BFA";
const coral = "#FB7185";

/** Default overlays and panes, chosen to match what the mandate named. */
const DEFAULT_OVERLAYS: IndicatorId[] = ["ema", "bollinger"];
const DEFAULT_PANES: IndicatorId[] = ["rsi", "macd"];

const OVERLAY_COLORS: Record<string, string> = {
  sma: amber, ema: teal, wma: violet, hma: coral, vwma: "#7DD3FC", vwap: "#F0ABFC",
  bollinger: "#93C5FD", keltner: "#FCD34D", donchian: "#A3E635", ichimoku: "#FB923C", supertrend: "#22D3EE",
};
const PANE_COLORS: Record<string, string> = {
  rsi: amber, macd: teal, stochastic: violet, stochrsi: "#F472B6", williamsR: coral,
  cci: "#93C5FD", roc: "#A3E635", momentum: "#FCD34D", adx: "#22D3EE",
  atr: "#FB923C", obv: "#7DD3FC", ad: "#C4B5FD", mfi: "#F0ABFC", stdev: "#94A3B8",
};

export default function ChartScreen() {
  const params = useLocalSearchParams<{ symbol?: string }>();
  const { market, marketId } = useMarketContext();
  const { width } = useWindowDimensions();

  const [symbol, setSymbol] = useState(() => normalizeStockSymbol(params.symbol ?? "") || market.tickerExamples[0] || "");
  const [pending, setPending] = useState(symbol);
  const [timeframe, setTimeframe] = useState<TimeframeId>("6mo");
  const [overlays, setOverlays] = useState<IndicatorId[]>(DEFAULT_OVERLAYS);
  const [panes, setPanes] = useState<IndicatorId[]>(DEFAULT_PANES);
  const [pickerOpen, setPickerOpen] = useState<"overlay" | "panel" | null>(null);

  const frame = CHART_TIMEFRAMES.find((entry) => entry.id === timeframe) ?? CHART_TIMEFRAMES[0];
  const history = trpc.market.history.useQuery(
    { symbol, range: frame.range, interval: frame.interval, marketId },
    { retry: false, staleTime: 60_000, enabled: symbol.trim().length > 0 },
  );

  const bars = useMemo(() => (history.data?.bars ?? []) as Array<{ t: string; o: number | null; h: number | null; l: number | null; c: number | null; v: number | null }>, [history.data]);

  const overlaySpecs: OverlaySpec[] = useMemo(
    () => overlays.map((id) => ({ id, color: OVERLAY_COLORS[id] ?? amber, label: INDICATORS.find((entry) => entry.id === id)?.label ?? id })),
    [overlays],
  );
  const paneSpecs: PaneSpec[] = useMemo(
    () => panes.map((id) => ({ id, color: PANE_COLORS[id] ?? teal, label: INDICATORS.find((entry) => entry.id === id)?.label ?? id })),
    [panes],
  );

  const toggle = useCallback((id: IndicatorId, group: "overlay" | "panel") => {
    const setter = group === "overlay" ? setOverlays : setPanes;
    setter((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));
  }, []);

  const submit = () => {
    const next = normalizeStockSymbol(pending);
    if (next) setSymbol(next);
  };

  const overlayChoices = INDICATORS.filter((entry) => entry.placement === "overlay");
  const panelChoices = INDICATORS.filter((entry) => entry.placement === "panel");
  const last = bars.length ? bars[bars.length - 1] : null;
  const change = bars.length > 1 && last?.c != null && bars[0]?.c != null && bars[0].c !== 0
    ? ((last.c - bars[0].c) / bars[0].c) * 100
    : null;

  return (
    <ScreenContainer className="px-5">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.iconButton} accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={19} color={amber} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>TECHNICAL ANALYSIS</Text>
            <Text style={styles.title}>{symbol || "Chart"}</Text>
          </View>
          <View style={styles.marketChip}>
            <Text style={styles.marketChipText}>{market.country}</Text>
          </View>
        </View>

        {/* Symbol entry */}
        <View style={styles.searchRow}>
          <TextInput
            value={pending}
            onChangeText={setPending}
            onSubmitEditing={submit}
            placeholder={`Try ${market.tickerExamples.slice(0, 2).join(" or ")}`}
            placeholderTextColor="#6E7D92"
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="search"
            style={styles.input}
            accessibilityLabel="Symbol"
          />
          <Pressable onPress={submit} style={styles.goButton} accessibilityRole="button" accessibilityLabel="Load chart">
            <Ionicons name="search" size={17} color="#09111F" />
          </Pressable>
        </View>

        {/* Timeframes */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {CHART_TIMEFRAMES.map((entry) => (
            <Pressable key={entry.id} onPress={() => setTimeframe(entry.id)} style={[styles.chip, timeframe === entry.id && styles.chipActive]} accessibilityRole="button" accessibilityLabel={`Timeframe ${entry.label}`}>
              <Text style={[styles.chipText, timeframe === entry.id && styles.chipTextActive]}>{entry.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Indicator control bar */}
        <View style={styles.controlRow}>
          <Pressable onPress={() => setPickerOpen(pickerOpen === "overlay" ? null : "overlay")} style={styles.controlButton} accessibilityRole="button" accessibilityLabel="Choose price overlays">
            <Ionicons name="layers-outline" size={15} color={amber} />
            <Text style={styles.controlText}>Overlays · {overlays.length}</Text>
          </Pressable>
          <Pressable onPress={() => setPickerOpen(pickerOpen === "panel" ? null : "panel")} style={styles.controlButton} accessibilityRole="button" accessibilityLabel="Choose indicator panes">
            <Ionicons name="stats-chart-outline" size={15} color={teal} />
            <Text style={styles.controlText}>Panes · {panes.length}</Text>
          </Pressable>
        </View>

        {pickerOpen ? (
          <View style={styles.picker}>
            <Text style={styles.pickerTitle}>{pickerOpen === "overlay" ? "PRICE OVERLAYS" : "INDICATOR PANES"}</Text>
            <View style={styles.pickerWrap}>
              {(pickerOpen === "overlay" ? overlayChoices : panelChoices).map((entry) => {
                const active = (pickerOpen === "overlay" ? overlays : panes).includes(entry.id);
                return (
                  <Pressable key={entry.id} onPress={() => toggle(entry.id, pickerOpen)} style={[styles.pickerChip, active && styles.pickerChipActive]} accessibilityRole="button" accessibilityLabel={`${active ? "Remove" : "Add"} ${entry.label}`}>
                    <Text style={[styles.pickerChipText, active && styles.pickerChipTextActive]}>{entry.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.pickerNote}>Overlays draw on the price pane. Panes get their own chart below it. Every indicator is computed on-device from the same bars, with no extrapolation during its warm-up.</Text>
          </View>
        ) : null}

        {/* Status */}
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: history.isError ? coral : bars.length ? teal : amber }]} />
          <Text style={styles.statusText}>
            {history.isLoading
              ? "Loading bars…"
              : history.isError
                ? "Price history is unavailable for this symbol and timeframe."
                : `${bars.length} bars · ${frame.label}${change === null ? "" : ` · ${change >= 0 ? "+" : ""}${change.toFixed(2)}% over the window`}`}
          </Text>
        </View>

        {/* The chart */}
        <View style={styles.chartCard}>
          {bars.length ? (
            <PriceChart
              bars={bars}
              overlays={overlaySpecs}
              panes={paneSpecs}
              width={width - 40}
              emptyReason={history.isError ? "The price source did not return bars for this symbol on this market." : undefined}
            />
          ) : (
            <View style={styles.empty}>
              <Ionicons name="pulse-outline" size={26} color={amber} />
              <Text style={styles.emptyTitle}>{history.isLoading ? "Fetching bars…" : "No bars to draw"}</Text>
              <Text style={styles.emptyText}>
                {history.isError
                  ? "The price source did not answer for this symbol on this market. AnalyzerX shows nothing rather than another market's series."
                  : "Enter a symbol for this market to load its own price history."}
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.disclaimer}>
          Indicators are computed on-device from the same bars the chart draws. They describe the past and are not buy or sell instructions. Readings marked unavailable mean there were not enough bars, not that the value was zero.
        </Text>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 40 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 11, paddingTop: 10 },
  headerCopy: { flex: 1 },
  eyebrow: { color: amber, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  title: { color: "#F4F7FB", fontSize: 25, fontWeight: "900", letterSpacing: -0.6, marginTop: 2 },
  iconButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center", backgroundColor: "#111C2D", borderWidth: 1, borderColor: "#26364D", borderRadius: 13 },
  marketChip: { borderWidth: 1, borderColor: "#76572D", borderRadius: 9, paddingHorizontal: 9, paddingVertical: 5 },
  marketChipText: { color: amber, fontSize: 10, fontWeight: "800" },
  searchRow: { flexDirection: "row", gap: 9, marginTop: 16 },
  input: { flex: 1, height: 46, borderWidth: 1, borderColor: "#26364D", borderRadius: 12, paddingHorizontal: 13, color: "#F4F7FB", backgroundColor: "#0B1422", fontSize: 14 },
  goButton: { width: 46, height: 46, alignItems: "center", justifyContent: "center", backgroundColor: amber, borderRadius: 12 },
  chipRow: { gap: 7, paddingVertical: 13 },
  chip: { borderWidth: 1, borderColor: "#26364D", borderRadius: 10, paddingHorizontal: 13, paddingVertical: 7, backgroundColor: "#111C2D" },
  chipActive: { borderColor: amber, backgroundColor: amber + "22" },
  chipText: { color: "#91A2B8", fontSize: 11, fontWeight: "800" },
  chipTextActive: { color: amber },
  controlRow: { flexDirection: "row", gap: 9 },
  controlButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderWidth: 1, borderColor: "#26364D", borderRadius: 11, paddingVertical: 10, backgroundColor: "#111C2D" },
  controlText: { color: "#F4F7FB", fontSize: 11, fontWeight: "800" },
  picker: { marginTop: 11, borderWidth: 1, borderColor: "#26364D", borderRadius: 13, padding: 12, backgroundColor: "#0E1A2A" },
  pickerTitle: { color: amber, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  pickerWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 10 },
  pickerChip: { borderWidth: 1, borderColor: "#26364D", borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6 },
  pickerChipActive: { borderColor: teal, backgroundColor: teal + "22" },
  pickerChipText: { color: "#91A2B8", fontSize: 10, fontWeight: "700" },
  pickerChipTextActive: { color: teal },
  pickerNote: { color: "#6E7D92", fontSize: 9, lineHeight: 14, marginTop: 11 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 14 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { color: "#91A2B8", fontSize: 11, flex: 1 },
  chartCard: { marginTop: 12, borderWidth: 1, borderColor: "#26364D", borderRadius: 15, padding: 12, backgroundColor: "#111C2D" },
  empty: { minHeight: 180, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 18 },
  emptyTitle: { color: amber, fontSize: 13, fontWeight: "800" },
  emptyText: { color: "#91A2B8", fontSize: 11, lineHeight: 16, textAlign: "center" },
  disclaimer: { color: "#6E7D92", fontSize: 9, lineHeight: 14, marginTop: 14 },
});
