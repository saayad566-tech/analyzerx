/**
 * OCR boundary (Prompt 2, section 4).
 *
 * What was investigated: for Android the practical offline option is ML Kit
 * Text Recognition v2, which runs on-device, is free, and does not send the
 * document anywhere. It is a native dependency (a Gradle artifact plus a
 * React Native bridge), and it is NOT bundled in this build.
 *
 * So this module does not pretend to OCR anything. It provides the interface a
 * real engine would implement, decides when OCR would be needed, and marks the
 * content unextractable with the exact dependency when no engine is present.
 *
 * One rule from the prompt is enforced structurally: no numeric confidence is
 * ever produced. The result type carries a quality label and a note, never a
 * score, because inventing a score would be exactly the fabrication the prompt
 * forbids.
 */

import type { ExtractionResult, ExtractionWarning } from "./types";

/** Whether OCR is required, and why. */
export type OcrNeed = {
  needed: boolean;
  reason: string;
};

/**
 * Decide whether OCR would help. A document needs OCR when it has pages but no
 * readable text, which is the signature of a scan or an image-only PDF.
 */
export function assessOcrNeed(result: ExtractionResult, pageCount: number | null): OcrNeed {
  const readable = result.sections.reduce((sum, section) => sum + section.text.trim().length, 0);
  if (readable > 0) {
    return { needed: false, reason: "The document already yielded readable text, so OCR is not required." };
  }
  if (result.quality === "unextractable" && (pageCount ?? 0) > 0) {
    return { needed: true, reason: `The document has ${pageCount} page(s) but no readable text, which indicates a scan or an image-only document.` };
  }
  if (result.quality === "unextractable") {
    return { needed: false, reason: "No text was found and no page structure was detected, so there is nothing for OCR to read." };
  }
  return { needed: false, reason: "Text was extracted, so OCR is not required." };
}

/**
 * The interface a real on-device OCR engine would implement. A result carries a
 * quality label and a note, never an invented confidence number.
 */
export type OcrPageResult = {
  /** Page or image locator, preserved from the source. */
  locator: string;
  text: string;
  /** How well the engine read the page, in the engine's own terms. */
  quality: "clean" | "partial" | "garbled" | "unextractable";
  note: string | null;
};

export type OcrEngine = {
  name: string;
  version: string;
  /** Whether the engine is actually available in this build. */
  available: boolean;
  /** The dependency that would have to be added, when it is not. */
  dependency: string | null;
  recognise(pages: { locator: string; bytes: Uint8Array }[]): Promise<OcrPageResult[]>;
};

/**
 * The engine this build ships. It is honest about being absent: it reports
 * unavailable, names the dependency, and returns nothing rather than a guess.
 */
export const unavailableOcrEngine: OcrEngine = {
  name: "none",
  version: "0",
  available: false,
  dependency: "ML Kit Text Recognition v2 (com.google.mlkit:text-recognition) plus a React Native bridge. On-device and free, but a native dependency that is not bundled in this build.",
  async recognise(pages) {
    return pages.map((page) => ({
      locator: page.locator,
      text: "",
      quality: "unextractable" as const,
      note: "No OCR engine is bundled, so this page could not be read. The document may be a scan.",
    }));
  },
};

export type OcrOutcome = {
  attempted: boolean;
  available: boolean;
  engine: string;
  results: OcrPageResult[];
  warnings: ExtractionWarning[];
  note: string;
};

/**
 * Run OCR when it is needed and an engine is available.
 *
 * When no engine is present the outcome says so plainly and the caller marks
 * the content unextractable, rather than the pipeline silently returning an
 * empty document with no explanation.
 */
export async function runOcr(
  pages: { locator: string; bytes: Uint8Array }[],
  engine: OcrEngine = unavailableOcrEngine,
): Promise<OcrOutcome> {
  if (!engine.available) {
    return {
      attempted: false,
      available: false,
      engine: engine.name,
      results: [],
      warnings: ["ocr_unavailable"],
      note: `OCR was not attempted because no engine is available. Dependency: ${engine.dependency ?? "an on-device OCR engine"}`,
    };
  }
  const results = await engine.recognise(pages);
  const garbled = results.filter((result) => result.quality === "garbled" || result.quality === "unextractable").length;
  return {
    attempted: true,
    available: true,
    engine: engine.name,
    results,
    warnings: garbled ? ["ocr_used", "incomplete_table"] : ["ocr_used"],
    note: garbled
      ? `OCR ran with ${engine.name}; ${garbled} of ${results.length} page(s) were not read cleanly.`
      : `OCR ran with ${engine.name} and read every page.`,
  };
}

/**
 * Fold OCR output into an extraction result, preserving the page locators so a
 * claim can still cite where it came from.
 */
export function mergeOcrIntoExtraction(result: ExtractionResult, outcome: OcrOutcome, extractedUtc: string): ExtractionResult {
  if (!outcome.attempted || outcome.results.length === 0) {
    return {
      ...result,
      warnings: [...new Set([...result.warnings, ...outcome.warnings])],
      note: result.note ?? outcome.note,
    };
  }
  const sections = outcome.results
    .filter((entry) => entry.text.trim().length > 0)
    .map((entry) => ({ locator: entry.locator, heading: null, text: entry.text.trim() }));
  return {
    ...result,
    quality: outcome.warnings.includes("incomplete_table") ? "garbled" : "partial",
    sections: [...result.sections, ...sections],
    warnings: [...new Set([...result.warnings, ...outcome.warnings])],
    extractedUtc,
    note: outcome.note,
  };
}
