import { type ColorScheme, type ThemeColorPalette } from "@/constants/theme";
import { useThemeContext } from "@/lib/theme-provider";

export function useColors(_colorSchemeOverride?: ColorScheme): ThemeColorPalette {
  const { palette } = useThemeContext();
  return {
    ...palette,
    text: palette.foreground,
    background: palette.background,
    tint: palette.primary,
    icon: palette.muted,
    tabIconDefault: palette.muted,
    tabIconSelected: palette.primary,
    border: palette.border,
  } as unknown as ThemeColorPalette;
}
