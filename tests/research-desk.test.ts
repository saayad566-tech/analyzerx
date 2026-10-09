import { describe, expect, it, vi } from "vitest";

import { RESEARCH_AGENT_TYPES, runResearchDesk } from "../server/research-desk";

vi.mock("../server/fundamental-analysis", () => ({
  analyzeFundamentals: vi.fn(async (symbol: string) => ({
    requestedSymbol: symbol,
    resolvedSymbol: symbol,
    companyName: "Test Company",
    asOf: "2026-08-18T00:00:00.000Z",
    score: 78,
    verdict: "Research-positive with coverage limits",
    institutionalReport: { confidenceScore: 82 },
    sources: [{ name: "Official test filing", note: "Deterministic fixture" }],
    risks: ["Test concentration risk"],
    warnings: [],
    metrics: {},
    quantitativeMetrics: {},
  })),
}));

vi.mock("../server/news-tracker", () => ({
  fetchStockNewsNow: vi.fn(async (symbol: string) => ({
    symbol,
    fetchedAt: "2026-08-19T00:00:00.000Z",
    stale: false,
    freshArticleCount: 1,
    providerFailures: 0,
    articles: [{ symbol, headline: "Verified test headline", summary: "Test summary", sentiment: "Positive", impact_score: 81, source: "Test News", url: "https://example.com/test", published_at: "2026-08-19T00:00:00.000Z" }],
  })),
  getLatestTrackedNews: vi.fn(async () => []),
}));

vi.mock("../server/nse-flows", () => ({
  fetchNseInstitutionalFlows: vi.fn(async () => null),
}));

vi.mock("../server/db", () => ({
  getSourceRecordsForSymbol: vi.fn(async () => []),
  addResearchAgentRun: vi.fn(async () => undefined),
  createResearchRun: vi.fn(async () => undefined),
  getResearchRun: vi.fn(async () => null),
  listResearchAgentRuns: vi.fn(async () => []),
  updateResearchRun: vi.fn(async () => undefined),
}));

vi.mock("../server/research-signals", () => ({
  getMultiAssetTimingSignals: vi.fn(async () => ({
    generatedAt: "2026-08-19T00:00:00.000Z",
    signals: [{ name: "Test benchmark", type: "technical", action: "NO_CONFIRMED_SIGNAL", score: 50, changePct: 0.2, source: "Test signal", freshness: "2026-08-19T00:00:00.000Z" }],
    unavailable: [],
  })),
}));

describe("research desk orchestration", () => {
  it("runs bounded specialist lanes with selected market and evidence references", async () => {
    const result = await runResearchDesk({ message: "Run a deep desk review", symbol: "TEST", marketId: "IN", depth: "deep" });
    expect(result.marketId).toBe("IN");
    expect(result.symbol).toBe("TEST");
    expect(result.agents.map((agent) => agent.agentType)).toEqual(expect.arrayContaining(["news", "sentiment", "technicals", "fundamentals", "filings", "flows", "macro", "risk"]));
    expect(result.evidence.length).toBeGreaterThan(1);
    expect(result.agents.find((agent) => agent.agentType === "fundamentals")?.claims[0]?.evidenceIds.length).toBeGreaterThan(0);
    expect(result.answer).toContain("source-grounded research context");
  }, 15_000);

  it("keeps unavailable filing and flow lanes explicit instead of fabricating coverage", async () => {
    const result = await runResearchDesk({ message: "Review market risks", marketId: "US", includeAgents: ["filings", "flows"] });
    expect(result.agents.find((agent) => agent.agentType === "filings")?.status).toBe("unavailable");
    expect(result.agents.find((agent) => agent.agentType === "flows")?.status).toBe("unavailable");
    expect(result.limitations.join(" ")).toContain("No filing evidence");
  });

  it("keeps the agent roster bounded and stable", () => {
    expect(RESEARCH_AGENT_TYPES).toEqual(["news", "sentiment", "technicals", "fundamentals", "filings", "flows", "macro", "risk", "synthesis"]);
  });
});
