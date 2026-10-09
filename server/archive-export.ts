import PDFDocument from "pdfkit";
import type { ArchiveArticle } from "../lib/news-archive";

type ArchiveExportArticle = ArchiveArticle & { id: string; marketId?: string; symbol: string; summary: string; source: string; url: string };

export type ArchiveExportFilters = {
  marketId: string;
  marketLabel?: string;
  symbol?: string;
  startDate?: string;
  endDate?: string;
  archiveScope: "All archive" | "Special Events";
  archiveSentiment: "All sentiment" | "Positive" | "Neutral" | "Negative";
  archiveOrder: "Newest first" | "Oldest first" | "Impact low → high" | "Impact high → low";
};

function csvCell(value: unknown) {
  const raw = value === null || value === undefined ? "" : String(value);
  const text = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${text.replace(/"/g, '""')}"`;
}

function isSpecialEvent(article: ArchiveArticle) {
  return /earnings|contract|order|approval|upgrade|partnership|buyback|merger|acquisition|dividend|regulator|filing|policy/i.test(`${article.category ?? ""} ${article.headline} ${article.actionable_impact}`);
}

export function filterArchiveExportArticles<T extends ArchiveExportArticle>(articles: T[], filters: Pick<ArchiveExportFilters, "archiveScope" | "archiveSentiment" | "archiveOrder">) {
  const filtered = articles.filter((article) => (filters.archiveScope === "All archive" || isSpecialEvent(article)) && (filters.archiveSentiment === "All sentiment" || article.sentiment === filters.archiveSentiment));
  return filtered.sort((left, right) => {
    if (filters.archiveOrder === "Oldest first") return Date.parse(left.published_at) - Date.parse(right.published_at);
    if (filters.archiveOrder === "Impact low → high") return left.impact_score - right.impact_score;
    if (filters.archiveOrder === "Impact high → low") return right.impact_score - left.impact_score;
    return Date.parse(right.published_at) - Date.parse(left.published_at);
  });
}

export function archiveToCsv<T extends ArchiveExportArticle>(articles: T[], filters: ArchiveExportFilters) {
  const rows = [
    ["AnalyzerX historical news archive", ""],
    ["Market", filters.marketLabel ?? filters.marketId],
    ["Symbol", filters.symbol ?? "All market symbols"],
    ["Date range", `${filters.startDate ?? "lookback"} to ${filters.endDate ?? "today"}`],
    ["Exported at", new Date().toISOString()],
    [],
    ["id", "market_id", "symbol", "headline", "summary", "sentiment", "impact_score", "category", "actionable_impact", "source", "published_at", "source_url", "high_impact"],
    ...articles.map((article) => [article.id, article.marketId ?? filters.marketId, article.symbol, article.headline, article.summary, article.sentiment, article.impact_score, article.category ?? "", article.actionable_impact, article.source, article.published_at, article.url, article.high_impact]),
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

export async function archiveToPdf<T extends ArchiveExportArticle>(articles: T[], filters: ArchiveExportFilters): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margins: { top: 58, bottom: 50, left: 42, right: 42 }, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  const drawHeader = () => { doc.save().fillColor("#FDB913").rect(0, 0, 595, 14).fill().restore(); doc.fillColor("#0B1728").font("Helvetica-Bold").fontSize(19).text("AnalyzerX", 42, 34); doc.fillColor("#63748A").font("Helvetica").fontSize(9).text("HISTORICAL NEWS ARCHIVE · SOURCE-BACKED", 42, 59); };
  drawHeader();
  doc.fillColor("#0B1728").font("Helvetica-Bold").fontSize(15).text("Verified market news archive", 42, 86);
  doc.fillColor("#63748A").font("Helvetica").fontSize(9).text(`${filters.marketLabel ?? filters.marketId} · ${filters.symbol ?? "All market symbols"} · ${filters.startDate ?? "Lookback"} to ${filters.endDate ?? "Today"}`, 42, 108);
  doc.text(`Scope: ${filters.archiveScope} · Sentiment: ${filters.archiveSentiment} · Sort: ${filters.archiveOrder}`, 42, 123);
  doc.moveTo(42, 145).lineTo(553, 145).strokeColor("#D8E0E8").stroke();
  let y = 163;
  if (!articles.length) {
    doc.fillColor("#63748A").font("Helvetica").fontSize(11).text("No verified archive items matched the selected range and filters.", 42, y);
  } else {
    for (const article of articles) {
      if (y > 720) { doc.addPage(); drawHeader(); y = 86; }
      doc.fillColor("#0B1728").font("Helvetica-Bold").fontSize(10).text(`${article.symbol} · ${article.sentiment} · Impact ${article.impact_score}`, 42, y, { width: 511 });
      y += 14;
      doc.fillColor("#182A3F").font("Helvetica-Bold").fontSize(11).text(article.headline, 42, y, { width: 511 });
      y += doc.heightOfString(article.headline, { width: 511 }) + 4;
      doc.fillColor("#63748A").font("Helvetica").fontSize(8.5).text(`${article.source} · ${new Date(article.published_at).toLocaleString()} · ${article.url}`, 42, y, { width: 511 });
      y += doc.heightOfString(`${article.source} · ${new Date(article.published_at).toLocaleString()} · ${article.url}`, { width: 511 }) + 12;
      doc.moveTo(42, y - 5).lineTo(553, y - 5).strokeColor("#E7ECF1").stroke();
    }
  }
  doc.fillColor("#63748A").font("Helvetica").fontSize(8).text("AnalyzerX preserves source links and does not fabricate unavailable article fields. News is shown only after the platform publication and market-scope gates.", 42, 760, { width: 511 });
  doc.end();
  return done;
}
