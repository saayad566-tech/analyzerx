import {
  FINBERT_CHUNK_TOKENS,
  FINBERT_MODEL_ID,
  aggregateSentiment,
  chunkText,
  classifySentimentFailure,
  dominantSentiment,
  parseClassifierOutput,
  resolveSentimentAvailability,
  retryDelayMs,
  type ChunkSentiment,
  type SentimentAvailability,
  type SentimentFailure,
} from "../lib/finbert";

/**
 * FinBERT sentiment service (audit mandate §11).
 *
 * The Hugging Face token is read from a **server-side** environment variable and
 * is never sent to the client or bundled in the APK (§11.4). When no token is
 * configured this returns an explicit `not-configured` result — it never returns
 * a fabricated score.
 *
 * The default endpoint is Hugging Face's documented inference route for the
 * model, but its availability, latency, rate limits and response shape depend on
 * the account plan and deployment, so the endpoint is overridable and its status
 * is reported rather than assumed (§11.4).
 */

const DEFAULT_ENDPOINT = `https://api-inference.huggingface.co/models/${FINBERT_MODEL_ID}`;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;
const MAX_ARTICLES = 12;
const MAX_CHUNKS_PER_ARTICLE = 6;
const MAX_TOTAL_REQUESTS = 24;

function token(): string | null {
  const value = process.env.HUGGINGFACE_API_TOKEN ?? process.env.HF_TOKEN ?? "";
  return value.trim() ? value.trim() : null;
}

function endpoint(): string {
  const value = (process.env.FINBERT_ENDPOINT ?? "").trim();
  return value || DEFAULT_ENDPOINT;
}

export function getSentimentAvailability(): SentimentAvailability {
  return resolveSentimentAvailability({ tokenPresent: token() !== null, endpoint: endpoint() });
}

export type SentimentArticle = { id: string; title: string; text: string; publisher?: string; url?: string; publishedAt?: string | null };

export type SentimentAnalysisResult =
  | { status: "not-configured"; reason: string }
  | { status: "ok"; modelId: string; endpoint: string; distribution: { positive: number; neutral: number; negative: number }; overall: string | null; articlesAnalyzed: number; chunksAnalyzed: number; truncated: boolean; sources: Array<{ id: string; title: string; publisher?: string; url?: string; publishedAt?: string | null; label: string | null; confidence: number | null }>; method: string; limitations: string[]; retrievedAt: string }
  | { status: "failed"; failure: SentimentFailure };

async function classifyOnce(text: string, authToken: string, url: string): Promise<{ ok: true; scores: ReturnType<typeof parseClassifierOutput> } | { ok: false; failure: SentimentFailure }> {
  let lastFailure: SentimentFailure = classifySentimentFailure({});
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ inputs: text, options: { wait_for_model: true } }),
        signal: controller.signal,
      });
      if (!response.ok) {
        // Read the status only. The body can echo request content, so it is not
        // logged or surfaced (§11.4).
        const failure = classifySentimentFailure({ status: response.status });
        if (!failure.retryable || attempt === MAX_ATTEMPTS - 1) return { ok: false, failure };
        lastFailure = failure;
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs(attempt)));
        continue;
      }
      const payload = await response.json();
      const parsed = parseClassifierOutput(payload);
      if (!parsed.ok) return { ok: false, failure: classifySentimentFailure({ kind: "malformed" }) };
      return { ok: true, scores: parsed };
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      const failure = classifySentimentFailure({ kind: aborted ? "timeout" : "network" });
      if (attempt === MAX_ATTEMPTS - 1) return { ok: false, failure };
      lastFailure = failure;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs(attempt)));
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, failure: lastFailure };
}

/**
 * Analyse a bounded set of articles. Chunking is sentence-aware and reports
 * truncation; aggregation is per-article then across sources, so a long article
 * cannot dominate (§11.3, §11.7).
 */
export async function analyzeSentiment(articles: readonly SentimentArticle[]): Promise<SentimentAnalysisResult> {
  const availability = getSentimentAvailability();
  if (availability.status !== "available") return { status: "not-configured", reason: availability.reason };

  const authToken = token();
  if (!authToken) return { status: "not-configured", reason: "No sentiment credential is configured on the server." };
  const url = availability.endpoint;

  const selected = articles.filter((article) => typeof article.text === "string" && article.text.trim().length > 0).slice(0, MAX_ARTICLES);
  if (selected.length === 0) {
    return { status: "failed", failure: { kind: "not-configured", retryable: false, userMessage: "No article text was available to analyse." } };
  }

  const chunkInputs: ChunkSentiment[] = [];
  const sources: Extract<SentimentAnalysisResult, { status: "ok" }>["sources"] = [];
  let truncated = false;
  let requests = 0;
  let firstFailure: SentimentFailure | null = null;

  for (const article of selected) {
    const chunks = chunkText(`${article.title}. ${article.text}`, { maxTokens: FINBERT_CHUNK_TOKENS, maxChunks: MAX_CHUNKS_PER_ARTICLE });
    if (chunks.truncated) truncated = true;
    let bestLabel: string | null = null;
    let bestConfidence: number | null = null;

    for (const chunk of chunks.chunks) {
      if (requests >= MAX_TOTAL_REQUESTS) break;
      requests += 1;
      const result = await classifyOnce(chunk, authToken, url);
      if (!result.ok) {
        firstFailure = firstFailure ?? result.failure;
        continue;
      }
      if (!result.ok) continue;
      const parsed = result.scores as { ok: true; scores: Array<{ label: "positive" | "neutral" | "negative"; score: number }> };
      chunkInputs.push({ scores: parsed.scores, weight: chunk.length, sourceId: article.id });
      const dominant = dominantSentiment(parsed.scores);
      if (dominant && (bestConfidence === null || dominant.confidence > bestConfidence)) {
        bestLabel = dominant.label;
        bestConfidence = dominant.confidence;
      }
    }

    sources.push({ id: article.id, title: article.title, publisher: article.publisher, url: article.url, publishedAt: article.publishedAt ?? null, label: bestLabel, confidence: bestConfidence });
  }

  if (chunkInputs.length === 0) {
    return { status: "failed", failure: firstFailure ?? classifySentimentFailure({ kind: "malformed" }) };
  }

  const aggregated = aggregateSentiment(chunkInputs);
  return {
    status: "ok",
    modelId: FINBERT_MODEL_ID,
    endpoint: url,
    distribution: aggregated.distribution,
    overall: aggregated.overall,
    articlesAnalyzed: sources.length,
    chunksAnalyzed: aggregated.chunksAnalyzed,
    truncated,
    sources,
    method: aggregated.method,
    limitations: [
      ...aggregated.limitations,
      ...(truncated ? ["Some article content exceeded the model's sequence limit and was split into chunks; the score covers the analysed portions only."] : []),
      "Sentiment is a separate evidence stream from fundamental analysis and is never combined into a buy/sell signal.",
    ],
    retrievedAt: new Date().toISOString(),
  };
}
