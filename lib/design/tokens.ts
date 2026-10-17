/**
 * AnalyzerX design tokens — the single source of truth for the premium interface language.
 *
 * The app previously carried its palette inline: screens hard-coded `#F4B860`, `#111C2D` and so on,
 * so a colour or spacing decision could not be changed in one place. This module is that place.
 *
 * Structure
 * - `palette`   — the raw colours, named by role (not by hue), so intent survives a re-theme.
 * - `color`     — semantic aliases the UI actually reads (surface, text, accent, state).
 * - `space`     — a 4-pt scale. Nothing in the UI should invent a gap outside it.
 * - `radius`    — corner scale, so cards and chips stay in proportion.
 * - `type`      — a real type ramp with line heights, plus tabular figures for numbers.
 * - `elevation` — a dark-UI elevation ladder expressed as surface tone + hairline, not heavy shadow
 *                 (a shadow on a near-black canvas reads as mud; a tone step reads as raised).
 * - `motion`    — durations and easing for press/hover feedback.
 *
 * The visual language: a deep, near-black "ink" field, panels separated by TONE rather than by
 * heavy borders, a single warm signal accent reserved for the one primary action on a screen, and
 * cool confirmed/inference hues for factual vs. model-generated content.
 */
import type { TextStyle } from "react-native";

export const palette = {
  // Field — the canvas the app sits on.
  ink900: "#070A10",
  ink800: "#0A0E16",
  ink700: "#0E141F",

  // Panels — separated by tone, not by a stroke.
  panel: "#121A28",
  panelRaised: "#172134",
  panelHigh: "#1D2A41",

  // Text.
  textPrimary: "#F5F8FC",
  textSecondary: "#9AA9BE",
  textTertiary: "#6C7C93",

  // Brand + state.
  signal: "#FF6B35", // the single primary-action accent
  amber: "#F4B860", // scores, high-signal markers
  teal: "#4FD1C5", // confirmed / positive
  violet: "#A78BFA", // inference / model-generated
  coral: "#FB7185", // alert / negative
  sky: "#5EA9FF", // informational

  // Lines.
  hairline: "#222F45",
  hairlineStrong: "#2E3D57",

  // Absolute.
  white: "#FFFFFF",
  black: "#000000",
} as const;

/** Semantic colour roles. Screens read these, never `palette` directly. */
export const color = {
  canvas: palette.ink900,
  canvasRaised: palette.ink800,

  surface: palette.panel,
  surfaceRaised: palette.panelRaised,
  surfaceHigh: palette.panelHigh,

  text: palette.textPrimary,
  textMuted: palette.textSecondary,
  textFaint: palette.textTertiary,

  accent: palette.signal,
  score: palette.amber,
  confirmed: palette.teal,
  inference: palette.violet,
  alert: palette.coral,
  info: palette.sky,

  border: palette.hairline,
  borderStrong: palette.hairlineStrong,

  onAccent: palette.ink900,
  onLight: palette.ink900,
} as const;

/** 4-pt spacing scale. */
export const space = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
} as const;

/** Corner radii. */
export const radius = {
  xs: 8,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  pill: 999,
} as const;

/**
 * Type ramp. `figure` uses tabular figures so numbers do not jitter as they update, and `display`
 * is reserved for the one headline number per screen. Typed as `TextStyle` (a type-only import) so
 * each entry spreads straight into a `StyleSheet` without a cast.
 */
export type TypeRole =
  | "display"
  | "figure"
  | "title"
  | "body"
  | "label"
  | "caption"
  | "micro"
  | "eyebrow";

export const type: Record<TypeRole, TextStyle> = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: "800", letterSpacing: -0.8 },
  figure: { fontSize: 24, lineHeight: 30, fontWeight: "800", letterSpacing: -0.3, fontVariant: ["tabular-nums"] },
  title: { fontSize: 17, lineHeight: 22, fontWeight: "800", letterSpacing: -0.2 },
  body: { fontSize: 14, lineHeight: 20, fontWeight: "500" },
  label: { fontSize: 12, lineHeight: 16, fontWeight: "700", letterSpacing: 0.2 },
  caption: { fontSize: 11, lineHeight: 15, fontWeight: "600" },
  micro: { fontSize: 10, lineHeight: 13, fontWeight: "700", letterSpacing: 0.6 },
  /** Uppercase section eyebrow. Pair with `textTransform: "uppercase"`. */
  eyebrow: { fontSize: 10, lineHeight: 13, fontWeight: "800", letterSpacing: 1.4 },
};

/**
 * Elevation on a dark canvas: a tone step plus a hairline, never a heavy shadow. `level` maps to a
 * surface tone; `hairline` marks the edge when a card sits on an equal tone.
 */
export const elevation = {
  flat: { backgroundColor: color.canvas, borderWidth: 0 },
  card: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.border },
  raised: { backgroundColor: color.surfaceRaised, borderWidth: 1, borderColor: color.border },
  high: { backgroundColor: color.surfaceHigh, borderWidth: 1, borderColor: color.borderStrong },
} as const;

/** Motion durations (ms) and easing for feedback. */
export const motion = {
  instant: 90,
  quick: 150,
  base: 220,
  slow: 320,
  /** Press feedback opacity for tappable surfaces. */
  pressOpacity: 0.72,
} as const;

export const tokens = { palette, color, space, radius, type, elevation, motion };

export type Tokens = typeof tokens;
export type ColorRole = keyof typeof color;
export type SpaceStep = keyof typeof space;
export type RadiusStep = keyof typeof radius;
