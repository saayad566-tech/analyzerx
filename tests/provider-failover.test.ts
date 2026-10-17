import { describe, expect, it } from "vitest";
import {
  AllProvidersFailed,
  FailoverEngine,
  ProviderDown,
  RateLimited,
  maskKey,
  type Transport,
} from "../packages/quant-engine/src/failover";

/** A deterministic clock + sleep, so the engine is tested without a single real timer. */
function clock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
    advance: (ms: number) => {
      t += ms;
    },
    get time() {
      return t;
    },
  };
}

const JITTER = () => 0.5; // deterministic

function ok(value: unknown, remaining?: number): { value: unknown; remaining?: number } {
  return { value, remaining };
}

describe("failover engine", () => {
  it("rotates to the next key the instant one is rate-limited", async () => {
    const c = clock();
    const seen: string[] = [];
    const transport: Transport = async (key) => {
      seen.push(key);
      if (key === "primary-key-1111") throw new RateLimited();
      return ok("result");
    };
    const engine = new FailoverEngine(
      [{ config: { name: "primary", keys: ["primary-key-1111", "primary-key-2222"] }, transport }],
      { now: c.now, sleep: c.sleep, jitter: JITTER },
    );

    const out = await engine.call({ q: 1 });
    expect(out.provider).toBe("primary");
    expect(out.key).toBe("primary-key-2222");
    expect(out.value).toBe("result");
    expect(seen).toEqual(["primary-key-1111", "primary-key-2222"]); // no pause between keys

    const report = engine.report();
    expect(report.find((r) => r.key === "****1111")?.available).toBe(false);
    expect(report.find((r) => r.key === "****2222")?.available).toBe(true);
    expect(report.find((r) => r.key === "****2222")?.successes).toBe(1);
  });

  it("honours Retry-After over its own backoff", async () => {
    const c = clock();
    const transport: Transport = async (key) => {
      if (key === "primary-key-1111") throw new RateLimited(9_000);
      return ok("ok");
    };
    const engine = new FailoverEngine(
      [{ config: { name: "primary", keys: ["primary-key-1111", "primary-key-2222"] }, transport }],
      { now: c.now, sleep: c.sleep, jitter: JITTER },
    );
    await engine.call({});
    const k1 = engine.report().find((r) => r.key === "****1111");
    expect(k1?.cooldownRemainingMs).toBe(9_000);
  });

  it("fails over to the free provider once every key of the primary is exhausted", async () => {
    const c = clock();
    const primary: Transport = async () => {
      throw new RateLimited();
    };
    const local: Transport = async () => ok("local-result");
    const engine = new FailoverEngine(
      [
        { config: { name: "primary", keys: ["primary-key-1111", "primary-key-2222", "primary-key-3333"] }, transport: primary },
        { config: { name: "free-local", keys: ["local-key-9999"], free: true }, transport: local },
      ],
      { now: c.now, sleep: c.sleep, jitter: JITTER },
    );

    const out = await engine.call({});
    expect(out.provider).toBe("free-local");
    expect(out.value).toBe("local-result");
  });

  it("stops trying a provider's other keys once it is down", async () => {
    const c = clock();
    const calls: string[] = [];
    const primary: Transport = async (key) => {
      calls.push(key);
      throw new ProviderDown("503");
    };
    const local: Transport = async () => ok("local-key-9999");
    const engine = new FailoverEngine(
      [
        { config: { name: "primary", keys: ["primary-key-1111", "primary-key-2222"] }, transport: primary },
        { config: { name: "free-local", keys: ["local-key-9999"], free: true }, transport: local },
      ],
      { now: c.now, sleep: c.sleep, jitter: JITTER },
    );

    const out = await engine.call({});
    expect(out.provider).toBe("free-local");
    expect(calls).toEqual(["primary-key-1111"]); // k2 was never tried
  });

  it("raises AllProvidersFailed with the per-attempt detail when nothing works", async () => {
    const c = clock();
    const bad: Transport = async () => {
      throw new RateLimited();
    };
    const engine = new FailoverEngine(
      [{ config: { name: "primary", keys: ["primary-key-1111", "primary-key-2222"] }, transport: bad }],
      { now: c.now, sleep: c.sleep, jitter: JITTER },
    );

    await expect(engine.call({})).rejects.toBeInstanceOf(AllProvidersFailed);
    try {
      await engine.call({});
    } catch (err) {
      const e = err as AllProvidersFailed;
      expect(e.attempts.length).toBeGreaterThan(0);
      expect(e.attempts[0].provider).toBe("primary");
    }
  });

  it("returns a cooled-down key to the pool on its own", async () => {
    const c = clock();
    const transport: Transport = async (key) => {
      if (key === "primary-key-1111" && c.time === 0) throw new RateLimited(1_000);
      return ok("ok");
    };
    const engine = new FailoverEngine(
      [{ config: { name: "primary", keys: ["primary-key-1111", "primary-key-2222"] }, transport }],
      { now: c.now, sleep: c.sleep, jitter: JITTER },
    );

    await engine.call({}); // k1 cools
    expect(engine.report().find((r) => r.key === "****1111")?.available).toBe(false);

    c.advance(1_500); // the cooldown expires
    expect(engine.report().find((r) => r.key === "****1111")?.available).toBe(true);

    const out = await engine.call({});
    expect(out.key).toBe("primary-key-1111"); // back in priority position
  });

  it("records remaining quota reported by the provider", async () => {
    const c = clock();
    const engine = new FailoverEngine(
      [{ config: { name: "primary", keys: ["primary-key-1111"] }, transport: async () => ok("v", 42) }],
      { now: c.now, sleep: c.sleep, jitter: JITTER },
    );
    await engine.call({});
    expect(engine.report()[0].remaining).toBe(42);
  });

  it("throttles to the provider's minimum interval", async () => {
    const c = clock();
    const engine = new FailoverEngine(
      [{ config: { name: "primary", keys: ["primary-key-1111"], minIntervalMs: 250 }, transport: async () => ok("v") }],
      { now: c.now, sleep: c.sleep, jitter: JITTER },
    );
    await engine.call({});
    const afterFirst = c.time;
    await engine.call({});
    expect(c.time - afterFirst).toBeGreaterThanOrEqual(250);
  });

  it("never exposes a raw key in its report", async () => {
    const c = clock();
    const secret = "sk-live-abcdefghijklmnop";
    const engine = new FailoverEngine(
      [{ config: { name: "primary", keys: [secret] }, transport: async () => ok("v") }],
      { now: c.now, sleep: c.sleep, jitter: JITTER },
    );
    await engine.call({});
    const serialised = JSON.stringify(engine.report());
    expect(serialised).not.toContain(secret);
    expect(maskKey(secret)).toBe("****mnop");
    expect(maskKey("ab")).toBe("****");
  });
});
