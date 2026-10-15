/**
 * The published signal history.
 *
 * The Strategy Lab must be accountable for what it said and when it said it. This module keeps an
 * **append-only, timestamped, hash-chained** record of every suggestion the Lab produces, so that at
 * any later date a reader can see exactly what was suggested, for which market, under which
 * framework, and at what time — and can detect any attempt to alter that record afterwards.
 *
 * Design commitments:
 *   - **Append-only.** A record is never edited. Corrections are new records.
 *   - **Tamper-evident.** Each record carries the hash of the previous record and a hash of its own
 *     content, so changing or removing any record breaks verification from that point onward.
 *   - **Self-describing.** Every record states the market, the strategy and a digest of the inputs
 *     the suggestion was derived from, so a later reader can tell what it was based on.
 *   - **Honest about outcomes.** A record holds only what was suggested at the time. What happened
 *     afterwards is a separate, later evaluation — never back-filled into the original record.
 */
import type { MarketId } from "./core-types";
import { sha256Text } from "./hash";

/** Hash of the record before the first one. */
export const GENESIS_HASH = "0".repeat(64);

export type SuggestionKind = "screen" | "rank" | "model" | "backtest";

export type Suggestion = {
  symbol: string;
  /**
   * The price at the moment of publication. This is the only honest basis for a later evaluation:
   * a score is not a price, and reconstructing one afterwards would be back-filling.
   */
  referencePrice: number | null;
  /** The score or rank the Lab attached at the time, when it had one. */
  score: number | null;
  /** Human-readable reason the asset was suggested. */
  detail: string;
};

export type SignalRecord = {
  /** Monotonic sequence number, starting at 1. */
  seq: number;
  /** Epoch milliseconds — the moment the suggestion was published. */
  recordedAt: number;
  /** ISO-8601 rendering of `recordedAt`, stored so the published artefact is readable as-is. */
  recordedAtIso: string;
  marketId: MarketId;
  strategyId: string;
  strategyName: string;
  kind: SuggestionKind;
  suggestions: Suggestion[];
  /** SHA-256 of the inputs the suggestion was derived from. */
  inputDigest: string;
  /** Hash of the previous record, or GENESIS_HASH for the first. */
  previousHash: string;
  /** SHA-256 over this record's content plus `previousHash`. */
  hash: string;
};

export type SignalDraft = Omit<SignalRecord, "seq" | "recordedAtIso" | "previousHash" | "hash">;

/** Canonical serialisation: field order is fixed so the hash is stable across runtimes. */
function canonical(record: Omit<SignalRecord, "hash">): string {
  return JSON.stringify([
    record.seq,
    record.recordedAt,
    record.marketId,
    record.strategyId,
    record.strategyName,
    record.kind,
    record.suggestions.map((suggestion) => [suggestion.symbol, suggestion.referencePrice, suggestion.score, suggestion.detail]),
    record.inputDigest,
    record.previousHash,
  ]);
}

/** SHA-256 of a record's content including its link to the previous record. */
export function hashRecord(record: Omit<SignalRecord, "hash">): string {
  return sha256Text(canonical(record));
}

/** A stable digest of arbitrary inputs, used to record what a suggestion was derived from. */
export function digestInputs(value: unknown): string {
  const stable = (input: unknown): string => {
    if (input === null || typeof input !== "object") return JSON.stringify(input) ?? "null";
    if (Array.isArray(input)) return `[${input.map(stable).join(",")}]`;
    const record = input as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`;
  };
  return sha256Text(stable(value));
}

/** Append a suggestion to the chain. The record is sealed with its own hash and the previous link. */
export function appendSignal(chain: SignalRecord[], draft: SignalDraft): SignalRecord {
  const previousHash = chain.length > 0 ? chain[chain.length - 1].hash : GENESIS_HASH;
  const unsealed: Omit<SignalRecord, "hash"> = {
    ...draft,
    seq: chain.length + 1,
    recordedAtIso: new Date(draft.recordedAt).toISOString(),
    previousHash,
  };
  return { ...unsealed, hash: hashRecord(unsealed) };
}

export type ChainVerification = {
  valid: boolean;
  /** Sequence number of the first record that fails verification, or null when valid. */
  brokenAt: number | null;
  reason: string | null;
  records: number;
};

/**
 * Verify the whole chain: sequence numbers must be contiguous, every link must match the previous
 * hash, and every record's own hash must match its content.
 */
export function verifyChain(chain: SignalRecord[]): ChainVerification {
  let previousHash = GENESIS_HASH;
  for (let i = 0; i < chain.length; i += 1) {
    const record = chain[i];
    if (record.seq !== i + 1) return { valid: false, brokenAt: record.seq, reason: `sequence number is ${record.seq}, expected ${i + 1}`, records: chain.length };
    if (record.previousHash !== previousHash) return { valid: false, brokenAt: record.seq, reason: "the link to the previous record does not match", records: chain.length };
    const expected = hashRecord(record);
    if (record.hash !== expected) return { valid: false, brokenAt: record.seq, reason: "the record's content does not match its hash", records: chain.length };
    previousHash = record.hash;
  }
  return { valid: true, brokenAt: null, reason: null, records: chain.length };
}

/** The publishable artefact: the whole chain plus a head digest a reader can quote. */
export type PublishedHistory = {
  format: "analyzerx.signal-history.v1";
  publishedAt: string;
  records: number;
  /** Digest of the final record — quote this to pin the whole history. */
  headHash: string;
  chain: SignalRecord[];
};

export function exportHistory(chain: SignalRecord[], publishedAt = Date.now()): PublishedHistory {
  return {
    format: "analyzerx.signal-history.v1",
    publishedAt: new Date(publishedAt).toISOString(),
    records: chain.length,
    headHash: chain.length > 0 ? chain[chain.length - 1].hash : GENESIS_HASH,
    chain,
  };
}

/** Serialise for publication. Stable key order so the artefact is diffable. */
export function serializeHistory(chain: SignalRecord[], publishedAt = Date.now()): string {
  return JSON.stringify(exportHistory(chain, publishedAt), null, 2);
}

/** Parse a published artefact back into a chain, rejecting anything malformed. */
export function parseHistory(text: string): SignalRecord[] | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    const container = Array.isArray(parsed) ? { chain: parsed } : (parsed as { chain?: unknown });
    if (!container || !Array.isArray(container.chain)) return null;
    const chain: SignalRecord[] = [];
    for (const raw of container.chain) {
      if (!raw || typeof raw !== "object") return null;
      const record = raw as Record<string, unknown>;
      if (typeof record.seq !== "number" || typeof record.recordedAt !== "number") return null;
      if (typeof record.hash !== "string" || typeof record.previousHash !== "string") return null;
      if (typeof record.strategyId !== "string" || typeof record.marketId !== "string") return null;
      if (!Array.isArray(record.suggestions)) return null;
      const suggestions: Suggestion[] = [];
      for (const item of record.suggestions) {
        if (!item || typeof item !== "object") return null;
        const suggestion = item as Record<string, unknown>;
        if (typeof suggestion.symbol !== "string") return null;
        suggestions.push({
          symbol: suggestion.symbol,
          referencePrice: typeof suggestion.referencePrice === "number" ? suggestion.referencePrice : null,
          score: typeof suggestion.score === "number" ? suggestion.score : null,
          detail: typeof suggestion.detail === "string" ? suggestion.detail : "",
        });
      }
      chain.push({
        seq: record.seq,
        recordedAt: record.recordedAt,
        recordedAtIso: typeof record.recordedAtIso === "string" ? record.recordedAtIso : new Date(record.recordedAt).toISOString(),
        marketId: record.marketId as MarketId,
        strategyId: record.strategyId,
        strategyName: typeof record.strategyName === "string" ? record.strategyName : record.strategyId,
        kind: (record.kind as SuggestionKind) ?? "screen",
        suggestions,
        inputDigest: typeof record.inputDigest === "string" ? record.inputDigest : "",
        previousHash: record.previousHash,
        hash: record.hash,
      });
    }
    return chain;
  } catch {
    return null;
  }
}

export type RecordOutcome = {
  symbol: string;
  /** Price used for the evaluation. */
  price: number | null;
  /** Return from the suggestion price to the evaluation price, as a percentage. */
  returnPct: number | null;
  status: "evaluated" | "no-price";
};

export type OutcomeReport = {
  seq: number;
  recordedAt: string;
  marketId: MarketId;
  strategyName: string;
  /** How long after publication the evaluation was made. */
  elapsedDays: number;
  outcomes: RecordOutcome[];
  averageReturnPct: number | null;
  hits: number;
  misses: number;
};

/**
 * Evaluate what a past suggestion would have returned, **at a later date**.
 *
 * This never writes back into the record. It produces a separate report, so the original suggestion
 * stays exactly as published and the evaluation is visibly a later judgement.
 */
export function evaluateRecord(
  record: SignalRecord,
  prices: Record<string, number>,
  asOf: number,
): OutcomeReport {
  const outcomes: RecordOutcome[] = record.suggestions.map((suggestion) => {
    const price = prices[suggestion.symbol];
    if (typeof price !== "number" || !Number.isFinite(price)) return { symbol: suggestion.symbol, price: null, returnPct: null, status: "no-price" };
    const entry = suggestion.referencePrice;
    // Without a recorded publication price there is nothing to measure against, and inventing one
    // now would make the evaluation meaningless.
    if (entry === null || !Number.isFinite(entry) || entry <= 0) return { symbol: suggestion.symbol, price, returnPct: null, status: "no-price" };
    return { symbol: suggestion.symbol, price, returnPct: (price / entry - 1) * 100, status: "evaluated" };
  });
  const evaluated = outcomes.filter((outcome) => outcome.returnPct !== null);
  return {
    seq: record.seq,
    recordedAt: record.recordedAtIso,
    marketId: record.marketId,
    strategyName: record.strategyName,
    elapsedDays: (asOf - record.recordedAt) / 86_400_000,
    outcomes,
    averageReturnPct: evaluated.length > 0 ? evaluated.reduce((sum, outcome) => sum + (outcome.returnPct as number), 0) / evaluated.length : null,
    hits: evaluated.filter((outcome) => (outcome.returnPct as number) > 0).length,
    misses: evaluated.filter((outcome) => (outcome.returnPct as number) < 0).length,
  };
}
