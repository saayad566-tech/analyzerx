import { ProxyAgent, setGlobalDispatcher } from "undici";
const px = process.env.https_proxy ?? process.env.HTTPS_PROXY ?? process.env.http_proxy ?? process.env.HTTP_PROXY;
if (px) setGlobalDispatcher(new ProxyAgent(px));

import { resolveLocal } from "../lib/open-data/link";
import { scanDeepResearchDetailed, summariseSignals } from "../lib/deep-research";

async function main() {
  const arch = (await resolveLocal("news.archive", {
    days: 30,
    limit: 200,
    archiveOrder: "Newest first",
    page: 0,
  })) as { articles?: Array<Record<string, unknown>> };

  const articles = arch.articles ?? [];
  console.log("articles scanned:", articles.length);

  const result = scanDeepResearchDetailed(
    articles.map((a) => ({
      id: String(a.id ?? ""),
      symbol: String(a.symbol ?? ""),
      headline: String(a.headline ?? ""),
      summary: String(a.summary ?? ""),
      source: String(a.source ?? ""),
      url: String(a.url ?? ""),
      published_at: String(a.published_at ?? ""),
      impact_score: typeof a.impact_score === "number" ? a.impact_score : 0,
    })),
    { limit: 10, windowDays: 30 },
  );
  const signals = result.signals;

  console.log("window:", `${result.windowDays} days from ${result.windowStart}`);
  console.log("excluded out-of-window:", result.excludedOutOfWindow);
  console.log("signals found:", signals.length);
  console.log("by category:", JSON.stringify(summariseSignals(signals)));
  for (const s of signals.slice(0, 6)) {
    const t = s.temporal;
    console.log(
      ` - ${s.category} | ${s.symbol} | announced ${t.eventDateLabel ?? t.eventDate} (${t.eventDateBasis}) | doc ${t.documentDate} | impact ${t.executionTimeline ?? "not stated"}`,
    );
    console.log(`     matched "${s.matchedPhrase}" | ${s.headline.slice(0, 66)}`);
  }
}
main().catch((e) => {
  console.error("FAILED", String(e).slice(0, 300));
  process.exit(1);
});
