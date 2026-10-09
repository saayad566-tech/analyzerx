export type EvidenceBasis = "reported" | "derived" | "estimated" | "stale" | "unavailable";

export type ThesisMetric = {
  value: number | null | undefined;
  basis?: EvidenceBasis;
  source?: string;
};

export type ThesisInput = {
  companyName: string;
  symbol: string;
  sector?: string;
  price?: number | null;
  metrics: Record<string, ThesisMetric>;
  history?: { revenue?: Array<{ value: number }>; eps?: Array<{ value: number }>; cashFlow?: Array<{ value: number }> };
  evidenceGaps?: string[];
  risks?: string[];
  catalysts?: string[];
};

export type ThesisScenario = {
  label: "Bear" | "Base" | "Bull";
  revenueCagr: number | null;
  marginChange: number | null;
  exitMultiple: number | null;
  expectedCagr: number | null;
  valueMultiple: number | null;
  assumptions: string[];
};

export type MultibaggerThesis = {
  score: number;
  label: "Potential multibagger" | "Promising but unproven" | "Insufficient evidence" | "Rejected by risk gates";
  confidence: "High" | "Medium" | "Low";
  scoreBreakdown: Array<{ key: string; label: string; score: number; max: number; basis: EvidenceBasis; explanation: string }>;
  hardRejectionFlags: string[];
  evidenceGaps: string[];
  beginnerSummary: string;
  why: string[];
  what: string[];
  when: string[];
  how: string[];
  risks: string[];
  valuation: { currentPrice: number | null; fiveYear: { bear: number | null; base: number | null; bull: number | null }; tenYear: { bear: number | null; base: number | null; bull: number | null } };
  probabilities: { twoX: number; fiveX: number; tenX: number };
  scenarios: ThesisScenario[];
  invalidation: string[];
  researchFallback: { policy: string; status: "not_needed" | "gaps_require_grounded_research"; nextQuestions: string[] };
};

function metric(input: ThesisInput, key: string): ThesisMetric {
  return input.metrics[key] ?? { value: null, basis: "unavailable" };
}
function value(input: ThesisInput, key: string): number | null {
  const candidate = metric(input, key).value;
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : null;
}
function basis(input: ThesisInput, keys: string[]): EvidenceBasis {
  const bases = keys.map((key) => metric(input, key).basis ?? "unavailable");
  if (bases.includes("reported")) return "reported";
  if (bases.includes("derived")) return "derived";
  if (bases.includes("estimated")) return "estimated";
  if (bases.includes("stale")) return "stale";
  return "unavailable";
}
function clamp(n: number, min = 0, max = 100) { return Math.max(min, Math.min(max, Math.round(n))); }
function scoreRange(n: number | null, low: number, high: number, max: number) {
  if (n === null) return { score: Math.round(max * 0.35), explanation: "Not enough verified data; provisional score only." };
  if (n <= low) return { score: 0, explanation: `Below the ${low} reference level.` };
  if (n >= high) return { score: max, explanation: `At or above the ${high} reference level.` };
  return { score: Math.round(((n - low) / (high - low)) * max), explanation: `Between the ${low} and ${high} reference levels.` };
}
function cagr(targetMultiple: number, years: number) { return (targetMultiple ** (1 / years) - 1) * 100; }
function seriesCagr(series: Array<{ value: number }> | undefined, years: number): number | null {
  if (!series || series.length < years + 1) return null;
  const start = series.at(-(years + 1))?.value;
  const end = series.at(-1)?.value;
  if (!Number.isFinite(start) || !Number.isFinite(end) || (start as number) <= 0 || (end as number) <= 0) return null;
  return ((end as number / (start as number)) ** (1 / years) - 1) * 100;
}
function formatPct(value: number | null) { return value === null ? "unavailable" : `${value.toFixed(1)}%`; }

export function buildMultibaggerThesis(input: ThesisInput): MultibaggerThesis {
  const revenueGrowth = value(input, "revenueGrowth") ?? seriesCagr(input.history?.revenue, 3);
  const earningsGrowth = value(input, "earningsGrowth") ?? seriesCagr(input.history?.eps, 3);
  const cashFlowGrowth = seriesCagr(input.history?.cashFlow, 3);
  const roe = value(input, "roe");
  const roce = value(input, "roce") ?? value(input, "roic");
  const margin = value(input, "operatingMargin") ?? value(input, "profitMargin");
  const debtToEquity = value(input, "debtToEquity");
  const interestCoverage = value(input, "interestCoverage");
  const cashConversion = value(input, "cashConversion");
  const pe = value(input, "pe");
  const promoterPledge = value(input, "promoterPledge");
  const promoterHolding = value(input, "promoterHolding");
  const price = input.price ?? null;

  const growth = scoreRange(revenueGrowth === null && earningsGrowth === null ? null : Math.max(revenueGrowth ?? 0, earningsGrowth ?? 0), 8, 20, 20);
  const business = scoreRange(revenueGrowth, 5, 15, 20);
  const financial = scoreRange(debtToEquity === null ? null : Math.max(0, 1.5 - debtToEquity) * 20, 10, 20, 15);
  const moat = scoreRange(roce, 10, 20, 10);
  const management = promoterPledge !== null ? scoreRange(Math.max(0, 10 - promoterPledge), 6, 10, 10) : { score: 4, explanation: "Promoter pledge evidence is unavailable." };
  const valuation = pe === null ? { score: 4, explanation: "Valuation multiple is unavailable." } : pe <= 18 ? { score: 10, explanation: "P/E is within a conservative reference range." } : pe <= 30 ? { score: 6, explanation: "P/E requires growth support to be reasonable." } : { score: 2, explanation: "High P/E requires unusually strong execution." };
  const catalyst = scoreRange(earningsGrowth, 5, 15, 5);
  const risk = scoreRange(debtToEquity === null ? null : 2 - debtToEquity, 0.5, 1.5, 10);

  const scoreBreakdown = [
    { key: "businessQuality", label: "Business quality and growth runway", score: business.score, max: 20, basis: basis(input, ["revenueGrowth", "sector"]), explanation: business.explanation },
    { key: "growth", label: "Growth and compounding potential", score: growth.score, max: 20, basis: basis(input, ["revenueGrowth", "earningsGrowth"]), explanation: `Revenue CAGR ${formatPct(revenueGrowth)}; earnings CAGR ${formatPct(earningsGrowth)}.` },
    { key: "financialStrength", label: "Financial strength and survival", score: financial.score, max: 15, basis: basis(input, ["debtToEquity", "interestCoverage", "currentRatio"]), explanation: financial.explanation },
    { key: "moat", label: "Moat and reinvestment returns", score: moat.score, max: 10, basis: basis(input, ["roce", "roic"]), explanation: moat.explanation },
    { key: "management", label: "Management and governance", score: management.score, max: 10, basis: basis(input, ["promoterHolding", "promoterPledge"]), explanation: management.explanation },
    { key: "valuation", label: "Valuation versus required growth", score: valuation.score, max: 10, basis: basis(input, ["pe", "priceToBook"]), explanation: valuation.explanation },
    { key: "catalysts", label: "Catalysts and operating leverage", score: catalyst.score, max: 5, basis: basis(input, ["earningsGrowth", "revenueGrowth"]), explanation: catalyst.explanation },
    { key: "risk", label: "Risk and accounting resilience", score: risk.score, max: 10, basis: basis(input, ["debtToEquity", "cashConversion"]), explanation: risk.explanation },
  ];

  const hardRejectionFlags: string[] = [];
  if (promoterPledge !== null && promoterPledge > 25) hardRejectionFlags.push("Promoter pledge is above the 25% hard-review threshold.");
  if (debtToEquity !== null && debtToEquity > 3 && input.sector !== "Financials") hardRejectionFlags.push("Leverage is high for a non-financial company.");
  if (cashConversion !== null && cashConversion < 0.5) hardRejectionFlags.push("Cash conversion is materially below reported earnings.");
  if (pe !== null && pe > 80 && (earningsGrowth === null || earningsGrowth < 15)) hardRejectionFlags.push("Valuation implies exceptional growth that is not evidenced by current metrics.");
  const evidenceGaps = [...(input.evidenceGaps ?? [])];
  const requiredGaps: Array<[string, unknown]> = [["Market-share and TAM evidence", revenueGrowth], ["Five-year revenue/EPS/cash-flow history", input.history?.revenue && input.history.revenue.length >= 5 ? true : null], ["Management credibility versus guidance", input.catalysts?.length], ["Ownership and pledge filings", promoterHolding], ["Customer/supplier concentration", null], ["Accounting-quality deep checks", cashConversion]];
  requiredGaps.forEach(([label, present]) => { if (present === null || present === undefined) evidenceGaps.push(label); });
  const uniqueGaps = [...new Set(evidenceGaps)];
  const score = clamp(scoreBreakdown.reduce((sum, item) => sum + item.score, 0) - hardRejectionFlags.length * 15);
  const confidence: MultibaggerThesis["confidence"] = uniqueGaps.length <= 2 && scoreBreakdown.every((item) => item.basis !== "unavailable") ? "High" : uniqueGaps.length <= 5 ? "Medium" : "Low";
  const label = hardRejectionFlags.length ? "Rejected by risk gates" : score >= 75 && confidence !== "Low" ? "Potential multibagger" : score >= 55 ? "Promising but unproven" : "Insufficient evidence";

  const fiveYear = { bear: 1.5, base: 3, bull: 5 };
  const tenYear = { bear: 2, base: 6, bull: 10 };
  const scenarios: ThesisScenario[] = [
    { label: "Bear", revenueCagr: revenueGrowth === null ? null : Math.max(0, revenueGrowth - 8), marginChange: margin === null ? null : -3, exitMultiple: pe === null ? null : Math.max(8, pe - 10), expectedCagr: (fiveYear.bear ** 0.2 - 1) * 100, valueMultiple: fiveYear.bear, assumptions: ["Growth slows materially", "Margins contract", "Valuation normalizes"] },
    { label: "Base", revenueCagr: revenueGrowth, marginChange: margin === null ? null : 0, exitMultiple: pe, expectedCagr: (fiveYear.base ** 0.2 - 1) * 100, valueMultiple: fiveYear.base, assumptions: ["Growth remains within the evidenced range", "Margins remain stable", "No material governance or balance-sheet shock"] },
    { label: "Bull", revenueCagr: revenueGrowth === null ? null : revenueGrowth + 5, marginChange: margin === null ? null : 3, exitMultiple: pe === null ? null : pe + 5, expectedCagr: (fiveYear.bull ** 0.2 - 1) * 100, valueMultiple: fiveYear.bull, assumptions: ["Growth accelerates", "Market share and margins expand", "Catalysts convert into cash earnings"] },
  ];
  const nextQuestions = ["What is the verified addressable market and market-share trend?", "Do filings confirm cash conversion, dilution, customer concentration, and promoter behavior?", "Which dated catalyst can be checked against an official filing or company disclosure?"];
  const risks = [...(input.risks ?? []), ...hardRejectionFlags, "The thesis is invalid if cash flow, balance-sheet strength, governance, or execution evidence deteriorates."];
  return {
    score,
    label,
    confidence,
    scoreBreakdown,
    hardRejectionFlags,
    evidenceGaps: uniqueGaps,
    beginnerSummary: hardRejectionFlags.length ? "This company fails one or more risk gates, so a high score cannot be treated as a multibagger conclusion." : `A multibagger requires sustained business growth, cash generation, reinvestment returns, and a valuation that does not assume perfection. Current evidence supports a ${label.toLowerCase()} classification with ${confidence.toLowerCase()} confidence.`,
    why: ["The business has a measurable growth and reinvestment pathway only where supported by evidence.", "Operating quality, cash conversion, and governance must improve or remain strong together.", "A high return outcome depends on business growth, not only on a higher valuation multiple."],
    what: [...(input.catalysts ?? []), "Revenue growth, margin progression, per-share earnings, and free cash flow are the core growth engines to monitor."].slice(0, 5),
    when: ["Catalysts should be tied to dated earnings, filings, contracts, capacity, product, or regulatory events.", "Reassess after each material quarterly result and corporate disclosure."],
    how: [`5× in 5 years requires approximately ${cagr(5, 5).toFixed(1)}% annual compounding.`, `10× in 10 years requires approximately ${cagr(10, 10).toFixed(1)}% annual compounding.`, `Current evidence: revenue CAGR ${formatPct(revenueGrowth)}, earnings CAGR ${formatPct(earningsGrowth)}, cash-flow CAGR ${formatPct(cashFlowGrowth)}.`],
    risks,
    valuation: { currentPrice: price, fiveYear: { bear: price === null ? null : price * fiveYear.bear, base: price === null ? null : price * fiveYear.base, bull: price === null ? null : price * fiveYear.bull }, tenYear: { bear: price === null ? null : price * tenYear.bear, base: price === null ? null : price * tenYear.base, bull: price === null ? null : price * tenYear.bull } },
    probabilities: { twoX: clamp(score * 0.8), fiveX: clamp(score * 0.45), tenX: clamp(score * 0.2) },
    scenarios,
    invalidation: ["Revenue and earnings growth fail to convert into operating cash flow.", "Debt, dilution, pledge, governance, or customer concentration worsens.", "The market price assumes growth that filings and company results do not support."],
    researchFallback: { policy: "Use authorized public filings and provider evidence first; if required fields remain absent, route a grounded AI research request only with cited source context and label the result as unverified until cross-checked.", status: uniqueGaps.length ? "gaps_require_grounded_research" : "not_needed", nextQuestions },
  };
}
