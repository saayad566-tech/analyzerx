import { describe, expect, it } from "vitest";
import { getResearchEvidenceNavigation } from "../lib/research-evidence-navigation";

describe("Research evidence navigation", () => {
  it("routes filing evidence to the symbol filing screen", () => {
    expect(getResearchEvidenceNavigation({ kind: "filing", label: "10-K", payload: { symbol: "AAPL", accession: "abc" } })).toMatchObject({ type: "route", label: "Open filing details" });
  });
  it("routes flow evidence to Market Flows", () => {
    expect(getResearchEvidenceNavigation({ kind: "flow", label: "FII net", payload: { participant: "FII" } })).toMatchObject({ type: "route", label: "Open Market Flows" });
  });
  it("opens only validated HTTP(S) news sources", () => {
    expect(getResearchEvidenceNavigation({ kind: "news", label: "Headline", url: "https://example.com/news" })).toMatchObject({ type: "external", url: "https://example.com/news" });
    expect(getResearchEvidenceNavigation({ kind: "news", label: "Headline", url: "javascript:alert(1)" }).type).toBe("unavailable");
  });
  it("keeps missing identifiers explicitly unavailable", () => {
    expect(getResearchEvidenceNavigation({ kind: "filing", label: "Filing", payload: {} }).type).toBe("unavailable");
  });
});
