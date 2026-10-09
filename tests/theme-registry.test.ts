import { describe, expect, it } from "vitest";
import { DEFAULT_CUSTOM_PALETTE, GOLD_TOKENS, THEME_DEFINITIONS, getThemeDefinition } from "../lib/theme-registry";

describe("AnalyzerX theme registry", () => {
  it("contains all named premium themes", () => {
    expect(THEME_DEFINITIONS.map((theme) => theme.id)).toEqual(["premium-dark", "ai-futuristic", "fintech", "minimal-modern", "apple-inspired", "luxury", "neon-ai"]);
    expect(THEME_DEFINITIONS.every((theme) => theme.light.background && theme.dark.background && theme.dark.primary)).toBe(true);
  });
  it("keeps the dedicated gold contract stable", () => {
    expect(GOLD_TOKENS).toEqual({ primary: "#FFD700", bright: "#FFEA70", deep: "#D4AF37", highlight: "#FFF4A3" });
    expect(getThemeDefinition("luxury").dark.gold).toBe(GOLD_TOKENS.primary);
  });
  it("provides a complete custom palette baseline", () => {
    expect(DEFAULT_CUSTOM_PALETTE.input).toBeTruthy();
    expect(DEFAULT_CUSTOM_PALETTE.chart1).toBeTruthy();
    expect(DEFAULT_CUSTOM_PALETTE.foreground).toBeTruthy();
  });
});
