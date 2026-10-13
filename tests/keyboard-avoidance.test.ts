import { describe, expect, it } from "vitest";

import { EDGE_TO_EDGE_ENABLED, keyboardAvoidingBehavior, keyboardVerticalOffset } from "../lib/keyboard-avoidance";

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
