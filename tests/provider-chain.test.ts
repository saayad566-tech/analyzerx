import { describe, expect, it } from "vitest";

import { buildChain, describeChainResult, runWithFallback, type ChainSource } from "../lib/provider-chain";

const ok = <T,>(id: string, value: T): ChainSource<T> => ({ id, run: async () => value });
const boom = <T,>(id: string): ChainSource<T> => ({ id, run: async () => { throw new Error("provider down"); } });
const slow = <T,>(id: string, value: T, ms: number): ChainSource<T> => ({ id, run: () => new Promise((resolve) => setTimeout(() => resolve(value), ms)) });

describe("provider fallback chain (redundant data sources)", () => {
  it("uses the first source whose result validates", async () => {
    const result = await runWithFallback([ok("a", { quote: 1 }), ok("b", { quote: 2 })], { validate: () => true });
    expect(result.sourceId).toBe("a");
    expect(result.value).toEqual({ quote: 1 });
    expect(result.exhausted).toBe(false);
  });

  it("falls through to the next source when one throws", async () => {
    const result = await runWithFallback([boom("a"), ok("b", { quote: 2 })], { validate: () => true });
    expect(result.sourceId).toBe("b");
    expect(result.attempts.map((attempt) => attempt.status)).toEqual(["failed", "used"]);
  });

  it("falls through when a source returns a value that fails validation", async () => {
    // Validation is mandatory: a chain without it would return wrong-market data.
    const result = await runWithFallback(
      [ok("wrong-market", { market: "IN" }), ok("right-market", { market: "US" })],
      { validate: (value) => value.market === "US" },
    );
    expect(result.sourceId).toBe("right-market");
    expect(result.attempts[0].status).toBe("rejected");
  });

  it("gives up on a slow source and uses a later one", async () => {
    const result = await runWithFallback([slow("slow", { quote: 1 }, 200), ok("fast", { quote: 2 })], { validate: () => true, timeoutMs: 40 });
    expect(result.sourceId).toBe("fast");
    expect(result.attempts[0].status).toBe("timed-out");
  });

  it("returns exhausted with a null value when every source fails", async () => {
    const result = await runWithFallback([boom("a"), boom("b"), boom("c")], { validate: () => true });
    expect(result.value).toBeNull();
    expect(result.sourceId).toBeNull();
    expect(result.exhausted).toBe(true);
    expect(result.attempts).toHaveLength(3);
  });

  it("never returns a value when the validator rejects everything", async () => {
    const result = await runWithFallback([ok("a", 1), ok("b", 2)], { validate: () => false });
    expect(result.value).toBeNull();
    expect(result.exhausted).toBe(true);
  });

  it("honours maxAttempts so a long source list cannot run unbounded", async () => {
    const sources = [boom<number>("a"), boom<number>("b"), ok("c", 3)];
    const result = await runWithFallback(sources, { validate: () => true, maxAttempts: 2 });
    expect(result.sourceId).toBeNull();
    expect(result.attempts).toHaveLength(2);
  });

  it("survives a validator that itself throws", async () => {
    const result = await runWithFallback([ok("a", 1), ok("b", 2)], {
      validate: (value) => {
        if (value === 1) throw new Error("bad validator");
        return true;
      },
    });
    expect(result.sourceId).toBe("b");
  });

  it("handles an empty source list without throwing", async () => {
    const result = await runWithFallback<number>([], { validate: () => true });
    expect(result.exhausted).toBe(true);
    expect(result.attempts).toEqual([]);
  });

  it("reports which sources failed, so the state is visible not silent", async () => {
    const served = await runWithFallback([boom("a"), ok("b", 1)], { validate: () => true });
    expect(describeChainResult(served)).toMatch(/served by b/i);
    expect(describeChainResult(served)).toMatch(/1 source failed/i);

    const dead = await runWithFallback([boom("a"), boom("b")], { validate: () => true });
    expect(describeChainResult(dead)).toMatch(/unavailable rather than substituted/i);
    expect(describeChainResult(dead)).toContain("a (failed)");

    expect(describeChainResult(await runWithFallback<number>([], { validate: () => true }))).toMatch(/no source is configured/i);
  });

  it("builds a chain from a partly-configured source list", () => {
    const chain = buildChain<number>([
      { id: "configured", run: async () => 1 },
      { id: "missing", run: null },
      { id: "", run: async () => 2 },
    ]);
    expect(chain.map((source) => source.id)).toEqual(["configured"]);
  });
});
