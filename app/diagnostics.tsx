import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";

import { ScreenContainer } from "@/components/screen-container";
import { clearLastCrash, loadLastCrash } from "@/components/error-boundary";
import {
  activityLogFilePath,
  buildIssueReport,
  clearActivityLog,
  exportActivityLog,
  flushActivityLog,
  readActivityLog,
} from "@/lib/activity-log";
import { ACTIVITY_LOG_FILENAME, formatEntry, type ActivityEntry, type ActivityLevel } from "@/lib/activity-log-core";
import { fireAndForget } from "@/lib/fire-and-forget";

const panel = "#111C2D";
const raised = "#17253A";
const text = "#F4F7FB";
const muted = "#91A2B8";
const amber = "#F4B860";
const teal = "#4FD1C5";
const coral = "#FB7185";
const divider = "#26364D";

const LEVEL_COLOR: Record<ActivityLevel, string> = { info: muted, success: teal, warning: amber, error: coral };
const LEVEL_ICON: Record<ActivityLevel, keyof typeof Ionicons.glyphMap> = {
  info: "information-circle-outline",
  success: "checkmark-circle-outline",
  warning: "warning-outline",
  error: "alert-circle-outline",
};

type CrashRecord = { message: string; at: string; componentStack: string | null };

export default function DiagnosticsScreen() {
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [crash, setCrash] = useState<CrashRecord | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const [log, last, path] = await Promise.all([readActivityLog(), loadLastCrash(), activityLogFilePath()]);
      setEntries(log);
      setCrash(last as CrashRecord | null);
      setFilePath(path);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    fireAndForget(refresh(), "refresh");
  }, [refresh]);

  const onExport = async () => {
    setNotice(null);
    try {
      await flushActivityLog();
      const { uri, text } = await exportActivityLog();
      if (uri && Platform.OS !== "web") {
        await Share.share({ url: uri, message: "AnalyzerX activity log" });
        setNotice("Exported the activity log to a file.");
      } else {
        await Clipboard.setStringAsync(text);
        setNotice("Copied the activity log to the clipboard (no file system on this platform).");
      }
    } catch {
      setNotice("The export could not be completed. The on-device log is unchanged.");
    }
  };

  const onCopyReport = async () => {
    setNotice(null);
    try {
      const report = await buildIssueReport();
      await Clipboard.setStringAsync(`${report.title}\n\n${report.body}`);
      setNotice("Copied a redacted bug report to the clipboard.");
    } catch {
      setNotice("The report could not be prepared.");
    }
  };

  const onClear = async () => {
    setNotice(null);
    await clearActivityLog();
    await clearLastCrash();
    setCrash(null);
    await refresh();
    setNotice("Cleared the activity log and the last recorded crash.");
  };

  const errorCount = (entries ?? []).filter((entry) => entry.level === "error").length;

  return (
    <ScreenContainer className="px-5" edges={["top", "left", "right", "bottom"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={21} color={text} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>SELF-HEALING</Text>
            <Text style={styles.title}>Diagnostics</Text>
          </View>
          <Pressable onPress={() => void refresh()} style={styles.back} accessibilityLabel="Refresh diagnostics">
            <Ionicons name="refresh" size={19} color={amber} />
          </Pressable>
        </View>

        <Text style={styles.subtitle}>
          What the app did, and anything that went wrong, in plain English. No credentials, tokens or
          personal identifiers are ever written here.
        </Text>

        {/* Last crash */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>LAST RECORDED ERROR</Text>
          {busy && entries === null ? (
            <View style={styles.inlineState}>
              <ActivityIndicator color={amber} />
              <Text style={styles.mutedText}>Reading the on-device record…</Text>
            </View>
          ) : crash ? (
            <>
              <View style={styles.crashRow}>
                <Ionicons name={LEVEL_ICON.error} size={18} color={coral} />
                <Text style={styles.crashMessage}>{crash.message}</Text>
              </View>
              <Text style={styles.meta}>Recorded on this device at {new Date(crash.at).toLocaleString()}</Text>
            </>
          ) : (
            <Text style={styles.mutedText}>No screen error has been recorded on this device.</Text>
          )}
        </View>

        {/* Activity log */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardLabel}>ACTIVITY LOG</Text>
            <Text style={styles.countPill}>
              {entries?.length ?? 0} entries · {errorCount} error{errorCount === 1 ? "" : "s"}
            </Text>
          </View>
          {entries === null ? (
            <View style={styles.inlineState}>
              <ActivityIndicator color={amber} />
              <Text style={styles.mutedText}>Loading…</Text>
            </View>
          ) : entries.length === 0 ? (
            <Text style={styles.mutedText}>Nothing has been logged yet on this device.</Text>
          ) : (
            <View style={styles.logList}>
              {[...entries].reverse().slice(0, 60).map((entry, index) => (
                <View key={`${entry.at}-${index}`} style={styles.logRow}>
                  <Ionicons name={LEVEL_ICON[entry.level]} size={14} color={LEVEL_COLOR[entry.level]} />
                  <Text style={styles.logText}>{formatEntry(entry)}</Text>
                </View>
              ))}
              {entries.length > 60 ? <Text style={styles.meta}>Showing the most recent 60 of {entries.length} entries.</Text> : null}
            </View>
          )}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <ActionButton icon="download-outline" label="Export log" onPress={() => void onExport()} />
          <ActionButton icon="copy-outline" label="Copy bug report" onPress={() => void onCopyReport()} />
          <ActionButton icon="trash-outline" label="Clear log" onPress={() => void onClear()} tone={coral} />
        </View>

        {notice ? (
          <View style={styles.notice}>
            <Ionicons name="information-circle-outline" size={16} color={teal} />
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardLabel}>ON-DEVICE FILE</Text>
          <Text style={styles.mono}>{filePath ?? `${ACTIVITY_LOG_FILENAME} (this platform has no file system; entries are kept in local storage)`}</Text>
          <Text style={styles.meta}>
            The log is capped at 500 entries so it can never fill your storage. Exporting writes a
            readable .txt file you can attach to a bug report.
          </Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function ActionButton({ icon, label, onPress, tone = amber }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; tone?: string }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.action, { borderColor: `${tone}55` }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={17} color={tone} />
      <Text style={[styles.actionText, { color: tone }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 44 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 12 },
  headerCopy: { flex: 1 },
  back: { width: 42, height: 42, alignItems: "center", justifyContent: "center", backgroundColor: panel, borderWidth: 1, borderColor: divider, borderRadius: 14 },
  eyebrow: { color: amber, fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  title: { color: text, fontSize: 28, fontWeight: "800", letterSpacing: -0.6, marginTop: 4 },
  subtitle: { color: muted, fontSize: 13, lineHeight: 19, marginTop: 12 },
  card: { backgroundColor: panel, borderWidth: 1, borderColor: divider, borderRadius: 18, padding: 15, marginTop: 14 },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardLabel: { color: amber, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  countPill: { color: muted, fontSize: 10, fontWeight: "700" },
  inlineState: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  mutedText: { color: muted, fontSize: 12, lineHeight: 18, marginTop: 8 },
  crashRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 10 },
  crashMessage: { flex: 1, color: text, fontSize: 13, fontWeight: "700", lineHeight: 19 },
  meta: { color: "#6E7D92", fontSize: 10, lineHeight: 15, marginTop: 8 },
  logList: { marginTop: 10, gap: 8 },
  logRow: { flexDirection: "row", alignItems: "flex-start", gap: 7, borderTopWidth: 1, borderTopColor: "#1E2D42", paddingTop: 8 },
  logText: { flex: 1, color: "#C5D1DE", fontSize: 10, lineHeight: 15, fontFamily: "monospace" },
  actions: { flexDirection: "row", gap: 8, marginTop: 14, flexWrap: "wrap" },
  action: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, backgroundColor: raised, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, minHeight: 44 },
  actionText: { fontSize: 11, fontWeight: "800" },
  pressed: { opacity: 0.75 },
  notice: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: raised, borderRadius: 12, padding: 11, marginTop: 12 },
  noticeText: { flex: 1, color: "#B8C6D6", fontSize: 11, lineHeight: 16 },
  mono: { color: "#B8C6D6", fontSize: 10, lineHeight: 15, marginTop: 8, fontFamily: "monospace" },
});
