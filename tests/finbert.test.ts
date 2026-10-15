import { describe, expect, it } from "vitest";

import {
  FINBERT_CHUNK_TOKENS,
  FINBERT_MODEL_ID,
  aggregateSentiment,
  chunkText,
  classifySentimentFailure,
  dominantSentiment,
  estimateTokenCount,
  isCacheFresh,
  parseClassifierOutput,
  resolveSentimentAvailability,
  retryDelayMs,
  sentimentCacheKey,
  toSentimentLabel,
  type LabelScore,
} from "../lib/finbert";

describe("label mapping (mandate §11.7)", () => {
  it("maps the three FinBERT labels", () => {
    expect(toSentimentLabel("positive")).toBe("positive");
    expect(toSentimentLabel("NEGATIVE")).toBe("negative");
    expect(toSentimentLabel(" neutral ")).toBe("neutral");
  });

  it("maps LABEL_n forms", () => {
    expect(toSentimentLabel("LABEL_0")).toBe("negative");
    expect(toSentimentLabel("label_1")).toBe("neutral");
    expect(toSentimentLabel("label_2")).toBe("positive");
  });

  it("rejects unknown labels rather than guessing", () => {
    for (const value of ["mixed", "", null, undefined, 7, {}]) expect(toSentimentLabel(value)).toBeNull();
  });
});

describe("response validation (mandate §11.7)", () => {
  const good: LabelScore[] = [
    { label: "positive", score: 0.81 },
    { label: "neutral", score: 0.14 },
    { label: "negative", score: 0.05 },
  ];

  it("accepts a well-formed response, including the batch shape", () => {
    expect(parseClassifierOutput(good).ok).toBe(true);
    expect(parseClassifierOutput([good]).ok).toBe(true);
  });

  it("rejects malformed, non-finite and out-of-range scores", () => {
    expect(parseClassifierOutput(null).ok).toBe(false);
    expect(parseClassifierOutput("nope").ok).toBe(false);
    expect(parseClassifierOutput([]).ok).toBe(false);
    expect(parseClassifierOutput([{ label: "positive", score: Number.NaN }]).ok).toBe(false);
    expect(parseClassifierOutput([{ label: "positive", score: 1.4 }]).ok).toBe(false);
    expect(parseClassifierOutput([{ label: "positive", score: -0.1 }]).ok).toBe(false);
    expect(parseClassifierOutput([{ label: "mystery", score: 0.5 }]).ok).toBe(false);
    expect(parseClassifierOutput([{ score: 0.5 }]).ok).toBe(false);
  });

  it("rejects a duplicated label", () => {
    const result = parseClassifierOutput([{ label: "positive", score: 0.5 }, { label: "positive", score: 0.5 }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/duplicate/i);
  });

  it("picks the dominant label deterministically, including ties", () => {
    expect(dominantSentiment(good)?.label).toBe("positive");
    const tie: LabelScore[] = [{ label: "negative", score: 0.5 }, { label: "positive", score: 0.5 }];
    expect(dominantSentiment(tie)?.label).toBe("positive");
    expect(dominantSentiment([])).toBeNull();
  });
});

describe("token estimation and chunking (mandate §11.3)", () => {
  it("estimates conservatively and never returns a negative count", () => {
    expect(estimateTokenCount("")).toBe(0);
    expect(estimateTokenCount("hello world")).toBeGreaterThan(0);
    // A long word list must not under-estimate below the word count.
    expect(estimateTokenCount("a b c d e f g h i j")).toBeGreaterThanOrEqual(10);
  });

  it("returns a single chunk for short text", () => {
    const result = chunkText("Reliance reported higher profit this quarter.");
    expect(result.count).toBe(1);
    expect(result.truncated).toBe(false);
  });

  it("splits long text into multiple chunks without truncation", () => {
    const sentence = "The company reported revenue growth and margin expansion. ";
    const long = sentence.repeat(200);
    const result = chunkText(long);
    expect(result.count).toBeGreaterThan(1);
    expect(result.truncated).toBe(false);
    // Every chunk must respect the limit.
    for (const chunk of result.chunks) expect(estimateTokenCount(chunk)).toBeLessThanOrEqual(FINBERT_CHUNK_TOKENS + 40);
  });

  it("handles empty, whitespace and no-sentence-boundary text", () => {
    expect(chunkText("").count).toBe(0);
    expect(chunkText("   ").count).toBe(0);
    const noBoundary = "word ".repeat(2000);
    expect(() => chunkText(noBoundary)).not.toThrow();
    expect(chunkText(noBoundary).count).toBeGreaterThan(0);
  });

  it("handles unusual Unicode without throwing", () => {
    const unicode = "कंपनी ने लाभ बढ़ाया। ".repeat(200) + "😀 ".repeat(50) + "日本語のテキスト。".repeat(50);
    const result = chunkText(unicode);
    expect(result.count).toBeGreaterThan(0);
    expect(result.truncated).toBe(false);
  });

  it("discloses truncation instead of hiding it", () => {
    const result = chunkText("sentence here. ".repeat(3000), { maxChunks: 3 });
    expect(result.truncated).toBe(true);
    expect(result.droppedCharacters).toBeGreaterThan(0);
    expect(result.count).toBe(3);
  });

  it("is deterministic", () => {
    const text = "One sentence. Two sentence. Three sentence. ".repeat(60);
    expect(chunkText(text)).toEqual(chunkText(text));
  });
});

describe("aggregation (mandate §11.7)", () => {
  const pos: LabelScore[] = [{ label: "positive", score: 0.8 }, { label: "neutral", score: 0.15 }, { label: "negative", score: 0.05 }];
  const neg: LabelScore[] = [{ label: "negative", score: 0.7 }, { label: "neutral", score: 0.2 }, { label: "positive", score: 0.1 }];

  it("returns an empty result for no input rather than a fabricated score", () => {
    const result = aggregateSentiment([]);
    expect(result.overall).toBeNull();
    expect(result.chunksAnalyzed).toBe(0);
    expect(result.distribution).toEqual({ positive: 0, neutral: 0, negative: 0 });
  });

  it("does not let one long article dominate (article-level weighting)", () => {
    // One article split into 20 positive chunks vs one short negative article.
    const longArticle = Array.from({ length: 20 }, () => ({ scores: pos, weight: 10, sourceId: "long" }));
    const shortArticle = [{ scores: neg, weight: 10, sourceId: "short" }];
    const result = aggregateSentiment([...longArticle, ...shortArticle]);
    // With per-article means the two articles carry equal weight: neither side
    // should swamp the other, unlike a naive chunk-level mean.
    expect(result.sourcesRepresented).toBe(2);
    expect(result.distribution.positive).toBeLessThan(0.5);
    expect(result.distribution.negative).toBeGreaterThan(0.3);
  });

  it("collapses duplicate sources before aggregating", () => {
    const duplicate = Array.from({ length: 5 }, () => ({ scores: pos, weight: 1, sourceId: "same-article" }));
    const result = aggregateSentiment([...duplicate, { scores: neg, weight: 1, sourceId: "other" }]);
    expect(result.sourcesRepresented).toBe(2);
  });

  it("is deterministic and order-independent", () => {
    const a = aggregateSentiment([{ scores: pos, weight: 1, sourceId: "a" }, { scores: neg, weight: 1, sourceId: "b" }]);
    const b = aggregateSentiment([{ scores: neg, weight: 1, sourceId: "b" }, { scores: pos, weight: 1, sourceId: "a" }]);
    expect(a).toEqual(b);
  });

  it("states that confidence is not return probability", () => {
    const result = aggregateSentiment([{ scores: pos, weight: 1, sourceId: "a" }]);
    expect(result.limitations.join(" ")).toMatch(/not the probability that a stock will rise/i);
    expect(result.limitations.join(" ")).toMatch(/not investment advice/i);
  });
});

describe("failure handling (mandate §11.4/§11.7)", () => {
  it("classifies each HTTP condition", () => {
    expect(classifySentimentFailure({ status: 401 }).kind).toBe("unauthorized");
    expect(classifySentimentFailure({ status: 403 }).retryable).toBe(false);
    expect(classifySentimentFailure({ status: 429 }).retryable).toBe(true);
    expect(classifySentimentFailure({ status: 503 }).kind).toBe("unavailable");
    expect(classifySentimentFailure({ status: 500 }).kind).toBe("server-error");
    expect(classifySentimentFailure({ kind: "timeout" }).kind).toBe("timeout");
    expect(classifySentimentFailure({ kind: "malformed" }).retryable).toBe(false);
    expect(classifySentimentFailure({ kind: "network" }).retryable).toBe(true);
    expect(classifySentimentFailure({}).kind).toBe("not-configured");
  });

  it("backs off but stays bounded", () => {
    expect(retryDelayMs(0)).toBe(400);
    expect(retryDelayMs(1)).toBe(800);
    expect(retryDelayMs(99)).toBeLessThanOrEqual(4000);
    expect(retryDelayMs(-5)).toBe(400);
  });

  it("never leaks a credential in a user message", () => {
    for (const status of [401, 403, 429, 500, 503]) {
      const message = classifySentimentFailure({ status }).userMessage;
      expect(message).not.toMatch(/token|bearer|api[_-]?key|hf_/i);
    }
  });
});

describe("cache and availability (mandate §11.4)", () => {
  it("keys the cache by model and revision, and invalidates on model change", () => {
    const base = sentimentCacheKey("text", FINBERT_MODEL_ID, "rev1");
    expect(sentimentCacheKey("text", FINBERT_MODEL_ID, "rev1")).toBe(base);
    expect(sentimentCacheKey("text", FINBERT_MODEL_ID, "rev2")).not.toBe(base);
    expect(sentimentCacheKey("other", FINBERT_MODEL_ID, "rev1")).not.toBe(base);
    expect(sentimentCacheKey("text", "other/model", "rev1")).not.toBe(base);
  });

  it("treats stale or malformed timestamps as stale", () => {
    const now = Date.parse("2026-10-13T12:00:00Z");
    expect(isCacheFresh("2026-10-13T11:00:00Z", now)).toBe(true);
    expect(isCacheFresh("2026-10-10T11:00:00Z", now)).toBe(false);
    expect(isCacheFresh(null, now)).toBe(false);
    expect(isCacheFresh("not-a-date", now)).toBe(false);
  });

  it("reports not-configured rather than pretending to have a score", () => {
    const state = resolveSentimentAvailability({ tokenPresent: false, endpoint: "https://api-inference.huggingface.co/models/ProsusAI/finbert" });
    expect(state.status).toBe("not-configured");
    if (state.status === "not-configured") expect(state.reason).toMatch(/never embedded in the app/i);
  });

  it("reports available only when a token and endpoint both exist", () => {
    expect(resolveSentimentAvailability({ tokenPresent: true, endpoint: "https://example.test/finbert" }).status).toBe("available");
    expect(resolveSentimentAvailability({ tokenPresent: true, endpoint: null }).status).toBe("not-configured");
  });
});
