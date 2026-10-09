import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  lowValue: number | null;
  baseValue: number | null;
  highValue: number | null;
  currentPrice: number | null;
  currency: string;
  basis: string;
  width: number;
};

type Anchor = { key: "low" | "base" | "high" | "current"; label: string; value: number | null; color: string; note: string };

const money = (currency: string, value: number) => `${currency === "INR" ? "₹" : `${currency} `}${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export function ValuationRangeChart({ lowValue, baseValue, highValue, currentPrice, currency, basis, width }: Props) {
  const anchors: Anchor[] = [
    { key: "low", label: "Low", value: lowValue, color: "#FB7185", note: "Conservative relative anchor" },
    { key: "base", label: "Base", value: baseValue, color: "#F4B860", note: "Central relative anchor" },
    { key: "high", label: "High", value: highValue, color: "#4FD1C5", note: "Optimistic relative anchor" },
    { key: "current", label: "Current", value: currentPrice, color: "#8B9CFF", note: "Latest verified market price" },
  ];
  const available = anchors.filter((anchor) => typeof anchor.value === "number" && Number.isFinite(anchor.value));
  const [selectedKey, setSelectedKey] = useState<Anchor["key"]>("base");
  const max = available.length ? Math.max(...available.map((anchor) => anchor.value as number)) : 0;
  const selected = anchors.find((anchor) => anchor.key === selectedKey && anchor.value !== null) ?? available[0] ?? null;

  return <View style={[styles.card, { width: Math.max(250, width - 42) }]}><View style={styles.header}><View style={styles.copy}><Text style={styles.title}>Valuation anchor range</Text><Text style={styles.subtitle}>Tap an anchor to inspect its basis; current price is never treated as intrinsic value.</Text></View><Text style={styles.unit}>{currency}</Text></View>{available.length >= 2 ? <View style={styles.rows}>{anchors.map((anchor) => { const value = anchor.value; const ratio = value !== null && max > 0 ? Math.max(0.04, value / max) : 0; return <Pressable key={anchor.key} accessibilityRole="button" accessibilityLabel={`${anchor.label} valuation ${value === null ? "unavailable" : money(currency, value)}`} onPress={() => setSelectedKey(anchor.key)} style={({ pressed }) => [styles.row, selected?.key === anchor.key && styles.rowSelected, pressed && styles.pressed]}><Text style={[styles.label, { color: anchor.color }]}>{anchor.label}</Text><View style={styles.barTrack}><View style={[styles.barFill, { width: `${ratio * 100}%`, backgroundColor: anchor.color }]} /></View><Text style={styles.value}>{value === null ? "Unavailable" : money(currency, value)}</Text></Pressable>; })}</View> : <View style={styles.empty}><Text style={styles.emptyTitle}>Valuation chart unavailable</Text><Text style={styles.emptyText}>At least two source-backed valuation anchors are required. Current price and intrinsic value remain separate.</Text></View>}{selected ? <View style={styles.selected}><View style={styles.selectedCopy}><Text style={styles.selectedTitle}>{selected.label} anchor · {selected.note}</Text><Text style={styles.selectedBasis}>Basis: {basis}</Text></View><Text style={styles.selectedValue}>{selected.value === null ? "Unavailable" : money(currency, selected.value)}</Text></View> : null}<Text style={styles.footer}>Relative valuation visualization · not a price target or investment recommendation</Text></View>;
}

const styles = StyleSheet.create({ card: { marginTop: 12, padding: 12, borderRadius: 14, backgroundColor: "#111C2D", borderWidth: 1, borderColor: "#26364D" }, header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }, copy: { flex: 1 }, title: { color: "#F4F7FB", fontSize: 13, fontWeight: "800" }, subtitle: { color: "#91A2B8", fontSize: 9, lineHeight: 13, marginTop: 3 }, unit: { color: "#4FD1C5", fontSize: 9, fontWeight: "900" }, rows: { marginTop: 12, gap: 7 }, row: { flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 7, paddingHorizontal: 6, borderRadius: 8 }, rowSelected: { backgroundColor: "#17253A" }, pressed: { opacity: 0.72 }, label: { width: 43, fontSize: 9, fontWeight: "900" }, barTrack: { flex: 1, height: 7, borderRadius: 4, backgroundColor: "#0B1423", overflow: "hidden" }, barFill: { height: 7, borderRadius: 4 }, value: { width: 82, color: "#F4F7FB", fontSize: 9, fontWeight: "800", textAlign: "right" }, selected: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 7, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#26364D" }, selectedCopy: { flex: 1 }, selectedTitle: { color: "#F4F7FB", fontSize: 10, fontWeight: "800" }, selectedBasis: { color: "#6E7D92", fontSize: 8, marginTop: 2 }, selectedValue: { color: "#F4B860", fontSize: 12, fontWeight: "900" }, empty: { minHeight: 90, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 }, emptyTitle: { color: "#F4B860", fontSize: 11, fontWeight: "800" }, emptyText: { color: "#91A2B8", fontSize: 9, lineHeight: 14, textAlign: "center", marginTop: 4 }, footer: { color: "#6E7D92", fontSize: 8, lineHeight: 12, marginTop: 9 } });
