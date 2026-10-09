import { describe, expect, it } from "vitest";
import { resolveResearchRuntime } from "../server/research-runtime-policy";
import { researchDeskToCsv, researchDeskToMarkdown, type ResearchDeskResult } from "../server/research-desk";

describe("Research Desk runtime policy", () => {
  it("prefers a verified Android local model in auto mode", () => {
    const decision = resolveResearchRuntime({ preference: "auto", device: { platform: "android", nativeRuntimeAvailable: true, localModelReady: true, activeModelId: "gemma3-1b" } });
    expect(decision.runtime).toBe("local");
    expect(decision.eligible).toBe(true);
  });

  it("falls back truthfully when local hardware is not verified", () => {
    const decision = resolveResearchRuntime({ preference: "local", device: { platform: "web", nativeRuntimeAvailable: false, localModelReady: false } });
    expect(decision.runtime).toBe("deterministic");
    expect(decision.eligible).toBe(false);
    expect(decision.reasons.length).toBeGreaterThan(0);
  });

  it("routes Auto to Connected/hosted mode when the native bridge is unavailable", () => {
    const decision = resolveResearchRuntime({ preference: "auto", hostedAvailable: true, device: { platform: "android", nativeRuntimeAvailable: false, localModelReady: false } });
    expect(decision.runtime).toBe("hosted");
    expect(decision.eligible).toBe(true);
    expect(decision.reasons[0]).toContain("hosted runtime");
  });

  it("supports explicit Connected/hosted mode without a native bridge", () => {
    const decision = resolveResearchRuntime({ preference: "hosted", hostedAvailable: true, device: { platform: "android", nativeRuntimeAvailable: false } });
    expect(decision.runtime).toBe("hosted");
    expect(decision.modelId).toBeNull();
  });
});

describe("Research Desk exports", () => {
  const result: ResearchDeskResult = { runId: "run-1", marketId: "IN", marketLabel: "India", symbol: "RELIANCE", status: "completed", runtime: "deterministic", startedAt: "2026-08-19T00:00:00.000Z", completedAt: "2026-08-19T00:01:00.000Z", agents: [{ agentType: "news", runtime: "deterministic", status: "completed", confidence: "medium", startedAt: "2026-08-19T00:00:00.000Z", completedAt: "2026-08-19T00:00:01.000Z", claims: [{ text: "Evidence-backed claim", evidenceIds: ["e1"], confidence: "medium" }], limitations: [], evidenceIds: ["e1"] }], evidence: [{ id: "e1", kind: "news", label: "Official release", source: "https://example.com", freshness: "fresh", observedAt: "2026-08-19T00:00:00.000Z", payload: {} }], contradictions: [], answer: "Desk synthesis", confidence: "medium", limitations: [] };
  it("serializes source coverage into Markdown and CSV", () => {
    expect(researchDeskToMarkdown(result)).toContain("AnalyzerX Research Desk Report");
    expect(researchDeskToMarkdown(result)).toContain("Official release");
    expect(researchDeskToCsv(result)).toContain("news");
    expect(researchDeskToCsv(result)).toContain("run-1");
  });
});
