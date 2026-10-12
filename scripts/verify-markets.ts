import { ProxyAgent, setGlobalDispatcher } from "undici";
const px = process.env.https_proxy ?? process.env.HTTPS_PROXY ?? process.env.http_proxy ?? process.env.HTTP_PROXY;
if (px) setGlobalDispatcher(new ProxyAgent(px));

import { sourcesForMarket, MARKET_SOURCES } from "../lib/filing-intelligence/markets/registry";
import { buildAllMarketCoverage, buildMarketCoverage, assertMarketIsolation } from "../lib/filing-intelligence/markets/matrix";
import { refreshFilings } from "../lib/filing-intelligence/connectors/refresh";
import { CONNECTORS } from "../lib/filing-intelligence/connectors/registry";
import { parseIndianNumber, formatIndianNumber, parseIndianPeriod, resolveIndianIdentifiers } from "../lib/filing-intelligence/markets/india";

async function main() {
  console.log("=== market isolation ===\n");

  console.log("registered sources per market:");
  for (const coverage of buildAllMarketCoverage()) {
    const statuses = coverage.summary.byStatus.map((entry) => `${entry.label}:${entry.count}`).join(" ");
    console.log(
      `  ${coverage.marketId} ${coverage.country.padEnd(16)} sources=${String(coverage.summary.sources).padStart(2)} categories=${coverage.summary.categoriesCovered}/${coverage.summary.categoriesTotal} (${coverage.summary.coveragePercent}%)  ${statuses}`,
    );
  }

  console.log("\nconnector bindings:");
  for (const connector of CONNECTORS) {
    console.log(`  ${connector.terms.marketId}  ${connector.terms.sourceId}`);
  }

  console.log("\nisolation guard:");
  const mixed = [...sourcesForMarket("IN"), ...sourcesForMarket("US")];
  console.log("  mixed IN+US against IN:", JSON.stringify(assertMarketIsolation(mixed, "IN")));
  console.log("  IN only against IN    :", JSON.stringify(assertMarketIsolation(sourcesForMarket("IN"), "IN")));

  console.log("\n=== a refresh for each market reads only that market ===\n");
  for (const marketId of ["IN", "US", "GB", "JP"] as const) {
    const result = await refreshFilings({ cache: [], mode: "user_initiated", marketId, query: { limit: 3 } });
    const markets = [...new Set(result.outcomes.map((outcome) => outcome.marketId))];
    const statuses = result.outcomes.map((outcome) => `${outcome.sourceId}[${outcome.status}]`).join(", ") || "(no sources)";
    console.log(`  ${marketId}: outcomes from markets [${markets.join(",") || "none"}] :: ${statuses}`);
  }

  console.log("\n=== India: coverage detail ===");
  const india = buildMarketCoverage("IN");
  console.log("  " + india.summary.statement);
  for (const category of india.categories) {
    console.log(`  ${category.covered ? "covered    " : "not covered"} ${category.label}${category.nextStep ? ` -> ${category.nextStep.slice(0, 70)}` : ""}`);
  }

  console.log("\n=== a market with no connected source says so ===");
  const uk = buildMarketCoverage("GB");
  console.log("  " + uk.summary.statement);
  console.log("  blocked sources:", uk.sources.filter((entry) => entry.status === "blocked").map((entry) => entry.sourceId).join(", ") || "none");

  console.log("\n=== Indian identifiers and number conventions ===");
  console.log("  1,20,000 ->", parseIndianNumber("1,20,000"));
  console.log("  10000000 ->", formatIndianNumber(10000000));
  console.log("  'Q2 FY27' ->", JSON.stringify(parseIndianPeriod("Q2 FY27")));
  console.log(
    "  resolve ->",
    JSON.stringify(resolveIndianIdentifiers({ nseSymbol: "reliance", bseScripCode: "500325", isin: "INE002A01018", cin: "L17110MH1973PLC019786" })),
  );

  console.log(`\ntotal registered sources: ${MARKET_SOURCES.length} across ${new Set(MARKET_SOURCES.map((entry) => entry.marketId)).size} markets`);
}

main().catch((error) => {
  console.error("verify failed:", error);
  process.exit(1);
});
