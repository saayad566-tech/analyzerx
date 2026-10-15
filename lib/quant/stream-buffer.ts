/**
 * Bounded streaming primitives.
 *
 * A market feed can produce ticks far faster than a UI can render them, and a spike can arrive in
 * milliseconds. The correct response is **backpressure with a fixed memory ceiling**, not an
 * unbounded array: an uncapped buffer does not "scale", it converts a latency problem into an
 * out-of-memory crash, which is worse for the user than dropping a stale tick.
 *
 * So these structures are deliberately bounded, and they report exactly what they dropped.
 */

/** A fixed-capacity circular buffer. Pushing past capacity overwrites the oldest entry. */
export class RingBuffer<T> {
  private readonly items: (T | undefined)[];
  private head = 0;
  private count = 0;
  private dropCount = 0;

  constructor(readonly capacity: number) {
    if (!Number.isFinite(capacity) || capacity <= 0) throw new Error("RingBuffer capacity must be a positive number.");
    this.items = new Array<T | undefined>(Math.floor(capacity));
  }

  get size(): number {
    return this.count;
  }

  /** How many entries were overwritten because the buffer was full. */
  get dropped(): number {
    return this.dropCount;
  }

  get isFull(): boolean {
    return this.count === this.items.length;
  }

  push(item: T): void {
    if (this.count === this.items.length) this.dropCount += 1;
    else this.count += 1;
    this.items[this.head] = item;
    this.head = (this.head + 1) % this.items.length;
  }

  /** Oldest to newest. */
  toArray(): T[] {
    const out: T[] = [];
    const start = this.count === this.items.length ? this.head : 0;
    for (let i = 0; i < this.count; i += 1) out.push(this.items[(start + i) % this.items.length] as T);
    return out;
  }

  latest(): T | null {
    if (this.count === 0) return null;
    return this.items[(this.head - 1 + this.items.length) % this.items.length] as T;
  }

  clear(): void {
    this.items.fill(undefined);
    this.head = 0;
    this.count = 0;
    this.dropCount = 0;
  }
}

export type OfferResult = "accepted" | "dropped-oldest" | "rejected";

/**
 * A bounded queue with an explicit overflow policy.
 *   - `drop-oldest` keeps the freshest data (right for live quotes).
 *   - `reject-newest` preserves history (right for an audit or an ordered backfill).
 * Either way memory is bounded and the overflow count is visible.
 */
export class BackpressureQueue<T> {
  private readonly buffer: T[] = [];
  private overflowCount = 0;

  constructor(readonly capacity: number, readonly policy: "drop-oldest" | "reject-newest" = "drop-oldest") {
    if (!Number.isFinite(capacity) || capacity <= 0) throw new Error("BackpressureQueue capacity must be a positive number.");
    this.capacity = Math.floor(capacity);
  }

  get depth(): number {
    return this.buffer.length;
  }

  /** Total items refused or displaced because the queue was full. */
  get overflowed(): number {
    return this.overflowCount;
  }

  offer(item: T): OfferResult {
    if (this.buffer.length < this.capacity) {
      this.buffer.push(item);
      return "accepted";
    }
    this.overflowCount += 1;
    if (this.policy === "reject-newest") return "rejected";
    this.buffer.shift();
    this.buffer.push(item);
    return "dropped-oldest";
  }

  /** Remove and return up to `max` items, oldest first. */
  drain(max = Number.POSITIVE_INFINITY): T[] {
    const take = Number.isFinite(max) ? Math.max(0, Math.floor(max)) : this.buffer.length;
    return this.buffer.splice(0, Math.min(take, this.buffer.length));
  }

  clear(): void {
    this.buffer.length = 0;
    this.overflowCount = 0;
  }
}

export type Tick = { time: number; price: number; size?: number };

/**
 * Aggregate ticks into candles for a fixed bucket size, using real OHLC rules:
 * open = first price in the bucket, close = last, high/low = extremes, volume = sum of sizes.
 * Buckets are emitted in time order; an empty bucket is skipped rather than invented.
 */
export function aggregateTicksToCandles(ticks: Tick[], bucketMs: number): import("./types").Candle[] {
  if (!Number.isFinite(bucketMs) || bucketMs <= 0) throw new Error("bucketMs must be a positive number.");
  const ordered = [...ticks].filter((tick) => Number.isFinite(tick.time) && Number.isFinite(tick.price)).sort((a, b) => a.time - b.time);
  const candles: import("./types").Candle[] = [];
  let current: import("./types").Candle | null = null;
  let bucketStart: number | null = null;

  for (const tick of ordered) {
    const start = Math.floor(tick.time / bucketMs) * bucketMs;
    if (current === null || start !== bucketStart) {
      if (current) candles.push(current);
      bucketStart = start;
      current = { time: start, open: tick.price, high: tick.price, low: tick.price, close: tick.price, volume: tick.size ?? 0 };
      continue;
    }
    current.high = Math.max(current.high, tick.price);
    current.low = Math.min(current.low, tick.price);
    current.close = tick.price;
    current.volume += tick.size ?? 0;
  }
  if (current) candles.push(current);
  return candles;
}

/** Snapshot of a feed's health, for a diagnostics panel. */
export type FeedHealth = {
  bufferDepth: number;
  bufferCapacity: number;
  dropped: number;
  overflowed: number;
  /** True once any data has been lost to backpressure — the UI should say so. */
  degraded: boolean;
};

export function feedHealth(ring: RingBuffer<unknown>, queue: BackpressureQueue<unknown>): FeedHealth {
  return {
    bufferDepth: ring.size,
    bufferCapacity: ring.capacity,
    dropped: ring.dropped,
    overflowed: queue.overflowed,
    degraded: ring.dropped > 0 || queue.overflowed > 0,
  };
}
