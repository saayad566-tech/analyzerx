import { describe, expect, it } from "vitest";

import {
  dedupeArticles,
  filterByPublicationWindow,
  formatPublicationLabel,
  normalizeArticleUrl,
  normalizeHeadline,
  parsePublicationDate,
  stableArticleId,
  withinPublicationWindow,
} from "../lib/news-normalization";

const NOW = Date.parse("2026-10-12T12:00:00Z");

describe("parsePublicationDate (FIX 03)", () => {
  it("parses ISO 8601 with and without an offset", () => {
    expect(parsePublicationDate("2026-10-12T09:30:00Z", { now: NOW }).iso).toBe("2026-10-12T09:30:00.000Z");
    expect(parsePublicationDate("2026-10-12T09:30:00.123Z", { now: NOW }).status).toBe("valid");
    expect(parsePublicationDate("2026-10-12T09:30:00+05:30", { now: NOW }).iso).toBe("2026-10-12T04:00:00.000Z");
    expect(parsePublicationDate("2026-10-12T09:30:00-04:00", { now: NOW }).iso).toBe("2026-10-12T13:30:00.000Z");
    expect(parsePublicationDate("2026-10-12", { now: NOW }).status).toBe("valid");
  });

  it("parses RFC 2822 (RSS) dates", () => {
    const parsed = parsePublicationDate("Mon, 12 Oct 2026 09:30:00 GMT", { now: NOW });
    expect(parsed.status).toBe("valid");
    expect(parsed.iso).toBe("2026-10-12T09:30:00.000Z");
  });

  it("parses the GDELT seendate shape, and rejects a malformed one instead of throwing", () => {
    expect(parsePublicationDate("20261012T093000Z", { now: NOW }).iso).toBe("2026-10-12T09:30:00.000Z");
    // The previous implementation sliced this blindly and then called
    // toISOString(), which threw RangeError.
    for (const bad of ["20261012", "20261012093000", "20261012T0930", "2026-10-12T09:30:00Zextra"]) {
      expect(() => parsePublicationDate(bad, { now: NOW })).not.toThrow();
    }
    expect(parsePublicationDate("20261012", { now: NOW }).iso).toBe("2026-10-12T00:00:00.000Z");
    expect(parsePublicationDate("20261012093000", { now: NOW }).iso).toBe("2026-10-12T09:30:00.000Z");
  });

  it("treats a missing date as unknown, never as the current time", () => {
    for (const missing of [null, undefined, "", "   "]) {
      const parsed = parsePublicationDate(missing, { now: NOW });
      expect(parsed.iso).toBeNull();
      expect(parsed.status).toBe("unknown");
    }
  });

  it("rejects malformed and locale-ambiguous dates rather than guessing", () => {
    for (const bad of ["not a date", "12/10/2026", "10/12/2026", "2026/10/12", "yesterday", "1600000000abc"]) {
      const parsed = parsePublicationDate(bad, { now: NOW });
      expect(parsed.iso).toBeNull();
      expect(parsed.status).toBe("invalid");
    }
  });

  it("distinguishes Unix seconds from milliseconds by magnitude, and respects a declared unit", () => {
    const seconds = Math.floor(NOW / 1000);
    expect(parsePublicationDate(seconds, { now: NOW }).iso).toBe("2026-10-12T12:00:00.000Z");
    expect(parsePublicationDate(NOW, { now: NOW }).iso).toBe("2026-10-12T12:00:00.000Z");
    // Declared unit wins: a seconds value declared as millis is out of range.
    expect(parsePublicationDate(seconds, { now: NOW, field: "epoch-millis" }).status).toBe("invalid");
    expect(parsePublicationDate(NOW, { now: NOW, field: "epoch-seconds" }).status).toBe("invalid");
    // An implausible number is refused rather than interpreted.
    expect(parsePublicationDate(42, { now: NOW }).status).toBe("invalid");
  });

  it("flags future dates and pre-1990 values", () => {
    expect(parsePublicationDate("2030-01-01T00:00:00Z", { now: NOW }).status).toBe("future");
    expect(parsePublicationDate("1980-01-01T00:00:00Z", { now: NOW }).status).toBe("invalid");
    // A date a few hours ahead is tolerated (clock skew), not rejected.
    expect(parsePublicationDate("2026-10-12T18:00:00Z", { now: NOW }).status).toBe("valid");
  });

  it("preserves the original source value", () => {
    expect(parsePublicationDate("Mon, 12 Oct 2026 09:30:00 GMT", { now: NOW }).original).toBe("Mon, 12 Oct 2026 09:30:00 GMT");
  });
});

describe("URL and headline normalization (FIX 03)", () => {
  it("canonicalises URLs by removing tracking, fragments and trailing slash", () => {
    expect(normalizeArticleUrl("https://www.Example.com/story/?utm_source=x&utm_medium=y#frag")).toBe("https://example.com/story");
    expect(normalizeArticleUrl("https://example.com/a/b/")).toBe("https://example.com/a/b");
    expect(normalizeArticleUrl("https://example.com/story?id=2&utm_campaign=z&id2=1")).toBe("https://example.com/story?id=2&id2=1");
    expect(normalizeArticleUrl("")).toBe("");
  });

  it("produces a stable article id", () => {
    const a = stableArticleId({ url: "https://ex.com/x?utm_source=a", headline: "H", source: "S" });
    const b = stableArticleId({ url: "https://ex.com/x", headline: "Different", source: "T" });
    expect(a).toBe(b);
    expect(stableArticleId({ id: "abc" })).toBe("provider:abc");
  });

  it("normalizes headline text for comparison", () => {
    expect(normalizeHeadline("<b>Reliance</b> Q2 profit rises!")).toBe("reliance q2 profit rises");
  });
});

describe("dedupeArticles (FIX 03)", () => {
  it("merges identical canonical URLs", () => {
    const result = dedupeArticles([
      { url: "https://ex.com/a?utm_source=x", headline: "One" },
      { url: "https://ex.com/a", headline: "One" },
    ]);
    expect(result.unique).toHaveLength(1);
    expect(result.duplicates).toHaveLength(1);
  });

  it("merges near-identical headlines from the same publisher only", () => {
    const sameHost = dedupeArticles([
      { url: "https://ex.com/1", headline: "Reliance Q2 profit rises 12 percent" },
      { url: "https://ex.com/2", headline: "Reliance Q2 profit rises 12 percent" },
    ]);
    expect(sameHost.unique).toHaveLength(1);

    const differentHosts = dedupeArticles([
      { url: "https://a.com/1", headline: "Reliance Q2 profit rises 12 percent" },
      { url: "https://b.com/1", headline: "Reliance Q2 profit rises 12 percent" },
    ]);
    expect(differentHosts.unique).toHaveLength(2);
  });

  it("never merges different articles that merely mention the same company", () => {
    const result = dedupeArticles([
      { url: "https://ex.com/1", headline: "Reliance signs new retail partnership in India" },
      { url: "https://ex.com/2", headline: "Reliance commissions solar plant in Gujarat" },
    ]);
    expect(result.unique).toHaveLength(2);
    expect(result.duplicates).toHaveLength(0);
  });
});

describe("publication window (FIX 03)", () => {
  it("includes only valid timestamps inside the window", () => {
    expect(withinPublicationWindow("2026-10-12T06:00:00Z", 24, NOW)).toBe(true);
    expect(withinPublicationWindow("2026-10-10T06:00:00Z", 24, NOW)).toBe(false);
    expect(withinPublicationWindow(null, 24, NOW)).toBe(false);
    expect(withinPublicationWindow("garbage", 24, NOW)).toBe(false);
    // A future timestamp is never inside a past window.
    expect(withinPublicationWindow("2026-10-13T06:00:00Z", 24, NOW)).toBe(false);
  });

  it("separates undated from out-of-window records", () => {
    const result = filterByPublicationWindow(
      [
        { publishedAt: "2026-10-12T06:00:00Z" },
        { publishedAt: null },
        { publishedAt: "2026-09-01T06:00:00Z" },
      ],
      24,
      NOW,
    );
    expect(result.included).toHaveLength(1);
    expect(result.excludedUndated).toHaveLength(1);
    expect(result.excludedOutOfWindow).toHaveLength(1);
  });
});

describe("formatPublicationLabel (FIX 03)", () => {
  it("never renders the literal text 'Invalid Date'", () => {
    for (const value of [null, "", "garbage", "not-a-date"]) {
      const label = formatPublicationLabel(value, { now: NOW });
      expect(label).not.toMatch(/invalid date/i);
      expect(label).toBe("Publication date unavailable");
    }
  });

  it("formats recent, hourly and older dates", () => {
    expect(formatPublicationLabel("2026-10-12T11:55:00Z", { now: NOW })).toBe("5 min ago");
    expect(formatPublicationLabel("2026-10-12T06:00:00Z", { now: NOW })).toBe("6 h ago");
    expect(formatPublicationLabel("2026-10-01T06:00:00Z", { now: NOW })).toBe("2026-10-01");
  });
});
