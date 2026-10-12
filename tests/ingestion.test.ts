import { describe, expect, it } from "vitest";
import { deflate } from "pako";

import {
  applyDiscoveryFilters,
  assessChange,
  assessOcrNeed,
  buildProvenance,
  createStore,
  decodeEntities,
  dedupeFilings,
  deleteEntry,
  detectAmendments,
  detectFormat,
  discover,
  discoverIncremental,
  emptyHistory,
  emptyTimestamps,
  extractCsv,
  extractFinancialTable,
  extractHtml,
  extractJson,
  extractPdf,
  extractText,
  extractXbrl,
  ingestDocument,
  invalidateByParserVersion,
  looksLikeFinancialLabel,
  mergeOcrIntoExtraction,
  needsReprocessing,
  paginate,
  parseBasis,
  parseCurrency,
  parseFigure,
  parseCsv,
  parsePeriod,
  parseScale,
  parseXbrlFacts,
  recordVersion,
  recoverInterrupted,
  reprocessingQueue,
  runOcr,
  sha256Bytes,
  sha256Text,
  stableKeyFor,
  storeSummary,
  stripNonContent,
  upsertEntry,
  valuedCells,
  withPublication,
  type CacheEntry,
  type DiscoveredFiling,
} from "../lib/filing-intelligence";

const bytesOf = (text: string): Uint8Array => {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i) & 0xff;
  return bytes;
};

const NOW = "2026-10-12T12:00:00.000Z";

/** A minimal but structurally valid single-page PDF with a literal text string. */
const MINIMAL_PDF = [
  "%PDF-1.4",
  "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
  "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
  "3 0 obj << /Type /Page /Parent 2 0 R /Contents 4 0 R >> endobj",
  "4 0 obj << /Length 44 >> stream",
  "BT /F1 12 Tf 72 720 Td (Revenue 1,200 crore) Tj ET",
  "endstream endobj",
  "trailer << /Root 1 0 R /Info << /Title (Acme Annual Report) >> >>",
  "%%EOF",
].join("\n");

/** The same content, but with the content stream Flate-compressed. */
function compressedPdf(): Uint8Array {
  const content = "BT /F1 12 Tf 72 720 Td (Operating profit 340 crore) Tj ET";
  const compressed = deflate(bytesOf(content));
  const head = "%PDF-1.4\n1 0 obj << /Type /Page /Contents 2 0 R >> endobj\n2 0 obj << /Filter /FlateDecode /Length " + compressed.length + " >> stream\n";
  const tail = "\nendstream endobj\ntrailer << /Root 1 0 R >>\n%%EOF";
  const headBytes = bytesOf(head);
  const tailBytes = bytesOf(tail);
  const out = new Uint8Array(headBytes.length + compressed.length + tailBytes.length);
  out.set(headBytes, 0);
  out.set(compressed, headBytes.length);
  out.set(tailBytes, headBytes.length + compressed.length);
  return out;
}

describe("integrity: SHA-256 over the raw bytes", () => {
  it("matches the published test vectors", () => {
    expect(sha256Text("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Text("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Text("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  it("hashes bytes, so two different byte sequences differ", () => {
    expect(sha256Bytes(bytesOf("A"))).not.toBe(sha256Bytes(bytesOf("B")));
  });
});

describe("section 2: five distinct timestamps, never substituted", () => {
  it("starts every timestamp explicitly unknown", () => {
    const stamps = emptyTimestamps();
    for (const key of ["publication", "firstSeen", "retrieval", "analysis", "sourceCheck"] as const) {
      expect(stamps[key].known).toBe(false);
    }
  });

  it("never substitutes the current time for a missing publication date", () => {
    const stamps = withPublication(emptyTimestamps(), null);
    expect(stamps.publication.known).toBe(false);
    if (!stamps.publication.known) expect(stamps.publication.reason).toMatch(/did not state/i);
  });

  it("keeps a stated publication date and rejects an unusable one", () => {
    const good = withPublication(emptyTimestamps(), "2026-10-05T00:00:00.000Z");
    expect(good.publication.known).toBe(true);
    if (good.publication.known) expect(good.publication.value).toBe("2026-10-05T00:00:00.000Z");

    const bad = withPublication(emptyTimestamps(), "not a date");
    expect(bad.publication.known).toBe(false);
    if (!bad.publication.known) expect(bad.publication.reason).toMatch(/not a usable date/i);
  });
});

describe("section 3: format detection and validation", () => {
  it("identifies a PDF from its signature", () => {
    expect(detectFormat("application/octet-stream", "%PDF-1.7\n...").format).toBe("pdf");
  });

  it("reports a mismatch between the declaration and the bytes", () => {
    const detection = detectFormat("text/html", "%PDF-1.4");
    expect(detection.mismatch).toBe(true);
    expect(detection.format).toBe("pdf");
    expect(detection.note).toMatch(/declared content type suggested html/i);
  });

  it("recognises inline XBRL, native XBRL, JSON and CSV", () => {
    expect(detectFormat("application/xml", '<html><ix:header></ix:header>').format).toBe("inline_xbrl");
    expect(detectFormat("application/xml", "<xbrl><xbrli:context/></xbrl>").format).toBe("xbrl");
    expect(detectFormat("application/json", '{"a":1}').format).toBe("json");
    expect(detectFormat("text/csv", "a,b\n1,2").format).toBe("csv");
  });

  it("marks an unidentifiable payload unknown rather than guessing", () => {
    expect(detectFormat(null, "\u0000\u0001binary").format).toBe("unknown");
  });
});

describe("section 3: HTML and text extraction", () => {
  it("drops script and style content so it can never be read as text", () => {
    const html = '<html><head><style>p{color:red}</style></head><body><p>Revenue grew.</p><script>steal()</script></body></html>';
    const stripped = stripNonContent(html);
    expect(stripped).not.toContain("steal");
    expect(stripped).not.toContain("color:red");
    const result = extractHtml(html, NOW);
    expect(result.sections.map((s) => s.text).join(" ")).toContain("Revenue grew.");
    expect(result.warnings).toContain("parser_failure");
  });

  it("splits on headings and records a section locator", () => {
    const html = "<h1>Results</h1><p>Revenue was 100.</p><h2>Outlook</h2><p>Demand is strong.</p>";
    const result = extractHtml(html, NOW);
    expect(result.sections.some((s) => s.locator === "section:Results")).toBe(true);
    expect(result.sections.some((s) => s.locator === "section:Outlook")).toBe(true);
  });

  it("degrades safely on malformed markup rather than throwing", () => {
    const result = extractHtml("<p>Unclosed <b>bold <div>text", NOW);
    expect(result.sections.length).toBeGreaterThan(0);
  });

  it("decodes the entities that appear in filings", () => {
    expect(decodeEntities("Rs&nbsp;1,200 &amp; more &#8377;")).toContain("&");
    expect(decodeEntities("&#8377;")).toBe("₹");
  });

  it("flags non-UTF-8 bytes in a plain-text document", () => {
    const result = extractText("Profit \uFFFD crore", NOW);
    expect(result.warnings).toContain("encoding_problem");
    expect(result.quality).toBe("partial");
  });

  it("reports an empty document as unextractable rather than clean", () => {
    expect(extractText("   ", NOW).quality).toBe("unextractable");
  });
});

describe("section 3: JSON, CSV and XBRL", () => {
  it("reports malformed JSON as a parser failure without throwing", () => {
    const result = extractJson("{not json", NOW);
    expect(result.quality).toBe("unextractable");
    expect(result.warnings).toContain("parser_failure");
  });

  it("walks nested JSON into locatable sections", () => {
    const result = extractJson('{"revenue":{"fy27":1200}}', NOW);
    expect(result.sections.some((s) => s.locator === "json:revenue.fy27")).toBe(true);
  });

  it("parses CSV with quoted fields and escaped quotes", () => {
    const rows = parseCsv('a,b\n"1,200","he said ""hi"""');
    expect(rows[1][0]).toBe("1,200");
    expect(rows[1][1]).toBe('he said "hi"');
  });

  it("flags a ragged CSV as an incomplete table", () => {
    const result = extractCsv("a,b,c\n1,2,3\n4,5", NOW);
    expect(result.warnings).toContain("incomplete_table");
    expect(result.quality).toBe("partial");
  });

  it("applies the XBRL scale and sign attributes to the value", () => {
    const xml = '<xbrl><us-gaap:Revenues contextRef="c1" unitRef="INR" decimals="-5" scale="7">1200</us-gaap:Revenues><us-gaap:LossOnDisposal sign="-">340</us-gaap:LossOnDisposal></xbrl>';
    const facts = parseXbrlFacts(xml);
    const revenue = facts.find((f) => f.concept === "us-gaap:Revenues")!;
    expect(revenue.value).toBe(1200 * 10 ** 7);
    expect(revenue.scale).toBe(7);
    const loss = facts.find((f) => f.concept === "us-gaap:LossOnDisposal")!;
    expect(loss.value).toBe(-340);
    expect(loss.raw).toBe("-340");
  });

  it("treats an XBRL nil fact as explicitly absent, not as zero", () => {
    const xml = '<xbrl><us-gaap:Revenues xsi:nil="true" contextRef="c1"></us-gaap:Revenues></xbrl>';
    const facts = parseXbrlFacts(xml);
    expect(facts[0].nil).toBe(true);
    expect(facts[0].value).toBeNull();
  });

  it("reports a document with no XBRL facts as unextractable", () => {
    expect(extractXbrl("<xml><a/></xml>", "xml", NOW).quality).toBe("unextractable");
  });
});

describe("section 3: PDF", () => {
  it("validates, counts pages and reads text from an uncompressed stream", () => {
    const result = extractPdf(bytesOf(MINIMAL_PDF), NOW);
    expect(result.format).toBe("pdf");
    expect(result.sections.map((s) => s.text).join(" ")).toContain("Revenue 1,200 crore");
    expect(result.warnings).not.toContain("parser_failure");
  });

  it("inflates a FlateDecode stream and reads its text", () => {
    const result = extractPdf(compressedPdf(), NOW);
    expect(result.sections.map((s) => s.text).join(" ")).toContain("Operating profit 340 crore");
  });

  it("rejects a malformed PDF that lacks the header", () => {
    const result = extractPdf(bytesOf("this is not a pdf at all"), NOW);
    expect(result.quality).toBe("unextractable");
    expect(result.warnings).toContain("parser_failure");
  });

  it("reports a truncated PDF rather than reading it as complete", () => {
    const result = extractPdf(bytesOf(MINIMAL_PDF.replace("%%EOF", "")), NOW);
    expect(result.warnings).toContain("truncated");
  });

  it("marks an encrypted PDF unextractable and says why", () => {
    const encrypted = MINIMAL_PDF.replace("trailer <<", "trailer << /Encrypt 9 0 R");
    const result = extractPdf(bytesOf(encrypted), NOW);
    expect(result.quality).toBe("unextractable");
    expect(result.note).toMatch(/encrypted/i);
  });

  it("flags a page-bearing PDF with no text as needing OCR", () => {
    const scan = "%PDF-1.4\n1 0 obj << /Type /Page >> endobj\ntrailer << >>\n%%EOF";
    const result = extractPdf(bytesOf(scan), NOW);
    expect(result.quality).toBe("unextractable");
    expect(assessOcrNeed(result, 1).needed).toBe(true);
  });
});

describe("section 4: OCR boundary", () => {
  it("does not pretend to OCR when no engine is bundled", async () => {
    const outcome = await runOcr([{ locator: "page:1", bytes: bytesOf("x") }]);
    expect(outcome.attempted).toBe(false);
    expect(outcome.available).toBe(false);
    expect(outcome.warnings).toContain("ocr_unavailable");
    expect(outcome.note).toMatch(/ML Kit/i);
  });

  it("never produces a numeric confidence score", async () => {
    const outcome = await runOcr([{ locator: "page:1", bytes: bytesOf("x") }]);
    const serialised = JSON.stringify(outcome);
    expect(serialised).not.toMatch(/confidence"?\s*:\s*[0-9]/i);
    expect(outcome.results).toEqual([]);
  });

  it("folds real OCR output into an extraction, preserving page locators", () => {
    const base = extractText("", NOW);
    const merged = mergeOcrIntoExtraction(
      base,
      { attempted: true, available: true, engine: "stub", results: [{ locator: "page:7", text: "Revenue 12", quality: "clean", note: null }], warnings: ["ocr_used"], note: "ok" },
      NOW,
    );
    expect(merged.sections[0].locator).toBe("page:7");
    expect(merged.warnings).toContain("ocr_used");
  });
});

describe("section 5: financial tables", () => {
  it("reads currency, scale, period and basis from the surrounding context", () => {
    const table = extractFinancialTable(
      [["", "FY27", "FY26"], ["Revenue", "1,200", "1,000"]],
      { locator: "table:1", context: "Consolidated audited results for the year ended March 31, 2027 (₹ in crore)" },
    );
    expect(table.currency).toBe("INR");
    expect(table.scale).toBe("crore");
    expect(table.basis).toBe("consolidated");
    expect(table.auditStatus).toBe("audited");
    expect(table.period).toContain("March 31, 2027");
    expect(table.columns).toEqual(["", "FY27", "FY26"]);
  });

  it("keeps the parentheses sign and flags an empty cell as missing, not zero", () => {
    const table = extractFinancialTable(
      [["", "FY27"], ["Operating profit", "(340)"], ["Finance cost", ""]],
      { locator: "table:1" },
    );
    const profit = table.cells.find((c) => c.rowLabel === "Operating profit")!;
    expect(profit.value).toBe(-340);
    expect(profit.parenthesised).toBe(true);
    const cost = table.cells.find((c) => c.rowLabel === "Finance cost")!;
    expect(cost.missing).toBe(true);
    expect(cost.value).toBeNull();
    expect(table.warnings).toContain("incomplete_table");
  });

  it("does not treat every number as a financial fact", () => {
    const table = extractFinancialTable(
      [["", "col"], ["Page", "17"], ["Revenue", "1200"]],
      { locator: "table:1" },
    );
    expect(table.cells.some((c) => c.rowLabel === "Page")).toBe(false);
    expect(table.cells.some((c) => c.rowLabel === "Revenue")).toBe(true);
    expect(looksLikeFinancialLabel("Page")).toBe(false);
    expect(looksLikeFinancialLabel("Net worth")).toBe(true);
  });

  it("parses the scale, currency, period and figure helpers directly", () => {
    expect(parseScale("Rs in lakhs")).toBe("lakh");
    expect(parseScale("$ in millions")).toBe("million");
    expect(parseCurrency("₹")).toBe("INR");
    expect(parseCurrency("US$")).toBe("USD");
    expect(parseBasis("standalone")).toBe("standalone");
    expect(parsePeriod("Quarter ended June 30, 2026")).toContain("June 30, 2026");
    expect(parseFigure("1,200").value).toBe(1200);
    expect(parseFigure("(340)").value).toBe(-340);
    expect(parseFigure("-").missing).toBe(true);
    expect(parseFigure("N/A").missing).toBe(true);
  });

  it("lists only the cells that carry a real value", () => {
    const table = extractFinancialTable([["", "c"], ["Revenue", "1200"], ["Cost", ""]], { locator: "table:1" });
    expect(valuedCells(table)).toHaveLength(1);
  });
});

describe("section 1: discovery", () => {
  function filing(overrides: Partial<DiscoveredFiling> = {}): DiscoveredFiling {
    const sourceId = overrides.sourceId ?? "nse_corporate_announcements";
    const scoped = overrides.identifiers?.sourceId ?? null;
    const url = overrides.officialUrl ?? "https://example.invalid/f1";
    return {
      stableKey: stableKeyFor(sourceId, scoped, url),
      sourceId,
      identifiers: { sourceId: scoped, companyId: null, isin: null, exchangeCode: null, ticker: null, stableKey: stableKeyFor(sourceId, scoped, url) },
      companyName: "Acme Ltd",
      title: "Board meeting outcome",
      category: "corporate_announcement",
      filingType: "10-K",
      period: "FY27",
      officialUrl: url,
      amends: null,
      isAmendment: false,
      timestamps: { ...emptyTimestamps(), publication: { known: true, value: "2026-10-05T00:00:00.000Z" } },
      ...overrides,
    };
  }

  it("keys on the source-scoped id, never on the title", () => {
    const a = filing({ identifiers: { sourceId: "A1", companyId: null, isin: null, exchangeCode: null, ticker: "X", stableKey: "x" } });
    const b = filing({ identifiers: { sourceId: "A2", companyId: null, isin: null, exchangeCode: null, ticker: "X", stableKey: "y" } });
    expect(a.stableKey).not.toBe(b.stableKey);
  });

  it("filters by company id, type, category, date range and period", () => {
    const filings = [
      filing({ identifiers: { sourceId: "A1", companyId: "CIK0001", isin: null, exchangeCode: null, ticker: null, stableKey: "k1" } }),
      filing({ identifiers: { sourceId: "A2", companyId: "CIK0002", isin: null, exchangeCode: null, ticker: null, stableKey: "k2" }, category: "regulatory_filing" }),
    ];
    expect(applyDiscoveryFilters(filings, { companyId: "CIK0001" })).toHaveLength(1);
    expect(applyDiscoveryFilters(filings, { categories: ["regulatory_filing"] })).toHaveLength(1);
    expect(applyDiscoveryFilters(filings, { publishedFrom: "2026-10-01" })).toHaveLength(2);
    expect(applyDiscoveryFilters(filings, { publishedFrom: "2026-10-10" })).toHaveLength(0);
    expect(applyDiscoveryFilters(filings, { period: "fy27" })).toHaveLength(2);
  });

  it("excludes an undated filing from a date range rather than assuming it matches", () => {
    const undated = filing({ timestamps: emptyTimestamps() });
    expect(applyDiscoveryFilters([undated], { publishedFrom: "2026-01-01" })).toHaveLength(0);
  });

  it("paginates with a bounded page number", () => {
    const many = Array.from({ length: 30 }, (_v, i) => filing({ identifiers: { sourceId: `A${i}`, companyId: null, isin: null, exchangeCode: null, ticker: null, stableKey: `k${i}` } }));
    const first = paginate(many, 0, 10);
    expect(first.items).toHaveLength(10);
    expect(first.totalPages).toBe(3);
    expect(first.hasMore).toBe(true);
    const beyond = paginate(many, 99, 10);
    expect(beyond.page).toBe(2);
  });

  it("suppresses duplicates by key and keeps a distinct filing with the same title", () => {
    const one = filing({ identifiers: { sourceId: "A1", companyId: null, isin: null, exchangeCode: null, ticker: null, stableKey: "k1" } });
    const sameKey = filing({ identifiers: { sourceId: "A1", companyId: null, isin: null, exchangeCode: null, ticker: null, stableKey: "k1" } });
    const otherKey = filing({ identifiers: { sourceId: "A2", companyId: null, isin: null, exchangeCode: null, ticker: null, stableKey: "k2" } });
    const outcome = dedupeFilings([one, sameKey, otherKey]);
    expect(outcome.unique).toHaveLength(2);
    expect(outcome.duplicates).toHaveLength(1);
  });

  it("returns only unseen filings on an incremental pass", () => {
    const filings = [filing({ identifiers: { sourceId: "A1", companyId: null, isin: null, exchangeCode: null, ticker: null, stableKey: "k1" } })];
    const outcome = discoverIncremental(filings, ["nse_corporate_announcements::A1"]);
    expect(outcome.fresh).toHaveLength(0);
    expect(outcome.alreadyKnown).toHaveLength(1);
  });

  it("links an amendment to the filing it amends", () => {
    const original = filing({ stableKey: "k1", identifiers: { sourceId: "A1", companyId: "CIK1", isin: null, exchangeCode: null, ticker: null, stableKey: "k1" }, filingType: "10-K" });
    const amendment = filing({
      stableKey: "k2",
      identifiers: { sourceId: "A2", companyId: "CIK1", isin: null, exchangeCode: null, ticker: null, stableKey: "k2" },
      filingType: "10-K/A",
      isAmendment: true,
    });
    const linked = detectAmendments([original, amendment]);
    expect(linked.find((f) => f.stableKey === "k2")!.amends).toBe("k1");
  });

  it("runs the whole discovery pass in one call", () => {
    const filings = [filing({ identifiers: { sourceId: "A1", companyId: null, isin: null, exchangeCode: null, ticker: null, stableKey: "k1" } })];
    const result = discover(filings, {}, { pageSize: 5, seenKeys: [] });
    expect(result.page.items).toHaveLength(1);
    expect(result.freshCount).toBe(1);
  });
});

describe("section 6: version and integrity", () => {
  const base = { filingKey: "f1", sha256: "aaaa", byteLength: 100, contentType: "application/pdf", format: "pdf" as const, requestedUrl: "u", finalUrl: "u", retrievedUtc: NOW, parserVersion: "1.0.0", isAmendment: false };

  it("records a first version and is idempotent on the same bytes", () => {
    const first = recordVersion(emptyHistory("f1"), base);
    expect(first.created).toBe(true);
    expect(first.version.versionId).toContain("::v1::");
    const repeat = recordVersion(first.history, base);
    expect(repeat.created).toBe(false);
    expect(repeat.history.versions).toHaveLength(1);
  });

  it("never overwrites an earlier version when the content changes", () => {
    const first = recordVersion(emptyHistory("f1"), base);
    const second = recordVersion(first.history, { ...base, sha256: "bbbb", retrievedUtc: "2026-10-13T00:00:00.000Z" });
    expect(second.history.versions).toHaveLength(2);
    expect(second.history.versions[0].sha256).toBe("aaaa");
    expect(second.history.versions[1].sha256).toBe("bbbb");
  });

  it("links an amendment to the version it supersedes", () => {
    const first = recordVersion(emptyHistory("f1"), base);
    const amended = recordVersion(first.history, { ...base, sha256: "cccc", isAmendment: true });
    expect(amended.version.supersedes).toBe(first.version.versionId);
  });

  it("does not treat a changed URL with identical bytes as a new filing", () => {
    const history = recordVersion(emptyHistory("f1"), base).history;
    const assessment = assessChange(history, { sha256: "aaaa", finalUrl: "https://new.example/f1", isAmendment: false });
    expect(assessment.contentChanged).toBe(false);
    expect(assessment.recommendation).toBe("investigate_url_change");
  });

  it("recommends a new version when the bytes differ", () => {
    const history = recordVersion(emptyHistory("f1"), base).history;
    expect(assessChange(history, { sha256: "zzzz", finalUrl: "u", isAmendment: false }).recommendation).toBe("new_version");
    expect(assessChange(history, { sha256: "zzzz", finalUrl: "u", isAmendment: true }).recommendation).toBe("amend");
  });
});

describe("section 7: local store", () => {
  function entry(key: string, overrides: Partial<CacheEntry> = {}): CacheEntry {
    return { filingKey: key, status: "extracted", sha256: key, byteLength: 1000, format: "pdf", parserVersion: "1.0.0", storedUtc: NOW, lastAccessUtc: NOW, retained: true, error: null, attempts: 1, ...overrides };
  }

  it("enforces the entry ceiling, evicting the least recently used", () => {
    let store = createStore({ maxEntries: 2, parserVersion: "1.0.0" });
    store = upsertEntry(store, entry("a", { lastAccessUtc: "2026-10-01T00:00:00.000Z" })).store;
    store = upsertEntry(store, entry("b", { lastAccessUtc: "2026-10-02T00:00:00.000Z" })).store;
    const outcome = upsertEntry(store, entry("c", { lastAccessUtc: "2026-10-03T00:00:00.000Z" }));
    expect(outcome.store.entries).toHaveLength(2);
    expect(outcome.evicted).toContain("a");
  });

  it("releases bytes rather than dropping the record when the byte budget is exceeded", () => {
    let store = createStore({ maxEntries: 10, maxBytes: 1500, parserVersion: "1.0.0" });
    store = upsertEntry(store, entry("a", { lastAccessUtc: "2026-10-01T00:00:00.000Z" })).store;
    const outcome = upsertEntry(store, entry("b", { lastAccessUtc: "2026-10-03T00:00:00.000Z" }));
    expect(outcome.store.entries).toHaveLength(2);
    expect(outcome.store.entries.find((e) => e.filingKey === "a")!.retained).toBe(false);
  });

  it("recovers an interrupted download instead of leaving it stuck", () => {
    let store = createStore({ parserVersion: "1.0.0" });
    store = upsertEntry(store, entry("a", { status: "retrieving", lastAccessUtc: "2026-10-12T10:00:00.000Z" })).store;
    const recovered = recoverInterrupted(store, 15 * 60_000, new Date(NOW));
    expect(recovered.recovered).toContain("a");
    expect(recovered.store.entries[0].status).toBe("pending");
    expect(recovered.store.entries[0].attempts).toBe(2);
  });

  it("queues reprocessing when the parser version changes", () => {
    let store = createStore({ parserVersion: "2.0.0" });
    store = upsertEntry(store, entry("a", { parserVersion: "1.0.0" })).store;
    expect(needsReprocessing(store, "a")).toBe(true);
    expect(reprocessingQueue(store)).toContain("a");
    expect(storeSummary(store).staleExtractions).toBe(1);
  });

  it("invalidates extractions by parser version", () => {
    let store = createStore({ parserVersion: "1.0.0" });
    store = upsertEntry(store, entry("a", { parserVersion: "1.0.0" })).store;
    const invalidated = invalidateByParserVersion(store, "1.0.0");
    expect(invalidated.invalidated).toContain("a");
    expect(invalidated.store.entries[0].status).toBe("retrieved");
  });

  it("deletes a cached document", () => {
    let store = createStore({ parserVersion: "1.0.0" });
    store = upsertEntry(store, entry("a")).store;
    const deleted = deleteEntry(store, "a");
    expect(deleted.deleted).toBe(true);
    expect(deleted.store.entries).toHaveLength(0);
    expect(deleteEntry(store, "missing").deleted).toBe(false);
  });
});

describe("pipeline: end to end over synthetic documents", () => {
  it("produces a traceable extraction with provenance", () => {
    const result = ingestDocument("f1", bytesOf(MINIMAL_PDF), {
      contentType: "application/pdf",
      requestedUrl: "https://example.invalid/f1.pdf",
      finalUrl: "https://example.invalid/f1.pdf",
      retrievedUtc: NOW,
    });
    expect(result.envelope.format).toBe("pdf");
    expect(result.envelope.sha256).toHaveLength(64);
    expect(result.extraction.sections.length).toBeGreaterThan(0);
    expect(result.provenance).toContain("sha256");
    expect(result.provenance).toContain("analyzerx-pdf-lite");
  });

  it("rejects an oversized document before parsing", () => {
    const huge = new Uint8Array(25_000_001);
    const result = ingestDocument("f2", huge, { contentType: "application/pdf", requestedUrl: "u", finalUrl: "u", retrievedUtc: NOW });
    expect(result.extraction.note).toMatch(/exceeds/i);
  });

  it("reports an unsupported format rather than misreading it", () => {
    const result = ingestDocument("f3", bytesOf("\u0000\u0001\u0002"), { contentType: "application/octet-stream", requestedUrl: "u", finalUrl: "u", retrievedUtc: NOW });
    expect(result.extraction.quality).toBe("unextractable");
    expect(result.extraction.note).toMatch(/no parser is implemented/i);
  });

  it("builds provenance that names the source and the parser", () => {
    const result = ingestDocument("f4", bytesOf("<p>Revenue 1,200 crore</p>"), { contentType: "text/html", requestedUrl: "u", finalUrl: "https://x/y", retrievedUtc: NOW });
    expect(buildProvenance(result.envelope, result.extraction)).toContain("https://x/y");
  });
});

/**
 * OPTIONAL INTEGRATION TEST — a real, permitted public document.
 *
 * Skipped by default. Set NSE_INTEGRATION=1 in an environment that can reach
 * the NSE archive. It discovers a real announcement from the live feed,
 * retrieves the linked document, and parses it, which is the acceptance
 * criterion the prompt sets.
 */
const runIntegration = process.env.NSE_INTEGRATION === "1";
describe.skipIf(!runIntegration)("OPTIONAL INTEGRATION: a real permitted filing", () => {
  it("discovers, retrieves and parses a genuine document", async () => {
    const feed = await fetch("https://nsearchives.nseindia.com/content/RSS/Online_announcements.xml", {
      headers: { "User-Agent": "AnalyzerX/1.0 (filing-intelligence)" },
    });
    expect(feed.ok).toBe(true);
    const xml = await feed.text();
    const link = xml.match(/<link>(https:\/\/nsearchives\.nseindia\.com\/[^<]+)<\/link>/)?.[1];
    expect(link).toBeTruthy();

    const document = await fetch(link!, { headers: { "User-Agent": "AnalyzerX/1.0 (filing-intelligence)" } });
    expect(document.ok).toBe(true);
    const buffer = new Uint8Array(await document.arrayBuffer());
    const result = ingestDocument("integration:nse", buffer, {
      contentType: document.headers.get("content-type"),
      requestedUrl: link!,
      finalUrl: link!,
      retrievedUtc: new Date().toISOString(),
    });
    expect(result.envelope.sha256).toHaveLength(64);
    expect(result.envelope.format).not.toBe("unknown");
    expect(result.provenance).toContain("nsearchives.nseindia.com");
  }, 60_000);
});
