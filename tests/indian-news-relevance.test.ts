import { describe, expect, it } from "vitest";
import { classifyIndianNewsRelevance, globalIndiaNewsQuery } from "../server/indian-news-relevance";

describe("Indian equity news relevance", () => {
  it("includes a global oil headline with an India anchor as market context", () => {
    const result = classifyIndianNewsRelevance({
      headline: "Brent crude rises as OPEC signals tighter supply; India markets watch imports",
      symbols: ["RELIANCE", "TATAMOTORS"],
    });
    expect(result.include).toBe(true);
    expect(result.classification).toBe("MARKET_MACRO");
    expect(result.matchedThemes).toContain("Oil and energy");
  });

  it("includes a direct Indian company article with a strong issuer phrase", () => {
    const result = classifyIndianNewsRelevance({
      headline: "Infosys wins a large cloud transformation contract",
      symbols: ["INFY"],
    });
    expect(result.include).toBe(true);
    expect(result.matchedSymbols).toEqual(["INFY"]);
    expect(result.classification).toBe("DIRECT_COMPANY");
    expect(result.confidence).toBe("high");
  });

  it("rejects ordinary-language reliance mentions", () => {
    const result = classifyIndianNewsRelevance({
      headline: "Reliance on demand and consumer confidence remains uncertain",
      symbols: ["RELIANCE"],
    });
    expect(result.include).toBe(false);
    expect(result.classification).toBe("AMBIGUOUS");
    expect(result.matchedSymbols).toEqual([]);
    expect(result.reasons.join(" ")).toContain("Ambiguous common-name mention rejected");
  });

  it("accepts Reliance Industries when the issuer is explicit", () => {
    const result = classifyIndianNewsRelevance({
      headline: "Reliance Industries announces a new green-energy investment",
      symbols: ["RELIANCE"],
    });
    expect(result.include).toBe(true);
    expect(result.classification).toBe("DIRECT_COMPANY");
    expect(result.matchedSymbols).toEqual(["RELIANCE"]);
  });

  it("accepts an exchange-qualified ticker even without the company name", () => {
    const result = classifyIndianNewsRelevance({
      headline: "RELIANCE.NS rises after quarterly results",
      symbols: ["RELIANCE"],
    });
    expect(result.include).toBe(true);
    expect(result.confidence).toBe("high");
  });

  it("requires corroboration for weak Tata and Adani aliases", () => {
    const tata = classifyIndianNewsRelevance({ headline: "Tata says the project is delayed", symbols: ["TATAMOTORS"] });
    const adani = classifyIndianNewsRelevance({ headline: "Adani appears in a general infrastructure discussion", symbols: ["ADANIENT"] });
    expect(tata.include).toBe(false);
    expect(adani.include).toBe(false);
  });

  it("accepts a strong company-specific Tata or Adani story", () => {
    const tata = classifyIndianNewsRelevance({ headline: "Tata Motors reports higher EV sales", symbols: ["TATAMOTORS"] });
    const adani = classifyIndianNewsRelevance({ headline: "Adani Enterprises files results with the NSE", symbols: ["ADANIENT"] });
    expect(tata.include).toBe(true);
    expect(adani.include).toBe(true);
  });

  it("rejects unrelated global news", () => {
    const result = classifyIndianNewsRelevance({
      headline: "European bank reports quarterly profit ahead of estimates",
      symbols: ["RELIANCE", "TCS"],
    });
    expect(result.include).toBe(false);
    expect(result.classification).toBe("UNRELATED");
  });

  it("keeps unrelated Apple company news out of Indian market context", () => {
    const result = classifyIndianNewsRelevance({
      headline: "Apple reports record iPhone revenue",
      symbols: ["RELIANCE"],
    });
    expect(result.include).toBe(false);
  });

  it("exposes a constrained global-to-India query contract", () => {
    expect(globalIndiaNewsQuery).toContain("NSE");
    expect(globalIndiaNewsQuery).toContain("crude");
    expect(globalIndiaNewsQuery).toContain("inflation");
  });
});
