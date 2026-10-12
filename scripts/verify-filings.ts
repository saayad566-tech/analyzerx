import { ProxyAgent, setGlobalDispatcher } from "undici";
const px = process.env.https_proxy ?? process.env.HTTPS_PROXY ?? process.env.http_proxy ?? process.env.HTTP_PROXY;
if (px) setGlobalDispatcher(new ProxyAgent(px));

import { refreshFilings } from "../lib/filing-intelligence/connectors/refresh";
import { cacheSummary } from "../lib/filing-intelligence/connectors/cache";
import { searchIndianCompanies, COMPANY_UNIVERSE_SIZE } from "../lib/filing-intelligence/company-search";

async function main() {
  console.log("universe size:", COMPANY_UNIVERSE_SIZE);
  const hits = searchIndianCompanies("reliance", 3);
  console.log("search 'reliance':", hits.map((h) => `${h.symbol} (${h.matchKind})`).join(", "));

  console.log("\n=== user_initiated refresh across all four sources ===");
  const run = await refreshFilings({ cache: [], mode: "user_initiated", query: { limit: 12 } });
  console.log("summary:", run.message);
  for (const o of run.outcomes) {
    console.log(` - ${o.sourceId} [${o.status}] basis=${o.accessBasis} added=${o.added} verified=${o.verifiedEndToEnd}`);
    console.log(`     ${o.message}`);
  }

  console.log("\n=== automatic (background) run ===");
  const auto = await refreshFilings({ cache: run.cache, mode: "automatic" });
  console.log("summary:", auto.message);
  for (const o of auto.outcomes) console.log(` - ${o.sourceId} [${o.status}] allowed=${o.allowed}`);

  console.log("\n=== idempotency ===");
  const repeat = await refreshFilings({ cache: run.cache, mode: "user_initiated", query: { limit: 12 } });
  console.log("repeat added:", repeat.totalAdded, "| cache:", cacheSummary(repeat.cache));

  console.log("\n=== real cached filings by source ===");
  const bySource = new Map<string, number>();
  for (const f of repeat.cache) bySource.set(f.sourceId, (bySource.get(f.sourceId) ?? 0) + 1);
  for (const [source, count] of bySource) console.log(` - ${source}: ${count}`);
  for (const f of repeat.cache.slice(0, 4)) {
    console.log(`   * ${f.companyName} | ${f.publishedAt ?? "no date"} | ${f.sourceId} | ${f.url.slice(0, 62)}`);
  }
}

main().catch((error) => {
  console.error("verify failed:", error);
  process.exit(1);
});
