/**
 * Professional on-device PDF export.
 *
 * Renders a branded, charted, source-aware research report to HTML and prints
 * it to PDF with expo-print (no server, no Node). Charts are inline SVG so they
 * survive the HTML→PDF conversion without any image pipeline.
 */
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { nowIso, type MarketId } from "./open-data/core";
import { fundamentals, priceHistory, stockNews, type FundamentalAnalysis } from "./open-data/engine";

const BRAND = {
  navy: "#07111F",
  ink: "#0B1728",
  muted: "#63748A",
  gold: "#FDB913",
  amber: "#FFF4D6",
  line: "#D9E1EB",
  good: "#0F7B4F",
  bad: "#B42318",
};

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(value: number | null, currency: string): string {
  if (value === null || !Number.isFinite(value)) return "Unavailable";
  const symbol = currency === "INR" ? "₹" : currency === "USD" ? "$" : `${currency} `;
  return `${symbol}${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function compact(value: number | null, currency: string): string {
  if (value === null || !Number.isFinite(value)) return "Unavailable";
  const symbol = currency === "INR" ? "₹" : "";
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${symbol}${(value / 1e12).toFixed(2)} Tn`;
  if (abs >= 1e9) return `${symbol}${(value / 1e9).toFixed(2)} Bn`;
  if (abs >= 1e7) return `${symbol}${(value / 1e7).toFixed(2)} Cr`;
  return `${symbol}${value.toFixed(2)}`;
}

function pct(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "Unavailable" : `${value.toFixed(2)}%`;
}

/** Inline SVG price chart — no image pipeline, survives HTML→PDF. */
function priceChart(points: Array<{ t: string; c: number | null }>): string {
  const series = points.filter((p): p is { t: string; c: number } => typeof p.c === "number");
  if (series.length < 2) return `<p class="muted">Price history unavailable.</p>`;
  const width = 515;
  const height = 170;
  const pad = 8;
  const values = series.map((p) => p.c);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = (width - pad * 2) / (series.length - 1);
  const coords = series.map((point, index) => {
    const x = pad + index * step;
    const y = pad + (height - pad * 2) * (1 - (point.c - min) / span);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const area = `M ${pad},${height - pad} L ${coords.join(" L ")} L ${(width - pad).toFixed(1)},${height - pad} Z`;
  const line = `M ${coords.join(" L ")}`;
  const first = series[0].c;
  const last = series[series.length - 1].c;
  const rising = last >= first;
  const stroke = rising ? BRAND.good : BRAND.bad;
  return `
  <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="Price history">
    <defs>
      <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${stroke}" stop-opacity="0.22"/>
        <stop offset="100%" stop-color="${stroke}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="${area}" fill="url(#fill)"/>
    <path d="${line}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"/>
    <text x="${pad}" y="12" font-size="9" fill="${BRAND.muted}">High ${max.toFixed(2)}</text>
    <text x="${pad}" y="${height - 2}" font-size="9" fill="${BRAND.muted}">Low ${min.toFixed(2)}</text>
  </svg>`;
}

/** Inline SVG horizontal bar chart for the score pillars. */
function pillarChart(pillars: Array<{ label: string; score: number; max: number }>): string {
  const rows = pillars.map((p) => {
    const ratio = p.max ? Math.max(0, Math.min(1, p.score / p.max)) : 0;
    const width = Math.round(ratio * 300);
    return `
      <tr>
        <td class="pillar-label">${esc(p.label)}</td>
        <td>
          <svg viewBox="0 0 320 16" width="320" height="16" role="img" aria-label="${esc(p.label)}">
            <rect x="0" y="3" width="300" height="10" rx="5" fill="#EEF2F7"/>
            <rect x="0" y="3" width="${width}" height="10" rx="5" fill="${BRAND.gold}"/>
          </svg>
        </td>
        <td class="pillar-score">${p.score}/${p.max}</td>
      </tr>`;
  });
  return `<table class="chart-table">${rows.join("")}</table>`;
}

function metricRow(label: string, value: string, basis: string, note: string): string {
  return `<tr><td>${esc(label)}</td><td class="num">${esc(value)}</td><td>${esc(basis)}</td><td class="muted">${esc(note)}</td></tr>`;
}

function buildHtml(report: FundamentalAnalysis, newsHeadlines: string[], history: Array<{ t: string; c: number | null }>, marketLabel: string): string {
  const currency = report.fairValue.currency;
  const metric = (key: string) => report.metrics[key] ?? null;
  const scoreColor = report.score >= 70 ? BRAND.good : report.score >= 45 ? "#B7791F" : BRAND.bad;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>AnalyzerX — ${esc(report.companyName)}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: ${BRAND.ink}; margin: 0; font-size: 10.5px; line-height: 1.45; }
  h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -0.2px; }
  h2 { font-size: 13px; margin: 20px 0 8px; padding-bottom: 5px; border-bottom: 2px solid ${BRAND.gold}; }
  .cover { background: ${BRAND.navy}; color: #fff; padding: 22px 20px; border-radius: 10px; margin-bottom: 16px; }
  .cover .brand { font-size: 15px; font-weight: 700; letter-spacing: 1.4px; }
  .cover .sub { font-size: 8.5px; color: #F6C453; letter-spacing: 1.1px; margin-top: 2px; text-transform: uppercase; }
  .cover h1 { margin-top: 16px; }
  .cover .meta { color: #C8D5E6; font-size: 9.5px; margin-top: 4px; }
  .score-badge { display: inline-block; margin-top: 12px; padding: 6px 12px; border-radius: 6px; background: ${scoreColor}; color: #fff; font-weight: 700; font-size: 11px; }
  .callout { background: ${BRAND.amber}; border: 1px solid #CDAA55; border-radius: 6px; padding: 10px 12px; margin: 10px 0; }
  .callout .t { font-weight: 700; font-size: 8.5px; letter-spacing: 0.8px; color: #7D5E12; text-transform: uppercase; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0 4px; }
  th { background: ${BRAND.navy}; color: #fff; text-align: left; font-size: 8.5px; padding: 6px 7px; }
  td { padding: 5px 7px; border-bottom: 1px solid ${BRAND.line}; font-size: 9.5px; vertical-align: top; }
  tr:nth-child(even) td { background: #F8FAFC; }
  td.num { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .muted { color: ${BRAND.muted}; }
  .chart-table td { border: 0; padding: 3px 4px; background: none !important; }
  .pillar-label { width: 150px; font-size: 9.5px; }
  .pillar-score { width: 48px; text-align: right; font-variant-numeric: tabular-nums; }
  ul { margin: 4px 0 4px 16px; padding: 0; }
  li { margin-bottom: 3px; }
  .footer { margin-top: 18px; border-top: 1px solid ${BRAND.line}; padding-top: 8px; color: ${BRAND.muted}; font-size: 8px; }
</style>
</head>
<body>
  <div class="cover">
    <div class="brand">ANALYZERX</div>
    <div class="sub">Market Event Intelligence · Institutional Research</div>
    <h1>${esc(report.companyName)} — Research Brief</h1>
    <div class="meta">${esc(report.resolvedSymbol)} · ${esc(report.market.exchange || "—")} · ${esc(marketLabel)} · ${esc(currency)} · generated ${esc(report.asOf.slice(0, 10))}</div>
    <div class="score-badge">Reported-fundamentals score ${report.score}/100 · ${esc(report.institutionalReport.rating)}</div>
  </div>

  <div class="callout">
    <div class="t">What this document is</div>
    Built on-device from free/open sources (Yahoo Finance reported statements and quotes). Missing evidence stays <b>Unavailable</b>; derived values state their basis. This is research context, not investment advice or a guaranteed forecast.
  </div>

  <h2>1 · Plain-English summary</h2>
  <p>${esc(report.stockAnalysis.conclusion)}</p>

  <h2>2 · Score composition</h2>
  ${pillarChart(report.institutionalReport.scoreWeights)}
  <table>
    <tr><th>Pillar</th><th>How it is calculated</th></tr>
    ${report.institutionalReport.scoreWeights.map((p) => `<tr><td>${esc(p.label)}</td><td class="muted">${esc(p.calculation)}</td></tr>`).join("")}
  </table>

  <h2>3 · Reported financial metrics</h2>
  <table>
    <tr><th>Metric</th><th>Value</th><th>Basis</th><th>Note</th></tr>
    ${metricRow("Revenue growth (YoY)", pct(metric("revenueGrowth")?.value ?? null), metric("revenueGrowth")?.basis ?? "unavailable", metric("revenueGrowth")?.source ?? "Unavailable")}
    ${metricRow("Diluted EPS", metric("earningsPerShare")?.value?.toFixed(2) ?? "Unavailable", metric("earningsPerShare")?.basis ?? "unavailable", metric("earningsPerShare")?.period ?? "Unavailable")}
    ${metricRow("Operating cash flow", compact(metric("operatingCashFlow")?.value ?? null, currency), metric("operatingCashFlow")?.basis ?? "unavailable", metric("operatingCashFlow")?.period ?? "Unavailable")}
    ${metricRow("Free cash flow", compact(metric("freeCashFlow")?.value ?? null, currency), metric("freeCashFlow")?.basis ?? "unavailable", metric("freeCashFlow")?.period ?? "Unavailable")}
    ${metricRow("P/E", metric("pe") ? `${metric("pe")!.value.toFixed(2)}×` : "Unavailable", metric("pe")?.basis ?? "unavailable", metric("pe")?.source ?? "Unavailable")}
    ${metricRow("Net margin", pct(metric("profitMargin")?.value ?? null), metric("profitMargin")?.basis ?? "unavailable", metric("profitMargin")?.source ?? "Unavailable")}
    ${metricRow("Debt / equity", metric("debtToEquity") ? `${metric("debtToEquity")!.value.toFixed(2)}×` : "Unavailable", metric("debtToEquity")?.basis ?? "unavailable", metric("debtToEquity")?.source ?? "Unavailable")}
  </table>

  <h2>4 · Price history</h2>
  ${priceChart(history)}

  <h2>5 · Valuation anchors</h2>
  <table>
    <tr><th>Anchor</th><th>Value</th><th>Basis</th></tr>
    <tr><td>Current price</td><td class="num">${esc(money(report.fairValue.currentPrice, currency))}</td><td>Reported market observation</td></tr>
    <tr><td>Low relative anchor</td><td class="num">${esc(money(report.fairValue.lowValue, currency))}</td><td>${esc(report.fairValue.basis)}</td></tr>
    <tr><td>High relative anchor</td><td class="num">${esc(money(report.fairValue.highValue, currency))}</td><td>${esc(report.fairValue.basis)}</td></tr>
    <tr><td>DCF intrinsic value</td><td class="num">${esc(money(report.fairValue.dcf.valuePerShare, currency))}</td><td>${esc(report.fairValue.dcf.basis)} — ${esc(report.fairValue.dcf.note)}</td></tr>
  </table>

  <h2>6 · Risks and coverage</h2>
  ${report.risks.length ? `<ul>${report.risks.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : `<p class="muted">No rule-based risk flags were triggered by the reported fundamentals.</p>`}
  <table>
    <tr><th>Coverage area</th><th>Status</th><th>Note</th></tr>
    ${report.coverage.sections.map((s) => `<tr><td>${esc(s.label)}</td><td>${esc(s.status)}</td><td class="muted">${esc(s.note)}</td></tr>`).join("")}
  </table>

  <h2>7 · Recent headlines</h2>
  ${newsHeadlines.length ? `<ul>${newsHeadlines.slice(0, 8).map((h) => `<li>${esc(h)}</li>`).join("")}</ul>` : `<p class="muted">No source-backed headlines matched at export time.</p>`}

  <h2>8 · Method, sources and disclaimer</h2>
  <p class="muted">${report.sources.map((s) => `${esc(s.name)} (${esc(s.status)})`).join("; ") || "Unavailable"}.</p>
  <p>This report is analytical research, not investment advice, a solicitation, or a buy/sell/hold instruction. It is not a guaranteed forecast. Verify every decision-relevant figure against the latest official filings, company disclosures, exchange records, and licensed market-data sources.</p>
  <div class="footer">AnalyzerX 3.24.0 · generated on-device at ${esc(nowIso())} · scores are rule-based and evidence-gated.</div>
</body>
</html>`;
}

export type PdfExport = { uri: string; html: string; fileName: string; shared: boolean };

/** Build and print the research PDF for a symbol, then optionally share it. */
export async function exportResearchPdf(symbol: string, marketId: MarketId, options: { share?: boolean } = {}): Promise<PdfExport> {
  const [report, history, news] = await Promise.all([
    fundamentals(symbol, marketId),
    priceHistory(symbol, "1y", "1d", marketId).catch(() => ({ points: [] as Array<{ t: string; c: number | null }> })),
    stockNews(symbol, 10, marketId).catch(() => ({ articles: [] as Array<{ headline: string }> })),
  ]);
  const html = buildHtml(report, news.articles.map((a) => a.headline), history.points, report.market.country);
  const fileName = `AnalyzerX-${report.resolvedSymbol}-3.24.0.pdf`;
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  let shared = false;
  if (options.share !== false) {
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: fileName, UTI: "com.adobe.pdf" });
        shared = true;
      }
    } catch {
      shared = false;
    }
  }
  return { uri, html, fileName, shared };
}

export { buildHtml as buildResearchHtml };
