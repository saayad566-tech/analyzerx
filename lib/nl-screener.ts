/**
 * Natural-language screener.
 *
 * Turns a plain-English sentence into a structured, inspectable condition set, and
 * evaluates it against candidates. The parse is shown to the user before it runs, because
 * a screener that silently misreads "RSI above 70" as "below" is worse than one that
 * refuses.
 *
 * Design rules:
 *
 *  - A phrase that is not understood becomes an explicit `unparsed` fragment, never a
 *    silently dropped one. The caller can then tell the user exactly what it could not
 *    read instead of quietly screening on fewer conditions than were asked for.
 *  - Every condition names the indicator, the operator and the threshold, so the UI can
 *    render it back and the user can correct it.
 *  - Evaluation returns `null` for a candidate where the indicator is not defined (not
 *    enough history), which excludes it rather than treating it as a pass or a fail.
 */

import {
  adx, atr, bollingerBands, cci, donchianChannels, ema, hma, macd, mfi, momentum,
  obv, accumulationDistribution, roc, rsi, sma, stochastic, stochasticRsi, stdev,
  supertrend, vwap, vwma, williamsR, wma, isNum,
  type IndicatorId, type Series,
} from "./indicators";

export type Comparator = "above" | "below" | "crossesAbove" | "crossesBelow" | "between" | "equals";

export type Condition = {
  /** The sentence fragment this came from, so the UI can show the mapping. */
  source: string;
  subject: "indicator" | "price" | "volume" | "change";
  indicator?: IndicatorId;
  comparator: Comparator;
  value: number;
  /** Upper bound, only for `between`. */
  valueUpper?: number;
  /** Lookback period for indicator parameters and for `change`. */
  period?: number;
  /**
   * True when the condition tests an indicator's own direction state rather than a level
   * — "Supertrend up" is a direction, not a comparison against a number.
   */
  direction?: boolean;
  /** True when the condition compares two lines of one indicator (e.g. MACD vs signal). */
  secondary?: "signal" | "d" | "upper" | "lower" | "middle";
  /**
   * True when the threshold is ANOTHER LINE rather than the parsed number.
   *
   * This is the difference between "RSI above 70" (a level) and "price above 50-day EMA"
   * (price vs the average). Without it, the 50 was read as a threshold and the price was
   * compared against it, which produced a confident wrong answer.
   */
  lineVsLine?: boolean;
};

export type ParseResult = {
  conditions: Condition[];
  /** Fragments that could not be understood. Empty means a complete parse. */
  unparsed: string[];
  /** How the conditions combine. */
  combinator: "and" | "or";
  /** A one-line restatement for the user to confirm. */
  summary: string;
};

/* ------------------------------------------------------------------ *
 * Vocabulary
 * ------------------------------------------------------------------ */

/** Indicator names as a user would type them, longest first so "stochastic rsi" wins. */
const INDICATOR_ALIASES: Array<{ id: IndicatorId; phrases: string[] }> = [
  { id: "stochrsi", phrases: ["stochastic rsi", "stoch rsi", "stochrsi"] },
  { id: "stochastic", phrases: ["stochastic oscillator", "stochastic", "stoch", "%k"] },
  { id: "bollinger", phrases: ["bollinger bands", "bollinger", "bbands", "%b", "percent b"] },
  { id: "williamsR", phrases: ["williams %r", "williams r", "williamsr", "williams"] },
  { id: "supertrend", phrases: ["supertrend", "super trend"] },
  { id: "ichimoku", phrases: ["ichimoku cloud", "ichimoku"] },
  { id: "donchian", phrases: ["donchian channels", "donchian"] },
  { id: "keltner", phrases: ["keltner channels", "keltner"] },
  { id: "macd", phrases: ["macd"] },
  { id: "rsi", phrases: ["relative strength index", "rsi"] },
  { id: "adx", phrases: ["average directional index", "adx", "dmi"] },
  { id: "cci", phrases: ["commodity channel index", "cci"] },
  { id: "mfi", phrases: ["money flow index", "mfi", "money flow"] },
  { id: "atr", phrases: ["average true range", "atr"] },
  { id: "obv", phrases: ["on-balance volume", "on balance volume", "obv"] },
  { id: "vwap", phrases: ["vwap", "volume weighted average price"] },
  { id: "vwma", phrases: ["vwma", "volume weighted moving average"] },
  { id: "sma", phrases: ["simple moving average", "sma", "moving average", "ma"] },
  { id: "ema", phrases: ["exponential moving average", "ema"] },
  { id: "wma", phrases: ["weighted moving average", "wma"] },
  { id: "hma", phrases: ["hull moving average", "hma"] },
  { id: "roc", phrases: ["rate of change", "roc"] },
  { id: "momentum", phrases: ["momentum"] },
  { id: "stdev", phrases: ["standard deviation", "stdev"] },
  { id: "ad", phrases: ["accumulation distribution", "accumulation/distribution"] },
];

const COMPARATORS: Array<{ comparator: Comparator; phrases: string[] }> = [
  { comparator: "crossesAbove", phrases: ["crosses above", "crossing above", "cross above", "bullish cross", "golden cross", "breaks above", "breakout above"] },
  { comparator: "crossesBelow", phrases: ["crosses below", "crossing below", "cross below", "bearish cross", "death cross", "breaks below", "breakdown below"] },
  { comparator: "between", phrases: ["between", "ranging from"] },
  { comparator: "above", phrases: ["above", "greater than", "over", "exceeds", "higher than", "more than", ">"] },
  { comparator: "below", phrases: ["below", "less than", "under", "beneath", "lower than", "smaller than", "<"] },
  { comparator: "equals", phrases: ["equal to", "equals", "at", "="] },
];

/** Words that split a query into independent conditions. */
const JOINERS = /\s*(?:\band\b|\bwith\b|\bplus\b|\balso\b|\bthat\b|,|;|\n)\s*/i;

/* ------------------------------------------------------------------ *
 * Parsing
 * ------------------------------------------------------------------ */

function matchIndicator(fragment: string): { id: IndicatorId; rest: string } | null {
  const lower = fragment.toLowerCase();
  for (const entry of INDICATOR_ALIASES) {
    for (const phrase of entry.phrases) {
      const index = lower.indexOf(phrase);
      if (index !== -1) {
        const rest = `${fragment.slice(0, index)} ${fragment.slice(index + phrase.length)}`;
        return { id: entry.id, rest };
      }
    }
  }
  return null;
}

function matchComparator(fragment: string): { comparator: Comparator; rest: string; index: number } | null {
  const lower = fragment.toLowerCase();
  let best: { comparator: Comparator; rest: string; index: number; length: number } | null = null;
  for (const entry of COMPARATORS) {
    for (const phrase of entry.phrases) {
      const index = lower.indexOf(phrase);
      if (index === -1) continue;
      if (!best || phrase.length > best.length) {
        best = { comparator: entry.comparator, rest: `${fragment.slice(0, index)} ${fragment.slice(index + phrase.length)}`, index, length: phrase.length };
      }
    }
  }
  return best ? { comparator: best.comparator, rest: best.rest, index: best.index } : null;
}

function firstNumber(fragment: string): number | null {
  // Handles "30", "30.5", "30%", "-100", "1,200".
  const match = fragment.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : null;
}

function allNumbers(fragment: string): number[] {
  return (fragment.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number).filter(Number.isFinite);
}

/** A period is written as "14-period", "over 14 bars", "200 day", "period 20". */
function firstPeriod(fragment: string): number | null {
  const lower = fragment.toLowerCase();
  // "14-period", "14 day", "over 20 bars"
  const worded = lower.match(/(\d{1,3})\s*(?:-|\s)?\s*(?:period|bar|bars|day|days|session|sessions|candle|candles)/);
  if (worded) {
    const value = Number(worded[1]);
    if (Number.isFinite(value)) return value;
  }
  // "RSI(14)", "EMA (50)", "RSI[14]"
  const bracketed = lower.match(/[a-z%]\s*[\(\[]\s*(\d{1,3})\s*[\)\]]/);
  if (bracketed) {
    const value = Number(bracketed[1]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function parseFragment(fragment: string): Condition | null {
  const trimmed = fragment.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();

  // Directional phrasing first: it carries neither a comparator nor a number.
  const directionMatch = lower.match(/\b(up|down|bullish|bearish|long|short)\b/);
  const directionalIndicator = matchIndicator(trimmed);
  if (directionMatch && directionalIndicator && !/\b(between|above|below|cross)/.test(lower)) {
    const up = /up|bullish|long/.test(directionMatch[1]);
    return {
      source: trimmed,
      subject: "indicator",
      indicator: directionalIndicator.id,
      comparator: "equals",
      value: up ? 1 : -1,
      direction: true,
      period: firstPeriod(trimmed) ?? undefined,
    };
  }

  const comparatorMatch = matchComparator(trimmed);
  if (!comparatorMatch) return null;

  const numbers = allNumbers(trimmed);
  const period = firstPeriod(trimmed) ?? undefined;
  const indicatorInFragment = matchIndicator(trimmed);
  // A condition whose threshold is another LINE needs no number at all. Detect that
  // first, otherwise "price above 50-day EMA" is read as a comparison against 50.
  const mentionsPrice = /\bprice\b|\bclose\b|\bcmp\b|\blast\b/.test(lower);
  const mentionsSecondaryLine = /\bsignal\b|%d|\bd line\b|\bupper\b|\blower\b|\bmiddle\b|\bbasis\b/.test(lower);
  const lineVsLine = (mentionsPrice && Boolean(indicatorInFragment) && !/\bbetween\b/.test(lower))
    || (Boolean(indicatorInFragment) && mentionsSecondaryLine && !/\bbetween\b/.test(lower));

  if (!numbers.length && !lineVsLine) return null;
  const primary = numbers.length ? numbers[0] : 0;

  if (lineVsLine && indicatorInFragment) {
    const condition: Condition = {
      source: trimmed,
      subject: mentionsPrice ? "price" : "indicator",
      indicator: indicatorInFragment.id,
      comparator: comparatorMatch.comparator,
      value: primary,
      period,
      lineVsLine: true,
    };
    if (indicatorInFragment.id === "macd" && /\bsignal\b/.test(lower)) condition.secondary = "signal";
    if ((indicatorInFragment.id === "stochastic" || indicatorInFragment.id === "stochrsi") && /%d|\bd line\b|\bd\b/.test(lower)) condition.secondary = "d";
    if (indicatorInFragment.id === "bollinger") {
      if (/upper/.test(lower)) condition.secondary = "upper";
      else if (/lower/.test(lower)) condition.secondary = "lower";
      else if (/middle|basis|sma/.test(lower)) condition.secondary = "middle";
    }
    return condition;
  }

  // Price-based conditions.
  if (/\bprice\b|\bclose\b|\bcmp\b|\blast\b/.test(lower)) {
    const period = firstPeriod(trimmed);
    return { source: trimmed, subject: "price", comparator: comparatorMatch.comparator, value: primary, period: period ?? undefined };
  }

  // Volume-based conditions.
  if (/\bvolume\b|\bvol\b/.test(lower) && !/on-balance|on balance|money flow|vwap|vwma/.test(lower)) {
    return { source: trimmed, subject: "volume", comparator: comparatorMatch.comparator, value: primary, period: firstPeriod(trimmed) ?? undefined };
  }

  const indicator = indicatorInFragment;
  if (!indicator) return null;

  const isBetween = comparatorMatch.comparator === "between";
  const condition: Condition = {
    source: trimmed,
    subject: "indicator",
    indicator: indicator.id,
    comparator: comparatorMatch.comparator,
    value: primary,
    valueUpper: isBetween && numbers.length > 1 ? numbers[1] : undefined,
    period,
  };

  // A two-line comparison: MACD vs its signal, Stochastic %K vs %D, price vs a band.
  if (indicator.id === "macd" && /\bsignal\b/.test(lower)) condition.secondary = "signal";
  if ((indicator.id === "stochastic" || indicator.id === "stochrsi") && /%d|\bd line\b|\bd\b/.test(lower)) condition.secondary = "d";
  if (indicator.id === "bollinger") {
    if (/upper/.test(lower)) condition.secondary = "upper";
    else if (/lower/.test(lower)) condition.secondary = "lower";
    else if (/middle|basis|sma/.test(lower)) condition.secondary = "middle";
  }

  return condition;
}

/**
 * Parse a natural-language screen.
 *
 * Splits on joining words, parses each fragment, and reports the ones it could not read.
 */
export function parseScreen(query: string): ParseResult {
  const combinator: "and" | "or" = /\bor\b/i.test(query) && !/\band\b/i.test(query) ? "or" : "and";
  // "between 40 and 60" must not be split at its own "and", so the inner conjunction is
  // shielded before the joiner split and restored afterwards.
  // The placeholder deliberately contains no word characters, so the joiner regex cannot
  // match inside it ("~and~" still matches \band\b, which is why this is "RANGESEP").
  const shielded = query.replace(/\bbetween\s+(-?[\d.,]+)\s+and\s+(-?[\d.,]+)\b/gi, "between $1 RANGESEP $2");
  const fragments = shielded.split(JOINERS).map((part) => part.replace(/RANGESEP/g, "and").trim()).filter(Boolean);
  const conditions: Condition[] = [];
  const unparsed: string[] = [];

  for (const fragment of fragments) {
    // A fragment can hold two conditions ("RSI above 70 and below 80" splits earlier, but
    // "price above 200-day EMA" carries both a price and an indicator subject).
    const condition = parseFragment(fragment);
    if (condition) {
      conditions.push(condition);
      continue;
    }
    // Try a second pass: the fragment may name an indicator whose comparator was in a
    // neighbouring fragment, e.g. "RSI 14 above 70". Parse on the indicator alone.
    const indicator = matchIndicator(fragment);
    if (indicator) {
      const numbers = allNumbers(fragment);
      if (numbers.length) {
        const comparatorMatch = matchComparator(fragment);
        conditions.push({
          source: fragment,
          subject: "indicator",
          indicator: indicator.id,
          comparator: comparatorMatch?.comparator ?? "above",
          value: numbers[0],
          period: firstPeriod(fragment) ?? undefined,
        });
        continue;
      }
    }
    unparsed.push(fragment);
  }

  return { conditions, unparsed, combinator, summary: summarise(conditions, combinator) };
}

/** A readable restatement of the parsed conditions. */
export function summarise(conditions: ReadonlyArray<Condition>, combinator: "and" | "or" = "and"): string {
  if (!conditions.length) return "No conditions were recognised.";
  const phrase = (condition: Condition): string => {
    const name = condition.indicator ? condition.indicator : condition.subject;
    const period = condition.period ? `(${condition.period})` : "";
    const target = condition.secondary ? ` vs ${condition.secondary}` : "";
    if (condition.direction) return `${name}${period} is ${condition.value === 1 ? "up" : "down"}`;
    switch (condition.comparator) {
      case "between": return `${name}${period}${target} between ${condition.value} and ${condition.valueUpper ?? "?"}`;
      case "crossesAbove": return `${name}${period}${target} crosses above ${condition.value}`;
      case "crossesBelow": return `${name}${period}${target} crosses below ${condition.value}`;
      case "equals": return `${name}${period}${target} equals ${condition.value}`;
      case "above": return `${name}${period}${target} above ${condition.value}`;
      default: return `${name}${period}${target} below ${condition.value}`;
    }
  };
  return conditions.map(phrase).join(combinator === "and" ? " AND " : " OR ");
}

/* ------------------------------------------------------------------ *
 * Evaluation
 * ------------------------------------------------------------------ */

export type ScreenerCandidate = {
  symbol: string;
  name?: string;
  marketId?: string;
  bars: ReadonlyArray<{ o: number | null; h: number | null; l: number | null; c: number | null; v: number | null }>;
  /** Optional fundamentals, used by price/volume conditions that reference them. */
  metrics?: { marketCap?: number | null; pe?: number | null };
};

export type ConditionOutcome = { condition: Condition; passed: boolean | null; detail: string };

export type EvaluationResult = {
  symbol: string;
  name?: string;
  /** True when every (AND) or any (OR) condition passed. */
  matched: boolean;
  /** Number of conditions that evaluated to a definite pass. */
  passedCount: number;
  /** Conditions that could not be evaluated because the data was missing. */
  undefinedCount: number;
  outcomes: ConditionOutcome[];
};

/** Resolve a condition's latest and previous values from a candidate's bars. */
function resolveValues(condition: Condition, candidate: ScreenerCandidate): { current: number | null; previous: number | null; secondaryCurrent: number | null; secondaryPrevious: number | null } {
  const closes: Series = candidate.bars.map((bar) => bar.c);
  const highs: Series = candidate.bars.map((bar) => bar.h ?? bar.c);
  const lows: Series = candidate.bars.map((bar) => bar.l ?? bar.c);
  const volumes: Series = candidate.bars.map((bar) => bar.v);
  const input = { highs, lows, closes, volumes };
  const period = condition.period;
  const last = <T>(series: ReadonlyArray<T>): T | null => (series.length ? series[series.length - 1] : null);
  const secondLast = <T>(series: ReadonlyArray<T>): T | null => (series.length > 1 ? series[series.length - 2] : null);
  const asNumber = (value: number | null | undefined): number | null => (isNum(value) ? value : null);

  if (condition.subject === "price") {
    return { current: asNumber(last(closes)), previous: asNumber(secondLast(closes)), secondaryCurrent: null, secondaryPrevious: null };
  }
  if (condition.subject === "volume") {
    const average = period ? sma(volumes, period) : sma(volumes, 20);
    return { current: asNumber(last(volumes)), previous: asNumber(last(average)), secondaryCurrent: null, secondaryPrevious: null };
  }

  switch (condition.indicator) {
    case "rsi": { const s = rsi(closes, period ?? 14); return { current: asNumber(last(s)), previous: asNumber(secondLast(s)), secondaryCurrent: null, secondaryPrevious: null }; }
    case "sma": { const s = sma(closes, period ?? 20); return { current: asNumber(last(closes)), previous: asNumber(last(s)), secondaryCurrent: null, secondaryPrevious: null }; }
    case "ema": { const s = ema(closes, period ?? 20); return { current: asNumber(last(closes)), previous: asNumber(last(s)), secondaryCurrent: null, secondaryPrevious: null }; }
    case "wma": { const s = wma(closes, period ?? 20); return { current: asNumber(last(closes)), previous: asNumber(last(s)), secondaryCurrent: null, secondaryPrevious: null }; }
    case "hma": { const s = hma(closes, period ?? 20); return { current: asNumber(last(closes)), previous: asNumber(last(s)), secondaryCurrent: null, secondaryPrevious: null }; }
    case "vwma": { const s = vwma(closes, volumes, period ?? 20); return { current: asNumber(last(closes)), previous: asNumber(last(s)), secondaryCurrent: null, secondaryPrevious: null }; }
    case "vwap": { const s = vwap(highs, lows, closes, volumes); return { current: asNumber(last(closes)), previous: asNumber(last(s)), secondaryCurrent: null, secondaryPrevious: null }; }
    case "bollinger": {
      const bands = bollingerBands(closes, period ?? 20, 2);
      const band = last(bands) ?? { upper: null, middle: null, lower: null };
      const pick = condition.secondary === "upper" ? band.upper : condition.secondary === "lower" ? band.lower : band.middle;
      return { current: asNumber(last(closes)), previous: asNumber(pick), secondaryCurrent: null, secondaryPrevious: null };
    }
    case "donchian": {
      const channels = donchianChannels(highs, lows, period ?? 20);
      const channel = last(channels) ?? { upper: null, middle: null, lower: null };
      return { current: asNumber(last(closes)), previous: asNumber(channel.upper), secondaryCurrent: null, secondaryPrevious: null };
    }
    case "macd": {
      const result = macd(closes, period ?? 12, (period ?? 12) * 2 + 2, 9);
      if (condition.secondary === "signal") {
        return { current: asNumber(last(result.macd)), previous: asNumber(secondLast(result.macd)), secondaryCurrent: asNumber(last(result.signal)), secondaryPrevious: asNumber(secondLast(result.signal)) };
      }
      return { current: asNumber(last(result.macd)), previous: asNumber(secondLast(result.macd)), secondaryCurrent: null, secondaryPrevious: null };
    }
    case "stochastic": case "stochrsi": {
      const result = condition.indicator === "stochastic" ? stochastic(highs, lows, closes, period ?? 14, 3, 3) : stochasticRsi(closes, period ?? 14, 3, 3);
      const k = condition.secondary === "d" ? result.d : result.k;
      const other = condition.secondary === "d" ? result.k : result.d;
      return { current: asNumber(last(k)), previous: asNumber(secondLast(k)), secondaryCurrent: asNumber(last(other)), secondaryPrevious: null };
    }
    case "williamsR": { const s = williamsR(highs, lows, closes, period ?? 14); return { current: asNumber(last(s)), previous: asNumber(secondLast(s)), secondaryCurrent: null, secondaryPrevious: null }; }
    case "cci": { const s = cci(highs, lows, closes, period ?? 20); return { current: asNumber(last(s)), previous: asNumber(secondLast(s)), secondaryCurrent: null, secondaryPrevious: null }; }
    case "mfi": { const s = mfi(highs, lows, closes, volumes, period ?? 14); return { current: asNumber(last(s)), previous: asNumber(secondLast(s)), secondaryCurrent: null, secondaryPrevious: null }; }
    case "atr": { const s = atr(highs, lows, closes, period ?? 14); return { current: asNumber(last(s)), previous: asNumber(secondLast(s)), secondaryCurrent: null, secondaryPrevious: null }; }
    case "adx": { const result = adx(highs, lows, closes, period ?? 14); return { current: asNumber(last(result.adx)), previous: asNumber(secondLast(result.adx)), secondaryCurrent: asNumber(last(result.plusDi)), secondaryPrevious: asNumber(last(result.minusDi)) }; }
    case "obv": { const s = obv(closes, volumes); return { current: asNumber(last(s)), previous: asNumber(secondLast(s)), secondaryCurrent: null, secondaryPrevious: null }; }
    case "ad": { const s = accumulationDistribution(highs, lows, closes, volumes); return { current: asNumber(last(s)), previous: asNumber(secondLast(s)), secondaryCurrent: null, secondaryPrevious: null }; }
    case "roc": { const s = roc(closes, period ?? 12); return { current: asNumber(last(s)), previous: asNumber(secondLast(s)), secondaryCurrent: null, secondaryPrevious: null }; }
    case "momentum": { const s = momentum(closes, period ?? 10); return { current: asNumber(last(s)), previous: asNumber(secondLast(s)), secondaryCurrent: null, secondaryPrevious: null }; }
    case "stdev": { const s = stdev(closes, period ?? 20); return { current: asNumber(last(s)), previous: asNumber(secondLast(s)), secondaryCurrent: null, secondaryPrevious: null }; }
    case "supertrend": { const s = supertrend(highs, lows, closes, period ?? 10, 3); return { current: asNumber(last(closes)), previous: asNumber(last(s.line)), secondaryCurrent: asNumber(last(s.direction)), secondaryPrevious: null }; }
    default: return { current: null, previous: null, secondaryCurrent: null, secondaryPrevious: null };
  }
}

/**
 * Evaluate one condition against one candidate.
 *
 * Returns `passed: null` when the indicator has no defined value — the candidate is then
 * excluded rather than being treated as a match, because "we could not tell" is not "yes".
 */
export function evaluateCondition(condition: Condition, candidate: ScreenerCandidate): ConditionOutcome {
  const { current, previous, secondaryCurrent, secondaryPrevious } = resolveValues(condition, candidate);
  if (current === null) return { condition, passed: null, detail: "Not enough history to compute this." };

  // For a line-vs-line condition the threshold is the other line, not the parsed number.
  // `previous` holds the indicator line for price-vs-indicator conditions, and
  // `secondaryCurrent` holds it for two-line comparisons (MACD vs signal, %K vs %D).
  if (condition.direction) {
    const state = secondaryCurrent;
    if (state === null) return { condition, passed: null, detail: "Direction is not defined yet." };
    const passed = state === condition.value;
    return { condition, passed, detail: `Direction is ${state === 1 ? "up" : state === -1 ? "down" : "flat"}${passed ? "" : `, not ${condition.value === 1 ? "up" : "down"}`}` };
  }

  const threshold = condition.lineVsLine
    ? (condition.secondary ? secondaryCurrent : previous)
    : condition.value;
  const priorThreshold = condition.lineVsLine
    ? (condition.secondary ? secondaryPrevious : previous)
    : condition.value;
  const label = condition.lineVsLine ? (condition.secondary ?? "the line") : String(condition.value);

  if (threshold === null) return { condition, passed: null, detail: "The comparison line is not defined yet." };

  switch (condition.comparator) {
    case "above":
      return { condition, passed: current > threshold, detail: `${current.toFixed(2)} is ${current > threshold ? "above" : "not above"} ${label}` };
    case "below":
      return { condition, passed: current < threshold, detail: `${current.toFixed(2)} is ${current < threshold ? "below" : "not below"} ${label}` };
    case "equals": {
      // "at 50" for a bounded oscillator means within half a point, not exact equality:
      // requiring 50.000000 would never match.
      const tolerance = Math.max(0.5, Math.abs(threshold) * 0.005);
      const passed = Math.abs(current - threshold) <= tolerance;
      return { condition, passed, detail: `${current.toFixed(2)} is ${passed ? "at" : "not at"} ${label}` };
    }
    case "between": {
      if (condition.valueUpper === undefined) return { condition, passed: null, detail: "A range needs two bounds." };
      const low = Math.min(threshold, condition.valueUpper);
      const high = Math.max(threshold, condition.valueUpper);
      const passed = current >= low && current <= high;
      return { condition, passed, detail: `${current.toFixed(2)} is ${passed ? "inside" : "outside"} ${low}-${high}` };
    }
    case "crossesAbove": {
      const from = condition.lineVsLine ? priorThreshold : previous;
      if (from === null) return { condition, passed: null, detail: "A cross needs two bars." };
      const passed = from <= threshold && current > threshold;
      return { condition, passed, detail: `${from.toFixed(2)} -> ${current.toFixed(2)} across ${label}` };
    }
    case "crossesBelow": {
      const from = condition.lineVsLine ? priorThreshold : previous;
      if (from === null) return { condition, passed: null, detail: "A cross needs two bars." };
      const passed = from >= threshold && current < threshold;
      return { condition, passed, detail: `${from.toFixed(2)} -> ${current.toFixed(2)} across ${label}` };
    }
    default:
      return { condition, passed: null, detail: "Unsupported comparison." };
  }
}

/** Evaluate a parsed screen against a set of candidates. */
export function runScreen(parse: ParseResult, candidates: ReadonlyArray<ScreenerCandidate>): EvaluationResult[] {
  return candidates.map((candidate) => {
    const outcomes = parse.conditions.map((condition) => evaluateCondition(condition, candidate));
    const passedCount = outcomes.filter((outcome) => outcome.passed === true).length;
    const undefinedCount = outcomes.filter((outcome) => outcome.passed === null).length;
    const matched = parse.combinator === "and"
      ? outcomes.length > 0 && outcomes.every((outcome) => outcome.passed === true)
      : outcomes.some((outcome) => outcome.passed === true);
    return { symbol: candidate.symbol, name: candidate.name, matched, passedCount, undefinedCount, outcomes };
  }).sort((a, b) => Number(b.matched) - Number(a.matched) || b.passedCount - a.passedCount);
}

/** Ready-made example screens, so the feature is discoverable without a blank box. */
export const EXAMPLE_SCREENS: readonly string[] = [
  "RSI below 30 and price above 200-day EMA",
  "MACD crosses above 0 and ADX above 25",
  "price below lower Bollinger Band and volume above 20-day average",
  "Stochastic below 20 and CCI below -100",
  "price above VWAP and MFI above 80",
  "Supertrend up and Williams %R above -20",
];
