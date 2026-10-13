import { describe, expect, it } from "vitest";

import { EDGE_TO_EDGE_ENABLED, computeKeyboardPadding, keyboardAvoidingBehavior, keyboardVerticalOffset, shouldLiftComposer } from "../lib/keyboard-avoidance";

describe("keyboardAvoidingBehavior (mandate §2)", () => {
  it("pads on iOS", () => {
    expect(keyboardAvoidingBehavior("ios", true)).toBe("padding");
    expect(keyboardAvoidingBehavior("ios", false)).toBe("padding");
  });

  it("pads on Android when edge-to-edge is enabled (the reported bug)", () => {
    // With edge-to-edge the activity no longer resizes, so `undefined` left the
    // composer under the keyboard.
    expect(keyboardAvoidingBehavior("android", true)).toBe("padding");
  });

  it("stays undefined on Android without edge-to-edge to avoid double-shifting", () => {
    expect(keyboardAvoidingBehavior("android", false)).toBeUndefined();
  });

  it("does nothing on web/other platforms", () => {
    expect(keyboardAvoidingBehavior("web", true)).toBeUndefined();
    expect(keyboardAvoidingBehavior("macos", true)).toBeUndefined();
  });

  it("matches the project's actual edge-to-edge configuration", () => {
    // android/gradle.properties sets expo.edgeToEdgeEnabled=true, so the default
    // must be true or Android would silently get no keyboard avoidance again.
    expect(EDGE_TO_EDGE_ENABLED).toBe(true);
    expect(keyboardAvoidingBehavior("android")).toBe("padding");
  });

  it("never returns a negative offset", () => {
    expect(keyboardVerticalOffset(0)).toBe(0);
    expect(keyboardVerticalOffset(-10)).toBe(0);
    expect(keyboardVerticalOffset(24)).toBe(24);
    expect(keyboardVerticalOffset(24, 8)).toBe(32);
    expect(keyboardVerticalOffset(24, -100)).toBe(24);
  });
});

describe("computeKeyboardPadding (Android composer lift)", () => {
  it("lifts the composer by the keyboard height minus the safe-area inset", () => {
    // Double padding would leave a gap; no padding leaves the composer covered.
    expect(computeKeyboardPadding(300, 48)).toBe(252);
    expect(computeKeyboardPadding(300, 0)).toBe(300);
  });

  it("never returns a negative or NaN padding", () => {
    expect(computeKeyboardPadding(10, 48)).toBe(0);
    expect(computeKeyboardPadding(Number.NaN, 20)).toBe(0);
    expect(computeKeyboardPadding(-5, 20)).toBe(0);
    expect(computeKeyboardPadding(300, Number.NaN)).toBe(300);
  });

  it("defers to KeyboardAvoidingView on iOS", () => {
    expect(computeKeyboardPadding(300, 48, "ios")).toBe(0);
  });

  it("reports whether the composer must be lifted", () => {
    expect(shouldLiftComposer(300)).toBe(true);
    expect(shouldLiftComposer(0)).toBe(false);
    expect(shouldLiftComposer(300, "ios")).toBe(false);
  });
});
