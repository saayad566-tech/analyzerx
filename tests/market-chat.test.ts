import { afterEach, describe, expect, it, vi } from "vitest";

const { invokeLLM } = vi.hoisted(() => ({ invokeLLM: vi.fn() }));
vi.mock("../server/_core/llm", () => ({ invokeLLM }));
vi.mock("../server/fundamental-analysis", () => ({
  analyzeFundamentals: vi.fn(async (symbol: string) => ({
    requestedSymbol: symbol,
    resolvedSymbol: symbol,
    companyName: symbol === "TCS" ? "Tata Consultancy Services" : symbol,
    market: { exchange: "NSE", currency: "INR", country: "India", primaryFocus: true },
    score: 76,
    verdict: "Strong research profile",
    institutionalReport: { confidenceScore: 82 },
    metrics: { pe: { value: 24, basis: "reported", source: "Test source" } },
    quantitativeMetrics: [],
    risks: ["Filing evidence requires review"],
    fairValue: { basis: "estimated" },
    stockAnalysis: { conclusion: "Evidence-calibrated context" },
    sources: [{ tier: "primary", name: "Test filing", status: "used", note: "Verified test context" }],
    warnings: [],
    asOf: "2026-08-17T00:00:00.000Z",
  })),
}));
vi.mock("../server/news-tracker", () => ({
  fetchStockNewsNow: vi.fn(async (symbol: string) => ({ symbol, fetchedAt: "2026-08-17T00:00:00.000Z", stale: false, freshArticleCount: 1, providerFailures: 0, articles: [{ headline: "TCS reports update", summary: "Verified context", sentiment: "Positive", impact_score: 72, source: "Test News", url: "https://example.com", published_at: "2026-08-17T00:00:00.000Z" }] })),
  getLatestTrackedNews: vi.fn(async () => []),
}));
vi.mock("../server/research-signals", () => ({
  getMultiAssetTimingSignals: vi.fn(async () => ({ generatedAt: "2026-08-17T00:00:00.000Z", signals: [], unavailable: [] })),
}));

import { answerMarketChat } from "../server/market-chat";

describe("market chatbot", () => {
  afterEach(() => invokeLLM.mockReset());

  it("resolves a company name and returns structured grounded output", async () => {
    invokeLLM.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ answer: "TCS has a 76/100 research score in the supplied context.", confidence: "medium", limitations: ["Verify the latest filing"], suggestedQuestions: ["Show risks"] }) } }] });
    const result = await answerMarketChat("Can you analyze Tata Consultancy Services fundamentals?", "IN");
    expect(result.symbol).toBe("TCS");
    expect(result.engine).toBe("server-grounded");
    expect(result.sources[0]?.label).toBe("Test filing");
  });

  it("returns a deterministic fallback when the model is unavailable", async () => {
    invokeLLM.mockRejectedValue(new Error("LLM unavailable"));
    const result = await answerMarketChat("What are the latest risks for TCS?", "IN");
    expect(result.symbol).toBe("TCS");
    expect(result.engine).toBe("deterministic-fallback");
    expect(result.answer).toContain("Tata Consultancy Services");
    expect(result.limitations.join(" ")).toContain("LLM unavailable");
  });

  it("returns a deterministic fallback when an upstream model payload is malformed", async () => {
    invokeLLM.mockResolvedValue({ choices: [{ message: { content: "Service temporarily unavailable" } }] });
    const result = await answerMarketChat("What are the latest risks for TCS?", "IN");
    expect(result.engine).toBe("deterministic-fallback");
    expect(result.answer).toContain("Tata Consultancy Services");
    expect(result.limitations.join(" ")).toContain("Unexpected token");
  });

  it("returns low-latency deterministic guidance with an allowlisted navigation action", async () => {
    const result = await answerMarketChat("Where do I find Market Flows in AnalyzerX?", "IN");
    expect(result.confidence).toBe("high");
    expect(result.action).toEqual({ type: "navigate", route: "/flows" });
    expect(result.answer).toContain("Today, 3 Days, 1 Week, 1 Month, or QTD");
  });

  it("returns a safe news filter action for a selected symbol", async () => {
    const result = await answerMarketChat("Show positive news for Reliance", "IN");
    expect(result.symbol).toBe("RELIANCE");
    expect(result.action).toEqual({ type: "filter_news", symbol: "RELIANCE", sentiment: "Positive" });
  });

  it("answers educational questions without fabricating a live value", async () => {
    const result = await answerMarketChat("Explain compound interest simply.", "IN");
    expect(result.confidence).toBe("high");
    expect(result.answer).toContain("Compound interest");
    expect(result.limitations.join(" ")).toContain("not live market data");
  });

  it("rejects empty questions before any provider work", async () => {
    await expect(answerMarketChat("  ", "IN")).rejects.toThrow("market question is required");
  });
});
