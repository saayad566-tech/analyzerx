export const combinedScoreWeights = {
  fundamentals: {
    financialHealth: 10,
    profitability: 10,
    growthCatalysts: 10,
    cashFlowQuality: 10,
    valuation: 10,
  },
  derivatives: {
    oiStructure: 10,
    sentimentAndMaxPain: 10,
    greeksAndIv: 10,
    writerPositioning: 10,
    expectedRange: 10,
  },
} as const;

export function totalCombinedScoreWeight() {
  return Object.values(combinedScoreWeights.fundamentals).reduce((sum, value) => sum + value, 0)
    + Object.values(combinedScoreWeights.derivatives).reduce((sum, value) => sum + value, 0);
}
