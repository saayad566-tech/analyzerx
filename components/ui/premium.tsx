/**
 * Premium component kit.
 *
 * Every screen is built from these primitives so the interface language stays consistent: tone-based
 * surfaces instead of heavy borders, one accent reserved for the primary action, a real type ramp,
 * and tabular figures for numbers. The tokens come from `lib/design/tokens.ts`; nothing here
 * hard-codes a colour or a gap.
 */
import { type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  StyleSheet,
  Text,
  View,
  type ViewProps,
  type ViewStyle,
} from "react-native";

import { color, elevation, motion, radius, space, type } from "@/lib/design/tokens";

type ElevationLevel = keyof typeof elevation;

/* ------------------------------------------------------------------ Surface */

export interface SurfaceProps extends ViewProps {
  /** Elevation level. `card` is the default panel; `high` is for the focused subject. */
  level?: ElevationLevel;
  /** Inner padding step. */
  pad?: keyof typeof space;
  children?: ReactNode;
}

/** A tone-separated panel. This is the only card primitive in the app. */
export function Surface({ level = "card", pad = "lg", style, children, ...rest }: SurfaceProps) {
  return (
    <View
      style={[styles.surface, elevation[level], { padding: space[pad] }, style as ViewStyle]}
      {...rest}
    >
      {children}
    </View>
  );
}

/* ----------------------------------------------------------- Section header */

export interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  /** Right-aligned trailing node (a hint, a count, an action). */
  trailing?: ReactNode;
  style?: ViewStyle;
}

/** An uppercase eyebrow over a title, with optional trailing content. */
export function SectionHeader({ eyebrow, title, trailing, style }: SectionHeaderProps) {
  return (
    <View style={[styles.sectionHeader, style]}>
      <View style={styles.sectionHeaderCopy}>
        {eyebrow ? <Text style={[styles.eyebrow, { color: color.accent }]}>{eyebrow}</Text> : null}
        <Text style={[styles.title, { color: color.text }]}>{title}</Text>
      </View>
      {trailing}
    </View>
  );
}

/* --------------------------------------------------------------------- Stat */

export interface StatProps {
  /** Quiet label above the figure. */
  label: string;
  /** The headline value. Pass a string; the caller formats it. */
  value: string;
  /** Unit or suffix rendered small beside the value. */
  unit?: string;
  /** Optional supporting line under the figure. */
  note?: string;
  /** Tint for the value; defaults to primary text. */
  tint?: string;
  align?: "flex-start" | "center";
}

/** The subject of a screen: one large figure, a quiet label above it. */
export function Stat({ label, value, unit, note, tint, align = "flex-start" }: StatProps) {
  return (
    <View style={{ alignItems: align }}>
      <Text style={[styles.micro, { color: color.textMuted }]}>{label.toUpperCase()}</Text>
      <View style={styles.statValueRow}>
        <Text style={[styles.display, { color: tint ?? color.text }]}>{value}</Text>
        {unit ? <Text style={[styles.caption, { color: color.textMuted, marginBottom: 4 }]}>{unit}</Text> : null}
      </View>
      {note ? <Text style={[styles.caption, { color: color.confirmed, marginTop: space.xxs }]}>{note}</Text> : null}
    </View>
  );
}

/* --------------------------------------------------------------------- Pill */

export type PillTone = "neutral" | "accent" | "confirmed" | "inference" | "alert" | "info";

const PILL_TINT: Record<PillTone, string> = {
  neutral: color.textMuted,
  accent: color.accent,
  confirmed: color.confirmed,
  inference: color.inference,
  alert: color.alert,
  info: color.info,
};

export interface PillProps {
  label: string;
  tone?: PillTone;
  /** Render a leading dot in the tone colour. */
  dot?: boolean;
}

/** A small state chip. Colour carries meaning: confirmed / inference / alert. */
export function Pill({ label, tone = "neutral", dot = false }: PillProps) {
  const tint = PILL_TINT[tone];
  return (
    <View style={[styles.pill, { borderColor: `${tint}55`, backgroundColor: `${tint}1A` }]}>
      {dot ? <View style={[styles.pillDot, { backgroundColor: tint }]} /> : null}
      <Text style={[styles.micro, { color: tint }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

/* -------------------------------------------------------------------- Meter */

export interface MeterProps {
  /** 0–100. */
  value: number;
  tint?: string;
  /** Optional caption under the bar. */
  caption?: string;
}

/** A labelled 0–100 strength bar. */
export function Meter({ value, tint = color.accent, caption }: MeterProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <View>
      <View style={[styles.meterTrack, { backgroundColor: color.border }]}>
        <View style={[styles.meterFill, { width: `${clamped}%`, backgroundColor: tint }]} />
      </View>
      {caption ? (
        <Text style={[styles.caption, { color: color.textFaint, marginTop: space.xs }]}>{caption}</Text>
      ) : null}
    </View>
  );
}

/* --------------------------------------------------------------- Sparkline */

export interface SparklineProps {
  /** Series of 0–100 values, oldest first. */
  values: number[];
  tint?: string;
  height?: number;
}

/** A real trend line: bars scaled to the series' own range, coloured by the caller. */
export function Sparkline({ values, tint = color.accent, height = 64 }: SparklineProps) {
  if (values.length === 0) return null;
  const max = Math.max(...values, 1);
  return (
    <View style={[styles.sparkline, { height }]}>
      {values.map((v, i) => (
        <View
          key={i}
          style={[
            styles.sparkBar,
            {
              height: Math.max(4, Math.round((Math.max(0, Math.min(100, v)) / max) * height)),
              backgroundColor: v >= 80 ? tint : `${tint}66`,
            },
          ]}
        />
      ))}
    </View>
  );
}

/* ------------------------------------------------------------ PrimaryAction */

export interface PrimaryActionProps extends Omit<PressableProps, "children"> {
  label: string;
  /** Optional leading icon node. */
  icon?: ReactNode;
  busy?: boolean;
  disabled?: boolean;
  /** `solid` is the one accent action; `ghost` is a secondary action. */
  variant?: "solid" | "ghost";
  style?: ViewStyle;
}

/** The single primary action on a screen. Only one `solid` per view. */
export function PrimaryAction({
  label,
  icon,
  busy = false,
  disabled = false,
  variant = "solid",
  style,
  ...rest
}: PrimaryActionProps) {
  const inactive = disabled || busy;
  const solid = variant === "solid";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      style={({ pressed }) => [
        styles.action,
        solid
          ? { backgroundColor: color.accent }
          : { backgroundColor: "transparent", borderWidth: 1, borderColor: color.borderStrong },
        inactive && { opacity: 0.5 },
        pressed && !inactive && { opacity: motion.pressOpacity },
        style,
      ]}
      {...rest}
    >
      {busy ? (
        <ActivityIndicator size="small" color={solid ? color.onAccent : color.text} />
      ) : (
        icon
      )}
      <Text style={[styles.label, { color: solid ? color.onAccent : color.text }]}>{label}</Text>
    </Pressable>
  );
}

/* -------------------------------------------------------------- EmptyState */

export interface EmptyStateProps {
  title: string;
  detail?: string;
  tone?: "neutral" | "alert";
}

/** An honest empty / unavailable state. Never a fake row. */
export function EmptyState({ title, detail, tone = "neutral" }: EmptyStateProps) {
  const tint = tone === "alert" ? color.alert : color.textMuted;
  return (
    <View style={[styles.empty, { borderColor: `${tint}44` }]}>
      <Text style={[styles.label, { color: tint }]}>{title}</Text>
      {detail ? (
        <Text style={[styles.caption, { color: color.textFaint, marginTop: space.xs }]}>{detail}</Text>
      ) : null}
    </View>
  );
}

/* ---------------------------------------------------------------- Divider */

export function Divider({ style }: { style?: ViewStyle }) {
  return <View style={[styles.divider, style]} />;
}

const styles = StyleSheet.create({
  surface: { borderRadius: radius.lg },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: space.md,
  },
  sectionHeaderCopy: { flex: 1 },
  eyebrow: { ...type.eyebrow, textTransform: "uppercase" },
  title: { ...type.title, marginTop: space.xs },
  micro: { ...type.micro },
  caption: { ...type.caption },
  label: { ...type.label },
  display: { ...type.display },
  statValueRow: { flexDirection: "row", alignItems: "flex-end", gap: space.xs },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    borderWidth: 1,
    borderRadius: radius.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    alignSelf: "flex-start",
  },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  meterTrack: { height: 5, borderRadius: 3, overflow: "hidden" },
  meterFill: { height: 5, borderRadius: 3 },
  sparkline: { flexDirection: "row", alignItems: "flex-end", gap: space.xs },
  sparkBar: { width: 7, borderRadius: 4 },
  action: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    minHeight: 48,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
  },
  empty: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: radius.md,
    padding: space.lg,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: color.border, marginVertical: space.md },
});
