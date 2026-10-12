import { ProxyAgent, setGlobalDispatcher } from "undici";
const egressProxy = process.env.https_proxy ?? process.env.HTTPS_PROXY ?? process.env.http_proxy ?? process.env.HTTP_PROXY;
if (egressProxy) setGlobalDispatcher(new ProxyAgent(egressProxy));

import { resolveLocal } from "../lib/open-data/link";

function hasInvalidDate(value: unknown): boolean {
  if (typeof value !== "string") return true;
  return Number.isNaN(new Date(value).getTime());
}

async function main() {
  // ---- events.latest: the fields the Storylines and company-timeline screens read
  const events = (await resolveLocal("events.latest", { limit: 20, lookbackDays: 30 })) as Array<Record<string, unknown>>;
  console.log(`events.latest rows: ${events.length}`);
  if (events.length) {
    const first = events[0];
    console.log("  keys:", Object.keys(first).join(", "));
    console.log("  eventAt:", first.eventAt, "| invalid?", hasInvalidDate(first.eventAt));
    console.log("  confidenceScore:", first.confidenceScore);
    console.log("  sourceKey:", first.sourceKey);
    console.log("  storylineKey:", first.storylineKey);
    const bad = events.filter((e) => hasInvalidDate(e.eventAt)).length;
    const missingConf = events.filter((e) => typeof e.confidenceScore !== "number").length;
    console.log(`  rows with an unusable eventAt: ${bad}/${events.length}`);
    console.log(`  rows missing confidenceScore: ${missingConf}/${events.length}`);
  }

  // ---- news.archive: the snake_case contract in lib/news-archive.ts
  const archive = (await resolveLocal("news.archive", { days: 30, limit: 20, archiveOrder: "Newest first", page: 0 })) as {
    articles?: Array<Record<string, unknown>>;
    total?: number;
    coverage?: string;
  };
  const articles = archive.articles ?? [];
  console.log(`\nnews.archive articles: ${articles.length} (coverage=${archive.coverage}, total=${archive.total})`);
  if (articles.length) {
    const first = articles[0];
    console.log("  keys:", Object.keys(first).join(", "));
    console.log("  published_at:", first.published_at, "| invalid?", hasInvalidDate(first.published_at));
    console.log("  impact_score:", first.impact_score, "| high_impact:", first.high_impact);
    console.log("  key_entities:", JSON.stringify(first.key_entities));
    const badDate = articles.filter((a) => hasInvalidDate(a.published_at)).length;
    const badScore = articles.filter((a) => typeof a.impact_score !== "number").length;
    const camel = articles.filter((a) => "publishedAt" in a || "impactScore" in a).length;
    console.log(`  rows with an unusable published_at: ${badDate}/${articles.length}`);
    console.log(`  rows missing impact_score: ${badScore}/${articles.length}`);
    console.log(`  rows still using camelCase fields: ${camel}/${articles.length}`);
  }
}
main().catch((e) => { console.error("FAILED", e); process.exit(1); });
