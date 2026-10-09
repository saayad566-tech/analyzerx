import PDFDocument from "pdfkit";
import type { FundamentalAnalysis } from "./fundamental-analysis";
import type { ExtractedNews } from "./news-tracker";
import { buildInstitutionalReportModules } from "./institutional-report-modules";
import { INSTITUTIONAL_REPORT_PROMPT_VERSION } from "./institutional-report-prompt";

const navy = "#07111F"; const ink = "#0B1728"; const muted = "#63748A"; const gold = "#FDB913"; const amber = "#FFF4D6"; const line = "#D9E1EB";
const safe = (value: unknown, fallback = "Unavailable") => typeof value === "string" && value.trim() ? value.trim() : fallback;
const date = (value: unknown) => typeof value === "string" && value.trim() ? value.slice(0, 10) : "Unavailable";
const numberText = (value: unknown, unit = "") => typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)}${unit}` : "Unavailable";
const money = (report: FundamentalAnalysis, value: number | null | undefined) => value === null || value === undefined || !Number.isFinite(value) ? "Unavailable" : `${report.fairValue.currency === "INR" ? "₹" : `${report.fairValue.currency} `}${value.toFixed(2)}`;
const basis = (value: string) => value === "reported" ? "Verified" : value === "derived" ? "Derived" : value === "estimated" ? "Estimated" : "Unavailable";

function header(doc: PDFKit.PDFDocument, report: FundamentalAnalysis, page: number) {
  doc.save().fillColor(navy).rect(0, 0, 595.28, 44).fill().restore();
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(10).text("ANALYZERX", 40, 13);
  doc.fillColor("#F6C453").font("Helvetica").fontSize(7.5).text("MARKET EVENT INTELLIGENCE · INSTITUTIONAL RESEARCH", 40, 27);
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(8).text(`${safe(report.companyName)} · ${safe(report.resolvedSymbol)}`, 380, 13, { width: 175, align: "right" });
  doc.fillColor("#C8D5E6").font("Helvetica").fontSize(7.5).text(`${safe(report.market.exchange)} · ${safe(report.market.country)} · ${safe(report.market.currency)}`, 380, 27, { width: 175, align: "right" });
  doc.save().strokeColor(gold).lineWidth(1).moveTo(40, 752).lineTo(555, 752).stroke().restore();
  doc.fillColor(muted).font("Helvetica").fontSize(7).text(`Source-aware research · generated ${safe(report.asOf)} · Page ${page} · Verify against primary filings`, 40, 762, { width: 515, align: "center" });
}
function heading(doc: PDFKit.PDFDocument, title: string, subtitle?: string) { doc.x = 40; doc.moveDown(0.6).fillColor(ink).font("Helvetica-Bold").fontSize(15).text(title); doc.save().strokeColor(gold).lineWidth(2).moveTo(doc.x, doc.y + 5).lineTo(doc.x + 46, doc.y + 5).stroke().restore(); if (subtitle) doc.moveDown(0.3).fillColor(muted).font("Helvetica").fontSize(8.5).text(subtitle, { width: 515 }); doc.moveDown(0.4); }
function callout(doc: PDFKit.PDFDocument, title: string, body: string, fill = amber) { const y = doc.y; doc.save().roundedRect(40, y, 515, 58, 5).fillColor(fill).fill().lineWidth(0.6).strokeColor("#CDAA55").stroke().restore(); doc.fillColor("#7D5E12").font("Helvetica-Bold").fontSize(8).text(title.toUpperCase(), 52, y + 10); doc.fillColor("#37475B").font("Helvetica").fontSize(8).text(body, 52, y + 24, { width: 490, height: 28, ellipsis: true }); doc.y = y + 72; }
function table(doc: PDFKit.PDFDocument, headers: string[], rows: string[][], widths: number[]) { doc.x = 40; const x0 = 40; let y = doc.y; const rowH = 24; const total = widths.reduce((a, b) => a + b, 0); const displayRows = rows.length ? rows : [["Unavailable — no source-backed records supplied.", ...Array(Math.max(0, headers.length - 1)).fill("")]]; doc.save().fillColor(navy).rect(x0, y, total, rowH).fill().restore(); let x = x0; headers.forEach((h, i) => { doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(7.5).text(h, x + 5, y + 8, { width: widths[i] - 10, height: 10, ellipsis: true }); x += widths[i]; }); y += rowH; displayRows.slice(0, 18).forEach((row, ri) => { doc.save().fillColor(ri % 2 ? "#F6F8FB" : "#FFFFFF").rect(x0, y, total, rowH).fill().lineWidth(0.3).strokeColor(line).stroke().restore(); x = x0; row.forEach((value, i) => { doc.fillColor("#37475B").font("Helvetica").fontSize(7.3).text(safe(value, "Unavailable"), x + 5, y + 7, { width: widths[i] - 10, height: 12, ellipsis: true }); x += widths[i]; }); y += rowH; }); doc.y = y + 8; }
function pageBreak(doc: PDFKit.PDFDocument) { doc.addPage(); }
function sourceText(source: { sourceType: string; publisher: string; date: string | null; url?: string }) { return `[Source: ${safe(source.sourceType)}, ${safe(source.publisher)}, ${date(source.date)}]${source.url ? ` ${source.url}` : ""}`; }

export async function institutionalReportToPdf(report: FundamentalAnalysis, news: ExtractedNews[] = [], marketLabel?: string): Promise<Buffer> {
  const modules = buildInstitutionalReportModules(report, news);
  const doc = new PDFDocument({ size: "A4", margins: { top: 58, bottom: 48, left: 40, right: 40 }, bufferPages: true });
  const chunks: Buffer[] = []; doc.on("data", (chunk: Buffer) => chunks.push(chunk)); const done = new Promise<Buffer>((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); }); let page = 1; doc.on("pageAdded", () => { page += 1; header(doc, report, page); doc.x = 40; doc.y = 58; }); header(doc, report, page);

  doc.fillColor(ink).font("Helvetica-Bold").fontSize(21).text(`${safe(report.companyName)} — Research Brief`, 40, 80, { width: 515, height: 28, ellipsis: true });
  doc.fillColor(muted).font("Helvetica").fontSize(10).text(`${safe(report.resolvedSymbol)} · ${safe(report.market.exchange)} · ${safe(marketLabel ?? report.market.country)} · ${safe(report.market.currency)}`, 40, 112);
  callout(doc, "What this document is", `Built from dated, source-aware company and market records available at ${safe(report.asOf)}. Missing evidence stays Unavailable; derived values identify their basis. This is not investment advice or a guaranteed forecast.`);
  heading(doc, "1 · Plain-English TL;DR", "A concise view with the single biggest reason and the key evidence limitation.");
  doc.fillColor("#37475B").font("Helvetica").fontSize(9).text(`${safe(report.stockAnalysis.conclusion)} The primary score is ${Math.round(report.score)}/100 (${safe(report.institutionalReport.rating)}). The biggest limitation is ${safe(report.coverage.label)} evidence coverage: verify the dated sources shown in this report before relying on any conclusion.`, { width: 515 });
  heading(doc, "2 · Executive score grid", "Every score is a research lens, not an instruction; refresh date is shown with the source report.");
  table(doc, ["Pillar", "Score", "As of / basis", "What this means"], report.institutionalReport.scoreWeights.slice(0, 6).map((item) => [item.label, `${item.score}/${item.max}`, `${safe(report.asOf)} · ${basis("derived")}`, item.calculation]), [145, 55, 115, 200]);
  table(doc, ["Secondary lens", "Score", "Basis", "Interpretation"], [["Multibagger thesis", `${report.multibaggerThesis.score}/100`, `${safe(report.asOf)} · ${basis(String(report.multibaggerThesis.confidence).toLowerCase() === "high" ? "reported" : "estimated")}`, report.multibaggerThesis.beginnerSummary]], [145, 55, 115, 200]);
  heading(doc, "3 · Coverage & evidence completeness");
  table(doc, ["Category", "Coverage", "Status", "Reader guidance"], report.coverage.sections.map((item) => [item.label, `${item.score}/${item.max}`, item.status, item.note]), [150, 65, 75, 225]);

  pageBreak(doc); heading(doc, "4 · Corporate actions / expansion tracker", "Exchange-announcement categories are required; no event is inferred when the feed is unavailable.");
  if (!modules.corporateActions.items.length) callout(doc, "Gap, flagged rather than guessed", `${modules.corporateActions.limitations[0]} 12-month expansion footprint: Unavailable.`, amber);
  if (modules.corporateActions.items.length) table(doc, ["Date", "Category", "Status", "Paraphrase / amount"], modules.corporateActions.items.map((item) => [item.date, item.category, item.status, `${item.paraphrase} · ${item.amount}`]), [65, 105, 95, 250]);
  heading(doc, "5 · Earnings call & management commentary", "Guidance and Q&A must come from a dated call transcript/audio or investor presentation.");
  if (modules.earningsCall.latestCallDate === null) callout(doc, "Gap, flagged rather than guessed", modules.earningsCall.limitations[0], amber);
  table(doc, ["Field", "Status / extracted evidence"], [["Latest call", modules.earningsCall.latestCallDate ?? "Unavailable"], ["Forward guidance", modules.earningsCall.guidance.join(" ") || "Unavailable"], ["Guidance revision", modules.earningsCall.revisions.join(" ") || "Unavailable"], ["Analyst Q&A", modules.earningsCall.analystQandA.join(" ")], ["Observable tone", modules.earningsCall.tone]], [150, 365]);
  heading(doc, "6 · Financial metrics", "Every number retains unit, period, basis, and source context.");
  table(doc, ["Metric", "Value", "Basis / source"], [["Revenue growth", numberText(report.metrics.revenueGrowth?.value, "%"), basis(report.metrics.revenueGrowth?.basis ?? "unavailable")], ["EPS", numberText(report.metrics.eps?.value, " per share"), basis(report.metrics.eps?.basis ?? "unavailable")], ["Operating cash flow", numberText(report.metrics.operatingCashFlow?.value, " ₹ Cr"), basis(report.metrics.operatingCashFlow?.basis ?? "unavailable")], ["Free cash flow", numberText(report.metrics.freeCashFlow?.value, " ₹ Cr"), basis(report.metrics.freeCashFlow?.basis ?? "unavailable")], ["P/E", numberText(report.metrics.pe?.value, "×"), basis(report.metrics.pe?.basis ?? "unavailable")]], [165, 100, 250]);

  pageBreak(doc); heading(doc, "7 · Valuation & analyst views", "Scenario anchors are conditional; attributed analyst positions are preferred over synthetic targets.");
  table(doc, ["Anchor", "Value", "Basis", "What this means"], [["Current price", money(report, report.fairValue.currentPrice), "Reported / dated market observation", "Latest available market-price observation"], ["Low relative anchor", money(report, report.fairValue.lowValue), basis(report.fairValue.basis), "Conservative conditional anchor"], ["Base relative anchor", money(report, report.fairValue.baseValue), basis(report.fairValue.basis), "Central conditional anchor"], ["High relative anchor", money(report, report.fairValue.highValue), basis(report.fairValue.basis), "Optimistic conditional anchor"], ["DCF intrinsic value", money(report, report.fairValue.dcf.valuePerShare), basis(report.fairValue.dcf.basis), report.fairValue.dcf.note]], [140, 100, 135, 140]);
  callout(doc, "Probability disclosure", "Any outcome probability must show its formula/weighting or be labeled heuristic estimate — not a statistical model. Unmodeled precision is not displayed as fact.", amber);
  heading(doc, "8 · Company-specific news", "Only issuer-identity-matched items appear here; macro/index stories are separated below.");
  if (!modules.companyNews.items.length) doc.fillColor(muted).font("Helvetica").fontSize(8.5).text("Unavailable — no company-scoped item passed the identity filter at export time.");
  if (modules.companyNews.items.length) table(doc, ["Date", "Tag", "Paraphrase / why it matters", "Source"], modules.companyNews.items.map((item) => [item.date, item.tag, `${item.paraphrase} Why it matters: ${item.whyItMatters}`, sourceText(item.source)]), [55, 95, 235, 130]);
  heading(doc, "Market backdrop", "Index, sector, commodity, and macro context is intentionally not company evidence.");
  if (modules.marketBackdrop.items.length) table(doc, ["Date", "Context", "Source"], modules.marketBackdrop.items.map((item) => [item.date, item.paraphrase, sourceText(item.source)]), [65, 300, 150]);

  pageBreak(doc); heading(doc, "9 · Shareholding & ownership trend", "Direction requires dated prior-quarter filings; a single snapshot is labeled accordingly.");
  table(doc, ["Holder", "Latest", "Direction / meaning"], modules.ownershipTrend.latest.map((item) => [item.holder, item.value, item.direction]), [120, 110, 285]);
  doc.fillColor("#37475B").font("Helvetica").fontSize(8.5).text(`Promoter pledge: ${safe(modules.ownershipTrend.pledge)}. ${modules.ownershipTrend.limitations.join(" ")}`, { width: 515 });
  heading(doc, "10 · Peer / competitor benchmarking", "Diversified issuers require segment-level peers; one blended P/E can mislead.");
  doc.fillColor("#37475B").font("Helvetica").fontSize(8.5).text(safe(modules.peers.comparisonBasis), { width: 515 });
  if (!modules.peers.peers.length) callout(doc, "Unavailable source", modules.peers.limitations[0], amber);
  if (modules.peers.peers.length) table(doc, ["Peer", "Segment", "Metrics / period", "Source"], modules.peers.peers.map((item) => [item.name, item.segment, item.metrics, sourceText(item.source)]), [115, 115, 145, 140]);
  heading(doc, "11 · Regulatory & legal proceedings", "Each thread is independent and carries its own status and last-update date.");
  table(doc, ["Thread", "Status", "Last update", "Note / source"], modules.regulatory.proceedings.map((item) => [item.thread, item.status, item.lastUpdate, `${item.note} ${sourceText(item.source)}`]), [130, 70, 75, 240]);
  heading(doc, "12 · Method, sources, limitations, disclaimer");
  doc.fillColor("#37475B").font("Helvetica").fontSize(8.5).text(`Prompt contract: ${INSTITUTIONAL_REPORT_PROMPT_VERSION}. Method: ${safe(report.institutionalReport.freshness)} Scores and scenarios are evidence-gated. Reported values retain their source basis; derived metrics retain formulas in the analytical record. ${modules.companyNews.limitations.join(" ")} ${modules.earningsCall.limitations.join(" ")} ${modules.corporateActions.limitations.join(" ")}`, { width: 515 });
  doc.moveDown(0.6); doc.fillColor(ink).font("Helvetica-Bold").fontSize(9).text("Global disclaimer"); doc.fillColor("#37475B").font("Helvetica").fontSize(8.5).text("This report is analytical research, not investment advice, a solicitation, or a buy/sell/hold instruction. It is not a guaranteed forecast. Verify every decision-relevant figure against the latest official filings, company disclosures, exchange records, and licensed market-data sources.", { width: 515 });
  doc.moveDown(0.6); doc.fillColor(muted).font("Helvetica").fontSize(7.5).text(`Sources used: ${report.sources.map((source) => `${source.name} (${source.status})`).join("; ") || "Unavailable"}. Report generated at ${safe(report.asOf)}.`, { width: 515 });
  doc.end(); return done;
}
