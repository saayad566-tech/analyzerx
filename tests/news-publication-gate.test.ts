import { describe, expect, it } from "vitest";
import { classifyNewsPublication } from "../server/indian-news-relevance";

describe("news publication adjudicator", () => {
  it("holds a natural-language Reliance mention without issuer evidence", () => {
    const result = classifyNewsPublication({ marketId: "IN", symbol: "RELIANCE", headline: "Reliance on community support grows after the storm", summary: "A local response effort is expanding.", source: "General news" });
    expect(result.published).toBe(false);
    expect(result.holdReason).toBe("ambiguous_entity");
  });

  it("publishes a direct Reliance Industries story", () => {
    const result = classifyNewsPublication({ marketId: "IN", symbol: "RELIANCE", headline: "Reliance Industries announces a new renewable investment", summary: "The company disclosed the plan in an investor update.", source: "Issuer investor relations" });
    expect(result.published).toBe(true);
    expect(result.matchedSymbols).toContain("RELIANCE");
  });

  it("holds Tata and Adani common-word mentions until corroborated", () => {
    expect(classifyNewsPublication({ marketId: "IN", symbol: "TATAMOTORS", headline: "Tata says the project is delayed", source: "General news" }).published).toBe(false);
    expect(classifyNewsPublication({ marketId: "IN", symbol: "ADANIENT", headline: "Adani appears in a general infrastructure discussion", source: "General news" }).published).toBe(false);
  });

  it("does not publish Apple into India without Indian issuer evidence", () => {
    const result = classifyNewsPublication({ marketId: "IN", symbol: "AAPL", headline: "Apple unveils a new consumer device", summary: "The global technology company announced a product.", source: "Technology news" });
    expect(result.published).toBe(false);
    expect(result.holdReason).toBe("missing_issuer_evidence");
  });

  it("allows an India-anchored macro story while keeping it distinct from company news", () => {
    const result = classifyNewsPublication({ marketId: "IN", symbol: "MARKET", headline: "RBI keeps rates steady as inflation moderates in India", summary: "Markets assess the policy decision.", source: "Market context" });
    expect(result.published).toBe(true);
    expect(result.classification).toBe("MARKET_MACRO");
  });

  it("requires security evidence for a non-Indian market", () => {
    const result = classifyNewsPublication({ marketId: "US", symbol: "AAPL", headline: "Apple hosts a community event", source: "General news" });
    expect(result.published).toBe(false);
    expect(result.holdReason).toBe("missing_issuer_evidence");
  });
});
