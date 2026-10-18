import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAPER_CONFIG,
  cancelOrder,
  createPaperAccount,
  fillPrice,
  markToMarket,
  processBar,
  snapshot,
  submitOrder,
  type PaperAccount,
  type PaperBar,
} from "../src/paper-trading";

const bar = (o: number, h: number, l: number, c: number, time = 1_700_000_000_000): PaperBar => ({
  time, open: o, high: h, low: l, close: c, volume: 1_000_000,
});

function buy(account: PaperAccount, price: number, qty: number, id = "o1") {
  const { account: next } = submitOrder(account, {
    id, symbol: "TEST", side: "buy", type: "limit", limitPrice: price, quantity: qty, createdAt: 0,
  });
  return next;
}

describe("paper trading engine", () => {
  it("starts a funded account with no positions and a stated simulated flag", () => {
    const a = createPaperAccount(100_000);
    expect(a.cash).toBe(100_000);
    expect(a.initialCash).toBe(100_000);
    expect(Object.keys(a.positions)).toHaveLength(0);
    expect(snapshot(a, {}).simulated).toBe(true);
    expect(snapshot(a, {}).equity).toBe(100_000);
    expect(snapshot(a, {}).returnPct).toBe(0);
  });

  it("refuses a non-positive starting balance rather than silently opening a broken account", () => {
    expect(() => createPaperAccount(0)).toThrow();
    expect(() => createPaperAccount(-5)).toThrow();
    expect(() => createPaperAccount(Number.NaN)).toThrow();
  });

  it("does not fill a limit buy the bar never reached, and keeps it open", () => {
    let a = createPaperAccount(100_000);
    a = buy(a, 90, 10);                 // limit at 90
    a = processBar(a, bar(100, 105, 95, 102)); // bar stayed above 95 — never traded at 90
    expect(a.fills).toHaveLength(0);
    expect(a.openOrders).toHaveLength(1);
    expect(a.cash).toBe(100_000);
  });

  it("fills a limit buy when the bar trades through it, at the limit, never worse", () => {
    let a = createPaperAccount(100_000);
    a = buy(a, 100, 10);
    a = processBar(a, bar(98, 102, 95, 101));
    expect(a.fills).toHaveLength(1);
    const fill = a.fills[0];
    expect(fill.price).toBeLessThanOrEqual(100);
    expect(a.positions.TEST.quantity).toBe(10);
    // Cash fell by notional + commission.
    expect(a.cash).toBeLessThan(100_000 - 1000);
  });

  it("charges commission, so a round trip at an unchanged price is a loss", () => {
    let a = createPaperAccount(100_000);
    a = buy(a, 100, 10);
    a = processBar(a, bar(99, 101, 99, 100));   // entry
    const { account: afterSell } = submitOrder(a, {
      id: "o2", symbol: "TEST", side: "sell", type: "limit", limitPrice: 100, quantity: 10, createdAt: 0,
    });
    a = processBar(afterSell, bar(100, 101, 99, 100)); // exit at the same price
    expect(a.fills).toHaveLength(2);
    const snap = snapshot(a, { TEST: 100 });
    expect(snap.realisedPnl).toBeLessThan(0);
    expect(snap.equity).toBeLessThan(100_000);
  });

  it("rejects a buy it cannot afford instead of allowing a negative cash balance", () => {
    let a = createPaperAccount(1_000);
    a = buy(a, 500, 10);                       // needs 5,000
    a = processBar(a, bar(500, 510, 490, 505));
    expect(a.fills).toHaveLength(0);
    expect(a.cash).toBeGreaterThanOrEqual(0);
    const rejected = a.openOrders.find((o: { status: string; reason?: string }) => o.status === "rejected");
    expect(rejected?.reason).toMatch(/insufficient cash/i);
  });

  it("blocks short selling when the config forbids it", () => {
    let a = createPaperAccount(100_000);
    const { account: withSell } = submitOrder(a, {
      id: "s1", symbol: "TEST", side: "sell", type: "limit", limitPrice: 100, quantity: 5, createdAt: 0,
    });
    a = processBar(withSell, bar(100, 101, 99, 100));
    expect(a.fills).toHaveLength(0);
    expect(a.openOrders.find((o: { status: string; reason?: string }) => o.status === "rejected")?.reason).toMatch(/short selling is disabled/i);
  });

  it("allows a short when the config permits it, and realises profit when it falls", () => {
    const config = { ...DEFAULT_PAPER_CONFIG, allowShort: true };
    let a = createPaperAccount(100_000);
    const { account: withSell } = submitOrder(a, {
      id: "s1", symbol: "TEST", side: "sell", type: "limit", limitPrice: 100, quantity: 10, createdAt: 0,
    });
    a = processBar(withSell, bar(100, 101, 99, 100), config);
    expect(a.fills).toHaveLength(1);
    const { account: withBuy } = submitOrder(a, {
      id: "b1", symbol: "TEST", side: "buy", type: "limit", limitPrice: 90, quantity: 10, createdAt: 0,
    });
    a = processBar(withBuy, bar(90, 95, 88, 89), config);
    expect(snapshot(a, { TEST: 89 }).realisedPnl).toBeGreaterThan(0);
  });

  it("slippage moves a market order against the trader on both sides", () => {
    const cfg = DEFAULT_PAPER_CONFIG;
    const b = bar(100, 105, 95, 102);
    const buyPrice = fillPrice({ id: "x", symbol: "T", side: "buy", type: "market", quantity: 1, status: "pending", createdAt: 0 }, b, cfg);
    const sellPrice = fillPrice({ id: "y", symbol: "T", side: "sell", type: "market", quantity: 1, status: "pending", createdAt: 0 }, b, cfg);
    expect(buyPrice).toBeGreaterThan(b.open);
    expect(sellPrice).toBeLessThan(b.open);
    expect(buyPrice! - sellPrice!).toBeGreaterThan(0);
  });

  it("tracks drawdown from the peak, not from the start", () => {
    let a = createPaperAccount(100_000);
    a = buy(a, 100, 100);
    a = processBar(a, bar(99, 101, 99, 100));
    let snap = markToMarket(a, { TEST: 120 }).snapshot;   // equity rises
    const peakEquity = 100_000 + 20 * 100;
    expect(snap.equity).toBeCloseTo(peakEquity, 0);
    const marked = markToMarket(a, { TEST: 120 });
    snap = markToMarket(marked.account, { TEST: 108 }).snapshot; // falls back
    expect(snap.drawdownPct).toBeGreaterThan(0);
    expect(snap.drawdownPct).toBeLessThan(1);
  });

  it("carries a position at entry price when no mark exists, rather than inventing equity", () => {
    let a = createPaperAccount(100_000);
    a = buy(a, 100, 10);
    a = processBar(a, bar(99, 101, 99, 100));
    const snap = snapshot(a, {}); // no mark for TEST
    expect(snap.unrealisedPnl).toBeCloseTo(0, 6);
    expect(snap.equity).toBeCloseTo(a.cash + a.positions.TEST.averagePrice * 10, 6);
  });

  it("cancels an open order and leaves no fill behind", () => {
    let a = createPaperAccount(100_000);
    a = buy(a, 50, 10, "cancel-me");
    a = cancelOrder(a, "cancel-me");
    expect(a.openOrders).toHaveLength(0);
    a = processBar(a, bar(50, 51, 49, 50));
    expect(a.fills).toHaveLength(0);
  });

  it("rejects malformed orders instead of queuing them", () => {
    const a = createPaperAccount(100_000);
    const zero = submitOrder(a, { id: "z", symbol: "T", side: "buy", type: "market", quantity: 0, createdAt: 0 });
    expect(zero.order.status).toBe("rejected");
    const noLimit = submitOrder(a, { id: "l", symbol: "T", side: "buy", type: "limit", quantity: 1, createdAt: 0 });
    expect(noLimit.order.status).toBe("rejected");
    expect(zero.account.openOrders).toHaveLength(0);
  });

  it("is deterministic — the same inputs always produce the same account", () => {
    const run = () => {
      let a = createPaperAccount(100_000);
      a = buy(a, 100, 10);
      a = processBar(a, bar(99, 101, 99, 100));
      return snapshot(a, { TEST: 105 });
    };
    expect(run()).toEqual(run());
  });

  it("never mutates the account it was given", () => {
    const a = createPaperAccount(100_000);
    const withOrder = buy(a, 100, 10);
    const before = JSON.stringify(withOrder);
    processBar(withOrder, bar(99, 101, 99, 100));
    expect(JSON.stringify(withOrder)).toBe(before);
  });
});
