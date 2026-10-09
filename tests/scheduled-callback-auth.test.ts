import { describe, expect, it } from "vitest";
import { isScheduledCallbackAuthorized } from "../server/_core/scheduled-auth";

describe("scheduled callback authorization", () => {
  it("rejects missing production tokens", () => {
    expect(isScheduledCallbackAuthorized(undefined, undefined, true)).toBe(false);
    expect(isScheduledCallbackAuthorized("expected", undefined, true)).toBe(false);
  });

  it("requires an exact configured token", () => {
    expect(isScheduledCallbackAuthorized("expected", "expected", true)).toBe(true);
    expect(isScheduledCallbackAuthorized("expected", "wrong", true)).toBe(false);
  });

  it("allows tokenless callbacks only in non-production development", () => {
    expect(isScheduledCallbackAuthorized(undefined, undefined, false)).toBe(true);
  });
});
