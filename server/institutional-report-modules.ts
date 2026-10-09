import type { FundamentalAnalysis } from "./fundamental-analysis";
import type { ExtractedNews } from "./news-tracker";
import { requiredSourceNote } from "./institutional-source-catalog";

export type EvidenceStatus = "verified" | "partial" | "unavailable";
export type SourceRef = { sourceType: string; publisher: string; date: string | null; url?: string; filingRef?: string; note?: string };
export type CompanyNewsItem = { date: string; tag: "Corporate/Results" | "Regulatory/Legal" | "M&A" | "Investor Relations" | "Analyst" | "Leadership"; paraphrase: string; source: SourceRef; whyItMatters: string };
export type MarketBackdropItem = { date: string; paraphrase: string; source: SourceRef };
export type ModuleStatus = { status: EvidenceStatus; asOf: string | null; sources: SourceRef[]; limitations: string[] };
export type InstitutionalReportModules = {
  companyNews: ModuleStatus & { items: CompanyNewsItem[] };
  marketBackdrop: ModuleStatus & { items: MarketBackdropItem[] };
  earningsCall: ModuleStatus & { latestCallDate: string | null; guidance: string[]; revisions: string[]; analystQandA: string[]; expansionMentions: string[]; tone: "confident" | "cautious" | "defensive" | "Unavailable" };
  corporateActions: ModuleStatus & { items: { date: string; category: string; paraphrase: string; amount: string; status: "completed" | "announced-pending" | "proposed" | "in-principle" | "Unavailable"; source: SourceRef }[]; twelveMonthFootprint: Record<string, number> };
  ownershipTrend: ModuleStatus & { latest: { holder: string; value: string; direction: string }[]; quarters: string[]; pledge: string };
  peers: ModuleStatus & { comparisonBasis: string; peers: { name: string; segment: string; metrics: string; source: SourceRef }[] };
  regulatory: ModuleStatus & { proceedings: { thread: string; status: "open" | "closed" | "settled" | "appealed" | "Unavailable"; lastUpdate: string; source: SourceRef; note: string }[] };
};

const clean = (value: unknown, fallback = "Unavailable") => typeof value === "string" && value.trim() ? value.trim() : fallback;
const dateOf = (value: unknown) => typeof value === "string" && value.trim() ? value.slice(0, 10) : null;
const sourceFromNews = (item: ExtractedNews): SourceRef => ({ sourceType: "news article", publisher: clean(item.source), date: dateOf(item.published_at), url: item.url });

function isCompanyScoped(item: ExtractedNews, report: FundamentalAnalysis): boolean {
  const identity = [report.companyName, report.resolvedSymbol, report.requestedSymbol].join(" ").toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 4);
  const haystack = `${item.headline} ${item.summary} ${item.key_entities.join(" ")}`.toLowerCase();
  return identity.some((token) => haystack.includes(token));
}

function newsTag(item: ExtractedNews): CompanyNewsItem["tag"] {
  const value = `${item.headline} ${item.summary}`.toLowerCase();
  if (/result|earnings|quarter|revenue|profit/.test(value)) return "Corporate/Results";
  if (/sebi|court|regulator|notice|investigation|legal|edny|cbi/.test(value)) return "Regulatory/Legal";
  if (/acqui|merger|m&a|subsidiary|joint venture|jv|stake/.test(value)) return "M&A";
  if (/analyst|target price|rating|broker/.test(value)) return "Analyst";
  if (/chairman|director|ceo|leadership|management/.test(value)) return "Leadership";
  return "Investor Relations";
}

function unavailableModule(note: string): ModuleStatus { return { status: "unavailable", asOf: null, sources: [], limitations: [note] }; }

export function buildInstitutionalReportModules(report: FundamentalAnalysis, news: ExtractedNews[] = []): InstitutionalReportModules {
  const company = news.filter((item) => isCompanyScoped(item, report));
  const backdrop = news.filter((item) => !isCompanyScoped(item, report));
  const companyNewsItems = company.map((item) => ({ date: dateOf(item.published_at) ?? "Unavailable", tag: newsTag(item), paraphrase: clean(item.summary, item.headline), source: sourceFromNews(item), whyItMatters: item.actionable_impact || "Thesis relevance was not supplied by the source pipeline; verify against the underlying filing or company disclosure." }));
  const backdropItems = backdrop.map((item) => ({ date: dateOf(item.published_at) ?? "Unavailable", paraphrase: clean(item.summary, item.headline), source: sourceFromNews(item) }));
  const latestOwnership = report.stockAnalysis.ownership;
  const ownership: InstitutionalReportModules["ownershipTrend"] = {
    status: latestOwnership.promoterHolding !== null ? "partial" : "unavailable", asOf: report.asOf, sources: [], limitations: ["Latest promoter holding is available from the analysis snapshot; FII, DII, public holding, prior-quarter direction, and pledge trend require dated exchange shareholding filings."],
    latest: [{ holder: "Promoter", value: latestOwnership.promoterHolding === null ? "Unavailable" : `${latestOwnership.promoterHolding.toFixed(2)}%`, direction: "Prior-quarter direction unavailable" }, { holder: "FII", value: "Unavailable", direction: "Unavailable" }, { holder: "DII", value: "Unavailable", direction: "Unavailable" }, { holder: "Public", value: "Unavailable", direction: "Unavailable" }], quarters: [], pledge: latestOwnership.promoterPledge === null ? "Unavailable — requires latest exchange pledge disclosure" : `${latestOwnership.promoterPledge.toFixed(2)}% (direction unavailable)`,
  };
  return {
    companyNews: { status: companyNewsItems.length ? "verified" : "unavailable", asOf: companyNewsItems.map((item) => item.date).filter((item) => item !== "Unavailable").sort().at(-1) ?? null, sources: companyNewsItems.slice(0, 8).map((item) => item.source), limitations: companyNewsItems.length ? ["Only headlines with an issuer identity anchor are included. Index- or sector-only items are excluded from company news."] : ["No company-scoped article passed the issuer identity filter at export time."], items: companyNewsItems },
    marketBackdrop: { status: backdropItems.length ? "verified" : "unavailable", asOf: backdropItems.map((item) => item.date).filter((item) => item !== "Unavailable").sort().at(-1) ?? null, sources: backdropItems.slice(0, 8).map((item) => item.source), limitations: ["Market backdrop is intentionally separate from company-specific news and must not be used as issuer evidence."], items: backdropItems },
    earningsCall: { ...unavailableModule(`No transcript/audio or investor presentation was available through the current report input. ${requiredSourceNote("earnings-call")}`), latestCallDate: null, guidance: [], revisions: [], analystQandA: ["Unavailable — do not infer analyst Q&A from a results press release."], expansionMentions: [], tone: "Unavailable" },
    corporateActions: { ...unavailableModule(`No exchange-announcement action feed was available through the current report input. ${requiredSourceNote("corporate-actions")}`), items: [], twelveMonthFootprint: {} },
    ownershipTrend: ownership,
    peers: { ...unavailableModule("No dated same-period peer metric set was available. Requires named segment peers and comparable source-backed metrics; blended conglomerate P/E is not used."), comparisonBasis: report.stockAnalysis.profile.sector ? `Segment-level comparison required for ${report.stockAnalysis.profile.sector}; a single blended peer multiple may mislead.` : "Segment-level comparison required.", peers: [] },
    regulatory: { ...unavailableModule(`No regulator-order or exchange-proceeding dataset was available in the current report input. ${requiredSourceNote("regulatory")}`), proceedings: [{ thread: "Open regulatory/legal proceedings", status: "Unavailable", lastUpdate: "Unavailable", source: { sourceType: "regulator/exchange record", publisher: "NSE/BSE/SEBI or relevant court", date: null }, note: "No open-proceedings conclusion may be made until the required sources are checked." }] },
  };
}
