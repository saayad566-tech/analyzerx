/**
 * Deep-research catalyst scan with mandatory temporal anchoring (Rule 6).
 *
 * The user's ask: surface the things that matter for real research — a new
 * plant, a capacity expansion, an order win, a discovery, a stake sale — rather
 * than only the loudest headlines, and anchor every one of them in time.
 *
 * Rule 6 requires three markers on every catalyst:
 *   1. eventDate          - when the event was announced, as stated in the text
 *   2. documentDate       - when the source document was published
 *   3. executionTimeline  - when it is expected to affect results
 *
 * It also requires that events outside the user's selected tracking window are
 * NOT extracted, unless the text marks them as a current update to a historical
 * agreement.
 *
 * Everything here is deterministic and evidence-first: the exact phrase that
 * matched is returned so the classification is auditable, and a marker is only
 * reported as "stated in source" when the text actually states it.
 */

export type CatalystCategory =
  | "expansion"
  | "order_win"
  | "discovery"
  | "partnership"
  | "capital"
  | "regulatory"
  | "ownership"
  | "guidance";

export type TemporalAnchor = {
  /** Announcement date found in the text, as ISO yyyy-mm-dd. Null when unstated. */
  eventDate: string | null;
  /** The date exactly as it appears in the source, for audit. */
  eventDateLabel: string | null;
  /**
   * stated_in_source - the text names the announcement date
   * document_date    - no date in the text, so the publication date anchors it
   * unstated         - no usable date at all
   */
  eventDateBasis: "stated_in_source" | "document_date" | "unstated";
  /** Publication date of the source document. Always present. */
  documentDate: string;
  /** When the event should reach the P&L, e.g. "Q4 2026", "FY2027", "Immediate". */
  executionTimeline: string | null;
  executionBasis: "stated_in_source" | "unstated";
};

export type DeepResearchSignal = {
  id: string;
  category: CatalystCategory;
  label: string;
  symbol: string;
  headline: string;
  source: string;
  url: string;
  /** The exact phrase found in the article. Shown so the match is auditable. */
  matchedPhrase: string;
  /** Why this category matters for research. */
  why: string;
  impactScore: number;
  /** True when the headline itself (not only the summary) carries the phrase. */
  headlineMatch: boolean;
  /** Rule 6: the three time markers. */
  temporal: TemporalAnchor;
  /** True when the event is marked as a current update to an earlier agreement. */
  isHistoricalUpdate: boolean;
};

export type ScanOptions = {
  limit?: number;
  /** The user's selected tracking window, in days. */
  windowDays?: number;
  /** Injectable clock for deterministic tests. */
  now?: Date;
};

export type ScanResult = {
  signals: DeepResearchSignal[];
  /** How many candidates were dropped for falling outside the window. */
  excludedOutOfWindow: number;
  windowDays: number;
  windowStart: string;
};

type Rule = {
  category: CatalystCategory;
  label: string;
  why: string;
  pattern: RegExp;
};

/**
 * Ordered so the gating catalyst wins over an incidental match. Regulatory
 * precedes expansion because a clearance is the event that unlocks the project,
 * and ownership precedes capital because a stake sale is a governance signal
 * rather than a funding one.
 */
const RULES: Rule[] = [
  {
    category: "discovery",
    label: "Discovery / resource find",
    why: "A new find can change the resource base and future output. Verify the filing before sizing it.",
    pattern: /\b(discover(?:y|ed|s)?|struck|strike|reserves?|deposit|new (?:mine|field|well)|found (?:oil|gas|ore|coal|sulphur|sulfur|gold|lithium))\b/i,
  },
  {
    category: "regulatory",
    label: "Regulatory / approval",
    why: "Approvals unlock projects and are often the gating event. Check the authority, scope and any conditions.",
    pattern: /\b(approv(?:al|ed)\s+(?:for|to|of)|clearance|licen[cs]e|permit|regulatory approval|environmental (?:clearance|approval)|nclt|court (?:order|approval)|sebi (?:approval|clearance)|cci approval)\b/i,
  },
  {
    category: "expansion",
    label: "Expansion / capacity",
    why: "Capacity additions drive future revenue, so check the capex, funding and commissioning date.",
    pattern: /\b(expand(?:s|ing|ed|ion)?|capacity (?:addition|expansion)|new (?:plant|unit|facility|factory)|greenfield|brownfield|commission(?:s|ed|ing)?|scale[- ]?up)\b/i,
  },
  {
    category: "order_win",
    label: "Order / contract win",
    why: "Order intake is forward revenue. Confirm the value, the timeline and whether it is a repeat customer.",
    pattern: /\b(win(?:s|ning)?|bag(?:s|ged)?|order(?:s)? worth|secured? (?:an? )?order|contract|awarded|tender|order book|loi|letter of intent)\b/i,
  },
  {
    category: "partnership",
    label: "Partnership / JV",
    why: "Partnerships can open new markets or technology. Check exclusivity, ownership split and duration.",
    pattern: /\b(partner(?:s|ship|ed|ing)?|joint venture|jv|memorandum of understanding|mou|collaborat(?:e|ion|ing)|tie[- ]?up|alliance|consortium)\b/i,
  },
  {
    category: "ownership",
    label: "Ownership / promoter action",
    why: "Promoter or institutional movement is a governance signal. Check the direction and the disclosed reason.",
    pattern: /\b(promoter|stake (?:increase|decrease|sale|buy)|block deal|bulk deal|insider|pledge|open offer|delisting|demerger|merger|acquisition of|acquires?)\b/i,
  },
  {
    category: "capital",
    label: "Capital action",
    why: "Raising or deploying capital changes the balance sheet. Check dilution, use of proceeds and pricing.",
    pattern: /\b(capex|capital expenditure|fundrais(?:e|ing)|qip|qualified institutional|rights issue|preferential (?:allotment|issue)|investment of|divest(?:ment|s)?|buyback|bonus issue)\b/i,
  },
  {
    category: "guidance",
    label: "Guidance / outlook",
    why: "Management guidance frames expectations. Compare it with the last stated number before acting on it.",
    pattern: /\b(guidance|order pipeline|revenue visibility|expects? to (?:grow|report|achieve|invest|deliver|double)|projects? (?:a|an) (?:growth|increase|jump)|company outlook|management outlook)\b/i,
  },
];

/* ------------------------------------------------------------------ *
 * Temporal extraction (Rule 6)
 * ------------------------------------------------------------------ */

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const MONTH_ALT = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

function iso(year: number, month: number, day: number): string | null {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const fullYear = year < 100 ? (year < 70 ? 2000 + year : 1900 + year) : year;
  return `${fullYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Pull the announcement date stated in the text, if any. */
function findEventDate(text: string): { iso: string | null; label: string | null } {
  // 5 October 2026 / 5th Oct 2026
  let m = text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_ALT})\\.?,?\\s+(\\d{4})\\b`, "i"));
  if (m) {
    const value = iso(Number(m[3]), MONTHS[m[2].toLowerCase().slice(0, 4)] ?? MONTHS[m[2].toLowerCase().slice(0, 3)] ?? 0, Number(m[1]));
    if (value) return { iso: value, label: m[0].trim() };
  }
  // October 5, 2026 / Oct 5 2026
  m = text.match(new RegExp(`\\b(${MONTH_ALT})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, "i"));
  if (m) {
    const key = m[1].toLowerCase();
    const value = iso(Number(m[3]), MONTHS[key] ?? MONTHS[key.slice(0, 3)] ?? 0, Number(m[2]));
    if (value) return { iso: value, label: m[0].trim() };
  }
  // 2026-10-05
  m = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) {
    const value = iso(Number(m[1]), Number(m[2]), Number(m[3]));
    if (value) return { iso: value, label: m[0] };
  }
  return { iso: null, label: null };
}

/** Pull the forward-looking execution timeline stated in the text, if any. */
function findExecutionTimeline(text: string): string | null {
  const patterns: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
    [/\bQ([1-4])\s*(?:of\s*)?(?:FY\s*)?(\d{2,4})\b/i, (m) => `Q${m[1]} ${m[2].length === 2 ? `20${m[2]}` : m[2]}`],
    [/\bH([12])\s*(?:of\s*)?(?:FY\s*)?(\d{2,4})\b/i, (m) => `H${m[1]} ${m[2].length === 2 ? `20${m[2]}` : m[2]}`],
    [/\bF\.?Y\.?\s*(\d{4})\b/i, (m) => `FY${m[1]}`],
    [/\bF\.?Y\.?\s*(\d{2})\b/i, (m) => `FY20${m[1]}`],
    [/\b(first|second|third|fourth)\s+quarter(?:\s+of)?\s+(\d{4})\b/i, (m) => `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} quarter ${m[2]}`],
    [/\b(next|coming)\s+(quarter|fiscal year|financial year|year)\b/i, (m) => `Next ${m[2].toLowerCase()}`],
    [/\b(immediate(?:ly)?|with immediate effect)\b/i, () => "Immediate"],
    [/\bby\s+((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)\s+(\d{4})\b/i, (m) => `By ${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2]}`],
    [/\bby\s+(end of\s+)?(?:Q([1-4])\s*)?(\d{4})\b/i, (m) => `By ${m[1] ?? ""}${m[2] ? `Q${m[2]} ` : ""}${m[3]}`.replace(/\s+/g, " ").trim()],
  ];
  for (const [pattern, format] of patterns) {
    const match = text.match(pattern);
    if (match) return format(match);
  }
  return null;
}

/** Phrases that mark a historical event as a live update rather than stale news. */
const HISTORICAL_UPDATE = /\b(update to|updates? the|amended|amendment|revised|extends?|extension of|additional order|follow[- ]?on|supplement(?:al)?|addendum|under the earlier|previously announced|phase[- ]?(?:ii|2)|tranche)\b/i;

function toIsoDay(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

/**
 * Build the Rule 6 anchor for one article.
 */
export function buildTemporalAnchor(
  text: string,
  documentDate: string,
): TemporalAnchor {
  const document = toIsoDay(documentDate);
  const event = findEventDate(text);
  const execution = findExecutionTimeline(text);

  if (event.iso) {
    return {
      eventDate: event.iso,
      eventDateLabel: event.label,
      eventDateBasis: "stated_in_source",
      documentDate: document,
      executionTimeline: execution,
      executionBasis: execution ? "stated_in_source" : "unstated",
    };
  }

  return {
    // Nothing in the text names a date, so the publication date anchors it -
    // and the basis says so rather than implying the source stated it.
    eventDate: document,
    eventDateLabel: null,
    eventDateBasis: document ? "document_date" : "unstated",
    documentDate: document,
    executionTimeline: execution,
    executionBasis: execution ? "stated_in_source" : "unstated",
  };
}

export type DeepResearchInput = {
  id: string;
  symbol: string;
  headline: string;
  summary: string;
  source: string;
  url: string;
  published_at: string;
  impact_score: number;
};

/**
 * Classify a batch of articles into research signals, anchored in time.
 *
 * An article produces at most one signal: its strongest (earliest matching)
 * catalyst. Candidates whose event date falls outside the window are dropped
 * unless the text marks them as a current update to an earlier agreement.
 */
export function scanDeepResearchDetailed(articles: DeepResearchInput[], options: ScanOptions = {}): ScanResult {
  const limit = options.limit ?? 12;
  const windowDays = options.windowDays ?? 30;
  const now = options.now ?? new Date();
  const windowStartMs = now.getTime() - windowDays * 86_400_000;
  const windowStart = toIsoDay(new Date(windowStartMs));

  const kept: DeepResearchSignal[] = [];
  let excludedOutOfWindow = 0;

  for (const article of articles) {
    const headline = article.headline ?? "";
    const summary = article.summary ?? "";
    const haystack = `${headline} ${summary}`;

    for (const rule of RULES) {
      const match = haystack.match(rule.pattern);
      if (!match) continue;

      const temporal = buildTemporalAnchor(haystack, article.published_at);
      const isHistoricalUpdate = HISTORICAL_UPDATE.test(haystack);

      // Rule 6: an event outside the window is not extracted, unless it is
      // explicitly a current update to a historical agreement.
      if (temporal.eventDate) {
        const eventMs = new Date(`${temporal.eventDate}T00:00:00.000Z`).getTime();
        if (Number.isFinite(eventMs) && eventMs < windowStartMs && !isHistoricalUpdate) {
          excludedOutOfWindow += 1;
          break;
        }
      }

      kept.push({
        id: `${article.id}:${rule.category}`,
        category: rule.category,
        label: rule.label,
        symbol: article.symbol || "MARKET",
        headline,
        source: article.source,
        url: article.url,
        matchedPhrase: match[0],
        why: rule.why,
        impactScore: typeof article.impact_score === "number" ? article.impact_score : 0,
        headlineMatch: rule.pattern.test(headline),
        temporal,
        isHistoricalUpdate,
      });
      break;
    }
  }

  const signals = kept
    .sort((left, right) => {
      // Headline-level matches first, then by impact, then newest.
      if (left.headlineMatch !== right.headlineMatch) return left.headlineMatch ? -1 : 1;
      if (right.impactScore !== left.impactScore) return right.impactScore - left.impactScore;
      return (right.temporal.eventDate ?? "").localeCompare(left.temporal.eventDate ?? "");
    })
    .slice(0, limit);

  return { signals, excludedOutOfWindow, windowDays, windowStart };
}

/** Convenience wrapper returning only the signals. */
export function scanDeepResearch(articles: DeepResearchInput[], options: ScanOptions = {}): DeepResearchSignal[] {
  return scanDeepResearchDetailed(articles, options).signals;
}

/** Count signals per category, for a compact summary row. */
export function summariseSignals(signals: DeepResearchSignal[]): Array<{ category: CatalystCategory; label: string; count: number }> {
  const counts = new Map<CatalystCategory, { label: string; count: number }>();
  for (const signal of signals) {
    const entry = counts.get(signal.category) ?? { label: signal.label, count: 0 };
    entry.count += 1;
    counts.set(signal.category, entry);
  }
  return [...counts.entries()].map(([category, value]) => ({ category, label: value.label, count: value.count }));
}
