/**
 * Exchange sessions and live market status, per market.
 *
 * The defect this fixes: showing "Open" (or "Closed") from the device clock. A user
 * in India looking at the NYSE must see New York's session, not their own. Status is
 * therefore computed in the EXCHANGE's timezone, never the device's.
 *
 * Honest limits, stated up front:
 *  - Exchange holidays are NOT modelled. A holiday shows as a normal trading day.
 *    Modelling them needs a maintained calendar per exchange; guessing would be worse
 *    than the plain limitation.
 *  - Sessions are regular-hours only. Pre/post-market is reported for the US, where
 *    it is well defined; elsewhere extended hours exist but vary by venue.
 */

import { getMarketProfile } from "./market-regions";

export type SessionWindow = {
  /** Minutes from local midnight. */
  openMinute: number;
  closeMinute: number;
};

export type ExchangeSession = {
  marketId: string;
  timeZone: string;
  /** Regular trading windows, in local exchange time. */
  regular: SessionWindow[];
  /** Optional extended windows, local time. */
  pre?: SessionWindow;
  post?: SessionWindow;
};

const MIN = (h: number, m = 0) => h * 60 + m;

const SESSIONS: Record<string, { regular: SessionWindow[]; pre?: SessionWindow; post?: SessionWindow }> = {
  IN: { regular: [{ openMinute: MIN(9, 15), closeMinute: MIN(15, 30) }] },
  US: {
    regular: [{ openMinute: MIN(9, 30), closeMinute: MIN(16, 0) }],
    pre: { openMinute: MIN(4, 0), closeMinute: MIN(9, 30) },
    post: { openMinute: MIN(16, 0), closeMinute: MIN(20, 0) },
  },
  GB: { regular: [{ openMinute: MIN(8, 0), closeMinute: MIN(16, 30) }] },
  CA: { regular: [{ openMinute: MIN(9, 30), closeMinute: MIN(16, 0) }] },
  AU: { regular: [{ openMinute: MIN(10, 0), closeMinute: MIN(16, 0) }] },
  JP: { regular: [{ openMinute: MIN(9, 0), closeMinute: MIN(11, 30) }, { openMinute: MIN(12, 30), closeMinute: MIN(15, 0) }] },
  SG: { regular: [{ openMinute: MIN(9, 0), closeMinute: MIN(12, 0) }, { openMinute: MIN(13, 0), closeMinute: MIN(17, 0) }] },
  HK: { regular: [{ openMinute: MIN(9, 30), closeMinute: MIN(12, 0) }, { openMinute: MIN(13, 0), closeMinute: MIN(16, 0) }] },
  DE: { regular: [{ openMinute: MIN(9, 0), closeMinute: MIN(17, 30) }] },
  FR: { regular: [{ openMinute: MIN(9, 0), closeMinute: MIN(17, 30) }] },
};

/** Resolve the session definition for a market. */
export function sessionForMarket(marketId: string): ExchangeSession {
  const profile = getMarketProfile(marketId);
  const session = SESSIONS[profile.id] ?? { regular: [{ openMinute: MIN(9, 30), closeMinute: MIN(16, 0) }] };
  return { marketId: profile.id, timeZone: profile.timezone, ...session };
}

export type LocalParts = {
  year: number;
  month: number;
  day: number;
  /** 0 = Sunday ... 6 = Saturday. */
  weekday: number;
  hour: number;
  minute: number;
};

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/**
 * Break a UTC instant into wall-clock parts in a given IANA timezone.
 *
 * Uses Intl, which handles DST correctly — a fixed offset would be wrong for half
 * the year in New York, London, Sydney and the EU. Returns null when the runtime
 * cannot resolve the timezone, so callers degrade honestly instead of guessing.
 */
export function exchangeLocalParts(utcMs: number, timeZone: string): LocalParts | null {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hour12: false,
    });
    const parts = formatter.formatToParts(new Date(utcMs));
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    const weekdayName = get("weekday");
    const hourValue = Number(get("hour"));
    const weekday = WEEKDAY_INDEX[weekdayName];
    const year = Number(get("year"));
    const month = Number(get("month"));
    const day = Number(get("day"));
    const minute = Number(get("minute"));
    if (![year, month, day, minute].every(Number.isFinite) || weekday === undefined || !Number.isFinite(hourValue)) return null;
    return {
      year,
      month,
      day,
      weekday,
      // Intl renders midnight as "24" in some locales; normalise to 0.
      hour: hourValue === 24 ? 0 : hourValue,
      minute,
    };
  } catch {
    return null;
  }
}

export type MarketStatus =
  | "open"
  | "pre-market"
  | "post-market"
  | "break"
  | "closed"
  | "weekend"
  | "unknown";

export type MarketStatusReport = {
  marketId: string;
  status: MarketStatus;
  /** Human label. */
  label: string;
  /** Market-local wall clock, e.g. "14:05". */
  localTime: string;
  /** Market-local date, e.g. "2026-10-14". */
  localDate: string;
  timeZone: string;
  /** True only while regular trading is in progress. */
  isTrading: boolean;
  reason: string;
};

const STATUS_LABELS: Record<MarketStatus, string> = {
  open: "Open",
  "pre-market": "Pre-market",
  "post-market": "Post-market",
  break: "Break",
  closed: "Closed",
  weekend: "Weekend",
  unknown: "Unknown",
};

function within(window: SessionWindow, minute: number): boolean {
  return minute >= window.openMinute && minute < window.closeMinute;
}

/**
 * Compute the live status of a market at a given instant, in the exchange's own
 * timezone. `utcMs` is injected so the result is deterministic in tests.
 */
export function marketStatus(utcMs: number, marketId: string): MarketStatusReport {
  const session = sessionForMarket(marketId);
  const parts = exchangeLocalParts(utcMs, session.timeZone);
  const base = { marketId: session.marketId, timeZone: session.timeZone };

  if (!parts) {
    return {
      ...base,
      status: "unknown",
      label: STATUS_LABELS.unknown,
      localTime: "--:--",
      localDate: "",
      isTrading: false,
      reason: "This device cannot resolve the exchange timezone, so the session state is not claimed.",
    };
  }

  const localTime = `${`${parts.hour}`.padStart(2, "0")}:${`${parts.minute}`.padStart(2, "0")}`;
  const localDate = `${parts.year}-${`${parts.month}`.padStart(2, "0")}-${`${parts.day}`.padStart(2, "0")}`;
  const now = parts.hour * 60 + parts.minute;

  if (parts.weekday === 0 || parts.weekday === 6) {
    return { ...base, status: "weekend", label: STATUS_LABELS.weekend, localTime, localDate, isTrading: false, reason: "The exchange does not trade at the weekend." };
  }
  if (session.regular.some((window) => within(window, now))) {
    return { ...base, status: "open", label: STATUS_LABELS.open, localTime, localDate, isTrading: true, reason: "Regular trading is in progress in the exchange's own timezone." };
  }
  // Mid-session break: between two regular windows.
  const first = session.regular[0];
  const last = session.regular[session.regular.length - 1];
  if (session.regular.length > 1 && now > first.closeMinute && now < last.openMinute) {
    return { ...base, status: "break", label: STATUS_LABELS.break, localTime, localDate, isTrading: false, reason: "The exchange is in its scheduled mid-day break." };
  }
  if (session.pre && within(session.pre, now)) {
    return { ...base, status: "pre-market", label: STATUS_LABELS["pre-market"], localTime, localDate, isTrading: false, reason: "Extended pre-market session; regular trading has not begun." };
  }
  if (session.post && within(session.post, now)) {
    return { ...base, status: "post-market", label: STATUS_LABELS["post-market"], localTime, localDate, isTrading: false, reason: "Extended post-market session; regular trading has ended." };
  }
  return { ...base, status: "closed", label: STATUS_LABELS.closed, localTime, localDate, isTrading: false, reason: "Outside the exchange's regular session." };
}

/** True only when regular trading is live in the exchange's timezone. */
export function isMarketTrading(utcMs: number, marketId: string): boolean {
  return marketStatus(utcMs, marketId).isTrading;
}
