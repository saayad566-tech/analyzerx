import { describe, expect, it } from "vitest";
import { runChain, runMerge, allLinkHealth, linkHealth } from "../lib/open-data/chain";

describe("provider chain failover", () => {
  it("falls through to the next provider when the primary fails", async () => {
    const outcome = await runChain<string>([
      { key: "primary", name: "Primary", run: async () => { throw new Error("primary down"); } },
      { key: "secondary", name: "Secondary", run: async () => "from-secondary" },
    ]);
    expect(outcome.value).toBe("from-secondary");
    expect(outcome.provider).toBe("secondary");
    expect(outcome.degraded).toBe(true);
    expect(outcome.attempts[0]).toMatchObject({ key: "primary", ok: false });
    expect(outcome.attempts[1]).toMatchObject({ key: "secondary", ok: true });
  });

  it("treats an empty result as a failure and keeps going", async () => {
    const outcome = await runChain<string[]>([
      { key: "empty", name: "Empty", run: async () => [] },
      { key: "real", name: "Real", run: async () => ["a"] },
    ]);
    expect(outcome.provider).toBe("real");
    expect(outcome.value).toEqual(["a"]);
    expect(outcome.attempts[0].ok).toBe(false);
  });

  it("returns null and reports every attempt when all providers fail", async () => {
    const outcome = await runChain<string>([
      { key: "a", name: "A", run: async () => { throw new Error("a down"); } },
      { key: "b", name: "B", run: async () => { throw new Error("b down"); } },
      { key: "c", name: "C", run: async () => null },
    ]);
    expect(outcome.value).toBeNull();
    expect(outcome.provider).toBeNull();
    expect(outcome.degraded).toBe(true);
    expect(outcome.attempts).toHaveLength(3);
    expect(outcome.attempts.every((attempt) => !attempt.ok)).toBe(true);
    expect(outcome.attempts.map((attempt) => attempt.key)).toEqual(["a", "b", "c"]);
  });

  it("stops at the first provider that answers, so a later one is never called", async () => {
    let thirdCalled = false;
    const outcome = await runChain<string>([
      { key: "first", name: "First", run: async () => "ok" },
      { key: "second", name: "Second", run: async () => { thirdCalled = true; return "no"; } },
    ]);
    expect(outcome.provider).toBe("first");
    expect(thirdCalled).toBe(false);
  });

  it("records per-link health for the ops screens", async () => {
    // The chain short-circuits on the first success, so the failing link must
    // come first for it to actually be attempted and recorded.
    await runChain([
      { key: "health-bad", name: "Bad", run: async () => { throw new Error("boom"); } },
      { key: "health-ok", name: "OK", run: async () => "value" },
    ]);
    expect(linkHealth("health-ok").status).toBe("live");
    expect(linkHealth("health-bad").status).toBe("error");
    expect(linkHealth("health-bad").lastError).toContain("boom");
    expect(linkHealth("health-bad").consecutiveFailures).toBeGreaterThan(0);
    expect(allLinkHealth().some((entry) => entry.key === "health-ok")).toBe(true);
  });
});

describe("provider merge (news redundancy)", () => {
  it("combines every provider that answers and de-duplicates by key", async () => {
    const outcome = await runMerge<{ id: string; title: string }>(
      [
        { key: "feed-a", name: "Feed A", run: async () => [{ id: "1", title: "shared" }, { id: "2", title: "only-a" }] },
        { key: "feed-b", name: "Feed B", run: async () => [{ id: "1", title: "shared" }, { id: "3", title: "only-b" }] },
      ],
      { key: (item) => item.id },
    );
    expect(outcome.items.map((item) => item.id).sort()).toEqual(["1", "2", "3"]);
    expect(outcome.providers.map((provider) => provider.key)).toEqual(["feed-a", "feed-b"]);
    expect(outcome.providers.every((provider) => provider.status === "live")).toBe(true);
  });

  it("still returns the surviving feed's items when one provider is down", async () => {
    const outcome = await runMerge<{ id: string }>(
      [
        { key: "down", name: "Down", run: async () => { throw new Error("offline"); } },
        { key: "up", name: "Up", run: async () => [{ id: "x" }] },
      ],
      { key: (item) => item.id },
    );
    expect(outcome.items).toEqual([{ id: "x" }]);
    expect(outcome.degraded).toBe(true);
    const down = outcome.providers.find((provider) => provider.key === "down");
    expect(down?.status).toBe("error");
  });

  it("reports an unavailable provider that answers with an empty feed", async () => {
    const outcome = await runMerge<{ id: string }>(
      [
        { key: "empty", name: "Empty", run: async () => [] },
        { key: "up", name: "Up", run: async () => [{ id: "y" }] },
      ],
      { key: (item) => item.id },
    );
    expect(outcome.providers.find((provider) => provider.key === "empty")?.status).toBe("unavailable");
  });
});

describe("circuit breaker", () => {
  it("skips a link after repeated failures instead of paying the timeout again", async () => {
    let calls = 0;
    const failing = {
      key: "breaker-flaky",
      name: "Flaky",
      run: async () => {
        calls += 1;
        throw new Error("still down");
      },
    };
    const fallback = { key: "breaker-fallback", name: "Fallback", run: async () => "served" };

    for (let i = 0; i < 3; i += 1) {
      const outcome = await runChain([failing, fallback]);
      expect(outcome.value).toBe("served");
    }
    expect(calls).toBe(3);

    // Fourth call: the breaker is open, so the flaky link is not invoked at all.
    const outcome = await runChain([failing, fallback]);
    expect(calls).toBe(3);
    expect(outcome.value).toBe("served");
    expect(outcome.attempts[0].error).toMatch(/circuit open/i);
  });

  it("still tries every link when all of them are open, so it can recover", async () => {
    let calls = 0;
    const link = {
      key: "breaker-all",
      name: "All",
      run: async () => {
        calls += 1;
        throw new Error("down");
      },
    };
    for (let i = 0; i < 3; i += 1) await runChain([link]);
    const before = calls;
    await runChain([link]);
    expect(calls).toBe(before + 1);
  });
});
