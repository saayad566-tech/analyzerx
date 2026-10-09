import type { FundamentalAnalysis } from "./fundamental-analysis";
import type { ExtractedNews } from "./news-tracker";
import { buildInstitutionalReportModules } from "./institutional-report-modules";

function basisLabel(value: string) {
  return value === "reported" ? "Reported" : value === "derived" ? "Derived" : value === "estimated" ? "Estimated" : value === "not-applicable" ? "Not applicable" : "Unavailable";
}

function metricRow(label: string, metric?: FundamentalAnalysis["metrics"][string]) {
  if (!metric) return `| ${label} | Unavailable | Unavailable | No normalized value returned by the connected sources. |`;
  return `| ${label} | ${Number.isFinite(metric.value) ? metric.value.toFixed(2) : "Unavailable"} | ${basisLabel(metric.basis)} | ${metric.source} |`;
}

export function fundamentalAnalysisToMarkdown(report: FundamentalAnalysis, news: ExtractedNews[] = []): string {
  const money = (value: number) => `${report.fairValue.currency === "INR" ? "₹" : `${report.fairValue.currency} `}${value.toFixed(2)}`;
  const fairValue = report.fairValue.lowValue !== null && report.fairValue.highValue !== null
    ? `${money(report.fairValue.lowValue)} – ${money(report.fairValue.highValue)}${report.fairValue.baseValue !== null ? ` (base ${money(report.fairValue.baseValue)})` : ""}`
    : "Unavailable without a verified valuation anchor";
  const dcf = report.fairValue.dcf.valuePerShare === null ? "Unavailable without positive free cash flow and shares outstanding" : `${money(report.fairValue.dcf.valuePerShare)} (${basisLabel(report.fairValue.dcf.basis)})`;
  const scenarioRows = report.institutionalReport.scenarios.map((scenario) => `| ${scenario.label} | ${scenario.fairValue === null ? "Unavailable" : money(scenario.fairValue)} | ${scenario.probability}% | ${scenario.assumptions.join(" ")} |`).join("\n");
  const weightRows = report.institutionalReport.scoreWeights.map((item) => `| ${item.label} | ${item.score}/${item.max} | ${item.calculation} |`).join("\n");
  const sourceRows = report.sources.map((source) => `| ${source.tier} | ${source.name} | ${source.status} | ${source.note} |`).join("\n");
  const coverageRows = report.coverage.sections.map((section) => `| ${section.label} | ${section.score}/${section.max} | ${section.status} | ${basisLabel(section.basis)} | ${section.note} |`).join("\n");
  const reasoningList = (items: string[]) => items.length ? items.map((item) => `- ${item}`).join("\n") : "- None recorded.";
  const quantitativeRows = Object.values(report.quantitativeMetrics).map((metric) => `| ${metric.label} | ${metric.value === null ? "Unavailable" : metric.value.toFixed(2)} | ${metric.unit} | ${basisLabel(metric.basis)} | ${metric.formula} | ${metric.source}${metric.note ? ` — ${metric.note}` : ""} |`).join("\n");
  const thesis = report.multibaggerThesis;
  const thesisScoreRows = thesis.scoreBreakdown.map((item) => `| ${item.label} | ${item.score}/${item.max} | ${basisLabel(item.basis)} | ${item.explanation} |`).join("\n");
  const thesisScenarioRows = thesis.scenarios.map((scenario) => `| ${scenario.label} | ${scenario.valueMultiple === null ? "Unavailable" : `${scenario.valueMultiple.toFixed(1)}×`} | ${scenario.expectedCagr === null ? "Unavailable" : `${scenario.expectedCagr.toFixed(1)}%`} | ${scenario.assumptions.join(" ")} |`).join("\n");
  const trendRows = (points: FundamentalAnalysis["history"]["revenue"]) => points.length ? points.map((point) => `| ${point.period} | ${point.value.toFixed(2)} | ${basisLabel(point.basis)} | ${point.source} |`).join("\n") : "| — | Unavailable | Unavailable | No source-backed historical period returned. |";
  const metricRows = [
    ["Revenue growth", report.metrics.revenueGrowth], ["Earnings growth", report.metrics.earningsGrowth], ["EPS", report.metrics.eps], ["ROE", report.metrics.roe], ["ROA / ROCE proxy", report.metrics.roa], ["Net margin", report.metrics.profitMargin], ["Operating cash flow", report.metrics.operatingCashFlow], ["Free cash flow", report.metrics.freeCashFlow], ["CFO / net income", report.metrics.cashConversion], ["Debt / equity", report.metrics.debtToEquity], ["Interest coverage", report.metrics.interestCoverage], ["Current ratio", report.metrics.currentRatio], ["Quick ratio", report.metrics.quickRatio], ["P/E", report.metrics.pe], ["P/B", report.metrics.priceToBook], ["Promoter holding", report.metrics.promoterHolding], ["Promoter pledge", report.metrics.promoterPledge],
  ].map(([label, metric]) => metricRow(label as string, metric as FundamentalAnalysis["metrics"][string] | undefined)).join("\n");
  const list = (items: string[]) => items.length ? items.map((item) => `- ${item}`).join("\n") : "- None established from available evidence.";
  const newsRows = news.length ? news.slice(0, 12).map((item) => `| ${item.published_at} | ${item.headline.replace(/\|/g, "—")} | ${item.sentiment} | ${item.impact_score}/100 | ${item.source} | [Original source](${item.url}) |`).join("\n") : "| — | No verified selected-symbol articles returned at export time. | — | — | — | — |";
  return `# Institutional Equity Research Report — ${report.companyName} (${report.resolvedSymbol})

**Requested symbol:** ${report.requestedSymbol}  
**Market:** ${report.market.country} · ${report.market.exchange} · ${report.market.currency}  
**Coverage posture:** ${report.market.primaryFocus ? "India-first official-market workflow" : "Global market fallback workflow; verify local filings and currency"}  
**Analysis timestamp:** ${report.asOf}  
**Primary score:** Legacy Institutional Five-Pillar Score ${report.score}/100 · ${report.institutionalReport.rating} · ${report.institutionalReport.investmentView} · Confidence ${report.institutionalReport.confidenceScore}/100  
**Secondary lens:** Multibagger Thesis Score ${thesis.score}/100 · ${thesis.label} · confidence ${thesis.confidence}

> The legacy five-pillar institutional score is the report’s primary score. The multibagger thesis is a separate, secondary long-horizon research lens and never replaces the primary score. This is source-aware research, not financial advice. Values that are not directly verified are labeled Estimated, Derived, or Unavailable. No future return is guaranteed.

## Coverage & Data Quality

**Coverage score:** ${report.coverage.score}/100 · **${report.coverage.label} coverage** · ${report.coverage.verified} verified sections · ${report.coverage.estimated} estimated sections · ${report.coverage.unavailable} unavailable sections.

| Section | Coverage | Status | Basis | What the reader should know |
|---|---:|---|---|---|
${coverageRows}

## Stock-Analysis Deep Dive

### Company Profile

**Business summary:** ${report.stockAnalysis.profile.businessSummary}

**Current operating scope:** ${report.stockAnalysis.profile.currentScope}

**Future-plan evidence:** ${report.stockAnalysis.profile.futurePlans}

**Sector:** ${report.stockAnalysis.profile.sector}  
**Exchange / country:** ${report.stockAnalysis.profile.exchange} / ${report.stockAnalysis.profile.country}  
**Website:** ${report.stockAnalysis.profile.website}  
**Profile basis:** ${basisLabel(report.stockAnalysis.profile.basis)}

### Technical Context

| Signal | Value |
|---|---:|
| Trend | ${report.stockAnalysis.technical.trend} |
| Current price | ${report.stockAnalysis.technical.currentPrice === null ? "Unavailable" : money(report.stockAnalysis.technical.currentPrice)} |
| SMA 20 | ${report.stockAnalysis.technical.sma20 === null ? "Unavailable" : money(report.stockAnalysis.technical.sma20)} |
| SMA 50 | ${report.stockAnalysis.technical.sma50 === null ? "Unavailable" : money(report.stockAnalysis.technical.sma50)} |
| RSI 14 | ${report.stockAnalysis.technical.rsi14 === null ? "Unavailable" : report.stockAnalysis.technical.rsi14.toFixed(1)} |
| Available high / low range | ${report.stockAnalysis.technical.low52 === null || report.stockAnalysis.technical.high52 === null ? "Unavailable" : `${money(report.stockAnalysis.technical.low52)} – ${money(report.stockAnalysis.technical.high52)}`} |
| One-year change | ${report.stockAnalysis.technical.oneYearChangePct === null ? "Unavailable" : `${report.stockAnalysis.technical.oneYearChangePct.toFixed(1)}%`} |

${report.stockAnalysis.technical.note}

### Ownership and Filings

**Ownership:** ${report.stockAnalysis.ownership.status}. Promoter holding ${report.stockAnalysis.ownership.promoterHolding === null ? "unavailable" : `${report.stockAnalysis.ownership.promoterHolding.toFixed(2)}%`}; promoter pledge ${report.stockAnalysis.ownership.promoterPledge === null ? "unavailable" : `${report.stockAnalysis.ownership.promoterPledge.toFixed(2)}%`}.

**Ownership note:** ${report.stockAnalysis.ownership.note}

**Filings status:** ${report.stockAnalysis.filings.status}. ${report.stockAnalysis.filings.note}  
**Next filing checks:** ${report.stockAnalysis.filings.nextCheck}

### Filing-derived evidence checks

| Evidence area | Status | Extracted passage | Source / period | Reader guidance |
|---|---|---|---|---|
| TAM / addressable market | ${report.filingEvidence.tam.status} | ${report.filingEvidence.tam.value ?? "Unavailable"} | ${report.filingEvidence.tam.sourceUrl ?? "Unavailable"} · ${report.filingEvidence.tam.period ?? "Undated"} | ${report.filingEvidence.tam.note} |
| Customer concentration | ${report.filingEvidence.customerConcentration.status} | ${report.filingEvidence.customerConcentration.value ?? "Unavailable"} | ${report.filingEvidence.customerConcentration.sourceUrl ?? "Unavailable"} · ${report.filingEvidence.customerConcentration.period ?? "Undated"} | ${report.filingEvidence.customerConcentration.note} |
| Management guidance | ${report.filingEvidence.managementGuidance.status} | ${report.filingEvidence.managementGuidance.value ?? "Unavailable"} | ${report.filingEvidence.managementGuidance.sourceUrl ?? "Unavailable"} · ${report.filingEvidence.managementGuidance.period ?? "Undated"} | ${report.filingEvidence.managementGuidance.note} |

**Evidence policy:** ${report.filingEvidence.sourcePolicy}

### Valuation Context and Conclusion

**P/E:** ${report.stockAnalysis.valuation.pe.toFixed(2)}×  
**P/B:** ${report.stockAnalysis.valuation.priceToBook.toFixed(2)}×  
**Current versus fair-value anchor:** ${report.stockAnalysis.valuation.currentVsFairValuePct === null ? "Unavailable" : `${report.stockAnalysis.valuation.currentVsFairValuePct.toFixed(1)}%`}

${report.stockAnalysis.valuation.note}

> **Deep-analysis conclusion:** ${report.stockAnalysis.conclusion}

## Executive Summary

**Fundamental score:** ${report.score}/100  
**Rating:** ${report.institutionalReport.rating}  
**Investment view:** ${report.institutionalReport.investmentView}  
**Fair-value range:** ${fairValue}  
**Current versus fair-value anchor:** ${report.institutionalReport.currentVsFairValuePct === null ? "Unavailable" : `${report.institutionalReport.currentVsFairValuePct.toFixed(1)}%`}  
**DCF intrinsic value:** ${dcf}  
**Probability-weighted scenario value:** ${report.institutionalReport.probabilityWeightedFairValue === null ? "Unavailable without complete scenario anchors" : money(report.institutionalReport.probabilityWeightedFairValue)}

**Valuation anchor:** ${report.fairValue.note}
**Estimated upside / downside:** ${report.institutionalReport.upsideDownsidePct === null ? "Unavailable" : `${report.institutionalReport.upsideDownsidePct.toFixed(1)}%`}
**12–24 month outlook:** ${report.institutionalReport.outlook12to24m}

### Valuation Chart Data

| Anchor | Value | Basis | Interpretation |
|---|---:|---|---|
| Current price | ${report.fairValue.currentPrice === null ? "Unavailable" : money(report.fairValue.currentPrice)} | ${report.fairValue.currentPrice === null ? "Unavailable" : "reported/verified"} | Latest market-price observation |
| Low relative anchor | ${report.fairValue.lowValue === null ? "Unavailable" : money(report.fairValue.lowValue)} | ${basisLabel(report.fairValue.basis)} | Conservative relative valuation anchor |
| Base relative anchor | ${report.fairValue.baseValue === null ? "Unavailable" : money(report.fairValue.baseValue)} | ${basisLabel(report.fairValue.basis)} | Central relative valuation anchor |
| High relative anchor | ${report.fairValue.highValue === null ? "Unavailable" : money(report.fairValue.highValue)} | ${basisLabel(report.fairValue.basis)} | Optimistic relative valuation anchor |

The interactive mobile chart lets readers inspect each anchor separately. These anchors are not guaranteed price targets and must not be read as intrinsic value unless the report explicitly identifies a verified DCF basis.

## Secondary Lens — Multibagger Thesis Engine

**Potential Multibagger Score:** ${thesis.score}/100 · **Classification:** ${thesis.label} · **Confidence:** ${thesis.confidence}

> Beginner explanation: a multibagger is not identified by a cheap P/E or a bullish sentence. The engine asks whether the business can grow substantially, reinvest capital, convert earnings into cash, survive bad cycles, and remain reasonably valued. Missing evidence lowers confidence instead of being silently guessed.

**Summary:** ${thesis.beginnerSummary}

### Score Breakdown

| Component | Score | Evidence basis | Interpretation |
|---|---:|---|---|
${thesisScoreRows}

### WHY — What could create durable upside
${reasoningList(thesis.why)}

### WHAT — Growth engines and catalysts
${reasoningList(thesis.what)}

### WHEN — Catalyst and reassessment timing
${reasoningList(thesis.when)}

### HOW — Multibagger mathematics
${reasoningList(thesis.how)}

### Bear / Base / Bull pathway

| Scenario | Value multiple | Expected CAGR | Assumptions |
|---|---:|---:|---|
${thesisScenarioRows}

### Probability and invalidation

**Probability of 2×:** ${thesis.probabilities.twoX}% · **5×:** ${thesis.probabilities.fiveX}% · **10×:** ${thesis.probabilities.tenX}%

**Top thesis-breakers:**
${reasoningList(thesis.invalidation)}

**Hard rejection flags:**
${reasoningList(thesis.hardRejectionFlags)}

**Evidence gaps:**
${reasoningList(thesis.evidenceGaps)}

**Grounded research fallback:** ${thesis.researchFallback.policy} Status: **${thesis.researchFallback.status}**.

## Business Model, Plans, and Competitive Position

${report.qualitative.businessModel}

**Current operating scope:** ${report.qualitative.currentScope}

**Future plans:** ${report.qualitative.futurePlans}

**Moat assessment:** ${report.qualitative.moat}

**Management and governance:** ${report.qualitative.management}

Company-specific future plans, capacity expansion, products, contracts, partnerships, M&A, and regulatory developments must be confirmed from dated exchange filings, annual reports, investor presentations, and official company disclosures. The current connected data sources do not create unsupported claims when those documents are unavailable.

## Financial Analysis

| Metric | Value | Basis | Interpretation / note |
|---|---:|---|---|
${metricRows}

The report uses available historical trend data where supplied. It does not substitute news headlines for financial figures, and it keeps GAAP/as-reported versus estimated or derived inputs visibly separated.

### Chart Data — Revenue

| Period | Value | Basis | Source |
|---|---:|---|---|
${trendRows(report.history.revenue)}

### Chart Data — EPS

| Period | Value | Basis | Source |
|---|---:|---|---|
${trendRows(report.history.eps)}

### Chart Data — Operating Cash Flow

| Period | Value | Basis | Source |
|---|---:|---|---|
${trendRows(report.history.cashFlow)}

## Expanded Quantitative Library

| Metric | Value | Unit | Basis | Formula | Source / note |
|---|---:|---|---|---|---|
${quantitativeRows}

Metrics are computed only when the required inputs are present. Missing inputs remain Unavailable; no accounting value is invented to fill a quantitative ratio.

## Institutional Score Calculation

| Component | Score | Calculation |
|---|---:|---|
${weightRows}

**Total:** ${report.score}/100.

## Final Investment Intelligence

**Current price:** ${report.fairValue.currentPrice === null ? "Unavailable" : money(report.fairValue.currentPrice)}  
**Estimated fair value:** ${report.fairValue.baseValue === null ? "Unavailable" : money(report.fairValue.baseValue)}  
**Probability-weighted scenario value:** ${report.institutionalReport.probabilityWeightedFairValue === null ? "Unavailable" : money(report.institutionalReport.probabilityWeightedFairValue)}  
**Upside / downside:** ${report.institutionalReport.upsideDownsidePct === null ? "Unavailable" : `${report.institutionalReport.upsideDownsidePct.toFixed(1)}%`}  
**12–24 month outlook:** ${report.institutionalReport.outlook12to24m}  
**Data confidence:** ${report.institutionalReport.confidenceScore}/100  

### Top Strengths
${list(report.institutionalReport.positives)}

### Top Weaknesses
${list(report.institutionalReport.weaknesses)}

### Bullish Thesis Conditions
${list(report.institutionalReport.thesisBullishWhen)}

### Thesis Invalidation Conditions
${list(report.institutionalReport.thesisInvalidation)}

## Catalysts and Future Outlook

${list(report.institutionalReport.catalysts)}

These are conditional research hypotheses, not guarantees. Each dated catalyst should be re-checked against the latest official filing or company disclosure before action.

## Risks, Red Flags, and Bear Case

${list(report.institutionalReport.redFlags.length ? report.institutionalReport.redFlags : report.risks)}

## Bull / Base / Bear Scenarios

| Scenario | Fair value | Probability | Assumptions |
|---|---:|---:|---|
${scenarioRows}

## Strongest Positives

${list(report.institutionalReport.positives)}

## Historical Trends

${report.history.revenue.length || report.history.eps.length || report.history.cashFlow.length ? `Revenue observations: ${report.history.revenue.length}; EPS observations: ${report.history.eps.length}; cash-flow observations: ${report.history.cashFlow.length}.` : "Historical trend observations are unavailable from the current response."}

## Research Logic and Audit Trail

### Methodology
${reasoningList(report.researchLogic.methodology)}

### Evidence Used
${reasoningList(report.researchLogic.evidenceUsed)}

### Evidence Gaps
${reasoningList(report.researchLogic.evidenceGaps)}

### Contradictions and Cross-Checks
${reasoningList(report.researchLogic.contradictions)}

### Decision Rules
${reasoningList(report.researchLogic.decisionRules)}

### Next Research Questions
${reasoningList(report.researchLogic.nextResearchQuestions)}

## Verified News Scan

The following selected-symbol articles were returned by the Market Event Intelligence tracker at export time. Headlines are deduplicated and retain source, publication timestamp, impact score, sentiment, and an original-source link.

| Published | Headline | Sentiment | Impact | Source | Link |
|---|---|---|---:|---|---|
${newsRows}

## Data Freshness and Source Hierarchy

${report.institutionalReport.freshness}

1. Official exchange filings, annual reports, quarterly results, investor presentations, and regulatory disclosures.
2. Structured market-data providers and read-only MCP sources.
3. Robots-compliant public financial pages and chart metadata.
4. Sector baselines and derived estimates, explicitly labeled.

| Tier | Source | Status | Note |
|---|---|---|---|
${sourceRows}

## Key Risks from the Analysis Engine

${list(report.risks)}

## Research Disclaimer

This report is an analytical output based on the connected data returned at the stated timestamp. It is not investment advice, a solicitation, or a guaranteed forecast. Verify all decision-relevant values against the latest official filings and licensed market-data sources.
`;
}

export function reportFileName(report: FundamentalAnalysis, extension: "md" | "txt" | "pdf" = "md") {
  return `${report.resolvedSymbol.toLowerCase()}-institutional-research.${extension}`;
}

export function reportsManifest(reports: FundamentalAnalysis[]) {
  return reports.map((report) => ({ symbol: report.resolvedSymbol, companyName: report.companyName, score: report.score, rating: report.institutionalReport.rating, multibaggerScore: report.multibaggerThesis.score, multibaggerLabel: report.multibaggerThesis.label, fileName: reportFileName(report) }));
}


import PDFDocument from "pdfkit";

function pdfText(value: unknown) {
  return String(value ?? "Unavailable").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
}

function pdfMoney(report: FundamentalAnalysis, value: number | null) {
  if (value === null || !Number.isFinite(value)) return "Unavailable";
  return `${report.fairValue.currency === "INR" ? "₹" : `${report.fairValue.currency} `}${value.toFixed(2)}`;
}

function addPdfHeader(doc: PDFKit.PDFDocument, report: FundamentalAnalysis, pageLabel: string) {
  const cursor = { x: doc.x, y: doc.y };
  doc.save().fillColor("#07111F").rect(0, 0, 595.28, 44).fill();
  doc.fillColor("#FDB913").font("Helvetica-Bold").fontSize(10).text("ANALYZERX", 40, 14);
  doc.fillColor("#F6C453").font("Helvetica").fontSize(7.5).text("MARKET EVENT INTELLIGENCE", 40, 27);
  doc.fillColor("#C8D5E6").font("Helvetica-Bold").fontSize(8).text(pageLabel, 430, 16, { width: 125, align: "right" });
  doc.restore();
  doc.save().strokeColor("#FDB913").lineWidth(1.2).moveTo(40, 752).lineTo(555, 752).stroke().restore();
  doc.fillColor("#63748A").font("Helvetica").fontSize(7.5).text(`${pdfText(report.resolvedSymbol)} · Source-aware research · ${pdfText(report.asOf)} · Prepared by AnalyzerX`, 40, 762, { width: 515, align: "center" });
  doc.x = cursor.x;
  doc.y = cursor.y;
}

function sectionHeading(doc: PDFKit.PDFDocument, title: string, subtitle?: string) {
  doc.moveDown(0.8).fillColor("#0B1728").font("Helvetica-Bold").fontSize(15).text(title);
  doc.save().strokeColor("#FDB913").lineWidth(2).moveTo(doc.x, doc.y + 5).lineTo(doc.x + 42, doc.y + 5).stroke().restore();
  if (subtitle) doc.moveDown(0.35).fillColor("#63748A").font("Helvetica").fontSize(8.5).text(subtitle, { width: 515 });
  doc.moveDown(0.45);
}

function card(doc: PDFKit.PDFDocument, x: number, y: number, width: number, height: number, fill = "#F6F8FB") {
  doc.save().roundedRect(x, y, width, height, 9).fillColor(fill).fill().lineWidth(0.6).strokeColor("#D9E1EB").stroke().restore();
}

function scoreCard(doc: PDFKit.PDFDocument, x: number, y: number, title: string, score: number, max: number, note: string) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, score / max)) : 0;
  card(doc, x, y, 158, 92, score >= max * 0.7 ? "#FFF8E8" : "#F6F8FB");
  doc.fillColor("#718096").font("Helvetica-Bold").fontSize(8).text(title.toUpperCase(), x + 12, y + 11, { width: 134 });
  doc.fillColor("#0B1728").font("Helvetica-Bold").fontSize(22).text(`${Math.round(score)}`, x + 12, y + 29);
  doc.fillColor("#718096").font("Helvetica").fontSize(9).text(`/ ${max}`, x + 55, y + 40);
  doc.save().fillColor("#E3E9F1").roundedRect(x + 12, y + 61, 134, 5, 2.5).fill();
  doc.fillColor(ratio >= 0.7 ? "#D89A00" : "#718096").roundedRect(x + 12, y + 61, 134 * ratio, 5, 2.5).fill().restore();
  doc.fillColor("#63748A").font("Helvetica").fontSize(7.2).text(pdfText(note), x + 12, y + 72, { width: 134, height: 13, ellipsis: true });
}

function barChart(doc: PDFKit.PDFDocument, x: number, y: number, width: number, title: string, points: Array<{ period: string; value: number }>) {
  doc.fillColor("#0B1728").font("Helvetica-Bold").fontSize(9).text(title, x, y);
  const chartY = y + 18;
  const chartH = 75;
  const max = Math.max(...points.map((point) => Math.abs(point.value)), 1);
  const barWidth = points.length ? Math.max(12, Math.min(34, (width - 20) / points.length - 8)) : 20;
  points.slice(-8).forEach((point, index) => {
    const height = Math.max(3, Math.abs(point.value) / max * chartH);
    const barX = x + 10 + index * (barWidth + 8);
    doc.fillColor(point.value >= 0 ? "#4FD1C5" : "#FB7185").roundedRect(barX, chartY + chartH - height, barWidth, height, 3).fill();
    doc.fillColor("#63748A").font("Helvetica").fontSize(6.5).text(pdfText(point.period).slice(0, 8), barX - 4, chartY + chartH + 5, { width: barWidth + 8, align: "center" });
  });
}

const PDF_METRIC_GUIDE: Array<{ key: string; label: string; meaning: string; best: string; unit: string }> = [
  { key: "pe", label: "P/E ratio", meaning: "Price divided by earnings per share; it shows how much the market pays for one unit of annual profit.", best: "Lower is not automatically better: compare it with growth, quality, peers, and the sector reference.", unit: "×" },
  { key: "priceToBook", label: "P/B ratio", meaning: "Share price divided by book value per share; it compares market value with accounting net assets.", best: "Useful for asset-heavy businesses; interpret with ROE and the sector reference.", unit: "×" },
  { key: "roe", label: "ROE", meaning: "Return on equity; profit generated for each unit of shareholder capital.", best: "Higher and stable can indicate efficient capital use, but leverage can inflate it.", unit: "%" },
  { key: "debtToEquity", label: "Debt / equity", meaning: "Debt relative to shareholder equity; a simple view of financial leverage.", best: "Lower is usually safer, but acceptable leverage depends on the industry and cash-flow stability.", unit: "×" },
  { key: "profitMargin", label: "Net margin", meaning: "The share of revenue left as net profit after operating costs, interest, and tax.", best: "Stable or improving margins are generally stronger than a single high reading.", unit: "%" },
  { key: "revenueGrowth", label: "Revenue growth", meaning: "The rate at which reported sales are increasing over the stated period.", best: "Quality growth should be supported by cash conversion, not only accounting earnings.", unit: "%" },
  { key: "operatingCashFlow", label: "Operating cash flow", meaning: "Cash generated by the company’s core operations.", best: "Positive, recurring cash generation that broadly supports profit is a quality signal.", unit: "" },
  { key: "freeCashFlow", label: "Free cash flow", meaning: "Cash left after operating needs and capital expenditure.", best: "Positive FCF creates flexibility for debt reduction, reinvestment, or distributions.", unit: "" },
];

const PDF_SECTOR_REFERENCES: Record<string, { pe: number; priceToBook: number; roe: number; debtToEquity: number; profitMargin: number; revenueGrowth: number }> = {
  "Indian equities": { pe: 22, priceToBook: 3, roe: 12, debtToEquity: 0.8, profitMargin: 8, revenueGrowth: 10 },
  "Capital goods": { pe: 24, priceToBook: 3.2, roe: 14, debtToEquity: 0.6, profitMargin: 9, revenueGrowth: 12 },
  "Financials": { pe: 18, priceToBook: 2.2, roe: 13, debtToEquity: 5, profitMargin: 18, revenueGrowth: 12 },
  "IT services": { pe: 25, priceToBook: 5, roe: 18, debtToEquity: 0.2, profitMargin: 18, revenueGrowth: 11 },
  "Renewable energy": { pe: 28, priceToBook: 3.5, roe: 11, debtToEquity: 1, profitMargin: 8, revenueGrowth: 15 },
};

function pdfMetricReference(report: FundamentalAnalysis, key: string) {
  const sector = report.stockAnalysis.profile.sector;
  const baseline = PDF_SECTOR_REFERENCES[sector] ?? PDF_SECTOR_REFERENCES["Indian equities"];
  const value = key === "pe" ? baseline.pe : key === "priceToBook" ? baseline.priceToBook : key === "roe" ? baseline.roe : key === "debtToEquity" ? baseline.debtToEquity : key === "profitMargin" ? baseline.profitMargin : key === "revenueGrowth" ? baseline.revenueGrowth : null;
  return value === undefined || value === null ? "Sector reference unavailable" : `Sector reference ≈ ${value}${key === "roe" || key === "profitMargin" || key === "revenueGrowth" ? "%" : "×"}`;
}

export async function legacyFundamentalAnalysisToPdf(report: FundamentalAnalysis, news: ExtractedNews[] = [], marketLabel?: string): Promise<Buffer> {
  const thesis = report.multibaggerThesis;
  const modules = buildInstitutionalReportModules(report, news);
  const doc = new PDFDocument({ size: "A4", margins: { top: 58, bottom: 48, left: 40, right: 40 }, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  let page = 1;
  doc.on("pageAdded", () => { page += 1; addPdfHeader(doc, report, `RESEARCH BRIEF · ${page}`); doc.x = 40; doc.y = 58; });
  addPdfHeader(doc, report, "RESEARCH BRIEF · 1");
  doc.save().fillColor("#FDB913").roundedRect(40, 78, 8, 94, 4).fill().restore();
  doc.fillColor("#0B1728").font("Helvetica-Bold").fontSize(25).text(pdfText(report.companyName), 62, 82, { width: 360 });
  doc.fillColor("#63748A").font("Helvetica").fontSize(11).text(`${pdfText(report.resolvedSymbol)} · ${pdfText(report.market.exchange)} · ${pdfText(marketLabel ?? report.market.country)} · ${pdfText(report.market.currency)}`, 62, 120);
  doc.fillColor("#FDB913").roundedRect(425, 78, 130, 90, 12).fill();
  doc.fillColor("#07111F").font("Helvetica-Bold").fontSize(34).text(`${Math.round(report.score)}`, 438, 93, { width: 104, align: "center" });
  doc.fontSize(9).text("INSTITUTIONAL SCORE / 100", 438, 139, { width: 104, align: "center" });
  doc.fillColor("#63748A").font("Helvetica").fontSize(9).text(pdfText(report.stockAnalysis.profile.businessSummary), 62, 160, { width: 348, height: 47, ellipsis: true });
  doc.moveDown(4);
  sectionHeading(doc, "Executive brief", "A compact first page for decision-makers; all unavailable values remain explicitly unavailable.");
  const cards = report.institutionalReport.scoreWeights.slice(0, 6);
  cards.forEach((item, index) => scoreCard(doc, 40 + (index % 3) * 172, 222 + Math.floor(index / 3) * 108, item.label, item.score, item.max, item.calculation));
  doc.y = 445;
  card(doc, 40, doc.y, 515, 108, "#0F2035");
  doc.fillColor("#FDB913").font("Helvetica-Bold").fontSize(9).text("VIEW", 56, doc.y + 16);
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(15).text(pdfText(report.institutionalReport.investmentView), 56, doc.y + 34, { width: 300 });
  doc.fillColor("#B4C2D4").font("Helvetica").fontSize(8.5).text(`PRIMARY · Institutional Five-Pillar Score: ${report.score}/100 · Rating: ${pdfText(report.institutionalReport.rating)} · Confidence: ${report.institutionalReport.confidenceScore}/100`, 56, doc.y + 60);
  doc.fillColor("#B4C2D4").fontSize(8).text(`Fair-value range: ${pdfMoney(report, report.fairValue.lowValue)} – ${pdfMoney(report, report.fairValue.highValue)} · DCF: ${pdfMoney(report, report.fairValue.dcf.valuePerShare)}`, 56, doc.y + 79, { width: 455 });
  doc.fillColor("#F4B860").font("Helvetica-Bold").fontSize(8).text(`SECONDARY · Multibagger Thesis: ${thesis.score}/100 · ${pdfText(thesis.label)} · Confidence: ${pdfText(thesis.confidence)}`, 56, doc.y + 96);
  sectionHeading(doc, "Coverage and filing evidence", "The legacy institutional five-pillar score remains primary; the secondary thesis lens is shown separately. Filing-derived evidence is never estimated when the official passage is missing.");
  const filingItems = [report.filingEvidence.tam, report.filingEvidence.customerConcentration, report.filingEvidence.managementGuidance];
  filingItems.forEach((item, index) => { const y = doc.y + 18 + index * 28; doc.fillColor("#0B1728").font("Helvetica-Bold").fontSize(8).text(pdfText(["TAM / addressable market", "Customer concentration", "Management guidance"][index]), 40, y, { width: 125 }); doc.fillColor(item.status === "verified" ? "#149B8A" : item.status === "partial" ? "#D28A00" : "#8B98A8").font("Helvetica-Bold").text(pdfText(item.status), 170, y); doc.fillColor("#63748A").font("Helvetica").text(pdfText(item.value ?? "Unavailable"), 235, y, { width: 300, height: 12, ellipsis: true }); });
  doc.y += 110;
  const coverage = report.coverage.sections.slice(0, 6);
  const coverageTop = 622;
  coverage.forEach((item, index) => { const x = 40 + (index % 2) * 260; const y = coverageTop + Math.floor(index / 2) * 22; doc.fillColor("#0B1728").font("Helvetica-Bold").fontSize(8).text(pdfText(item.label), x, y, { width: 155, height: 11, ellipsis: true }); doc.fillColor(item.status === "verified" ? "#149B8A" : "#D28A00").font("Helvetica-Bold").text(`${item.score}/${item.max}`, x + 165, y); doc.fillColor("#63748A").font("Helvetica").text(pdfText(item.status), x + 205, y, { width: 50 }); });
  doc.y = 700;
  doc.addPage();
  sectionHeading(doc, "Business and financial quality", "The five-pillar view combines business context, solvency, profitability, cash flow, and valuation.");
  const profileRows = [["Business model", report.qualitative.businessModel], ["Current scope", report.qualitative.currentScope], ["Future-plan evidence", report.qualitative.futurePlans], ["Economic moat", report.qualitative.moat], ["Management & governance", report.qualitative.management]];
  profileRows.forEach(([label, value]) => { doc.fillColor("#0B1728").font("Helvetica-Bold").fontSize(9).text(label, 40, doc.y, { width: 120 }); doc.fillColor("#37475B").font("Helvetica").text(pdfText(value), 165, doc.y, { width: 390 }); doc.moveDown(0.55); });
  sectionHeading(doc, "Trend visuals", "Bars are directional visual summaries of source-returned history, not forecasts.");
  const revenue = report.history.revenue.map((point) => ({ period: point.period, value: point.value }));
  const eps = report.history.eps.map((point) => ({ period: point.period, value: point.value }));
  const cash = report.history.cashFlow.map((point) => ({ period: point.period, value: point.value }));
  barChart(doc, 40, doc.y, 160, "Revenue", revenue); barChart(doc, 215, doc.y, 160, "EPS", eps); barChart(doc, 390, doc.y, 160, "Operating cash flow", cash);
  doc.y += 130;
  doc.x = 40;
  sectionHeading(doc, "Financial metrics", "Values retain their source and calculation basis.");
  const rows = [["Revenue growth", report.metrics.revenueGrowth], ["EPS", report.metrics.eps], ["ROE", report.metrics.roe], ["Operating cash flow", report.metrics.operatingCashFlow], ["Free cash flow", report.metrics.freeCashFlow], ["Debt / equity", report.metrics.debtToEquity], ["P/E", report.metrics.pe], ["P/B", report.metrics.priceToBook]];
  rows.forEach(([label, metric]) => { const item = metric as FundamentalAnalysis["metrics"][string] | undefined; doc.fillColor("#0B1728").font("Helvetica-Bold").fontSize(8).text(pdfText(label), 40, doc.y, { width: 150 }); doc.fillColor("#37475B").font("Helvetica").text(item && Number.isFinite(item.value) ? item.value.toFixed(2) : "Unavailable", 210, doc.y, { width: 70 }); doc.fillColor("#63748A").text(item ? `${basisLabel(item.basis)} · ${pdfText(item.source)}` : "No normalized value returned", 290, doc.y, { width: 260 }); doc.moveDown(0.42); });
  sectionHeading(doc, "Metric guide · how to read this report", "Definitions, preferred interpretation, and the sector reference used by the scoring engine. A reference is not a target or a recommendation.");
  PDF_METRIC_GUIDE.forEach((guide) => {
    const metric = report.metrics[guide.key];
    const current = metric && Number.isFinite(metric.value) ? `${metric.value.toFixed(2)}${guide.unit}` : "Unavailable";
    doc.fillColor("#0B1728").font("Helvetica-Bold").fontSize(8.5).text(`${guide.label} · ${current}`, 40, doc.y, { width: 170 });
    doc.fillColor("#63748A").font("Helvetica").fontSize(7.5).text(`${guide.meaning} ${guide.best} ${pdfMetricReference(report, guide.key)} · ${metric ? basisLabel(metric.basis) : "unavailable"}.`, 220, doc.y, { width: 335, height: 31, ellipsis: true });
    doc.moveDown(0.55);
  });
  doc.addPage();
  sectionHeading(doc, "Multibagger thesis engine", "A beginner-readable research framework; not a guaranteed-return forecast.");
  card(doc, 40, 92, 515, 92, "#0F2035");
  doc.fillColor("#FDB913").font("Helvetica-Bold").fontSize(9).text("POTENTIAL MULTIBAGGER SCORE", 56, 108);
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(24).text(`${thesis.score}/100`, 56, 126);
  doc.fillColor("#B4C2D4").font("Helvetica").fontSize(9).text(`${pdfText(thesis.label)} · Confidence ${pdfText(thesis.confidence)}`, 190, 132, { width: 330 });
  doc.fillColor("#B4C2D4").fontSize(8).text(pdfText(thesis.beginnerSummary), 190, 151, { width: 330, height: 24, ellipsis: true });
  thesis.scoreBreakdown.forEach((item, index) => { const x = 40 + (index % 2) * 260; const y = 205 + Math.floor(index / 2) * 48; doc.fillColor("#0B1728").font("Helvetica-Bold").fontSize(8).text(pdfText(item.label), x, y, { width: 165, height: 11, ellipsis: true }); doc.fillColor(item.score >= item.max * 0.7 ? "#149B8A" : "#D28A00").font("Helvetica-Bold").text(`${item.score}/${item.max}`, x + 170, y); doc.fillColor("#63748A").font("Helvetica").fontSize(7).text(`${basisLabel(item.basis)} · ${pdfText(item.explanation)}`, x, y + 14, { width: 235, height: 18, ellipsis: true }); });
  doc.y = 420; doc.x = 40;
  sectionHeading(doc, "Evidence gates", "Flags and gaps are shown explicitly; unavailable data is never converted into a positive claim.");
  doc.fillColor("#D95C73").font("Helvetica-Bold").fontSize(8.5).text("Hard rejection flags"); doc.fillColor("#37475B").font("Helvetica").text(pdfText(thesis.hardRejectionFlags.join(" · ") || "None triggered by available evidence."), { width: 515 });
  doc.moveDown(0.5); doc.fillColor("#D28A00").font("Helvetica-Bold").text("Evidence gaps"); doc.fillColor("#37475B").font("Helvetica").text(pdfText(thesis.evidenceGaps.join(" · ") || "No material gaps recorded."), { width: 515 });
  doc.addPage();
  sectionHeading(doc, "Thesis pathway and probability", "WHY, WHAT, WHEN, HOW, risks, and the research questions required to increase confidence.");
  const thesisBlocks: Array<[string, string[]]> = [["WHY", thesis.why], ["WHAT", thesis.what], ["WHEN", thesis.when], ["HOW", thesis.how], ["RISKS", thesis.risks]];
  thesisBlocks.forEach(([label, items]) => { doc.fillColor("#0B1728").font("Helvetica-Bold").fontSize(9).text(label); doc.fillColor("#37475B").font("Helvetica").fontSize(8).text(pdfText(items.join(" · ")), { width: 515 }); doc.moveDown(0.35); });
  doc.moveDown(0.25); doc.fillColor("#0B1728").font("Helvetica-Bold").fontSize(9).text("Probability of outcomes"); doc.fillColor("#63748A").font("Helvetica").fontSize(8).text(`2× ${thesis.probabilities.twoX}% · 5× ${thesis.probabilities.fiveX}% · 10× ${thesis.probabilities.tenX}%`);
  doc.moveDown(0.35); doc.fillColor("#0B1728").font("Helvetica-Bold").fontSize(9).text("Invalidation conditions"); doc.fillColor("#37475B").font("Helvetica").fontSize(8).text(pdfText(thesis.invalidation.join(" · ")), { width: 515 });
  doc.moveDown(0.35); doc.fillColor("#0B1728").font("Helvetica-Bold").fontSize(9).text("Grounded research fallback"); doc.fillColor("#63748A").font("Helvetica").fontSize(8).text(pdfText(`${thesis.researchFallback.status} · ${thesis.researchFallback.policy}`), { width: 515 });
  doc.addPage();
  sectionHeading(doc, "Valuation and scenarios", "Scenario values are conditional anchors, not guaranteed price targets.");
  const valuation = [["Current price", pdfMoney(report, report.fairValue.currentPrice)], ["Low anchor", pdfMoney(report, report.fairValue.lowValue)], ["Base anchor", pdfMoney(report, report.fairValue.baseValue)], ["High anchor", pdfMoney(report, report.fairValue.highValue)], ["DCF intrinsic value", pdfMoney(report, report.fairValue.dcf.valuePerShare)], ["Probability-weighted value", pdfMoney(report, report.institutionalReport.probabilityWeightedFairValue)]];
  valuation.forEach(([label, value], index) => { const x = 40 + (index % 2) * 260; const y = doc.y + Math.floor(index / 2) * 62; card(doc, x, y, 240, 48, index === 2 ? "#FFF8E8" : "#F6F8FB"); doc.fillColor("#63748A").font("Helvetica-Bold").fontSize(8).text(label, x + 12, y + 10); doc.fillColor("#0B1728").font("Helvetica-Bold").fontSize(14).text(value, x + 12, y + 25); });
  doc.y += 205;
  doc.x = 40;
  report.institutionalReport.scenarios.forEach((scenario) => { doc.fillColor("#0B1728").font("Helvetica-Bold").fontSize(9).text(`${scenario.label} · ${scenario.probability}% · ${scenario.fairValue === null ? "Unavailable" : pdfMoney(report, scenario.fairValue)}`); doc.fillColor("#63748A").font("Helvetica").fontSize(8).text(pdfText(scenario.assumptions.join(" ")), { width: 515 }); doc.moveDown(0.55); });
  doc.x = 40;
  sectionHeading(doc, "Catalysts and risks", "Research conditions to monitor before treating the thesis as stronger or weaker.");
  doc.fillColor("#149B8A").font("Helvetica-Bold").fontSize(9).text("Potential positives"); doc.fillColor("#37475B").font("Helvetica").fontSize(8.5).text(pdfText(report.institutionalReport.positives.join(" · ") || "None established from available evidence."), { width: 515 });
  doc.moveDown(0.6); doc.fillColor("#D95C73").font("Helvetica-Bold").text("Risks and invalidation conditions"); doc.fillColor("#37475B").font("Helvetica").text(pdfText([...report.risks, ...report.institutionalReport.thesisInvalidation].join(" · ") || "None established from available evidence."), { width: 515 });
  doc.addPage();
  sectionHeading(doc, "Company-specific news", "Only issuer-identity-matched items are included here; index- and sector-only stories are kept separate.");
  modules.companyNews.items.slice(0, 10).forEach((item) => { card(doc, 40, doc.y, 515, 76, "#F6F8FB"); doc.fillColor("#0B1728").font("Helvetica-Bold").fontSize(8.5).text(`${pdfText(item.date)} · ${pdfText(item.tag)}`, 52, doc.y + 9); doc.fillColor("#37475B").font("Helvetica").fontSize(8).text(pdfText(item.paraphrase), 52, doc.y + 24, { width: 490, height: 22, ellipsis: true }); doc.fillColor("#63748A").fontSize(7).text(`Why it matters: ${pdfText(item.whyItMatters)}`, 52, doc.y + 47, { width: 490, height: 12, ellipsis: true }); doc.fillColor("#149B8A").text(`[Source: ${pdfText(item.source.sourceType)}, ${pdfText(item.source.publisher)}, ${pdfText(item.source.date)}] ${pdfText(item.source.url)}`, 52, doc.y + 61, { width: 490, height: 10, ellipsis: true }); doc.y += 86; });
  if (!modules.companyNews.items.length) doc.fillColor("#63748A").font("Helvetica").fontSize(9).text("Unavailable — no company-scoped item passed the issuer filter at export time.");
  sectionHeading(doc, "Market backdrop", "Broader index, sector, commodity, and macro context is intentionally separate from issuer evidence.");
  modules.marketBackdrop.items.slice(0, 5).forEach((item) => { doc.fillColor("#37475B").font("Helvetica").fontSize(8).text(`${pdfText(item.date)} · ${pdfText(item.paraphrase)} [Source: ${pdfText(item.source.publisher)}, ${pdfText(item.source.date)}]`, { width: 515 }); doc.moveDown(0.35); });
  if (!modules.marketBackdrop.items.length) doc.fillColor("#63748A").font("Helvetica").fontSize(8.5).text("Unavailable — no separate market-backdrop records were supplied.");
  sectionHeading(doc, "Corporate actions / expansion tracker", "Exchange-announcement categories are required; unavailable records are not inferred.");
  if (!modules.corporateActions.items.length) doc.fillColor("#63748A").font("Helvetica").fontSize(8.5).text(pdfText(modules.corporateActions.limitations[0]));
  modules.corporateActions.items.slice(0, 8).forEach((item) => { doc.fillColor("#37475B").font("Helvetica").fontSize(8).text(`${pdfText(item.date)} · ${pdfText(item.category)} · ${pdfText(item.status)} · ${pdfText(item.paraphrase)} · ${pdfText(item.amount)}`, { width: 515 }); doc.moveDown(0.28); });
  sectionHeading(doc, "Earnings call & management commentary", "Guidance, revisions, Q&A, expansion mentions, and observable tone require a dated call source.");
  doc.fillColor("#63748A").font("Helvetica").fontSize(8.5).text(modules.earningsCall.latestCallDate ? `Latest call: ${modules.earningsCall.latestCallDate}` : pdfText(modules.earningsCall.limitations[0]), { width: 515 });
  doc.moveDown(0.4).text(`Analyst Q&A: ${pdfText(modules.earningsCall.analystQandA.join(" "))}`, { width: 515 });
  sectionHeading(doc, "Shareholding & ownership trend", "A snapshot is not a trend; direction requires dated prior-quarter filings.");
  modules.ownershipTrend.latest.forEach((item) => { doc.fillColor("#37475B").font("Helvetica").fontSize(8).text(`${pdfText(item.holder)}: ${pdfText(item.value)} · ${pdfText(item.direction)}`, { width: 515 }); doc.moveDown(0.25); });
  doc.text(`Promoter pledge: ${pdfText(modules.ownershipTrend.pledge)}`, { width: 515 });
  sectionHeading(doc, "Peer / competitor benchmarking", "Named, same-period segment peers are required; conglomerates are not forced into one blended multiple.");
  doc.fillColor("#63748A").font("Helvetica").fontSize(8.5).text(pdfText(modules.peers.comparisonBasis));
  if (!modules.peers.peers.length) doc.moveDown(0.35).text(pdfText(modules.peers.limitations[0]), { width: 515 });
  sectionHeading(doc, "Regulatory & legal proceedings", "Each proceeding is tracked independently with status and last-update date.");
  modules.regulatory.proceedings.forEach((item) => { doc.fillColor("#37475B").font("Helvetica").fontSize(8).text(`${pdfText(item.thread)} · ${pdfText(item.status)} · last update ${pdfText(item.lastUpdate)} · ${pdfText(item.note)}`, { width: 515 }); doc.moveDown(0.28); });
  sectionHeading(doc, "Method, limitations, and disclaimer");
  doc.fillColor("#37475B").font("Helvetica").fontSize(8.5).text(pdfText(report.institutionalReport.freshness));
  doc.moveDown(0.5).text("The report is an analytical output based on connected data returned at the stated timestamp. It is not investment advice, a solicitation, or a guaranteed forecast. Verify decision-relevant values against the latest official filings and licensed market-data sources.", { width: 515 });
  doc.end();
  return done;
}


export { institutionalReportToPdf as fundamentalAnalysisToPdf } from "./institutional-report-pdf";
