import { describe, expect, it } from "vitest";
import { resolveBackAction, resolveRootBackFeedback } from "../lib/navigation-back";

describe("AnalyzerX Back navigation", () => {
  it("returns through the existing route stack first", () => {
    expect(resolveBackAction(true, "/market-country")).toBe("stack");
  });

  it("falls back to Home when a non-root route has no history", () => {
    expect(resolveBackAction(false, "/market-country")).toBe("home");
    expect(resolveBackAction(false, "/sector/renewables")).toBe("home");
  });

  it("stays on the root tab screen instead of exiting unexpectedly", () => {
    expect(resolveBackAction(false, "/(tabs)")).toBe("stay");
    expect(resolveBackAction(false, "/(tabs)/index")).toBe("stay");
    expect(resolveBackAction(false, "/")).toBe("stay");
  });

  it("confirms on the first root Back and exits only within the two-second window", () => {
    expect(resolveRootBackFeedback(0, 10_000)).toBe("confirm");
    expect(resolveRootBackFeedback(10_000, 11_999)).toBe("exit");
    expect(resolveRootBackFeedback(10_000, 12_000)).toBe("confirm");
  });
});
