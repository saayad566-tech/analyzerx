/**
 * Deep-research catalyst scan.
 *
 * The user's ask: surface the things that matter for real research — a new
 * plant, a capacity expansion, an order win, a discovery, a stake sale — rather
 * than only the loudest headlines.
 *
 * This is deliberately deterministic and evidence-first. Every signal carries
 * the exact phrase that triggered it and the article it came from, so the user
 * can verify the classification instead of trusting it. Nothing is inferred
 * beyond a keyword match, and no claim is generated that the source did not
 * make.
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

export type DeepResearchSignal = {
  id: string;
  category: CatalystCategory;
  label: string;
  symbol: string;
  headline: string;
  source: string;
  url: string;
  publishedAt: string;
  /** The exact phrase found in the article. Shown so the match is auditable. */
  matchedPhrase: string;
  /** Why this category matters for research. */
  why: string;
  impactScore: number;
  /** True when the headline itself (not only the summary) carries the phrase. */
  headlineMatch: boolean;
};

type Rule = {
  category: CatalystCategory;
  label: string;
  why: string;
  pattern: RegExp;
};

/**
 * Ordered most-specific first so a headline is classified by its strongest
 * catalyst rather than by the first loose match.
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
    // Requires a regulatory noun: a bare "approves" usually describes a board
    // decision about capital, not a regulator's clearance.
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
    // A bare "outlook" almost always belongs to a market-wide commentary piece
    // rather than a company catalyst, so it is deliberately not matched here.
    pattern: /\b(guidance|order pipeline|revenue visibility|expects? to (?:grow|report|achieve|invest|deliver|double)|projects? (?:a|an) (?:growth|increase|jump)|company outlook|management outlook)\b/i,
  },
];

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
 * Classify a batch of articles into research signals. An article produces at
 * most one signal: its strongest (earliest matching) catalyst.
 */
export function scanDeepResearch(articles: DeepResearchInput[], limit = 12): DeepResearchSignal[] {
  const signals: DeepResearchSignal[] = [];

  for (const article of articles) {
    const headline = article.headline ?? "";
    const summary = article.summary ?? "";
    const haystack = `${headline} ${summary}`;

    for (const rule of RULES) {
      const match = haystack.match(rule.pattern);
      if (!match) continue;
      signals.push({
        id: `${article.id}:${rule.category}`,
        category: rule.category,
        label: rule.label,
        symbol: article.symbol || "MARKET",
        headline,
        source: article.source,
        url: article.url,
        publishedAt: article.published_at,
        matchedPhrase: match[0],
        why: rule.why,
        impactScore: typeof article.impact_score === "number" ? article.impact_score : 0,
        headlineMatch: rule.pattern.test(headline),
      });
      break;
    }
  }

  return signals
    .sort((left, right) => {
      // Headline-level matches first, then by impact, then newest.
      if (left.headlineMatch !== right.headlineMatch) return left.headlineMatch ? -1 : 1;
      if (right.impactScore !== left.impactScore) return right.impactScore - left.impactScore;
      return (right.publishedAt ?? "").localeCompare(left.publishedAt ?? "");
    })
    .slice(0, limit);
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
