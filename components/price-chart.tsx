/**
 * Candlestick chart with indicator overlays and panels.
 *
 * Renders from the OHLCV bars the price-history source returns. Nothing is invented: a
 * bar whose open, high or low is missing is drawn as a close-only tick rather than being
 * given a fabricated body, and a pane with no defined indicator values says so instead of
 * drawing a flat line at zero.
 *
 * The geometry is computed in `lib/chart-geometry.ts` so it can be tested without a
 * renderer; this file is only the drawing and the touch handling.
 */
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G, Line, Path, Polyline, Rect, Text as SvgText } from "react-native-svg";

import {
  buildCandles,
  buildPane,
  buildOverlay,
  priceExtent,
  type ChartBar,
} from "@/lib/chart-geometry";
import type { IndicatorId, Series } from "@/lib/indicators";

export type OverlaySpec = { id: IndicatorId; params?: Record<string, number>; color: string; label: string };
export type PaneSpec = { id: IndicatorId; params?: Record<string, number>; color: string; label: string };

type Props = {
  bars: ReadonlyArray<ChartBar>;
  overlays: ReadonlyArray<OverlaySpec>;
  panes: ReadonlyArray<PaneSpec>;
  width: number;
  /** Currency or unit shown next to the price readout. */
  unit?: string;
  /** Shown when there is nothing to draw. */
  emptyReason?: string;
};

const UP = "#4FD1C5";
const DOWN = "#FB7185";
const GRID = "#26364D";
const MUTED = "#6E7D92";
const TEXT = "#F4F7FB";

const PRICE_HEIGHT = 260;
const PANE_HEIGHT = 96;
const AXIS_WIDTH = 52;
const PAD_TOP = 10;
const PAD_BOTTOM = 18;

export function PriceChart({ bars, overlays, panes, width, unit = "", emptyReason }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const plotWidth = Math.max(120, width - AXIS_WIDTH - 8);

  const geometry = useMemo(() => {
    const candles = buildCandles(bars, plotWidth, PRICE_HEIGHT, PAD_TOP, PAD_BOTTOM);
    const closes: Series = bars.map((bar) => bar.c);
    const highs: Series = bars.map((bar) => bar.h ?? bar.c);
    const lows: Series = bars.map((bar) => bar.l ?? bar.c);
    const volumes: Series = bars.map((bar) => bar.v);
    const priceInput = { highs, lows, closes, volumes };
    const overlayLines = overlays.map((spec) => ({
      spec,
      line: buildOverlay(spec.id, priceInput, spec.params ?? {}, candles.scale, plotWidth),
    }));
    const paneCharts = panes.map((spec) => ({ spec, pane: buildPane(spec.id, priceInput, spec.params ?? {}, plotWidth, PANE_HEIGHT, PAD_TOP, PAD_BOTTOM) }));
    return { candles, overlayLines, paneCharts, closes };
  }, [bars, overlays, panes, plotWidth]);

  if (!bars.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No price bars available</Text>
        <Text style={styles.emptyText}>{emptyReason ?? "The price source returned no bars for this symbol and timeframe. AnalyzerX does not draw a synthetic series."}</Text>
      </View>
    );
  }

  const { candles, overlayLines, paneCharts } = geometry;
  const last = bars[bars.length - 1];
  const active = selected === null ? null : bars[selected];
  const activeCandle = selected === null ? null : candles.candles[selected];

  const fmt = (value: number | null | undefined) =>
    typeof value === "number" && Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—";

  return (
    <View>
      <View style={styles.legend}>
        <Text style={styles.legendPrice}>{fmt((active ?? last).c)}{unit ? ` ${unit}` : ""}</Text>
        {active ? (
          <Text style={styles.legendMeta}>
            O {fmt(active.o)} · H {fmt(active.h)} · L {fmt(active.l)} · C {fmt(active.c)}
            {typeof active.v === "number" ? ` · V ${active.v.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : ""}
          </Text>
        ) : (
          <Text style={styles.legendMeta}>{bars.length} bars · tap the chart to inspect a bar</Text>
        )}
      </View>

      <Svg width={width} height={PRICE_HEIGHT} accessibilityLabel={`Price chart with ${bars.length} bars`}>
        {/* Grid */}
        {candles.gridLines.map((line) => (
          <G key={`g${line.value}`}>
            <Line x1={0} y1={line.y} x2={plotWidth} y2={line.y} stroke={GRID} strokeWidth={0.7} />
            <SvgText x={plotWidth + 5} y={line.y + 3} fill={MUTED} fontSize={9}>{line.label}</SvgText>
          </G>
        ))}

        {/* Candles */}
        {candles.candles.map((candle, index) => {
          if (!candle) return null;
          const isUp = candle.up;
          const color = isUp ? UP : DOWN;
          return (
            <G key={`c${index}`}>
              <Line x1={candle.cx} y1={candle.wickTop} x2={candle.cx} y2={candle.wickBottom} stroke={color} strokeWidth={1} />
              {candle.bodyHeight > 0.5 ? (
                <Rect x={candle.bodyX} y={candle.bodyY} width={candle.bodyWidth} height={candle.bodyHeight} fill={isUp ? color : color} opacity={isUp ? 0.9 : 0.85} />
              ) : (
                <Line x1={candle.bodyX} y1={candle.bodyY} x2={candle.bodyX + candle.bodyWidth} y2={candle.bodyY} stroke={color} strokeWidth={1.4} />
              )}
            </G>
          );
        })}

        {/* Indicator overlays */}
        {overlayLines.map(({ spec, line }) => (
          <G key={spec.id}>
            {line.polylines.map((points, band) => (
              <Polyline key={`${spec.id}-${band}`} points={points} fill="none" stroke={spec.color} strokeWidth={band === 0 ? 1.8 : 1.1} strokeDasharray={band === 0 ? undefined : "4 3"} opacity={band === 0 ? 1 : 0.75} />
            ))}
          </G>
        ))}

        {/* Crosshair */}
        {activeCandle ? (
          <G>
            <Line x1={activeCandle.cx} y1={0} x2={activeCandle.cx} y2={PRICE_HEIGHT - PAD_BOTTOM} stroke={TEXT} strokeWidth={0.8} strokeDasharray="3 3" opacity={0.6} />
            <Line x1={0} y1={activeCandle.closeY} x2={plotWidth} y2={activeCandle.closeY} stroke={TEXT} strokeWidth={0.8} strokeDasharray="3 3" opacity={0.6} />
          </G>
        ) : null}
      </Svg>

      {/* Touch targets, laid out as plain views so a tap does not need a gesture lib. */}
      <View style={styles.touchRow} pointerEvents="box-none">
        {bars.map((bar, index) => (
          <View
            key={`t${index}`}
            style={styles.touchCell}
            onStartShouldSetResponder={() => true}
            onResponderGrant={() => setSelected(index)}
            accessibilityLabel={`${new Date(bar.t).toLocaleDateString()}: close ${fmt(bar.c)}`}
          />
        ))}
      </View>

      {/* Indicator panes */}
      {paneCharts.map(({ spec, pane }) => (
        <View key={spec.id} style={styles.paneWrap}>
          <View style={styles.paneHeader}>
            <Text style={[styles.paneLabel, { color: spec.color }]}>{spec.label}</Text>
            <Text style={styles.paneValue}>{pane.readout}</Text>
          </View>
          {pane.lines.length ? (
            <Svg width={width} height={PANE_HEIGHT} accessibilityLabel={`${spec.label} pane`}>
              {pane.gridLines.map((line) => (
                <G key={`p${spec.id}${line.value}`}>
                  <Line x1={0} y1={line.y} x2={plotWidth} y2={line.y} stroke={GRID} strokeWidth={0.7} strokeDasharray={line.dashed ? "3 3" : undefined} />
                  <SvgText x={plotWidth + 5} y={line.y + 3} fill={MUTED} fontSize={8}>{line.label}</SvgText>
                </G>
              ))}
              {pane.lines.map((points, index) => (
                <Polyline key={`${spec.id}-l${index}`} points={points} fill="none" stroke={spec.color} strokeWidth={index === 0 ? 1.6 : 1.1} opacity={index === 0 ? 1 : 0.7} />
              ))}
              {pane.bars.map((bar, index) => (
                <Rect key={`${spec.id}-b${index}`} x={bar.x} y={bar.y} width={bar.width} height={bar.height} fill={bar.positive ? UP : DOWN} opacity={0.65} />
              ))}
              {pane.dots.map((dot, index) => (
                <Circle key={`${spec.id}-d${index}`} cx={dot.x} cy={dot.y} r={1.6} fill={spec.color} />
              ))}
            </Svg>
          ) : (
            <View style={styles.paneEmpty}>
              <Text style={styles.paneEmptyText}>Not enough bars for this indicator at the current timeframe.</Text>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { minHeight: 160, alignItems: "center", justifyContent: "center", paddingHorizontal: 20, gap: 8 },
  emptyTitle: { color: "#F4B860", fontSize: 13, fontWeight: "800" },
  emptyText: { color: "#91A2B8", fontSize: 11, lineHeight: 16, textAlign: "center" },
  legend: { paddingBottom: 6, gap: 2 },
  legendPrice: { color: TEXT, fontSize: 20, fontWeight: "900", letterSpacing: -0.5 },
  legendMeta: { color: "#91A2B8", fontSize: 10 },
  touchRow: { position: "absolute", left: 0, right: AXIS_WIDTH, top: 34, height: PRICE_HEIGHT, flexDirection: "row" },
  touchCell: { flex: 1 },
  paneWrap: { marginTop: 12 },
  paneHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 },
  paneLabel: { fontSize: 10, fontWeight: "900", letterSpacing: 0.6 },
  paneValue: { color: "#91A2B8", fontSize: 10, flexShrink: 1, textAlign: "right" },
  paneEmpty: { height: PANE_HEIGHT, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  paneEmptyText: { color: MUTED, fontSize: 10, textAlign: "center", lineHeight: 14 },
});
