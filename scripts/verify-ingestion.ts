import { ProxyAgent, setGlobalDispatcher } from "undici";
const px = process.env.https_proxy ?? process.env.HTTPS_PROXY ?? process.env.http_proxy ?? process.env.HTTP_PROXY;
if (px) setGlobalDispatcher(new ProxyAgent(px));

import { ingestDocument } from "../lib/filing-intelligence/ingestion/pipeline";
import { extractFinancialTable } from "../lib/filing-intelligence/ingestion/table";
import { sha256Bytes } from "../lib/filing-intelligence/ingestion/version";
import { createStore, upsertEntry, storeSummary } from "../lib/filing-intelligence/ingestion/store";

const UA = "AnalyzerX/1.0 (filing-intelligence)";

async function main() {
  console.log("=== acceptance: discover, retrieve, parse, trace ===");

  // 1. Discover a real filing from the live NSE announcements feed.
  const feed = await fetch("https://nsearchives.nseindia.com/content/RSS/Online_announcements.xml", { headers: { "User-Agent": UA } });
  const xml = await feed.text();
  const links = [...xml.matchAll(/<link>(https:\/\/nsearchives\.nseindia\.com\/[^<]+)<\/link>/g)].map((m) => m[1]);
  console.log("discovered links in the feed:", links.length);
  if (!links.length) {
    console.log("No links in the feed; nothing to retrieve.");
    return;
  }

  // 2. Retrieve a genuine document and parse it.
  let parsed = 0;
  let store = createStore({ parserVersion: "2.0.0" });
  for (const link of links.slice(0, 6)) {
    let response;
    try {
      response = await fetch(link, { headers: { "User-Agent": UA } });
    } catch (error) {
      console.log(` - ${link.slice(0, 70)}: request failed (${(error as Error).message})`);
      continue;
    }
    if (!response.ok) {
      console.log(` - ${link.slice(0, 70)}: HTTP ${response.status}`);
      continue;
    }
    const buffer = new Uint8Array(await response.arrayBuffer());
    const result = ingestDocument(link, buffer, {
      contentType: response.headers.get("content-type"),
      requestedUrl: link,
      finalUrl: response.url || link,
      retrievedUtc: new Date().toISOString(),
      context: "NSE corporate announcement",
    });
    parsed += 1;
    console.log(`\n - ${link.split("/").pop()?.slice(0, 46)}`);
    console.log(`     format=${result.envelope.format} bytes=${result.envelope.byteLength} quality=${result.extraction.quality}`);
    console.log(`     sections=${result.extraction.sections.length} tables=${result.tables.length} warnings=[${result.extraction.warnings.join(",")}]`);
    console.log(`     provenance: ${result.provenance}`);
    if (result.extraction.sections[0]) {
      console.log(`     first text: ${result.extraction.sections[0].text.slice(0, 130)}`);
    }
    // Record it in the store, exactly as the pipeline would.
    store = upsertEntry(store, {
      filingKey: link,
      status: "extracted",
      sha256: result.envelope.sha256,
      byteLength: result.envelope.byteLength,
      format: result.envelope.format,
      parserVersion: result.extraction.parserVersion,
      storedUtc: new Date().toISOString(),
      lastAccessUtc: new Date().toISOString(),
      retained: false,
      error: null,
      attempts: 1,
    }).store;
  }

  console.log(`\nparsed ${parsed} real document(s)`);
  console.log("store:", JSON.stringify(storeSummary(store)));

  // 3. Demonstrate the table extractor on a synthetic statement.
  const table = extractFinancialTable(
    [["", "FY27", "FY26"], ["Revenue from operations", "1,20,000", "1,00,000"], ["Finance cost", "(3,400)", ""]],
    { locator: "table:1", context: "Consolidated audited results for the year ended March 31, 2027 (₹ in lakhs)" },
  );
  console.log("\n=== table extraction demo ===");
  console.log(`currency=${table.currency} scale=${table.scale} basis=${table.basis} audit=${table.auditStatus} period=${table.period}`);
  for (const cell of table.cells) {
    console.log(` - ${cell.rowLabel} [${cell.columnLabel}] raw="${cell.raw}" value=${cell.value} paren=${cell.parenthesised} missing=${cell.missing}`);
  }
  console.log("sha256 sanity:", sha256Bytes(new Uint8Array([0x61, 0x62, 0x63])).slice(0, 16), "(expected ba7816bf8f01cfea)");
}

main().catch((error) => {
  console.error("verify failed:", error);
  process.exit(1);
});
