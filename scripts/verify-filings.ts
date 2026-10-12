import { ProxyAgent, setGlobalDispatcher } from "undici";
const px = process.env.https_proxy ?? process.env.HTTPS_PROXY ?? process.env.http_proxy ?? process.env.HTTP_PROXY;
if (px) setGlobalDispatcher(new ProxyAgent(px));

import { refreshFilings } from "../lib/filing-intelligence/connectors/refresh";
import { cacheSummary } from "../lib/filing-intelligence/connectors/cache";
import { searchIndianCompanies, COMPANY_UNIVERSE_SIZE } from "../lib/filing-intelligence/company-search";

async function main() {
  console.log("universe size:", COMPANY_UNIVERSE_SIZE);
  const hits = searchIndianCompanies("tata", 5);
  console.log("search 'tata':", hits.map((h) => `${h.symbol} (${h.matchKind})`).join(", "));

  // 1. A user-initiated refresh: NSE should be allowed and return real items.
  const userRun = await refreshFilings({ cache: [], mode: "user_initiated", query: { limit: 15 } });
  console.log("\n=== user_initiated ===");
  console.log("message:", userRun.message);
  for (const o of userRun.outcomes) {
    console.log(` - ${o.sourceId} [${o.status}] allowed=${o.allowed} added=${o.added} :: ${o.message.slice(0, 90)}`);
  }

  // 2. An automatic background run: NSE must come back blocked by its terms.
  const autoRun = await refreshFilings({ cache: userRun.cache, mode: "automatic" });
  console.log("\n=== automatic ===");
  console.log("message:", autoRun.message);
  for (const o of autoRun.outcomes) {
    console.log(` - ${o.sourceId} [${o.status}] allowed=${o.allowed} :: ${o.message.slice(0, 80)}`);
  }

  // 3. Idempotency: a repeat fetch must add nothing.
  const repeat = await refreshFilings({ cache: userRun.cache, mode: "user_initiated", query: { limit: 15 } });
  console.log("\nrepeat refresh added:", repeat.totalAdded, "| cache:", cacheSummary(repeat.cache));

  // 4. Show a couple of real cached filings.
  console.log("\nsample cached filings:");
  for (const f of repeat.cache.slice(0, 3)) {
    console.log(` - ${f.companyName} | ${f.publishedAt ?? "no date"} | ext=${f.externalId ?? "none"} | ${f.url.slice(0, 70)}`);
  }
}

main().catch((error) => {
  console.error("verify failed:", error);
  process.exit(1);
});
