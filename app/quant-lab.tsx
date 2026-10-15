import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "@/lib/navigation/router";
import Ionicons from "react-native-vector-icons/Ionicons";
import * as Clipboard from "@/lib/platform/clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "@/lib/platform/file-system";

import { ScreenContainer } from "@/components/screen-container";
import { useMarketContext } from "@/lib/market-context";
import { getMarketProfile } from "@/lib/market-regions";
import { entriesFromRun, type LedgerSummary } from "@/lib/quant/ledger";
import { loadLedger, recordEntries, summarize } from "@/lib/quant-ledger";
import { BACKTEST_CAVEAT, COMPLIANCE_NOTICE } from "@/lib/quant/compliance";
import { DEFAULT_BACKTEST_CONFIG, runBacktestAsync, type BacktestProgress, type BacktestResult } from "@/lib/quant/backtest";
import { describeSeries, parseOhlcv } from "@/lib/quant/ohlcv";
import { DEFAULT_TRACKER_CONFIG, trackStrategy, type TrackerRun } from "@/lib/quant/tracker";
import { describeStrategy, generateStrategyFromPrompt } from "@/lib/quant/strategy";
import type { Candle } from "@/lib/quant/types";
import type { IoniconName } from "@/lib/icon-names";

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

const PRESETS = ["ema 20/50 crossover", "rsi 14 mean reversion", "20 bar breakout", "short 10/30 ema with 4% stop"];

/** A deterministic synthetic series, used only for the clearly-labelled demo. Never market data. */
function demoSeries(bars = 600): Candle[] {
  let seed = 0x9e3779b9;
  const next = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out: Candle[] = [];
  let price = 100;
  for (let i = 0; i < bars; i += 1) {
    const drift = 0.0006;
    const shock = (next() - 0.5) * 0.02;
    const open = price;
    const close = Math.max(1, open * (1 + drift + shock));
    const high = Math.max(open, close) * (1 + next() * 0.006);
    const low = Math.min(open, close) * (1 - next() * 0.006);
    out.push({ time: i * 86_400_000, open, high, low, close, volume: Math.round(10_000 + next() * 5_000) });
    price = close;
  }
  return out;
}

export default function QuantLabScreen() {
  // A strategy chosen in the Book Strategy Library arrives here as a prompt.
  const params = useLocalSearchParams<{ prompt?: string }>();
  const { marketId } = useMarketContext();
  const [ledgerSummary, setLedgerSummary] = useState<LedgerSummary | null>(null);
  const [rawData, setRawData] = useState("");
  const [prompt, setPrompt] = useState(typeof params.prompt === "string" && params.prompt.trim() ? params.prompt : "ema 20/50 crossover");
  const [startingCapital, setStartingCapital] = useState(String(DEFAULT_BACKTEST_CONFIG.startingCapital));
  const [commissionBps, setCommissionBps] = useState(String(DEFAULT_BACKTEST_CONFIG.commissionBps));
  const [slippageBps, setSlippageBps] = useState(String(DEFAULT_BACKTEST_CONFIG.slippageBps));
  const [candles, setCandles] = useState<Candle[] | null>(null);
  const [dataNote, setDataNote] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<BacktestProgress | null>(null);
  const [liveLog, setLiveLog] = useState<string[]>([]);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [tracker, setTracker] = useState<TrackerRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastPaint = useRef(0);

  // Load the durable ledger for the active market whenever that market changes.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const entries = await loadLedger();
      if (!cancelled) setLedgerSummary(summarize(entries, marketId));
    })();
    return () => {
      cancelled = true;
    };
  }, [marketId]);

  const spec = useMemo(() => generateStrategyFromPrompt(prompt), [prompt]);
  const series = useMemo(() => (candles ? describeSeries(candles) : null), [candles]);

  const loadText = useCallback((value: string, label: string) => {
    setError(null);
    setResult(null);
    setRawData(value);
    const parsed = parseOhlcv(value);
    if (parsed.status === "error") {
      setCandles(null);
      setDataNote(null);
      setError(`Could not read the data: ${parsed.reason}`);
      return;
    }
    setCandles(parsed.candles);
    const parts = [`${label}: ${parsed.candles.length} bars.`];
    if (parsed.dropped > 0) parts.push(`${parsed.dropped} unusable row(s) were dropped.`);
    parts.push(...parsed.notes);
    setDataNote(parts.join(" "));
  }, []);

  const onPaste = async () => {
    const value = await Clipboard.getStringAsync();
    if (!value?.trim()) {
      setError("The clipboard is empty.");
      return;
    }
    loadText(value, "Pasted data");
  };

  const onPickFile = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "text/plain", "application/json", "text/comma-separated-values", "*/*"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled) return;
      const asset = picked.assets?.[0];
      if (!asset?.uri) {
        setError("No file was selected.");
        return;
      }
      const content = await FileSystem.readAsStringAsync(asset.uri);
      loadText(content, asset.name ?? "Selected file");
    } catch (caught) {
      setError(`Could not read that file: ${caught instanceof Error ? caught.message : String(caught)}`);
    }
  };

  const onDemo = () => {
    const series = demoSeries();
    setCandles(series);
    setResult(null);
    setError(null);
    setRawData("");
    setDataNote(`Demo series: ${series.length} synthetic bars, generated on-device. This is NOT market data — it exists only to exercise the engine.`);
  };

  const onRun = async () => {
    if (!candles || candles.length < 3) {
      setError("Load a data series with at least a few bars first.");
      return;
    }
    setRunning(true);
    setError(null);
    setResult(null);
    setTracker(null);
    setLiveLog([]);
    setProgress(null);
    lastPaint.current = 0;
    try {
      const config = {
        startingCapital: Math.max(1, Number(startingCapital) || DEFAULT_BACKTEST_CONFIG.startingCapital),
        commissionBps: Math.max(0, Number(commissionBps) || 0),
        slippageBps: Math.max(0, Number(slippageBps) || 0),
        maxBars: DEFAULT_BACKTEST_CONFIG.maxBars,
      };
      const outcome = await runBacktestAsync(candles, spec, config, {
        yieldEvery: 400,
        onProgress: (update) => {
          // Repaint at most every ~40ms so the progress bar stays real but the UI stays smooth.
          const now = Date.now();
          if (now - lastPaint.current < 40 && update.fraction < 1) return;
          lastPaint.current = now;
          setProgress(update);
          if (update.trades !== undefined) {
            setLiveLog((current) => (current.length > 6 ? current : [...current, `bar ${update.barsProcessed} · equity ${update.equity.toFixed(2)} · ${update.trades} trade(s)`]));
          }
        },
      });
      setResult(outcome);
      // The tracker follows the same strategy output under the dynamic trailing stop-loss ladder.
      const tracked = trackStrategy(candles, spec, DEFAULT_TRACKER_CONFIG, config);
      setTracker(tracked);
      // Record the tracked output in the durable ledger, scoped to the active market.
      const recorded = await recordEntries(
        entriesFromRun(tracked, {
          strategyId: spec.name,
          strategyName: spec.name,
          marketId,
          symbol: "SERIES",
          times: candles.map((candle) => candle.time),
        }),
      );
      setLedgerSummary(summarize(recorded, marketId));
      setLiveLog(outcome.log.slice(-8).map((entry) => `#${entry.index} ${entry.event}: ${entry.detail}`));
    } catch (caught) {
      setError(`The backtest could not complete: ${caught instanceof Error ? caught.message : String(caught)}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <ScreenContainer className="px-5" edges={["top", "left", "right", "bottom"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={21} color={text} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>RESEARCH DESK</Text>
            <Text style={styles.title}>Strategy Lab</Text>
          </View>
        </View>
        <Text style={styles.subtitle}>
          Run a real candle-by-candle backtest on your own history. Signals are evaluated on a bar&apos;s close and filled on
          the next bar&apos;s open, with commission and slippage charged on every fill.
        </Text>

        <View style={styles.compliance}>
          <Ionicons name="shield-checkmark" size={15} color={amber} />
          <Text style={styles.complianceText}>{COMPLIANCE_NOTICE}</Text>
        </View>

        <Pressable onPress={() => router.push("/strategy-library")} style={({ pressed }) => [styles.libraryLink, pressed && styles.pressed]} accessibilityRole="button">
          <Ionicons name="library-outline" size={16} color={violet} />
          <Text style={styles.libraryLinkText}>Browse the Book Strategy Library (100 frameworks, supply chain, screens)</Text>
        </Pressable>

        {/* Data */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>1 · DATA</Text>
          <TextInput
            value={rawData}
            onChangeText={(value) => loadText(value, "Pasted data")}
            placeholder="Paste CSV or JSON, or choose a file: time,open,high,low,close,volume"
            placeholderTextColor="#5C6B80"
            multiline
            style={styles.textArea}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.row}>
            <SmallButton icon="document-outline" label="Choose CSV / JSON" onPress={() => void onPickFile()} tone={teal} />
            <SmallButton icon="clipboard-outline" label="Paste from clipboard" onPress={() => void onPaste()} />
            <SmallButton icon="flask-outline" label="Load demo series" onPress={onDemo} tone={violet} />
          </View>
          {series ? (
            <Text style={styles.meta}>
              {series.bars} bars · {series.from?.slice(0, 10)} → {series.to?.slice(0, 10)}
              {series.spanDays !== null ? ` · ${series.spanDays.toFixed(0)} days` : ""}
            </Text>
          ) : null}
          {dataNote ? <Text style={styles.note}>{dataNote}</Text> : null}
        </View>

        {/* Strategy */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>2 · STRATEGY</Text>
          <TextInput
            value={prompt}
            onChangeText={setPrompt}
            placeholder="Describe a strategy, e.g. ema 20/50 crossover with 4% stop"
            placeholderTextColor="#5C6B80"
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.presetRow}>
            {PRESETS.map((preset) => (
              <Pressable key={preset} onPress={() => setPrompt(preset)} style={styles.preset}>
                <Text style={styles.presetText}>{preset}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.mono}>{describeStrategy(spec)}</Text>
        </View>

        {/* Run */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>3 · COSTS &amp; CAPITAL</Text>
          <View style={styles.row}>
            <NumberField label="Capital" value={startingCapital} onChange={setStartingCapital} />
            <NumberField label="Commission (bps)" value={commissionBps} onChange={setCommissionBps} />
            <NumberField label="Slippage (bps)" value={slippageBps} onChange={setSlippageBps} />
          </View>
          <Pressable onPress={() => void onRun()} disabled={running} style={({ pressed }) => [styles.runButton, running && styles.runDisabled, pressed && styles.pressed]} accessibilityRole="button">
            {running ? <ActivityIndicator color={ink} /> : <Ionicons name="play" size={17} color={ink} />}
            <Text style={styles.runText}>{running ? "Running…" : "Run backtest"}</Text>
          </Pressable>
          {progress ? (
            <>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.round(progress.fraction * 100)}%` }]} />
              </View>
              <Text style={styles.meta}>
                {progress.barsProcessed} / {progress.totalBars} bars · equity {progress.equity.toFixed(2)} · {progress.trades} trade(s)
              </Text>
            </>
          ) : null}
          {liveLog.length > 0 ? (
            <View style={styles.logBox}>
              {liveLog.map((line, index) => (
                <Text key={`${line}-${index}`} style={styles.logLine}>{line}</Text>
              ))}
            </View>
          ) : null}
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={16} color={coral} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Results */}
        {result ? (
          <>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>4 · RESULTS</Text>
              <View style={styles.metricGrid}>
                <Metric label="Net return" value={`${result.metrics.totalReturnPct.toFixed(2)}%`} tone={result.metrics.totalReturnPct >= 0 ? teal : coral} />
                <Metric label="Ending capital" value={result.metrics.endingCapital.toFixed(2)} />
                <Metric label="Trades" value={String(result.metrics.tradeCount)} />
                <Metric label="Win rate" value={`${result.metrics.winRatePct.toFixed(1)}%`} />
                <Metric label="Profit factor" value={result.metrics.profitFactor === null ? "n/a" : result.metrics.profitFactor.toFixed(2)} />
                <Metric label="Max drawdown" value={`${result.metrics.maxDrawdownPct.toFixed(2)}%`} tone={coral} />
                <Metric label="Expectancy" value={result.metrics.expectancy.toFixed(2)} />
                <Metric label="Exposure" value={`${result.metrics.exposurePct.toFixed(1)}%`} />
                <Metric label="Sharpe" value={result.metrics.sharpe === null ? "n/a" : result.metrics.sharpe.toFixed(2)} />
                <Metric label="Costs paid" value={result.metrics.totalCosts.toFixed(2)} />
                <Metric label="CAGR" value={result.metrics.cagrPct === null ? "n/a" : `${result.metrics.cagrPct.toFixed(2)}%`} />
                <Metric label="Bars" value={String(result.barsProcessed)} />
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardLabel}>TRADES ({result.trades.length})</Text>
              {result.trades.length === 0 ? (
                <Text style={styles.note}>The strategy never opened a position on this series.</Text>
              ) : (
                result.trades.slice(0, 25).map((trade, index) => (
                  <View key={`${trade.entryIndex}-${index}`} style={styles.tradeRow}>
                    <Text style={[styles.tradeSide, { color: trade.side === "long" ? teal : coral }]}>{trade.side.toUpperCase()}</Text>
                    <Text style={styles.tradeText}>
                      {trade.entryPrice.toFixed(2)} → {trade.exitPrice.toFixed(2)} · {trade.bars}b · {trade.exitReason}
                    </Text>
                    <Text style={[styles.tradePnl, { color: trade.netPnl >= 0 ? teal : coral }]}>
                      {trade.netPnl >= 0 ? "+" : ""}
                      {trade.netPnl.toFixed(2)}
                    </Text>
                  </View>
                ))
              )}
            </View>

            {tracker ? (
              <View style={styles.card}>
                <Text style={styles.cardLabel}>5 · PERFORMANCE TRACKER — DYNAMIC TRAILING STOP</Text>
                <Text style={styles.meta}>
                  −10% initial risk floor · break-even at +10% · +5% at +15% · +10% at +20% · 10% trail to +50% · 5% trail above +50%
                </Text>
                <View style={styles.metricGrid}>
                  <Metric label="Avg return" value={`${(tracker.positions.length > 0 ? tracker.positions.reduce((sum, position) => sum + position.returnPct, 0) / tracker.positions.length : 0).toFixed(2)}%`} tone={tracker.metrics.wins > 0 ? teal : coral} />
                  <Metric label="Median return" value={`${tracker.metrics.medianReturnPct.toFixed(2)}%`} />
                  <Metric label="Win rate" value={`${tracker.metrics.winRatePct.toFixed(1)}%`} />
                  <Metric label="Best" value={`${tracker.metrics.bestReturnPct.toFixed(2)}%`} tone={teal} />
                  <Metric label="Worst" value={`${tracker.metrics.worstReturnPct.toFixed(2)}%`} tone={coral} />
                  <Metric label="Avg bars held" value={tracker.metrics.averageBarsHeld.toFixed(1)} />
                  <Metric label="Profit factor" value={tracker.metrics.profitFactor === null ? "n/a" : tracker.metrics.profitFactor.toFixed(2)} />
                  <Metric label="Max drawdown" value={`${tracker.metrics.maxDrawdownPct.toFixed(2)}%`} tone={coral} />
                  <Metric label="Tracked" value={String(tracker.metrics.tradeCount)} />
                </View>
                <Text style={styles.meta}>
                  Exits — floor {tracker.metrics.byExitReason["initial-risk-floor"]} · break-even {tracker.metrics.byExitReason["break-even"]} · trailing {tracker.metrics.byExitReason["trailing-stop"]} · signal {tracker.metrics.byExitReason.signal} · open at end {tracker.metrics.byExitReason["end-of-data"]}
                </Text>
                {tracker.positions.length === 0 ? (
                  <Text style={styles.note}>No position was tracked on this series.</Text>
                ) : (
                  tracker.positions.slice(0, 20).map((position, index) => (
                    <View key={`${position.entryIndex}-${index}`} style={styles.tradeRow}>
                      <Text style={[styles.tradeSide, { color: position.returnPct >= 0 ? teal : coral }]}>#{index + 1}</Text>
                      <Text style={styles.tradeText}>
                        entry {position.entryPrice.toFixed(2)} · peak {position.peakPrice.toFixed(2)} (+{position.peakGainPct.toFixed(1)}%) · stop {position.finalStopPrice.toFixed(2)} · {position.trackerExitReason} ({position.stopRule})
                      </Text>
                      <Text style={[styles.tradePnl, { color: position.returnPct >= 0 ? teal : coral }]}>
                        {position.returnPct >= 0 ? "+" : ""}
                        {position.returnPct.toFixed(2)}%
                      </Text>
                    </View>
                  ))
                )}
              </View>
            ) : null}

            {ledgerSummary && ledgerSummary.overall.trades > 0 ? (
              <View style={styles.card}>
                <Text style={styles.cardLabel}>6 · LEDGER — ACROSS STRATEGIES ({getMarketProfile(marketId).country})</Text>
                <Text style={styles.meta}>
                  {ledgerSummary.overall.trades} tracked position(s) across {ledgerSummary.strategyCount} strateg{ledgerSummary.strategyCount === 1 ? "y" : "ies"} and {ledgerSummary.symbolCount} symbol(s). This ledger persists between sessions and is scoped to the active market.
                </Text>
                <View style={styles.metricGrid}>
                  <Metric label="Win rate" value={`${ledgerSummary.overall.winRatePct.toFixed(1)}%`} tone={ledgerSummary.overall.winRatePct >= 50 ? teal : coral} />
                  <Metric label="Avg return" value={`${ledgerSummary.overall.averageReturnPct.toFixed(2)}%`} />
                  <Metric label="Median" value={`${ledgerSummary.overall.medianReturnPct.toFixed(2)}%`} />
                  <Metric label="Profit factor" value={ledgerSummary.overall.profitFactor === null ? "n/a" : ledgerSummary.overall.profitFactor.toFixed(2)} />
                  <Metric label="Best" value={`${ledgerSummary.overall.bestReturnPct.toFixed(2)}%`} tone={teal} />
                  <Metric label="Worst" value={`${ledgerSummary.overall.worstReturnPct.toFixed(2)}%`} tone={coral} />
                  <Metric label="Avg bars" value={ledgerSummary.overall.averageBarsHeld.toFixed(1)} />
                  <Metric label="Avg MFE" value={`${ledgerSummary.overall.averageMfePct.toFixed(1)}%`} />
                  <Metric label="Avg MAE" value={`${ledgerSummary.overall.averageMaePct.toFixed(1)}%`} tone={coral} />
                </View>
                {ledgerSummary.byStrategy.map((row) => (
                  <View key={row.strategyId} style={styles.tradeRow}>
                    <Text style={[styles.tradeSide, { color: row.averageReturnPct >= 0 ? teal : coral }]}>{row.trades}</Text>
                    <Text style={styles.tradeText} numberOfLines={2}>
                      {row.strategyName} · {row.winRatePct.toFixed(0)}% win · avg {row.averageReturnPct.toFixed(2)}% · best {row.bestReturnPct.toFixed(1)}% · worst {row.worstReturnPct.toFixed(1)}%
                    </Text>
                    <Text style={[styles.tradePnl, { color: row.averageReturnPct >= 0 ? teal : coral }]}>
                      {row.averageReturnPct >= 0 ? "+" : ""}
                      {row.averageReturnPct.toFixed(2)}%
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.card}>
              <Text style={styles.cardLabel}>EXECUTION LOG ({result.log.length})</Text>
              {result.log.length === 0 ? (
                <Text style={styles.note}>No executions were recorded.</Text>
              ) : (
                result.log.slice(-20).map((entry, index) => (
                  <Text key={`${entry.index}-${index}`} style={styles.logLine}>
                    #{entry.index} · {entry.event} · {entry.detail}
                  </Text>
                ))
              )}
            </View>
          </>
        ) : null}

        <View style={styles.disclaimer}>
          <Ionicons name="information-circle-outline" size={15} color={amber} />
          <Text style={styles.disclaimerText}>
            {BACKTEST_CAVEAT}
          </Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function SmallButton({ icon, label, onPress, tone = amber }: { icon: IoniconName; label: string; onPress: () => void; tone?: string }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.smallButton, { borderColor: `${tone}55` }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={15} color={tone} />
      <Text style={[styles.smallButtonText, { color: tone }]}>{label}</Text>
    </Pressable>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <View style={styles.numberField}>
      <Text style={styles.numberLabel}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} keyboardType={Platform.OS === "ios" ? "decimal-pad" : "numeric"} style={styles.numberInput} placeholderTextColor="#5C6B80" />
    </View>
  );
}

function Metric({ label, value, tone = text }: { label: string; value: string; tone?: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color: tone }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 48 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 12 },
  headerCopy: { flex: 1 },
  back: { width: 42, height: 42, alignItems: "center", justifyContent: "center", backgroundColor: panel, borderWidth: 1, borderColor: divider, borderRadius: 14 },
  eyebrow: { color: amber, fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  title: { color: text, fontSize: 28, fontWeight: "800", letterSpacing: -0.6, marginTop: 4 },
  subtitle: { color: muted, fontSize: 13, lineHeight: 19, marginTop: 12 },
  compliance: { flexDirection: "row", gap: 9, backgroundColor: "#2A2416", borderWidth: 1, borderColor: "#6B5527", borderRadius: 14, padding: 13, marginTop: 14 },
  complianceText: { flex: 1, color: "#F7D79D", fontSize: 10, lineHeight: 15, fontWeight: "700" },
  libraryLink: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: panel, borderWidth: 1, borderColor: divider, borderRadius: 14, padding: 13, marginTop: 10 },
  libraryLinkText: { flex: 1, color: violet, fontSize: 11.5, fontWeight: "800" },
  card: { backgroundColor: panel, borderWidth: 1, borderColor: divider, borderRadius: 18, padding: 15, marginTop: 14 },
  cardLabel: { color: amber, fontSize: 9, fontWeight: "900", letterSpacing: 1.2, marginBottom: 10 },
  textArea: { minHeight: 88, backgroundColor: ink, borderWidth: 1, borderColor: divider, borderRadius: 12, color: text, fontSize: 11, lineHeight: 16, padding: 10, fontFamily: "monospace", textAlignVertical: "top" },
  input: { backgroundColor: ink, borderWidth: 1, borderColor: divider, borderRadius: 12, color: text, fontSize: 13, paddingHorizontal: 11, paddingVertical: 11, minHeight: 44 },
  row: { flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" },
  smallButton: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, backgroundColor: raised, borderRadius: 11, paddingHorizontal: 11, paddingVertical: 10, minHeight: 40 },
  smallButtonText: { fontSize: 11, fontWeight: "800" },
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  preset: { borderWidth: 1, borderColor: "#2E3F58", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  presetText: { color: muted, fontSize: 10, fontWeight: "700" },
  mono: { color: "#B8C6D6", fontSize: 10, lineHeight: 15, fontFamily: "monospace", marginTop: 10 },
  meta: { color: muted, fontSize: 10, lineHeight: 15, marginTop: 9 },
  note: { color: "#8FA3B8", fontSize: 10, lineHeight: 15, marginTop: 8 },
  numberField: { flex: 1, minWidth: 92 },
  numberLabel: { color: muted, fontSize: 9, fontWeight: "800", letterSpacing: 0.6, marginBottom: 5 },
  numberInput: { backgroundColor: ink, borderWidth: 1, borderColor: divider, borderRadius: 10, color: text, fontSize: 12, paddingHorizontal: 9, paddingVertical: 9, minHeight: 40 },
  runButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: amber, borderRadius: 14, paddingVertical: 14, marginTop: 14, minHeight: 48 },
  runDisabled: { opacity: 0.7 },
  runText: { color: ink, fontSize: 13, fontWeight: "900", letterSpacing: 0.3 },
  pressed: { opacity: 0.78 },
  progressTrack: { height: 8, backgroundColor: ink, borderRadius: 4, marginTop: 13, overflow: "hidden" },
  progressFill: { height: 8, backgroundColor: teal, borderRadius: 4 },
  logBox: { backgroundColor: ink, borderWidth: 1, borderColor: divider, borderRadius: 11, padding: 10, marginTop: 11, gap: 3 },
  logLine: { color: "#9FB0C4", fontSize: 9.5, lineHeight: 14, fontFamily: "monospace" },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#2A1520", borderWidth: 1, borderColor: "#5B2233", borderRadius: 12, padding: 11, marginTop: 14 },
  errorText: { flex: 1, color: "#F3B7C6", fontSize: 11, lineHeight: 16 },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metric: { width: "31%", minWidth: 88, backgroundColor: raised, borderRadius: 11, padding: 9 },
  metricLabel: { color: muted, fontSize: 8.5, fontWeight: "800", letterSpacing: 0.5 },
  metricValue: { fontSize: 14, fontWeight: "800", marginTop: 4 },
  tradeRow: { flexDirection: "row", alignItems: "center", gap: 8, borderTopWidth: 1, borderTopColor: "#1E2D42", paddingVertical: 8 },
  tradeSide: { fontSize: 9, fontWeight: "900", width: 34 },
  tradeText: { flex: 1, color: "#C5D1DE", fontSize: 10 },
  tradePnl: { fontSize: 11, fontWeight: "800" },
  disclaimer: { flexDirection: "row", gap: 8, backgroundColor: panel, borderWidth: 1, borderColor: divider, borderRadius: 14, padding: 13, marginTop: 16 },
  disclaimerText: { flex: 1, color: muted, fontSize: 10.5, lineHeight: 16 },
});
