import { describe, expect, it } from "vitest";

import { BackpressureQueue, RingBuffer, aggregateTicksToCandles, feedHealth, type Tick } from "../lib/quant/stream-buffer";

/**
 * A market feed can outrun the UI. The correct answer is bounded memory with visible backpressure —
 * an unbounded buffer turns a latency problem into an out-of-memory crash.
 */

describe("RingBuffer", () => {
  it("fills to capacity and reports its size", () => {
    const ring = new RingBuffer<number>(3);
    ring.push(1);
    ring.push(2);
    expect(ring.size).toBe(2);
    expect(ring.isFull).toBe(false);
  });

  it("overwrites the oldest entry and counts the drop", () => {
    const ring = new RingBuffer<number>(3);
    [1, 2, 3, 4, 5].forEach((value) => ring.push(value));
    expect(ring.size).toBe(3);
    expect(ring.dropped).toBe(2);
    expect(ring.toArray()).toEqual([3, 4, 5]);
    expect(ring.isFull).toBe(true);
  });

  it("returns the newest entry from latest()", () => {
    const ring = new RingBuffer<string>(2);
    expect(ring.latest()).toBeNull();
    ring.push("a");
    ring.push("b");
    expect(ring.latest()).toBe("b");
  });

  it("clears everything including the drop count", () => {
    const ring = new RingBuffer<number>(1);
    ring.push(1);
    ring.push(2);
    ring.clear();
    expect(ring.size).toBe(0);
    expect(ring.dropped).toBe(0);
    expect(ring.toArray()).toEqual([]);
  });

  it("refuses an invalid capacity rather than silently misbehaving", () => {
    expect(() => new RingBuffer<number>(0)).toThrow();
    expect(() => new RingBuffer<number>(-1)).toThrow();
    expect(() => new RingBuffer<number>(Number.NaN)).toThrow();
  });
});

describe("BackpressureQueue", () => {
  it("accepts up to capacity, then reports the overflow policy", () => {
    const queue = new BackpressureQueue<number>(2, "drop-oldest");
    expect(queue.offer(1)).toBe("accepted");
    expect(queue.offer(2)).toBe("accepted");
    expect(queue.offer(3)).toBe("dropped-oldest");
    expect(queue.depth).toBe(2);
    expect(queue.overflowed).toBe(1);
    expect(queue.drain()).toEqual([2, 3]); // 1 was displaced
  });

  it("keeps history under the reject-newest policy", () => {
    const queue = new BackpressureQueue<number>(2, "reject-newest");
    queue.offer(1);
    queue.offer(2);
    expect(queue.offer(3)).toBe("rejected");
    expect(queue.drain()).toEqual([1, 2]);
    expect(queue.overflowed).toBe(1);
  });

  it("drains at most the requested number, oldest first", () => {
    const queue = new BackpressureQueue<number>(5);
    [1, 2, 3, 4, 5].forEach((value) => queue.offer(value));
    expect(queue.drain(2)).toEqual([1, 2]);
    expect(queue.depth).toBe(3);
    expect(queue.drain()).toEqual([3, 4, 5]);
  });

  it("clears depth and the overflow counter", () => {
    const queue = new BackpressureQueue<number>(1);
    queue.offer(1);
    queue.offer(2);
    queue.clear();
    expect(queue.depth).toBe(0);
    expect(queue.overflowed).toBe(0);
  });

  it("refuses an invalid capacity", () => {
    expect(() => new BackpressureQueue<number>(0)).toThrow();
  });
});

describe("aggregateTicksToCandles", () => {
  const tick = (time: number, price: number, size = 1): Tick => ({ time, price, size });

  it("builds real OHLC and summed volume per bucket", () => {
    const candles = aggregateTicksToCandles([tick(0, 10, 2), tick(100, 12, 3), tick(200, 9, 5)], 1_000);
    expect(candles).toHaveLength(1);
    expect(candles[0]).toMatchObject({ time: 0, open: 10, high: 12, low: 9, close: 9, volume: 10 });
  });

  it("splits across buckets and skips empty ones", () => {
    const candles = aggregateTicksToCandles([tick(0, 10), tick(500, 11), tick(2_500, 20), tick(3_000, 21)], 1_000);
    // bucket 1_000 has no ticks and is skipped rather than invented
    expect(candles.map((c) => c.time)).toEqual([0, 2_000, 3_000]);
    expect(candles[0].close).toBe(11);
    expect(candles[1].open).toBe(20);
    expect(candles[2].open).toBe(21);
  });

  it("orders unordered ticks and drops invalid ones", () => {
    const candles = aggregateTicksToCandles([tick(900, 11), tick(100, 10), { time: Number.NaN, price: 5 } as Tick, { time: 100, price: Number.NaN } as Tick], 1_000);
    expect(candles).toHaveLength(1);
    expect(candles[0].open).toBe(10);
    expect(candles[0].close).toBe(11);
  });

  it("returns nothing for no ticks and refuses an invalid bucket", () => {
    expect(aggregateTicksToCandles([], 1_000)).toEqual([]);
    expect(() => aggregateTicksToCandles([tick(0, 1)], 0)).toThrow();
  });
});

describe("feedHealth", () => {
  it("is clean until something is actually lost", () => {
    const ring = new RingBuffer<number>(2);
    const queue = new BackpressureQueue<number>(2);
    ring.push(1);
    queue.offer(1);
    expect(feedHealth(ring, queue).degraded).toBe(false);
  });

  it("flags degradation once data is dropped, so the UI can say so", () => {
    const ring = new RingBuffer<number>(1);
    ring.push(1);
    ring.push(2); // overwrites
    const queue = new BackpressureQueue<number>(1, "reject-newest");
    queue.offer(1);
    queue.offer(2); // rejected
    const health = feedHealth(ring, queue);
    expect(health.degraded).toBe(true);
    expect(health.dropped).toBe(1);
    expect(health.overflowed).toBe(1);
    expect(health.bufferCapacity).toBe(1);
  });
});
