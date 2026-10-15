/**
 * News article normalization (FIX 03).
 *
 * Observed problems: cards rendered "Invalid Date"; publication time was
 * conflated with retrieval time; near-duplicate headlines were ranked as
 * separate stories; and the GDELT adapter built a date by fixed string slices
 * and then called `.toISOString()` on it — which *throws* `RangeError: Invalid
 * time value` whenever the slice produced an unparseable date.
 *
 * Rules implemented here:
 *  - Publication time is parsed only from documented formats. It is never
 *    replaced with the current time.
 *  - A numeric value is only read as epoch seconds/milliseconds when the
 *    magnitude is consistent with that unit; otherwise it is treated as unknown.
 *  - An unparseable or missing date becomes `null` + status "unknown", and the
 *    UI shows "Publication date unavailable" — never the literal "Invalid Date".
 *  - Deduplication merges only genuine copies (same canonical URL, same provider
 *    id, same content hash, or near-identical headline from the same host). It
 *    never merges two different articles just because they mention the same
 *    company.
 */

/** A parsed publication instant. `iso` is null whenever the date is not trusted. */
export type ParsedDate = {
  iso: string | null;
  status: "valid" | "unknown" | "invalid" | "future";
  /** The value exactly as the provider supplied it. */
  original: string;
  reason?: string;
};

const MS_PER_DAY = 86_400_000;
/** Anything further ahead than this is treated as a clock/data error, not news. */
const FUTURE_TOLERANCE_MS = MS_PER_DAY;
const EARLIEST_MS = Date.parse("1990-01-01T00:00:00Z");

/** Strip HTML and collapse whitespace so two renderings of one headline compare equal. */
export function normalizeHeadline(headline: string): string {
  return headline
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/[^a-z0-9 ]+/gi, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Canonicalise a URL for identity comparison: drop tracking params, fragments, www and trailing slash. */
export function normalizeArticleUrl(rawUrl: string): string {
  const trimmed = (rawUrl ?? "").trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    url.hash = "";
    url.hostname = url.hostname.replace(/^www\./i, "").toLowerCase();
    const tracking = /^(utm_|gclid|fbclid|mc_|ref|referrer|source|cmpid|ito|smid|partner)/i;
    for (const key of [...url.searchParams.keys()]) {
      if (tracking.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    let pathname = url.pathname.replace(/\/+$/, "");
    if (!pathname) pathname = "/";
    return `${url.protocol}//${url.hostname}${pathname}${url.search}`;
  } catch {
    return trimmed.toLowerCase();
  }
}

/**
 * Parse a provider publication value. `field` describes the provider's
 * documented format so a numeric value is only read as the unit that provider
 * actually uses.
 */
export function parsePublicationDate(
  raw: string | number | null | undefined,
  options: { now?: number; field?: "iso" | "rss" | "epoch-seconds" | "epoch-millis" | "compact" } = {},
): ParsedDate {
  const now = options.now ?? Date.now();
  const original = raw === null || raw === undefined ? "" : String(raw);

  if (original.trim() === "") return { iso: null, status: "unknown", original, reason: "The provider did not supply a publication date." };

  const finalize = (ms: number, reason?: string): ParsedDate => {
    if (!Number.isFinite(ms)) return { iso: null, status: "invalid", original, reason: reason ?? "The value could not be interpreted as a date." };
    if (ms < EARLIEST_MS) return { iso: null, status: "invalid", original, reason: "The date is earlier than any valid publication." };
    if (ms > now + FUTURE_TOLERANCE_MS) return { iso: null, status: "future", original, reason: "The date is in the future, which indicates a clock or provider error." };
    return { iso: new Date(ms).toISOString(), status: "valid", original, reason };
  };

  // Numeric input: only trust it when the magnitude matches the declared unit.
  if (typeof raw === "number" || /^\d+$/.test(original.trim())) {
    const digits = original.trim();
    const asNumber = Number(digits);
    const field = options.field;

    // 14-digit compact form YYYYMMDDHHMMSS.
    if (digits.length === 14) {
      const iso = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}T${digits.slice(8, 10)}:${digits.slice(10, 12)}:${digits.slice(12, 14)}Z`;
      return finalize(Date.parse(iso), "Parsed as the 14-digit compact form YYYYMMDDHHMMSS.");
    }
    // 8-digit compact date YYYYMMDD.
    if (digits.length === 8) {
      const iso = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}T00:00:00Z`;
      return finalize(Date.parse(iso), "Parsed as the 8-digit compact date YYYYMMDD (midnight UTC).");
    }

    const secondsPlausible = asNumber >= 1e9 && asNumber < 1e11;
    const millisPlausible = asNumber >= 1e11 && asNumber < 1e13;
    if (field === "epoch-seconds") {
      return secondsPlausible ? finalize(asNumber * 1000, "Read as Unix seconds (provider schema).") : { iso: null, status: "invalid", original, reason: "The value is outside the plausible range for Unix seconds." };
    }
    if (field === "epoch-millis") {
      return millisPlausible ? finalize(asNumber, "Read as Unix milliseconds (provider schema).") : { iso: null, status: "invalid", original, reason: "The value is outside the plausible range for Unix milliseconds." };
    }
    // Undeclared numeric field: accept only an unambiguous magnitude.
    if (secondsPlausible) return finalize(asNumber * 1000, "Read as Unix seconds by magnitude.");
    if (millisPlausible) return finalize(asNumber, "Read as Unix milliseconds by magnitude.");
    return { iso: null, status: "invalid", original, reason: "A numeric date was supplied without a documented unit; it was not interpreted." };
  }

  const text = original.trim();

  // GDELT seendate: YYYYMMDDTHHMMSSZ. Validate the shape before slicing, because
  // slicing a malformed value used to produce an invalid Date and then throw.
  const gdelt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(text);
  if (gdelt) return finalize(Date.parse(`${gdelt[1]}-${gdelt[2]}-${gdelt[3]}T${gdelt[4]}:${gdelt[5]}:${gdelt[6]}Z`), "Parsed as the GDELT seendate form YYYYMMDDTHHMMSSZ.");

  // ISO 8601, with or without an offset.
  if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(text)) {
    const normalized = text.replace(" ", "T");
    const withZone = /(Z|[+-]\d{2}:?\d{2})$/.test(normalized) ? normalized : `${normalized}Z`;
    return finalize(Date.parse(withZone), "Parsed as ISO 8601.");
  }

  // RFC 2822, the format used by most RSS feeds.
  if (/^[A-Za-z]{3},?\s+\d{1,2}\s+[A-Za-z]{3}\s+\d{4}/.test(text)) {
    return finalize(Date.parse(text), "Parsed as RFC 2822 (RSS).");
  }

  return { iso: null, status: "invalid", original, reason: "The value does not match a documented date format." };
}

/** A stable article id: canonical URL when present, otherwise provider id + headline. */
export function stableArticleId(article: { url?: string; id?: string; headline?: string; source?: string }): string {
  const canonical = normalizeArticleUrl(article.url ?? "");
  if (canonical) return canonical;
  const provider = (article.id ?? "").trim();
  if (provider) return `provider:${provider}`;
  return `headline:${normalizeHeadline(article.headline ?? "")}|${(article.source ?? "").toLowerCase()}`;
}

const STOPWORDS = new Set(["the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "at", "by", "from", "as", "is", "are", "be", "its", "it", "this", "that", "will", "has", "have", "after", "over", "into", "up", "down"]);

function significantTokens(headline: string): Set<string> {
  return new Set(normalizeHeadline(headline).split(" ").filter((token) => token.length > 2 && !STOPWORDS.has(token)));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

export type DedupeArticle = { id?: string; url?: string; headline?: string; source?: string; publishedAt?: string | null };

export type DedupeResult<T extends DedupeArticle> = {
  unique: T[];
  duplicates: Array<{ kept: T; dropped: T; reason: string }>;
};

/**
 * Conservative deduplication. Two records are merged only when they are the same
 * document: identical canonical URL, identical provider id, or a near-identical
 * headline published by the same host. Sharing a company or an event is not
 * enough to merge two different articles.
 */
export function dedupeArticles<T extends DedupeArticle>(articles: readonly T[], options: { headlineSimilarity?: number } = {}): DedupeResult<T> {
  const threshold = options.headlineSimilarity ?? 0.85;
  const unique: T[] = [];
  const duplicates: DedupeResult<T>["duplicates"] = [];
  const byUrl = new Map<string, T>();
  const byId = new Map<string, T>();

  for (const article of articles) {
    const canonical = normalizeArticleUrl(article.url ?? "");
    const providerId = (article.id ?? "").trim();

    if (canonical && byUrl.has(canonical)) {
      duplicates.push({ kept: byUrl.get(canonical)!, dropped: article, reason: "Identical canonical URL." });
      continue;
    }
    if (providerId && byId.has(providerId)) {
      duplicates.push({ kept: byId.get(providerId)!, dropped: article, reason: "Identical provider id." });
      continue;
    }

    const tokens = significantTokens(article.headline ?? "");
    const host = (() => {
      try {
        return new URL(article.url ?? "").hostname.replace(/^www\./i, "").toLowerCase();
      } catch {
        return "";
      }
    })();
    const nearTwin = unique.find((existing) => {
      const existingHost = (() => {
        try {
          return new URL(existing.url ?? "").hostname.replace(/^www\./i, "").toLowerCase();
        } catch {
          return "";
        }
      })();
      if (!host || host !== existingHost) return false;
      return jaccard(tokens, significantTokens(existing.headline ?? "")) >= threshold;
    });
    if (nearTwin) {
      duplicates.push({ kept: nearTwin, dropped: article, reason: `Near-identical headline from the same publisher (similarity ≥ ${threshold}).` });
      continue;
    }

    unique.push(article);
    if (canonical) byUrl.set(canonical, article);
    if (providerId) byId.set(providerId, article);
  }

  return { unique, duplicates };
}

/** True when a valid timestamp falls inside the requested window ending at `now`. */
export function withinPublicationWindow(iso: string | null, windowHours: number, now: number = Date.now()): boolean {
  if (!iso) return false;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return false;
  return ms <= now && ms >= now - windowHours * 3_600_000;
}

/**
 * Filter a list to a publication window. Records with an untrusted date are
 * excluded from the window (and reported), never silently included.
 */
export function filterByPublicationWindow<T extends { publishedAt?: string | null }>(articles: readonly T[], windowHours: number, now: number = Date.now()): { included: T[]; excludedUndated: T[]; excludedOutOfWindow: T[] } {
  const included: T[] = [];
  const excludedUndated: T[] = [];
  const excludedOutOfWindow: T[] = [];
  for (const article of articles) {
    const iso = article.publishedAt ?? null;
    if (!iso) excludedUndated.push(article);
    else if (withinPublicationWindow(iso, windowHours, now)) included.push(article);
    else excludedOutOfWindow.push(article);
  }
  return { included, excludedUndated, excludedOutOfWindow };
}

/**
 * The only date formatter the UI should use. Returns "Publication date
 * unavailable" for an untrusted date so the literal text "Invalid Date" can
 * never reach a card.
 */
export function formatPublicationLabel(iso: string | null, options: { now?: number } = {}): string {
  if (!iso) return "Publication date unavailable";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "Publication date unavailable";
  const now = options.now ?? Date.now();
  const diffMinutes = Math.round((now - ms) / 60_000);
  if (diffMinutes >= 0 && diffMinutes < 60) return `${Math.max(1, diffMinutes)} min ago`;
  if (diffMinutes >= 60 && diffMinutes < 60 * 24) return `${Math.round(diffMinutes / 60)} h ago`;
  return new Date(ms).toISOString().slice(0, 10);
}
