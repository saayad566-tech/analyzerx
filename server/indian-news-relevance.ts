export type IndianNewsRelevance = {
  score: number;
  include: boolean;
  matchedThemes: string[];
  matchedSymbols: string[];
  reasons: string[];
  confidence: "high" | "medium" | "low";
  classification: "DIRECT_COMPANY" | "MARKET_MACRO" | "SECTOR" | "UNRELATED" | "AMBIGUOUS";
};

export type NewsPublicationDecision = IndianNewsRelevance & {
  marketId: string;
  published: boolean;
  holdReason: "none" | "ambiguous_entity" | "wrong_market" | "missing_issuer_evidence" | "insufficient_relevance";
};

const INDIA_MARKET_TERMS = [
  "india", "indian", "nse", "bse", "nifty", "sensex", "rbi", "sebi", "gift nifty", "rupee", "inr",
];

const GLOBAL_MACRO_THEMES: Record<string, string[]> = {
  "US rates": ["federal reserve", "fed rate", "fed hikes", "fed cuts", "interest rate", "treasury yield", "us yields"],
  "Oil and energy": ["brent", "crude oil", "wti", "opec", "oil prices", "natural gas"],
  "China and Asia": ["china", "beijing", "pbo c", "asia markets", "asian markets", "yuan"],
  "Inflation and growth": ["inflation", "cpi", "ppi", "recession", "global growth", "economic growth", "gdp"],
  "Trade and geopolitics": ["tariff", "trade war", "sanctions", "geopolitical", "shipping disruption", "red sea"],
  "Global risk": ["risk-off", "risk on", "market volatility", "vix", "credit stress", "banking crisis"],
};

const SECTOR_THEMES: Record<string, string[]> = {
  IT: ["software", "technology", "cloud", "cybersecurity", "outsourcing", "ai spending"],
  Banks: ["bank", "banks", "lending", "credit", "deposit", "net interest margin"],
  Energy: ["renewable", "solar", "wind power", "refinery", "petrochemical", "electricity"],
  Metals: ["steel", "copper", "aluminium", "iron ore", "metals"],
  Pharma: ["pharma", "drug approval", "clinical trial", "fda", "generic drugs"],
  Auto: ["automotive", "ev", "electric vehicle", "vehicle sales", "battery", "mobility"],
};

type EntityAliases = { strong: string[]; weak: string[] };

/**
 * Weak aliases are intentionally not sufficient for a direct company match.
 * Words such as reliance, tata, and adani occur in ordinary language and must
 * be corroborated by an issuer phrase, exchange identifier, or security context.
 */
const SYMBOL_ALIASES: Record<string, EntityAliases> = {
  RELIANCE: { strong: ["reliance industries", "reliance industries limited", "reliance industries ltd", "ril"], weak: ["reliance"] },
  TCS: { strong: ["tata consultancy services", "tata consultancy", "tcs"], weak: [] },
  INFY: { strong: ["infosys", "infosys limited", "infy"], weak: [] },
  HDFCBANK: { strong: ["hdfc bank", "hdfc bank limited", "hdfcbank"], weak: [] },
  ICICIBANK: { strong: ["icici bank", "icici bank limited", "icicibank"], weak: [] },
  ADANIENT: { strong: ["adani enterprises", "adani enterprises limited", "adanient"], weak: ["adani"] },
  TATAMOTORS: { strong: ["tata motors", "tata motors limited", "tatamotors"], weak: ["tata"] },
};

const SECURITY_CONTEXT_TERMS = [
  "stock", "shares", "share price", "listed", "nse", "bse", "exchange", "investors", "investor", "equity",
  "earnings", "results", "revenue", "profit", "loss", "dividend", "buyback", "promoter", "market cap", "valuation",
  "quarter", "guidance", "contract", "order", "acquisition", "subsidiary", "board", "ipo", "filing", "brokerage",
];

function containsTerm(text: string, term: string) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i").test(text);
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function matchEntity(text: string, symbol: string) {
  const aliases = SYMBOL_ALIASES[symbol] ?? { strong: [symbol.toLowerCase()], weak: [] };
  const bareSymbolIsWeak = aliases.weak.includes(symbol.toLowerCase());
  const exactIdentifier = (!bareSymbolIsWeak && containsTerm(text, symbol.toLowerCase())) || containsTerm(text, `${symbol.toLowerCase()}.ns`) || containsTerm(text, `nse:${symbol.toLowerCase()}`);
  const strongAliases = aliases.strong.filter((alias) => containsTerm(text, alias));
  const weakAliases = aliases.weak.filter((alias) => containsTerm(text, alias));
  const securityContext = SECURITY_CONTEXT_TERMS.filter((term) => containsTerm(text, term));
  const strong = exactIdentifier || strongAliases.length > 0;
  const corroboratedWeak = weakAliases.length > 0 && securityContext.length > 0;
  return { strong, corroboratedWeak, weakAliases, strongAliases, exactIdentifier, securityContext };
}

export function classifyIndianNewsRelevance(input: { headline: string; summary?: string | null; symbols?: string[] }): IndianNewsRelevance {
  const text = `${input.headline} ${input.summary ?? ""}`.toLowerCase();
  const symbols = unique((input.symbols ?? []).map((symbol) => symbol.toUpperCase()));
  const entityMatches = symbols.map((symbol) => ({ symbol, match: matchEntity(text, symbol) }));
  const matchedSymbols = entityMatches.filter(({ match }) => match.strong || match.corroboratedWeak).map(({ symbol }) => symbol);
  const ambiguousSymbols = entityMatches.filter(({ match }) => !match.strong && match.weakAliases.length > 0 && !match.corroboratedWeak).map(({ symbol }) => symbol);
  const matchedThemes = Object.entries(GLOBAL_MACRO_THEMES).filter(([, terms]) => terms.some((term) => containsTerm(text, term))).map(([theme]) => theme);
  const matchedSectors = Object.entries(SECTOR_THEMES).filter(([, terms]) => terms.some((term) => containsTerm(text, term))).map(([sector]) => sector);
  const hasIndiaAnchor = INDIA_MARKET_TERMS.some((term) => containsTerm(text, term));
  const reasons: string[] = [];
  let score = 0;
  const hasStrongDirectMatch = entityMatches.some(({ match }) => match.strong);
  const hasCorroboratedWeakMatch = entityMatches.some(({ match }) => match.corroboratedWeak);
  if (hasStrongDirectMatch) {
    score += 65;
    reasons.push(`Verified company or ticker match: ${matchedSymbols.join(", ")}`);
  } else if (hasCorroboratedWeakMatch) {
    score += 42;
    reasons.push(`Common-name match corroborated by security context: ${matchedSymbols.join(", ")}`);
  } else if (ambiguousSymbols.length) {
    reasons.push(`Ambiguous common-name mention rejected: ${ambiguousSymbols.join(", ")}`);
  }
  if (hasIndiaAnchor) {
    score += 20;
    reasons.push("Indian-market anchor detected");
  }
  if (matchedThemes.length) {
    score += Math.min(20, matchedThemes.length * 10);
    reasons.push(`Global theme: ${matchedThemes.join(", ")}`);
  }
  if (matchedSectors.length) {
    score += Math.min(10, matchedSectors.length * 3);
    reasons.push(`Sector relevance: ${matchedSectors.join(", ")}`);
  }
  const direct = hasStrongDirectMatch || hasCorroboratedWeakMatch;
  const marketMacro = hasIndiaAnchor && matchedThemes.length > 0 && !direct;
  const classification = direct ? "DIRECT_COMPANY" : marketMacro ? "MARKET_MACRO" : ambiguousSymbols.length ? "AMBIGUOUS" : matchedSectors.length && hasIndiaAnchor ? "SECTOR" : "UNRELATED";
  const include = (direct || marketMacro) && score >= (direct ? 42 : 30);
  const confidence = hasStrongDirectMatch ? "high" : hasCorroboratedWeakMatch || marketMacro ? "medium" : "low";
  return { score: Math.min(100, score), include, matchedThemes: unique([...matchedThemes, ...matchedSectors]), matchedSymbols, reasons, confidence, classification };
}

export const globalIndiaNewsQuery = '((NSE OR BSE OR Nifty OR Sensex OR "Indian stocks" OR "India markets") AND (Fed OR crude OR oil OR inflation OR tariffs OR China OR "global markets" OR recession OR "interest rates"))';

export function classifyNewsPublication(input: { marketId: string; headline: string; summary?: string | null; symbol?: string; source?: string | null }): NewsPublicationDecision {
  const symbol = input.symbol?.trim().toUpperCase();
  if (input.marketId === "IN") {
    const relevance = classifyIndianNewsRelevance({ headline: input.headline, summary: input.summary, symbols: symbol ? [symbol] : [] });
    const ambiguous = relevance.classification === "AMBIGUOUS";
    const published = relevance.include && !ambiguous;
    return { ...relevance, marketId: input.marketId, published, holdReason: published ? "none" : ambiguous ? "ambiguous_entity" : relevance.matchedSymbols.length ? "insufficient_relevance" : "missing_issuer_evidence" };
  }

  const text = `${input.headline} ${input.summary ?? ""}`.toLowerCase();
  const normalizedSymbol = symbol?.toLowerCase();
  const tickerMatch = normalizedSymbol ? containsTerm(text, normalizedSymbol) || containsTerm(text, `${normalizedSymbol}.${input.marketId.toLowerCase()}`) : false;
  const sourceMatch = input.source ? /exchange|regulator|issuer|investor relations|filing/i.test(input.source) : false;
  const published = Boolean(tickerMatch && (sourceMatch || /stock|shares|earnings|results|revenue|profit|guidance|filing|listed|market cap|valuation/i.test(text)));
  const reasons = published ? [`Selected ${input.marketId} market evidence matched ${symbol ?? "the requested security"}.`] : [`Held before publication: no sufficient issuer-specific evidence for ${symbol ?? "the selected security"} in ${input.marketId}.`];
  return { score: published ? 70 : 0, include: published, matchedThemes: [], matchedSymbols: published && symbol ? [symbol] : [], reasons, confidence: published ? "medium" : "low", classification: published ? "DIRECT_COMPANY" : "AMBIGUOUS", marketId: input.marketId, published, holdReason: published ? "none" : tickerMatch ? "insufficient_relevance" : "missing_issuer_evidence" };
}
