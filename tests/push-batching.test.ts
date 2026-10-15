import { describe, expect, it } from "vitest";

import {
  EXPO_PUSH_BATCH_SIZE,
  FCM_PAGE_SIZE,
  MAX_PUSH_PAGES,
  PUSH_BATCH_LIMIT,
  PUSH_TOKEN_PAGE_LIMIT_DEFAULT,
  PUSH_TOKEN_PAGE_LIMIT_MAX,
  chunkTokens,
  classifyExpoTickets,
  classifyFcmMessage,
  emptyOutcome,
  extractFcmErrorCode,
  isExpoPushToken,
  isFcmToken,
  isRetryableStatus,
  mergeOutcomes,
  normalizePushTokenPage,
  pageOffset,
  pushBackoffMs,
  pushBatchLimit,
  retryAfterMs,
  selectPushProvider,
  tokenMatchesProvider,
} from "../server/push-batching";

/**
 * These lock in the push fixes: provider-sized batching (Expo 100, FCM 500), dead-token
 * classification, and safe paging arithmetic.
 */

describe("batch limits", () => {
  it("keeps the documented per-provider caps", () => {
    expect(EXPO_PUSH_BATCH_SIZE).toBe(100);
    expect(FCM_PAGE_SIZE).toBe(500);
    expect(PUSH_BATCH_LIMIT.expo).toBe(100);
    expect(PUSH_BATCH_LIMIT.fcm).toBe(500);
  });

  it("reports the batch size for a provider", () => {
    expect(pushBatchLimit("expo")).toBe(100);
    expect(pushBatchLimit("fcm")).toBe(500);
  });

  it("keeps a finite page bound", () => {
    expect(MAX_PUSH_PAGES).toBeGreaterThan(0);
    expect(Number.isFinite(MAX_PUSH_PAGES)).toBe(true);
  });
});

describe("provider selection stays free", () => {
  it("uses FCM only when it is configured, otherwise the free Expo transport", () => {
    expect(selectPushProvider({ fcmConfigured: true })).toBe("fcm");
    expect(selectPushProvider({ fcmConfigured: false })).toBe("expo");
  });
});

describe("token shape", () => {
  it("recognises Expo device tokens", () => {
    expect(isExpoPushToken("ExponentPushToken[abc123]")).toBe(true);
    expect(isExpoPushToken("ExpoPushToken[abc123]")).toBe(true);
    expect(isExpoPushToken("dGhpc2lzYW5mY210b2tlbnZhbHVl")).toBe(false);
  });

  it("rejects anything too short or clearly Expo-shaped as an FCM token", () => {
    expect(isFcmToken("short")).toBe(false);
    expect(isFcmToken("ExponentPushToken[abc123]")).toBe(false);
    expect(isFcmToken("dGhpc2lzYW5mY210b2tlbnZhbHVlMTIzNDU2")).toBe(true);
  });

  it("matches a token to the selected provider", () => {
    expect(tokenMatchesProvider("ExponentPushToken[a]", "expo")).toBe(true);
    expect(tokenMatchesProvider("ExponentPushToken[a]", "fcm")).toBe(false);
    expect(tokenMatchesProvider("dGhpc2lzYW5mY210b2tlbnZhbHVlMTIzNDU2", "fcm")).toBe(true);
    expect(tokenMatchesProvider("dGhpc2lzYW5mY210b2tlbnZhbHVlMTIzNDU2", "expo")).toBe(false);
  });
});

describe("chunkTokens boundary arithmetic", () => {
  it("splits 250 tokens into 100 + 100 + 50", () => {
    const pages = chunkTokens(Array.from({ length: 250 }, (_, i) => `t${i}`), 100);
    expect(pages.map((page) => page.length)).toEqual([100, 100, 50]);
  });

  it("handles exact multiples without an empty trailing page", () => {
    expect(chunkTokens(Array.from({ length: 100 }, (_, i) => `t${i}`), 100).map((p) => p.length)).toEqual([100]);
    expect(chunkTokens(Array.from({ length: 101 }, (_, i) => `t${i}`), 100).map((p) => p.length)).toEqual([100, 1]);
  });

  it("returns nothing for no tokens and never loops on a bad page size", () => {
    expect(chunkTokens([], 100)).toEqual([]);
    expect(chunkTokens(["a", "b"], 0).map((p) => p.length)).toEqual([1, 1]);
  });
});

describe("normalizePushTokenPage / pageOffset", () => {
  it("uses safe defaults", () => {
    expect(normalizePushTokenPage()).toEqual({ limit: PUSH_TOKEN_PAGE_LIMIT_DEFAULT, offset: 0 });
  });

  it("never returns a zero, negative or fractional limit", () => {
    expect(normalizePushTokenPage({ limit: 0 }).limit).toBe(1);
    expect(normalizePushTokenPage({ limit: -50 }).limit).toBe(1);
    expect(normalizePushTokenPage({ limit: 12.9 }).limit).toBe(12);
  });

  it("caps the limit so a page can never be unbounded", () => {
    expect(normalizePushTokenPage({ limit: 1_000_000 }).limit).toBe(PUSH_TOKEN_PAGE_LIMIT_MAX);
    expect(normalizePushTokenPage({ limit: Number.POSITIVE_INFINITY }).limit).toBe(PUSH_TOKEN_PAGE_LIMIT_MAX);
  });

  it("never returns a negative offset and handles non-finite input", () => {
    expect(normalizePushTokenPage({ offset: -100 }).offset).toBe(0);
    expect(normalizePushTokenPage({ offset: Number.NaN }).offset).toBe(0);
    expect(normalizePushTokenPage({ limit: Number.NaN }).limit).toBe(PUSH_TOKEN_PAGE_LIMIT_DEFAULT);
  });

  it("walks forward in page-sized steps", () => {
    expect(pageOffset(0)).toBe(0);
    expect(pageOffset(3)).toBe(3 * EXPO_PUSH_BATCH_SIZE);
    expect(pageOffset(2, 25)).toBe(50);
    expect(pageOffset(-4)).toBe(0);
  });
});

describe("backoff and retry classification", () => {
  it("grows with the attempt and stays capped", () => {
    const first = pushBackoffMs(1);
    expect(first).toBeGreaterThanOrEqual(500);
    expect(first).toBeLessThan(800);
    expect(pushBackoffMs(10)).toBeLessThanOrEqual(8_000 + 250);
  });

  it("parses Retry-After seconds and caps it", () => {
    expect(retryAfterMs("2")).toBe(2_000);
    expect(retryAfterMs("999")).toBe(8_000);
    expect(retryAfterMs("not-a-date")).toBeNull();
    expect(retryAfterMs(null)).toBeNull();
  });

  it("treats only the transient HTTP classes as retryable", () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(408)).toBe(true);
    expect(isRetryableStatus(404)).toBe(false);
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(200)).toBe(false);
  });
});

describe("Expo ticket classification", () => {
  it("splits ok / dead / retryable / failed by ticket", () => {
    const tokens = ["ExponentPushToken[a]", "ExponentPushToken[b]", "ExponentPushToken[c]", "ExponentPushToken[d]"];
    const outcome = classifyExpoTickets(tokens, {
      data: [
        { status: "ok", id: "1" },
        { status: "error", details: { error: "DeviceNotRegistered" } },
        { status: "error", details: { error: "MessageRateExceeded" } },
        { status: "error", message: "SomethingElse" },
      ],
    });
    expect(outcome.delivered).toBe(1);
    expect(outcome.deadTokens).toEqual(["ExponentPushToken[b]"]);
    expect(outcome.retryableTokens).toEqual(["ExponentPushToken[c]"]);
    expect(outcome.failedTokens).toEqual(["ExponentPushToken[d]"]);
  });

  it("treats a missing ticket list as a whole-page failure", () => {
    const outcome = classifyExpoTickets(["ExponentPushToken[a]"], {});
    expect(outcome.delivered).toBe(0);
    expect(outcome.failedTokens).toEqual(["ExponentPushToken[a]"]);
    expect(outcome.errors.length).toBeGreaterThan(0);
  });

  it("marks tokens with no matching ticket as failed rather than delivered", () => {
    const outcome = classifyExpoTickets(["ExponentPushToken[a]", "ExponentPushToken[b]"], { data: [{ status: "ok" }] });
    expect(outcome.delivered).toBe(1);
    expect(outcome.failedTokens).toEqual(["ExponentPushToken[b]"]);
  });
});

describe("FCM error classification", () => {
  it("treats UNREGISTERED and NOT_REGISTERED as dead", () => {
    expect(classifyFcmMessage(404, { error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } })).toEqual({ status: "dead", reason: "UNREGISTERED" });
    expect(classifyFcmMessage(200, { error: { details: [{ errorCode: "NOT_REGISTERED" }] } }).status).toBe("dead");
  });

  it("treats UNAVAILABLE / INTERNAL / QUOTA_EXCEEDED as retryable", () => {
    expect(classifyFcmMessage(503, { error: { status: "UNAVAILABLE" } }).status).toBe("retryable");
    expect(classifyFcmMessage(500, { error: { details: [{ errorCode: "INTERNAL" }] } }).status).toBe("retryable");
    expect(classifyFcmMessage(429, { error: { details: [{ errorCode: "QUOTA_EXCEEDED" }] } }).status).toBe("retryable");
  });

  it("treats INVALID_ARGUMENT as permanently invalid, not retryable", () => {
    expect(classifyFcmMessage(400, { error: { details: [{ errorCode: "INVALID_ARGUMENT" }] } }).status).toBe("invalid");
  });

  it("treats a clean 2xx as delivered", () => {
    expect(classifyFcmMessage(200, { name: "projects/x/messages/1" })).toEqual({ status: "delivered" });
  });

  it("extracts the error code, falling back to the status", () => {
    expect(extractFcmErrorCode({ error: { details: [{ errorCode: "UNREGISTERED" }] } })).toBe("UNREGISTERED");
    expect(extractFcmErrorCode({ error: { status: "UNAVAILABLE" } })).toBe("UNAVAILABLE");
    expect(extractFcmErrorCode({})).toBeNull();
    expect(extractFcmErrorCode(null)).toBeNull();
  });
});

describe("outcome merging", () => {
  it("sums delivered and concatenates the token lists", () => {
    const merged = mergeOutcomes(
      { ...emptyOutcome(), delivered: 2, deadTokens: ["a"] },
      { ...emptyOutcome(), delivered: 3, deadTokens: ["b"], retryableTokens: ["c"] },
    );
    expect(merged.delivered).toBe(5);
    expect(merged.deadTokens).toEqual(["a", "b"]);
    expect(merged.retryableTokens).toEqual(["c"]);
  });
});
