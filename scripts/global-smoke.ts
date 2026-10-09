import { analyzeFundamentals } from "../server/fundamental-analysis";

async function main() {
  const symbols = ["AAPL", "SAP.DE", "7203.T"];
  const results = await Promise.all(symbols.map(async (symbol) => {
    const report = await analyzeFundamentals(symbol);
    return {
      requested: symbol,
      resolved: report.resolvedSymbol,
      company: report.companyName,
      score: report.score,
      exchange: report.market.exchange,
      country: report.market.country,
      currency: report.market.currency,
      usedSources: report.sources.filter((source) => source.status === "used").map((source) => source.name),
      warningCount: report.warnings.length,
    };
  }));
  console.log(JSON.stringify(results, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
