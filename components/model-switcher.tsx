import { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import {
  formatBytes,
  getActiveLocalAIModelId,
  getLocalAIDeviceProfile,
  getLocalAIModel,
  getLocalAIRuntime,
  LOCAL_AI_MODELS,
  setActiveLocalAIModelId,
  type LocalAIDeviceProfile,
  type LocalAIModelId,
} from "@/lib/local-ai";
import { localAISession } from "@/lib/local-ai-session";
import { saveMarketChatRuntimeMode, type MarketChatRuntimeMode } from "@/lib/local-preferences";

/**
 * On-screen engine/model switcher for the assistant.
 *
 * Lets the user change which model answers — the hosted "Connected" engine, the
 * "Auto" router, or any on-device model — without leaving the chat. Each model's
 * row shows its real lifecycle state from `localAISession` (Not installed /
 * Verifying / Installed / Loading / Ready / Failed / Unsupported), so the UI only
 * ever says "Ready" after the runtime has actually loaded the model, and never
 * advertises a model that cannot run.
 */

const palette = { background: "#07101F", panel: "#111C2D", border: "#26364D", text: "#F4F7FB", muted: "#91A2B8", amber: "#F4B860", teal: "#4FD1C5", coral: "#FB7185" };

export type ModelSwitcherProps = {
  mode: MarketChatRuntimeMode;
  activeModelId: LocalAIModelId | null;
  onChange: (next: { mode: MarketChatRuntimeMode; activeModelId: LocalAIModelId | null }) => void;
};

type ModelRow = { id: LocalAIModelId; label: string; meta: string; selectable: boolean; stateLabel: string; detail: string; operational: boolean };

export function ModelSwitcher({ mode, activeModelId, onChange }: ModelSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [device, setDevice] = useState<LocalAIDeviceProfile | null>(null);
  const [rows, setRows] = useState<ModelRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [persistedActive, setPersistedActive] = useState<LocalAIModelId | null>(null);
  const nativeRuntimeAvailable = getLocalAIRuntime().isAvailable;

  const label = mode === "auto"
    ? "Auto"
    : mode === "connected"
      ? "Connected"
      : activeModelId
        ? getLocalAIModel(activeModelId).displayName
        : "Local (no model)";

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const profile = await getLocalAIDeviceProfile();
      setDevice(profile);
      setPersistedActive(await getActiveLocalAIModelId());
      const next: ModelRow[] = [];
      for (const model of LOCAL_AI_MODELS) {
        const lifecycle = await localAISession.lifecycleFor(model.id).catch(() => null);
        next.push({
          id: model.id,
          label: model.displayName,
          meta: `${model.sizeLabel} · ${model.capabilities.join(" · ")}`,
          selectable: lifecycle?.canSelect ?? false,
          stateLabel: lifecycle?.label ?? "Unavailable",
          detail: lifecycle?.detail ?? "Lifecycle could not be determined.",
          operational: lifecycle?.canGenerate ?? false,
        });
      }
      setRows(next);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [load, open]);

  // Reflect load/generate transitions while the sheet is open.
  useEffect(() => localAISession.subscribe(() => { if (open) void load(); }), [load, open]);

  const choose = useCallback(async (nextMode: MarketChatRuntimeMode, modelId: LocalAIModelId | null) => {
    await saveMarketChatRuntimeMode(nextMode);
    if (modelId) await setActiveLocalAIModelId(modelId);
    onChange({ mode: nextMode, activeModelId: modelId ?? (nextMode === "connected" ? activeModelId : null) });
    setOpen(false);
  }, [activeModelId, onChange]);

  const installedCount = rows.filter((row) => row.operational || row.stateLabel === "Installed" || row.stateLabel === "Loading").length;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`Assistant model: ${label}. Tap to change.`}
      >
        <Ionicons name={mode === "connected" ? "cloud-outline" : "hardware-chip-outline"} size={14} color={mode === "connected" ? palette.amber : palette.teal} />
        <Text style={styles.chipText} numberOfLines={1}>{label}</Text>
        <Ionicons name="chevron-down" size={13} color={palette.muted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetEyebrow}>ASSISTANT ENGINE</Text>
                <Text style={styles.sheetTitle}>Choose a model</Text>
              </View>
              <Pressable onPress={() => setOpen(false)} style={styles.close} accessibilityLabel="Close model switcher">
                <Ionicons name="close" size={20} color={palette.muted} />
              </Pressable>
            </View>

            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              <Option
                icon="flash-outline"
                title="Auto"
                subtitle="Use the on-device model when one is ready, otherwise the connected engine."
                selected={mode === "auto"}
                onPress={() => void choose("auto", activeModelId)}
              />
              <Option
                icon="cloud-outline"
                title="Connected"
                subtitle="Hosted assistant with verified evidence grounding for market questions."
                selected={mode === "connected"}
                onPress={() => void choose("connected", null)}
              />

              <Text style={styles.sectionLabel}>ON-DEVICE MODELS</Text>
              {busy && !rows.length ? <Text style={styles.note}>Checking installed models…</Text> : null}
              {!nativeRuntimeAvailable ? (
                <Text style={styles.note}>This build has no native local-AI bridge, so on-device models are shown but cannot be selected here.</Text>
              ) : null}
              {rows.map((row) => (
                <Option
                  key={row.id}
                  icon="hardware-chip-outline"
                  title={row.label}
                  subtitle={row.operational ? row.meta : `${row.meta} · ${row.detail}`}
                  selected={mode === "local" && (activeModelId ?? persistedActive) === row.id}
                  disabled={!row.selectable}
                  badge={row.stateLabel.toUpperCase()}
                  onPress={() => void choose("local", row.id)}
                />
              ))}
              {!busy && rows.length === 0 ? <Text style={styles.note}>No catalogued models.</Text> : null}
              <Text style={styles.footer}>
                {device?.totalMemoryBytes ? `${Math.round(device.totalMemoryBytes / 1_000_000_000)} GB RAM · ` : ""}
                {installedCount} model{installedCount === 1 ? "" : "s"} installed
                {device?.freeStorageBytes ? ` · ${formatBytes(device.freeStorageBytes)} free` : ""}
              </Text>
              <Text style={styles.footer}>AnalyzerX loads a model automatically the first time you send a message. Manage downloads in Marketplace → Local AI models.</Text>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function Option({
  icon,
  title,
  subtitle,
  selected,
  disabled,
  badge,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  selected: boolean;
  disabled?: boolean;
  badge?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && !disabled && styles.pressed, disabled && styles.optionDisabled]}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: Boolean(disabled) }}
      accessibilityLabel={`${title}. ${subtitle}`}
    >
      <View style={styles.optionIcon}><Ionicons name={icon} size={17} color={selected ? palette.teal : palette.muted} /></View>
      <View style={styles.optionCopy}>
        <View style={styles.optionTitleRow}>
          <Text style={styles.optionTitle}>{title}</Text>
          {badge ? <Text style={styles.badge}>{badge}</Text> : null}
        </View>
        <Text style={styles.optionSubtitle}>{subtitle}</Text>
      </View>
      {selected ? <Ionicons name="checkmark-circle" size={19} color={palette.teal} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: "row", alignItems: "center", gap: 6, maxWidth: 210, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.panel, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  chipText: { color: palette.text, fontSize: 11, fontWeight: "800", flexShrink: 1 },
  pressed: { opacity: 0.75 },
  backdrop: { flex: 1, backgroundColor: "rgba(4,9,17,0.72)", justifyContent: "flex-end" },
  sheet: { backgroundColor: palette.background, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10, maxHeight: "82%" },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sheetEyebrow: { color: palette.amber, fontSize: 10, fontWeight: "900", letterSpacing: 1.3 },
  sheetTitle: { color: palette.text, fontSize: 20, fontWeight: "900", marginTop: 2 },
  close: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.panel, alignItems: "center", justifyContent: "center" },
  list: { flexGrow: 0 },
  listContent: { paddingBottom: 18, gap: 8 },
  sectionLabel: { color: palette.amber, fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginTop: 10, marginBottom: 2 },
  option: { flexDirection: "row", alignItems: "center", gap: 11, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.panel, borderRadius: 14, padding: 12 },
  optionSelected: { borderColor: palette.teal, backgroundColor: "#0F2830" },
  optionDisabled: { opacity: 0.5 },
  optionIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: "#0C1A29", alignItems: "center", justifyContent: "center" },
  optionCopy: { flex: 1, gap: 3 },
  optionTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  optionTitle: { color: palette.text, fontSize: 14, fontWeight: "800" },
  badge: { color: palette.teal, fontSize: 8, fontWeight: "900", letterSpacing: 0.6, borderWidth: 1, borderColor: "#2C5C57", borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  optionSubtitle: { color: palette.muted, fontSize: 10, lineHeight: 14 },
  note: { color: palette.muted, fontSize: 10, lineHeight: 15, paddingVertical: 6 },
  footer: { color: "#6E7D92", fontSize: 9, lineHeight: 14, textAlign: "center", marginTop: 6 },
});
