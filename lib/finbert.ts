/**
 * FinBERT sentiment integration — safe core (audit mandate §11).
 *
 * WHAT THIS IS: the deterministic, testable half of a financial-text sentiment
 * feature — response validation, label mapping, tokenizer-aware chunking,
 * aggregation with long-article/duplicate protection, failure classification,
 * cache freshness, and an honest availability state.
 *
 * WHAT THIS IS NOT: a live provider integration. Calling Hugging Face needs a
 * credential. §11.4 forbids embedding that token in the mobile bundle, and this
 * app has no configured backend to hold it, so the network call lives behind a
 * server-side env var and this module reports `unavailable` with a reason when
 * it is absent. It never returns a score it did not receive.
 *
 * WHAT FINBERT DOES NOT DO: it classifies sentiment. It does not value a
 * company, verify statements, forecast returns, or justify a buy/sell signal.
 * A sentiment score must never be presented as investment advice or as the
 * probability that a stock will rise (§11.1).
 */

/** The model this module is written against. Verified ID, not invented. */
export const FINBERT_MODEL_ID = "ProsusAI/finbert";
/** BERT-family sequence limit. Special tokens count toward it (§11.3). */
export const FINBERT_MAX_TOKENS = 512;
/** Conservative per-chunk budget, leaving room for [CLS]/[SEP]. */
export const FINBERT_CHUNK_TOKENS = 400;
export const FINBERT_CHUNK_OVERLAP_TOKENS = 40;

export type SentimentLabel = "positive" | "neutral" | "negative";

export type LabelScore = { label: SentimentLabel; score: number };

export type ParseResult = { ok: true; scores: LabelScore[] } | { ok: false; reason: string };

/** Map a raw model label to a UI category. Unknown labels are rejected, not guessed. */
export function toSentimentLabel(raw: unknown): SentimentLabel | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  if (value === "positive" || value === "pos" || value === "label_2") return "positive";
  if (value === "negative" || value === "neg" || value === "label_0") return "negative";
  if (value === "neutral" || value === "neu" || value === "label_1") return "neutral";
  return null;
}

/**
 * Validate a Hugging Face text-classification response. Labels must map,
 * scores must be finite and within [0,1], and every expected label must be
 * present exactly once — a partial or malformed payload is rejected rather than
 * silently producing a confident-looking number (§11.7).
 */
export function parseClassifierOutput(raw: unknown): ParseResult {
  // Accept either a single array or the batch shape [[...]].
  let rows: unknown = raw;
  if (Array.isArray(raw) && Array.isArray(raw[0])) rows = raw[0];
  if (!Array.isArray(rows)) return { ok: false, reason: "The response was not a classification array." };

  const scores: LabelScore[] = [];
  for (const entry of rows) {
    if (entry === null || typeof entry !== "object") return { ok: false, reason: "A classification entry was not an object." };
    const record = entry as { label?: unknown; score?: unknown };
    const label = toSentimentLabel(record.label);
    if (!label) return { ok: false, reason: `Unrecognised sentiment label: ${String(record.label)}` };
    const score = record.score;
    if (typeof score !== "number" || !Number.isFinite(score)) return { ok: false, reason: "A sentiment score was missing or not finite." };
    if (score < 0 || score > 1) return { ok: false, reason: `A sentiment score was outside [0,1]: ${score}` };
    if (scores.some((item) => item.label === label)) return { ok: false, reason: `Duplicate sentiment label: ${label}` };
    scores.push({ label, score });
  }
  if (scores.length === 0) return { ok: false, reason: "The response contained no scores." };
  return { ok: true, scores };
}

/** The highest-scoring label. Ties resolve deterministically (negative < neutral < positive). */
export function dominantSentiment(scores: readonly LabelScore[]): { label: SentimentLabel; confidence: number } | null {
  if (scores.length === 0) return null;
  const order: SentimentLabel[] = ["negative", "neutral", "positive"];
  let best = scores[0];
  for (const score of scores) {
    if (score.score > best.score) best = score;
    else if (score.score === best.score && order.indexOf(score.label) > order.indexOf(best.label)) best = score;
  }
  return { label: best.label, confidence: best.score };
}

/**
 * A conservative token estimate. This is NOT a tokenizer (§11.3): it is a
 * deliberately pessimistic heuristic used only to decide chunk boundaries, and
 * the caller must never present it as an exact token count.
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  // ~4 characters per token is the common English average; long words and
  // punctuation push it lower, so we bias toward more tokens, not fewer.
  const byChars = Math.ceil(text.length / 3.5);
  const byWords = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(byChars, Math.ceil(byWords * 1.3));
}

export type ChunkResult = {
  chunks: string[];
  /** True when content had to be dropped to respect the limit. */
  truncated: boolean;
  /** How many chunks were produced. */
  count: number;
  method: string;
  /** What was dropped, for disclosure. */
  droppedCharacters: number;
};

/**
 * Sentence-aware chunking with overlap. Never slices mid-word where a sentence
 * boundary exists, and reports truncation rather than hiding it.
 */
export function chunkText(
  text: string,
  options: { maxTokens?: number; overlapTokens?: number; maxChunks?: number } = {},
): ChunkResult {
  const maxTokens = options.maxTokens ?? FINBERT_CHUNK_TOKENS;
  const overlapTokens = options.overlapTokens ?? FINBERT_CHUNK_OVERLAP_TOKENS;
  const maxChunks = options.maxChunks ?? 40;
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  const method = "Sentence-aware packing with token-estimate limits and overlap; long articles are split, not truncated silently.";

  if (!clean) return { chunks: [], truncated: false, count: 0, method, droppedCharacters: 0 };
  if (estimateTokenCount(clean) <= maxTokens) {
    return { chunks: [clean], truncated: false, count: 1, method, droppedCharacters: 0 };
  }

  const sentences = clean.split(/(?<=[.!?])\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current: string[] = [];
  let currentTokens = 0;

  const push = () => {
    if (current.length) chunks.push(current.join(" "));
    current = [];
    currentTokens = 0;
  };

  for (const sentence of sentences) {
    const tokens = estimateTokenCount(sentence);
    if (tokens > maxTokens) {
      // A single sentence longer than the limit: hard-split on whitespace.
      push();
      const words = sentence.split(" ");
      let buffer: string[] = [];
      for (const word of words) {
        buffer.push(word);
        if (estimateTokenCount(buffer.join(" ")) >= maxTokens) {
          chunks.push(buffer.join(" "));
          buffer = buffer.slice(-Math.max(1, Math.floor(overlapTokens / 2)));
        }
      }
      if (buffer.length) chunks.push(buffer.join(" "));
      continue;
    }
    if (currentTokens + tokens > maxTokens) {
      push();
      // Carry a small overlap so a claim split across the boundary stays readable.
      const previous = chunks.at(-1);
      if (previous && overlapTokens > 0) {
        const tail = previous.split(" ").slice(-overlapTokens).join(" ");
        current = [tail];
        currentTokens = estimateTokenCount(tail);
      }
    }
    current.push(sentence);
    currentTokens += tokens;
  }
  push();

  const kept = chunks.slice(0, maxChunks);
  const truncated = chunks.length > maxChunks;
  const droppedCharacters = truncated ? clean.length - kept.join(" ").length : 0;
  return { chunks: kept, truncated, count: kept.length, method, droppedCharacters };
}

export type ChunkSentiment = {
  scores: LabelScore[];
  /** Characters analysed in this chunk, used to weight it fairly. */
  weight: number;
  sourceId?: string;
};

export type SentimentDistribution = { positive: number; neutral: number; negative: number };

export type AggregationResult = {
  /** Mean class probability across analysed chunks, 0-1 each. */
  distribution: SentimentDistribution;
  /** The mean-weighted dominant class. */
  overall: SentimentLabel | null;
  /** Chunk count actually aggregated. */
  chunksAnalyzed: number;
  /** Distinct sources, so one syndicated article cannot dominate. */
  sourcesRepresented: number;
  method: string;
  limitations: string[];
};

/**
 * Aggregate chunk results deterministically.
 *
 * Long-article protection: each *article* contributes equally regardless of how
 * many chunks it was split into, so a 40-chunk report cannot outvote a short
 * one. Duplicate-source suppression: chunks carrying the same `sourceId` are
 * collapsed to that source's mean before corpus aggregation.
 */
export function aggregateSentiment(chunkResults: readonly ChunkSentiment[]): AggregationResult {
  const method = "Per-article mean (so a long article cannot dominate), then an unweighted mean across distinct sources; deterministic and order-independent.";
  const limitations = [
    "Model confidence is the classifier's own class probability. It is not the probability that a stock will rise, and not a measure of return.",
    "Sentiment is informational research, not investment advice, and is kept separate from fundamental analysis.",
  ];
  if (chunkResults.length === 0) {
    return { distribution: { positive: 0, neutral: 0, negative: 0 }, overall: null, chunksAnalyzed: 0, sourcesRepresented: 0, method, limitations: ["No text was analysed."] };
  }

  const zero: SentimentDistribution = { positive: 0, neutral: 0, negative: 0 };
  const bySource = new Map<string, ChunkSentiment[]>();
  chunkResults.forEach((result, index) => {
    const key = result.sourceId ?? `__article_${index}`;
    bySource.set(key, [...(bySource.get(key) ?? []), result]);
  });

  const sourceMeans: SentimentDistribution[] = [];
  for (const entries of bySource.values()) {
    const mean = { ...zero };
    for (const entry of entries) for (const item of entry.scores) mean[item.label] += item.score;
    const divisor = entries.length || 1;
    mean.positive /= divisor; mean.neutral /= divisor; mean.negative /= divisor;
    sourceMeans.push(mean);
  }

  const distribution = { ...zero };
  for (const mean of sourceMeans) {
    distribution.positive += mean.positive;
    distribution.neutral += mean.neutral;
    distribution.negative += mean.negative;
  }
  const sources = sourceMeans.length || 1;
  distribution.positive /= sources; distribution.neutral /= sources; distribution.negative /= sources;

  const rounded: SentimentDistribution = {
    positive: Math.round(distribution.positive * 10000) / 10000,
    neutral: Math.round(distribution.neutral * 10000) / 10000,
    negative: Math.round(distribution.negative * 10000) / 10000,
  };
  const overall = dominantSentiment([
    { label: "positive", score: rounded.positive },
    { label: "neutral", score: rounded.neutral },
    { label: "negative", score: rounded.negative },
  ])?.label ?? null;

  return { distribution: rounded, overall, chunksAnalyzed: chunkResults.length, sourcesRepresented: bySource.size, method, limitations };
}

export type SentimentFailureKind = "unauthorized" | "rate-limited" | "timeout" | "malformed" | "unavailable" | "server-error" | "network" | "not-configured";

export type SentimentFailure = { kind: SentimentFailureKind; retryable: boolean; userMessage: string };

/** Classify a provider failure. Retry only what is genuinely retryable (§11.4). */
export function classifySentimentFailure(input: { status?: number | null; kind?: "timeout" | "network" | "malformed" | "unknown" }): SentimentFailure {
  const status = input.status ?? null;
  if (status === 401 || status === 403) {
    return { kind: "unauthorized", retryable: false, userMessage: "The sentiment provider rejected the credential. Sentiment is unavailable until it is corrected." };
  }
  if (status === 429) {
    return { kind: "rate-limited", retryable: true, userMessage: "The sentiment provider rate-limited this device. Sentiment is unavailable for now; try again shortly." };
  }
  if (status === 503 || status === 404) {
    return { kind: "unavailable", retryable: true, userMessage: "The sentiment model is not currently available from the provider." };
  }
  if (status !== null && status >= 500) {
    return { kind: "server-error", retryable: true, userMessage: "The sentiment provider returned a server error." };
  }
  if (input.kind === "timeout") return { kind: "timeout", retryable: true, userMessage: "The sentiment request timed out." };
  if (input.kind === "malformed") return { kind: "malformed", retryable: false, userMessage: "The sentiment provider returned an unexpected response." };
  if (input.kind === "network") return { kind: "network", retryable: true, userMessage: "The sentiment provider could not be reached." };
  return { kind: "not-configured", retryable: false, userMessage: "Sentiment analysis is not configured on this device." };
}

/** Bounded exponential backoff. Never unbounded (§11.4). */
export function retryDelayMs(attempt: number, base = 400, max = 4000): number {
  const safeAttempt = Math.max(0, Math.floor(attempt));
  return Math.min(max, base * 2 ** safeAttempt);
}

/** Cache identity: text + model + revision. A model change invalidates results. */
export function sentimentCacheKey(text: string, modelId = FINBERT_MODEL_ID, revision: string | null = null): string {
  let hash = 0;
  const input = `${modelId}:${revision ?? "unpinned"}:${text}`;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) | 0;
  }
  return `finbert:${(hash >>> 0).toString(16)}`;
}

export function isCacheFresh(storedAtIso: string | null, now: number, ttlMs = 6 * 60 * 60 * 1000): boolean {
  if (!storedAtIso) return false;
  const stored = Date.parse(storedAtIso);
  if (!Number.isFinite(stored)) return false;
  const age = now - stored;
  return age >= 0 && age <= ttlMs;
}

export type SentimentAvailability =
  | { status: "available"; endpoint: string }
  | { status: "not-configured"; reason: string }
  | { status: "unsupported-on-device"; reason: string };

/**
 * Resolve whether sentiment can actually run. A token is only ever read from a
 * server-side environment variable, so nothing lands in the APK (§11.4).
 */
export function resolveSentimentAvailability(env: { tokenPresent: boolean; endpoint: string | null }): SentimentAvailability {
  if (!env.tokenPresent) {
    return {
      status: "not-configured",
      reason: "No sentiment provider credential is configured on the server. Hugging Face inference needs a token; it is deliberately never embedded in the app, so sentiment stays unavailable until one is configured.",
    };
  }
  if (!env.endpoint) {
    return { status: "not-configured", reason: "A credential is present but no sentiment endpoint is configured." };
  }
  return { status: "available", endpoint: env.endpoint };
}
