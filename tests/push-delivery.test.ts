import { describe, expect, it, vi } from "vitest";

import { EXPO_PUSH_URL, deliverPush, sendExpoPage, sendFcmPage, withRetry, PushRequestError, type PushHttpResponse, type PushTransport } from "../server/push-delivery";

/**
 * The delivery loop is exercised with a stub transport, so paging, retry, dead-token cleanup and
 * the cursor behaviour are all verified without a network or a device.
 */

const noSleep = async () => undefined;

function response(status: number, body: unknown, headers: Record<string, string> = {}): PushHttpResponse {
  return { ok: status >= 200 && status < 300, status, headers: { get: (name) => headers[name.toLowerCase()] ?? null }, json: async () => body };
}

/** A transport that replays a queue of responses and records every call. */
function queueTransport(responses: PushHttpResponse[]) {
  const calls: { url: string; body: string; headers: Record<string, string> }[] = [];
  let index = 0;
  const transport: PushTransport = async (url, init) => {
    calls.push({ url, body: init.body, headers: init.headers });
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return next;
  };
  return { transport, calls };
}

/** Emulate the keyset read the database performs. */
function tokenSource(tokens: string[]) {
  const cursors: (string | null)[] = [];
  return {
    cursors,
    readPage: async (cursor: string | null, limit: number) => {
      cursors.push(cursor);
      return tokens
        .filter((token) => cursor === null || token > cursor)
        .slice(0, limit)
        .map((token) => ({ token }));
    },
  };
}

const expoTokens = (n: number) => Array.from({ length: n }, (_, i) => `ExponentPushToken[${String(i).padStart(4, "0")}]`);

describe("withRetry", () => {
  it("retries a retryable error then succeeds", async () => {
    let attempts = 0;
    const result = await withRetry(async () => {
      attempts += 1;
      if (attempts < 3) throw new PushRequestError("transient", true);
      return "ok";
    }, { sleep: noSleep });
    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("does not retry a non-retryable error", async () => {
    let attempts = 0;
    await expect(withRetry(async () => {
      attempts += 1;
      throw new PushRequestError("permanent", false);
    }, { sleep: noSleep })).rejects.toThrow("permanent");
    expect(attempts).toBe(1);
  });

  it("honours an explicit Retry-After delay", async () => {
    const delays: number[] = [];
    let attempts = 0;
    await withRetry(async () => {
      attempts += 1;
      if (attempts === 1) throw new PushRequestError("rate limited", true, 1_234);
      return "ok";
    }, { sleep: async (ms) => { delays.push(ms); } });
    expect(delays).toEqual([1_234]);
  });
});

describe("sendExpoPage", () => {
  it("classifies a normal response", async () => {
    const { transport } = queueTransport([response(200, { data: [{ status: "ok" }, { status: "error", details: { error: "DeviceNotRegistered" } }] })]);
    const outcome = await sendExpoPage(transport, ["ExponentPushToken[a]", "ExponentPushToken[b]"], { title: "t", body: "b" }, { sleep: noSleep });
    expect(outcome.delivered).toBe(1);
    expect(outcome.deadTokens).toEqual(["ExponentPushToken[b]"]);
  });

  it("retries a 429 and then delivers", async () => {
    const { transport, calls } = queueTransport([response(429, {}, { "retry-after": "1" }), response(200, { data: [{ status: "ok" }] })]);
    const outcome = await sendExpoPage(transport, ["ExponentPushToken[a]"], { title: "t", body: "b" }, { sleep: noSleep });
    expect(calls).toHaveLength(2);
    expect(outcome.delivered).toBe(1);
  });

  it("marks the page retryable when it keeps failing transiently", async () => {
    const { transport } = queueTransport([response(503, {})]);
    const outcome = await sendExpoPage(transport, ["ExponentPushToken[a]"], { title: "t", body: "b" }, { attempts: 2, sleep: noSleep });
    expect(outcome.retryableTokens).toEqual(["ExponentPushToken[a]"]);
  });

  it("marks the page failed on a non-retryable HTTP status", async () => {
    const { transport, calls } = queueTransport([response(400, {})]);
    const outcome = await sendExpoPage(transport, ["ExponentPushToken[a]"], { title: "t", body: "b" }, { sleep: noSleep });
    expect(calls).toHaveLength(1);
    expect(outcome.failedTokens).toEqual(["ExponentPushToken[a]"]);
  });
});

describe("sendFcmPage", () => {
  it("sends one message per token with the bearer token and classifies dead tokens", async () => {
    const { transport, calls } = queueTransport([
      response(200, { name: "projects/p/messages/1" }),
      response(404, { error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } }),
      response(503, { error: { status: "UNAVAILABLE" } }),
    ]);
    const outcome = await sendFcmPage(transport, ["token-aaaaaaaaaaaaaaaaaaaa", "token-bbbbbbbbbbbbbbbbbbbb", "token-cccccccccccccccccccc"], { title: "t", body: "b", data: { id: 7 } }, { accessToken: "at", projectId: "proj", sleep: noSleep, attempts: 1 });
    expect(calls).toHaveLength(3);
    expect(calls[0].url).toContain("/v1/projects/proj/messages:send");
    expect(calls[0].headers.Authorization).toBe("Bearer at");
    expect(outcome.delivered).toBe(1);
    expect(outcome.deadTokens).toEqual(["token-bbbbbbbbbbbbbbbbbbbb"]);
    expect(outcome.retryableTokens).toEqual(["token-cccccccccccccccccccc"]);
    // FCM requires string data values.
    expect(JSON.parse(calls[0].body).message.data).toEqual({ id: "7" });
  });
});

describe("deliverPush loop", () => {
  it("pages 250 Expo tokens as 100 + 100 + 50 and delivers all", async () => {
    const tokens = expoTokens(250);
    const source = tokenSource(tokens);
    const { transport, calls } = queueTransport([
      response(200, { data: Array.from({ length: 100 }, () => ({ status: "ok" })) }),
      response(200, { data: Array.from({ length: 100 }, () => ({ status: "ok" })) }),
      response(200, { data: Array.from({ length: 50 }, () => ({ status: "ok" })) }),
    ]);
    const summary = await deliverPush({
      provider: "expo",
      transport,
      readPage: source.readPage,
      deactivate: async () => 0,
      notification: { title: "t", body: "b" },
      sleep: noSleep,
    });
    expect(calls).toHaveLength(3);
    expect(summary.pages).toBe(3);
    expect(summary.delivered).toBe(250);
    expect(summary.noRecipients).toBe(false);
  });

  it("advances by cursor so deactivating dead tokens cannot skip a live device", async () => {
    const tokens = expoTokens(150);
    const source = tokenSource(tokens);
    const { transport } = queueTransport([
      response(200, { data: [...Array.from({ length: 99 }, () => ({ status: "ok" })), { status: "error", details: { error: "DeviceNotRegistered" } }] }),
      response(200, { data: Array.from({ length: 50 }, () => ({ status: "ok" })) }),
    ]);
    const deactivated: string[][] = [];
    const summary = await deliverPush({
      provider: "expo",
      transport,
      readPage: source.readPage,
      deactivate: async (dead) => { deactivated.push(dead); return dead.length; },
      notification: { title: "t", body: "b" },
      sleep: noSleep,
    });
    // The second read must resume after the last token of the first page, not at an offset.
    expect(source.cursors[0]).toBeNull();
    expect(source.cursors[1]).toBe(tokens[99]);
    expect(deactivated[0]).toEqual([tokens[99]]);
    expect(summary.deactivated).toBe(1);
    expect(summary.delivered).toBe(149);
  });

  it("reports noRecipients when every token is the wrong shape for the provider", async () => {
    const source = tokenSource(["ExponentPushToken[a]", "ExponentPushToken[b]"]);
    const { transport, calls } = queueTransport([response(200, { data: [] })]);
    const summary = await deliverPush({
      provider: "fcm",
      transport,
      readPage: source.readPage,
      deactivate: async () => 0,
      notification: { title: "t", body: "b" },
      accessToken: "at",
      projectId: "p",
      sleep: noSleep,
    });
    expect(calls).toHaveLength(0);
    expect(summary.noRecipients).toBe(true);
    expect(summary.delivered).toBe(0);
  });

  it("stops and reports when the token page cannot be read", async () => {
    const summary = await deliverPush({
      provider: "expo",
      transport: queueTransport([response(200, { data: [] })]).transport,
      readPage: async () => { throw new Error("database unavailable"); },
      deactivate: async () => 0,
      notification: { title: "t", body: "b" },
      sleep: noSleep,
    });
    expect(summary.delivered).toBe(0);
    expect(summary.errors.join(" ")).toContain("database unavailable");
  });

  it("respects the page bound", async () => {
    const tokens = expoTokens(1000);
    const source = tokenSource(tokens);
    const { transport, calls } = queueTransport([response(200, { data: Array.from({ length: 100 }, () => ({ status: "ok" })) })]);
    const summary = await deliverPush({
      provider: "expo",
      transport,
      readPage: source.readPage,
      deactivate: async () => 0,
      notification: { title: "t", body: "b" },
      maxPages: 2,
      sleep: noSleep,
    });
    expect(calls).toHaveLength(2);
    expect(summary.pages).toBe(2);
  });

  it("does not deactivate anything when every token is healthy", async () => {
    const source = tokenSource(expoTokens(3));
    const { transport } = queueTransport([response(200, { data: [{ status: "ok" }, { status: "ok" }, { status: "ok" }] })]);
    const deactivate = vi.fn(async () => 0);
    const summary = await deliverPush({
      provider: "expo",
      transport,
      readPage: source.readPage,
      deactivate,
      notification: { title: "t", body: "b" },
      sleep: noSleep,
    });
    expect(deactivate).not.toHaveBeenCalled();
    expect(summary.deactivated).toBe(0);
  });

  it("uses the FCM transport when FCM is selected and credentials are present", async () => {
    const source = tokenSource(["token-aaaaaaaaaaaaaaaaaaaa", "token-bbbbbbbbbbbbbbbbbbbb"]);
    const { transport, calls } = queueTransport([response(200, { name: "ok" }), response(404, { error: { details: [{ errorCode: "UNREGISTERED" }] } })]);
    const summary = await deliverPush({
      provider: "fcm",
      transport,
      readPage: source.readPage,
      deactivate: async () => 1,
      notification: { title: "t", body: "b" },
      accessToken: "at",
      projectId: "proj",
      sleep: noSleep,
    });
    expect(calls[0].url).toContain("fcm.googleapis.com");
    expect(summary.delivered).toBe(1);
    expect(summary.deadTokens).toEqual(["token-bbbbbbbbbbbbbbbbbbbb"]);
    expect(summary.deactivated).toBe(1);
  });
});
