import { describe, expect, it } from "vitest";
import { getGdeltBudgetStatus, recordGdeltFailure, reserveGdeltRequest } from "../server/gdelt-budget";

describe("GDELT request budget", () => {
  it("tracks bounded reservations and reports remaining capacity", () => {
    const before = getGdeltBudgetStatus();
    reserveGdeltRequest();
    const after = getGdeltBudgetStatus();
    expect(after.requestsInWindow).toBeGreaterThanOrEqual(before.requestsInWindow);
    expect(after.remaining).toBeLessThanOrEqual(after.maxRequestsPerWindow);
  });

  it("records retryable failures with an adaptive cooldown", () => {
    recordGdeltFailure(new Error("HTTP 429"), 429);
    const status = getGdeltBudgetStatus();
    expect(status.consecutiveFailures).toBeGreaterThan(0);
    expect(status.nextAllowedAt).toBeTruthy();
    expect(status.lastStatus).toBe(429);
  });
});
