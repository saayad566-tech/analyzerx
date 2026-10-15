/**
 * AnalyzerX Institutional Scoring Engine — configuration.
 *
 * The PRD's design rule is explicit: "weights live in config, not code" and
 * "same inputs + same config version = identical score". Everything tunable is
 * therefore data here, versioned, so a score can always be reproduced and the
 * exact config that produced it can be named in a report.
 *
 * Section 8.2 (pillars), 8.3 (risk overlay), 8.4 (sector models), 8.7 (rating
 * bands) and 9.2 (news weights) of the PRD.
 */

export const SCORING_CONFIG_VERSION = "1.0.0";

export type SectorModel =
  | "generic"
  | "banks"
  | "nbfc"
  | "insurance"
  | "it-services"
  | "pharma"
  | "cyclical"
  | "real-estate"
  | "utilities";

export type MetricDirection = "higher-better" | "lower-better";

export type PillarKey =
  | "quality"
  | "growth"
  | "valuation"
  | "balanceSheet"
  | "cashQuality"
  | "governance"
  | "technical"
  | "moat";

export type PillarSpec = {
  key: PillarKey;
  label: string;
  /** Default composite weight, as a fraction that sums to 1 across pillars. */
  weight: number;
  description: string;
};

export type MetricSpec = {
  key: string;
  label: string;
  pillar: PillarKey;
  direction: MetricDirection;
  /** Weight within its pillar. */
  weight: number;
  /**
   * Sector overrides. `weight: 0` removes a metric for a sector (e.g. banks drop
   * debt/equity and current ratio); a direction override flips the ordering.
   */
  sectors?: Partial<Record<SectorModel, { weight?: number; direction?: MetricDirection }>>;
  /** When true, a negative value means "not meaningful" and is excluded. */
  negativeMeansUnavailable?: boolean;
};

export type RatingBand = { min: number; grade: "A+" | "A" | "B" | "C" | "D"; meaning: string };

export type OverlayTrigger =
  | { kind: "flag"; flagKey: string }
  | { kind: "at-least"; metricKey: string; value: number }
  | { kind: "at-most"; metricKey: string; value: number }
  | { kind: "scaled"; metricKey: string; from: number; to: number; penaltyFrom: number; penaltyTo: number };

export type OverlayRule = {
  id: string;
  label: string;
  /** Negative number (points subtracted from the composite). */
  penalty: number;
  description: string;
  trigger: OverlayTrigger;
};

export type NewsConfig = {
  /** Maximum points from each component (PRD 9.2). */
  weights: { sentiment: number; catalyst: number; materiality: number; centrality: number };
  sourceMultiplier: { tier1: number; tier2: number; tier3: number; rumourPenalty: number };
  /** Base signed magnitude per event type, in [-1, +1] before weighting. */
  catalystMagnitudes: Record<string, number>;
  /** Half-life in hours per event type (PRD 9.3). */
  halfLifeHours: Record<string, number>;
  defaultHalfLifeHours: number;
  /** Independent corroboration adds this fraction to the magnitude (capped at 1). */
  corroborationBoost: number;
};

export type MetricAnchors = { best: number; worst: number };

export type ScoringConfig = {
  version: string;
  pillars: PillarSpec[];
  metrics: MetricSpec[];
  ratingBands: RatingBand[];
  overlay: { cap: number; rules: OverlayRule[] };
  /** Below this confidence the UI must show "Provisional" instead of a grade (PRD 8.7). */
  provisionalConfidenceThreshold: number;
  /**
   * Absolute anchors (best maps to 100, worst to 0) used ONLY when a metric has
   * no sector peer sample. The PRD's primary method is sector-relative; this is a
   * documented, clearly-labelled fallback so a single name can still be scored
   * before the Phase 0 point-in-time peer store ships.
   */
  anchors: Record<string, MetricAnchors>;
  news: NewsConfig;
};

/** Default absolute anchors for the metrics the app can populate today. */
export const DEFAULT_METRIC_ANCHORS: Record<string, MetricAnchors> = {
  roce: { best: 25, worst: 0 },
  roe: { best: 25, worst: 0 },
  operatingMargin: { best: 25, worst: 0 },
  grossMargin: { best: 50, worst: 10 },
  profitMargin: { best: 20, worst: 0 },
  pe: { best: 8, worst: 45 },
  pb: { best: 1, worst: 8 },
  debtToEquity: { best: 0, worst: 2.5 },
  interestCoverage: { best: 12, worst: 1 },
  currentRatio: { best: 3, worst: 0.8 },
  quickRatio: { best: 2.5, worst: 0.5 },
  cfoToPat: { best: 1.5, worst: 0.4 },
  revenueCagr3y: { best: 25, worst: -5 },
  epsCagr3y: { best: 30, worst: -10 },
  fcfYield: { best: 8, worst: 0 },
  promoterHolding: { best: 70, worst: 25 },
  promoterPledge: { best: 0, worst: 40 },
  rsiRegime: { best: 70, worst: 25 },
  momentum12m1m: { best: 30, worst: -20 },
  marginOfSafety: { best: 25, worst: -30 },
  drawdown: { best: 0, worst: -45 },
};

/** Pillar weights from PRD 8.2 (sum to 1.0). */
export const DEFAULT_PILLARS: PillarSpec[] = [
  { key: "quality", label: "Quality & Profitability", weight: 0.20, description: "ROCE, ROE, ROIC−WACC, gross profitability, margin level and stability, DuPont, Piotroski F." },
  { key: "growth", label: "Growth", weight: 0.15, description: "3Y and 5Y CAGR of revenue, EBITDA, EPS and FCF; growth consistency; operating leverage; QoQ acceleration." },
  { key: "valuation", label: "Valuation", weight: 0.15, description: "P/E, P/B, EV/EBITDA, EV/Sales, PEG, FCF yield vs own history and peers; reverse-DCF implied growth." },
  { key: "balanceSheet", label: "Balance Sheet & Solvency", weight: 0.12, description: "Debt/Equity, Net Debt/EBITDA, interest coverage, current and quick ratios, Altman Z, maturity profile." },
  { key: "cashQuality", label: "Cash Flow & Earnings Quality", weight: 0.12, description: "CFO/PAT, FCF conversion, Sloan accruals, Beneish M, capex intensity, DSO/DIO/DPO trend." },
  { key: "governance", label: "Governance & Ownership", weight: 0.10, description: "Promoter holding trend, pledge %, FII/DII trend, related-party ratio, auditor changes, regulatory actions." },
  { key: "technical", label: "Technical & Market Structure", weight: 0.10, description: "50/200 EMA hierarchy, 12-1 momentum, RSI regime, ATR regime, relative strength, OBV, delivery %, drawdown." },
  { key: "moat", label: "Moat & Business Quality", weight: 0.06, description: "Market-share trend, margin stability through cycles, customer/segment concentration, capital-allocation record." },
];

/** Metric specs across pillars 1-8 (PRD 8.2). */
export const DEFAULT_METRICS: MetricSpec[] = [
  // Quality & Profitability
  { key: "roce", label: "ROCE", pillar: "quality", direction: "higher-better", weight: 3 },
  { key: "roe", label: "ROE", pillar: "quality", direction: "higher-better", weight: 3 },
  { key: "roicMinusWacc", label: "ROIC − WACC", pillar: "quality", direction: "higher-better", weight: 2 },
  { key: "grossProfitability", label: "Gross profitability (GP/Assets)", pillar: "quality", direction: "higher-better", weight: 2 },
  { key: "operatingMargin", label: "Operating margin", pillar: "quality", direction: "higher-better", weight: 2 },
  { key: "marginStability", label: "Margin stability", pillar: "quality", direction: "higher-better", weight: 1 },
  { key: "piotroskiF", label: "Piotroski F-Score", pillar: "quality", direction: "higher-better", weight: 2 },
  // Growth
  { key: "revenueCagr3y", label: "Revenue CAGR 3Y", pillar: "growth", direction: "higher-better", weight: 3 },
  { key: "revenueCagr5y", label: "Revenue CAGR 5Y", pillar: "growth", direction: "higher-better", weight: 2 },
  { key: "epsCagr3y", label: "EPS CAGR 3Y", pillar: "growth", direction: "higher-better", weight: 3 },
  { key: "ebitdaCagr3y", label: "EBITDA CAGR 3Y", pillar: "growth", direction: "higher-better", weight: 2 },
  { key: "fcfCagr3y", label: "FCF CAGR 3Y", pillar: "growth", direction: "higher-better", weight: 1 },
  { key: "growthConsistency", label: "Growth consistency", pillar: "growth", direction: "higher-better", weight: 2 },
  // Valuation (lower is cheaper)
  { key: "pe", label: "P/E", pillar: "valuation", direction: "lower-better", weight: 3, negativeMeansUnavailable: true },
  { key: "pb", label: "P/B", pillar: "valuation", direction: "lower-better", weight: 2 },
  { key: "evEbitda", label: "EV/EBITDA", pillar: "valuation", direction: "lower-better", weight: 3, negativeMeansUnavailable: true },
  { key: "evSales", label: "EV/Sales", pillar: "valuation", direction: "lower-better", weight: 1 },
  { key: "peg", label: "PEG", pillar: "valuation", direction: "lower-better", weight: 1, negativeMeansUnavailable: true },
  { key: "fcfYield", label: "FCF yield", pillar: "valuation", direction: "higher-better", weight: 2 },
  { key: "marginOfSafety", label: "Margin of safety (DCF)", pillar: "valuation", direction: "higher-better", weight: 2 },
  // Balance sheet & solvency
  { key: "debtToEquity", label: "Debt/Equity", pillar: "balanceSheet", direction: "lower-better", weight: 3, sectors: { banks: { weight: 0 }, nbfc: { weight: 0 }, insurance: { weight: 0 } } },
  { key: "netDebtToEbitda", label: "Net Debt/EBITDA", pillar: "balanceSheet", direction: "lower-better", weight: 3 },
  { key: "interestCoverage", label: "Interest coverage", pillar: "balanceSheet", direction: "higher-better", weight: 3 },
  { key: "currentRatio", label: "Current ratio", pillar: "balanceSheet", direction: "higher-better", weight: 1, sectors: { banks: { weight: 0 }, nbfc: { weight: 0 }, insurance: { weight: 0 } } },
  { key: "quickRatio", label: "Quick ratio", pillar: "balanceSheet", direction: "higher-better", weight: 1, sectors: { banks: { weight: 0 }, nbfc: { weight: 0 }, insurance: { weight: 0 } } },
  { key: "altmanZ", label: "Altman Z-Score", pillar: "balanceSheet", direction: "higher-better", weight: 2 },
  // Cash flow & earnings quality
  { key: "cfoToPat", label: "CFO/PAT", pillar: "cashQuality", direction: "higher-better", weight: 3 },
  { key: "fcfConversion", label: "FCF conversion", pillar: "cashQuality", direction: "higher-better", weight: 2 },
  { key: "sloanAccruals", label: "Sloan accruals", pillar: "cashQuality", direction: "lower-better", weight: 2 },
  { key: "beneishM", label: "Beneish M-Score", pillar: "cashQuality", direction: "lower-better", weight: 2 },
  { key: "capexIntensity", label: "Capex intensity", pillar: "cashQuality", direction: "lower-better", weight: 1 },
  // Governance & ownership
  { key: "promoterHolding", label: "Promoter holding", pillar: "governance", direction: "higher-better", weight: 2 },
  { key: "promoterHoldingTrend", label: "Promoter holding trend", pillar: "governance", direction: "higher-better", weight: 2 },
  { key: "promoterPledge", label: "Promoter pledge %", pillar: "governance", direction: "lower-better", weight: 3 },
  { key: "fiiDiiTrend", label: "FII/DII trend", pillar: "governance", direction: "higher-better", weight: 1 },
  // Technical & market structure
  { key: "emaHierarchy", label: "50/200 EMA hierarchy", pillar: "technical", direction: "higher-better", weight: 2 },
  { key: "momentum12m1m", label: "12-1 momentum", pillar: "technical", direction: "higher-better", weight: 3 },
  { key: "rsiRegime", label: "RSI regime", pillar: "technical", direction: "higher-better", weight: 2 },
  { key: "relativeStrength", label: "Relative strength vs index", pillar: "technical", direction: "higher-better", weight: 2 },
  { key: "drawdown", label: "Drawdown from 52w high", pillar: "technical", direction: "higher-better", weight: 1 },
  // Moat
  { key: "marketShareTrend", label: "Market-share trend", pillar: "moat", direction: "higher-better", weight: 2 },
  { key: "cycleMarginStability", label: "Margin stability through cycles", pillar: "moat", direction: "higher-better", weight: 2 },
  { key: "customerConcentration", label: "Customer concentration", pillar: "moat", direction: "lower-better", weight: 1 },
];

/** Rating bands (PRD 8.7). */
export const DEFAULT_RATING_BANDS: RatingBand[] = [
  { min: 85, grade: "A+", meaning: "Institutional-quality compounder" },
  { min: 70, grade: "A", meaning: "Strong" },
  { min: 55, grade: "B", meaning: "Average, selective" },
  { min: 40, grade: "C", meaning: "Weak, needs a catalyst" },
  { min: 0, grade: "D", meaning: "High risk" },
];

/** Risk overlay (PRD 8.3), capped in total. */
export const DEFAULT_OVERLAY: { cap: number; rules: OverlayRule[] } = {
  cap: 30,
  rules: [
    { id: "pledge", label: "Promoter pledge > 30% of holding", penalty: -5, description: "Promoter pledge above 30% of holding; scaled −5 to −10.", trigger: { kind: "scaled", metricKey: "promoterPledge", from: 30, to: 60, penaltyFrom: -5, penaltyTo: -10 } },
    { id: "altman-distress", label: "Altman Z in distress zone", penalty: -10, description: "Altman Z below 1.81 (distress zone).", trigger: { kind: "at-most", metricKey: "altmanZ", value: 1.81 } },
    { id: "beneish", label: "Beneish M above −1.78", penalty: -8, description: "Beneish M-Score above −1.78 suggests possible manipulation.", trigger: { kind: "at-least", metricKey: "beneishM", value: -1.78 } },
    { id: "negative-cfo", label: "Negative CFO for 3+ consecutive years", penalty: -10, description: "Three or more consecutive years of negative operating cash flow.", trigger: { kind: "flag", flagKey: "negativeCfoThreeYears" } },
    { id: "auditor", label: "Auditor resignation or qualified opinion", penalty: -8, description: "Auditor resignation or a qualified opinion.", trigger: { kind: "flag", flagKey: "auditorQualifiedOrResigned" } },
    { id: "interest-cover", label: "Interest coverage < 1.5x", penalty: -6, description: "Interest coverage below 1.5×.", trigger: { kind: "at-most", metricKey: "interestCoverage", value: 1.5 } },
    { id: "regulatory", label: "Active major regulatory action", penalty: -8, description: "An active major regulatory action (SEBI/ED/litigation).", trigger: { kind: "flag", flagKey: "majorRegulatoryAction" } },
  ],
};

/** News Impact config (PRD 9.2, 9.3). */
export const DEFAULT_NEWS: NewsConfig = {
  weights: { sentiment: 40, catalyst: 30, materiality: 15, centrality: 15 },
  sourceMultiplier: { tier1: 1.0, tier2: 0.7, tier3: 0.3, rumourPenalty: 0.5 },
  catalystMagnitudes: {
    results_beat: 1.0,
    results_miss: -1.0,
    guidance_up: 0.8,
    guidance_down: -0.8,
    mna: 0.7,
    order_win: 0.6,
    rating_upgrade: 0.5,
    rating_downgrade: -0.5,
    regulatory_penalty: -0.9,
    litigation: -0.7,
    management_exit: -0.6,
    fund_raise: -0.2,
    bankruptcy: -1.0,
    fraud: -1.0,
    pledge_invocation: -0.9,
    none: 0,
  },
  halfLifeHours: {
    results_beat: 18, results_miss: 18, guidance_up: 24, guidance_down: 24,
    mna: 336, order_win: 72, rating_upgrade: 48, rating_downgrade: 48,
    regulatory_penalty: 240, litigation: 240, management_exit: 96, fund_raise: 72,
    bankruptcy: 480, fraud: 480, pledge_invocation: 240, none: 24,
  },
  defaultHalfLifeHours: 24,
  corroborationBoost: 0.15,
};

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  version: SCORING_CONFIG_VERSION,
  pillars: DEFAULT_PILLARS,
  metrics: DEFAULT_METRICS,
  ratingBands: DEFAULT_RATING_BANDS,
  overlay: DEFAULT_OVERLAY,
  provisionalConfidenceThreshold: 0.6,
  anchors: DEFAULT_METRIC_ANCHORS,
  news: DEFAULT_NEWS,
};

/** Resolve a metric spec for a sector (weight 0 removes the metric). */
export function metricForSector(metric: MetricSpec, sector: SectorModel): { direction: MetricDirection; weight: number } {
  const override = metric.sectors?.[sector];
  return { direction: override?.direction ?? metric.direction, weight: override?.weight ?? metric.weight };
}

/** Sector-specific metric sets named in PRD 8.4, mapped onto our metric keys where they exist. */
export const SECTOR_NOTES: Record<SectorModel, string> = {
  generic: "Default cross-sector model.",
  banks: "Banks: NIM, GNPA/NNPA, CASA, CAR, credit cost, ROA, P/B vs ROE. Debt/Equity and current ratio are removed.",
  nbfc: "NBFC: AUM growth, spreads, GNPA, cost of borrowing, ALM gaps, leverage. Debt/Equity and current ratio are removed.",
  insurance: "Insurance: VNB margin, combined ratio, solvency ratio, embedded value.",
  "it-services": "IT services: constant-currency growth, deal wins, attrition, utilisation, EBIT margin.",
  pharma: "Pharma: R&D ratio, US-generics exposure, USFDA observations, margin.",
  cyclical: "Cyclicals/metals: through-cycle normalised earnings, EV/EBITDA on mid-cycle, inventory cycle.",
  "real-estate": "Real estate: pre-sales, collections, net debt to cash flow, approvals pipeline.",
  utilities: "Utilities/infra: regulated returns, PLF, project pipeline, counterparty risk.",
};
