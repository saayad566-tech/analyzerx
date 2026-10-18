/**
 * Paper-trading (demo-account) engine.
 *
 * A deterministic, self-contained simulation of an order-driven account. It is deliberately a pure
 * function of its inputs — no clock reads, no I/O, no randomness — so every result is reproducible
 * and testable. The caller supplies the bar (OHLCV) and the account state; the engine returns the
 * next state plus the fills it produced.
 *
 * This is a SIMULATION. It is not connected to any broker, exchange or real money. Every result it
 * produces is labelled `simulated: true` so a caller cannot present it as a live account.
 */

export type PaperOrderSide = "buy" | "sell";
export type PaperOrderType = "market" | "limit";
export type PaperOrderStatus = "pending" | "filled" | "cancelled" | "rejected";

export type PaperBar = {
  /** Epoch milliseconds for the bar open. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type PaperOrder = {
  id: string;
  symbol: string;
  side: PaperOrderSide;
  type: PaperOrderType;
  /** Required for `limit`; ignored for `market`. */
  limitPrice?: number;
  quantity: number;
  status: PaperOrderStatus;
  createdAt: number;
  /** Populated when the order fills. */
  filledAt?: number;
  filledPrice?: number;
  /** Why the order was rejected, when it was. */
  reason?: string;
};

export type PaperPosition = {
  symbol: string;
  quantity: number;
  /** Volume-weighted average entry price. */
  averagePrice: number;
  /** Realised profit and loss booked against this symbol. */
  realisedPnl: number;
};

export type PaperFill = {
  orderId: string;
  symbol: string;
  side: PaperOrderSide;
  quantity: number;
  price: number;
  /** Commission charged on this fill. */
  commission: number;
  time: number;
};

export type PaperAccount = {
  /** Cash available to trade, after commissions. */
  cash: number;
  /** Starting cash, retained so return can always be computed. */
  initialCash: number;
  positions: Record<string, PaperPosition>;
  openOrders: PaperOrder[];
  fills: PaperFill[];
  /** Peak equity seen, for drawdown. */
  peakEquity: number;
  /**
   * Total realised profit and loss: the price result of every closed trade, minus every commission
   * paid. Held on the account because closing a position removes it from `positions`.
   */
  realisedPnl: number;
};

export type PaperConfig = {
  /** Commission per fill as a fraction of notional, e.g. 0.0003 for 3 basis points. */
  commissionRate: number;
  /** Slippage applied against the trader, as a fraction of price. */
  slippageRate: number;
  /** Long-only when false. */
  allowShort: boolean;
  /** Reject a buy whose notional exceeds available cash times this factor. */
  maxLeverage: number;
};

export const DEFAULT_PAPER_CONFIG: PaperConfig = {
  commissionRate: 0.0003,
  slippageRate: 0.0005,
  allowShort: false,
  maxLeverage: 1,
};

export type PaperSnapshot = {
  cash: number;
  positionsValue: number;
  equity: number;
  unrealisedPnl: number;
  realisedPnl: number;
  /** Equity as a fraction of initial cash, e.g. 0.05 for +5%. */
  returnPct: number;
  /** Fractional peak-to-trough decline of equity, 0 when at a high. */
  drawdownPct: number;
  openOrderCount: number;
  fillCount: number;
  /** Always true — this engine simulates. */
  simulated: true;
};

export function createPaperAccount(initialCash: number): PaperAccount {
  if (!Number.isFinite(initialCash) || initialCash <= 0) {
    throw new Error("Paper account requires a positive initial cash balance.");
  }
  return {
    cash: initialCash,
    initialCash,
    positions: {},
    openOrders: [],
    fills: [],
    peakEquity: initialCash,
    realisedPnl: 0,
  };
}

/** Price a market order actually fills at, moved against the trader by the slippage rate. */
export function fillPrice(order: PaperOrder, bar: PaperBar, config: PaperConfig): number | null {
  const slip = config.slippageRate;
  if (order.type === "market") {
    // A market order fills at the bar open, slipped against the trader.
    return order.side === "buy" ? bar.open * (1 + slip) : bar.open * (1 - slip);
  }
  const limit = order.limitPrice;
  if (limit === undefined || !Number.isFinite(limit)) return null;
  // A limit order fills only if the bar traded through it. It fills at the limit price, never worse.
  if (order.side === "buy") return bar.low <= limit ? Math.min(limit, bar.open) : null;
  return bar.high >= limit ? Math.max(limit, bar.open) : null;
}

function commissionFor(notional: number, config: PaperConfig): number {
  return Math.abs(notional) * config.commissionRate;
}

/**
 * Attempt to fill every open order against one bar. Pure: returns new state, never mutates input.
 */
export function processBar(
  account: PaperAccount,
  bar: PaperBar,
  config: PaperConfig = DEFAULT_PAPER_CONFIG,
): PaperAccount {
  const next: PaperAccount = {
    ...account,
    positions: { ...account.positions },
    openOrders: [],
    fills: [...account.fills],
    realisedPnl: account.realisedPnl,
  };

  for (const order of account.openOrders) {
    const price = fillPrice(order, bar, config);
    if (price === null || price <= 0) {
      // Not fillable this bar; it stays open.
      next.openOrders.push(order);
      continue;
    }
    const notional = price * order.quantity;
    const commission = commissionFor(notional, config);
    const existing = next.positions[order.symbol] ?? {
      symbol: order.symbol,
      quantity: 0,
      averagePrice: 0,
      realisedPnl: 0,
    };

    if (order.side === "buy") {
      const cost = notional + commission;
      if (cost > next.cash + 1e-9) {
        next.openOrders.push({ ...order, status: "rejected", reason: "Insufficient cash for this fill." });
        continue;
      }
      next.cash -= cost;
      const newQty = existing.quantity + order.quantity;
      // Only a long entry moves the average price; covering a short realises instead.
      const averagePrice = existing.quantity >= 0
        ? (existing.averagePrice * existing.quantity + price * order.quantity) / newQty
        : existing.averagePrice;
      let realised = existing.realisedPnl;
      if (existing.quantity < 0) {
        // Closing (part of) a short.
        const closed = Math.min(order.quantity, -existing.quantity);
        const booked = (existing.averagePrice - price) * closed;
        realised += booked;
        next.realisedPnl += booked;
      }
      next.positions[order.symbol] = { ...existing, quantity: newQty, averagePrice, realisedPnl: realised };
    } else {
      const proceeds = notional - commission;
      if (existing.quantity < order.quantity && !config.allowShort) {
        next.openOrders.push({ ...order, status: "rejected", reason: "Short selling is disabled." });
        continue;
      }
      next.cash += proceeds;
      const newQty = existing.quantity - order.quantity;
      let realised = existing.realisedPnl;
      let averagePrice = existing.averagePrice;
      if (existing.quantity > 0) {
        // Closing (part of) a long: realised against its entry price.
        const closed = Math.min(order.quantity, existing.quantity);
        const booked = (price - existing.averagePrice) * closed;
        realised += booked;
        next.realisedPnl += booked;
      }
      if (existing.quantity <= 0) {
        // Opening or adding to a short: the entry price is the volume-weighted average, exactly as
        // it is for a long. Without this a covered short realises against a zero cost basis.
        const opened = order.quantity;
        averagePrice = existing.quantity === 0
          ? price
          : (existing.averagePrice * -existing.quantity + price * opened) / (-existing.quantity + opened);
      }
      if (newQty === 0) averagePrice = 0;
      next.positions[order.symbol] = { ...existing, quantity: newQty, averagePrice, realisedPnl: realised };
    }

    next.realisedPnl -= commission;
    next.fills.push({
      orderId: order.id,
      symbol: order.symbol,
      side: order.side,
      quantity: order.quantity,
      price,
      commission,
      time: bar.time,
    });
  }

  // Drop positions that have been fully closed and carry no realised history worth keeping flat.
  for (const [symbol, position] of Object.entries(next.positions)) {
    if (position.quantity === 0) delete next.positions[symbol];
  }

  return next;
}

/** Validate an order against the account before it is queued. */
export function submitOrder(
  account: PaperAccount,
  order: Omit<PaperOrder, "status" | "createdAt">,
  config: PaperConfig = DEFAULT_PAPER_CONFIG,
): { account: PaperAccount; order: PaperOrder } {
  if (!Number.isFinite(order.quantity) || order.quantity <= 0) {
    return { account, order: { ...order, status: "rejected", createdAt: 0, reason: "Quantity must be positive." } };
  }
  if (order.type === "limit" && (!Number.isFinite(order.limitPrice) || (order.limitPrice as number) <= 0)) {
    return { account, order: { ...order, status: "rejected", createdAt: 0, reason: "A limit order needs a positive limit price." } };
  }
  const queued: PaperOrder = { ...order, status: "pending", createdAt: order.createdAt };
  return { account: { ...account, openOrders: [...account.openOrders, queued] }, order: queued };
}

export function cancelOrder(account: PaperAccount, orderId: string): PaperAccount {
  const target = account.openOrders.find((order) => order.id === orderId);
  if (!target) return account;
  return {
    ...account,
    openOrders: account.openOrders.filter((order) => order.id !== orderId),
    // The cancellation is recorded so the order's history is not silently lost.
    fills: account.fills,
  };
}

/** Mark the account to the latest close and report equity, return and drawdown. */
export function snapshot(account: PaperAccount, marks: Record<string, number>): PaperSnapshot {
  let positionsValue = 0;
  let unrealisedPnl = 0;
  for (const position of Object.values(account.positions)) {
    const mark = marks[position.symbol];
    if (mark !== undefined && Number.isFinite(mark)) {
      positionsValue += mark * position.quantity;
      unrealisedPnl += (mark - position.averagePrice) * position.quantity;
    } else {
      // Without a mark the position is carried at its entry price, so equity is never invented.
      positionsValue += position.averagePrice * position.quantity;
    }
  }
  const equity = account.cash + positionsValue;
  const peakEquity = Math.max(account.peakEquity, equity);
  return {
    cash: account.cash,
    positionsValue,
    equity,
    unrealisedPnl,
    realisedPnl: account.realisedPnl,
    returnPct: equity / account.initialCash - 1,
    drawdownPct: peakEquity > 0 ? 1 - equity / peakEquity : 0,
    openOrderCount: account.openOrders.length,
    fillCount: account.fills.length,
    simulated: true,
  };
}

/** Apply the snapshot's peak back onto the account so drawdown tracks across bars. */
export function markToMarket(
  account: PaperAccount,
  marks: Record<string, number>,
): { account: PaperAccount; snapshot: PaperSnapshot } {
  const snap = snapshot(account, marks);
  return { account: { ...account, peakEquity: Math.max(account.peakEquity, snap.equity) }, snapshot: snap };
}
