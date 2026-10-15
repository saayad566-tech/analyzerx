#!/usr/bin/env node
/**
 * Backfill marketId for rows that predate market scoping.
 *
 * The migration sets every existing row to 'UNKNOWN', which hides it from every market
 * view. This script then classifies what it safely can, so real history is not lost.
 * Anything it cannot classify STAYS UNKNOWN and remains hidden — it is never assumed
 * to be India.
 *
 * Classification rules, in order:
 *   1. source key prefix (sec-* is US; nse/bse/sebi/nsdl/amfi/company-ir are IN)
 *   2. symbol suffix (.L GB, .TO/.V CA, .AX AU, .T JP, .HK HK, .SI SG, .DE DE, .PA FR)
 *   3. NOTHING ELSE. A bare upper-case ticker is deliberately NOT treated as US: the
 *      US and India both use bare tickers, so that rule would misclassify Indian
 *      rows. A row with no market-identifying evidence stays UNKNOWN and hidden.
 *   4. user-owned rows are IN, because India was the only selectable market when they
 *      were created, so a returning user keeps their list.
 *
 * Usage:
 *   node scripts/backfill-market-scope.mjs            # dry run, prints counts
 *   node scripts/backfill-market-scope.mjs --apply    # writes the changes
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const APPLY = process.argv.includes("--apply");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Set it to the MySQL connection string and re-run.");
  process.exit(2);
}

/** [table, column, predicate, market] — applied in order; each only touches UNKNOWN. */
const RULES = [
  ["source_records", "sourceKey", "LIKE 'sec-%'", "US"],
  ["source_records", "sourceKey", "LIKE 'nse%' OR `sourceKey` LIKE 'bse%' OR `sourceKey` LIKE 'sebi%' OR `sourceKey` LIKE 'nsdl%' OR `sourceKey` LIKE 'amfi%' OR `sourceKey` LIKE 'company-ir%'", "IN"],
  ["source_records", "symbol", "LIKE '%.L'", "GB"],
  ["source_records", "symbol", "LIKE '%.TO' OR `symbol` LIKE '%.V'", "CA"],
  ["source_records", "symbol", "LIKE '%.AX'", "AU"],
  ["source_records", "symbol", "LIKE '%.T'", "JP"],
  ["source_records", "symbol", "LIKE '%.HK'", "HK"],
  ["source_records", "symbol", "LIKE '%.SI'", "SG"],
  ["source_records", "symbol", "LIKE '%.DE'", "DE"],
  ["source_records", "symbol", "LIKE '%.PA'", "FR"],
  ["event_projections", "symbol", "LIKE '%.L'", "GB"],
  ["event_projections", "symbol", "LIKE '%.T'", "JP"],
  ["event_projections", "symbol", "LIKE '%.HK'", "HK"],
  ["event_projections", "symbol", "LIKE '%.SI'", "SG"],
  ["event_projections", "symbol", "LIKE '%.AX'", "AU"],
  ["event_projections", "symbol", "LIKE '%.TO'", "CA"],
  ["event_projections", "symbol", "LIKE '%.DE'", "DE"],
  ["event_projections", "symbol", "LIKE '%.PA'", "FR"],
  // user-owned rows predate market selection, so they belong to India
  ["user_watchlist_items", "userId", "IS NOT NULL", "IN"],
  ["user_saved_screens", "userId", "IS NOT NULL", "IN"],
  ["user_alert_rules", "userId", "IS NOT NULL", "IN"],
  ["user_saved_research", "userId", "IS NOT NULL", "IN"],
];

const TABLES = [...new Set(RULES.map((r) => r[0]))];

async function main() {
  const mysql = require("mysql2/promise");
  const connection = await mysql.createConnection(url);
  console.log(`backfill-market-scope: ${APPLY ? "APPLY" : "DRY RUN"}`);

  let classified = 0;
  for (const [table, column, predicate, market] of RULES) {
    const where = `\`marketId\` = 'UNKNOWN' AND \`${column}\` ${predicate}`;
    const [rows] = await connection.query(`SELECT COUNT(*) AS n FROM \`${table}\` WHERE ${where}`);
    const n = Number(rows[0].n);
    if (!n) continue;
    if (APPLY) await connection.query(`UPDATE \`${table}\` SET \`marketId\` = ? WHERE ${where}`, [market]);
    classified += n;
    console.log(`  ${table}: ${n} row(s) -> ${market}`);
  }

  console.log("\nrows still UNKNOWN (hidden from every market view):");
  let unknown = 0;
  for (const table of TABLES) {
    const [rows] = await connection.query(`SELECT COUNT(*) AS n FROM \`${table}\` WHERE \`marketId\` = 'UNKNOWN'`);
    const n = Number(rows[0].n);
    unknown += n;
    if (n) console.log(`  ${table}: ${n}`);
  }
  console.log(`\nclassified: ${classified} | still UNKNOWN: ${unknown}`);
  if (!APPLY) console.log("Re-run with --apply to write these changes.");
  await connection.end();
}

main().catch((error) => {
  console.error("backfill failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
