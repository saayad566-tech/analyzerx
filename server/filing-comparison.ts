export type FilingComparisonFilters = { symbols: string[]; from?: string; to?: string; forms?: string[]; metrics?: string[] };
export type FilingComparisonPoint = { symbol: string; tag: string; value: number; unit: string; end?: string; filed?: string; form?: string; frame?: string; source: "SEC EDGAR" };
import PDFDocument from "pdfkit";

export type FilingComparisonResult = { symbols: string[]; from: string | null; to: string | null; forms: string[]; metrics: string[]; points: FilingComparisonPoint[]; unavailable: Array<{ symbol: string; reason: string }>; refreshedAt: string };

type SourceRecordLike = { symbol?: string | null; sourceKey: string; normalizedPayload?: string | null };

const DEFAULT_METRICS = ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "NetIncomeLoss", "EarningsPerShareDiluted", "NetCashProvidedByUsedInOperatingActivities"];

function asFacts(record: SourceRecordLike) {
  if (record.sourceKey !== "sec-company-facts" || !record.normalizedPayload) return [] as Array<Record<string, unknown>>;
  try {
    const parsed = JSON.parse(record.normalizedPayload) as { facts?: unknown };
    return Array.isArray(parsed.facts) ? parsed.facts.filter((fact): fact is Record<string, unknown> => Boolean(fact && typeof fact === "object")) : [];
  } catch { return []; }
}

export function buildFilingComparison(recordsBySymbol: Record<string, SourceRecordLike[]>, filters: FilingComparisonFilters): FilingComparisonResult {
  const symbols = [...new Set(filters.symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];
  const from = filters.from ?? null;
  const to = filters.to ?? null;
  const forms = (filters.forms ?? []).map((form) => form.trim().toUpperCase()).filter(Boolean);
  const metrics = (filters.metrics?.length ? filters.metrics : DEFAULT_METRICS).map((metric) => metric.trim()).filter(Boolean);
  const points: FilingComparisonPoint[] = [];
  const unavailable: FilingComparisonResult["unavailable"] = [];
  for (const symbol of symbols) {
    const records = recordsBySymbol[symbol] ?? [];
    const facts = records.flatMap(asFacts);
    const matching = facts.filter((fact) => {
      const tag = typeof fact.tag === "string" ? fact.tag : "";
      const end = typeof fact.end === "string" ? fact.end : typeof fact.filed === "string" ? fact.filed : "";
      const form = typeof fact.form === "string" ? fact.form.toUpperCase() : "";
      return metrics.includes(tag) && (!from || end >= from) && (!to || end <= to) && (!forms.length || forms.includes(form));
    });
    if (!matching.length) unavailable.push({ symbol, reason: records.length ? "No SEC XBRL facts matched the selected metrics, forms, or date range." : "No SEC company-facts record is stored for this issuer." });
    for (const fact of matching) {
      const value = typeof fact.value === "number" ? fact.value : Number(fact.value);
      if (!Number.isFinite(value)) continue;
      points.push({ symbol, tag: String(fact.tag), value, unit: typeof fact.unit === "string" ? fact.unit : "unknown", end: typeof fact.end === "string" ? fact.end : undefined, filed: typeof fact.filed === "string" ? fact.filed : undefined, form: typeof fact.form === "string" ? fact.form : undefined, frame: typeof fact.frame === "string" ? fact.frame : undefined, source: "SEC EDGAR" });
    }
  }
  return { symbols, from, to, forms, metrics, points: points.sort((a, b) => `${a.tag}:${a.symbol}:${a.end ?? ""}`.localeCompare(`${b.tag}:${b.symbol}:${b.end ?? ""}`)), unavailable, refreshedAt: new Date().toISOString() };
}

const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;

const escapeSvg = (value: unknown) => String(value ?? "").replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;" }[character] ?? character));

export function filingComparisonToSvg(result: FilingComparisonResult & { marketId?: string; marketLabel?: string }): string {
  const width = 1000; const height = 560; const chart = result.points.slice(0, 18); const max = Math.max(...chart.map((point) => Math.abs(point.value)), 1); const barWidth = chart.length ? Math.max(18, Math.floor(860 / chart.length) - 8) : 24;
  const bars = chart.map((point, index) => { const x = 70 + index * (barWidth + 8); const barHeight = Math.max(4, Math.round((Math.abs(point.value) / max) * 280)); const y = 385 - barHeight; const color = index % 2 ? "#4FD1C5" : "#FDB913"; const label = escapeSvg(`${point.symbol} ${point.tag}`.slice(0, 18)); return `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="5" fill="${color}"/><text x="${x + barWidth / 2}" y="410" text-anchor="middle" fill="#91A2B8" font-size="11" transform="rotate(-35 ${x + barWidth / 2} 410)">${label}</text><text x="${x + barWidth / 2}" y="${Math.max(32, y - 8)}" text-anchor="middle" fill="#F4F7FB" font-size="10">${point.value.toLocaleString()}</text>`; }).join("");
  const market = escapeSvg(result.marketLabel ?? result.marketId ?? "Selected market");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#09111F"/><rect width="100%" height="14" fill="#FDB913"/><text x="54" y="56" fill="#F4F7FB" font-family="Arial, sans-serif" font-size="26" font-weight="700">AnalyzerX · Filing comparison</text><text x="54" y="82" fill="#4FD1C5" font-family="Arial, sans-serif" font-size="14">${market} · ${result.symbols.join(" · ")}</text><text x="54" y="106" fill="#91A2B8" font-family="Arial, sans-serif" font-size="12">${result.from ?? "beginning"} to ${result.to ?? "latest"} · Source-backed observations only</text><line x1="54" y1="385" x2="950" y2="385" stroke="#26364D" stroke-width="2"/><line x1="54" y1="105" x2="54" y2="385" stroke="#26364D" stroke-width="2"/>${bars || `<text x="500" y="260" text-anchor="middle" fill="#91A2B8" font-family="Arial, sans-serif" font-size="16">No matching source-backed facts</text>`}<text x="54" y="520" fill="#91A2B8" font-family="Arial, sans-serif" font-size="11">Unavailable coverage: ${result.unavailable.length ? result.unavailable.map((item) => `${item.symbol}: ${item.reason}`).join(" · ").slice(0, 180) : "None"}</text></svg>`;
}

export function filingComparisonToCsv(result: FilingComparisonResult & { marketId?: string; marketLabel?: string }): string {
  const lines = [
    ["AnalyzerX filing comparison", ""],
    ["Market", result.marketLabel ?? result.marketId ?? "Selected market"],
    ["Companies", result.symbols.join(", ")],
    ["From", result.from ?? ""], ["To", result.to ?? ""],
    ["Forms", result.forms.join(", ") || "All available forms"],
    ["Metrics", result.metrics.join(", ")], ["Refreshed", result.refreshedAt], ["", ""],
    ["Symbol", "Metric tag", "Value", "Unit", "Period end", "Form", "Source"],
    ...result.points.map((point) => [point.symbol, point.tag, point.value, point.unit, point.end ?? "Unavailable", point.form ?? "Unavailable", point.source]),
    ["", "", "", "", "", "", ""], ["Unavailable symbol", "Reason"],
    ...result.unavailable.map((item) => [item.symbol, item.reason]),
  ];
  return lines.map((row) => row.map(csvCell).join(",")).join("\\n");
}

export async function filingComparisonToPdf(result: FilingComparisonResult & { marketId?: string; marketLabel?: string }): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margins: { top: 54, bottom: 48, left: 40, right: 40 }, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  const market = result.marketLabel ?? result.marketId ?? "Selected market";
  const drawHeader = () => { doc.save().fillColor("#FDB913").rect(0, 0, 595, 14).fill().restore(); doc.fillColor("#0B1728").font("Helvetica-Bold").fontSize(19).text("AnalyzerX", 40, 34); doc.fillColor("#63748A").font("Helvetica").fontSize(9).text("FILING COMPARISON · SOURCE-BACKED", 40, 58); };
  drawHeader();
  doc.fillColor("#0B1728").font("Helvetica-Bold").fontSize(23).text("Multi-company XBRL comparison", 40, 94, { width: 515 });
  doc.fillColor("#149B8A").font("Helvetica-Bold").fontSize(10).text(`${market} · ${result.symbols.join(" · ")}`, 40, 127);
  doc.fillColor("#63748A").font("Helvetica").fontSize(9).text(`Period: ${result.from ?? "beginning"} to ${result.to ?? "latest"} · Forms: ${result.forms.join(", ") || "all available"} · Refreshed: ${result.refreshedAt}`, 40, 146, { width: 515 });
  doc.moveDown(5); doc.fillColor("#37475B").fontSize(8.5).text("This report contains source-backed filing and XBRL observations only. Missing metrics remain unavailable; no values are estimated.", { width: 515 });
  doc.moveDown(1.2);
  const tableHeader = () => { const y = doc.y; doc.fillColor("#0F2035").rect(40, y, 515, 22).fill(); doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(7.5); ["Symbol", "Metric", "Value", "Unit", "Period", "Form"].forEach((label, index) => doc.text(label, [48, 100, 265, 350, 405, 480][index], y + 7, { width: [48, 160, 80, 50, 70, 65][index], ellipsis: true })); doc.y = y + 28; };
  tableHeader();
  result.points.forEach((point, index) => { if (doc.y > 755) { doc.addPage(); drawHeader(); doc.y = 92; tableHeader(); } const y = doc.y; if (index % 2 === 0) doc.fillColor("#F6F8FB").rect(40, y - 4, 515, 25).fill(); doc.fillColor("#0B1728").font("Helvetica").fontSize(7.5); [point.symbol, point.tag, point.value.toLocaleString(), point.unit, point.end ?? "Unavailable", point.form ?? "Unavailable"].forEach((value, column) => doc.text(String(value), [48, 100, 265, 350, 405, 480][column], y, { width: [48, 160, 80, 50, 70, 65][column], ellipsis: true })); doc.y = y + 25; });
  if (!result.points.length) doc.fillColor("#63748A").font("Helvetica").fontSize(9).text("No matching source-backed facts returned for the selected filters.");
  doc.moveDown(1); doc.fillColor("#D28A00").font("Helvetica-Bold").fontSize(10).text("Unavailable coverage"); doc.moveDown(0.35); doc.fillColor("#37475B").font("Helvetica").fontSize(8.5).text(result.unavailable.length ? result.unavailable.map((item) => `${item.symbol}: ${item.reason}`).join("\\n") : "None for the selected filters.", { width: 515 });
  doc.moveDown(1); doc.fillColor("#63748A").fontSize(7.5).text(`Metrics: ${result.metrics.join(", ")}\\nSource: SEC EDGAR or the selected validated regional adapter. Exported by AnalyzerX at ${new Date().toISOString()}.`, { width: 515 });
  doc.addPage();
  drawHeader();
  doc.fillColor("#0B1728").font("Helvetica-Bold").fontSize(21).text("Comparison chart appendix", 40, 94, { width: 515 });
  doc.fillColor("#149B8A").font("Helvetica-Bold").fontSize(10).text(`${market} · source-backed observations`, 40, 127);
  doc.fillColor("#63748A").font("Helvetica").fontSize(8.5).text("Bars show the absolute magnitude of selected period-end observations. Original units are retained; unavailable metrics are not estimated.", 40, 148, { width: 515 });
  const chartPoints = result.points.slice(0, 12);
  const chartMax = Math.max(...chartPoints.map((point) => Math.abs(point.value)), 1);
  const chartLeft = 58; const chartTop = 220; const chartBottom = 620; const chartHeight = 300; const chartWidth = 470; const slot = chartPoints.length ? chartWidth / chartPoints.length : chartWidth;
  doc.strokeColor("#DCE4EC").lineWidth(0.8).moveTo(chartLeft, chartBottom).lineTo(chartLeft + chartWidth, chartBottom).stroke();
  doc.strokeColor("#E9EEF4").lineWidth(0.5).moveTo(chartLeft, chartTop).lineTo(chartLeft + chartWidth, chartTop).stroke();
  chartPoints.forEach((point, index) => { const barWidth = Math.max(12, slot * 0.56); const x = chartLeft + index * slot + (slot - barWidth) / 2; const height = Math.max(5, (Math.abs(point.value) / chartMax) * chartHeight); const y = chartBottom - height; doc.fillColor(index % 2 ? "#149B8A" : "#FDB913").roundedRect(x, y, barWidth, height, 4).fill(); doc.fillColor("#37475B").font("Helvetica").fontSize(6.5).text(`${point.value.toLocaleString()} ${point.unit}`, x - 8, y - 14, { width: barWidth + 16, align: "center", ellipsis: true }); doc.fillColor("#63748A").fontSize(6.5).text(`${point.symbol} · ${point.tag}`.slice(0, 21), x - 12, chartBottom + 10, { width: barWidth + 24, align: "center", ellipsis: true }); });
  if (!chartPoints.length) doc.fillColor("#63748A").font("Helvetica").fontSize(10).text("No matching source-backed observations for the selected comparison.", chartLeft, 360, { width: chartWidth, align: "center" });
  doc.fillColor("#D28A00").font("Helvetica-Bold").fontSize(9).text("Unavailable coverage", 40, 680);
  doc.fillColor("#37475B").font("Helvetica").fontSize(7.5).text(result.unavailable.length ? result.unavailable.map((item) => `${item.symbol}: ${item.reason}`).join("\\n") : "None for the selected filters.", 40, 696, { width: 515 });
  doc.end();
  return done;
}

export function filingComparisonToMarkdown(result: FilingComparisonResult & { marketId?: string; marketLabel?: string }): string {
  const market = result.marketLabel ?? result.marketId ?? "Selected market";
  const range = result.from || result.to ? `${result.from ?? "beginning"} to ${result.to ?? "latest"}` : "All available period-end facts";
  const rows = result.points.length
    ? result.points.map((point) => `| ${point.symbol} | ${point.tag} | ${point.value.toLocaleString()} | ${point.unit} | ${point.end ?? "Unavailable"} | ${point.form ?? "Unavailable"} | ${point.source} |`).join("\\n")
    : "| — | — | Unavailable | — | — | — | No matching source-backed facts |";
  const unavailable = result.unavailable.length
    ? result.unavailable.map((item) => `- **${item.symbol}:** ${item.reason}`).join("\\n")
    : "- None for the selected filters.";
  return `# AnalyzerX Filing Comparison\\n\\n**Market:** ${market}  \\n**Companies:** ${result.symbols.join(", ")}  \\n**Date range:** ${range}  \\n**Forms:** ${result.forms.length ? result.forms.join(", ") : "All available forms"}  \\n**Metrics:** ${result.metrics.join(", ")}  \\n**Refreshed:** ${result.refreshedAt}\\n\\n> This comparison contains source-backed filing/XBRL observations only. Missing metrics remain unavailable; values are not estimates or investment advice.\\n\\n## Comparison observations\\n\\n| Symbol | Metric tag | Value | Unit | Period end | Form | Source |\\n|---|---|---:|---|---|---|---|\\n${rows}\\n\\n## Unavailable coverage\\n\\n${unavailable}\\n\\n## Method\\n\\nAnalyzerX resolves each company independently within the selected market, filters facts by the requested date range, form, and metric tags, and preserves SEC EDGAR or regional adapter provenance. Export timestamp: ${new Date().toISOString()}.`;
}

export { DEFAULT_METRICS };
