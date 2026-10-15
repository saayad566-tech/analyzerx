/**
 * Strategy specification and rule evaluation.
 *
 * A strategy is an explicit list of conditions, not an opaque blob. Entry conditions are ANDed,
 * exit conditions are ORed, and every condition is evaluated from precomputed indicator series so
 * a backtest stays deterministic and fast.
 *
 * `generateStrategyFromPrompt` is deliberately **rule-based**: it maps recognised words to a spec
 * deterministically. It does not pretend to be a language model, and it never invents a parameter
 * it did not read — an unrecognised prompt yields a documented default.
 */
import { classifyTrend, closes, ema, rollingMax, rollingMin, rsi, type TrendDirection } from "./indicators";
import type { Candle } from "./types";

export type StrategyRule =
  | { kind: "priceAboveEma"; period: number }
  | { kind: "priceBelowEma"; period: number }
  | { kind: "emaCrossAbove"; fast: number; slow: number }
  | { kind: "emaCrossBelow"; fast: number; slow: number }
  | { kind: "rsiBelow"; period: number; level: number }
  | { kind: "rsiAbove"; period: number; level: number }
  | { kind: "trendUp" }
  | { kind: "trendDown" }
  | { kind: "breakoutHigh"; lookback: number }
  | { kind: "breakdownLow"; lookback: number };

export type StrategySpec = {
  name: string;
  side: "long" | "short" | "both";
  /** All entry conditions must hold. */
  entry: StrategyRule[];
  /** Any exit condition closes the position. */
  exit: StrategyRule[];
  /** Protective stop as a fraction of entry price; null disables it. */
  stopLossPct: number | null;
  /** Profit target as a fraction of entry price; null disables it. */
  takeProfitPct: number | null;
  /** Maximum bars to hold; null disables it. */
  maxHoldBars: number | null;
  /** Fraction of current equity committed per trade. */
  riskPerTradePct: number;
};

export type PreparedSeries = {
  candles: Candle[];
  emaByPeriod: Map<number, (number | null)[]>;
  rsiByPeriod: Map<number, (number | null)[]>;
  rollingMaxByPeriod: Map<number, (number | null)[]>;
  rollingMinByPeriod: Map<number, (number | null)[]>;
  trend: TrendDirection[];
};

/** Collect every period a rule set references, so only the needed series are computed. */
function referencedPeriods(spec: StrategySpec): { ema: Set<number>; rsi: Set<number>; rolling: Set<number> } {
  const result = { ema: new Set<number>(), rsi: new Set<number>(), rolling: new Set<number>() };
  for (const rule of [...spec.entry, ...spec.exit]) {
    switch (rule.kind) {
      case "priceAboveEma":
      case "priceBelowEma":
        result.ema.add(rule.period);
        break;
      case "emaCrossAbove":
      case "emaCrossBelow":
        result.ema.add(rule.fast);
        result.ema.add(rule.slow);
        break;
      case "rsiBelow":
      case "rsiAbove":
        result.rsi.add(rule.period);
        break;
      case "breakoutHigh":
      case "breakdownLow":
        result.rolling.add(rule.lookback);
        break;
      default:
        break;
    }
  }
  return result;
}

/** Precompute the indicator series a spec needs. Computed once per run, never per bar. */
export function prepareSeries(candles: Candle[], spec: StrategySpec): PreparedSeries {
  const periods = referencedPeriods(spec);
  const closeValues = closes(candles);
  const emaByPeriod = new Map<number, (number | null)[]>();
  for (const period of periods.ema) emaByPeriod.set(period, ema(closeValues, period));
  const rsiByPeriod = new Map<number, (number | null)[]>();
  for (const period of periods.rsi) rsiByPeriod.set(period, rsi(closeValues, period));
  const rollingMaxByPeriod = new Map<number, (number | null)[]>();
  for (const period of periods.rolling) rollingMaxByPeriod.set(period, rollingMax(closeValues, period));
  const rollingMinByPeriod = new Map<number, (number | null)[]>();
  for (const period of periods.rolling) rollingMinByPeriod.set(period, rollingMin(closeValues, period));
  const needsTrend = spec.entry.some((rule) => rule.kind === "trendUp" || rule.kind === "trendDown") || spec.exit.some((rule) => rule.kind === "trendUp" || rule.kind === "trendDown");
  return { candles, emaByPeriod, rsiByPeriod, rollingMaxByPeriod, rollingMinByPeriod, trend: needsTrend ? classifyTrend(candles) : new Array(candles.length).fill("sideways") as TrendDirection[] };
}

/**
 * Evaluate one rule at a bar.
 * Anything that depends on a value that is not yet defined (warm-up, or a previous bar that does
 * not exist) is false — never treated as true.
 */
export function evaluateRule(rule: StrategyRule, series: PreparedSeries, index: number): boolean {
  const candle = series.candles[index];
  if (!candle) return false;
  switch (rule.kind) {
    case "priceAboveEma": {
      const value = series.emaByPeriod.get(rule.period)?.[index];
      return value !== null && value !== undefined && candle.close > value;
    }
    case "priceBelowEma": {
      const value = series.emaByPeriod.get(rule.period)?.[index];
      return value !== null && value !== undefined && candle.close < value;
    }
    case "emaCrossAbove": {
      if (index < 1) return false;
      const fast = series.emaByPeriod.get(rule.fast);
      const slow = series.emaByPeriod.get(rule.slow);
      const fastNow = fast?.[index];
      const slowNow = slow?.[index];
      const fastPrev = fast?.[index - 1];
      const slowPrev = slow?.[index - 1];
      if (fastNow == null || slowNow == null || fastPrev == null || slowPrev == null) return false;
      return fastNow > slowNow && fastPrev <= slowPrev;
    }
    case "emaCrossBelow": {
      if (index < 1) return false;
      const fast = series.emaByPeriod.get(rule.fast);
      const slow = series.emaByPeriod.get(rule.slow);
      const fastNow = fast?.[index];
      const slowNow = slow?.[index];
      const fastPrev = fast?.[index - 1];
      const slowPrev = slow?.[index - 1];
      if (fastNow == null || slowNow == null || fastPrev == null || slowPrev == null) return false;
      return fastNow < slowNow && fastPrev >= slowPrev;
    }
    case "rsiBelow": {
      const value = series.rsiByPeriod.get(rule.period)?.[index];
      return value !== null && value !== undefined && value < rule.level;
    }
    case "rsiAbove": {
      const value = series.rsiByPeriod.get(rule.period)?.[index];
      return value !== null && value !== undefined && value > rule.level;
    }
    case "trendUp":
      return series.trend[index] === "up";
    case "trendDown":
      return series.trend[index] === "down";
    case "breakoutHigh": {
      // Compare against the window *ending on the previous bar*, so the current close cannot
      // trivially satisfy its own breakout test.
      const previousMax = series.rollingMaxByPeriod.get(rule.lookback)?.[index - 1];
      return previousMax !== null && previousMax !== undefined && candle.close > previousMax;
    }
    case "breakdownLow": {
      const previousMin = series.rollingMinByPeriod.get(rule.lookback)?.[index - 1];
      return previousMin !== null && previousMin !== undefined && candle.close < previousMin;
    }
    default:
      return false;
  }
}

export function evaluateAll(rules: StrategyRule[], series: PreparedSeries, index: number): boolean {
  if (rules.length === 0) return false;
  return rules.every((rule) => evaluateRule(rule, series, index));
}

export function evaluateAny(rules: StrategyRule[], series: PreparedSeries, index: number): boolean {
  if (rules.length === 0) return false;
  return rules.some((rule) => evaluateRule(rule, series, index));
}

/** The default strategy, used when a prompt names nothing recognisable. Documented, not hidden. */
export const DEFAULT_STRATEGY: StrategySpec = {
  name: "EMA 20/50 trend follow (default)",
  side: "long",
  entry: [{ kind: "emaCrossAbove", fast: 20, slow: 50 }],
  exit: [{ kind: "emaCrossBelow", fast: 20, slow: 50 }],
  stopLossPct: 0.05,
  takeProfitPct: null,
  maxHoldBars: null,
  riskPerTradePct: 0.95,
};

/**
 * Map a natural-language prompt to a strategy spec, deterministically.
 *
 * Recognised concepts: moving-average trend/crossover, RSI mean reversion, breakouts, shorting,
 * and explicit period numbers next to "ema"/"ma"/"rsi". Unrecognised prompts return the documented
 * default rather than a fabricated one.
 */
/**
 * Pull moving-average periods out of a prompt, handling both orders and a slash/hyphen pair.
 * Recognises "ema 10/30", "ema 10-30", "ema 20", "20 ema", "sma 50".
 */
export function extractEmaPeriods(text: string): number[] {
  const valid = (value: number) => Number.isFinite(value) && value >= 2 && value <= 400;
  const pair = text.match(/\b(?:ema|sma|ma)\s*(\d{1,3})\s*[/\-]\s*(\d{1,3})\b/);
  if (pair) return [Number(pair[1]), Number(pair[2])].filter(valid);
  const after = text.match(/\b(?:ema|sma|ma)\s*(\d{1,3})\b/);
  if (after) return [Number(after[1])].filter(valid);
  const before = text.match(/\b(\d{1,3})\s*(?:ema|sma|ma)\b/);
  if (before) return [Number(before[1])].filter(valid);
  return [];
}

export function generateStrategyFromPrompt(prompt: string): StrategySpec {
  const text = (prompt ?? "").toLowerCase();
  if (!text.trim()) return { ...DEFAULT_STRATEGY };

  const emaPeriods = extractEmaPeriods(text);
  const rsiMatch = text.match(/\brsi\s*(\d{1,3})\b/) ?? text.match(/\b(\d{1,3})\s*rsi\b/);
  const rsiPeriod = rsiMatch ? Number(rsiMatch[1]) : 14;
  const breakoutMatch = text.match(/\b(\d{1,3})\s*(?:bar|day|candle)s?\s*(?:high|breakout)\b/) ?? text.match(/\bbreakout\s*(?:of\s*)?(\d{1,3})\b/);
  const stopMatch = text.match(/(\d{1,3}(?:\.\d+)?)\s*%\s*(?:stop|sl)\b/) ?? text.match(/\b(?:stop|sl)\D{0,8}(\d{1,3}(?:\.\d+)?)\s*%/);
  const targetMatch = text.match(/(\d{1,3}(?:\.\d+)?)\s*%\s*(?:target|tp|take\s*profit)/) ?? text.match(/\b(?:target|tp|take\s*profit)\D{0,8}(\d{1,3}(?:\.\d+)?)\s*%/);

  const wantsShort = /\bshort|sell|bearish|downtrend\b/.test(text);
  const wantsLong = /\blong|buy|bullish|uptrend\b/.test(text);
  const side: StrategySpec["side"] = wantsShort && wantsLong ? "both" : wantsShort ? "short" : "long";
  const stopLossPct = stopMatch ? Number(stopMatch[1]) / 100 : 0.05;
  const takeProfitPct = targetMatch ? Number(targetMatch[1]) / 100 : null;

  if (/\brsi|mean\s*revers|overbought|oversold\b/.test(text)) {
    return {
      name: `RSI ${rsiPeriod} mean reversion`,
      side,
      entry: side === "short" ? [{ kind: "rsiAbove", period: rsiPeriod, level: 70 }] : [{ kind: "rsiBelow", period: rsiPeriod, level: 30 }],
      exit: side === "short" ? [{ kind: "rsiBelow", period: rsiPeriod, level: 50 }] : [{ kind: "rsiAbove", period: rsiPeriod, level: 55 }],
      stopLossPct,
      takeProfitPct,
      maxHoldBars: null,
      riskPerTradePct: 0.95,
    };
  }

  if (/\bbreakout|break\s*out\b/.test(text)) {
    const lookback = breakoutMatch ? Number(breakoutMatch[1]) : 20;
    return {
      name: `${lookback}-bar breakout`,
      side,
      entry: side === "short" ? [{ kind: "breakdownLow", lookback }] : [{ kind: "breakoutHigh", lookback }],
      exit: side === "short" ? [{ kind: "breakoutHigh", lookback }] : [{ kind: "breakdownLow", lookback }],
      stopLossPct,
      takeProfitPct,
      maxHoldBars: null,
      riskPerTradePct: 0.95,
    };
  }

  if (/\btrend|momentum|moving\s*average|crossover|cross\b/.test(text) || emaPeriods.length > 0) {
    const fast = emaPeriods[0] ?? 20;
    const slow = emaPeriods[1] ?? Math.max(fast * 2, fast + 10);
    const ordered = Math.min(fast, slow) === fast && fast !== slow ? { fast, slow } : { fast: Math.min(fast, slow), slow: Math.max(fast, slow) };
    return {
      name: `EMA ${ordered.fast}/${ordered.slow} crossover`,
      side,
      entry: side === "short" ? [{ kind: "emaCrossBelow", fast: ordered.fast, slow: ordered.slow }] : [{ kind: "emaCrossAbove", fast: ordered.fast, slow: ordered.slow }],
      exit: side === "short" ? [{ kind: "emaCrossAbove", fast: ordered.fast, slow: ordered.slow }] : [{ kind: "emaCrossBelow", fast: ordered.fast, slow: ordered.slow }],
      stopLossPct,
      takeProfitPct,
      maxHoldBars: null,
      riskPerTradePct: 0.95,
    };
  }

  return { ...DEFAULT_STRATEGY, stopLossPct, takeProfitPct, side };
}

/** Human-readable description of a spec, for the UI and the execution log. */
export function describeStrategy(spec: StrategySpec): string {
  const describeRule = (rule: StrategyRule): string => {
    switch (rule.kind) {
      case "priceAboveEma": return `close above EMA ${rule.period}`;
      case "priceBelowEma": return `close below EMA ${rule.period}`;
      case "emaCrossAbove": return `EMA ${rule.fast} crosses above EMA ${rule.slow}`;
      case "emaCrossBelow": return `EMA ${rule.fast} crosses below EMA ${rule.slow}`;
      case "rsiBelow": return `RSI ${rule.period} below ${rule.level}`;
      case "rsiAbove": return `RSI ${rule.period} above ${rule.level}`;
      case "trendUp": return "market structure is up";
      case "trendDown": return "market structure is down";
      case "breakoutHigh": return `close above the prior ${rule.lookback}-bar high`;
      case "breakdownLow": return `close below the prior ${rule.lookback}-bar low`;
      default: return "unknown condition";
    }
  };
  const parts = [
    spec.name,
    `Side: ${spec.side}`,
    `Enter when: ${spec.entry.map(describeRule).join(" AND ") || "never"}`,
    `Exit when: ${spec.exit.map(describeRule).join(" OR ") || "never"}`,
    `Stop: ${spec.stopLossPct === null ? "none" : `${(spec.stopLossPct * 100).toFixed(1)}%`}`,
    `Target: ${spec.takeProfitPct === null ? "none" : `${(spec.takeProfitPct * 100).toFixed(1)}%`}`,
    `Capital per trade: ${(spec.riskPerTradePct * 100).toFixed(0)}%`,
  ];
  return parts.join("\n");
}
