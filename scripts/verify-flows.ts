import { ProxyAgent, setGlobalDispatcher } from "undici";
const egressProxy = process.env.https_proxy ?? process.env.HTTPS_PROXY ?? process.env.http_proxy ?? process.env.HTTP_PROXY;
if (egressProxy) setGlobalDispatcher(new ProxyAgent(egressProxy));

import { institutionalFlows } from "../lib/open-data/engine";

const RANGES = ["TODAY", "THREE_DAYS", "ONE_WEEK", "ONE_MONTH", "QTD"];

async function main() {
  for (const range of RANGES) {
    const flows = await institutionalFlows(range);
    const fii = flows.rows.find((r) => r.participant === "FII/FPI");
    const dii = flows.rows.find((r) => r.participant === "DII");
    const cmp = flows.comparison;
    console.log(`\n=== ${range} ===`);
    console.log(`status=${flows.status} | label="${flows.rangeLabel}"`);
    console.log(`history sessions: ${flows.history.length} (newest ${flows.history[0]?.reportDate ?? "n/a"})`);
    console.log(`rows: FII/FPI net=${fii?.net ?? "null"} buy=${fii?.buy ?? "null"} sell=${fii?.sell ?? "null"}`);
    console.log(`rows: DII     net=${dii?.net ?? "null"} buy=${dii?.buy ?? "null"} sell=${dii?.sell ?? "null"}`);
    for (const c of cmp) {
      console.log(`compare ${c.participant}: current=${c.currentNet} previous=${c.previousNet} change=${c.changePct}%`);
    }
  }
}
main().catch((e) => { console.error("FAILED", e); process.exit(1); });
