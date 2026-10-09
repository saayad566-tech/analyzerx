import type { ColorScheme } from "./_core/theme";

export type ThemeId = "premium-dark" | "ai-futuristic" | "fintech" | "minimal-modern" | "apple-inspired" | "luxury" | "neon-ai" | "custom";
export type ThemeMode = ColorScheme | "system";

export type ThemePalette = {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  surfaceElevated: string;
  foreground: string;
  muted: string;
  border: string;
  success: string;
  warning: string;
  error: string;
  gold: string;
  goldBright: string;
  goldDeep: string;
  goldHighlight: string;
  chart1: string;
  chart2: string;
  chart3: string;
  input: string;
};

export type ThemeDefinition = {
  id: Exclude<ThemeId, "custom">;
  name: string;
  description: string;
  mood: string;
  light: ThemePalette;
  dark: ThemePalette;
};

const make = (colors: Partial<ThemePalette> & Pick<ThemePalette, "primary" | "secondary" | "accent" | "background" | "surface" | "foreground">): ThemePalette => ({
  primary: colors.primary, secondary: colors.secondary, accent: colors.accent, background: colors.background, surface: colors.surface, surfaceElevated: colors.surfaceElevated ?? colors.surface, foreground: colors.foreground, muted: colors.muted ?? (colors.background === "#FFFFFF" ? "#64748B" : "#94A3B8"), border: colors.border ?? (colors.background === "#FFFFFF" ? "#E2E8F0" : "#26364D"), success: colors.success ?? "#10B981", warning: colors.warning ?? "#F59E0B", error: colors.error ?? "#F43F5E", gold: colors.gold ?? "#FFD700", goldBright: colors.goldBright ?? "#FFEA70", goldDeep: colors.goldDeep ?? "#D4AF37", goldHighlight: colors.goldHighlight ?? "#FFF4A3", chart1: colors.chart1 ?? colors.primary, chart2: colors.chart2 ?? colors.secondary, chart3: colors.chart3 ?? colors.accent, input: colors.input ?? colors.surface,
});

const darkBase = { background: "#070B16", surface: "#111827", foreground: "#F8FAFC" };
const lightBase = { background: "#FFFFFF", surface: "#F8FAFC", foreground: "#111827" };

export const THEME_DEFINITIONS: ThemeDefinition[] = [
  { id: "premium-dark", name: "Premium Dark", description: "Deep navy terminal with indigo and purple signal accents.", mood: "Focused, high-contrast, institutional", dark: make({ ...darkBase, primary: "#6366F1", secondary: "#8B5CF6", accent: "#A78BFA", surfaceElevated: "#172036", input: "#0D1424" }), light: make({ ...lightBase, primary: "#4F46E5", secondary: "#7C3AED", accent: "#6366F1" }) },
  { id: "ai-futuristic", name: "AI Futuristic", description: "Purple and cyan with restrained neon energy for AI workflows.", mood: "Experimental, intelligent, vivid", dark: make({ ...darkBase, primary: "#7C3AED", secondary: "#06B6D4", accent: "#22D3EE", surfaceElevated: "#17152E", input: "#0B1220" }), light: make({ ...lightBase, primary: "#6D28D9", secondary: "#0891B2", accent: "#0E7490" }) },
  { id: "fintech", name: "Fintech", description: "Clean white workspace with blue trust and green outcome signals.", mood: "Professional, calm, data-first", dark: make({ ...darkBase, primary: "#60A5FA", secondary: "#34D399", accent: "#93C5FD", surface: "#111827", surfaceElevated: "#1F2937" }), light: make({ ...lightBase, primary: "#2563EB", secondary: "#10B981", accent: "#0EA5E9", surfaceElevated: "#FFFFFF", input: "#F1F5F9" }) },
  { id: "minimal-modern", name: "Minimal Modern", description: "Quiet black or white surfaces with disciplined indigo emphasis.", mood: "Editorial, restrained, precise", dark: make({ ...darkBase, primary: "#6366F1", secondary: "#818CF8", accent: "#C7D2FE" }), light: make({ ...lightBase, primary: "#4F46E5", secondary: "#6366F1", accent: "#818CF8" }) },
  { id: "apple-inspired", name: "Apple-Inspired", description: "Soft light surfaces, familiar blue actions, and green confirmations.", mood: "Approachable, polished, familiar", dark: make({ ...darkBase, primary: "#0A84FF", secondary: "#30D158", accent: "#64D2FF", surface: "#1C1C1E", surfaceElevated: "#2C2C2E", input: "#1C1C1E" }), light: make({ ...lightBase, primary: "#007AFF", secondary: "#34C759", accent: "#5AC8FA", surface: "#F2F2F7", surfaceElevated: "#FFFFFF", input: "#F2F2F7", border: "#D1D1D6" }) },
  { id: "luxury", name: "Luxury", description: "Near-black canvas with selective metallic gold highlights.", mood: "Premium, confident, collectible", dark: make({ ...darkBase, primary: "#FFD700", secondary: "#D4AF37", accent: "#FFEA70", surface: "#111111", surfaceElevated: "#1A1710", input: "#141414", chart1: "#FFD700", chart2: "#D4AF37", chart3: "#FFF4A3" }), light: make({ ...lightBase, primary: "#9A6B00", secondary: "#B8860B", accent: "#D4AF37", surface: "#FFFCF0", surfaceElevated: "#FFFFFF", input: "#FFF9DE", border: "#E8D99B" }) },
  { id: "neon-ai", name: "Neon AI", description: "Indigo, purple, cyan, and gold for advanced AI operations.", mood: "Bold, futuristic, high-signal", dark: make({ ...darkBase, primary: "#6366F1", secondary: "#8B5CF6", accent: "#06B6D4", surface: "#0E1022", surfaceElevated: "#171631", input: "#0A0D1A", chart1: "#06B6D4", chart2: "#FFD700", chart3: "#A78BFA" }), light: make({ ...lightBase, primary: "#4F46E5", secondary: "#7C3AED", accent: "#0891B2" }) },
];

export const DEFAULT_THEME_ID: ThemeId = "luxury";
export const DEFAULT_THEME_MODE: ThemeMode = "dark";
export const GOLD_TOKENS = { primary: "#FFD700", bright: "#FFEA70", deep: "#D4AF37", highlight: "#FFF4A3" } as const;
export const getThemeDefinition = (id: ThemeId) => THEME_DEFINITIONS.find((theme) => theme.id === id) ?? THEME_DEFINITIONS[5];
export const DEFAULT_CUSTOM_PALETTE: ThemePalette = getThemeDefinition("luxury").dark;
