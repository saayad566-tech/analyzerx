import { useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export type OperationStage = {
  label: string;
  state: "pending" | "active" | "complete" | "blocked";
  detail?: string;
};

type OperationProgressCardProps = {
  title: string;
  description: string;
  stages: OperationStage[];
  elapsedLabel?: string;
};

const amber = "#F4B860";
const teal = "#4FD1C5";
const muted = "#91A2B8";

export function OperationProgressCard({
  title,
  description,
  stages,
  elapsedLabel,
}: OperationProgressCardProps) {
  const pulse = useRef(new Animated.Value(0.45)).current;
  const activeStage = stages.find((stage) => stage.state === "active");
  const completedCount = stages.filter((stage) => stage.state === "complete").length;
  const progress = stages.length ? Math.round((completedCount / stages.length) * 100) : 0;

  useEffect(() => {
    if (!activeStage) return;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 680, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.42, duration: 680, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [activeStage, pulse]);

  const statusText = useMemo(() => {
    if (activeStage) return activeStage.detail ?? activeStage.label;
    const blocked = stages.find((stage) => stage.state === "blocked");
    return blocked?.detail ?? blocked?.label ?? "Preparing verified result";
  }, [activeStage, stages]);

  return (
    <View style={styles.card} accessibilityLiveRegion="polite">
      <View style={styles.header}>
        <View style={styles.titleCopy}>
          <Text style={styles.eyebrow}>ANALYZERX IS WORKING</Text>
          <Text style={styles.title}>{title}</Text>
        </View>
        <View style={styles.percent}><Text style={styles.percentText}>{progress}%</Text></View>
      </View>
      <Text style={styles.description}>{description}</Text>
      <View style={styles.track}><View style={[styles.fill, { width: `${Math.max(progress, activeStage ? 8 : 0)}%` }]} /></View>
      <View style={styles.stageList}>
        {stages.map((stage) => {
          const complete = stage.state === "complete";
          const active = stage.state === "active";
          const blocked = stage.state === "blocked";
          const color = complete ? teal : blocked ? "#FB7185" : active ? amber : muted;
          return (
            <View key={stage.label} style={styles.stageRow}>
              {active ? <Animated.View style={[styles.dot, { backgroundColor: color, opacity: pulse }]} /> : <View style={[styles.dot, { backgroundColor: color }]} />}
              <View style={styles.stageCopy}>
                <Text style={[styles.stageLabel, { color }]}>{stage.label}</Text>
                {stage.detail && active ? <Text style={styles.stageDetail}>{stage.detail}</Text> : null}
              </View>
              <Ionicons name={complete ? "checkmark-circle" : blocked ? "alert-circle" : active ? "sync" : "ellipse-outline"} size={15} color={color} />
            </View>
          );
        })}
      </View>
      <Text style={styles.status}>{elapsedLabel ? `${statusText} · ${elapsedLabel}` : statusText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#111C2D", borderWidth: 1, borderColor: "#2D5660", borderRadius: 16, padding: 14, marginTop: 14 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  titleCopy: { flex: 1 },
  eyebrow: { color: amber, fontSize: 9, fontWeight: "900", letterSpacing: 1.15 },
  title: { color: "#F4F7FB", fontSize: 15, fontWeight: "800", marginTop: 4 },
  percent: { minWidth: 42, borderRadius: 9, backgroundColor: teal + "18", borderWidth: 1, borderColor: teal + "55", paddingVertical: 5, alignItems: "center" },
  percentText: { color: teal, fontSize: 10, fontWeight: "900" },
  description: { color: muted, fontSize: 10, lineHeight: 15, marginTop: 7 },
  track: { height: 5, overflow: "hidden", borderRadius: 3, backgroundColor: "#26364D", marginTop: 12 },
  fill: { height: "100%", borderRadius: 3, backgroundColor: teal },
  stageList: { gap: 7, marginTop: 12 },
  stageRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  stageCopy: { flex: 1 },
  stageLabel: { fontSize: 10, fontWeight: "800" },
  stageDetail: { color: muted, fontSize: 9, lineHeight: 13, marginTop: 1 },
  status: { color: muted, fontSize: 9, lineHeight: 14, marginTop: 12 },
});
