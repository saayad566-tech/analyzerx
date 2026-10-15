import { describe, expect, it } from "vitest";

import { displayText, humanize, joinList, listLength } from "../lib/safe-text";

describe("humanize (crash guard)", () => {
  it("never throws on a missing or non-string value", () => {
    // This is the exact case that crashed ScreenerScreen:
    // "Cannot read property 'replaceAll' of undefined".
    for (const value of [undefined, null, 0, {}, [], Number.NaN]) {
      expect(() => humanize(value)).not.toThrow();
      expect(humanize(value)).toBe("Unavailable");
    }
  });

  it("humanises enum tokens", () => {
    expect(humanize("strong_buy")).toBe("strong buy");
    expect(humanize("mixed-cap")).toBe("mixed cap");
    expect(humanize("buyback")).toBe("buyback");
    expect(humanize("  hold  ")).toBe("hold");
  });

  it("supports a dash separator", () => {
    expect(humanize("adapter-state", "-")).toBe("adapter state");
  });

  it("treats an empty string as unavailable rather than rendering blank", () => {
    expect(humanize("")).toBe("Unavailable");
    expect(humanize("   ")).toBe("Unavailable");
  });
});

describe("joinList / listLength (crash guards)", () => {
  it("never throws on a missing list", () => {
    for (const value of [undefined, null, "text", 42, {}]) {
      expect(() => joinList(value)).not.toThrow();
      expect(joinList(value)).toBe("");
      expect(listLength(value)).toBe(0);
    }
  });

  it("joins only non-empty strings", () => {
    expect(joinList(["a", "", null, "b", 3])).toBe("a, b");
    expect(joinList(["a", "b"], " / ")).toBe("a / b");
    expect(listLength(["a", "b"])).toBe(2);
  });
});

describe("displayText", () => {
  it("returns a usable string for any value", () => {
    expect(displayText("Reliance")).toBe("Reliance");
    expect(displayText("  ")).toBe("Unavailable");
    expect(displayText(12)).toBe("12");
    expect(displayText(undefined, "Unknown")).toBe("Unknown");
  });
});
