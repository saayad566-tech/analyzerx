import { analyzeFundamentals, type FundamentalAnalysis } from "./fundamental-analysis";
import { fetchStockNewsNow, getLatestTrackedNews, type ExtractedNews } from "./news-tracker";
import { getMultiAssetTimingSignals } from "./research-signals";
import { getMarketProfile, type MarketId } from "../lib/market-regions";
import { addResearchAgentRun, createResearchRun, getResearchRun, getSourceRecordsForSymbol, listResearchAgentRuns, updateResearchRun } from "./db";
import { filterFilingsForSymbol, type UnifiedFiling } from "./filing-adapters";
import { fetchNseInstitutionalFlows, type NseInstitutionalFlows } from "./nse-flows";
import { resolveResearchRuntime, type ResearchDeviceCapabilities, type ResearchRuntimePreference } from "./research-runtime-policy";
import PDFDocument from "pdfkit";

export const RESEARCH_AGENT_TYPES = [
  "news",
  "sentiment",
  "technicals",
  "fundamentals",
  "filings",
  "flows",
  "macro",
  "risk",
  "synthesis",
] as const;

export type ResearchAgentType = (typeof RESEARCH_AGENT_TYPES)[number];
export type ResearchRuntime = "deterministic" | "hosted-llm" | "local-model";
export type ResearchAgentStatus = "completed" | "degraded" | "unavailable" | "failed";
export type ResearchConfidence = "high" | "medium" | "low";

export type ResearchEvidence = {
  id: string;
  kind: "news" | "fundamental" | "technical" | "filing" | "flow" | "macro" | "operations";
  label: string;
  source: string;
  url?: string;
  observedAt: string | null;
  freshness: "fresh" | "stale" | "unavailable";
  payload: Record<string, unknown>;
};

export type ResearchClaim = {
  text: string;
  evidenceIds: string[];
  confidence: ResearchConfidence;
  unavailableReason?: string;
};

export type ResearchAgentPacket = {
  agentType: ResearchAgentType;
  runtime: ResearchRuntime;
  status: ResearchAgentStatus;
  confidence: ResearchConfidence;
  startedAt: string;
  completedAt: string;
  claims: ResearchClaim[];
  limitations: string[];
  evidenceIds: string[];
  errorCode?: string;
};

export type ResearchDeskRequest = {
  message: string;
  symbol?: string;
  marketId: MarketId;
  depth?: "quick" | "standard" | "deep";
  includeAgents?: ResearchAgentType[];
  runtimePreference?: ResearchRuntimePreference;
  device?: ResearchDeviceCapabilities;
};

export type ResearchDeskResult = {
  runId: string;
  marketId: MarketId;
  marketLabel: string;
  symbol: string | null;
  status: "completed" | "degraded";
  runtime: ResearchRuntime;
  startedAt: string;
  completedAt: string;
  agents: ResearchAgentPacket[];
  evidence: ResearchEvidence[];
  contradictions: Array<{ claimGroup: string; severity: "low" | "medium" | "high"; explanation: string; evidenceIds: string[] }>;
  answer: string;
  confidence: ResearchConfidence;
  limitations: string[];
};

type SignalLike = { name: string; type: string; action: string; score: number; changePct?: number | null; source: string; freshness?: string | null };
type MultiAssetTimingResult = { generatedAt: string; signals: SignalLike[]; unavailable: unknown[] };

type ResearchInputs = {
  symbol: string | null;
  marketId: MarketId;
  analysis: FundamentalAnalysis | null;
  news: Awaited<ReturnType<typeof fetchStockNewsNow>> | null;
  globalNews: ExtractedNews[];
  assets: MultiAssetTimingResult;
  filings: UnifiedFiling[];
  flows: NseInstitutionalFlows | null;
};

export function createResearchRunId(marketId: MarketId, symbol: string | null, message: string) { return stableId("run", `${marketId}:${symbol ?? "market"}:${message}:${Date.now()}`); }

function stableId(prefix: string, value: string) {
  let hash = 2166136261;
  for (const char of `${prefix}:${value}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `${prefix}-${(hash >>> 0).toString(16)}`;
}

function nowIso() { return new Date().toISOString(); }
function claim(text: string, evidenceIds: string[], confidence: ResearchConfidence, unavailableReason?: string): ResearchClaim { return { text, evidenceIds, confidence, ...(unavailableReason ? { unavailableReason } : {}) }; }
function packet(agentType: ResearchAgentType, status: ResearchAgentStatus, confidence: ResearchConfidence, claims: ResearchClaim[], limitations: string[], evidenceIds: string[], startedAt: string, errorCode?: string): ResearchAgentPacket { return { agentType, runtime: "deterministic", status, confidence, startedAt, completedAt: nowIso(), claims, limitations, evidenceIds, ...(errorCode ? { errorCode } : {}) }; }
function articleEvidence(article: ExtractedNews, marketId: MarketId): ResearchEvidence { const id = stableId("news", `${marketId}:${article.url}:${article.headline}`); return { id, kind: "news", label: article.headline, source: article.source, url: article.url, observedAt: article.published_at ?? null, freshness: article.published_at && Date.now() - new Date(article.published_at).getTime() < 1000 * 60 * 60 * 24 * 3 ? "fresh" : "stale", payload: { symbol: article.symbol, headline: article.headline, summary: article.summary, sentiment: article.sentiment, impactScore: article.impact_score } }; }
function fundamentalEvidence(analysis: FundamentalAnalysis): ResearchEvidence { const id = stableId("fundamental", `${analysis.resolvedSymbol}:${analysis.asOf}`); return { id, kind: "fundamental", label: `${analysis.companyName} fundamental analysis`, source: analysis.sources[0]?.name ?? "AnalyzerX fundamental pipeline", observedAt: analysis.asOf ?? null, freshness: analysis.asOf && Date.now() - new Date(analysis.asOf).getTime() < 1000 * 60 * 60 * 24 * 45 ? "fresh" : "stale", payload: { symbol: analysis.resolvedSymbol, score: analysis.score, verdict: analysis.verdict, metrics: analysis.metrics, quantitativeMetrics: analysis.quantitativeMetrics } }; }
function assetEvidence(assets: MultiAssetTimingResult): ResearchEvidence[] { return assets.signals.map((signal) => ({ id: stableId("asset", `${signal.name}:${signal.freshness}`), kind: signal.type === "macro" ? "macro" : "technical", label: signal.name, source: signal.source, observedAt: signal.freshness ?? null, freshness: signal.freshness ? "fresh" : "unavailable", payload: { assetType: signal.type, action: signal.action, score: signal.score, changePct: signal.changePct } })); }
function filingEvidence(filing: UnifiedFiling): ResearchEvidence { const id = stableId("filing", filing.id); return { id, kind: "filing", label: filing.title, source: filing.sourceKey, url: filing.sourceUrl, observedAt: filing.publishedAt ?? filing.retrievedAt, freshness: filing.evidenceStatus === "verified" ? "fresh" : filing.evidenceStatus === "partial" ? "stale" : "unavailable", payload: { symbol: filing.symbol, filingType: filing.filingType, summary: filing.summary, evidenceStatus: filing.evidenceStatus } }; }
function flowEvidence(flows: NseInstitutionalFlows): ResearchEvidence { const id = stableId("flow", `${flows.reportDate}:${flows.range}`); return { id, kind: "flow", label: `NSE institutional flows · ${flows.rangeLabel}`, source: flows.source, observedAt: flows.reportDate, freshness: flows.status === "fresh" ? "fresh" : flows.status === "stale" ? "stale" : "unavailable", payload: { reportDate: flows.reportDate, range: flows.range, rows: flows.rows, comparison: flows.comparison, error: flows.error } }; }

function runNewsAgent(inputs: ResearchInputs, evidence: ResearchEvidence[], startedAt: string) { const articles: ExtractedNews[] = inputs.news?.articles ?? inputs.globalNews.filter((item: ExtractedNews) => !inputs.symbol || item.symbol === inputs.symbol).slice(0, 12); if (!articles.length) return packet("news", "unavailable", "low", [claim("No source-backed news items were available for this market and symbol.", [], "low", "No fresh or archived article matched the selected scope")], ["News coverage is unavailable for the selected scope."], [], startedAt); const ids = articles.map((item) => stableId("news", `${inputs.marketId}:${item.url}:${item.headline}`)); const fresh = articles.filter((item) => item.published_at && Date.now() - new Date(item.published_at).getTime() < 1000 * 60 * 60 * 24 * 3).length; return packet("news", inputs.news?.stale ? "degraded" : "completed", fresh ? "medium" : "low", [claim(`${articles.length} source-backed news item(s) matched the selected market${inputs.symbol ? ` and ${inputs.symbol}` : ""}; ${fresh} are within the three-day freshness window.`, ids, fresh ? "medium" : "low")], inputs.news?.providerFailures ? [`${inputs.news.providerFailures} provider failure(s) were isolated during collection.`] : [], ids, startedAt); }
function runSentimentAgent(inputs: ResearchInputs, evidence: ResearchEvidence[], startedAt: string) { const articles: ExtractedNews[] = inputs.news?.articles ?? []; if (!articles.length) return packet("sentiment", "unavailable", "low", [claim("Sentiment is unavailable because no matched article text was returned.", [], "low", "No article evidence")], ["No sentiment score was inferred without article evidence."], [], startedAt); const counts = articles.reduce((acc, item) => { acc[item.sentiment] = (acc[item.sentiment] ?? 0) + 1; return acc; }, {} as Record<string, number>); const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Neutral"; const ids = articles.map((item) => stableId("news", `${inputs.marketId}:${item.url}:${item.headline}`)); return packet("sentiment", "completed", "medium", [claim(`Dominant article sentiment is ${dominant}; this describes the retrieved news corpus and is not a price prediction.`, ids, "medium")], ["Sentiment is article-level classification and may not represent the whole market."], ids, startedAt); }
function runTechnicalAgent(inputs: ResearchInputs, evidence: ResearchEvidence[], startedAt: string) { const technical = inputs.assets.signals.filter((item) => item.type === "technical"); if (!technical.length) return packet("technicals", "unavailable", "low", [claim("Technical context is unavailable because no verified indicator or price-series signal was returned for this scope.", [], "low", "No technical evidence")], ["No technical score or price trend has been inferred."], [], startedAt); const ids = technical.map((item) => stableId("asset", `${item.name}:${item.freshness}`)); return packet("technicals", "completed", "medium", technical.map((item) => claim(`${item.name}: ${item.action} with score ${item.score}${item.changePct == null ? "" : ` and change ${item.changePct}%`}.`, [stableId("asset", `${item.name}:${item.freshness}`)], "medium")), [], ids, startedAt); }
function runFundamentalAgent(inputs: ResearchInputs, evidence: ResearchEvidence[], startedAt: string) { if (!inputs.analysis) return packet("fundamentals", "unavailable", "low", [claim("Fundamental analysis is unavailable because no verified company analysis was returned.", [], "low", "No fundamental evidence")], ["No financial metrics were estimated by this agent."], [], startedAt); const id = stableId("fundamental", `${inputs.analysis.resolvedSymbol}:${inputs.analysis.asOf}`); return packet("fundamentals", "completed", inputs.analysis.institutionalReport.confidenceScore >= 70 ? "high" : "medium", [claim(`${inputs.analysis.companyName} scored ${inputs.analysis.score}/100 with verdict ${inputs.analysis.verdict}.`, [id], inputs.analysis.institutionalReport.confidenceScore >= 70 ? "high" : "medium"), ...inputs.analysis.risks.slice(0, 3).map((risk) => claim(`Recorded risk: ${risk}`, [id], "medium"))], inputs.analysis.warnings.slice(0, 4), [id], startedAt); }
function runFilingAgent(inputs: ResearchInputs, startedAt: string) { const filings = inputs.filings.slice(0, 12); if (!filings.length) return packet("filings", "unavailable", "low", [claim("No verified official filing matched the selected symbol in the available source records.", [], "low", "No matching official filing evidence")], ["No filing evidence was available for a matching official source record."], [], startedAt); const ids = filings.map((filing) => stableId("filing", filing.id)); const verified = filings.filter((filing) => filing.evidenceStatus === "verified").length; return packet("filings", verified ? "completed" : "degraded", verified ? "medium" : "low", [claim(`${filings.length} official filing record(s) matched this symbol; ${verified} are currently verified.`, ids, verified ? "medium" : "low")], verified === filings.length ? [] : ["Some filing records are partial or stale and should be opened at the original source before relying on them."], ids, startedAt); }
function runFlowAgent(inputs: ResearchInputs, startedAt: string) { const flows = inputs.flows; if (!flows || flows.status === "unavailable") return packet("flows", "unavailable", "low", [claim("Institutional-flow evidence is unavailable for the selected market or no verified report was returned.", [], "low", "No verified institutional-flow report")], [flows?.error ?? "No FII/DII flow report was returned for this market."], [], startedAt); const usableRows = flows.rows.filter((row) => row.net !== null || row.buy !== null || row.sell !== null); if (!usableRows.length) return packet("flows", "unavailable", "low", [claim("The institutional-flow report contained no usable FII/DII values.", [], "low", "No usable flow rows")], [flows.error ?? "The upstream flow report did not contain FII/DII values."], [], startedAt); const id = stableId("flow", `${flows.reportDate}:${flows.range}`); const summary = usableRows.map((row) => `${row.participant} net ${row.net === null ? "unavailable" : `${row.net >= 0 ? "+" : ""}${row.net}`}`).join("; "); return packet("flows", flows.status === "fresh" ? "completed" : "degraded", flows.status === "fresh" ? "medium" : "low", [claim(`NSE institutional-flow report for ${flows.reportDate ?? "the latest available session"}: ${summary}.`, [id], flows.status === "fresh" ? "medium" : "low")], flows.status === "stale" ? [flows.freshnessLabel] : [], [id], startedAt); }
function runMacroAgent(inputs: ResearchInputs, startedAt: string) { const macro = inputs.assets.signals.filter((item) => item.type === "macro"); if (!macro.length) return packet("macro", "unavailable", "low", [claim("Macro context is unavailable for the selected market in this run.", [], "low", "No macro evidence")], ["No macro driver was substituted from memory."], [], startedAt); const ids = macro.map((item) => stableId("asset", `${item.name}:${item.freshness}`)); return packet("macro", "completed", "medium", macro.map((item) => claim(`${item.name}: ${item.action} with score ${item.score}.`, [stableId("asset", `${item.name}:${item.freshness}`)], "medium")), [], ids, startedAt); }
function runRiskAgent(packets: ResearchAgentPacket[], startedAt: string) { const unavailable = packets.filter((item) => item.status === "unavailable").length; const limitations = packets.flatMap((item) => item.limitations).slice(0, 6); const ids = packets.flatMap((item) => item.evidenceIds); return packet("risk", unavailable >= 3 ? "degraded" : "completed", unavailable >= 3 ? "low" : "medium", [claim(unavailable >= 3 ? `${unavailable} specialist lanes were unavailable; confidence is reduced and the result should not be treated as complete coverage.` : "Specialist lanes completed with no critical coverage gap detected by deterministic checks.", ids, unavailable >= 3 ? "low" : "medium")], limitations, ids, startedAt); }

function buildAnswer(inputs: ResearchInputs, packets: ResearchAgentPacket[], contradictions: ResearchDeskResult["contradictions"]) { const market = getMarketProfile(inputs.marketId); const completed = packets.filter((item) => item.status === "completed").length; const degraded = packets.filter((item) => item.status !== "completed").length; const parts = [`Research desk scope: ${market.country}${inputs.symbol ? ` · ${inputs.symbol}` : ""}.`, `${completed} specialist lane(s) completed and ${degraded} lane(s) are unavailable or degraded.`]; const fundamental = packets.find((item) => item.agentType === "fundamentals")?.claims[0]?.text; const news = packets.find((item) => item.agentType === "news")?.claims[0]?.text; const technical = packets.find((item) => item.agentType === "technicals")?.claims[0]?.text; const filings = packets.find((item) => item.agentType === "filings")?.claims[0]?.text; const flows = packets.find((item) => item.agentType === "flows")?.claims[0]?.text; if (fundamental) parts.push(fundamental); if (news) parts.push(news); if (technical) parts.push(technical); if (filings) parts.push(filings); if (flows) parts.push(flows); if (contradictions.length) parts.push(`${contradictions.length} source-quality or coverage caveat(s) require review.`); parts.push("This is source-grounded research context, not personalized investment advice or a guaranteed signal."); return parts.join(" "); }

export async function runResearchDesk(request: ResearchDeskRequest, runId = createResearchRunId(request.marketId, request.symbol?.trim().toUpperCase() || null, request.message)): Promise<ResearchDeskResult> { const startedAt = nowIso(); const runtimeDecision = resolveResearchRuntime({ preference: request.runtimePreference, device: request.device }); const cleanSymbol = request.symbol?.trim().toUpperCase() || null; const settled = await Promise.allSettled([cleanSymbol ? analyzeFundamentals(cleanSymbol, request.marketId) : Promise.resolve(null), cleanSymbol ? fetchStockNewsNow(cleanSymbol, false, request.marketId) : Promise.resolve(null), getLatestTrackedNews(20, cleanSymbol ?? undefined), getMultiAssetTimingSignals(), cleanSymbol ? getSourceRecordsForSymbol(cleanSymbol, 100) : Promise.resolve([]), request.marketId === "IN" ? fetchNseInstitutionalFlows({ range: "TODAY" }) : Promise.resolve(null)]); const inputs: ResearchInputs = { symbol: cleanSymbol, marketId: request.marketId, analysis: settled[0].status === "fulfilled" ? settled[0].value : null, news: settled[1].status === "fulfilled" ? settled[1].value : null, globalNews: settled[2].status === "fulfilled" ? settled[2].value : [], assets: settled[3].status === "fulfilled" ? settled[3].value : { generatedAt: nowIso(), signals: [], unavailable: ["Multi-asset signal collection failed"] }, filings: cleanSymbol && settled[4].status === "fulfilled" ? filterFilingsForSymbol(settled[4].value, cleanSymbol) : [], flows: settled[5].status === "fulfilled" ? settled[5].value : null }; const evidence: ResearchEvidence[] = []; if (inputs.analysis) evidence.push(fundamentalEvidence(inputs.analysis)); for (const article of inputs.news?.articles ?? inputs.globalNews.slice(0, 12)) evidence.push(articleEvidence(article, request.marketId)); evidence.push(...assetEvidence(inputs.assets)); evidence.push(...inputs.filings.slice(0, 12).map(filingEvidence)); if (inputs.flows) evidence.push(flowEvidence(inputs.flows)); const allowed = new Set(request.includeAgents ?? RESEARCH_AGENT_TYPES.filter((item) => item !== "synthesis")); const packets: ResearchAgentPacket[] = []; const specialistFns: Array<[ResearchAgentType, () => ResearchAgentPacket]> = [["news", () => runNewsAgent(inputs, evidence, startedAt)], ["sentiment", () => runSentimentAgent(inputs, evidence, startedAt)], ["technicals", () => runTechnicalAgent(inputs, evidence, startedAt)], ["fundamentals", () => runFundamentalAgent(inputs, evidence, startedAt)], ["filings", () => runFilingAgent(inputs, startedAt)], ["flows", () => runFlowAgent(inputs, startedAt)], ["macro", () => runMacroAgent(inputs, startedAt)]]; const results = await Promise.all(specialistFns.filter(([type]) => allowed.has(type)).map(async ([, fn]) => { try { return fn(); } catch (error) { return packet("risk", "failed", "low", [claim("A specialist lane failed without producing a claim.", [], "low", "Unhandled specialist error")], [error instanceof Error ? error.message.slice(0, 200) : "Unknown specialist error"], [], startedAt, "SPECIALIST_FAILURE"); } })); packets.push(...results); const risk = runRiskAgent(packets, startedAt); packets.push(risk); const contradictions: ResearchDeskResult["contradictions"] = []; if (inputs.news?.stale) contradictions.push({ claimGroup: "news-freshness", severity: "medium", explanation: "The matched news response is marked stale by the provider pipeline.", evidenceIds: packets.find((item) => item.agentType === "news")?.evidenceIds ?? [] }); if (!inputs.analysis && cleanSymbol) contradictions.push({ claimGroup: "fundamental-coverage", severity: "medium", explanation: "No verified fundamental analysis was returned for the requested symbol.", evidenceIds: [] }); const confidence: ResearchConfidence = packets.some((item) => item.status === "failed") ? "low" : packets.filter((item) => item.status === "completed").length >= 4 ? "medium" : "low"; return { runId, marketId: request.marketId, marketLabel: getMarketProfile(request.marketId).country, symbol: cleanSymbol, status: packets.some((item) => item.status === "failed" || item.status === "degraded") ? "degraded" : "completed", runtime: runtimeDecision.runtime === "hosted" ? "hosted-llm" : runtimeDecision.runtime === "local" ? "local-model" : "deterministic", startedAt, completedAt: nowIso(), agents: packets, evidence, contradictions, answer: buildAnswer(inputs, packets, contradictions), confidence, limitations: Array.from(new Set(packets.flatMap((item) => item.limitations))).slice(0, 12) }; }


export async function runOwnedResearchDesk(userId: number, request: ResearchDeskRequest, attemptCount = 1) {
  const symbol = request.symbol?.trim().toUpperCase() || null;
  const runId = createResearchRunId(request.marketId, symbol, request.message);
  const startedAt = new Date();
  const created = await createResearchRun(userId, {
    id: runId,
    marketId: request.marketId,
    symbol,
    requestJson: JSON.stringify(request),
    runtimePolicyJson: JSON.stringify({ runtime: "deterministic", attemptCount, localModel: null, hostedModel: null }),
    status: "running",
    attemptCount,
    startedAt,
  });
  if (!created) throw new Error("Research persistence is unavailable; the run was not started.");
  try {
    const result = await runResearchDesk(request, runId);
    for (const agent of result.agents) {
      const agentStarted = new Date(agent.startedAt).getTime();
      const agentCompleted = new Date(agent.completedAt).getTime();
      await addResearchAgentRun(userId, {
        id: `${runId}:${agent.agentType}`,
        runId,
        agentType: agent.agentType,
        runtime: result.runtime,
        status: agent.status,
        confidence: agent.confidence,
        evidenceIdsJson: JSON.stringify(agent.evidenceIds),
        outputJson: JSON.stringify(agent),
        latencyMs: Math.max(0, agentCompleted - agentStarted),
        errorCode: agent.errorCode ?? null,
        attemptCount,
      });
    }
    await updateResearchRun(userId, runId, {
      status: result.status,
      resultJson: JSON.stringify(result),
      completedAt: new Date(result.completedAt),
      attemptCount,
    });
    return result;
  } catch (error) {
    await updateResearchRun(userId, runId, { status: "failed", errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Research Desk failed", completedAt: new Date(), attemptCount });
    throw error;
  }
}

export async function retryOwnedResearchDesk(userId: number, runId: string) {
  const existing = await getResearchRun(userId, runId);
  if (!existing) throw new Error("Research run not found or not owned by this account.");
  if (existing.status === "running") throw new Error("This research run is already running.");
  let request: ResearchDeskRequest;
  try { request = JSON.parse(existing.requestJson) as ResearchDeskRequest; } catch { throw new Error("Stored research request is invalid and cannot be retried."); }
  return runOwnedResearchDesk(userId, request, existing.attemptCount + 1);
}

export async function getOwnedResearchDeskResult(userId: number, runId: string) {
  const run = await getResearchRun(userId, runId);
  if (!run) return null;
  const agents = await listResearchAgentRuns(userId, runId);
  return { run, agents };
}

export function researchDeskToMarkdown(result: ResearchDeskResult) {
  const escape = (value: string) => value.replace(/\|/g, "—").replace(/\n/g, " ");
  const agentRows = result.agents.map((agent) => `| ${agent.agentType} | ${agent.status} | ${agent.runtime} | ${agent.confidence} | ${agent.claims.length} | ${agent.evidenceIds.length} |`).join("\n");
  const evidenceRows = result.evidence.length ? result.evidence.map((item) => `| ${item.kind} | ${escape(item.label)} | ${escape(item.source)} | ${item.freshness} |`).join("\n") : "| — | Unavailable | Unavailable | unavailable |";
  const limitations = result.limitations.length ? result.limitations.map((item) => `- ${escape(item)}`).join("\n") : "- None recorded.";
  return `# AnalyzerX Research Desk Report\n\n**Market:** ${escape(result.marketLabel)}  \n**Symbol:** ${escape(result.symbol ?? "Market-wide")}  \n**Run:** ${result.runId}  \n**Runtime:** ${result.runtime}  \n**Confidence:** ${result.confidence}  \n**Completed:** ${result.completedAt}\n\n## Desk synthesis\n\n${escape(result.answer)}\n\n## Specialist coverage\n\n| Agent | Status | Runtime | Confidence | Claims | Evidence |\n|---|---|---|---|---:|---:|\n${agentRows}\n\n## Evidence index\n\n| Type | Label | Source | Freshness |\n|---|---|---|---|\n${evidenceRows}\n\n## Contradictions and limitations\n\n${result.contradictions.length ? result.contradictions.map((item) => `- **${escape(item.claimGroup)} (${item.severity}):** ${escape(item.explanation)}`).join("\n") : "- No contradictions recorded by deterministic quality gates."}\n\n${limitations}\n\n> This report is source-grounded research context, not personalized investment advice or a guaranteed signal. Unavailable data is not inferred.\n`;
}

export function researchDeskToCsv(result: ResearchDeskResult) {
  const csv = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""').replace(/\n/g, " ")}"`;
  const rows = [["market", "symbol", "run_id", "agent", "status", "runtime", "confidence", "claim_count", "evidence_count", "limitations"].map(csv).join(",")];
  for (const agent of result.agents) rows.push([result.marketLabel, result.symbol ?? "", result.runId, agent.agentType, agent.status, agent.runtime, agent.confidence, agent.claims.length, agent.evidenceIds.length, agent.limitations.join(" | ")].map(csv).join(","));
  return rows.join("\n") + "\n";
}

export async function researchDeskToPdf(result: ResearchDeskResult): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margins: { top: 58, bottom: 48, left: 40, right: 40 } });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  const safe = (value: string) => value.replace(/[\\<>]/g, "");
  doc.fillColor("#FDB913").rect(0, 0, 595, 18).fill();
  doc.fillColor("#0B1728").font("Helvetica-Bold").fontSize(23).text("AnalyzerX Research Desk", 40, 52);
  doc.fillColor("#63748A").font("Helvetica").fontSize(10).text(`${safe(result.marketLabel)} · ${safe(result.symbol ?? "Market-wide")} · ${safe(result.runtime)} runtime · ${safe(result.confidence)} confidence`, 40, 84);
  doc.moveDown(2);
  doc.fillColor("#0B1728").font("Helvetica-Bold").fontSize(13).text("Desk synthesis");
  doc.fillColor("#37475B").font("Helvetica").fontSize(9).text(safe(result.answer), { width: 515, lineGap: 3 });
  doc.moveDown(1.2);
  doc.fillColor("#0B1728").font("Helvetica-Bold").fontSize(13).text("Specialist coverage");
  result.agents.forEach((agent, index) => { const y = doc.y + index * 26; if (y > 730) { doc.addPage(); } doc.fillColor("#0B1728").font("Helvetica-Bold").fontSize(8).text(safe(agent.agentType), 40, doc.y, { width: 100 }); doc.fillColor(agent.status === "completed" ? "#149B8A" : "#D28A00").font("Helvetica-Bold").text(safe(agent.status), 145, doc.y); doc.fillColor("#63748A").font("Helvetica").text(`${safe(agent.runtime)} · ${safe(agent.confidence)} · ${agent.claims.length} claims · ${agent.evidenceIds.length} evidence`, 250, doc.y, { width: 300 }); doc.moveDown(0.55); });
  doc.addPage();
  doc.fillColor("#0B1728").font("Helvetica-Bold").fontSize(13).text("Evidence index");
  result.evidence.forEach((item) => { doc.moveDown(0.35); doc.fillColor("#0B1728").font("Helvetica-Bold").fontSize(8).text(safe(item.kind), 40, doc.y, { width: 60 }); doc.fillColor("#37475B").font("Helvetica").text(safe(item.label), 110, doc.y, { width: 270 }); doc.fillColor("#63748A").text(`${safe(item.source)} · ${safe(item.freshness)}`, 390, doc.y, { width: 165 }); });
  doc.moveDown(1.2); doc.fillColor("#0B1728").font("Helvetica-Bold").fontSize(13).text("Limitations"); doc.fillColor("#63748A").font("Helvetica").fontSize(9).text(safe(result.limitations.join(" · ") || "No limitations recorded."), { width: 515, lineGap: 3 });
  doc.fillColor("#63748A").fontSize(8).text("Unavailable data is not inferred. Research context only; not personalized investment advice.", 40, 790, { width: 515 });
  doc.end();
  return done;
}
