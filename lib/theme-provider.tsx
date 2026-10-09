import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Appearance, View, useColorScheme as useSystemColorScheme } from "react-native";
import { colorScheme as nativewindColorScheme, vars } from "nativewind";

import { DEFAULT_CUSTOM_PALETTE, DEFAULT_THEME_ID, DEFAULT_THEME_MODE, getThemeDefinition, type ThemeId, type ThemeMode, type ThemePalette } from "@/lib/theme-registry";

const STORAGE_KEY = "analyzerx.appearance.v2";

type ThemeContextValue = {
  themeId: ThemeId;
  mode: ThemeMode;
  colorScheme: "light" | "dark";
  palette: ThemePalette;
  setThemeId: (id: ThemeId) => void;
  setMode: (mode: ThemeMode) => void;
  setColorScheme: (scheme: "light" | "dark") => void;
  setCustomPalette: (palette: Partial<ThemePalette>) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveScheme(mode: ThemeMode, systemScheme: "light" | "dark"): "light" | "dark" { return mode === "system" ? systemScheme : mode; }

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useSystemColorScheme() ?? "dark";
  const [themeId, setThemeIdState] = useState<ThemeId>(DEFAULT_THEME_ID);
  const [mode, setModeState] = useState<ThemeMode>(DEFAULT_THEME_MODE);
  const [customPalette, setCustomPaletteState] = useState<ThemePalette>(DEFAULT_CUSTOM_PALETTE);
  const colorScheme = resolveScheme(mode, systemScheme);
  const definition = getThemeDefinition(themeId === "custom" ? DEFAULT_THEME_ID : themeId);
  const palette = themeId === "custom" ? customPalette : definition[colorScheme];

  const applyPalette = useCallback((nextPalette: ThemePalette, scheme: "light" | "dark") => {
    nativewindColorScheme.set(scheme);
    Appearance.setColorScheme?.(scheme);
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      root.dataset.theme = scheme;
      root.dataset.analyzerxTheme = themeId;
      root.classList.toggle("dark", scheme === "dark");
      Object.entries(nextPalette).forEach(([token, value]) => root.style.setProperty(`--color-${token}`, value));
    }
  }, [themeId]);

  const persist = useCallback(async (next: { themeId: ThemeId; mode: ThemeMode; customPalette: ThemePalette }) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);
  const setThemeId = useCallback((id: ThemeId) => { setThemeIdState(id); void persist({ themeId: id, mode, customPalette }); }, [customPalette, mode, persist]);
  const setMode = useCallback((nextMode: ThemeMode) => { setModeState(nextMode); void persist({ themeId, mode: nextMode, customPalette }); }, [customPalette, persist, themeId]);
  const setColorScheme = useCallback((scheme: "light" | "dark") => setMode(scheme), [setMode]);
  const setCustomPalette = useCallback((patch: Partial<ThemePalette>) => { const nextPalette = { ...customPalette, ...patch }; setCustomPaletteState(nextPalette); setThemeIdState("custom"); void persist({ themeId: "custom", mode, customPalette: nextPalette }); }, [customPalette, mode, persist]);

  useEffect(() => { void AsyncStorage.getItem(STORAGE_KEY).then((raw) => { if (!raw) return; try { const saved = JSON.parse(raw) as Partial<{ themeId: ThemeId; mode: ThemeMode; customPalette: ThemePalette }>; if (saved.themeId) setThemeIdState(saved.themeId); if (saved.mode) setModeState(saved.mode); if (saved.customPalette) setCustomPaletteState({ ...DEFAULT_CUSTOM_PALETTE, ...saved.customPalette }); } catch { /* ignore corrupt appearance preference */ } }); }, []);
  useEffect(() => { applyPalette(palette, colorScheme); }, [applyPalette, colorScheme, palette]);

  const themeVariables = useMemo(() => vars(Object.fromEntries(Object.entries(palette).map(([token, value]) => [`color-${token}`, value]))), [palette]);
  const value = useMemo(() => ({ themeId, mode, colorScheme, palette, setThemeId, setMode, setColorScheme, setCustomPalette }), [colorScheme, mode, palette, setColorScheme, setCustomPalette, setMode, setThemeId, themeId]);
  return <ThemeContext.Provider value={value}><View style={[{ flex: 1 }, themeVariables]}>{children}</View></ThemeContext.Provider>;
}

export function useThemeContext(): ThemeContextValue { const ctx = useContext(ThemeContext); if (!ctx) throw new Error("useThemeContext must be used within ThemeProvider"); return ctx; }
