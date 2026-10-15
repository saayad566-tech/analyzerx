import { describe, expect, it } from "vitest";

import {
  EXPO_PUSH_BATCH_SIZE,
  MAX_PUSH_PAGES,
  PUSH_TOKEN_PAGE_LIMIT_DEFAULT,
  PUSH_TOKEN_PAGE_LIMIT_MAX,
  normalizePushTokenPage,
  pageOffset,
} from "../server/push-batching";

/**
 * These lock in the fix for a real delivery bug: the push sender used to load every enabled token
 * in one unbounded query and post them in a single Expo request. Expo accepts at most 100 messages
 * per request, so delivery broke once more than 100 devices were registered.
 */
describe("push batching limits", () => {
  it("keeps the Expo per-request message cap at 100", () => {
    expect(EXPO_PUSH_BATCH_SIZE).toBe(100);
  });

  it("keeps a finite safety bound on pages", () => {
    expect(MAX_PUSH_PAGES).toBeGreaterThan(0);
    expect(Number.isFinite(MAX_PUSH_PAGES)).toBe(true);
  });
});

describe("normalizePushTokenPage", () => {
  it("uses safe defaults when nothing is supplied", () => {
    expect(normalizePushTokenPage()).toEqual({ limit: PUSH_TOKEN_PAGE_LIMIT_DEFAULT, offset: 0 });
  });

  it("never returns a zero, negative or fractional limit", () => {
    expect(normalizePushTokenPage({ limit: 0 }).limit).toBe(1);
    expect(normalizePushTokenPage({ limit: -50 }).limit).toBe(1);
    expect(normalizePushTokenPage({ limit: 12.9 }).limit).toBe(12);
  });

  it("caps the limit so a page can never be unbounded", () => {
    expect(normalizePushTokenPage({ limit: 1_000_000 }).limit).toBe(PUSH_TOKEN_PAGE_LIMIT_MAX);
  });

  it("never returns a negative offset", () => {
    expect(normalizePushTokenPage({ offset: -100 }).offset).toBe(0);
  });

  it("falls back to safe values for non-finite input", () => {
    expect(normalizePushTokenPage({ limit: Number.NaN }).limit).toBe(PUSH_TOKEN_PAGE_LIMIT_DEFAULT);
    expect(normalizePushTokenPage({ offset: Number.NaN }).offset).toBe(0);
    expect(normalizePushTokenPage({ limit: Number.POSITIVE_INFINITY }).limit).toBe(PUSH_TOKEN_PAGE_LIMIT_MAX);
  });
});

describe("pageOffset", () => {
  it("walks forward in page-sized steps", () => {
    expect(pageOffset(0)).toBe(0);
    expect(pageOffset(1)).toBe(EXPO_PUSH_BATCH_SIZE);
    expect(pageOffset(3)).toBe(3 * EXPO_PUSH_BATCH_SIZE);
  });

  it("accepts a custom page size", () => {
    expect(pageOffset(2, 25)).toBe(50);
  });

  it("treats a negative or non-finite page as the first page", () => {
    expect(pageOffset(-4)).toBe(0);
    expect(pageOffset(Number.NaN)).toBe(0);
  });
});
