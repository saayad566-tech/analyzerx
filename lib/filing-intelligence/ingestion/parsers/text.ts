/**
 * HTML and plain-text extraction (Prompt 2, section 3).
 *
 * A deliberately conservative extractor: it never executes anything, it drops
 * script and style content rather than reading it, and it preserves heading
 * structure so a later claim can cite a section rather than a whole page.
 *
 * There is no HTML parser dependency in this project, so the extractor is a
 * tokenizer over the tag stream. It is not a full HTML parser and does not
 * claim to be; where the markup is malformed it degrades to text rather than
 * failing, and records that it did so.
 */

import type { ExtractedSection, ExtractionResult, ExtractionWarning } from "../types";

export const HTML_PARSER = "analyzerx-html-tokenizer";
export const HTML_PARSER_VERSION = "1.0.0";

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#160": " ",
  ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", "#8217": "’", "#8216": "‘",
};

/** Decode the entities that actually appear in filings. */
export function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_match, code: string) => {
      const point = Number(code);
      return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : _match;
    })
    .replace(/&([a-zA-Z#0-9]+);/g, (match, name: string) => ENTITIES[name] ?? ENTITIES[name.toLowerCase()] ?? match);
}

/** Remove script, style and comment content so it can never be read as text. */
export function stripNonContent(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<head[\s\S]*?<\/head>/gi, " ");
}

const BLOCK_TAGS = /^(p|div|section|article|li|tr|h[1-6]|table|br|hr)$/i;

/**
 * Extract sections from HTML, splitting on headings where they exist and
 * otherwise on block boundaries.
 */
export function extractHtml(html: string, extractedUtc: string): ExtractionResult {
  const warnings: ExtractionWarning[] = [];
  const cleaned = stripNonContent(html);
  if (cleaned.trim() !== html.trim()) warnings.push("parser_failure"); // script/style were present and dropped

  const sections: ExtractedSection[] = [];
  let pendingHeading: string | null = null;
  let buffer: string[] = [];
  let inHeading = false;

  const flush = () => {
    const text = decodeEntities(buffer.join(" ")).replace(/\s+/g, " ").trim();
    buffer = [];
    if (!text) return;
    sections.push({
      locator: pendingHeading ? `section:${pendingHeading}` : `section:${sections.length + 1}`,
      heading: pendingHeading,
      text,
    });
    pendingHeading = null;
  };

  // Walk the tag stream, tracking headings and block boundaries.
  const tokenPattern = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>|([^<]+)/g;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(cleaned)) !== null) {
    const [, closing, tagName, text] = match;
    if (text) {
      buffer.push(text);
      continue;
    }
    const tag = (tagName ?? "").toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      if (closing && inHeading) {
        // The buffer now holds the heading text: it becomes the label of the
        // section that follows, rather than a section of its own.
        pendingHeading = decodeEntities(buffer.join(" ")).replace(/\s+/g, " ").trim() || pendingHeading;
        buffer = [];
        inHeading = false;
      } else if (!closing) {
        flush();
        inHeading = true;
      }
      continue;
    }
    if (BLOCK_TAGS.test(tag) && closing) flush();
  }
  flush();

  const usable = sections.filter((section) => section.text.trim().length > 0);
  const totalChars = usable.reduce((sum, section) => sum + section.text.length, 0);

  let quality: ExtractionResult["quality"] = "clean";
  let note: string | null = null;
  if (totalChars === 0) {
    quality = "unextractable";
    note = "No readable text was found in the document.";
  } else if (usable.length < 2 && totalChars < 200) {
    quality = "partial";
    note = "Very little readable text was found; the document may be image-based or heavily scripted.";
  }
  if (warnings.includes("parser_failure")) {
    warnings.push("encoding_problem");
    note = note ?? "Script, style or comment content was present and was discarded rather than read.";
  }

  return {
    format: "html",
    quality,
    sections: usable,
    warnings: [...new Set(warnings)],
    parser: HTML_PARSER,
    parserVersion: HTML_PARSER_VERSION,
    extractedUtc,
    note,
  };
}

/** Plain text is passed through, with encoding problems detected rather than hidden. */
export function extractText(input: string, extractedUtc: string): ExtractionResult {
  const warnings: ExtractionWarning[] = [];
  // A replacement character means the bytes were not valid UTF-8.
  if (input.includes("\uFFFD")) warnings.push("encoding_problem");

  const text = input.replace(/\r\n?/g, "\n").trim();
  const blocks = text.split(/\n{2,}/).map((block) => block.replace(/\s+/g, " ").trim()).filter(Boolean);
  const sections: ExtractedSection[] = blocks.map((block, index) => ({
    locator: `section:${index + 1}`,
    heading: null,
    text: block,
  }));

  const quality: ExtractionResult["quality"] = text.length === 0 ? "unextractable" : warnings.length ? "partial" : "clean";
  return {
    format: "text",
    quality,
    sections,
    warnings,
    parser: "analyzerx-plain-text",
    parserVersion: "1.0.0",
    extractedUtc,
    note: text.length === 0 ? "The document contained no text." : warnings.length ? "The document contained bytes that were not valid UTF-8." : null,
  };
}
