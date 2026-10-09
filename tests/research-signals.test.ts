import { describe, expect, it } from "vitest";

import { scoreMultibaggerStrategy } from "../server/research-signals";

describe("Multibagger strategy scoring", () => {
  const qualityHeavy = { quality: 90, cashFlow: 85, growth: 45, valuation: 40, momentum: 35, catalysts: 30, coverage: 80 };
  const growthHeavy = { quality: 45, cashFlow: 40, growth: 90, valuation: 80, momentum: 75, catalysts: 85, coverage: 70 };

  it("weights the same candidate differently for named strategies", () => {
    const buffett = scoreMultibaggerStrategy("buffett-munger", qualityHeavy);
    const lynch = scoreMultibaggerStrategy("peter-lynch", qualityHeavy);
    expect(buffett.score).toBeGreaterThan(lynch.score);
    expect(buffett.matchedCriteria).toContain("quality");
    expect(buffett.failedCriteria).toContain("growth");
  });

  it("promotes growth and catalyst evidence for GARP/CANSLIM lenses", () => {
    const lynch = scoreMultibaggerStrategy("peter-lynch", growthHeavy);
    const canslim = scoreMultibaggerStrategy("canslim", growthHeavy);
    expect(lynch.score).toBeGreaterThanOrEqual(70);
    expect(canslim.score).toBeGreaterThanOrEqual(70);
    expect(lynch.matchedCriteria).toEqual(expect.arrayContaining(["growth", "valuation", "catalysts"]));
    expect(canslim.matchedCriteria).toEqual(expect.arrayContaining(["growth", "momentum", "catalysts"]));
  });
});
